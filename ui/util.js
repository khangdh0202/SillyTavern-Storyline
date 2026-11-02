/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
/* Shared UI helpers for the Storyline extension. Pure DOM/time utilities:
   no state, safe to use from any ui/* module. */

import { BANNER_MAX_CHARS } from '../storyline/constants.js';
import { tr } from '../storyline/i18n.js';

export function makeEl(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== '' && text !== null && text !== undefined) element.textContent = String(text);
    return element;
}

export function formatRelativeTime(isoString) {
    const timestamp = Date.parse(String(isoString ?? ''));
    if (!Number.isFinite(timestamp)) return '';
    const seconds = Math.round((Date.now() - timestamp) / 1000);
    if (seconds < 45) return tr('just now');
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes === 1 ? tr('1 minute ago') : tr('{n} minutes ago', { n: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? tr('1 hour ago') : tr('{n} hours ago', { n: hours });
    const days = Math.round(hours / 24);
    if (days < 30) return days === 1 ? tr('1 day ago') : tr('{n} days ago', { n: days });
    const months = Math.round(days / 30);
    if (months < 12) return months === 1 ? tr('1 month ago') : tr('{n} months ago', { n: months });
    const years = Math.round(months / 12);
    return years === 1 ? tr('1 year ago') : tr('{n} years ago', { n: years });
}

export function buildChip({ icon = '', label = '', tone = '' } = {}) {
    const chip = makeEl('span', `storyline_chip${tone ? ` storyline_chip_${tone}` : ''}`);
    if (icon) chip.append(makeEl('i', `${icon} fa-fw`));
    if (label) chip.append(makeEl('span', '', label));
    return chip;
}

export function buildEmptyState({ icon = 'fa-solid fa-circle-info', title = '', sub = '' } = {}) {
    const empty = makeEl('div', 'storyline_empty');
    empty.append(makeEl('i', `${icon} storyline_empty_icon`));
    if (title) empty.append(makeEl('div', 'storyline_empty_title', title));
    if (sub) empty.append(makeEl('div', 'storyline_empty_sub', sub));
    return empty;
}

/* W4-6: the ONLY accepted banner shape. A hand-edited JSON import with a
   remote URL must never make the extension fetch from the network (host card
   avatar path) — anything but a same-origin-safe data URL is dropped. */
export function safeBannerDataUrl(value, maxChars = BANNER_MAX_CHARS) {
    if (typeof value !== 'string') return '';
    if (!value || value.length > maxChars) return '';
    return /^data:image\/(?:jpeg|png|webp);base64,/.test(value) ? value : '';
}

/* W4-4: run an async UI action with a busy state — the control shows a
   spinner, ignores re-entrant clicks, and restores itself afterwards. */
export async function runUiAction(button, action) {
    if (!button) return action();
    if (button.dataset.storylineBusy) return undefined;
    button.dataset.storylineBusy = '1';
    const original = button.innerHTML;
    button.replaceChildren();
    button.append(makeEl('i', 'fa-solid fa-spinner fa-spin'));
    button.classList.add('storyline_busy');
    try {
        return await action();
    } catch (error) {
        console.error('[Storyline] UI action failed:', error);
        window.toastr?.error?.(String(error?.message ?? error), 'Storyline');
        return undefined;
    } finally {
        button.classList.remove('storyline_busy');
        delete button.dataset.storylineBusy;
        button.innerHTML = original;
    }
}

/* W4-5: real <button> factory for JS-created controls. Keeps the ST classes
   (menu_button/interactable) so existing styles apply. */
export function makeButton({ icon = '', label = '', title = '', className = 'menu_button interactable storyline_button', ariaLabel = '' } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (title) button.title = title;
    const resolvedLabel = ariaLabel || title || label;
    if (resolvedLabel) button.setAttribute('aria-label', resolvedLabel);
    if (icon) button.append(makeEl('i', `${icon} fa-fw`));
    if (label) button.append(makeEl('span', '', label));
    /* A native <button> already clicks on Enter; ST's document-level Enter
       handler (keyboard.js) would click it a SECOND time because it carries
       menu_button/interactable — duplicated rows, double toggles (U4). */
    button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.stopPropagation();
    });
    return button;
}

/* W4-5: keyboard/ARIA upgrade for controls that must stay non-<button>
   elements (template tabs, perspective options, wand entry): focusable,
   labelled, Enter/Space clicks. */
export function upgradeControl(element, { role = 'button', label = '' } = {}) {
    if (!element) return element;
    element.tabIndex = 0;
    element.setAttribute('role', role);
    const resolvedLabel = label || element.getAttribute('aria-label') || element.title || '';
    if (resolvedLabel) element.setAttribute('aria-label', resolvedLabel);
    if (!element.dataset.storylineKeyboardWired) {
        element.dataset.storylineKeyboardWired = '1';
        element.addEventListener('keydown', (event) => {
            if (event.target !== element) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                /* Stop ST's global Enter handler from clicking again (U4). */
                event.stopPropagation();
                element.click();
            }
        });
    }
    return element;
}

/* Escape text for the few places that must hand HTML strings to ST
   (callGenericPopup sets string content via innerHTML). Every user- or
   model-supplied value interpolated into such a string goes through this
   (U2 — imported titles / AI-generated NPC names were injected raw). */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
