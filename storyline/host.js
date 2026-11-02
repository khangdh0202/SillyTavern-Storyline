/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { characters, getCharacters, getRequestHeaders, system_avatar, getThumbnailUrl } from '../../../../../script.js';
import { getPermanentAssistantAvatar, openPermanentAssistantChat } from '../../../../../scripts/welcome-screen.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { HOST_CARD_PREFIX } from './constants.js';
import { tr } from './i18n.js';
import { safeBannerDataUrl } from '../ui/util.js';

export function getHostAvatar() {
    const context = getContext();
    if (context.characterId === undefined || context.characterId === null) return null;
    return characters[context.characterId]?.avatar ?? null;
}

export function isInternalHost(avatar) {
    if (!avatar) return false;
    return String(avatar).startsWith(HOST_CARD_PREFIX) || avatar === getPermanentAssistantAvatar();
}

export function getHostInfo() {
    const avatar = getHostAvatar();
    return {
        avatar,
        internal: isInternalHost(avatar),
        ignored: true,
    };
}

function sanitizeStoryName(title) {
    return String(title ?? '')
        .replace(/[\\/:*?"<>|#]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'Storyline';
}

export function sanitizeChatName(title) {
    return sanitizeStoryName(title);
}

async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return await response.blob();
}

export async function ensureStorylineHostCard(storyline) {
    if (storyline.hostAvatar) {
        const index = characters.findIndex((card) => card.avatar === storyline.hostAvatar);
        if (index !== -1) {
            return { avatar: storyline.hostAvatar, characterId: index, created: false };
        }
        console.warn('[Storyline] Host card is missing; recreating it from the storyline banner.');
    }

    const fileBase = `${HOST_CARD_PREFIX}${storyline.id}`;
    const formData = new FormData();
    formData.append('ch_name', sanitizeStoryName(storyline.title));
    formData.append('file_name', fileBase);
    formData.append('creator_notes', 'Internal Storyline host card. Not a character: its card content is never used by Storyline generation, and it is managed automatically by the Storyline extension.');
    formData.append('description', String(storyline.plotSummary ?? '').slice(0, 2000));
    formData.append('first_mes', '');
    formData.append('extensions', JSON.stringify({ storyline_host: true }));

    /* W4-6 contract: ONLY a validated inline data URL reaches the network —
       a hand-edited import with `banner: "https://…"` must never be fetched
       from here, and oversized legacy banners are dropped (default avatar)
       instead of uploaded full-size. */
    const bannerDataUrl = safeBannerDataUrl(storyline.banner);
    if (bannerDataUrl) {
        try {
            const blob = await dataUrlToBlob(bannerDataUrl);
            formData.append('avatar', blob, `${fileBase}.png`);
        } catch (error) {
            console.warn('[Storyline] Failed to prepare banner image; using default avatar.', error);
        }
    }
    if (!formData.has('avatar')) {
        try {
            const avatarResponse = await fetch(system_avatar);
            formData.append('avatar', await avatarResponse.blob(), `${fileBase}.png`);
        } catch (error) {
            console.warn('[Storyline] Failed to fetch default avatar; server default will be used.', error);
        }
    }

    const response = await fetch('/api/characters/create', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
        cache: 'no-cache',
    });
    if (!response.ok) {
        throw new Error(tr('Failed to create the Storyline host card.'));
    }

    await getCharacters();
    /* Exact base (+ ST's numeric de-dup suffix) — a bare startsWith could pick
       another storyline's host when one id prefixes another. */
    const escapedBase = fileBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hostPattern = new RegExp(`^${escapedBase}\\d*\\.[a-z]+$`, 'i');
    const avatar = characters.find((card) => hostPattern.test(String(card.avatar ?? '')))?.avatar;
    if (!avatar) {
        throw new Error(tr('Storyline host card was not found after creation.'));
    }

    return { avatar, characterId: characters.findIndex((card) => card.avatar === avatar), created: true };
}

/* v0.2.0: push a changed banner onto the EXISTING host card (its avatar is
   what chats, Recent Chats and the character list show). Before this, the
   banner was baked in only when the host card was first created, so later
   banner edits silently did nothing. Uses ST's own /edit-avatar route (same
   flow as the /avatar slash command) — no core change. Returns true when the
   card was updated, false when there is nothing to update. */
export async function updateHostBanner(storyline) {
    const avatar = String(storyline?.hostAvatar ?? '');
    if (!avatar || !characters.some((card) => card.avatar === avatar)) return false;
    const bannerDataUrl = safeBannerDataUrl(storyline.banner);
    const blob = bannerDataUrl
        ? await dataUrlToBlob(bannerDataUrl)
        : await (await fetch(system_avatar)).blob();
    const formData = new FormData();
    formData.append('avatar', blob, 'avatar.png');
    formData.append('avatar_url', avatar);
    const response = await fetch('/api/characters/edit-avatar', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    });
    if (!response.ok) {
        throw new Error(tr('Updating the story avatar failed: {status} {detail}', { status: response.status, detail: await response.text() }));
    }
    /* Bust the cached thumbnail + full image, then repaint visible copies. */
    const thumbnailUrl = getThumbnailUrl('avatar', avatar);
    await fetch(thumbnailUrl, { method: 'GET', cache: 'reload' });
    await fetch(`/characters/${encodeURIComponent(avatar)}`, { method: 'GET', cache: 'reload' });
    for (const img of document.querySelectorAll(`img[src^="${thumbnailUrl.replace(/"/g, '\\"')}"]`)) {
        if (img instanceof HTMLImageElement) {
            const source = img.src;
            img.src = '';
            img.src = source;
        }
    }
    return true;
}

export async function ensureStorylineHost() {
    const context = getContext();
    if (context.groupId) {
        throw new Error(tr('Group chats cannot host a Storyline.'));
    }
    if (context.characterId !== undefined && context.characterId !== null) {
        const avatar = getHostAvatar();
        return { avatar, internal: isInternalHost(avatar), openedNewChat: false };
    }
    await openPermanentAssistantChat({ tryCreate: true });
    const avatar = getHostAvatar();
    if (!avatar) {
        throw new Error(tr('Failed to open a persistence host for the Storyline chat.'));
    }
    return { avatar, internal: true, openedNewChat: true };
}
