import { extension_settings } from '../../../../../scripts/extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';
import { uuidv4 } from '../../../../../scripts/utils.js';
import { STORAGE_KEY } from './constants.js';
import { tr } from './i18n.js';
import { normalizeStoryline, migrateStoryline } from './schema.js';

function getStore() {
    if (!extension_settings[STORAGE_KEY] || typeof extension_settings[STORAGE_KEY] !== 'object') {
        extension_settings[STORAGE_KEY] = { storylines: {} };
    }
    const store = extension_settings[STORAGE_KEY];
    if (!store.storylines || typeof store.storylines !== 'object' || Array.isArray(store.storylines)) {
        store.storylines = {};
    }
    return store;
}

/* Normalize cache keyed by the RAW store object identity: saveStoryline
   replaces the stored object, so a stale entry can never be returned. This
   keeps getStoryline/getStorylines from re-running migrate+normalize on every
   call (they run per chat switch, tool scan and hub refresh otherwise). */
const storylineCache = new Map();

function normalizeCached(id, raw) {
    const cached = storylineCache.get(id);
    if (cached && cached.raw === raw) return cached.storyline;
    let storyline = null;
    try {
        const { storyline: migrated } = migrateStoryline(raw);
        /* The store key IS the id: a raw entry without one would otherwise get
           a fresh uuid per cache miss and fork on the next save. */
        const keyed = migrated && typeof migrated === 'object' && !migrated.id ? { ...migrated, id } : migrated;
        const { storyline: normalized } = normalizeStoryline(keyed);
        storyline = normalized;
    } catch (error) {
        console.warn(`[Storyline] Failed to load storyline ${id}:`, error);
        storyline = null;
    }
    storylineCache.set(id, { raw, storyline });
    return storyline;
}

export function getStorylines() {
    const storylines = getStore().storylines;
    return Object.entries(storylines)
        .map(([id, raw]) => normalizeCached(id, raw))
        .filter(Boolean)
        .sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

export function getStoryline(id) {
    if (typeof id !== 'string' || !id) return null;
    const raw = getStore().storylines[id];
    if (!raw) return null;
    return normalizeCached(id, raw);
}

/* Badge/count callers only need the key count — no normalization. */
export function countStorylines() {
    return Object.keys(getStore().storylines).length;
}

export function saveStoryline(storyline) {
    const { storyline: normalized, errors } = normalizeStoryline(storyline);
    if (!normalized) {
        throw new Error(errors.join(' ') || tr('Invalid storyline data.'));
    }
    normalized.metadata.modified = new Date().toISOString();
    getStore().storylines[normalized.id] = normalized;
    saveSettingsDebounced();
    return normalized;
}

export function deleteStoryline(id) {
    if (typeof id !== 'string' || !id) return;
    delete getStore().storylines[id];
    /* Drop the cached normalized object too — otherwise the entry (raw +
       storyline refs) lingers for the whole session (B4). */
    storylineCache.delete(id);
    saveSettingsDebounced();
}

export function duplicateStoryline(id) {
    const source = getStoryline(id);
    if (!source) return null;
    const copy = structuredClone(source);
    copy.id = uuidv4();
    copy.title = `${source.title} (copy)`;
    /* The copy must get its OWN host card on first Start: keeping the
       original's hostAvatar made both storylines share one card, so the
       copy's sessions were created under (and interleaved with) the
       original's chat list. */
    copy.hostAvatar = '';
    return saveStoryline(copy);
}

function ensureUniqueTitle(title) {
    const existing = new Set(getStorylines().map((storyline) => storyline.title));
    if (!existing.has(title)) return title;
    let counter = 2;
    while (existing.has(`${title} (${counter})`)) counter++;
    return `${title} (${counter})`;
}

export function importStoryline(jsonText) {
    try {
        const parsed = JSON.parse(String(jsonText));
        const { storyline: migrated } = migrateStoryline(parsed);
        const { storyline: normalized, errors } = normalizeStoryline(migrated);
        if (!normalized) {
            return { ok: false, error: errors.join(' ') || tr('Invalid storyline data.') };
        }
        normalized.id = uuidv4();
        /* Same rule as duplicateStoryline: the imported copy must get its OWN
           host card on first Start — keeping the source's hostAvatar made both
           storylines share one card and interleave their sessions. */
        normalized.hostAvatar = '';
        normalized.metadata = {
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
        };
        normalized.title = ensureUniqueTitle(normalized.title);
        saveStoryline(normalized);
        return { ok: true, storyline: normalized };
    } catch (error) {
        return { ok: false, error: tr('Invalid storyline JSON: {message}', { message: error.message }) };
    }
}

export function exportStoryline(id) {
    const storyline = getStoryline(id);
    return storyline ? structuredClone(storyline) : null;
}
