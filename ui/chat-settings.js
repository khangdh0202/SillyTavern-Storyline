/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { renderExtensionTemplateAsync } from '../../../../../scripts/extensions.js';
import { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup } from '../../../../../scripts/popup.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { getThumbnailUrl } from '../../../../../script.js';
import { EXTENSION_FOLDER, PERSPECTIVE_LABELS, VALID_PERSPECTIVES, BUILT_IN_FUNCTIONS, FUNCTION_MODE_LABELS, FUNCTION_MODE_HINTS, DEFAULT_STORYTELLER_PROMPT, DEFAULT_OUTPUT_REMINDER } from '../storyline/constants.js';
import {
    isStorylineChat,
    getChatSettings,
    setChatSettings,
    readChatState,
    setFunctionActive,
    startStorylineChat,
    detachStorylineFromCurrentChat,
} from '../storyline/chat.js';
import { getStoryline } from '../storyline/storage.js';
import { getActiveFunctionsForChat, getUsableFunctionsForChat, isFunctionCallingAvailable } from '../storyline/functions.js';
import { buildIntegrationNotice } from './integration-notice.js';
import { estimateTokens } from '../storyline/characters.js';
import { buildStorylineContext, lastBuildInfo } from '../storyline/context.js';
import { listNpcs, deleteNpc } from '../storyline/data.js';
import { isWorldStateAvailable, isWorldStateFunctionActive, resolveName, ensureCastMemberState } from '../storyline/world-state-bridge.js';
import { openStorylineEditor } from './editor.js';
import { pickPlayerCard } from './player-picker.js';
import { makeEl, formatRelativeTime, buildChip, buildEmptyState, makeButton, upgradeControl, runUiAction, safeBannerDataUrl, escapeHtml } from './util.js';
import { tr, localizeTree, formatNumber } from '../storyline/i18n.js';

const GUIDANCE_TOKEN_LIMIT = 10000;
const OUTPUT_REMINDER_TOKEN_LIMIT = 500;

let chatSettingsButton = null;
let hubRoot = null;
let hubPopup = null;
let npcSearchTerm = '';

/* ---------------------------------------------------------------------------
 * Send-form button: live badge + health state, opens the Story Hub dashboard.
 * ------------------------------------------------------------------------ */

function buildChatSettingsButton() {
    const button = document.createElement('div');
    button.id = 'storyline_chat_settings';
    button.classList.add('storyline_sendform_btn', 'interactable');
    button.tabIndex = 0;
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', tr('Storyline — open the story hub'));
    const icon = makeEl('i', 'fa-solid fa-book-open storyline_sendform_icon');
    const badge = makeEl('span', 'storyline_sendform_badge', '0');
    button.append(icon, badge);
    button.addEventListener('click', () => openChatSettingsPopup());
    button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openChatSettingsPopup();
        }
    });
    return button;
}

function ensureChatSettingsButton() {
    if (!chatSettingsButton?.isConnected) {
        chatSettingsButton = document.getElementById('storyline_chat_settings');
    }
    if (!chatSettingsButton) {
        chatSettingsButton = buildChatSettingsButton();
    }
    const leftForm = document.querySelector('#leftSendForm');
    if (leftForm && chatSettingsButton.parentElement !== leftForm) {
        leftForm.append(chatSettingsButton);
    }
    return chatSettingsButton.isConnected;
}

export function initChatSettingsButton() {
    const tryEnsure = (attempt) => {
        if (ensureChatSettingsButton() || attempt >= 40) return;
        setTimeout(() => tryEnsure(attempt + 1), 250);
    };
    tryEnsure(0);
}

export function refreshChatSettingsButton() {
    ensureChatSettingsButton();
    if (!chatSettingsButton) return;
    const active = isStorylineChat();
    chatSettingsButton.style.display = active ? '' : 'none';
    document.body.classList.toggle('storyline-active', active);
    updateChatSettingsBadge();
    if (hubRoot?.isConnected) {
        if (active) {
            /* Live refresh path (MESSAGE_RECEIVED/GENERATION_ENDED): only the
               hero chips and stat cards — not the whole dashboard. */
            renderHub({ hero: true, stats: true });
        } else {
            hubPopup?.complete(POPUP_RESULT.CANCELLED);
        }
    }
}

function updateChatSettingsBadge() {
    const button = document.getElementById('storyline_chat_settings');
    if (!button) return;
    const active = isStorylineChat();
    const chatState = active ? readChatState() : null;
    const storyline = chatState ? getStoryline(chatState.storylineId) : null;
    const npcs = active ? listNpcs(null) : [];
    const activeFunctions = storyline && chatState ? getUsableFunctionsForChat(storyline, chatState) : [];
    const fcMissing = activeFunctions.length > 0 && !isFunctionCallingAvailable();

    /* v0.2.0: the badge counts recorded NPCs only when there are some — a
       permanent "0" meant nothing to stories without the name generator. */
    const badge = button.querySelector('.storyline_sendform_badge');
    if (badge) {
        badge.textContent = String(npcs.length);
        badge.classList.toggle('storyline_sf_zero', npcs.length === 0);
        badge.classList.toggle('storyline_hidden', !active || npcs.length === 0);
    }
    button.classList.toggle('storyline_sf_warn', fcMissing);
    button.title = !active || !storyline
        ? 'Storyline'
        : [
            tr('Storyline — {title}', { title: storyline.title }),
            npcs.length === 1 ? tr('1 NPC recorded') : tr('{n} NPCs recorded', { n: npcs.length }),
            activeFunctions.length
                ? (activeFunctions.length === 1 ? tr('1 function active') : tr('{n} functions active', { n: activeFunctions.length }))
                : '',
            fcMissing ? tr('⚠  Function calling is unavailable with the current model') : '',
            tr('Click for the Story Hub'),
        ].filter(Boolean).join('\n');
}

/* ---------------------------------------------------------------------------
 * Story Hub dashboard
 * ------------------------------------------------------------------------ */

function getHubStoryline() {
    const chatState = readChatState();
    return chatState ? getStoryline(chatState.storylineId) : null;
}

function renderHero(root, storyline, chatState) {
    if (!storyline) return;
    const bannerImg = root.querySelector('#storyline_hub_banner_img');
    const banner = safeBannerDataUrl(storyline.banner);
    if (bannerImg) {
        if (banner) bannerImg.src = banner;
        bannerImg.classList.toggle('storyline_hidden', !banner);
        bannerImg.closest('.storyline_hub_banner')?.classList.toggle('storyline_hub_banner_has_img', !!banner);
    }

    root.querySelector('#storyline_hub_title').textContent = storyline.title;

    /* The actual session file name ("<Title> #N"), not the host card name
       (which is just the story title again). */
    const chatName = String($('#selected_chat_pole').val() ?? '').trim();
    const sub = [];
    if (storyline.category) sub.push(storyline.category);
    if (chatName) sub.push(chatName);
    root.querySelector('#storyline_hub_sub').textContent = sub.join(' \u00b7 ') || tr('Storyline chat');

    const chips = [];
    const perspective = getChatSettings().perspective;
    chips.push(buildChip({ icon: 'fa-solid fa-eye', label: tr(PERSPECTIVE_LABELS[perspective] ?? perspective) }));
    /* Usable only: a function waiting for its companion extension is not
       "on" from the story's point of view. */
    const activeFunctions = getUsableFunctionsForChat(storyline, chatState);
    chips.push(buildChip({
        icon: 'fa-solid fa-wand-magic-sparkles',
        label: activeFunctions.length
            ? (activeFunctions.length === 1 ? tr('1 function on') : tr('{n} functions on', { n: activeFunctions.length }))
            : tr('No functions'),
        tone: activeFunctions.length ? 'accent' : 'muted',
    }));
    if (isWorldStateFunctionActive(storyline, chatState) && isWorldStateAvailable()) {
        chips.push(buildChip({ icon: 'fa-solid fa-heart-pulse', label: tr('World state'), tone: 'accent' }));
    }
    if (activeFunctions.length && !isFunctionCallingAvailable()) {
        chips.push(buildChip({ icon: 'fa-solid fa-triangle-exclamation', label: tr('No function calling'), tone: 'warn' }));
    }
    root.querySelector('#storyline_hub_chips').replaceChildren(...chips);
}

/* Prompt budget (v0.2.0) — replaces the four stat cards that repeated the
   hero chips. Shows the last real build for THIS storyline; "Measure"
   builds one now (same as /storyline debug, no generation). */
function renderStats(root, storyline) {
    const container = root.querySelector('#storyline_hub_stats');
    const slot = root.querySelector('#storyline_hub_measure_slot');
    if (!container) return;
    if (slot && !slot.childElementCount) {
        const measure = makeButton({
            icon: 'fa-solid fa-rotate',
            label: tr('Measure'),
            title: tr('Build the prompt now to measure it (no message is sent)'),
            className: 'menu_button interactable storyline_button storyline_hub_measure',
        });
        measure.addEventListener('click', () => runUiAction(measure, async () => {
            await buildStorylineContext({ type: 'normal' });
            if (hubRoot?.isConnected) renderStats(hubRoot, getHubStoryline());
        }));
        slot.append(measure);
    }
    container.replaceChildren();
    const info = lastBuildInfo;
    if (!info || info.storylineId !== storyline?.id) {
        container.append(makeEl('div', 'storyline_settings_hint', tr('Not measured yet in this session \u2014 press Measure, or send a message.')));
        return;
    }
    import('../storyline/commands.js')
        .then(({ buildBudgetBar }) => {
            if (container.isConnected) container.replaceChildren(buildBudgetBar(info));
        })
        .catch((error) => console.warn('[Storyline] Budget bar failed:', error));
}

function renderActions(root, storyline) {
    const container = root.querySelector('#storyline_hub_actions');
    if (!container) return;

    const makeAction = (icon, label, extraClass = '') => makeButton({
        icon,
        label,
        title: label,
        className: `menu_button interactable storyline_button storyline_hub_action${extraClass ? ` ${extraClass}` : ''}`,
    });

    const edit = makeAction('fa-solid fa-pen-to-square', tr('Edit'));
    edit.addEventListener('click', () => openStorylineEditor(storyline.id, { onSaved: () => renderHub() }));

    const library = makeAction('fa-solid fa-book-atlas', tr('Library'));
    library.addEventListener('click', async () => {
        const { openStorylineManager, isStorylineManagerOpen } = await import('./manager.js');
        /* Opened from the Library already: just reveal it again (U14 — the
           button used to do nothing because the manager was open below). */
        if (isStorylineManagerOpen()) {
            await hubPopup?.complete(POPUP_RESULT.CANCELLED);
            return;
        }
        await openStorylineManager();
        /* U9: edits/duplicates made in the Library must show up here. */
        if (hubRoot?.isConnected) renderHub();
    });

    const newSession = makeAction('fa-solid fa-arrow-rotate-right', tr('New session'));
    newSession.addEventListener('click', () => runUiAction(newSession, async () => {
        const confirmed = await callGenericPopup(
            tr('Start a new session of "{title}"? The current chat stays saved.', { title: escapeHtml(storyline.title) }),
            POPUP_TYPE.CONFIRM,
        );
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
        if (await startStorylineChat(storyline.id)) {
            refreshChatSettingsButton();
            /* Top-bar chip is stale for programmatic flows (CHAT_CHANGED fires
               before the chat metadata exists) — refresh via the manager
               module, dynamic import avoids the chat-settings↔manager cycle. */
            const { updateTopBarEntry } = await import('./manager.js');
            updateTopBarEntry();
        }
    }));

    const detach = makeAction('fa-solid fa-link-slash', tr('Detach'), ' storyline_hub_action_danger');
    detach.addEventListener('click', () => runUiAction(detach, async () => {
        const confirmed = await callGenericPopup(
            tr('Detach this storyline from the chat? The messages stay, but the chat behaves like a normal chat again.'),
            POPUP_TYPE.CONFIRM,
        );
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
        if (await detachStorylineFromCurrentChat()) {
            refreshChatSettingsButton();
            const { updateTopBarEntry } = await import('./manager.js');
            updateTopBarEntry();
        }
    }));

    container.replaceChildren(edit, library, newSession, detach);
}

function renderPerspective(root) {
    const current = getChatSettings().perspective;
    for (const option of root.querySelectorAll('.storyline_perspective_option')) {
        const selected = option.dataset.value === current;
        option.classList.toggle('storyline_selected', selected);
        option.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
}

function wirePerspective(root) {
    root.querySelector('#storyline_perspective_group')?.setAttribute('role', 'radiogroup');
    for (const option of root.querySelectorAll('.storyline_perspective_option')) {
        upgradeControl(option, { role: 'radio' });
        option.addEventListener('click', () => {
            const value = String(option.dataset.value ?? '');
            if (!VALID_PERSPECTIVES.includes(value)) return;
            setChatSettings({ perspective: value });
            renderPerspective(root);
            renderHero(root, getHubStoryline(), readChatState());
            toastr.info(tr('Perspective: {label}', { label: tr(PERSPECTIVE_LABELS[value]) }), 'Storyline');
        });
    }
}

function getOverrideValue(key) {
    return String(getChatSettings()[key] ?? '').trim();
}

function getPromptConfigs(storyline) {
    return [
        {
            rowId: 'storyline_chat_open_storyteller',
            metaId: 'storyline_chat_storyteller_meta',
            settingsKey: 'storytellerPromptOverride',
            title: tr('Narration Style'),
            icon: 'fa-solid fa-feather-pointed fa-fw',
            description: tr('These instructions are included in the system prompt to guide the AI\'s narration: voice, prose style, pacing and role-play rules. The perspective directive is added automatically \u2014 don\'t write it yourself.'),
            tokenLimit: GUIDANCE_TOKEN_LIMIT,
            fallback: storyline?.storytellerPrompt?.trim() || DEFAULT_STORYTELLER_PROMPT,
        },
        {
            rowId: 'storyline_chat_open_reminder',
            metaId: 'storyline_chat_reminder_meta',
            settingsKey: 'outputReminderOverride',
            title: tr('Output Reminder'),
            icon: 'fa-solid fa-square-check fa-fw',
            description: tr('Appended near the end of the context to enforce the output shape. Works best as short reminders.'),
            tokenLimit: OUTPUT_REMINDER_TOKEN_LIMIT,
            fallback: storyline?.aiOutputReminder?.trim() || DEFAULT_OUTPUT_REMINDER,
        },
    ];
}

function updateChatPromptMeta(root, config) {
    const meta = root.querySelector(`#${config.metaId}`);
    if (!meta) return;
    const override = getOverrideValue(config.settingsKey);
    if (override) {
        meta.textContent = tr('Custom \u00b7 \u2248 {n} tokens', { n: formatNumber(estimateTokens(override)) });
        meta.classList.add('storyline_row_button_meta_custom');
    } else {
        meta.textContent = tr('Follows storyline');
        meta.classList.remove('storyline_row_button_meta_custom');
    }
}

function updatePromptsSummary(root) {
    const state = root.querySelector('#storyline_hub_prompts_state');
    if (!state) return;
    const custom = ['storytellerPromptOverride', 'outputReminderOverride'].filter((key) => getOverrideValue(key)).length;
    state.textContent = custom ? tr('{n} custom', { n: custom }) : '';
    if (custom) root.querySelector('#storyline_hub_prompts')?.setAttribute('open', '');
}

function renderPrompts(root, storyline) {
    for (const config of getPromptConfigs(storyline)) {
        updateChatPromptMeta(root, config);
    }
    updatePromptsSummary(root);
}

function wireCustomPrompts(root) {
    for (const config of getPromptConfigs(null)) {
        const row = root.querySelector(`#${config.rowId}`);
        if (!row) continue;
        upgradeControl(row, { label: config.title });
        row.addEventListener('click', () => {
            const fresh = getPromptConfigs(getHubStoryline()).find((entry) => entry.rowId === config.rowId);
            if (fresh) openChatPromptEditor({ ...fresh, root });
        });
    }
}

async function openChatPromptEditor({ title, icon, description, settingsKey, metaId, tokenLimit, fallback, root }) {
    const content = document.createElement('div');
    content.classList.add('storyline_editor', 'storyline_theme');

    const header = document.createElement('div');
    header.classList.add('storyline_popup_hero');
    const headerIcon = document.createElement('div');
    headerIcon.classList.add('storyline_popup_hero_icon');
    headerIcon.append(makeEl('i', icon));
    const headerMain = document.createElement('div');
    headerMain.classList.add('storyline_popup_hero_main');
    headerMain.append(makeEl('div', 'storyline_popup_hero_title', title));
    headerMain.append(makeEl('div', 'storyline_popup_hero_sub', tr('This chat only \u00b7 limit \u2248 {n} tokens', { n: formatNumber(tokenLimit) })));
    header.append(headerIcon, headerMain);

    const stateChip = document.createElement('div');
    stateChip.classList.add('storyline_state_chip');
    const chipIcon = document.createElement('i');
    chipIcon.className = 'fa-solid fa-shield-halved fa-fw';
    const chipText = document.createElement('span');
    stateChip.append(chipIcon, chipText);

    const banner = document.createElement('div');
    banner.classList.add('storyline_subview_banner');
    const bannerIcon = document.createElement('i');
    bannerIcon.className = icon;
    const bannerText = document.createElement('span');
    bannerText.textContent = description;
    banner.append(bannerIcon, bannerText);

    const field = document.createElement('div');
    field.classList.add('storyline_field');
    const label = document.createElement('span');
    label.classList.add('storyline_field_label');
    label.textContent = tr('Custom instructions for this chat');
    const textarea = document.createElement('textarea');
    textarea.classList.add('storyline_control', 'storyline_textarea', 'storyline_textarea_monospace');
    textarea.rows = 14;
    /* No hard maxLength: the fallback (storyline text) may legitimately be
       longer than the per-chat cap; the cap is enforced on Apply. */
    const overrideValue = getOverrideValue(settingsKey);
    textarea.value = overrideValue || fallback;
    const counter = document.createElement('div');
    counter.classList.add('storyline_token_counter');
    field.append(label, textarea, counter);

    const footer = document.createElement('div');
    footer.classList.add('storyline_subview_footer');
    const reset = makeButton({
        icon: 'fa-solid fa-rotate-left',
        label: tr('Follow the storyline'),
        className: 'menu_button interactable',
    });
    footer.append(reset);

    const updateChip = () => {
        const custom = !!textarea.value.trim() && textarea.value.trim() !== String(fallback).trim();
        stateChip.classList.toggle('storyline_state_chip_custom', custom);
        chipText.textContent = custom ? tr('Custom override for this chat') : tr('Follows the storyline');
    };

    const updateCounter = () => {
        const tokens = estimateTokens(textarea.value);
        counter.textContent = tr('\u2248 {n} / {limit} tokens', { n: formatNumber(tokens), limit: formatNumber(tokenLimit) });
        counter.classList.toggle('storyline_token_counter_over', tokens > tokenLimit);
    };

    textarea.addEventListener('input', () => {
        updateCounter();
        updateChip();
    });
    updateCounter();
    updateChip();

    reset.addEventListener('click', () => {
        textarea.value = '';
        updateCounter();
        updateChip();
        toastr.info(tr('Cleared \u2014 follows the storyline definition. Press Apply to keep it.'), 'Storyline');
    });

    content.append(header, stateChip, banner, field, footer);

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: tr('Apply'),
        cancelButton: tr('Cancel'),
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        onClosing: async (p) => {
            if (p.result !== POPUP_RESULT.AFFIRMATIVE) return true;
            /* U8: "same as the storyline" collapses to '' FIRST — only a real
               override is held to the per-chat limit (a long storyline
               reminder no longer blocks an unchanged Apply). */
            const text = textarea.value.trim();
            const next = text && text !== String(fallback).trim() ? textarea.value : '';
            const tokens = estimateTokens(next);
            if (next && tokens > tokenLimit) {
                toastr.error(tr('Over the limit: \u2248 {n} / {limit} tokens.', { n: formatNumber(tokens), limit: formatNumber(tokenLimit) }), 'Storyline');
                return false;
            }
            setChatSettings({ [settingsKey]: next });
            if (root?.isConnected) {
                updateChatPromptMeta(root, { metaId, settingsKey });
                updatePromptsSummary(root);
            }
            if (next) {
                toastr.success(tr('{title} override applied \u2014 this chat only.', { title }), 'Storyline');
            } else {
                toastr.info(tr('{title} follows the storyline definition again.', { title }), 'Storyline');
            }
            return true;
        },
    });
    await popup.show();
}

function renderNpcList(root) {
    const container = root.querySelector('#storyline_npc_list');
    if (!container) return;
    container.replaceChildren();

    const chatState = readChatState();
    const storyline = chatState ? getStoryline(chatState.storylineId) : null;
    const integrationActive = !!(storyline && chatState && isWorldStateFunctionActive(storyline, chatState) && isWorldStateAvailable());

    const all = listNpcs();
    /* Only stories that use the name generator (or already have NPCs) show
       this section at all. */
    const usesNames = !!storyline?.functions?.entries?.character_name_generator;
    root.querySelector('#storyline_hub_npc_card')?.classList.toggle('storyline_hidden', !usesNames && all.length === 0);
    const term = npcSearchTerm.trim().toLowerCase();
    const npcs = term
        ? all.filter((npc) => [npc.name, npc.gender, npc.culture, npc.style, npc.context].join(' ').toLowerCase().includes(term))
        : all;

    const count = root.querySelector('#storyline_hub_npc_count');
    if (count) {
        count.textContent = term
            ? tr('{shown} / {total} shown', { shown: npcs.length, total: all.length })
            : tr('{n} recorded', { n: all.length });
    }

    if (!npcs.length) {
        container.append(buildEmptyState({
            icon: all.length ? 'fa-solid fa-magnifying-glass' : 'fa-solid fa-user-plus',
            title: all.length ? tr('No NPCs match the search') : tr('No NPCs recorded yet'),
            sub: all.length ? tr('Try another name, trait or clear the search.') : tr('Names created by the Character Name Generator appear here automatically and are reused by the storyteller.'),
        }));
        return;
    }

    for (const npc of npcs) {
        const row = makeEl('div', 'storyline_npc_row');
        const info = makeEl('div', 'storyline_npc_info');

        const name = makeEl('div', 'storyline_npc_name', npc.name);
        if (integrationActive && resolveName(npc.name)) {
            name.append(buildChip({ icon: 'fa-solid fa-heart-pulse', label: tr('tracked'), tone: 'accent' }));
        }

        const attributes = [npc.gender, npc.culture, npc.style].filter(Boolean);
        const when = formatRelativeTime(npc.createdAt);
        if (when) attributes.push(tr('added {when}', { when }));
        info.append(name, makeEl('div', 'storyline_npc_meta', attributes.join(' \u00b7 ') || '\u2014'));

        if (npc.context) info.append(makeEl('div', 'storyline_npc_context', npc.context));

        const remove = makeButton({
            icon: 'fa-solid fa-trash-can',
            title: tr('Remove {name} from the list', { name: npc.name }),
            className: 'menu_button menu_button_icon interactable storyline_npc_remove',
        });
        remove.addEventListener('click', () => runUiAction(remove, async () => {
            /* W4-3: this is narrative memory — confirm before the delete. */
            const confirmed = await callGenericPopup(
                tr('Remove {name} from this chat\'s story memory? This cannot be undone.', { name: escapeHtml(npc.name) }),
                POPUP_TYPE.CONFIRM,
            );
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
            deleteNpc(npc.name);
            /* Stats too — "NPCs recorded" must drop in the same refresh. */
            renderHub({ npcs: true, stats: true });
            updateChatSettingsBadge();
        }));

        row.append(info, remove);
        container.append(row);
    }
}

function renderCast(root, storyline) {
    const container = root.querySelector('#storyline_hub_cast');
    if (!container) return;
    container.replaceChildren();

    const cards = getContext().characters ?? [];
    const chatSettings = getChatSettings();
    const playerMode = chatSettings.userCardMode === 'persona' || chatSettings.userCardMode === 'card' ? chatSettings.userCardMode : 'storyline';
    const playerAvatar = playerMode === 'persona'
        ? ''
        : playerMode === 'card'
            ? String(chatSettings.userCardAvatar ?? '')
            : String(storyline.userCard?.avatar ?? '');
    const playerCard = playerAvatar ? cards.find((card) => card?.avatar === playerAvatar) : null;
    const playerRow = makeEl('div', 'storyline_hub_cast_row storyline_hub_cast_player');
    const playerAvatarBox = makeEl('div', 'storyline_hub_cast_avatar');
    if (playerCard) {
        const img = document.createElement('img');
        img.src = getThumbnailUrl('avatar', playerAvatar);
        img.alt = String(playerCard.name ?? tr('Player'));
        playerAvatarBox.append(img);
    } else {
        playerAvatarBox.append(makeEl('i', 'fa-solid fa-user-astronaut fa-fw'));
    }
    const playerInfo = makeEl('div', 'storyline_hub_cast_info');
    const playerNameRow = makeEl('div', 'storyline_hub_cast_name');
    playerNameRow.append(makeEl('span', '', playerCard?.name ?? (playerAvatar || tr('Persona (default)'))));
    playerNameRow.append(buildChip({ icon: 'fa-solid fa-user', label: tr('Player'), tone: 'gold' }));
    playerInfo.append(playerNameRow);
    const personaName = getContext().name1 ?? 'User';
    playerInfo.append(makeEl('div', 'storyline_hub_cast_meta',
        !playerAvatar
            ? (playerMode === 'storyline'
                ? tr('Persona ({name}) \u2014 storyline has no player card', { name: personaName })
                : tr('Persona ({name}) \u2014 chosen for this chat', { name: personaName }))
            : playerCard
                ? (playerMode === 'card'
                    ? tr('Player character sheet from {avatar} \u2014 chosen for this chat', { avatar: playerAvatar })
                    : tr('Player character sheet from {avatar} \u2014 storyline default', { avatar: playerAvatar }))
                : tr('{avatar} (missing \u2014 persona is used instead)', { avatar: playerAvatar })));
    const changePlayer = makeButton({
        icon: 'fa-solid fa-rotate',
        title: tr('Change the player card for this chat\u2026'),
        className: 'menu_button menu_button_icon interactable storyline_hub_player_change',
    });
    changePlayer.addEventListener('click', () => runUiAction(changePlayer, async () => {
        const picked = await pickPlayerCard({
            defaultAvatar: playerAvatar,
            sub: tr('Change the player card for this chat \u2014 only chats that never chose one follow the storyline default.'),
        });
        if (picked === null) return;
        setChatSettings({ userCardMode: picked ? 'card' : 'persona', userCardAvatar: picked });
        renderHub({ hero: true, cast: true });
    }));
    playerRow.append(playerAvatarBox, playerInfo, changePlayer);
    container.append(playerRow);

    const cast = Array.isArray(storyline.characters) ? storyline.characters : [];
    const castCount = root.querySelector('#storyline_hub_cast_count');
    if (castCount) castCount.textContent = cast.length ? tr('{n} linked', { n: cast.length }) : '';
    if (!cast.length) {
        container.append(buildEmptyState({
            icon: 'fa-solid fa-users',
            title: tr('No characters linked'),
            sub: tr('A storyline works perfectly with zero characters. Link existing SillyTavern cards in the editor to give the world a face.'),
        }));
        return;
    }

    for (const link of cast) {
        const row = makeEl('div', 'storyline_hub_cast_row');

        const avatar = makeEl('div', 'storyline_hub_cast_avatar');
        const avatarUrl = link.avatar ? getThumbnailUrl('avatar', link.avatar) : '';
        if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = String(link.name ?? tr('Character'));
            avatar.append(img);
        } else {
            avatar.append(makeEl('i', 'fa-solid fa-user fa-fw'));
        }

        const info = makeEl('div', 'storyline_hub_cast_info');
        const nameRow = makeEl('div', 'storyline_hub_cast_name');
        nameRow.append(makeEl('span', '', link.name || tr('Unnamed')));
        if (link.alwaysInclude) {
            nameRow.append(buildChip({ icon: 'fa-solid fa-star', label: tr('Always in'), tone: 'gold' }));
        }
        if (link.full) {
            nameRow.append(buildChip({ icon: 'fa-solid fa-book-bookmark', label: tr('Full card'), tone: 'warn' }));
        }
        info.append(nameRow);

        if (Array.isArray(link.aliases) && link.aliases.length) {
            info.append(makeEl('div', 'storyline_hub_cast_meta', tr('aka {names}', { names: link.aliases.join(', ') })));
        }
        if (link.note) {
            info.append(makeEl('div', 'storyline_hub_cast_note', link.note));
        }

        row.append(avatar, info);

        /* Runtime cast add (v0.1.15): seed this card's default state into the
           current chat on demand. Hidden when Character State is absent. */
        if (isWorldStateAvailable()) {
            const seedButton = makeButton({
                icon: 'fa-solid fa-seedling',
                title: tr('Initialize this character\'s default state into the current chat\u2026'),
                className: 'menu_button menu_button_icon interactable storyline_hub_cast_seed',
            });
            seedButton.addEventListener('click', () => runUiAction(seedButton, async () => {
                const name = String(link.name ?? '').trim();
                const probe = await ensureCastMemberState(name);
                if (probe?.ok) {
                    toastr.success(probe.already
                        ? tr('{name} is already tracked in this chat.', { name })
                        : tr('{name}: default state added to this chat.', { name }), 'Storyline');
                } else if (probe?.code === 'NO_STARTING_STATE') {
                    toastr.info(tr('{name}: the card has no default state to add.', { name }), 'Storyline');
                } else if (probe?.code === 'UNKNOWN_ENTITY') {
                    toastr.warning(tr('{name}: card not found (renamed or deleted?).', { name }), 'Storyline');
                } else {
                    toastr.warning(tr('{name}: seeding failed ({code}).', { name, code: probe?.code ?? 'unknown' }), 'Storyline');
                }
            }));
            row.append(seedButton);
        }

        container.append(row);
    }
}

function renderFunctions(root, storyline, chatState) {
    const togglesContainer = root.querySelector('#storyline_functions_toggles');
    if (!togglesContainer) return;
    togglesContainer.replaceChildren();

    const activeFunctions = getActiveFunctionsForChat(storyline, chatState);

    for (const builtIn of BUILT_IN_FUNCTIONS) {
        const entry = storyline?.functions?.entries?.[builtIn.id];
        if (!entry) continue;
        const row = makeEl('div', 'storyline_function_toggle_row');

        const label = makeEl('div', 'storyline_function_toggle_label');
        label.append(
            makeEl('div', 'storyline_function_toggle_name', tr(builtIn.name)),
            makeEl('div', 'storyline_function_toggle_mode', tr(builtIn.description ?? FUNCTION_MODE_LABELS[entry.mode] ?? '')),
        );

        const isRequired = entry.mode === 'required';
        const control = makeButton({
            icon: isRequired ? 'fa-solid fa-lock' : (activeFunctions.some((active) => active.def.id === builtIn.id) ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off'),
            label: isRequired ? tr('Always on') : (activeFunctions.some((active) => active.def.id === builtIn.id) ? tr('On') : tr('Off')),
            title: isRequired ? tr(FUNCTION_MODE_HINTS[entry.mode]) : tr('Toggle {name} for this chat', { name: tr(builtIn.name) }),
            className: 'menu_button interactable storyline_function_toggle',
        });
        if (isRequired) {
            control.classList.add('storyline_function_toggle_locked');
        } else {
            control.setAttribute('aria-pressed', activeFunctions.some((active) => active.def.id === builtIn.id) ? 'true' : 'false');
            control.addEventListener('click', () => {
                /* Read the FRESH state on every click — the render-time
                   activeFunctions snapshot goes stale after the first toggle. */
                const fresh = getActiveFunctionsForChat(storyline, readChatState());
                const willActivate = !fresh.some((active) => active.def.id === builtIn.id);
                setFunctionActive(builtIn.id, willActivate);
                control.replaceChildren(
                    makeEl('i', `${willActivate ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off'} fa-fw`),
                    makeEl('span', '', willActivate ? tr('On') : tr('Off')),
                );
                control.setAttribute('aria-pressed', willActivate ? 'true' : 'false');
                if (hubRoot?.isConnected) renderHero(hubRoot, storyline, readChatState());
                updateChatSettingsBadge();
                toastr.info(willActivate
                    ? tr('{name}: On (applies from the next message)', { name: tr(builtIn.name) })
                    : tr('{name}: Off (applies from the next message)', { name: tr(builtIn.name) }), 'Storyline');
            });
        }

        const notice = buildIntegrationNotice(builtIn.id, { onChanged: () => renderHub({ hero: true, functions: true }) });
        if (notice) {
            label.append(notice);
            row.classList.add('storyline_function_toggle_row_blocked');
        }

        row.append(label, control);
        togglesContainer.append(row);
    }

    root.querySelector('#storyline_hub_functions_card')?.classList.toggle('storyline_hidden', !togglesContainer.children.length);
    root.querySelector('#storyline_functions_warning')?.classList.toggle('storyline_hidden', isFunctionCallingAvailable());
}

function renderFooter(root) {
    const footer = root.querySelector('#storyline_hub_footer');
    if (!footer || footer.childElementCount) return;
    const debug = makeButton({ icon: 'fa-solid fa-bug', label: tr('Prompt debug'), title: tr('See exactly what the AI receives (/storyline debug)'), className: 'menu_button interactable storyline_button' });
    debug.addEventListener('click', () => runUiAction(debug, async () => {
        const { showDebugInfo } = await import('../storyline/commands.js');
        await showDebugInfo();
        if (hubRoot?.isConnected) renderStats(hubRoot, getHubStoryline());
    }));
    const data = makeButton({ icon: 'fa-solid fa-database', label: tr('NPC data'), title: tr('Raw chat-local story data (/storyline data)'), className: 'menu_button interactable storyline_button' });
    data.addEventListener('click', () => runUiAction(data, async () => {
        const { showStorylineData } = await import('../storyline/commands.js');
        await showStorylineData();
    }));
    footer.append(debug, data);
}

/* `sections` (optional) limits the rebuild: { hero, stats, actions,
   perspective, functions, prompts, npcs, cast }. Callers that change one
   slice (NPC delete, player card) pass just that slice; the live refresh
   path only touches hero+stats. null = full rebuild. */
function renderHub(sections = null) {
    if (!hubRoot) return;
    const chatState = readChatState();
    const storyline = chatState ? getStoryline(chatState.storylineId) : null;
    if (!chatState || !storyline) {
        hubPopup?.complete(POPUP_RESULT.CANCELLED);
        return;
    }
    const needs = (key) => !sections || !!sections[key];
    if (needs('hero')) renderHero(hubRoot, storyline, chatState);
    if (needs('stats')) renderStats(hubRoot, storyline);
    if (needs('actions')) renderActions(hubRoot, storyline);
    if (needs('perspective')) renderPerspective(hubRoot);
    if (needs('functions')) renderFunctions(hubRoot, storyline, chatState);
    if (needs('prompts')) renderPrompts(hubRoot, storyline);
    if (needs('npcs')) renderNpcList(hubRoot);
    if (needs('cast')) renderCast(hubRoot, storyline);
    if (needs('footer')) renderFooter(hubRoot);
}

function wireHub(root) {
    wirePerspective(root);
    wireCustomPrompts(root);
    const search = root.querySelector('#storyline_hub_npc_search');
    if (search) {
        search.value = npcSearchTerm;
        /* W3-4: rebuild the list on a short debounce instead of per key. */
        let searchTimer = null;
        search.addEventListener('input', () => {
            npcSearchTerm = String(search.value ?? '');
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchTimer = null;
                renderNpcList(root);
            }, 150);
        });
    }
}

let hubOpening = null;

export function isStoryHubOpen() {
    return !!hubRoot?.isConnected;
}

export async function openChatSettingsPopup() {
    if (!isStorylineChat()) return;
    if (hubRoot?.isConnected) {
        renderHub();
        return;
    }
    /* W4-1 opening race: claim the slot BEFORE the await — a double-click
       while the template loads used to build two DOM roots and two popups,
       and closing popup 1 nulled popup 2's refs. */
    if (hubOpening) return hubOpening;
    hubOpening = (async () => {
        try {
            if (!getHubStoryline()) {
                toastr.warning(tr('The storyline linked to this chat no longer exists. Detach it from the Story Library, or restore the storyline.'), 'Storyline');
                return;
            }
            const content = await renderExtensionTemplateAsync(EXTENSION_FOLDER, 'templates/chat-settings');
            hubRoot = $(content)[0];
            localizeTree(hubRoot);
            npcSearchTerm = '';
            wireHub(hubRoot);
            renderHub();

            hubPopup = new Popup(hubRoot, POPUP_TYPE.TEXT, '', {
                okButton: tr('Close'),
                wide: true,
                large: true,
                allowVerticalScrolling: true,
                /* ST 1.18: popup.js blocks the close on ANY falsy return from
                   onClosing — always return true after clearing the refs. */
                onClosing: () => {
                    hubRoot = null;
                    hubPopup = null;
                    npcSearchTerm = '';
                    return true;
                },
            });
            await hubPopup.show();
        } finally {
            hubOpening = null;
        }
    })();
    return hubOpening;
}
