/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup } from '../../../../../scripts/popup.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { PERSPECTIVE_LABELS } from './constants.js';
import { isStorylineChat, getChatSettings, setChatSettings, readChatState, startStorylineChat, attachStorylineToCurrentChat, detachStorylineFromCurrentChat } from './chat.js';
import { getStorylines, getStoryline } from './storage.js';
import { buildStorylineContext, lastBuildInfo, getPromptWindowTokens } from './context.js';
import { openStorylineManager, updateTopBarEntry, applyUiLanguage } from '../ui/manager.js';
import { refreshChatSettingsButton } from '../ui/chat-settings.js';
import { getStorylineData, STORYLINE_DATA_VARIABLE } from './data.js';
import { seedCastStatesForActiveChat } from './world-state-bridge.js';
import { makeEl, buildChip, makeButton } from '../ui/util.js';
import { estimateTokens } from './characters.js';
import { tr, formatNumber } from './i18n.js';

const PERSPECTIVE_ALIASES = {
    '1': 'first',
    '2': 'second',
    '3': 'third',
    first: 'first',
    second: 'second',
    third: 'third',
};

function findStorylineByQuery(query) {
    const storylines = getStorylines();
    const needle = String(query ?? '').trim().toLowerCase();
    if (!needle) return null;
    return storylines.find((storyline) => storyline.id.toLowerCase() === needle)
        ?? storylines.find((storyline) => storyline.title.toLowerCase() === needle)
        ?? storylines.find((storyline) => storyline.title.toLowerCase().includes(needle))
        ?? null;
}

function buildPopupHero({ icon, title, sub = '', chips = [] }) {
    const hero = makeEl('div', 'storyline_popup_hero');
    const iconBox = makeEl('div', 'storyline_popup_hero_icon');
    iconBox.append(makeEl('i', `fa-solid ${icon} fa-fw`));
    const main = makeEl('div', 'storyline_popup_hero_main');
    main.append(makeEl('div', 'storyline_popup_hero_title', title));
    if (sub) main.append(makeEl('div', 'storyline_popup_hero_sub', sub));
    if (chips.length) {
        const chipRow = makeEl('div', 'storyline_popup_hero_chips');
        chipRow.append(...chips);
        main.append(chipRow);
    }
    hero.append(iconBox, main);
    return hero;
}

export async function showStorylineData() {
    const data = getStorylineData();
    const npcs = Object.entries(data.npcs ?? {});
    const content = makeEl('div', 'storyline_data_view storyline_theme');
    content.append(buildPopupHero({
        icon: 'fa-user-plus',
        title: tr('Story NPCs'),
        sub: tr('{n} recorded in this chat — narrative memory, not character cards.', { n: npcs.length }),
        chips: [buildChip({ icon: 'fa-solid fa-code', label: STORYLINE_DATA_VARIABLE, tone: 'accent' })],
    }));
    content.append(makeEl(
        'div',
        'storyline_popup_note',
        tr('Saved with this chat as a SillyTavern local variable. View raw: /getvar key={key} · Edit: /setvar key={key} <json>', { key: STORYLINE_DATA_VARIABLE }),
    ));

    if (npcs.length) {
        const list = makeEl('div', 'storyline_npc_list');
        for (const [name, npc] of npcs) {
            const row = makeEl('div', 'storyline_npc_row');
            const info = makeEl('div', 'storyline_npc_info');
            info.append(makeEl('div', 'storyline_npc_name', name));
            const attributes = [npc.gender, npc.culture, npc.style].filter(Boolean).join(' \u00b7 ');
            info.append(makeEl('div', 'storyline_npc_meta', attributes || '\u2014'));
            if (npc.context) info.append(makeEl('div', 'storyline_npc_context', String(npc.context)));
            row.append(info);
            list.append(row);
        }
        content.append(list);
    } else {
        const empty = makeEl('div', 'storyline_empty');
        empty.append(makeEl('i', 'fa-solid fa-user-plus storyline_empty_icon'));
        empty.append(makeEl('div', 'storyline_empty_title', tr('No NPCs recorded yet')));
        empty.append(makeEl('div', 'storyline_empty_sub', tr('Names created by the Character Name Generator appear here automatically.')));
        content.append(empty);
    }

    const details = makeEl('details', 'storyline_popup_details');
    details.append(makeEl('summary', '', tr('Raw JSON')));
    details.append(makeEl('pre', 'storyline_popup_pre', JSON.stringify(data, null, 4)));
    content.append(details);

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: tr('Close'), wide: true, large: true, allowVerticalScrolling: true });
    await popup.show();
}

function buildDebugGrid(rows) {
    const grid = makeEl('div', 'storyline_debug_grid');
    for (const [label, value] of rows) {
        const row = makeEl('div', 'storyline_debug_row');
        row.append(makeEl('span', 'storyline_debug_label', label));
        const isFlagged = value && typeof value === 'object';
        row.append(makeEl('b', 'storyline_debug_value' + (isFlagged && value.tone === 'warn' ? ' storyline_debug_value_warn' : ''), isFlagged ? value.text : value));
        grid.append(row);
    }
    return grid;
}

/* Budget bar (v0.2.0): system blocks / history / free room against the REAL
   prompt window of the current API — the same picture the Story Hub shows. */
export function buildBudgetBar(info) {
    const windowTokens = Number(info?.budget?.windowTokens ?? 0);
    const systemTokens = Number(info?.budget?.systemTokens ?? 0);
    const historyTokens = Number(info?.historyTokens ?? 0);
    const total = Number(info?.totalTokensEstimate ?? systemTokens + historyTokens);
    const box = makeEl('div', 'storyline_budget');
    if (!(windowTokens > 0)) {
        box.append(makeEl('div', 'storyline_settings_hint', tr('Prompt window unknown for the current API.')));
        return box;
    }
    const over = total > windowTokens;
    const pct = (value) => `${Math.max(0, Math.min(100, (value / Math.max(windowTokens, total)) * 100)).toFixed(1)}%`;
    const bar = makeEl('div', `storyline_budget_bar${over ? ' storyline_budget_over' : ''}`);
    const system = makeEl('div', 'storyline_budget_seg storyline_budget_system');
    system.style.width = pct(systemTokens);
    system.title = tr('Story blocks ≈ {n} tokens', { n: formatNumber(systemTokens) });
    const history = makeEl('div', 'storyline_budget_seg storyline_budget_history');
    history.style.width = pct(historyTokens);
    history.title = tr('Chat history ≈ {n} tokens', { n: formatNumber(historyTokens) });
    bar.append(system, history);
    const legend = makeEl('div', 'storyline_budget_legend');
    legend.append(
        makeEl('span', 'storyline_budget_key storyline_budget_key_system', tr('Story {n}', { n: formatNumber(systemTokens) })),
        makeEl('span', 'storyline_budget_key storyline_budget_key_history', tr('History {n} ({count} msgs)', { n: formatNumber(historyTokens), count: info.historyMessages })),
        makeEl('span', `storyline_budget_total${over ? ' storyline_warn_text' : ''}`, tr('≈ {total} / {window} tokens', { total: formatNumber(total), window: formatNumber(windowTokens) })),
    );
    box.append(bar, legend);
    if (info.budget?.dropped?.length) {
        box.append(makeEl('div', 'storyline_settings_hint storyline_warn_text', tr('Cut to fit: {blocks}', { blocks: info.budget.dropped.join(' · ') })));
    }
    return box;
}

function buildBlockDetails(title, tokens, text) {
    const details = document.createElement('details');
    details.className = 'storyline_debug_block';
    const summary = document.createElement('summary');
    summary.append(makeEl('span', 'storyline_debug_block_title', title), makeEl('span', 'storyline_debug_block_tokens', `~${formatNumber(tokens)}t`));
    const copy = makeButton({ icon: 'fa-solid fa-copy', title: tr('Copy {title}', { title }), className: 'menu_button menu_button_icon interactable storyline_debug_block_copy' });
    copy.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            toastr.success(tr('{title} copied.', { title }), 'Storyline');
        } catch {
            toastr.warning(tr('Clipboard unavailable.'), 'Storyline');
        }
    });
    summary.append(copy);
    details.append(summary, makeEl('pre', 'storyline_popup_pre', text));
    return details;
}

export async function showDebugInfo() {
    const build = await buildStorylineContext({ type: 'normal' });
    const content = makeEl('div', 'storyline_debug_content storyline_theme');

    if (!build) {
        content.append(buildPopupHero({
            icon: 'fa-bug',
            title: tr('Prompt Debug'),
            sub: isStorylineChat()
                ? tr('The Storyline linked to this chat could not be loaded.')
                : tr('This chat is not a Storyline chat.'),
            chips: [buildChip({
                icon: 'fa-solid fa-circle-info',
                label: isStorylineChat() ? tr('Storyline not loaded') : tr('Not a Storyline chat'),
                tone: 'muted',
            })],
        }));
        const popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: tr('Close'), wide: true, large: true, allowVerticalScrolling: true });
        await popup.show();
        return;
    }

    const info = lastBuildInfo;
    const chips = [
        buildChip({ icon: 'fa-solid fa-layer-group', label: info.sections.length === 1 ? tr('1 block') : tr('{n} blocks', { n: info.sections.length }) }),
    ];
    if (info.worldState?.active) chips.push(buildChip({ icon: 'fa-solid fa-heart-pulse', label: tr('World state'), tone: 'accent' }));
    if (info.dice?.active) chips.push(buildChip({ icon: 'fa-solid fa-dice-d20', label: tr('Dice'), tone: 'accent' }));
    if (info.memoryKeeper?.active) chips.push(buildChip({ icon: 'fa-solid fa-brain', label: info.memoryKeeper.included ? tr('Memories ({n})', { n: info.memoryKeeper.included }) : tr('Memories'), tone: 'accent' }));
    if (info.lorebooks?.entries) chips.push(buildChip({ icon: 'fa-solid fa-book-atlas', label: tr('Lore ({n})', { n: info.lorebooks.entries }), tone: 'accent' }));
    if (info.player?.source === 'card') chips.push(buildChip({ icon: 'fa-solid fa-user-astronaut', label: tr('Player card'), tone: 'accent' }));
    else if (info.player?.fallback) chips.push(buildChip({ icon: 'fa-solid fa-triangle-exclamation', label: tr('Player card missing'), tone: 'warn' }));
    const totalTokens = Number(info.totalTokensEstimate ?? 0);
    const maxContextTokens = Number(info.budget?.windowTokens ?? getPromptWindowTokens() ?? 0);
    if (maxContextTokens > 0 && totalTokens > maxContextTokens) {
        chips.push(buildChip({ icon: 'fa-solid fa-triangle-exclamation', label: tr('Context overflow'), tone: 'warn' }));
    }

    content.append(buildPopupHero({
        icon: 'fa-bug',
        title: tr('Prompt Debug'),
        sub: [info.storylineTitle, tr('perspective: {label}', { label: tr(PERSPECTIVE_LABELS[info.perspective] ?? info.perspective) })].filter(Boolean).join(' · '),
        chips,
    }));

    const budgetCard = makeEl('div', 'storyline_debug_card');
    budgetCard.append(makeEl('div', 'storyline_settings_label', tr('Prompt budget')), buildBudgetBar(info));
    content.append(budgetCard);

    /* Blocks in prompt order — open any to read or copy it. */
    const blocksCard = makeEl('div', 'storyline_debug_card');
    blocksCard.append(makeEl('div', 'storyline_settings_label', tr('Prompt blocks (in order)')));
    for (const section of build.sections) {
        blocksCard.append(buildBlockDetails(section.title, estimateTokens(section.text), section.text));
    }
    const historyText = build.history.map((item) => `${item.isUser ? '[Player]' : '[Story]'} ${item.content}`).join('\n\n');
    const historyTitle = info.budget?.historyTruncated
        ? tr('Chat history — {n} messages (last truncated)', { n: info.historyMessages })
        : tr('Chat history — {n} messages', { n: info.historyMessages });
    blocksCard.append(buildBlockDetails(historyTitle, info.historyTokens, historyText || '(empty)'));
    const tail = build.messages[build.messages.length - 1]?.content ?? '';
    blocksCard.append(buildBlockDetails(tr('Output rules (end of prompt)'), estimateTokens(tail), tail));
    content.append(blocksCard);

    /* Integrations: only what is installed; the rest in one line. */
    const rows = [
        [tr('Player'), `${info.player?.source === 'card' ? `${info.player.name || info.player.avatar}` : '(persona)'} · mode=${info.player?.mode ?? 'storyline'} · ~${info.player?.tokens ?? 0}t${info.player?.fallback ? ` · ${info.player.fallback}` : ''}`],
        [tr('Per-chat overrides'), `style ${info.chatOverrides?.storyteller ? 'CUSTOM' : 'default'} · output reminder ${info.chatOverrides?.outputReminder ? 'CUSTOM' : 'default'}`],
        [tr('Active functions'), info.activeFunctions?.join(', ') || tr('(none)')],
        [tr('Characters in scene'), info.relevantCharacters.join(', ') || tr('(none)')],
    ];
    if (info.missingCharacters.length) rows.push([tr('Missing cards'), { tone: 'warn', text: info.missingCharacters.join(', ') }]);
    if (info.budget?.skippedCharacters?.length) rows.push([tr('Over budget (skipped)'), info.budget.skippedCharacters.join(', ')]);
    rows.push([tr('NPC archive'), tr('{n} (chat variable {key})', { n: Object.keys(getStorylineData().npcs ?? {}).length, key: STORYLINE_DATA_VARIABLE })]);
    if (info.lorebooks?.books?.length) {
        rows.push([tr('Lorebooks'), `${info.lorebooks.books.map((book) => `${book.name}: ${book.missing ? 'MISSING' : `${book.injected}/${book.entries}`}`).join(' · ')} · ~${info.lorebooks.tokens}t`]);
    }
    const notInstalled = [];
    if (info.worldState?.available) {
        rows.push([tr('World state'), `active=${info.worldState.active ? 'YES' : 'NO'} · calls ${info.worldState.bridgeCalls ?? 0} · ~${info.worldState.stateTokens ?? 0}t`]);
        if (info.worldState.active) {
            rows.push(['  ' + tr('Player sheet'), info.worldState.userState ?? tr('(none)')]);
            rows.push(['  ' + tr('Entities in prompt'), info.worldState.injectedEntities?.join(', ') || tr('(none)')]);
            rows.push(['  ' + tr('Directory'), info.worldState.directory?.length ? `${info.worldState.directory.length}: ${info.worldState.directory.join(', ')}` : tr('(none)')]);
            rows.push(['  ' + tr('Scene · time'), `${info.worldState.scene ?? tr('(none)')} · ${info.worldState.time ? `${info.worldState.time.formatted} (${info.worldState.time.calendar})` : (info.worldState.timeUninitialized ? tr('uninitialized') : tr('(none)'))}`]);
            if (info.worldState.noStartingState?.length) rows.push(['  ' + tr('No starting state'), info.worldState.noStartingState.join(', ')]);
            if (info.worldState.unresolved?.length) rows.push(['  ' + tr('Unresolved links'), info.worldState.unresolved.join(', ')]);
            if (info.worldState.errors?.length) rows.push(['  ' + tr('Bridge errors'), { tone: 'warn', text: info.worldState.errors.join('; ') }]);
        }
    } else notInstalled.push('Character State');
    if (info.dice?.available) {
        rows.push(['Dice Weaver', `active=${info.dice.active ? 'YES' : 'NO'} · mode=${info.dice.mode ?? '(n/a)'} · tools=${info.dice.toolSupported ? 'YES' : 'NO'} · forced=${info.dice.forced ? 'YES' : 'NO'}${info.dice.trigger ? ` · trigger=${info.dice.trigger}` : ''}`]);
    } else notInstalled.push('Dice Weaver');
    if (info.memoryKeeper?.available) {
        rows.push(['Memory Weaver', `active=${info.memoryKeeper.active ? 'YES' : 'NO'} · entries=${info.memoryKeeper.count ?? 0} · included=${info.memoryKeeper.included ?? 0}${info.memoryKeeper.reason ? ` · ${info.memoryKeeper.reason}` : ''}`]);
    } else notInstalled.push('Memory Weaver');
    if (notInstalled.length) rows.push([tr('Unavailable'), tr('{list} (missing or disabled)', { list: notInstalled.join(', ') })]);
    rows.push([tr('Host card'), tr('{card} — never injected', { card: `${info.hostCharacter?.avatar ?? tr('(none)')}${info.hostCharacter?.internal ? ` ${tr('(internal)')}` : ''}` })]);

    const runtimeCard = makeEl('div', 'storyline_debug_card');
    runtimeCard.append(makeEl('div', 'storyline_settings_label', tr('Runtime')), buildDebugGrid(rows));
    content.append(runtimeCard);

    const promptHead = makeEl('div', 'storyline_debug_prompt_head');
    const copy = makeButton({ icon: 'fa-solid fa-copy', label: tr('Copy full prompt'), className: 'menu_button interactable storyline_debug_copy' });
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(build.flatten);
            toastr.success(tr('Full prompt copied.'), 'Storyline');
        } catch {
            toastr.warning(tr('Clipboard unavailable — the prompt is printed to the console.'), 'Storyline');
        }
    });
    promptHead.append(copy);
    content.append(promptHead);

    console.log('[Storyline] Built prompt:', build.flatten);

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: tr('Close'), wide: true, large: true, allowVerticalScrolling: true });
    await popup.show();
}

export function registerSlashCommands() {
    const context = getContext();
    context.SlashCommandParser.addCommandObject(context.SlashCommand.fromProps({
        name: 'storyline',
        callback: async (_namedArgs, value) => {
            const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
            const action = (parts.shift() ?? 'status').toLowerCase();
            const argument = parts.join(' ');
            switch (action) {
                case 'status': {
                    if (!isStorylineChat()) {
                        toastr.info(tr('This chat is not a Storyline chat.'), 'Storyline');
                        break;
                    }
                    const state = readChatState();
                    const settings = getChatSettings();
                    const storyline = getStoryline(state.storylineId);
                    const scenario = storyline?.firstMessages?.find((entry) => entry.id === state.selectedScenarioId)?.title ?? tr('(none)');
                    toastr.info(
                        [
                            storyline?.title ?? tr('(missing storyline {id})', { id: state.storylineId }),
                            tr('Perspective: {label}', { label: tr(PERSPECTIVE_LABELS[settings.perspective]) }),
                            tr('Opening: {title}', { title: scenario }),
                        ].join('\n'),
                        'Storyline',
                    );
                    break;
                }
                case 'open':
                    await openStorylineManager();
                    break;
                case 'new': {
                    const storyline = findStorylineByQuery(argument);
                    if (!storyline) {
                        toastr.warning(tr('Storyline not found. Use /storyline open to manage storylines.'), 'Storyline');
                        break;
                    }
                    await startStorylineChat(storyline.id);
                    refreshChatSettingsButton();
                    updateTopBarEntry();
                    break;
                }
                case 'attach': {
                    const storyline = findStorylineByQuery(argument);
                    if (!storyline) {
                        toastr.warning(tr('Storyline not found. Use /storyline open to manage storylines.'), 'Storyline');
                        break;
                    }
                    /* Mirror the manager flow's guard: silently replacing an
                       existing attachment destroys per-chat settings (custom
                       prompts, function toggles, player-card choice). */
                    if (isStorylineChat() && readChatState()?.storylineId !== storyline.id) {
                        const confirmed = await callGenericPopup(tr('This chat already has a Storyline attached. Replace it?'), POPUP_TYPE.CONFIRM);
                        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) break;
                    }
                    await attachStorylineToCurrentChat(storyline.id);
                    refreshChatSettingsButton();
                    updateTopBarEntry();
                    break;
                }
                case 'detach': {
                    if (!isStorylineChat()) {
                        toastr.info(tr('This chat is not a Storyline chat.'), 'Storyline');
                        break;
                    }
                    /* Same confirm as the Hub/Library buttons: detaching drops
                       the per-chat settings (prompts, toggles, player card). */
                    const confirmed = await callGenericPopup(tr('Detach this storyline from the chat? The messages stay, but the chat behaves like a normal chat again.'), POPUP_TYPE.CONFIRM);
                    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) break;
                    await detachStorylineFromCurrentChat();
                    refreshChatSettingsButton();
                    updateTopBarEntry();
                    break;
                }
                case 'perspective': {
                    const target = PERSPECTIVE_ALIASES[String(argument).trim().toLowerCase()];
                    if (!target) {
                        toastr.warning(tr('Usage: /storyline perspective first|second|third (or 1|2|3)'), 'Storyline');
                        break;
                    }
                    if (!isStorylineChat()) {
                        toastr.warning(tr('This chat is not a Storyline chat.'), 'Storyline');
                        break;
                    }
                    setChatSettings({ perspective: target });
                    toastr.info(tr('Perspective: {label}', { label: tr(PERSPECTIVE_LABELS[target]) }), 'Storyline');
                    break;
                }
                case 'seedcast': {
                    if (!isStorylineChat()) {
                        toastr.warning(tr('This chat is not a Storyline chat.'), 'Storyline');
                        break;
                    }
                    const result = await seedCastStatesForActiveChat({ force: true, requireFunction: false });
                    if (result?.ok) {
                        const failed = Array.isArray(result.failed) && result.failed.length
                            ? `\n${tr('Failed: {list}', { list: result.failed.join(', ') })}`
                            : '';
                        toastr.info(`${tr('Cast seed: {n} card(s) ready.', { n: result.seeded.length })}${failed}`, 'Storyline');
                    } else {
                        toastr.warning(tr('Cast seed skipped: {reason}', { reason: result?.skipped ?? result?.error ?? tr('unknown') }), 'Storyline');
                    }
                    break;
                }
                case 'lang':
                case 'language': {
                    const language = String(argument).trim().toLowerCase();
                    if (!await applyUiLanguage(language)) {
                        toastr.warning(tr('Usage: /storyline lang en|vi'), 'Storyline');
                    }
                    break;
                }
                case 'debug':
                    await showDebugInfo();
                    break;
                case 'data':
                    await showStorylineData();
                    break;
                default:
                    toastr.warning(tr('Unknown action: {action}', { action }), 'Storyline');
                    break;
            }
            return '';
        },
        helpString: tr('Storyline extension. Usage: /storyline [status|open|new <title|id>|attach <title|id>|detach|perspective 1|2|3|seedcast|data|debug|lang en|vi]'),
    }));
}
