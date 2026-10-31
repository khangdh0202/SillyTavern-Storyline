import { getContext } from '../../../../../scripts/st-context.js';
import { substituteParams } from '../../../../../script.js';
import { world_info_case_sensitive, world_info_match_whole_words, parseRegexFromString } from '../../../../../scripts/world-info.js';
import { LOREBOOK_TOKENS_MAX, LOREBOOK_TOKENS_DEFAULT } from './constants.js';
import { estimateTokens, truncateToTokenBudget } from './characters.js';

/* Linked Lorebooks (v0.1.23): Storyline chats never run SillyTavern's own
   World Info activation (the override discards its output), so this module
   reads WI files the user links to a storyline and runs a FAITHFUL SUBSET of
   the activation semantics: constant entries, primary key matching,
   secondary keys with all four selectiveLogic modes, regex keys and
   probability, per-entry case sensitivity / whole-word matching (v0.2.0 —
   same defaults as ST). NOT supported (documented in AGENTS §15):
   position/depth injection, recursion, vectorized, per-entry scan depth,
   sticky/cooldown, inclusion groups. */

const bookCache = new Map();

/* Clear one book (WORLDINFO_UPDATED carries the saved book's name) or all. */
export function invalidateLorebookCache(name = null) {
    if (name) bookCache.delete(name);
    else bookCache.clear();
}

function normalizeKeys(value) {
    if (Array.isArray(value)) {
        return value.map((key) => String(key ?? '').trim()).filter(Boolean);
    }
    return String(value ?? '').split(',').map((key) => key.trim()).filter(Boolean);
}

const optionalBool = (value) => (typeof value === 'boolean' ? value : null);

function normalizeRawEntries(rawEntries) {
    const list = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries ?? {});
    return list
        .filter((entry) => entry && !entry.disable && String(entry.content ?? '').trim())
        .map((entry) => ({
            /* comment is ST's author memo — kept for UI/debug, NEVER injected
               (ST never sends it to the model). */
            comment: String(entry.comment ?? '').trim(),
            content: String(entry.content ?? '').trim(),
            constant: !!entry.constant,
            keys: normalizeKeys(entry.key),
            /* ST only evaluates secondary keys when `selective` is on
               (undefined = legacy/imported → on, like ST's conversion). */
            secondaryKeys: entry.selective === false ? [] : normalizeKeys(entry.keysecondary),
            selectiveLogic: Number.isFinite(Number(entry.selectiveLogic)) ? Number(entry.selectiveLogic) : 0,
            caseSensitive: optionalBool(entry.caseSensitive),
            matchWholeWords: optionalBool(entry.matchWholeWords),
            order: Number.isFinite(Number(entry.order))
                ? Number(entry.order)
                : (Number.isFinite(Number(entry.insertion_order)) ? Number(entry.insertion_order) : 100),
            /* useProbability false ⇒ never roll (ST verifyProbability). */
            useProbability: entry.useProbability !== false,
            probability: Math.min(100, Math.max(0, Number.isFinite(Number(entry.probability)) ? Number(entry.probability) : 100)),
        }))
        .sort((a, b) => a.order - b.order);
}

/* Load + normalize a WI file's entries. Cached by name — misses too, so a
   linked book that was deleted is not re-POSTed every generation.
   Invalidated on CHAT_CHANGED / WORLDINFO_UPDATED (index.js) or F5.
   Throws when the book cannot be read. */
export async function loadBookEntries(name) {
    if (bookCache.has(name)) {
        const cached = bookCache.get(name);
        if (cached instanceof Error) throw cached;
        return cached;
    }
    const context = getContext();
    if (typeof context?.loadWorldInfo !== 'function') {
        throw new Error('SillyTavern context does not expose loadWorldInfo.');
    }
    const data = await context.loadWorldInfo(name);
    if (!data || !data.entries) {
        const missing = new Error(`World "${name}" not found.`);
        bookCache.set(name, missing);
        throw missing;
    }
    const entries = normalizeRawEntries(data.entries);
    bookCache.set(name, entries);
    return entries;
}

/* Compiled matchers keyed by key text + effective flags (P2 — the old code
   built a fresh RegExp per key × entry × generation). */
const matcherCache = new Map();
const MATCHER_CACHE_LIMIT = 5000;

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ST semantics (world-info.js WorldInfoBuffer.matchKeys):
   - `/pattern/flags` keys are real regexes and override every other option;
   - otherwise case sensitivity = entry.caseSensitive ?? global setting;
   - whole words = entry.matchWholeWords ?? global setting (ST default OFF =
     substring); multi-word keys in whole-word mode use plain inclusion;
     single words use non-word (`\W`) boundaries like ST. */
function getMatcher(key, caseSensitive, wholeWords) {
    const cacheKey = `${caseSensitive ? 1 : 0}${wholeWords ? 1 : 0}|${key}`;
    let matcher = matcherCache.get(cacheKey);
    if (matcher) return matcher;
    const regex = parseRegexFromString(key);
    if (regex) {
        matcher = (scan) => { regex.lastIndex = 0; return regex.test(scan.raw); };
    } else {
        const needle = caseSensitive ? key : key.toLowerCase();
        if (wholeWords && needle.split(/\s+/).length === 1) {
            const boundary = new RegExp(`(?:^|\\W)(${escapeRegex(needle)})(?:$|\\W)`);
            matcher = (scan) => boundary.test(caseSensitive ? scan.raw : scan.lower);
        } else {
            matcher = (scan) => (caseSensitive ? scan.raw : scan.lower).includes(needle);
        }
    }
    if (matcherCache.size > MATCHER_CACHE_LIMIT) matcherCache.clear();
    matcherCache.set(cacheKey, matcher);
    return matcher;
}

function matchKeyword(scan, keyword, entry) {
    let key = String(keyword ?? '');
    /* ST substitutes macros in keys ({{user}}/{{char}} keys) before matching. */
    if (key.includes('{{')) key = substituteParams(key);
    key = key.trim();
    if (!key) return false;
    const caseSensitive = entry.caseSensitive ?? !!world_info_case_sensitive;
    const wholeWords = entry.matchWholeWords ?? !!world_info_match_whole_words;
    return getMatcher(key, caseSensitive, wholeWords)(scan);
}

/* ST world_info_logic constants. */
const LOGIC_AND_ANY = 0;
const LOGIC_NOT_ALL = 1;
const LOGIC_NOT_ANY = 2;
const LOGIC_AND_ALL = 3;

/* Short-circuiting secondary evaluation — mirrors ST's matchSecondaryKeys. */
function matchSecondary(entry, scan) {
    const logic = entry.selectiveLogic;
    let any = false;
    let all = true;
    for (const key of entry.secondaryKeys) {
        const hit = matchKeyword(scan, key, entry);
        if (hit) any = true;
        else all = false;
        if (logic === LOGIC_AND_ANY && hit) return true;
        if (logic === LOGIC_NOT_ALL && !hit) return true;
    }
    if (logic === LOGIC_NOT_ANY) return !any;
    if (logic === LOGIC_AND_ALL) return all;
    return false;
}

function passesProbability(entry) {
    if (entry.useProbability === false || entry.probability >= 100) return true;
    return Math.random() * 100 < entry.probability;
}

export function activateBookEntries(entries, scanText) {
    const raw = String(scanText ?? '');
    const scan = { raw, lower: raw.toLowerCase() };
    return entries.filter((entry) => {
        let active;
        if (entry.constant) {
            active = true;
        } else if (!entry.keys.some((key) => matchKeyword(scan, key, entry))) {
            active = false;
        } else {
            active = entry.secondaryKeys.length ? matchSecondary(entry, scan) : true;
        }
        return active && passesProbability(entry);
    });
}

/* Build the lorebook sections for ONE storyline from its links.
   Returns { sections: [{ title, text }], info: { books: [...], entries,
   tokens, missing: [...] } } — context.js turns sections into the
   `lorebooks` prompt block. */
export async function buildLorebookContext(storyline, recentTexts) {
    const links = Array.isArray(storyline?.lorebooks)
        ? storyline.lorebooks.filter((link) => link?.enabled && link.name)
        : [];
    const info = { books: [], entries: 0, tokens: 0, missing: [] };
    if (!links.length) return { sections: [], info };

    const scanText = recentTexts.join('\n');
    const seen = new Set();
    const sections = [];
    for (const link of links) {
        if (seen.has(link.name)) continue;
        seen.add(link.name);
        let entries;
        try {
            entries = await loadBookEntries(link.name);
        } catch (error) {
            console.warn(`[Storyline] Linked lorebook "${link.name}" could not be loaded:`, error);
            info.books.push({ name: link.name, mode: link.mode, missing: true, entries: 0, injected: 0, skipped: 0, tokens: 0 });
            info.missing.push(link.name);
            continue;
        }
        const active = link.mode === 'full' ? entries : activateBookEntries(entries, scanText);
        const cap = Math.max(100, Math.min(LOREBOOK_TOKENS_MAX, Number(link.maxTokens) || LOREBOOK_TOKENS_DEFAULT));
        /* Budget priority follows ST: the HIGHEST `order` is kept first
           (v0.2.0 — C9; the old ascending walk dropped exactly the entries
           the author ranked most important). Output stays ascending. */
        const byPriority = [...active].sort((a, b) => b.order - a.order);
        const chosen = new Set();
        let used = 0;
        for (const entry of byPriority) {
            const cost = estimateTokens(entry.content);
            if (used + cost > cap) continue;
            chosen.add(entry);
            used += cost;
        }
        let truncatedEntry = null;
        if (!chosen.size && byPriority.length) {
            /* Nothing fits whole: keep the top entry, truncated to the cap. */
            truncatedEntry = byPriority[0];
            chosen.add(truncatedEntry);
        }
        const chunks = [];
        used = 0;
        for (const entry of active) {
            if (!chosen.has(entry)) continue;
            const text = entry === truncatedEntry ? truncateToTokenBudget(entry.content, cap) : entry.content;
            chunks.push(text);
            used += estimateTokens(text);
        }
        const injected = chosen.size;
        const skipped = active.length - injected;
        const sectionText = chunks.join('\n\n');
        info.books.push({ name: link.name, mode: link.mode, entries: entries.length, injected, skipped, tokens: used });
        info.entries += injected;
        info.tokens += used;
        if (sectionText) sections.push({ title: `Lorebook: ${link.name}`, text: sectionText });
    }
    return { sections, info };
}
