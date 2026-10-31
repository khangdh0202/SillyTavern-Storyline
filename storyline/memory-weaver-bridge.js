/* Memory Weaver bridge (passive, read-only).
 *
 * Memory Weaver records the chat's long-term memories in a chat-local
 * variable through its own optimizer pass. In Storyline chats its normal
 * prompt injection is wiped by the full-prompt override, so the
 * `memory_keeper` context-only function re-projects the stored entries as a
 * `Story Memories` context block instead.
 *
 * Recall paths (v0.1.20):
 * - Memory Weaver apiVersion ≥ 3 exposes `recallAsync({ profile: 'narrative',
 *   … })` — MW runs the vector query (bounded wait), merges the hybrid tiers
 *   (scene mentions + vector hits + core + recency anchor) and packs the
 *   budget; the bridge only renders the returned lines. Selection logic lives
 *   entirely inside Memory Weaver so both extensions never drift apart.
 * - Older MW builds fall back to the local tiered implementation (v0.1.19):
 *   candidates from `list()`, packed scene → core → recent.
 *
 * Rules: never import the Memory Weaver extension, only read
 * `globalThis.MemoryWeaverAPI`; never mutate its state (read-only API use);
 * available/active checks mirror the world-state bridge. */

import { name1 } from '../../../../../script.js';
import { getActiveFunctionsForChat } from './functions.js';
import { CHARS_PER_TOKEN } from './constants.js';
import { listNpcs } from './data.js';

const MEMORY_KEEPER_FUNCTION_ID = 'memory_keeper';
/* Matches Memory Weaver's own store cap (settings.maxEntries, UI max 500):
   every surviving entry stays a candidate, so scene relevance — not store
   position — decides what gets recalled, no matter how large the chat grows. */
const MAX_MEMORIES = 500;
const TOKEN_BUDGET = 1000;
const LINE_CHAR_MAX = 200;
const RECENT_WINDOW = 30;   // messages scanned for scene mentions (context.js passes the blob)
const RECENT_TIER = 12;     // newest entries — packed LAST: the raw recent story is already in history, so the block's unique value is the older canon
const RECALL_DEADLINE_MS = 400;

export { RECENT_WINDOW };

function getApi() {
    const api = globalThis.MemoryWeaverAPI;
    if (!api || typeof api !== 'object') return null;
    if (typeof api.list !== 'function' || typeof api.isEnabled !== 'function') return null;
    if (Number(api.apiVersion ?? 0) < 1) return null;
    return api;
}

function hasRecallApi(api) {
    return Boolean(api) && typeof api.recallAsync === 'function';
}

export function isMemoryWeaverAvailable() {
    const api = getApi();
    if (!api) return false;
    try {
        return api.isEnabled() === true;
    } catch (error) {
        console.warn('[Storyline] Memory Weaver bridge: isEnabled() failed:', error);
        return false;
    }
}

export function isMemoryKeeperFunctionActive(storyline, chatState) {
    return getActiveFunctionsForChat(storyline, chatState).some((fn) => fn.def.id === MEMORY_KEEPER_FUNCTION_ID);
}

function collectEntityNames(relevantLinks = []) {
    const names = new Set(['user', '{{user}}']);
    if (name1) names.add(String(name1).trim().toLowerCase());
    for (const link of relevantLinks) {
        if (link?.name) names.add(String(link.name).trim().toLowerCase());
        for (const alias of Array.isArray(link?.aliases) ? link.aliases : []) {
            if (alias) names.add(String(alias).trim().toLowerCase());
        }
    }
    /* Full archive on purpose — a display cap here would silently drop the
       oldest NPCs from Memory Weaver entity matching. */
    for (const npc of listNpcs(null)) {
        if (npc?.name) names.add(String(npc.name).trim().toLowerCase());
    }
    return names;
}

function isRelevantMemory(entry, names) {
    if (Number(entry?.importance ?? 0) >= 3) return true;
    const entities = Array.isArray(entry?.entities) ? entry.entities : [];
    return entities.some((entity) => names.has(String(entity).trim().toLowerCase()));
}

/* Word-boundary mention test against the recent chat window. Side NPCs are
   usually NOT linked cast cards and often not recorded Story NPCs — scanning
   the recent narrative for their names is the only way an appointment with
   them can rank as scene-relevant. (Legacy path only: with the recall API,
   MW runs this test itself.) */
function makeMentionTest(recentText) {
    const blob = String(recentText ?? '');
    if (!blob) return () => false;
    const cache = new Map();
    return (entity) => {
        const name = String(entity ?? '').trim();
        if (name.length < 2 || name.toLowerCase() === 'user') return false;
        const key = name.toLowerCase();
        if (cache.has(key)) return cache.get(key);
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let hit = false;
        try {
            hit = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'iu').test(blob);
        } catch {
            hit = blob.toLowerCase().includes(key);
        }
        cache.set(key, hit);
        return hit;
    };
}

function tierSort(a, b) {
    return (Number(b?.importance ?? 0) - Number(a?.importance ?? 0)) || String(b?.createdAt ?? '').localeCompare(String(a?.createdAt ?? ''));
}

/* Recall API path — MW selects and packs; the bridge renders. */
async function recallViaApi(api, recentText, names) {
    const envelope = await api.recallAsync({
        profile: 'narrative',
        budgetTokens: TOKEN_BUDGET,
        recentCount: RECENT_TIER,
        recentTexts: recentText,
        entityNames: [...names],
        lineMaxChars: LINE_CHAR_MAX,
        deadlineMs: RECALL_DEADLINE_MS,
    });
    const lines = Array.isArray(envelope?.lines) ? envelope.lines.map(String) : [];
    const used = Number(envelope?.estimatedTokens) || 0;
    const tiers = envelope?.tiers ?? {};
    const info = {
        count: Array.isArray(envelope?.entries) ? envelope.entries.length : 0,
        included: lines.length,
        tokens: used,
        recent: Array.isArray(tiers.recent) ? tiers.recent.length : 0,
        scene: Array.isArray(tiers.scene) ? tiers.scene.length : 0,
        core: Array.isArray(tiers.core) ? tiers.core.length : 0,
        mode: String(envelope?.mode ?? ''),
        fallbackReason: String(envelope?.fallbackReason ?? ''),
    };
    return { lines, used, info };
}

/* Legacy local path — older Memory Weaver builds (apiVersion 2) without the
   recall API: importance-desc candidates + local tiered packing. */
function recallLocally(api, recentText, names) {
    let entries = [];
    try {
        const listed = api.list({ limit: MAX_MEMORIES });
        entries = Array.isArray(listed) ? listed : [];
    } catch (error) {
        console.warn('[Storyline] Memory Weaver bridge: list() failed:', error);
        return { entries: [], lines: [], used: 0, info: { count: 0, reason: 'Memory Weaver API call failed' } };
    }

    const byCreated = [...entries].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    const recentSet = new Set(byCreated.slice(0, RECENT_TIER));
    const isMentioned = makeMentionTest(recentText);
    const tiers = { recent: [], scene: [], core: [] };
    for (const entry of entries) {
        if (recentSet.has(entry)) {
            tiers.recent.push(entry);
            continue;
        }
        const entities = Array.isArray(entry.entities) ? entry.entities : [];
        if (entities.some(isMentioned)) {
            tiers.scene.push(entry);
            continue;
        }
        if (Number(entry.importance ?? 0) >= 3) tiers.core.push(entry);
    }
    tiers.recent.sort(tierSort);
    tiers.scene.sort(tierSort);
    tiers.core.sort(tierSort);

    const lines = [];
    let used = 0;
    for (const tier of [tiers.scene, tiers.core, tiers.recent]) {
        for (const entry of tier) {
            if (!isRelevantMemory(entry, names)) continue;
            const text = String(entry?.text ?? '').trim();
            if (!text) continue;
            const body = text.length > LINE_CHAR_MAX ? `${text.slice(0, LINE_CHAR_MAX - 1).trimEnd()}…` : text;
            const attributes = (Array.isArray(entry.entities) ? entry.entities : []).join(', ');
            const line = `- ${attributes ? `(${attributes}) ` : ''}${body}${Number(entry.importance) >= 3 ? ' [core]' : ''}`;
            const tokens = Math.ceil(line.length / CHARS_PER_TOKEN);
            if (used + tokens > TOKEN_BUDGET) continue;
            lines.push(line);
            used += tokens;
        }
    }
    const info = {
        count: entries.length,
        recent: tiers.recent.length,
        scene: tiers.scene.length,
        core: tiers.core.length,
        mode: 'local-legacy',
    };
    return { entries, lines, used, info };
}

export async function buildMemoryContext(storyline, chatState, relevantLinks = [], recentText = '') {
    const info = {
        available: isMemoryWeaverAvailable(),
        active: false,
        count: 0,
        included: 0,
        tokens: 0,
        recent: 0,
        scene: 0,
        core: 0,
        mode: '',
    };

    if (!info.available) {
        info.reason = 'Memory Weaver extension not found or disabled';
        return { sections: [], info };
    }

    if (!isMemoryKeeperFunctionActive(storyline, chatState)) {
        return { sections: [], info };
    }

    info.active = true;
    const api = getApi();
    const names = collectEntityNames(relevantLinks);

    let lines = [];
    let used = 0;
    if (hasRecallApi(api)) {
        try {
            const recalled = await recallViaApi(api, recentText, names);
            lines = recalled.lines;
            used = recalled.used;
            Object.assign(info, recalled.info);
        } catch (error) {
            console.warn('[Storyline] Memory Weaver bridge: recallAsync failed:', error);
            info.reason = 'Memory Weaver recall call failed';
            return { sections: [], info };
        }
    } else {
        const local = recallLocally(api, recentText, names);
        lines = local.lines;
        used = local.used;
        info.count = local.info.count ?? 0;
        info.recent = local.info.recent ?? 0;
        info.scene = local.info.scene ?? 0;
        info.core = local.info.core ?? 0;
        info.mode = local.info.mode ?? '';
        if (local.info.reason) info.reason = local.info.reason;
    }

    info.included = lines.length;
    info.tokens = used;
    if (!lines.length) {
        info.reason = info.count ? 'no memories matched the current cast/scene' : 'no memories recorded yet';
        return { sections: [], info };
    }

    const text = [
        '[Story Memories \u2014 established facts and events from earlier in this story]',
        ...lines,
        'These are canon: keep names, promises, possessions, injuries, relationships and consequences consistent with them. Never contradict them or re-explain them as new.',
    ].join('\n');

    return { sections: [{ id: 'memories', title: 'Story Memories', text }], info };
}
