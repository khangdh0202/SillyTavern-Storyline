/* Multi-select character card picker (v0.2.0): searchable list with avatar
   thumbnails. Used by the editor's "Add characters" — replaces the old
   one-dropdown-per-row flow where every cast member was a separate
   unsearchable <select> of "Name (file.png)". Returns an array of avatars
   (possibly empty) or null when cancelled. */

import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../../../scripts/popup.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { getThumbnailUrl } from '../../../../../script.js';
import { makeEl, buildChip } from './util.js';
import { HOST_CARD_PREFIX } from '../storyline/constants.js';
import { tr } from '../storyline/i18n.js';

export async function pickCards({ title = '', sub = '', exclude = [] } = {}) {
    const excluded = new Set(exclude);
    const seen = new Set();
    const cards = (getContext().characters ?? []).filter((card) => {
        if (!card?.avatar || seen.has(card.avatar)) return false;
        seen.add(card.avatar);
        /* Never offer Storyline's own internal host cards as cast. */
        return !String(card.avatar).startsWith(HOST_CARD_PREFIX);
    });

    const content = makeEl('div', 'storyline_scenario_picker storyline_card_picker storyline_theme');
    const hero = makeEl('div', 'storyline_popup_hero');
    const heroIcon = makeEl('div', 'storyline_popup_hero_icon');
    heroIcon.append(makeEl('i', 'fa-solid fa-user-plus fa-fw'));
    const heroMain = makeEl('div', 'storyline_popup_hero_main');
    heroMain.append(makeEl('div', 'storyline_popup_hero_title', title || tr('Add characters')));
    heroMain.append(makeEl('div', 'storyline_popup_hero_sub', sub || tr('Tick every card that lives in this world. Cards already in the cast are marked.')));
    hero.append(heroIcon, heroMain);

    const toolbar = makeEl('div', 'storyline_hub_toolbar');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'storyline_control storyline_hub_search';
    search.placeholder = tr('Search by name or tag…');
    search.autocomplete = 'off';
    search.spellcheck = false;
    const counter = makeEl('span', 'storyline_hub_count', tr('{n} selected', { n: 0 }));
    toolbar.append(search, counter);

    const list = makeEl('div', 'storyline_card_picker_list');
    const selected = new Set();
    const refreshCounter = () => {
        counter.textContent = tr('{n} selected', { n: selected.size });
    };

    for (const card of cards) {
        const already = excluded.has(card.avatar);
        const row = makeEl('label', `storyline_card_picker_row${already ? ' storyline_card_picker_row_in' : ''}`);
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.disabled = already;
        check.checked = already;
        check.addEventListener('change', () => {
            if (check.checked) selected.add(card.avatar);
            else selected.delete(card.avatar);
            row.classList.toggle('storyline_card_picker_row_on', check.checked);
            refreshCounter();
        });
        const avatarBox = makeEl('div', 'storyline_hub_cast_avatar');
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = getThumbnailUrl('avatar', card.avatar);
        img.alt = '';
        avatarBox.append(img);
        const info = makeEl('div', 'storyline_hub_cast_info');
        const nameRow = makeEl('div', 'storyline_hub_cast_name');
        nameRow.append(makeEl('span', '', String(card.name ?? card.avatar)));
        if (already) nameRow.append(buildChip({ icon: 'fa-solid fa-check', label: tr('in cast'), tone: 'muted' }));
        info.append(nameRow);
        const tags = Array.isArray(card.tags) ? card.tags.slice(0, 4).join(', ') : '';
        info.append(makeEl('div', 'storyline_hub_cast_meta', tags || card.avatar));
        row.append(check, avatarBox, info);
        row.dataset.search = `${card.name ?? ''} ${card.avatar} ${tags}`.toLowerCase();
        list.append(row);
    }
    if (!cards.length) {
        list.append(makeEl('div', 'storyline_settings_hint', tr('No character cards found in SillyTavern.')));
    }

    search.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        for (const row of list.children) {
            if (!row.dataset?.search) continue;
            row.classList.toggle('storyline_hidden', !!term && !row.dataset.search.includes(term));
        }
    });

    content.append(hero, toolbar, list);
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: tr('Add selected'),
        cancelButton: tr('Cancel'),
        wide: true,
        allowVerticalScrolling: true,
    });
    const result = await popup.show();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return null;
    return cards.filter((card) => selected.has(card.avatar)).map((card) => card.avatar);
}
