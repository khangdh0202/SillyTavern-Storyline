/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { renderExtensionTemplateAsync } from '../../../../../scripts/extensions.js';
import { EXTENSION_FOLDER } from '../storyline/constants.js';
import { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup } from '../../../../../scripts/popup.js';
import { eventSource, event_types } from '../../../../../script.js';
import { getStorylines, getStoryline, deleteStoryline, duplicateStoryline, importStoryline, exportStoryline, countStorylines } from '../storyline/storage.js';
import { readChatState, startStorylineChat, attachStorylineToCurrentChat, detachStorylineFromCurrentChat } from '../storyline/chat.js';
import { refreshChatSettingsButton, openChatSettingsPopup, isStoryHubOpen } from './chat-settings.js';
import { openStorylineEditor } from './editor.js';
import { downloadStorylineJson, pickJsonFile } from './files.js';
import { tr, localizeTree, getUiLanguage, setUiLanguage, UI_LANGUAGES } from '../storyline/i18n.js';
import { makeEl, formatRelativeTime, buildChip, buildEmptyState, makeButton, upgradeControl, runUiAction, safeBannerDataUrl, escapeHtml } from './util.js';

let managerPopup = null;
let managerRoot = null;
let managerListEl = null;
let managerCountEl = null;
let managerHeroEl = null;
let managerSearchEl = null;
let managerFilterEl = null;
let searchTerm = '';
let categoryFilter = '';
let topBarEventsWired = false;

function getActiveStoryline() {
    const chatState = readChatState();
    return chatState ? getStoryline(chatState.storylineId) : null;
}

function bannerOf(storyline) {
    return safeBannerDataUrl(storyline?.banner);
}

function makeAction(icon, label, extraClass = '') {
    return makeButton({
        icon,
        label,
        title: label,
        className: `menu_button interactable storyline_button storyline_mgr_action${extraClass ? ` ${extraClass}` : ''}`,
    });
}

function openEditor(storylineId) {
    openStorylineEditor(storylineId, {
        onSaved: (saved) => refreshManager({ highlightId: saved?.id }),
    });
}

function refreshManager({ highlightId = null } = {}) {
    renderFilterOptions();
    renderHero();
    renderList({ highlightId });
    updateTopBarEntry();
}

/* ---------------------------------------------------------------------------
 * Active strip (v0.2.0): ONE compact line for the current chat — the old
 * full-height hero pushed the library below the fold on small screens.
 * ------------------------------------------------------------------------ */

function renderHero() {
    if (!managerHeroEl) return;
    managerHeroEl.replaceChildren();
    const active = getActiveStoryline();
    const strip = makeEl('div', `storyline_mgr_strip${active ? ' storyline_mgr_strip_active' : ''}`);

    const thumb = makeEl('div', 'storyline_mgr_strip_thumb');
    const banner = active ? bannerOf(active) : '';
    if (banner) {
        const img = document.createElement('img');
        img.src = banner;
        img.alt = '';
        thumb.append(img);
    } else {
        thumb.append(makeEl('i', `fa-solid ${active ? 'fa-book-open' : 'fa-comments'} fa-fw`));
    }

    const text = makeEl('div', 'storyline_mgr_strip_text');
    const actions = makeEl('div', 'storyline_mgr_strip_actions');

    if (active) {
        text.append(makeEl('div', 'storyline_mgr_strip_eyebrow', tr('Now playing')));
        const chatName = String($('#selected_chat_pole').val() ?? '').trim();
        text.append(makeEl('div', 'storyline_mgr_strip_title', chatName ? `${active.title} · ${chatName}` : active.title));

        const hub = makeAction('fa-solid fa-sliders', tr('Hub'));
        hub.title = tr('Open the Story Hub for this chat');
        hub.addEventListener('click', () => {
            /* Opened from the Hub already: reveal it by closing the Library. */
            if (isStoryHubOpen()) managerPopup?.complete(POPUP_RESULT.CANCELLED);
            else openChatSettingsPopup();
        });
        const newSession = makeAction('fa-solid fa-arrow-rotate-right', tr('New session'));
        newSession.addEventListener('click', () => runUiAction(newSession, async () => {
            const confirmed = await callGenericPopup(
                tr('Start a new session of "{title}"? The current chat stays saved.', { title: escapeHtml(active.title) }),
                POPUP_TYPE.CONFIRM,
            );
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
            if (await startStorylineChat(active.id)) {
                refreshChatSettingsButton();
                refreshManager();
                await managerPopup?.complete(POPUP_RESULT.AFFIRMATIVE);
            }
        }));
        const detach = makeAction('fa-solid fa-link-slash', tr('Detach'), ' storyline_mgr_action_danger');
        detach.addEventListener('click', () => runUiAction(detach, async () => {
            const confirmed = await callGenericPopup(
                tr('Detach this storyline from the chat? The messages stay, but the chat behaves like a normal chat again.'),
                POPUP_TYPE.CONFIRM,
            );
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
            await detachStorylineFromCurrentChat();
            refreshChatSettingsButton();
            refreshManager();
        }));
        actions.append(hub, newSession, detach);
    } else {
        text.append(makeEl('div', 'storyline_mgr_strip_eyebrow', tr('Current chat')));
        text.append(makeEl('div', 'storyline_mgr_strip_title', tr('Normal chat — no storyline attached')));
        const attach = makeAction('fa-solid fa-link', tr('Attach…'));
        attach.title = tr('Attach a storyline to the current chat (messages stay as history)');
        attach.addEventListener('click', () => onAttachClick());
        actions.append(attach);
    }

    strip.append(thumb, text, actions);
    managerHeroEl.append(strip);
}

/* ---------------------------------------------------------------------------
 * Library list: search + category filter + rich rows.
 * ------------------------------------------------------------------------ */

const categoryOf = (storyline) => String(storyline?.category ?? '').trim();

function renderFilterOptions() {
    if (!managerFilterEl) return;
    const categories = [...new Set(getStorylines().map(categoryOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    managerFilterEl.replaceChildren();
    const all = makeEl('option', '', tr('All categories'));
    all.value = '';
    managerFilterEl.append(all);
    for (const category of categories) {
        const option = makeEl('option', '', category);
        option.value = category;
        managerFilterEl.append(option);
    }
    managerFilterEl.value = categories.includes(categoryFilter) ? categoryFilter : '';
    categoryFilter = managerFilterEl.value;
    managerFilterEl.classList.toggle('storyline_hidden', categories.length < 2);
}

function closeRowMenus(except = null) {
    managerListEl?.querySelectorAll('.storyline_row_menu:not(.storyline_hidden)').forEach((menu) => {
        if (menu !== except) {
            menu.classList.add('storyline_hidden');
            menu.closest('.storyline_mgr_row')?.querySelector('[data-storyline-action="menu"]')?.setAttribute('aria-expanded', 'false');
        }
    });
}

/* W3-4: ONE delegated listener handles every row action — rows are rebuilt
   on each keystroke/filter change, so per-row listeners were wasted work.
   The row carries the storyline id; the handler resolves it fresh so the
   action always sees the current data. */
function handleRowAction(action, storyline, buttonEl) {
    if (action !== 'menu') closeRowMenus();
    switch (action) {
        case 'menu': {
            const menu = buttonEl.closest('.storyline_mgr_row')?.querySelector('.storyline_row_menu');
            if (!menu) return;
            const opening = menu.classList.contains('storyline_hidden');
            closeRowMenus(menu);
            menu.classList.toggle('storyline_hidden', !opening);
            buttonEl.setAttribute('aria-expanded', opening ? 'true' : 'false');
            if (opening) menu.querySelector('button')?.focus();
            break;
        }
        case 'start':
            runUiAction(buttonEl, async () => {
                if (await startStorylineChat(storyline.id)) {
                    refreshChatSettingsButton();
                    refreshManager();
                    await managerPopup?.complete(POPUP_RESULT.AFFIRMATIVE);
                }
            });
            break;
        case 'edit':
            openEditor(storyline.id);
            break;
        case 'export':
            downloadStorylineJson(exportStoryline(storyline.id));
            break;
        case 'duplicate': {
            const copy = duplicateStoryline(storyline.id);
            if (copy) {
                toastr.success(tr('Duplicated as "{title}".', { title: copy.title }), 'Storyline');
                refreshManager({ highlightId: copy.id });
            }
            break;
        }
        case 'delete':
            runUiAction(buttonEl, async () => {
                const confirmed = await callGenericPopup(
                    tr('Delete storyline "{title}"? This cannot be undone. Chats attached to it will fall back to normal behavior.', { title: escapeHtml(storyline.title) }),
                    POPUP_TYPE.CONFIRM,
                );
                if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
                deleteStoryline(storyline.id);
                if (readChatState()?.storylineId === storyline.id) {
                    await detachStorylineFromCurrentChat();
                    refreshChatSettingsButton();
                }
                refreshManager();
            });
            break;
    }
}

function makeMenuItem(action, icon, label, danger = false) {
    const item = makeButton({
        icon,
        label,
        className: `storyline_row_menu_item${danger ? ' storyline_row_menu_item_danger' : ''}`,
    });
    item.dataset.storylineAction = action;
    item.setAttribute('role', 'menuitem');
    return item;
}

function buildListRow(storyline, { active }) {
    const row = makeEl('div', `storyline_list_row storyline_mgr_row${active ? ' storyline_mgr_row_active' : ''}`);
    row.dataset.storylineId = storyline.id;

    /* The card body opens the editor — the most common action besides Play. */
    const open = makeEl('div', 'storyline_mgr_row_open');
    open.dataset.storylineAction = 'edit';
    upgradeControl(open, { label: tr('Edit {title}', { title: storyline.title }) });
    open.title = tr('Edit storyline');

    const thumb = makeEl('div', 'storyline_list_icon storyline_mgr_thumb');
    const banner = bannerOf(storyline);
    if (banner) {
        const img = document.createElement('img');
        img.src = banner;
        img.alt = '';
        img.loading = 'lazy';
        thumb.append(img);
    } else {
        thumb.append(makeEl('i', 'fa-solid fa-book-open fa-fw'));
    }

    const info = makeEl('div', 'storyline_list_info');
    const title = makeEl('div', 'storyline_list_title');
    title.append(makeEl('span', 'storyline_mgr_title_text', storyline.title));
    if (active) title.append(buildChip({ icon: 'fa-solid fa-circle', label: tr('Playing'), tone: 'good' }));

    const metaParts = [];
    if (categoryOf(storyline)) metaParts.push(categoryOf(storyline));
    if (storyline.characters.length) metaParts.push(tr('{n} cast', { n: storyline.characters.length }));
    const openingCount = storyline.firstMessages.length;
    metaParts.push(openingCount === 1 ? tr('1 opening') : tr('{n} openings', { n: openingCount }));
    const functionCount = Object.keys(storyline.functions?.entries ?? {}).length;
    if (functionCount) metaParts.push(functionCount === 1 ? tr('1 function') : tr('{n} functions', { n: functionCount }));
    const modified = formatRelativeTime(storyline.metadata?.modified);
    if (modified) metaParts.push(tr('edited {time}', { time: modified }));
    info.append(title, makeEl('div', 'storyline_list_meta', metaParts.join(' · ')));

    const pitch = String(storyline.plotSummary ?? '').trim();
    if (pitch) info.append(makeEl('div', 'storyline_mgr_pitch', pitch));

    open.append(thumb, info);

    const actions = makeEl('div', 'storyline_list_actions');
    const start = makeButton({
        icon: 'fa-solid fa-play',
        label: tr('Play'),
        title: tr('Start a new session'),
        className: 'menu_button interactable storyline_button storyline_button_primary storyline_mgr_start',
    });
    start.dataset.storylineAction = 'start';

    const more = makeButton({
        icon: 'fa-solid fa-ellipsis',
        title: tr('More actions'),
        className: 'menu_button menu_button_icon interactable storyline_mgr_more',
    });
    more.dataset.storylineAction = 'menu';
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');

    const menu = makeEl('div', 'storyline_row_menu storyline_hidden');
    menu.setAttribute('role', 'menu');
    menu.append(
        makeMenuItem('edit', 'fa-solid fa-pen-to-square', tr('Edit')),
        makeMenuItem('duplicate', 'fa-solid fa-clone', tr('Duplicate')),
        makeMenuItem('export', 'fa-solid fa-file-export', tr('Export JSON')),
        makeMenuItem('delete', 'fa-solid fa-trash-can', tr('Delete'), true),
    );

    actions.append(start, more, menu);
    row.append(open, actions);
    return row;
}

function renderList({ highlightId = null } = {}) {
    if (!managerListEl) return;
    managerListEl.replaceChildren();
    const all = getStorylines();
    const term = searchTerm.trim().toLowerCase();
    const filtered = all.filter((storyline) => {
        if (categoryFilter && categoryOf(storyline) !== categoryFilter) return false;
        if (!term) return true;
        return `${storyline.title} ${categoryOf(storyline)} ${storyline.plotSummary ?? ''}`.toLowerCase().includes(term);
    });

    if (managerCountEl) {
        managerCountEl.textContent = !all.length ? '' : filtered.length === all.length ? String(all.length) : `${filtered.length}/${all.length}`;
    }

    if (!filtered.length) {
        const filtering = all.length > 0;
        const empty = buildEmptyState({
            icon: filtering ? 'fa-solid fa-magnifying-glass' : 'fa-solid fa-book-open',
            title: filtering ? tr('No storylines match') : tr('Your story library is empty'),
            sub: filtering
                ? tr('Try a different search or category.')
                : tr('A storyline is a world + a narrator: write the premise, add an opening, and press Play. Characters and extras are optional.'),
        });
        const emptyActions = makeEl('div', 'storyline_empty_actions');
        if (filtering) {
            const clear = makeButton({ icon: 'fa-solid fa-rotate', label: tr('Reset filters') });
            clear.addEventListener('click', () => {
                searchTerm = '';
                categoryFilter = '';
                if (managerSearchEl) managerSearchEl.value = '';
                renderFilterOptions();
                renderList();
            });
            emptyActions.append(clear);
        } else {
            const create = makeButton({ icon: 'fa-solid fa-plus', label: tr('Create a storyline'), className: 'menu_button interactable storyline_button storyline_button_primary' });
            create.addEventListener('click', () => openEditor(null));
            const importButton = makeButton({ icon: 'fa-solid fa-file-import', label: tr('Import JSON') });
            importButton.addEventListener('click', () => onImportClick());
            emptyActions.append(create, importButton);
        }
        empty.append(emptyActions);
        managerListEl.append(empty);
        return;
    }

    const activeStoryline = getActiveStoryline();
    let highlighted = null;
    for (const storyline of filtered) {
        const row = buildListRow(storyline, { active: activeStoryline?.id === storyline.id });
        if (highlightId && storyline.id === highlightId) {
            row.classList.add('storyline_row_flash');
            highlighted = row;
        }
        managerListEl.append(row);
    }
    highlighted?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------------------------------------------------------------------------
 * Import / attach flows.
 * ------------------------------------------------------------------------ */

async function onImportClick() {
    const jsonText = await pickJsonFile();
    if (jsonText === null) return;
    const result = importStoryline(jsonText);
    if (result.ok) {
        toastr.success(tr('Imported storyline "{title}".', { title: result.storyline.title }), 'Storyline');
    } else {
        toastr.error(result.error ?? tr('Import failed.'), 'Storyline');
    }
    refreshManager({ highlightId: result.ok ? result.storyline.id : null });
}

async function onAttachClick() {
    const selectStoryline = async () => {
        const storylines = getStorylines();
        if (!storylines.length) {
            toastr.warning(tr('No storylines available. Create or import one first.'), 'Storyline');
            return null;
        }
        if (storylines.length === 1) return storylines[0];
        const content = document.createElement('div');
        content.classList.add('storyline_scenario_picker', 'storyline_theme');
        const hero = makeEl('div', 'storyline_popup_hero');
        const heroIcon = makeEl('div', 'storyline_popup_hero_icon');
        heroIcon.innerHTML = '<i class="fa-solid fa-link fa-fw"></i>';
        const heroMain = makeEl('div', 'storyline_popup_hero_main');
        heroMain.append(makeEl('div', 'storyline_popup_hero_title', tr('Attach a storyline')));
        heroMain.append(makeEl('div', 'storyline_popup_hero_sub', tr('Pick the storyline to attach to this chat — existing messages stay as history.')));
        hero.append(heroIcon, heroMain);
        content.append(hero);
        let popup;
        for (const storyline of storylines) {
            const item = makeEl('div', 'storyline_scenario_item menu_button interactable');
            upgradeControl(item, { label: tr('Attach {title}', { title: storyline.title }) });
            const head = makeEl('div', 'storyline_scenario_head');
            head.append(makeEl('i', 'fa-solid fa-book-open storyline_scenario_icon'));
            head.append(makeEl('div', 'storyline_scenario_title', storyline.title));
            const metaParts = [];
            if (storyline.category) metaParts.push(storyline.category);
            metaParts.push(tr('{n} cast', { n: storyline.characters.length }));
            const openingCount = storyline.firstMessages.length;
            metaParts.push(openingCount === 1 ? tr('1 opening') : tr('{n} openings', { n: openingCount }));
            const preview = String(storyline.plotSummary ?? '').trim();
            item.append(head, makeEl('div', 'storyline_scenario_preview', [metaParts.join(' \u00b7 '), preview].filter(Boolean).join(' \u2014 ')));
            item.addEventListener('click', () => popup?.complete(storyline.id));
            content.append(item);
        }
        popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: false, cancelButton: tr('Cancel'), wide: true, allowVerticalScrolling: true });
        const result = await popup.show();
        return storylines.find((storyline) => storyline.id === result) ?? null;
    };

    const storyline = await selectStoryline();
    if (!storyline) return;
    if (readChatState()) {
        const confirmed = await callGenericPopup(tr('This chat already has a Storyline attached. Replace it?'), POPUP_TYPE.CONFIRM);
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
    }
    if (await attachStorylineToCurrentChat(storyline.id)) {
        refreshChatSettingsButton();
        refreshManager();
    }
}

/* ---------------------------------------------------------------------------
 * Entry points.
 * ------------------------------------------------------------------------ */

let managerOpening = null;

export function isStorylineManagerOpen() {
    return !!managerRoot?.isConnected;
}

export async function openStorylineManager() {
    if (managerRoot?.isConnected) return;
    /* W4-1 opening race: claim the slot BEFORE the await so a double-click
       while the template loads cannot build two roots/popups (the later one
       used to overwrite the refs and orphan the earlier popup). */
    if (managerOpening) return managerOpening;
    managerOpening = (async () => {
        try {
            const content = await renderExtensionTemplateAsync(EXTENSION_FOLDER, 'templates/manager');
            managerRoot = $(content)[0];
            localizeTree(managerRoot);
            managerListEl = managerRoot.querySelector('#storyline_mgr_list');
            managerCountEl = managerRoot.querySelector('#storyline_mgr_count');
            managerHeroEl = managerRoot.querySelector('#storyline_mgr_hero');
            managerSearchEl = managerRoot.querySelector('#storyline_mgr_search');
            managerFilterEl = managerRoot.querySelector('#storyline_mgr_filter');
            searchTerm = '';
            categoryFilter = '';

            if (managerSearchEl) {
                managerSearchEl.value = '';
                /* W3-4: rebuild the list on a short debounce, not per key. */
                let searchTimer = null;
                managerSearchEl.addEventListener('input', () => {
                    searchTerm = String(managerSearchEl.value ?? '');
                    if (searchTimer) clearTimeout(searchTimer);
                    searchTimer = setTimeout(() => {
                        searchTimer = null;
                        renderList();
                    }, 150);
                });
            }
            if (managerFilterEl) {
                managerFilterEl.addEventListener('change', () => {
                    categoryFilter = String(managerFilterEl.value ?? '');
                    renderList();
                });
            }
            /* W3-4: one delegated listener for all row actions. */
            managerListEl?.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const actionEl = target.closest('[data-storyline-action]');
                if (!actionEl) {
                    closeRowMenus();
                    return;
                }
                const row = actionEl.closest('[data-storyline-id]');
                const storyline = row ? getStoryline(row.dataset.storylineId) : null;
                if (!storyline) return;
                handleRowAction(String(actionEl.dataset.storylineAction ?? ''), storyline, actionEl);
            });

            /* Row menus: click anywhere else / Escape closes them. */
            managerRoot.addEventListener('click', (event) => {
                if (!(event.target instanceof Element)) return;
                if (!event.target.closest('.storyline_row_menu, [data-storyline-action="menu"]')) closeRowMenus();
            });
            managerRoot.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape') return;
                if (managerListEl?.querySelector('.storyline_row_menu:not(.storyline_hidden)')) {
                    event.stopPropagation();
                    event.preventDefault();
                    closeRowMenus();
                }
            }, true);

            const newButton = managerRoot.querySelector('.storyline_act_new');
            if (newButton) {
                upgradeControl(newButton, { label: tr('New Storyline') });
                newButton.addEventListener('click', () => openEditor(null));
            }
            const importButton = managerRoot.querySelector('.storyline_act_import');
            if (importButton) {
                upgradeControl(importButton, { label: tr('Import JSON') });
                importButton.addEventListener('click', () => runUiAction(importButton, () => onImportClick()));
            }
            const languageSelect = managerRoot.querySelector('#storyline_mgr_lang');
            if (languageSelect) {
                for (const [code, name] of Object.entries(UI_LANGUAGES)) {
                    const option = document.createElement('option');
                    option.value = code;
                    option.textContent = name;
                    languageSelect.append(option);
                }
                languageSelect.value = getUiLanguage();
                languageSelect.addEventListener('change', () => void applyUiLanguage(languageSelect.value));
            }

            refreshManager();

            /* Shell layout (v0.2.0): header + toolbar stay fixed, only the
               list scrolls — no popup-level vertical scrolling. */
            managerPopup = new Popup(managerRoot, POPUP_TYPE.TEXT, '', {
                okButton: tr('Close'),
                wide: true,
                large: true,
                /* ST 1.18: popup.js blocks the close on ANY falsy return from
                   onClosing — always return true after clearing the refs. */
                onClosing: () => {
                    managerRoot = null;
                    managerListEl = null;
                    managerCountEl = null;
                    managerHeroEl = null;
                    managerSearchEl = null;
                    managerFilterEl = null;
                    managerPopup = null;
                    return true;
                },
            });
            await managerPopup.show();
        } finally {
            managerOpening = null;
        }
    })();
    return managerOpening;
}

/* Switch the Storyline UI language. Strings are baked in at render time, so
   the Library is closed and reopened; the wand and top-bar entries are
   relabelled in place. Other open Storyline windows pick it up on reopen. */
export async function applyUiLanguage(language) {
    if (!setUiLanguage(language)) return false;
    const wandItem = document.querySelector('#storyline_menu_item');
    if (wandItem) {
        wandItem.setAttribute('aria-label', tr('Storylines'));
        const label = wandItem.querySelector('span');
        if (label) label.textContent = tr('Storylines');
    }
    updateTopBarEntry();
    toastr.info(tr('Language changed — reopening Storyline windows.'), 'Storyline');
    if (managerRoot?.isConnected) {
        await managerPopup?.complete(POPUP_RESULT.CANCELLED);
        await openStorylineManager();
    }
    return true;
}

export function addWandMenuEntry() {
    let attempts = 0;
    const tryAdd = () => {
        const menu = document.querySelector('#extensionsMenu');
        if (!menu) {
            if (++attempts < 40) setTimeout(tryAdd, 250);
            return;
        }
        if (document.querySelector('#storyline_menu_item')) return;
        const item = document.createElement('div');
        item.id = 'storyline_menu_item';
        item.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
        upgradeControl(item, { label: tr('Storylines') });
        const icon = document.createElement('i');
        icon.classList.add('fa-solid', 'fa-book-open');
        const label = document.createElement('span');
        label.textContent = tr('Storylines');
        item.append(icon, label);
        item.addEventListener('click', () => {
            $('#extensionsMenu').fadeOut(250);
            openStorylineManager();
        });
        menu.append(item);
        console.log('[Storyline] Wand menu entry added');
    };
    tryAdd();
}

/* Exported so start/attach/detach flows outside this module (commands.js,
   chat-settings.js hub) can refresh the top-bar chip immediately — the
   CHAT_CHANGED subscription alone is stale for programmatic flows, because
   CHAT_CHANGED fires BEFORE chat metadata exists (same race as the cast seed). */
export function updateTopBarEntry() {
    const button = document.getElementById('storyline_topbar_button');
    if (!button) return;
    const count = countStorylines();
    const badge = button.querySelector('.storyline_topbar_badge');
    if (badge) {
        badge.textContent = String(count);
        badge.classList.toggle('storyline_hidden', count === 0);
    }
    const active = getActiveStoryline();
    button.classList.toggle('storyline_topbar_active', !!active);
    button.title = active ? tr('Storyline — {title}', { title: active.title }) : tr('Storylines');
}

export function addTopBarEntry() {
    let attempts = 0;
    const tryAdd = () => {
        const holder = document.querySelector('#top-settings-holder');
        if (!holder) {
            if (++attempts < 40) setTimeout(tryAdd, 250);
            return;
        }
        let button = document.getElementById('storyline_topbar_button');
        if (!button) {
            button = makeEl('div', 'interactable');
            button.id = 'storyline_topbar_button';
            button.tabIndex = 0;
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', tr('Storylines'));
            button.append(makeEl('div', 'drawer-icon fa-solid fa-book-open fa-fw'));
            button.append(makeEl('span', 'storyline_topbar_badge storyline_hidden', '0'));
            button.addEventListener('click', () => openStorylineManager());
            holder.append(button);
            console.log('[Storyline] Top bar button added');
        }
        updateTopBarEntry();
    };
    tryAdd();

    if (!topBarEventsWired) {
        topBarEventsWired = true;
        eventSource.on(event_types.CHAT_CHANGED, updateTopBarEntry);
        eventSource.on(event_types.APP_READY, updateTopBarEntry);
    }
}
