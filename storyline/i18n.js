/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { extension_settings } from '../../../../../scripts/extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';
import { STORAGE_KEY } from './constants.js';
import VI from '../i18n/vi.js';

/* UI language (v0.2.0). English is the source language: every UI string is
   written in English in the code and doubles as its own translation key, so
   an untranslated string simply stays English. Only the Storyline UI is
   translated — text sent to the AI (prompts, section titles, function
   instructions) is never passed through tr(). */
export const UI_LANGUAGES = {
    en: 'English',
    vi: 'Tiếng Việt',
};
export const DEFAULT_UI_LANGUAGE = 'en';

const DICTIONARIES = { vi: VI };

export function getUiLanguage() {
    const value = extension_settings[STORAGE_KEY]?.uiLanguage;
    return Object.hasOwn(UI_LANGUAGES, value) ? value : DEFAULT_UI_LANGUAGE;
}

export function setUiLanguage(language) {
    if (!Object.hasOwn(UI_LANGUAGES, language)) return false;
    if (!extension_settings[STORAGE_KEY] || typeof extension_settings[STORAGE_KEY] !== 'object') {
        extension_settings[STORAGE_KEY] = { storylines: {} };
    }
    extension_settings[STORAGE_KEY].uiLanguage = language;
    saveSettingsDebounced();
    return true;
}

/* Number formatting follows the UI language, not the browser locale. */
export function formatNumber(value) {
    return Number(value ?? 0).toLocaleString(getUiLanguage() === 'vi' ? 'vi-VN' : 'en-US');
}

function fill(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}

/* tr('{n} functions added', { n: 3 }) — the English text is the key;
   {name} placeholders are filled after lookup. */
export function tr(text, params = null) {
    const source = String(text ?? '');
    const dictionary = DICTIONARIES[getUiLanguage()];
    const translated = dictionary && Object.hasOwn(dictionary, source) ? dictionary[source] : source;
    return fill(translated, params);
}

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const PHRASE_TAGS = new Set(['B', 'STRONG', 'EM', 'I', 'CODE', 'BR', 'A', 'KBD']);
const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

/* An element whose content is one sentence with inline markup ("<b>Always</b>
   = always in the prompt") is translated as a whole, so word order can change.
   Font Awesome <i> icons are not phrase markup. */
function isPhraseElement(element) {
    let hasText = false;
    for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim()) hasText = true;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (!PHRASE_TAGS.has(node.tagName)) return false;
            if (node.tagName === 'I' && /\bfa-/.test(node.className)) return false;
        }
    }
    return hasText;
}

function lookup(dictionary, text) {
    const key = normalize(text);
    return key && Object.hasOwn(dictionary, key) ? dictionary[key] : null;
}

/* Translate a rendered template in place. Phrase elements are matched by
   their normalized innerHTML, other text nodes one by one (surrounding
   whitespace kept), plus placeholder/title/aria-label. No-op in English. */
export function localizeTree(root) {
    const dictionary = DICTIONARIES[getUiLanguage()];
    if (!dictionary || !root) return root;

    const visit = (element) => {
        for (const attribute of TRANSLATED_ATTRIBUTES) {
            if (!element.hasAttribute?.(attribute)) continue;
            const translated = lookup(dictionary, element.getAttribute(attribute));
            if (translated !== null) element.setAttribute(attribute, translated);
        }
        if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'TEXTAREA') return;
        if (element.childElementCount && isPhraseElement(element)) {
            const translated = lookup(dictionary, element.innerHTML);
            if (translated !== null) {
                element.innerHTML = translated;
                return;
            }
        }
        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const translated = lookup(dictionary, node.textContent);
                if (translated !== null) {
                    const [, lead, , trail] = node.textContent.match(/^(\s*)([\s\S]*?)(\s*)$/);
                    node.textContent = `${lead}${translated}${trail}`;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                visit(node);
            }
        }
    };

    if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        for (const child of Array.from(root.children)) visit(child);
    } else {
        visit(root);
    }
    return root;
}
