import { characters, getOneCharacter } from '../../../../../script.js';
import { CHARS_PER_TOKEN } from './constants.js';

const cardCache = new Map();

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCard(avatar) {
    return characters.find((card) => card?.avatar === avatar) ?? null;
}

async function fetchCard(avatar) {
    try {
        await getOneCharacter(avatar);
    } catch (error) {
        console.warn('[Storyline] Failed to load character card:', avatar, error);
    }
    return findCard(avatar);
}

export async function resolveCard(avatar) {
    if (typeof avatar !== 'string' || !avatar) return null;
    if (cardCache.has(avatar)) return cardCache.get(avatar);
    let card = findCard(avatar);
    const isShallow = card && card.description === undefined && card.data?.description === undefined;
    if (!card || isShallow) {
        card = await fetchCard(avatar);
    }
    /* Never cache a still-shallow card (getOneCharacter swallows non-OK
       responses): it would be injected with an empty description until some
       unrelated event cleared the cache. A true miss (card not in the list)
       IS cached — CHARACTER_DELETED/EDITED invalidate. */
    const stillShallow = !!card && (card.shallow === true
        || (card.description === undefined && card.data?.description === undefined));
    if (!stillShallow) cardCache.set(avatar, card);
    return card;
}

export function invalidateCardCache(avatar) {
    if (avatar) {
        cardCache.delete(avatar);
    } else {
        cardCache.clear();
    }
}

export function getCardText(card) {
    if (!card) {
        return { name: '', description: '', personality: '', scenario: '' };
    }
    return {
        name: String(card.name ?? ''),
        description: String(card.description ?? card.data?.description ?? ''),
        personality: String(card.personality ?? card.data?.personality ?? ''),
        scenario: String(card.scenario ?? card.data?.scenario ?? ''),
    };
}

/* Embedded v2/v3 lorebook entries of a card — used by full-card injection
   (cast link `full`). ST keeps `data.character_book` on the in-memory card
   (it is only stripped via the explicit unlink UI hack in world-info.js),
   so both the top-level legacy field and the v2 `data` path are checked.
   Only entries with non-empty content are returned. `enabled` semantics:
   undefined counts as ENABLED here (legacy v1 books omit the flag) — this
   deliberately differs from ST's WI conversion, which treats undefined as
   disabled; documented in AGENTS §5.1. */
export function getCardBookEntries(card) {
    const book = card?.character_book ?? card?.data?.character_book;
    const entries = Array.isArray(book?.entries) ? book.entries : [];
    return entries
        .filter((entry) => entry && entry.enabled !== false && String(entry.content ?? '').trim())
        .map((entry) => ({
            name: String(entry.name ?? entry.comment ?? `Entry ${entry.id ?? ''}`).trim(),
            content: String(entry.content ?? '').trim(),
        }));
}

export function estimateTokens(text) {
    return Math.ceil(String(text ?? '').length / CHARS_PER_TOKEN);
}

export function truncateToTokenBudget(text, tokenBudget) {
    const input = String(text ?? '').trim();
    if (!input) return '';
    const maxChars = Math.max(0, Math.floor(tokenBudget)) * CHARS_PER_TOKEN;
    if (input.length <= maxChars) return input;
    const slice = input.slice(0, maxChars);
    const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf(' '));
    return (cut > 0 ? slice.slice(0, cut) : slice).trim();
}

function matchesName(haystack, link) {
    if (!haystack) return false;
    const names = [link.name, ...(Array.isArray(link.aliases) ? link.aliases : [])].filter(Boolean);
    return names.some((name) => namePattern(name).test(haystack));
}

const namePatternCache = new Map();

function namePattern(name) {
    let pattern = namePatternCache.get(name);
    if (!pattern) {
        pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}([^\\p{L}\\p{N}]|$)`, 'iu');
        if (namePatternCache.size > 2000) namePatternCache.clear();
        namePatternCache.set(name, pattern);
    }
    return pattern;
}

export async function selectRelevantCharacters(storyline, recentTexts) {
    const links = Array.isArray(storyline?.characters) ? storyline.characters : [];
    const haystack = recentTexts.filter(Boolean).join('\n');
    const relevant = [];
    const missing = [];
    const matched = links.filter((link) => link.alwaysInclude || matchesName(haystack, link));
    /* Resolve in parallel (P3) — a cold cache used to fetch one card at a
       time; the result still follows the cast order. */
    const cards = await Promise.all(matched.map((link) => resolveCard(link.avatar)));
    matched.forEach((link, index) => {
        if (cards[index]) relevant.push({ link, card: cards[index] });
        else missing.push(link.name);
    });
    return { relevant, missing };
}
