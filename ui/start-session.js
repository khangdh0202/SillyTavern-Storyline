/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
/* Start Session screen (v0.2.0): ONE popup before a session is created —
   pitch, "You play as", opening choice and a single Start button. Replaces
   the old two-step flow (player picker, then a scenario picker whose "Skip"
   silently started blank while the player picker's "Cancel" aborted).
   Returns { playerAvatar, scenarioId } — playerAvatar '' = persona,
   scenarioId null = blank start — or null when cancelled (nothing created). */

import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../../../scripts/popup.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { getThumbnailUrl } from '../../../../../script.js';
import { HOST_CARD_PREFIX } from '../storyline/constants.js';
import { makeEl, buildChip, safeBannerDataUrl } from './util.js';
import { tr } from '../storyline/i18n.js';

function makeAvatar(avatar, icon) {
    const box = makeEl('div', 'storyline_hub_cast_avatar');
    if (avatar) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = getThumbnailUrl('avatar', avatar);
        img.alt = '';
        box.append(img);
    } else {
        box.append(makeEl('i', `fa-solid ${icon} fa-fw`));
    }
    return box;
}

/* Radio-style option row; `group` is the shared name for keyboard/AT. */
function makeOption({ group, value, checked, title, meta = '', avatar = null, icon = 'fa-user', chips = [] }) {
    const row = makeEl('label', 'storyline_start_option');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = group;
    input.value = value;
    input.checked = checked;
    row.classList.toggle('storyline_start_option_on', checked);
    const info = makeEl('div', 'storyline_start_option_info');
    const nameRow = makeEl('div', 'storyline_start_option_title');
    nameRow.append(makeEl('span', '', title), ...chips);
    info.append(nameRow);
    if (meta) info.append(makeEl('div', 'storyline_start_option_meta', meta));
    row.append(input);
    if (avatar !== null) row.append(makeAvatar(avatar, icon));
    row.append(info);
    input.addEventListener('change', () => {
        row.closest('.storyline_start_options')?.querySelectorAll('.storyline_start_option').forEach((other) => {
            other.classList.toggle('storyline_start_option_on', other === row);
        });
    });
    return { row, input };
}

export async function pickSessionStart(storyline) {
    const context = getContext();
    const personaName = String(context.name1 ?? 'User');
    const defaultAvatar = String(storyline.userCard?.avatar ?? '').trim();
    const scenarios = (storyline.firstMessages ?? []).filter((scenario) => String(scenario.content ?? '').trim());

    const content = makeEl('div', 'storyline_start storyline_theme');

    /* Hero: banner + title + pitch */
    const hero = makeEl('div', 'storyline_start_hero');
    const banner = makeEl('div', 'storyline_start_banner');
    const bannerUrl = safeBannerDataUrl(storyline.banner);
    if (bannerUrl) {
        const img = document.createElement('img');
        img.src = bannerUrl;
        img.alt = '';
        banner.append(img);
    } else {
        banner.append(makeEl('i', 'fa-solid fa-book-open'));
    }
    const heroMain = makeEl('div', 'storyline_start_hero_main');
    heroMain.append(makeEl('div', 'storyline_start_eyebrow', tr('New session')));
    heroMain.append(makeEl('div', 'storyline_start_title', storyline.title));
    const heroChips = makeEl('div', 'storyline_start_chips');
    if (storyline.category) heroChips.append(buildChip({ icon: 'fa-solid fa-bookmark', label: storyline.category, tone: 'accent' }));
    if (storyline.characters?.length) heroChips.append(buildChip({ icon: 'fa-solid fa-users', label: tr('{n} cast', { n: storyline.characters.length }) }));
    if (heroChips.childElementCount) heroMain.append(heroChips);
    const pitch = String(storyline.plotSummary ?? '').trim();
    if (pitch) heroMain.append(makeEl('div', 'storyline_start_pitch', pitch));
    hero.append(banner, heroMain);
    content.append(hero);

    /* Starting works offline, but the opening is all you'd get: say so up front. */
    if (getContext()?.onlineStatus === 'no_connection') {
        const offline = makeEl('div', 'storyline_settings_hint storyline_function_warning');
        offline.append(makeEl('i', 'fa-solid fa-triangle-exclamation fa-fw'), makeEl('span', '', tr('Not connected to an API — you can start, but the storyteller cannot reply until you connect one in API Connections (the plug icon in the top bar).')));
        content.append(offline);
    }

    /* You play as */
    const playerSection = makeEl('div', 'storyline_start_section');
    const playerHead = makeEl('div', 'storyline_start_section_head');
    playerHead.append(makeEl('div', 'storyline_settings_label', tr('You play as')));
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'storyline_control storyline_start_search';
    search.placeholder = tr('Search cards…');
    search.autocomplete = 'off';
    search.spellcheck = false;
    playerHead.append(search);
    playerSection.append(playerHead);

    const playerList = makeEl('div', 'storyline_start_options storyline_start_players');
    const defaultChip = () => buildChip({ icon: 'fa-solid fa-star', label: tr('story default'), tone: 'accent' });
    const persona = makeOption({
        group: 'storyline_start_player',
        value: '',
        checked: !defaultAvatar,
        title: tr('Persona — {name}', { name: personaName }),
        meta: tr('Your active persona is the player.'),
        avatar: '',
        icon: 'fa-user-astronaut',
        chips: defaultAvatar ? [] : [defaultChip()],
    });
    persona.row.dataset.search = `persona ${personaName}`.toLowerCase();
    playerList.append(persona.row);

    const seen = new Set();
    const cards = (context.characters ?? []).filter((card) => {
        if (!card?.avatar || seen.has(card.avatar) || String(card.avatar).startsWith(HOST_CARD_PREFIX)) return false;
        seen.add(card.avatar);
        return true;
    });
    /* Story default first, then alphabetical — the usual choice is on top. */
    cards.sort((a, b) => (b.avatar === defaultAvatar) - (a.avatar === defaultAvatar) || String(a.name).localeCompare(String(b.name)));
    for (const card of cards) {
        const isDefault = card.avatar === defaultAvatar;
        const option = makeOption({
            group: 'storyline_start_player',
            value: card.avatar,
            checked: isDefault,
            title: String(card.name ?? card.avatar),
            meta: Array.isArray(card.tags) ? card.tags.slice(0, 4).join(', ') : '',
            avatar: card.avatar,
            chips: isDefault ? [defaultChip()] : [],
        });
        option.row.dataset.search = `${card.name ?? ''} ${card.avatar}`.toLowerCase();
        playerList.append(option.row);
    }
    if (defaultAvatar && !seen.has(defaultAvatar)) {
        persona.input.checked = true;
        persona.row.classList.add('storyline_start_option_on');
        playerSection.append(makeEl('div', 'storyline_settings_hint storyline_warn_text', tr('The story\'s default player card ({avatar}) is missing — using the persona.', { avatar: defaultAvatar })));
    }
    search.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        for (const row of playerList.children) {
            row.classList.toggle('storyline_hidden', !!term && !String(row.dataset.search ?? '').includes(term) && !row.querySelector('input')?.checked);
        }
    });
    playerSection.append(playerList);
    content.append(playerSection);

    /* Opening */
    const openingSection = makeEl('div', 'storyline_start_section');
    openingSection.append(makeEl('div', 'storyline_settings_label', tr('Opening')));
    const openingList = makeEl('div', 'storyline_start_options storyline_start_openings');
    scenarios.forEach((scenario, index) => {
        const preview = String(scenario.content).replace(/\s+/g, ' ').trim();
        const option = makeOption({
            group: 'storyline_start_opening',
            value: scenario.id,
            checked: index === 0,
            title: `${index + 1}. ${scenario.title || tr('Opening')}`,
            meta: preview.length > 220 ? `${preview.slice(0, 220)}…` : preview,
        });
        openingList.append(option.row);
    });
    const blank = makeOption({
        group: 'storyline_start_opening',
        value: '',
        checked: scenarios.length === 0,
        title: tr('Blank start'),
        meta: tr('No opening message — you write the first move.'),
    });
    openingList.append(blank.row);
    openingSection.append(openingList);
    content.append(openingSection);

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: tr('Start session'),
        cancelButton: tr('Cancel'),
        wide: true,
        allowVerticalScrolling: true,
    });
    const result = await popup.show();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return null;
    const playerAvatar = String(content.querySelector('input[name="storyline_start_player"]:checked')?.value ?? '');
    const scenarioId = String(content.querySelector('input[name="storyline_start_opening"]:checked')?.value ?? '') || null;
    return { playerAvatar, scenarioId };
}
