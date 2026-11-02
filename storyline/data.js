/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { getLocalVariable, setLocalVariable } from '../../../../../scripts/variables.js';

export const STORYLINE_DATA_VARIABLE = 'storylineState';
const DATA_VERSION = 1;
const MAX_LISTED_NPCS = 100;
/* NPC names come from model tool output: never let one rewrite the map's
   prototype (`__proto__`) or alias a built-in (`constructor`). */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/* Memo keyed by the RAW variable string: identical string ⇒ reuse the parsed
   object and skip JSON.parse + Object.fromEntries. A direct /setvar changes
   the string, so the memo misses naturally and can never go stale; the
   explicit invalidate below is only belt-and-braces for external writers. */
let cachedRaw = null;
let cachedData = null;

export function invalidateStorylineDataCache() {
    cachedRaw = null;
    cachedData = null;
}

function normalizeData(raw) {
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const { npcs, ...rest } = data;
    /* Validate only — NEVER truncate here. Slicing in normalize meant every
       save wrote the cut list back into the chat file, permanently deleting
       the oldest NPCs past the cap with no warning. Capping happens at
       render/list time only (buildNpcSection, listNpcs). */
    const normalizedNpcs = {};
    if (npcs && typeof npcs === 'object' && !Array.isArray(npcs)) {
        for (const [name, entry] of Object.entries(npcs)) {
            if (!name || UNSAFE_KEYS.has(name)) continue;
            normalizedNpcs[name] = entry && typeof entry === 'object' ? entry : {};
        }
    }
    return {
        ...rest,
        version: DATA_VERSION,
        npcs: normalizedNpcs,
    };
}

export function getStorylineData() {
    try {
        const raw = String(getLocalVariable(STORYLINE_DATA_VARIABLE) ?? '');
        if (raw === cachedRaw && cachedData) return cachedData;
        cachedRaw = raw;
        cachedData = normalizeData(raw ? JSON.parse(raw) : {});
        return cachedData;
    } catch (error) {
        console.warn('[Storyline] Failed to read chat-local storyline data:', error);
        invalidateStorylineDataCache();
        return normalizeData(null);
    }
}

export function saveStorylineData(state) {
    const normalized = normalizeData(state);
    const raw = JSON.stringify(normalized);
    setLocalVariable(STORYLINE_DATA_VARIABLE, raw);
    cachedRaw = raw;
    cachedData = normalized;
    return normalized;
}

export function recordGeneratedNpc(name, parameters = {}) {
    const state = getStorylineData();
    const key = String(name ?? '').trim();
    if (!key || UNSAFE_KEYS.has(key)) return state;
    const existing = Object.hasOwn(state.npcs, key) ? state.npcs[key] : {};
    state.npcs[key] = {
        gender: String(parameters?.gender ?? '').trim() || existing.gender || 'neutral',
        culture: String(parameters?.culture ?? '').trim() || existing.culture || '',
        style: String(parameters?.style ?? '').trim() || existing.style || '',
        context: String(parameters?.context ?? '').trim() || existing.context || '',
        createdAt: existing.createdAt ?? new Date().toISOString(),
    };
    return saveStorylineData(state);
}

export function buildNpcSection(trackedNames = null, maxNpcs = 30) {
    const state = getStorylineData();
    const allNames = Object.keys(state.npcs);
    if (!allNames.length) return '';
    /* Newest first — must match listNpcs ordering. Insertion order stranded
       re-recorded NPCs outside the window forever, because updating an entry
       in place keeps its original position. */
    const names = allNames.sort((a, b) => String(state.npcs[b]?.createdAt ?? '').localeCompare(String(state.npcs[a]?.createdAt ?? '')));
    const shown = names.slice(0, Math.max(1, maxNpcs));
    const lines = shown.map((name) => {
        const npc = state.npcs[name] ?? {};
        const attributes = [
            npc.gender ? `gender: ${npc.gender}` : '',
            npc.culture ? `culture: ${npc.culture}` : '',
            npc.style ? `style: ${npc.style}` : '',
        ].filter(Boolean);
        const context = String(npc.context ?? '').trim();
        const tracked = trackedNames instanceof Set && trackedNames.has(name) ? ' [tracked]' : '';
        return `- ${name}${tracked}${attributes.length ? ` (${attributes.join(', ')})` : ''}${context ? ` — ${context}` : ''}`;
    });
    if (names.length > shown.length) {
        lines.push(`\u2026 +${names.length - shown.length} more recorded earlier \u2014 reuse their exact spelling if they reappear.`);
    }
    const header = 'NPCs established earlier in this story. Keep their spelling exactly as shown and do not rename established characters; reuse these names when they reappear.';
    const trackedNote = trackedNames instanceof Set && trackedNames.size
        ? 'Entries marked [tracked] have a runtime state in Character State — read or change them with the state_* tools.'
        : '';
    return [header, trackedNote, ...lines].filter(Boolean).join('\n');
}

/* Display API for Hub/UI/debug. `limit` caps the RESULT for display only —
   pass null to get the full archive (bridge/tracked-name logic needs every
   name). Data itself is never truncated here. */
export function listNpcs(limit = MAX_LISTED_NPCS) {
    const state = getStorylineData();
    const entries = Object.entries(state.npcs)
        .map(([name, npc]) => ({
            name,
            gender: String(npc?.gender ?? ''),
            culture: String(npc?.culture ?? ''),
            style: String(npc?.style ?? ''),
            context: String(npc?.context ?? ''),
            createdAt: String(npc?.createdAt ?? ''),
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return Number.isFinite(limit) && limit >= 0 ? entries.slice(0, limit) : entries;
}

export function deleteNpc(name) {
    const state = getStorylineData();
    delete state.npcs[String(name ?? '').trim()];
    return saveStorylineData(state);
}
