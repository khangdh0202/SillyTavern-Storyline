import { generateRaw } from '../../../../../script.js';
import { ToolManager } from '../../../../../scripts/tool-calling.js';
import { BUILT_IN_FUNCTIONS, FUNCTION_MODES } from './constants.js';
import { tr } from './i18n.js';
import { readChatState, isStorylineChat } from './chat.js';
import { getStoryline } from './storage.js';
import { recordGeneratedNpc } from './data.js';
import { isIntegrationReady } from './integrations.js';

export function getActiveFunctionsForChat(storyline, chatState) {
    const active = chatState?.functions?.active ?? {};
    const entries = storyline?.functions?.entries ?? {};
    const result = [];
    for (const def of BUILT_IN_FUNCTIONS) {
        const entry = entries[def.id];
        /* Entry presence IS configuration: an id the creator removed from the
           storyline is inactive in every chat, regardless of stale per-chat
           flags (old chats keep a dense active map that would otherwise pin
           the removed function on forever with no toggle to disable it). */
        if (!entry) continue;

        let flag = active[def.id];

        /* setFunctionActive refuses required functions, so a stored false can
           never be a player choice — it is always a stale seed from a chat
           created before the entry existed (or a dense-map chat). Treat it as
           "not yet seeded" and let the mode fallback decide. */
        if (flag === false && entry.mode === FUNCTION_MODES.REQUIRED) {
            flag = undefined;
        }

        /* Missing active flag = the chat predates this function entry (or the
           function was added to the storyline later): fall back to the entry
           mode so REQUIRED and DEFAULT_ON functions are never silently lost.
           An EXPLICIT false (player toggled it off) is always respected. */
        const isActive = flag ?? (entry.mode !== FUNCTION_MODES.DEFAULT_OFF);
        if (!isActive) continue;
        result.push({ def, entry });
    }
    return result;
}

/* Active AND usable right now: a function whose companion extension is
   missing/disabled stays "on" for the player but never reaches the prompt
   (its guidance would teach tools that do not exist). */
export function getUsableFunctionsForChat(storyline, chatState) {
    return getActiveFunctionsForChat(storyline, chatState).filter((activeFunction) => isIntegrationReady(activeFunction.def.id));
}

export function getEffectiveInstruction(activeFunction) {
    return String(activeFunction?.entry?.instruction ?? '').trim() || String(activeFunction?.def?.defaultInstruction ?? '');
}

export function isFunctionCallingAvailable() {
    return ToolManager.isToolCallingSupported();
}

const LANGUAGE_LABELS = {
    en: 'English',
    vi: 'Vietnamese',
    ja: 'Japanese',
    zh: 'Chinese',
    ko: 'Korean',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
};

function getCurrentStoryLanguage() {
    try {
        const chatState = readChatState();
        const storyline = chatState ? getStoryline(chatState.storylineId) : null;
        return LANGUAGE_LABELS[storyline?.language ?? ''] ?? '';
    } catch {
        return '';
    }
}

function stripQuotes(text) {
    return String(text ?? '').trim()
        .replace(/^["'\u00ab\u00bb\u201c\u201d\u2018\u2019]+/, '')
        .replace(/["'\u00ab\u00bb\u201c\u201d\u2018\u2019]+$/, '')
        .trim();
}

async function invokeCharacterNameGenerator(parameters = {}) {
    const gender = String(parameters?.gender ?? 'neutral').trim() || 'neutral';
    const culture = String(parameters?.culture ?? '').trim();
    const style = String(parameters?.style ?? '').trim();
    const context = String(parameters?.context ?? '').trim();
    const language = getCurrentStoryLanguage();

    /* Standard pattern: the model invents the name itself and passes it in the
       call. The nested generateRaw request is only a fallback for calls without
       a name — it has no story context, inherits the live API/preset and is the
       known failure point (tiny max_tokens vs reasoning models). */
    let name = stripQuotes(parameters?.name);

    if (!name) {
        const prompt = [
            'Generate ONE fictional character name for an interactive story.',
            `Gender: ${gender}.`,
            culture ? `Cultural origin: ${culture}.` : '',
            style ? `Genre or aesthetic style: ${style}.` : '',
            context ? `Story context: ${context}.` : '',
            language ? `The name must fit the story's language: ${language}.` : '',
            'Reply with ONLY the name. No quotes, no explanations, no punctuation.',
        ].filter(Boolean).join('\n');

        try {
            const response = await generateRaw({
                prompt,
                instructOverride: true,
                responseLength: 500,
                trimNames: false,
                systemPrompt: 'You generate fitting, original character names for interactive stories. You output only the name and nothing else.',
            });
            name = stripQuotes(response);
        } catch (error) {
            throw new Error(`The name generator fallback failed: ${error?.message ?? error}`);
        }
    }

    if (!name) {
        throw new Error('The name generator returned an empty response.');
    }
    try {
        recordGeneratedNpc(name, { gender, culture, style, context });
    } catch (error) {
        console.warn('[Storyline] Failed to record generated NPC into chat-local data:', error);
    }
    return name;
}

const FUNCTION_ACTIONS = {
    character_name_generator: invokeCharacterNameGenerator,
};

export function registerStorylineTools() {
    for (const def of BUILT_IN_FUNCTIONS) {
        if (!def.toolName || !def.toolSchema) continue;
        ToolManager.registerFunctionTool({
            name: def.toolName,
            displayName: def.name,
            description: def.description,
            parameters: def.toolSchema,
            action: async (parameters) => {
                const action = FUNCTION_ACTIONS[def.id];
                if (!action) {
                    throw new Error(`No action implemented for storyline function: ${def.id}`);
                }
                return await action(parameters);
            },
            formatMessage: (parameters) => `${tr(def.name)}: ${JSON.stringify(parameters ?? {})}`,
            shouldRegister: () => {
                if (!isStorylineChat()) return false;
                if (!isFunctionCallingAvailable()) return false;
                const chatState = readChatState();
                const storyline = getStoryline(chatState.storylineId);
                return getActiveFunctionsForChat(storyline, chatState).some((activeFunction) => activeFunction.def.id === def.id);
            },
            stealth: false,
        });
    }
}
