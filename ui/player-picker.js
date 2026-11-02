/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
/* Player card picker (shared): used when starting a new Storyline chat and
   when changing the player card of an existing chat. Returns the chosen
   avatar string, '' for "Persona (default)", or null when cancelled. */

import { Popup, POPUP_TYPE } from '../../../../../scripts/popup.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { getThumbnailUrl } from '../../../../../script.js';
import { makeEl, buildChip } from './util.js';
import { tr } from '../storyline/i18n.js';

export async function pickPlayerCard({ defaultAvatar = '', sub = '' } = {}) {
    const context = getContext();
    const cards = (context.characters ?? []).filter((card) => card?.avatar);
    const personaName = String(context.name1 ?? 'User');

    const content = makeEl('div', 'storyline_scenario_picker storyline_theme');

    const hero = makeEl('div', 'storyline_popup_hero');
    const heroIcon = makeEl('div', 'storyline_popup_hero_icon');
    heroIcon.innerHTML = '<i class="fa-solid fa-user-astronaut fa-fw"></i>';
    const heroMain = makeEl('div', 'storyline_popup_hero_main');
    heroMain.append(makeEl('div', 'storyline_popup_hero_title', tr('Who do you play as?')));
    heroMain.append(makeEl('div', 'storyline_popup_hero_sub', sub
        || tr('Pick the card that represents the player ({{user}}) \u2014 or keep your current persona. This choice is saved for this chat only.')));
    hero.append(heroIcon, heroMain);
    content.append(hero);

    const toolbar = makeEl('div', 'storyline_hub_toolbar');
    const search = document.createElement('input');
    search.type = 'search';
    search.classList.add('storyline_control', 'storyline_hub_search');
    search.placeholder = tr('Search character cards\u2026');
    search.autocomplete = 'off';
    search.spellcheck = false;
    toolbar.append(search);
    content.append(toolbar);

    const list = makeEl('div', 'storyline_hub_cast');
    content.append(list);

    let popup;
    const makeRow = (avatar, name, meta, icon, isDefault) => {
        const row = makeEl('div', 'storyline_hub_cast_row storyline_player_row interactable');
        const avatarBox = makeEl('div', 'storyline_hub_cast_avatar');
        if (avatar) {
            const img = document.createElement('img');
            img.src = getThumbnailUrl('avatar', avatar);
            img.alt = name;
            avatarBox.append(img);
        } else {
            avatarBox.append(makeEl('i', `fa-solid ${icon} fa-fw`));
        }
        const info = makeEl('div', 'storyline_hub_cast_info');
        const nameRow = makeEl('div', 'storyline_hub_cast_name');
        nameRow.append(makeEl('span', '', name));
        nameRow.append(buildChip({ icon: 'fa-solid fa-user', label: tr('Player'), tone: 'gold' }));
        if (isDefault) nameRow.append(buildChip({ icon: 'fa-solid fa-star', label: tr('storyline default'), tone: 'accent' }));
        info.append(nameRow);
        if (meta) info.append(makeEl('div', 'storyline_hub_cast_meta', meta));
        row.append(avatarBox, info);
        row.dataset.search = `${name} ${avatar}`.toLowerCase();
        return row;
    };

    const personaRow = makeRow('', tr('Persona (default)'), tr('Uses your current persona ("{name}") as the player.', { name: personaName }),'fa-user-astronaut', !defaultAvatar);
    personaRow.addEventListener('click', () => popup?.complete('\u0000persona'));
    list.append(personaRow);

    const seen = new Set();
    for (const card of cards) {
        if (seen.has(card.avatar)) continue;
        seen.add(card.avatar);
        const row = makeRow(card.avatar, String(card.name ?? card.avatar), card.avatar, 'fa-user', card.avatar === defaultAvatar);
        row.addEventListener('click', () => popup?.complete(card.avatar));
        list.append(row);
    }

    search.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        for (const row of list.children) {
            row.classList.toggle('storyline_hidden', !!term && !String(row.dataset.search ?? '').includes(term));
        }
    });

    popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: false, cancelButton: tr('Cancel'), wide: true, allowVerticalScrolling: true });
    const result = await popup.show();
    if (result === '\u0000persona') return '';
    if (typeof result === 'string' && result) return result;
    return null;
}
