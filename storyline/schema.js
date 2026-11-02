/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { uuidv4 } from '../../../../../scripts/utils.js';
import {
    SCHEMA_VERSION,
    DEFAULT_CHAT_SETTINGS,
    DEFAULT_STORYLINE_SETTINGS,
    MAX_FIELD_LENGTH,
    MAX_LOREBOOKS,
    LOREBOOK_TOKENS_MIN,
    LOREBOOK_TOKENS_MAX,
    LOREBOOK_TOKENS_DEFAULT,
    MAX_SCENARIOS,
    MAX_CHARACTERS,
    VALID_PERSPECTIVES,
    BUILT_IN_FUNCTIONS,
    VALID_FUNCTION_MODES,
    FUNCTION_MODES,
} from './constants.js';
import { dropLegacyDefault } from './legacy-prompts.js';
import { tr } from './i18n.js';

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
}

function cleanString(value, maxLength = MAX_FIELD_LENGTH) {
    if (typeof value !== 'string') return '';
    return value.slice(0, maxLength);
}

export function createDefaultStoryline() {
    const now = new Date().toISOString();
    return {
        version: SCHEMA_VERSION,
        id: uuidv4(),
        title: 'New Storyline',
        language: '',
        banner: '',
        hostAvatar: '',
        category: '',
        plotSummary: '',
        plotUser: '',
        plotAI: '',
        storytellerPrompt: '',
        promptGuideline: '',
        aiReminder: '',
        aiOutputReminder: '',
        firstMessages: [],
        characters: [],
        userCard: { avatar: '' },
        playerPersonas: [],
        defaultChatSettings: { ...DEFAULT_CHAT_SETTINGS },
        settings: { ...DEFAULT_STORYLINE_SETTINGS },
        functions: { entries: {}, prompt: '', reminder: '' },
        metadata: { created: now, modified: now },
    };
}

export function normalizeStoryline(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { storyline: null, errors: [tr('Storyline data must be a JSON object.')] };
    }

    const storyline = { ...raw };
    storyline.version = SCHEMA_VERSION;
    storyline.id = cleanString(storyline.id, 200) || uuidv4();
    storyline.title = cleanString(storyline.title, 200) || 'Untitled Storyline';
    storyline.language = cleanString(storyline.language, 40);
    /* Banner is a data URL: NEVER slice it here. Length is enforced at
       upload/editor time (BANNER_MAX_CHARS) — slicing in normalize would
       corrupt existing oversized banners into broken data URLs on load. */
    storyline.banner = typeof storyline.banner === 'string' ? storyline.banner : '';
    storyline.hostAvatar = cleanString(storyline.hostAvatar, 300);
    storyline.category = cleanString(storyline.category, 200);
    storyline.plotSummary = cleanString(storyline.plotSummary);
    storyline.plotUser = cleanString(storyline.plotUser);
    storyline.plotAI = cleanString(storyline.plotAI);
    /* A verbatim copy of a retired built-in text means "built-in": clear it so
       the storyline follows the current default (v0.2.0 rewrite). */
    storyline.storytellerPrompt = dropLegacyDefault('storyteller', cleanString(storyline.storytellerPrompt));
    storyline.promptGuideline = cleanString(storyline.promptGuideline);
    storyline.aiReminder = cleanString(storyline.aiReminder);
    storyline.aiOutputReminder = dropLegacyDefault('outputReminder', cleanString(storyline.aiOutputReminder));

    if (!Array.isArray(storyline.firstMessages)) storyline.firstMessages = [];
    storyline.firstMessages = storyline.firstMessages
        .slice(0, MAX_SCENARIOS)
        .map((entry) => ({
            id: cleanString(entry?.id, 200) || uuidv4(),
            title: cleanString(entry?.title, 200) || 'Scenario',
            content: cleanString(entry?.content),
        }));

    if (!Array.isArray(storyline.characters)) storyline.characters = [];
    storyline.characters = storyline.characters
        .slice(0, MAX_CHARACTERS)
        .map((entry) => ({
            avatar: cleanString(entry?.avatar, 300),
            name: cleanString(entry?.name, 200) || 'Unknown',
            aliases: Array.isArray(entry?.aliases)
                ? entry.aliases.map((alias) => cleanString(alias, 200)).filter(Boolean).slice(0, 20)
                : [],
            note: cleanString(entry?.note, 4000),
            stateEntityKey: cleanString(entry?.stateEntityKey, 300),
            alwaysInclude: !!entry?.alwaysInclude,
            /* Full-card injection (v0.1.22): inject the ENTIRE card —
               description, personality, scenario and embedded lorebook —
               with NO truncation and NO total-budget cap. The user owns the
               token cost; the budget planner still counts the real size and
               warns via /storyline debug when the window overflows. */
            full: !!entry?.full,
        }))
        .filter((entry) => entry.avatar);

    /* Player card: the optional character card representing {{user}}. Empty
       avatar = use the current SillyTavern persona (legacy behavior). */
    const rawUserCard = storyline.userCard && typeof storyline.userCard === 'object' && !Array.isArray(storyline.userCard)
        ? storyline.userCard
        : {};
    storyline.userCard = { avatar: cleanString(rawUserCard.avatar, 300) };

    /* Linked lorebooks (v0.1.23): World Info files injected by the context
       builder with ST-faithful smart activation. Deduped by name; `mode`
       smart|full; `maxTokens` per book clamps 100–32000. */
    storyline.lorebooks = Array.isArray(storyline.lorebooks)
        ? storyline.lorebooks.slice(0, MAX_LOREBOOKS).map((link) => ({
            name: cleanString(link?.name, 200),
            mode: link?.mode === 'full' ? 'full' : 'smart',
            maxTokens: Math.min(LOREBOOK_TOKENS_MAX, Math.max(LOREBOOK_TOKENS_MIN, Math.round(Number(link?.maxTokens)) || LOREBOOK_TOKENS_DEFAULT)),
            enabled: link?.enabled !== false,
        })).filter((link) => link.name)
            .filter((link, index, all) => all.findIndex((other) => other.name === link.name) === index)
        : [];

    if (!Array.isArray(storyline.playerPersonas)) storyline.playerPersonas = [];

    const rawDefaultChatSettings = storyline.defaultChatSettings && typeof storyline.defaultChatSettings === 'object'
        ? storyline.defaultChatSettings
        : {};
    storyline.defaultChatSettings = { ...DEFAULT_CHAT_SETTINGS, ...rawDefaultChatSettings };
    if (!VALID_PERSPECTIVES.includes(storyline.defaultChatSettings.perspective)) {
        storyline.defaultChatSettings.perspective = DEFAULT_CHAT_SETTINGS.perspective;
    }

    const rawSettings = storyline.settings && typeof storyline.settings === 'object' ? storyline.settings : {};
    storyline.settings = { ...DEFAULT_STORYLINE_SETTINGS, ...rawSettings };
    storyline.settings.maxTokensPerCharacter = clampNumber(storyline.settings.maxTokensPerCharacter, 50, 8000, DEFAULT_STORYLINE_SETTINGS.maxTokensPerCharacter);
    storyline.settings.maxTotalCharacterTokens = clampNumber(storyline.settings.maxTotalCharacterTokens, 100, 32000, DEFAULT_STORYLINE_SETTINGS.maxTotalCharacterTokens);
    storyline.settings.relevanceWindow = clampNumber(storyline.settings.relevanceWindow, 1, 50, DEFAULT_STORYLINE_SETTINGS.relevanceWindow);
    storyline.settings.speakerLabel = cleanString(storyline.settings.speakerLabel, 60) || DEFAULT_STORYLINE_SETTINGS.speakerLabel;

    const rawFunctions = storyline.functions && typeof storyline.functions === 'object' && !Array.isArray(storyline.functions)
        ? storyline.functions
        : {};
    const rawFunctionEntries = rawFunctions.entries && typeof rawFunctions.entries === 'object' && !Array.isArray(rawFunctions.entries)
        ? rawFunctions.entries
        : {};
    const functionEntries = {};
    for (const builtIn of BUILT_IN_FUNCTIONS) {
        const rawEntry = rawFunctionEntries[builtIn.id] && typeof rawFunctionEntries[builtIn.id] === 'object'
            ? rawFunctionEntries[builtIn.id]
            : null;
        /* SPARSE entries (v0.1.21 comment fixed to match the code below):
           an entry that EXISTS is KEPT as-is — including mode "default_off"
           ("configured" = entry present). Only ids that were never
           configured, and unknown ids, are dropped; an invalid mode falls
           back to default_off. Never "optimize" default_off entries away:
           the editor uses their presence to render the catalog state
           (invariant #5). */
        if (!rawEntry) continue;
        functionEntries[builtIn.id] = {
            mode: VALID_FUNCTION_MODES.includes(rawEntry.mode) ? rawEntry.mode : FUNCTION_MODES.DEFAULT_OFF,
            instruction: cleanString(rawEntry.instruction, 2000),
        };
    }
    storyline.functions = {
        entries: functionEntries,
        prompt: cleanString(rawFunctions.prompt, 8000),
        reminder: dropLegacyDefault('functionsReminder', cleanString(rawFunctions.reminder, 1000)),
    };

    const now = new Date().toISOString();
    const rawMetadata = storyline.metadata && typeof storyline.metadata === 'object' ? storyline.metadata : {};
    storyline.metadata = {
        ...rawMetadata,
        created: cleanString(rawMetadata.created, 60) || now,
        modified: cleanString(rawMetadata.modified, 60) || now,
    };

    return { storyline, errors: [] };
}

/* Migration table — deliberately EMPTY so far: SCHEMA_VERSION has been 1
   since the first release, and normalizeStoryline already coerces every
   field, so no version step has ever needed a data transform. Keep the loop:
   the next schema bump adds `migrations[oldVersion] = (data) => data` here,
   and getStoryline/getStorylines/importStoryline keep calling it. */
const migrations = {};

export function migrateStoryline(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { storyline: raw, errors: [] };
    }
    const version = Number(raw.version ?? SCHEMA_VERSION);
    if (!Number.isFinite(version) || version <= 0) {
        return { storyline: raw, errors: [tr('Unknown storyline version: {version}', { version: raw.version })] };
    }
    let current = raw;
    for (let v = version; v < SCHEMA_VERSION; v++) {
        const migrate = migrations[v];
        if (typeof migrate === 'function') {
            current = migrate(current);
        }
    }
    return { storyline: current, errors: [] };
}
