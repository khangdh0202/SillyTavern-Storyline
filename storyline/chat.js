/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { chat, chat_metadata, clearChat, addOneMessage, saveChatConditional, saveChatDebounced, selectCharacterById, openCharacterChat, characters, createOrEditCharacter, getPastCharacterChats } from '../../../../../script.js';
import { saveMetadataDebounced } from '../../../../../scripts/extensions.js';
import { Popup, POPUP_TYPE } from '../../../../../scripts/popup.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { CHAT_METADATA_KEY, DEFAULT_CHAT_SETTINGS, VALID_PERSPECTIVES, PERSPECTIVES, BUILT_IN_FUNCTIONS, FUNCTION_MODES } from './constants.js';
import { getStoryline, saveStoryline } from './storage.js';
import { ensureStorylineHost, ensureStorylineHostCard, sanitizeChatName } from './host.js';
import { pickSessionStart } from '../ui/start-session.js';
import { tr } from './i18n.js';

/* Pure read (W5-5): returns a shallow view with guaranteed shapes but never
   writes back into chat_metadata. Used by hot read-only paths — ST's tool
   scanner calls shouldRegister on every generation scan, and a normalizing
   getter mutated metadata on every such read. Returns null when this is not
   a Storyline chat or the shape is broken. */
export function readChatState() {
    const state = chat_metadata?.[CHAT_METADATA_KEY];
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    if (typeof state.storylineId !== 'string' || !state.storylineId) return null;
    const settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
    const functions = state.functions && typeof state.functions === 'object' && !Array.isArray(state.functions)
        ? state.functions
        : {};
    const active = functions.active && typeof functions.active === 'object' && !Array.isArray(functions.active)
        ? functions.active
        : {};
    return { ...state, settings, functions: { ...functions, active } };
}

/* Normalizing read for flows that WRITE through the live object: fills the
   missing shapes in place so writers can rely on them. */
export function getStorylineChatState() {
    const state = chat_metadata?.[CHAT_METADATA_KEY];
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    if (typeof state.storylineId !== 'string' || !state.storylineId) return null;
    state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
    state.functions = state.functions && typeof state.functions === 'object' && !Array.isArray(state.functions)
        ? state.functions
        : { active: {} };
    state.functions.active = state.functions.active && typeof state.functions.active === 'object' && !Array.isArray(state.functions.active)
        ? state.functions.active
        : {};
    return state;
}

export function isStorylineChat() {
    return !!readChatState();
}

export function getChatSettings() {
    const state = readChatState();
    const settings = state?.settings ?? {};
    return {
        ...settings,
        perspective: VALID_PERSPECTIVES.includes(settings.perspective) ? settings.perspective : PERSPECTIVES.SECOND,
    };
}

export function setChatSettings(partial) {
    const state = getStorylineChatState();
    if (!state) return;
    state.settings = { ...state.settings, ...partial };
    saveMetadataDebounced();
}

function createChatState(storyline) {
    return {
        storylineId: storyline.id,
        storylineVersion: storyline.version,
        selectedScenarioId: null,
        settings: {
            ...DEFAULT_CHAT_SETTINGS,
            ...(storyline.defaultChatSettings ?? {}),
            /* Player card is a PER-CHAT choice: 'storyline' follows the
               definition default (attach/legacy chats), 'persona' forces the
               persona, 'card' uses userCardAvatar. Picked at chat start. */
            userCardMode: 'storyline',
            userCardAvatar: '',
        },
        functions: { active: buildDefaultActiveMap(storyline) },
    };
}

function buildDefaultActiveMap(storyline) {
    /* SPARSE seed: only ids the storyline actually configures get a flag.
       A dense map (every built-in id, old builds) made the
       getActiveFunctionsForChat "missing flag" fallback unreachable — a
       function the creator added to the storyline LATER was frozen to an
       explicit false in every existing chat. Unconfigured ids now stay
       flag-less, so the mode-based fallback can auto-activate them. */
    const entries = storyline.functions?.entries ?? {};
    const active = {};
    for (const builtIn of BUILT_IN_FUNCTIONS) {
        const mode = entries[builtIn.id]?.mode;
        if (mode === undefined) continue;
        active[builtIn.id] = mode === FUNCTION_MODES.REQUIRED || mode === FUNCTION_MODES.DEFAULT_ON;
    }
    return active;
}

export function setFunctionActive(functionId, isActive) {
    const state = getStorylineChatState();
    if (!state) return;
    const storyline = getStoryline(state.storylineId);
    const mode = storyline?.functions?.entries?.[functionId]?.mode;
    if (mode === FUNCTION_MODES.REQUIRED) return;
    state.functions.active[functionId] = !!isActive;
    saveMetadataDebounced();
}

async function pickScenario(scenarios) {
    const content = document.createElement('div');
    content.classList.add('storyline_scenario_picker', 'storyline_theme');

    const hero = document.createElement('div');
    hero.classList.add('storyline_popup_hero');
    const heroIcon = document.createElement('div');
    heroIcon.classList.add('storyline_popup_hero_icon');
    heroIcon.innerHTML = '<i class="fa-solid fa-flag-checkered fa-fw"></i>';
    const heroMain = document.createElement('div');
    heroMain.classList.add('storyline_popup_hero_main');
    const heroTitle = document.createElement('div');
    heroTitle.classList.add('storyline_popup_hero_title');
    heroTitle.textContent = tr('Choose a starting scenario');
    const heroSub = document.createElement('div');
    heroSub.classList.add('storyline_popup_hero_sub');
    heroSub.textContent = scenarios.length === 1
        ? tr('1 opening available — the chosen opening becomes the first message of the chat.')
        : tr('{n} openings available — the chosen opening becomes the first message of the chat.', { n: scenarios.length });
    heroMain.append(heroTitle, heroSub);
    hero.append(heroIcon, heroMain);
    content.append(hero);

    let popup;
    for (const [index, scenario] of scenarios.entries()) {
        const button = document.createElement('div');
        button.classList.add('storyline_scenario_item', 'menu_button', 'interactable');
        const head = document.createElement('div');
        head.classList.add('storyline_scenario_head');
        const badge = document.createElement('div');
        badge.classList.add('storyline_scenario_index');
        badge.textContent = String(index + 1);
        const name = document.createElement('div');
        name.classList.add('storyline_scenario_title');
        name.textContent = scenario.title || tr('Scenario');
        head.append(badge, name);
        const preview = document.createElement('div');
        preview.classList.add('storyline_scenario_preview');
        preview.textContent = scenario.content.slice(0, 240);
        button.append(head, preview);
        button.addEventListener('click', () => popup?.complete(scenario.id));
        content.append(button);
    }

    /* Dismiss = start without an opening (the chat already exists here). */
    popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: false, cancelButton: tr('Start blank'), wide: true, allowVerticalScrolling: true });
    const result = await popup.show();
    if (typeof result !== 'string') return null;
    return scenarios.find((scenario) => scenario.id === result) ?? null;
}

/* `choice` (v0.2.0): the Start screen already decided — a scenario id, or
   null for a blank start; no second popup. Undefined (attach flow) keeps the
   interactive behavior: 1 opening → auto, several → picker. */
async function seedScenario(chatState, choice = undefined) {
    const storyline = getStoryline(chatState.storylineId);
    if (!storyline) return;
    const scenarios = Array.isArray(storyline.firstMessages) ? storyline.firstMessages.filter((scenario) => scenario.content.trim()) : [];
    if (!scenarios.length || chat.length) return;

    let scenario = null;
    if (choice !== undefined) {
        scenario = choice ? scenarios.find((entry) => entry.id === choice) ?? null : null;
    } else {
        scenario = chatState.selectedScenarioId ? scenarios.find((entry) => entry.id === chatState.selectedScenarioId) ?? null : null;
        if (!scenario && scenarios.length === 1) scenario = scenarios[0];
        if (!scenario && scenarios.length > 1) scenario = await pickScenario(scenarios);
    }
    if (!scenario) return;

    chatState.selectedScenarioId = scenario.id;
    const context = getContext();
    const message = {
        name: storyline.settings?.speakerLabel || 'Narrator',
        is_user: false,
        is_system: false,
        send_date: context.humanizedDateTime(),
        mes: scenario.content,
        extra: { api: 'storyline', model: 'scenario', gen_id: Date.now() },
    };
    chat.push(message);
    addOneMessage(message);
}

function assertStorylineChatSupported() {
    const context = getContext();
    if (context.groupId) {
        toastr.warning(tr('Storyline chats are not supported in group chats.'), 'Storyline');
        return false;
    }
    return true;
}

/* Regression guard for the v0.1.9 cast seed: CHAT_CHANGED fires while the
   session chat is being opened — BEFORE chat_metadata.storyline exists — so
   the event-driven seed in world-state-bridge.js skips every fresh session
   and the cast sheet stays empty until a full page reload. Start/attach must
   seed explicitly once the metadata is saved. Dynamic import: the bridge
   statically imports this module (event wiring), so a static import here
   would create an init-order cycle.
   force: a deleted session's name is reused by the next Start ("<Title> #1"
   again), so the chat id + storyline guard still matched the dead chat and
   the fresh chat was skipped as already-seeded. A new session is always a
   fresh chat; ensureState is idempotent. */
async function seedCastStatesAfterMetadata() {
    try {
        const bridge = await import('./world-state-bridge.js');
        await bridge.seedCastStatesForActiveChat({ force: true });
    } catch (error) {
        console.warn('[Storyline] Cast seeding after session start failed:', error);
    }
}

/* Assigns the next session chat name BEFORE any chat is opened, so the host
   card's chat file is created exactly once, already under "<Title> #N".
   (The old doNewChat + rename flow created one file per step: the timestamp
   placeholder from ST plus the renamed copy, leaving orphan chat files.) */
async function prepareSessionChatName(storyline, characterId) {
    const base = sanitizeChatName(storyline.title);
    let pastChats = [];
    try {
        pastChats = await getPastCharacterChats(Number(characterId));
    } catch (error) {
        console.warn('[Storyline] Failed to count past sessions:', error);
    }
    const used = new Set(pastChats.map((entry) => String(entry?.file_name ?? '').replace(/\.jsonl$/i, '')));
    let sessionNumber = pastChats.length + 1;
    while (used.has(`${base} #${sessionNumber}`)) {
        sessionNumber++;
    }
    const chatName = `${base} #${sessionNumber}`;
    characters[characterId].chat = chatName;
    $('#selected_chat_pole').val(chatName);
    return sessionNumber;
}

export async function startStorylineChat(storylineId) {
    const storyline = getStoryline(storylineId);
    if (!storyline) {
        toastr.error(tr('Storyline not found.'), 'Storyline');
        return false;
    }
    if (!assertStorylineChatSupported()) return false;

    /* v0.2.0 Start screen: player card + opening are chosen in ONE popup
       BEFORE the chat is created, so Cancel always aborts cleanly. */
    const start = await pickSessionStart(storyline);
    if (start === null) return false;
    const userCard = start.playerAvatar;

    let sessionNumber;
    try {
        const host = await ensureStorylineHostCard(storyline);
        if (host.created) {
            const latest = getStoryline(storylineId);
            if (latest) {
                latest.hostAvatar = host.avatar;
                saveStoryline(latest);
            }
        }
        sessionNumber = await prepareSessionChatName(storyline, host.characterId);
        const context = getContext();
        const hostAlreadySelected = context.characterId !== undefined && context.characterId !== null
            && Number(context.characterId) === Number(host.characterId);
        if (hostAlreadySelected) {
            await openCharacterChat(characters[host.characterId].chat);
        } else {
            await selectCharacterById(host.characterId, { switchMenu: true });
            if (Number(getContext().characterId) !== Number(host.characterId)) {
                throw new Error(tr('Could not switch to the Storyline host chat. Stop the current generation and try again.'));
            }
            await createOrEditCharacter(new CustomEvent('newChat'));
        }
    } catch (error) {
        console.error('[Storyline] Failed to open a Storyline chat:', error);
        toastr.error(String(error?.message ?? error), 'Storyline');
        return false;
    }

    const chatState = createChatState(storyline);
    chatState.settings.userCardMode = userCard ? 'card' : 'persona';
    chatState.settings.userCardAvatar = userCard;
    chat_metadata[CHAT_METADATA_KEY] = chatState;
    if (chat.length) {
        await clearChat({ clearData: true });
    }
    await seedScenario(chatState, start.scenarioId);
    await saveChatConditional();
    await getContext().saveMetadata();
    void seedCastStatesAfterMetadata();
    toastr.success(tr('Storyline "{title}" — session #{n} started.', { title: storyline.title, n: sessionNumber }), 'Storyline');
    return true;
}

export async function attachStorylineToCurrentChat(storylineId) {
    const storyline = getStoryline(storylineId);
    if (!storyline) {
        toastr.error(tr('Storyline not found.'), 'Storyline');
        return false;
    }
    if (!assertStorylineChatSupported()) return false;

    const context = getContext();
    if (context.characterId === undefined || context.characterId === null) {
        try {
            await ensureStorylineHost();
        } catch (error) {
            console.error('[Storyline] Failed to open a Storyline host chat:', error);
            toastr.error(String(error?.message ?? error), 'Storyline');
            return false;
        }
    }

    const chatState = createChatState(storyline);
    chat_metadata[CHAT_METADATA_KEY] = chatState;
    await seedScenario(chatState);
    await saveChatConditional();
    await getContext().saveMetadata();
    /* W5-3 relabel sweep: messages from before the attach keep their old
       chip name until a re-render. mes.name persists in the chat file, so
       ONE idempotent pass here is enough (already-labeled messages skip in
       O(1)). */
    for (let index = 0; index < chat.length; index++) {
        try {
            relabelNarrativeMessage(index);
        } catch (error) {
            console.warn('[Storyline] Relabel sweep failed for message', index, error);
        }
    }
    void seedCastStatesAfterMetadata();
    toastr.success(tr('Storyline "{title}" attached to the current chat.', { title: storyline.title }), 'Storyline');
    return true;
}

export async function detachStorylineFromCurrentChat() {
    if (!isStorylineChat()) return false;
    delete chat_metadata[CHAT_METADATA_KEY];
    await getContext().saveMetadata();
    toastr.info(tr('Storyline detached. This chat behaves as a normal chat again.'), 'Storyline');
    return true;
}

export function relabelNarrativeMessage(messageId) {
    const chatState = readChatState();
    if (!chatState) return;
    const mes = chat[messageId];
    if (!mes || mes.is_user || mes.is_system || mes.extra?.type === 'narrator') return;
    const storyline = getStoryline(chatState.storylineId);
    if (!storyline) return;
    const label = storyline.settings?.speakerLabel || 'Narrator';
    if (mes.name === label) return;
    mes.name = label;
    const element = document.querySelector(`#chat .mes[mesid="${messageId}"] .ch_name .name_text`);
    if (element) {
        element.textContent = label;
    }
    saveChatDebounced();
}
