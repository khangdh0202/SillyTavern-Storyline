import { renderExtensionTemplateAsync } from '../../../../../scripts/extensions.js';
import { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup } from '../../../../../scripts/popup.js';
import { getContext } from '../../../../../scripts/st-context.js';
import { uuidv4 } from '../../../../../scripts/utils.js';
import { getThumbnailUrl } from '../../../../../script.js';
import { createDefaultStoryline } from '../storyline/schema.js';
import { getStoryline, saveStoryline } from '../storyline/storage.js';
import { estimateTokens } from '../storyline/characters.js';
import { loadBookEntries } from '../storyline/lorebooks.js';
import {
    DEFAULT_OUTPUT_REMINDER,
    DEFAULT_STORYTELLER_PROMPT,
    DEFAULT_FUNCTIONS_REMINDER,
    BUILT_IN_FUNCTIONS,
    FUNCTION_MODES,
    FUNCTION_MODE_LABELS,
    FUNCTION_MODE_HINTS,
    VALID_FUNCTION_MODES,
    FUNCTION_INSTRUCTION_TOKEN_LIMIT,
    FUNCTIONS_PROMPT_TOKEN_LIMIT,
    FUNCTIONS_REMINDER_TOKEN_LIMIT,
    CHARS_PER_TOKEN,
    BANNER_MAX_CHARS,
    LOREBOOK_TOKENS_DEFAULT,
    MAX_LOREBOOKS,
    MAX_CHARACTERS,
    HOST_CARD_PREFIX,
} from '../storyline/constants.js';
import { downloadStorylineJson } from './files.js';
import { pickCards } from './card-picker.js';
import { buildChip, makeEl, makeButton, safeBannerDataUrl, upgradeControl } from './util.js';
import { buildIntegrationNotice } from './integration-notice.js';
import { getIntegrationStatus, describeIntegrationStatus, INTEGRATION_STATES } from '../storyline/integrations.js';
import { tr, localizeTree, formatNumber } from '../storyline/i18n.js';

const STORYTELLER_TOKEN_LIMIT = 10000;
const UNTITLED = 'Untitled Storyline';

function fileToResizedDataUrl(file, maxSide = 512) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('error', () => reject(new Error(tr('Failed to read the image file.'))));
        reader.addEventListener('load', () => {
            dataUrlToResizedDataUrl(String(reader.result ?? ''), maxSide).then(resolve, () => reject(new Error(tr('Unsupported image file.'))));
        });
        reader.readAsDataURL(file);
    });
}

/* Same pipeline for an EXISTING data URL — also used by the one-shot banner
   migration (banners saved under the old, much larger size limit). */
function dataUrlToResizedDataUrl(dataUrl, maxSide = 512, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('error', () => reject(new Error('Unsupported banner image.')));
        image.addEventListener('load', () => {
            const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        });
        image.src = String(dataUrl ?? '');
    });
}

const TOKEN_DEFAULT_FALLBACKS = {
    storyline_editor_storyteller_prompt: DEFAULT_STORYTELLER_PROMPT,
    storyline_editor_ai_output_reminder: DEFAULT_OUTPUT_REMINDER,
    storyline_editor_functions_reminder: DEFAULT_FUNCTIONS_REMINDER,
};

const FUNCTIONS_JSON_FIELD = '#storyline_editor_functions_json';
const SCENARIO_ROWS = '#storyline_editor_scenarios > .storyline_scenario_row';
const CAST_ROWS = '#storyline_editor_characters > .storyline_cast_row';
const LOREBOOK_ROWS = '#storyline_editor_lorebooks > .storyline_lorebook_row';

/* Per-editor UI state lives on the root — two editors (e.g. Library + Hub)
   never share debounce timers or snapshots (U10). */
function uiState(root) {
    if (!root.__storylineUi) {
        root.__storylineUi = { summaryTimer: null, lastFunctionsJson: null, snapshot: null, activateTab: null };
    }
    return root.__storylineUi;
}

function requestRefresh(root) {
    root.dispatchEvent(new CustomEvent('storyline-rows-changed', { bubbles: true }));
}

/* ---------------------------------------------------------------------------
 * Expanded textarea editor.
 * ------------------------------------------------------------------------ */

function wrapWithExpandButton(textarea) {
    if (textarea.dataset.storylineExpandAttached) return;
    textarea.dataset.storylineExpandAttached = 'true';
    const wrapper = document.createElement('div');
    wrapper.classList.add('storyline_textarea_wrap');
    textarea.before(wrapper);
    wrapper.append(textarea);
    const button = makeButton({
        icon: 'fa-solid fa-expand',
        title: tr('Expand editor'),
        className: 'storyline_expand_button',
    });
    button.addEventListener('click', () => openExpandedEditor(textarea));
    wrapper.append(button);
}

function findExpandedEditorLabel(textarea) {
    const cardTitle = textarea.closest('.storyline_card')?.querySelector('.storyline_card_title')?.childNodes;
    const fieldLabel = textarea.closest('.storyline_field')?.querySelector('.storyline_field_label')?.firstChild?.textContent?.trim();
    if (fieldLabel) return fieldLabel;
    if (textarea.closest('.storyline_scenario_row')) return tr('Opening');
    if (textarea.closest('.storyline_function_row')) return tr('Function instruction');
    if (cardTitle) {
        const text = Array.from(cardTitle).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' ').trim();
        if (text) return text;
    }
    return tr('Expanded editor');
}

async function openExpandedEditor(textarea) {
    const content = makeEl('div', 'storyline_expanded_editor storyline_theme');
    const header = makeEl('div', 'storyline_popup_hero');
    const iconBox = makeEl('div', 'storyline_popup_hero_icon');
    iconBox.append(makeEl('i', 'fa-solid fa-up-right-and-down-left-from-center fa-fw'));
    const headerMain = makeEl('div', 'storyline_popup_hero_main');
    headerMain.append(
        makeEl('div', 'storyline_popup_hero_title', findExpandedEditorLabel(textarea)),
        makeEl('div', 'storyline_popup_hero_sub', tr('Expanded editing — Apply copies the text back to the editor.')),
    );
    header.append(iconBox, headerMain);

    const big = document.createElement('textarea');
    big.classList.add('storyline_control', 'storyline_textarea', 'storyline_textarea_expanded');
    big.value = textarea.value;
    big.placeholder = textarea.placeholder;
    /* Keep the source's character cap (U14 — Apply used to bypass it). */
    if (textarea.maxLength > 0) big.maxLength = textarea.maxLength;

    const counter = makeEl('div', 'storyline_token_counter');
    const updateCounter = () => {
        counter.textContent = tr('{chars} characters · ≈ {tokens} tokens', { chars: formatNumber(big.value.length), tokens: formatNumber(estimateTokens(big.value)) });
    };
    big.addEventListener('input', updateCounter);
    updateCounter();

    content.append(header, big, counter);
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: tr('Apply'),
        cancelButton: tr('Cancel'),
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
    const result = await popup.show();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;
    textarea.value = textarea.maxLength > 0 ? big.value.slice(0, textarea.maxLength) : big.value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------------------------------------------------------------------------
 * Narration Style (storyteller prompt) subview.
 * ------------------------------------------------------------------------ */

function getStorytellerState(value) {
    const text = String(value ?? '').trim();
    return text && text !== DEFAULT_STORYTELLER_PROMPT.trim() ? 'custom' : 'default';
}

function refreshStorytellerLabels(root) {
    const value = root.querySelector('#storyline_editor_storyteller_prompt').value;
    const isCustom = getStorytellerState(value) === 'custom';
    root.querySelector('#storyline_storyteller_row_label').textContent = isCustom
        ? tr('Custom style · ≈ {tokens} tokens', { tokens: formatNumber(estimateTokens(value)) })
        : tr('Built-in style');
    const chip = root.querySelector('#storyline_storyteller_state');
    chip.classList.toggle('storyline_state_chip_custom', isCustom);
    chip.querySelector('span').textContent = isCustom ? tr('Custom style active') : tr('Using the built-in style');
}

function updateStorytellerCounter(root) {
    const tokens = estimateTokens(root.querySelector('#storyline_storyteller_textarea').value);
    const counter = root.querySelector('#storyline_storyteller_counter');
    counter.textContent = tr('≈ {tokens} / {limit} tokens', { tokens: formatNumber(tokens), limit: formatNumber(STORYTELLER_TOKEN_LIMIT) });
    counter.classList.toggle('storyline_token_counter_over', tokens > STORYTELLER_TOKEN_LIMIT);
}

function openSubview(root, subview) {
    root.classList.add('storyline_subview_mode');
    subview.classList.add('storyline_subview_open');
    root.querySelector('.storyline_shell_body')?.scrollTo({ top: 0 });
}

function closeSubview(root, subview) {
    root.classList.remove('storyline_subview_mode');
    subview.classList.remove('storyline_subview_open');
}

/* Commit the subview text into the hidden field. Returns false when over
   the limit (caller keeps the subview open). Used by Done, Back AND Save —
   edits in the subview are never silently dropped (U5). */
function commitStorytellerSubview(root, { silent = false } = {}) {
    const subview = root.querySelector('#storyline_storyteller_subview');
    if (!subview.classList.contains('storyline_subview_open')) return true;
    const hidden = root.querySelector('#storyline_editor_storyteller_prompt');
    const textarea = root.querySelector('#storyline_storyteller_textarea');
    const tokens = estimateTokens(textarea.value);
    if (tokens > STORYTELLER_TOKEN_LIMIT) {
        toastr.error(tr('Narration Style is over the limit: ≈ {tokens} / {limit} tokens.', { tokens: formatNumber(tokens), limit: formatNumber(STORYTELLER_TOKEN_LIMIT) }), 'Storyline');
        return false;
    }
    const text = textarea.value.trim();
    const next = !text || text === DEFAULT_STORYTELLER_PROMPT.trim() ? '' : textarea.value;
    const changed = next !== hidden.value;
    hidden.value = next;
    refreshStorytellerLabels(root);
    closeSubview(root, subview);
    if (changed) {
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        if (!silent) toastr.info(tr('Narration Style updated — Save Storyline to keep it.'), 'Storyline');
    }
    return true;
}

function wireStorytellerSubview(root) {
    const hidden = root.querySelector('#storyline_editor_storyteller_prompt');
    const textarea = root.querySelector('#storyline_storyteller_textarea');
    const subview = root.querySelector('#storyline_storyteller_subview');

    const opener = root.querySelector('#storyline_open_storyteller');
    upgradeControl(opener, { label: tr('Edit the Narration Style') });
    opener.addEventListener('click', () => {
        textarea.value = hidden.value || DEFAULT_STORYTELLER_PROMPT;
        updateStorytellerCounter(root);
        openSubview(root, subview);
        textarea.focus();
    });

    const back = root.querySelector('#storyline_storyteller_back');
    upgradeControl(back, { label: tr('Back (keeps your edits)') });
    back.addEventListener('click', () => commitStorytellerSubview(root));

    const how = root.querySelector('#storyline_storyteller_how .storyline_accordion_head');
    upgradeControl(how, { label: tr('How it works') });
    how.addEventListener('click', () => {
        root.querySelector('#storyline_storyteller_how').classList.toggle('storyline_accordion_open');
    });

    textarea.addEventListener('input', (event) => {
        /* Subview typing is not an editor field — keep it out of the dirty
           and token pipelines until it is committed. */
        event.stopPropagation();
        updateStorytellerCounter(root);
    });

    const reset = root.querySelector('.storyline_act_reset_prompt');
    upgradeControl(reset, { label: tr('Use the built-in style') });
    reset.addEventListener('click', () => {
        textarea.value = DEFAULT_STORYTELLER_PROMPT;
        updateStorytellerCounter(root);
    });

    const apply = root.querySelector('.storyline_act_apply_prompt');
    upgradeControl(apply, { label: tr('Done') });
    apply.addEventListener('click', () => commitStorytellerSubview(root));

    refreshStorytellerLabels(root);
}

/* ---------------------------------------------------------------------------
 * Functions catalog subview.
 * ------------------------------------------------------------------------ */

function readFunctionsState(root) {
    let parsed = null;
    try {
        parsed = JSON.parse(root.querySelector(FUNCTIONS_JSON_FIELD).value || '{}');
    } catch {
        parsed = null;
    }
    const state = { entries: {} };
    const rawEntries = parsed?.entries && typeof parsed.entries === 'object' && !Array.isArray(parsed.entries) ? parsed.entries : {};
    for (const builtIn of BUILT_IN_FUNCTIONS) {
        const entry = rawEntries[builtIn.id];
        if (!entry || typeof entry !== 'object') continue;
        state.entries[builtIn.id] = {
            mode: VALID_FUNCTION_MODES.includes(entry.mode) ? entry.mode : FUNCTION_MODES.DEFAULT_OFF,
            instruction: String(entry.instruction ?? ''),
        };
    }
    return state;
}

function writeFunctionsState(root, state) {
    root.querySelector(FUNCTIONS_JSON_FIELD).value = JSON.stringify({ entries: state.entries });
}

function refreshFunctionsLabels(root, state) {
    const ids = Object.keys(state.entries);
    const names = ids.map((id) => tr(BUILT_IN_FUNCTIONS.find((def) => def.id === id)?.name ?? id));
    root.querySelector('#storyline_functions_row_label').textContent = names.length ? names.join(', ') : tr('None added');
    const count = root.querySelector('#storyline_functions_count');
    if (count) count.textContent = names.length ? String(names.length) : '';
    const chip = root.querySelector('#storyline_functions_state');
    chip.classList.toggle('storyline_state_chip_custom', names.length > 0);
    chip.querySelector('span').textContent = !names.length ? tr('No functions added') : names.length === 1 ? tr('1 function added') : tr('{n} functions added', { n: names.length });
}

function refreshFunctionsState(root, state) {
    writeFunctionsState(root, state);
    refreshFunctionsLabels(root, state);
    requestRefresh(root);
}

function openFunctionInfoPopup(functionDef) {
    const content = makeEl('div', 'storyline_function_info storyline_theme');
    const hero = makeEl('div', 'storyline_popup_hero');
    const iconBox = makeEl('div', 'storyline_popup_hero_icon');
    iconBox.append(makeEl('i', `fa-solid ${functionDef.contextOnly ? 'fa-layer-group' : 'fa-wand-magic-sparkles'} fa-fw`));
    const heroMain = makeEl('div', 'storyline_popup_hero_main');
    heroMain.append(makeEl('div', 'storyline_popup_hero_title', tr(functionDef.name)));
    heroMain.append(makeEl('div', 'storyline_popup_hero_sub', functionDef.contextOnly ? tr('Adds context and guidance — no tool call') : tr('A real tool the AI can call')));
    hero.append(iconBox, heroMain);
    content.append(hero, makeEl('p', '', tr(functionDef.toolSummary)));

    if (functionDef.contextOnly) {
        content.append(makeEl('div', 'storyline_function_heading', tr('REQUIRES')));
        const requires = makeEl('div', 'storyline_function_output');
        requires.append(makeEl('div', '', functionDef.requires !== undefined && functionDef.requires !== null
            ? tr(functionDef.requires)
            : tr('This function needs an external extension (installed separately). Without it the function is inactive and the story runs normally.')));
        content.append(requires);
    } else {
        /* Technical signature for creators who want it — collapsed. */
        const details = document.createElement('details');
        details.className = 'storyline_function_tech';
        const summary = document.createElement('summary');
        summary.textContent = tr('Technical details');
        details.append(summary);
        const toolChip = makeEl('div', 'storyline_function_toolchip');
        toolChip.append(makeEl('i', 'fa-solid fa-code fa-fw'), makeEl('code', '', functionDef.toolName));
        details.append(toolChip, makeEl('div', 'storyline_function_heading', tr('INPUT PARAMETERS')));
        for (const parameter of functionDef.parameters) {
            const row = makeEl('div', 'storyline_function_param');
            const head = makeEl('div', 'storyline_function_param_head');
            head.append(makeEl('b', '', parameter.name), makeEl('span', '', ` ${parameter.type}`));
            if (parameter.required) head.append(makeEl('span', 'storyline_function_required', tr('REQUIRED')));
            row.append(head, makeEl('div', '', parameter.description));
            details.append(row);
        }
        details.append(makeEl('div', 'storyline_function_heading', tr('OUTPUT')));
        const outputBox = makeEl('div', 'storyline_function_output');
        outputBox.append(makeEl('b', '', functionDef.output.name), makeEl('span', '', ` ${functionDef.output.type}`), makeEl('div', '', functionDef.output.description));
        details.append(outputBox);
        content.append(details);
    }

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: tr('Close'), wide: true, allowVerticalScrolling: true });
    popup.show();
}

function buildFunctionRow(functionDef, state, root) {
    const row = makeEl('div', 'storyline_function_row');
    row.dataset.functionId = functionDef.id;

    const header = makeEl('div', 'storyline_row_header');
    const icon = makeEl('div', 'storyline_function_icon');
    icon.append(makeEl('i', `fa-solid ${functionDef.contextOnly ? 'fa-layer-group' : 'fa-wand-magic-sparkles'} fa-fw`));
    const name = makeEl('div', 'storyline_function_name', tr(functionDef.name));
    const status = makeEl('span', 'storyline_builtin_chip');
    const info = makeButton({
        icon: 'fa-solid fa-circle-info',
        title: tr('About {name}', { name: tr(functionDef.name) }),
        className: 'menu_button menu_button_icon interactable storyline_function_info',
    });
    const remove = makeButton({
        icon: 'fa-solid fa-xmark',
        label: tr('Remove'),
        title: tr('Remove this function from the storyline'),
        className: 'menu_button interactable storyline_function_remove',
    });
    header.append(icon, name, status, info, remove);

    const description = makeEl('div', 'storyline_function_desc', tr(functionDef.description));
    const integrationSlot = makeEl('div', 'storyline_integration_slot');
    integrationSlot.dataset.functionId = functionDef.id;

    const modeOptions = makeEl('div', 'storyline_perspective_options storyline_function_modes');
    modeOptions.setAttribute('role', 'radiogroup');
    modeOptions.setAttribute('aria-label', tr('{name} mode', { name: tr(functionDef.name) }));
    const modeButtons = {};
    for (const mode of VALID_FUNCTION_MODES) {
        const button = makeButton({
            label: tr(FUNCTION_MODE_LABELS[mode]),
            title: tr(FUNCTION_MODE_HINTS[mode]),
            className: 'storyline_perspective_option menu_button interactable storyline_function_mode',
        });
        button.dataset.mode = mode;
        button.setAttribute('role', 'radio');
        modeOptions.append(button);
        modeButtons[mode] = button;
    }
    const modeHint = makeEl('div', 'storyline_function_hint storyline_function_mode_hint');

    const editorSection = makeEl('div', 'storyline_function_editor storyline_hidden');
    const customizeToggle = makeButton({
        icon: 'fa-solid fa-pen-to-square',
        label: tr('Customize instruction'),
        className: 'storyline_function_customize',
    });
    customizeToggle.append(makeEl('i', 'fa-solid fa-chevron-down fa-fw'));
    customizeToggle.setAttribute('aria-expanded', 'false');

    const instruction = document.createElement('textarea');
    instruction.classList.add('storyline_control', 'storyline_textarea', 'storyline_function_instruction');
    instruction.rows = 6;
    instruction.maxLength = FUNCTION_INSTRUCTION_TOKEN_LIMIT * CHARS_PER_TOKEN;
    instruction.value = state.entries[functionDef.id]?.instruction || functionDef.defaultInstruction;
    const counter = makeEl('div', 'storyline_token_counter storyline_function_counter');
    const counterHint = makeEl('div', 'storyline_function_hint', tr('Follows the built-in guidance until edited. Max {limit} tokens.', { limit: formatNumber(FUNCTION_INSTRUCTION_TOKEN_LIMIT) }));
    editorSection.append(instruction, counter, counterHint);

    const updateCounter = () => {
        const tokens = estimateTokens(instruction.value);
        counter.textContent = tr('Tokens: {tokens} / {limit}', { tokens: formatNumber(tokens), limit: formatNumber(FUNCTION_INSTRUCTION_TOKEN_LIMIT) });
        counter.classList.toggle('storyline_token_counter_over', tokens > FUNCTION_INSTRUCTION_TOKEN_LIMIT);
    };

    const refreshRowState = () => {
        const current = state.entries[functionDef.id];
        row.classList.toggle('storyline_function_row_added', !!current);
        status.textContent = current ? tr('ADDED') : tr('NOT ADDED');
        status.classList.toggle('storyline_builtin_chip_on', !!current);
        for (const [mode, button] of Object.entries(modeButtons)) {
            const selected = !!current && mode === current.mode;
            button.classList.toggle('storyline_selected', selected);
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
        }
        modeHint.textContent = current ? tr(FUNCTION_MODE_HINTS[current.mode]) : tr('Pick a mode to add this function to the storyline.');
        remove.classList.toggle('storyline_hidden', !current);
        customizeToggle.classList.toggle('storyline_hidden', !current);
        if (!current) {
            editorSection.classList.add('storyline_hidden');
            customizeToggle.classList.remove('storyline_open');
            customizeToggle.setAttribute('aria-expanded', 'false');
        }
        updateCounter();
    };

    for (const button of Object.values(modeButtons)) {
        button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            const current = state.entries[functionDef.id];
            if (current?.mode === mode) return;
            state.entries[functionDef.id] = { mode, instruction: current?.instruction ?? '' };
            refreshRowState();
            refreshFunctionsState(root, state);
        });
    }

    /* U6: Remove deletes the ENTRY and keeps the catalog row, so the
       function can be added back without reopening the editor. */
    remove.addEventListener('click', () => {
        delete state.entries[functionDef.id];
        instruction.value = functionDef.defaultInstruction;
        refreshRowState();
        refreshFunctionsState(root, state);
    });

    customizeToggle.addEventListener('click', () => {
        const current = state.entries[functionDef.id];
        if (!current) return;
        const opening = editorSection.classList.contains('storyline_hidden');
        editorSection.classList.toggle('storyline_hidden', !opening);
        customizeToggle.classList.toggle('storyline_open', opening);
        customizeToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) {
            instruction.value = current.instruction || functionDef.defaultInstruction;
            updateCounter();
        }
    });

    instruction.addEventListener('input', () => {
        const current = state.entries[functionDef.id];
        if (!current) return;
        const text = instruction.value.trim();
        current.instruction = text && text !== functionDef.defaultInstruction.trim() ? instruction.value : '';
        writeFunctionsState(root, state);
        updateCounter();
    });

    info.addEventListener('click', () => openFunctionInfoPopup(functionDef));

    row.append(header, description, integrationSlot, modeOptions, modeHint, customizeToggle, editorSection);
    refreshRowState();
    renderIntegrationSlot(root, integrationSlot);
    return row;
}

function renderIntegrationSlot(root, slot) {
    const notice = buildIntegrationNotice(slot.dataset.functionId, { onChanged: () => refreshIntegrationNotices(root) });
    slot.replaceChildren(...(notice ? [notice] : []));
}

/* After an install dialog: re-probe every function row and the Check tab. */
function refreshIntegrationNotices(root) {
    if (!root.isConnected) return;
    for (const slot of root.querySelectorAll('.storyline_integration_slot')) renderIntegrationSlot(root, slot);
    updatePublishFunctions(root);
    requestRefresh(root);
}

function wireFunctionsSubview(root, state) {
    const subview = root.querySelector('#storyline_functions_subview');
    const catalog = root.querySelector('#storyline_functions_catalog');
    for (const builtIn of BUILT_IN_FUNCTIONS) {
        catalog.append(buildFunctionRow(builtIn, state, root));
    }

    const opener = root.querySelector('#storyline_open_functions');
    upgradeControl(opener, { label: tr('Manage story functions') });
    opener.addEventListener('click', () => openSubview(root, subview));

    const close = () => closeSubview(root, subview);
    const back = root.querySelector('#storyline_functions_back');
    upgradeControl(back, { label: tr('Back') });
    back.addEventListener('click', close);
    const done = root.querySelector('.storyline_act_functions_done');
    upgradeControl(done, { label: tr('Done') });
    done.addEventListener('click', close);

    const how = root.querySelector('#storyline_functions_how .storyline_accordion_head');
    upgradeControl(how, { label: tr('How it works') });
    how.addEventListener('click', () => {
        root.querySelector('#storyline_functions_how').classList.toggle('storyline_accordion_open');
    });

    refreshFunctionsLabels(root, state);
}

/* ---------------------------------------------------------------------------
 * Openings (scenarios).
 * ------------------------------------------------------------------------ */

function buildScenarioRow(scenario) {
    const row = makeEl('div', 'storyline_scenario_row');
    const header = makeEl('div', 'storyline_row_header');
    const index = makeEl('div', 'storyline_row_index', '1');
    const title = document.createElement('input');
    title.type = 'text';
    title.classList.add('storyline_control', 'storyline_scenario_row_title');
    title.placeholder = tr('Opening title (e.g. "The lamp goes dark")');
    title.maxLength = 200;
    title.value = scenario.title ?? '';
    const up = makeButton({ icon: 'fa-solid fa-arrow-up', title: tr('Move up'), className: 'menu_button menu_button_icon interactable storyline_row_move' });
    const remove = makeButton({ icon: 'fa-solid fa-trash-can', title: tr('Remove opening'), className: 'menu_button menu_button_icon interactable storyline_row_remove' });
    header.append(index, title, up, remove);

    const content = document.createElement('textarea');
    content.classList.add('storyline_control', 'storyline_textarea', 'storyline_scenario_row_content');
    content.rows = 6;
    content.placeholder = tr('The first narration of the session: set the scene, place {{user}} in it, and end at a moment where they can act.');
    content.value = scenario.content ?? '';
    wrapWithExpandButton(content);

    up.addEventListener('click', () => {
        const previous = row.previousElementSibling;
        if (previous) {
            previous.before(row);
            requestRefresh(row);
        }
    });
    remove.addEventListener('click', () => {
        const list = row.parentElement;
        row.remove();
        if (list) requestRefresh(list);
    });
    row.append(header, content.parentElement ?? content);
    row.dataset.id = scenario.id ?? uuidv4();
    return row;
}

function renumberScenarios(root) {
    root.querySelectorAll(SCENARIO_ROWS).forEach((row, index) => {
        row.querySelector('.storyline_row_index').textContent = String(index + 1);
        row.querySelector('.storyline_row_move')?.classList.toggle('storyline_invisible', index === 0);
    });
}

/* ---------------------------------------------------------------------------
 * Cast (v0.2.0): compact rows — avatar, name, Always/Full toggles, expand
 * for aliases/note. One row ≈ 48px instead of ≈ 250px.
 * ------------------------------------------------------------------------ */

function findCardByAvatar(avatar) {
    return (getContext().characters ?? []).find((card) => card?.avatar === avatar) ?? null;
}

function cardTokenEstimate(card) {
    if (!card) return 0;
    const text = [card.description, card.personality, card.scenario, card.data?.description, card.data?.personality, card.data?.scenario]
        .filter((value) => typeof value === 'string')
        .join('\n');
    const bookEntries = card.data?.character_book?.entries ?? card.character_book?.entries ?? [];
    const bookText = Array.isArray(bookEntries) ? bookEntries.map((entry) => String(entry?.content ?? '')).join('\n') : '';
    return estimateTokens(text) + estimateTokens(bookText);
}

function makeToggleChip(label, title, checked, className) {
    const button = makeButton({ label, title, className: `storyline_cast_toggle ${className}` });
    button.setAttribute('aria-pressed', checked ? 'true' : 'false');
    button.classList.toggle('storyline_cast_toggle_on', checked);
    button.addEventListener('click', () => {
        const next = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', next ? 'true' : 'false');
        button.classList.toggle('storyline_cast_toggle_on', next);
        button.dispatchEvent(new CustomEvent('storyline-toggle', { bubbles: true, detail: { on: next } }));
        requestRefresh(button);
    });
    return button;
}

function buildCastRow(link) {
    const row = makeEl('div', 'storyline_cast_row');
    /* Preserve schema-only fields the UI does not edit (e.g. stateEntityKey —
       the world-state resolver's first candidate). collectStoryline spreads
       this back over the edited fields; without it, every Edit+Save silently
       stripped hand-bound/imports-only fields. */
    row.__storylineLink = link && typeof link === 'object' ? link : null;
    row.dataset.avatar = String(link?.avatar ?? '');
    const card = findCardByAvatar(link?.avatar);
    const displayName = String(card?.name ?? link?.name ?? link?.avatar ?? 'Unknown');
    row.dataset.name = displayName;
    row.dataset.search = `${displayName} ${(link?.aliases ?? []).join(' ')}`.toLowerCase();

    const main = makeEl('div', 'storyline_cast_main');
    const avatarBox = makeEl('div', 'storyline_cast_avatar');
    if (card) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = getThumbnailUrl('avatar', card.avatar);
        img.alt = '';
        avatarBox.append(img);
    } else {
        avatarBox.append(makeEl('i', 'fa-solid fa-user-slash fa-fw'));
        row.classList.add('storyline_cast_row_missing');
    }

    const text = makeEl('div', 'storyline_cast_text');
    const nameLine = makeEl('div', 'storyline_cast_name', displayName);
    const sub = makeEl('div', 'storyline_cast_sub');
    text.append(nameLine, sub);

    const always = makeToggleChip(tr('Always'), tr('Always include this character in the prompt (skip the name scan)'), !!link?.alwaysInclude, 'storyline_cast_always');
    const full = makeToggleChip(tr('Full'), tr('Inject the WHOLE card untrimmed: description, personality, scenario and embedded lorebook'), !!link?.full, 'storyline_cast_full');

    const expand = makeButton({ icon: 'fa-solid fa-chevron-down', title: tr('Aliases & note'), className: 'menu_button menu_button_icon interactable storyline_cast_expand' });
    expand.setAttribute('aria-expanded', 'false');
    const remove = makeButton({ icon: 'fa-solid fa-trash-can', title: tr('Remove {name} from the cast', { name: displayName }), className: 'menu_button menu_button_icon interactable storyline_row_remove' });
    main.append(avatarBox, text, always, full, expand, remove);

    const details = makeEl('div', 'storyline_cast_details storyline_hidden');
    const aliases = document.createElement('input');
    aliases.type = 'text';
    aliases.classList.add('storyline_control', 'storyline_character_row_aliases');
    aliases.placeholder = tr('Aliases, comma separated — nicknames that also trigger this character');
    aliases.maxLength = 2000;
    aliases.value = Array.isArray(link?.aliases) ? link.aliases.join(', ') : '';
    const note = document.createElement('input');
    note.type = 'text';
    note.classList.add('storyline_control', 'storyline_character_row_note');
    note.placeholder = tr('Story note — this character\'s role in THIS story (optional, sent with the card)');
    note.maxLength = 4000;
    note.value = link?.note ?? '';
    const fullWarning = makeEl('div', 'storyline_cast_warning storyline_hidden');
    details.append(aliases, note, fullWarning);

    const refreshSub = () => {
        const parts = [];
        if (!card) parts.push(tr('card missing — skipped'));
        const aliasList = aliases.value.split(',').map((alias) => alias.trim()).filter(Boolean);
        if (aliasList.length) parts.push(tr('aka {aliases}', { aliases: aliasList.join(', ') }));
        if (note.value.trim()) parts.push(tr('has note'));
        sub.textContent = parts.join(' · ') || (card ? tr('~{tokens} tokens in card', { tokens: formatNumber(cardTokenEstimate(card)) }) : '');
        row.dataset.search = `${displayName} ${aliasList.join(' ')}`.toLowerCase();
        const fullOn = full.getAttribute('aria-pressed') === 'true';
        fullWarning.classList.toggle('storyline_hidden', !fullOn);
        if (fullOn) {
            fullWarning.textContent = tr('Full card ≈ {tokens} tokens every time {name} is in the scene, never trimmed. Raise the model\'s context if needed. If this card\'s lorebook is also linked as World Info, disable one copy.', { tokens: formatNumber(cardTokenEstimate(card)), name: displayName });
            details.classList.remove('storyline_hidden');
            expand.setAttribute('aria-expanded', 'true');
            expand.classList.add('storyline_open');
        }
    };
    aliases.addEventListener('input', refreshSub);
    note.addEventListener('input', refreshSub);
    full.addEventListener('storyline-toggle', refreshSub);
    refreshSub();

    expand.addEventListener('click', () => {
        const opening = details.classList.contains('storyline_hidden');
        details.classList.toggle('storyline_hidden', !opening);
        expand.setAttribute('aria-expanded', opening ? 'true' : 'false');
        expand.classList.toggle('storyline_open', opening);
        if (opening) aliases.focus();
    });
    remove.addEventListener('click', () => {
        const list = row.parentElement;
        row.remove();
        if (list) requestRefresh(list);
    });

    row.append(main, details);
    return row;
}

function refreshCastMeta(root) {
    const rows = root.querySelectorAll(CAST_ROWS);
    const count = root.querySelector('#storyline_editor_cast_count');
    if (count) count.textContent = rows.length ? String(rows.length) : '';
    const list = root.querySelector('#storyline_editor_characters');
    if (list && !rows.length && !list.querySelector('.storyline_empty')) {
        list.append(Object.assign(makeEl('div', 'storyline_empty storyline_empty_compact'), {
            textContent: tr('No characters yet — a storyline works perfectly without them. Add cards to give the world recurring faces.'),
        }));
    } else if (rows.length) {
        list?.querySelector('.storyline_empty')?.remove();
    }
}

async function addCharacters(root) {
    const list = root.querySelector('#storyline_editor_characters');
    const existing = Array.from(root.querySelectorAll(CAST_ROWS)).map((row) => row.dataset.avatar);
    const room = MAX_CHARACTERS - existing.length;
    if (room <= 0) {
        toastr.warning(tr('A storyline can link up to {max} characters.', { max: MAX_CHARACTERS }), 'Storyline');
        return;
    }
    const picked = await pickCards({ exclude: existing });
    if (!picked?.length) return;
    for (const avatar of picked.slice(0, room)) {
        const card = findCardByAvatar(avatar);
        list.append(buildCastRow({ avatar, name: String(card?.name ?? avatar), aliases: [], note: '', alwaysInclude: false, full: false }));
    }
    if (picked.length > room) toastr.warning(tr('Only {room} more character(s) fit (limit {max}).', { room, max: MAX_CHARACTERS }), 'Storyline');
    requestRefresh(list);
}

/* ---------------------------------------------------------------------------
 * Linked lorebooks.
 * ------------------------------------------------------------------------ */

function buildLorebookRow(link, worldNames) {
    const row = makeEl('div', 'storyline_lorebook_row');
    /* Keep fields the UI does not edit (e.g. an imported enabled:false) —
       the old rebuild re-enabled every book on Save (U11). */
    row.__storylineLink = link && typeof link === 'object' ? link : null;

    const header = makeEl('div', 'storyline_row_header');
    const icon = makeEl('div', 'storyline_character_icon');
    icon.append(makeEl('i', 'fa-solid fa-book-atlas fa-fw'));
    const select = document.createElement('select');
    select.classList.add('storyline_control', 'storyline_lorebook_row_name');
    const placeholder = makeEl('option', '', tr('— select World Info file —'));
    placeholder.value = '';
    select.append(placeholder);
    const seen = new Set();
    for (const name of worldNames) {
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const option = makeEl('option', '', name);
        option.value = name;
        select.append(option);
    }
    if (link?.name && !seen.has(link.name)) {
        const option = makeEl('option', '', tr('{name} (missing)', { name: link.name }));
        option.value = link.name;
        select.append(option);
    }
    if (link?.name) select.value = link.name;
    const remove = makeButton({ icon: 'fa-solid fa-trash-can', title: tr('Unlink lorebook'), className: 'menu_button menu_button_icon interactable storyline_row_remove' });
    header.append(icon, select, remove);

    const body = makeEl('div', 'storyline_lorebook_body');
    const mode = document.createElement('select');
    mode.classList.add('storyline_control', 'storyline_lorebook_row_mode');
    for (const [value, text] of [['smart', tr('Smart — entries whose keys match')], ['full', tr('Full — every enabled entry')]]) {
        const option = makeEl('option', '', text);
        option.value = value;
        mode.append(option);
    }
    mode.value = link?.mode === 'full' ? 'full' : 'smart';

    const tokensLabel = makeEl('label', 'storyline_lorebook_tokens');
    tokensLabel.append(makeEl('span', '', tr('Max tokens')));
    const tokens = document.createElement('input');
    tokens.type = 'number';
    tokens.classList.add('storyline_control', 'storyline_lorebook_row_tokens');
    tokens.min = '100';
    tokens.max = '32000';
    tokens.step = '100';
    tokens.value = String(Number(link?.maxTokens) || LOREBOOK_TOKENS_DEFAULT);
    tokens.title = tr('Per-book token cap (100–32000). Highest-order entries are kept first.');
    tokensLabel.append(tokens);

    const meta = makeEl('span', 'storyline_field_hint storyline_lorebook_row_meta', '');
    let metaRequest = 0;
    const updateMeta = () => {
        const name = String(select.value ?? '');
        const requestId = ++metaRequest;
        if (!name) {
            meta.textContent = '';
            return;
        }
        meta.textContent = tr('Loading lorebook…');
        loadBookEntries(name)
            .then((entries) => {
                if (requestId !== metaRequest) return; // U14: stale response
                const totalTokens = entries.reduce((sum, entry) => sum + estimateTokens(entry.content), 0);
                meta.textContent = tr('{count} entries · ~{tokens} tokens in file', { count: formatNumber(entries.length), tokens: formatNumber(totalTokens) });
            })
            .catch(() => {
                if (requestId === metaRequest) meta.textContent = tr('World file not found.');
            });
    };
    select.addEventListener('change', updateMeta);
    updateMeta();

    body.append(mode, tokensLabel, meta);
    remove.addEventListener('click', () => {
        const list = row.parentElement;
        row.remove();
        if (list) requestRefresh(list);
    });
    row.append(header, body);
    return row;
}

function refreshLorebookMeta(root) {
    const rows = root.querySelectorAll(LOREBOOK_ROWS);
    const count = root.querySelector('#storyline_lorebooks_count');
    if (count) count.textContent = rows.length ? String(rows.length) : '';
    const add = root.querySelector('.storyline_act_add_lorebook');
    const atCap = rows.length >= MAX_LOREBOOKS;
    add?.classList.toggle('disabled', atCap);
    if (add) add.title = atCap ? tr('Up to {max} lorebooks per storyline', { max: MAX_LOREBOOKS }) : tr('Link a World Info file');
}

/* ---------------------------------------------------------------------------
 * Header, token summary, readiness.
 * ------------------------------------------------------------------------ */

function getEditorStats(root) {
    return {
        openings: root.querySelectorAll(SCENARIO_ROWS).length,
        cast: root.querySelectorAll(CAST_ROWS).length,
        tokens: root.querySelector('#storyline_token_total')?.textContent ?? '0',
    };
}

function updateEditorHero(root) {
    const titleElement = root.querySelector('#storyline_editor_hero_title');
    if (!titleElement) return;
    titleElement.textContent = root.querySelector('#storyline_editor_title').value.trim() || tr('Untitled Storyline');
    const category = root.querySelector('#storyline_editor_category').value.trim();
    const stats = getEditorStats(root);

    const chips = [];
    if (category) chips.push(buildChip({ icon: 'fa-solid fa-bookmark', label: category, tone: 'accent' }));
    chips.push(buildChip({ icon: 'fa-solid fa-flag-checkered', label: `${stats.openings}` }));
    chips.push(buildChip({ icon: 'fa-solid fa-users', label: `${stats.cast}` }));
    chips.push(buildChip({ icon: 'fa-solid fa-calculator', label: `≈ ${stats.tokens}t` }));
    if (root.dataset.storylineDirty === '1') {
        chips.push(buildChip({ icon: 'fa-solid fa-circle', label: tr('Unsaved'), tone: 'warn' }));
    }
    const chipBox = root.querySelector('#storyline_editor_hero_chips');
    chipBox.replaceChildren(...chips);
    chipBox.title = tr('{openings} opening(s) · {cast} cast · ≈ {tokens} fixed prompt tokens', { openings: stats.openings, cast: stats.cast, tokens: stats.tokens });
}

function paintTokenRow(root, row) {
    const field = root.querySelector(`#${CSS.escape(row.dataset.tokenFor)}`);
    const raw = field?.value ?? '';
    const fallback = TOKEN_DEFAULT_FALLBACKS[row.dataset.tokenFor];
    const usesDefault = Boolean(fallback) && !raw.trim();
    const tokens = estimateTokens(usesDefault ? fallback : raw);
    if (!row.dataset.label) row.dataset.label = row.querySelector('span').textContent;
    row.querySelector('span').textContent = usesDefault ? tr('{label} (built-in)', { label: row.dataset.label }) : row.dataset.label;
    row.querySelector('b').textContent = formatNumber(tokens);
    return tokens;
}

function paintLiveTokens(root, fieldId) {
    const target = root.querySelector(`[data-token-live="${CSS.escape(fieldId)}"]`);
    if (!target) return;
    const value = root.querySelector(`#${CSS.escape(fieldId)}`)?.value ?? '';
    target.textContent = value.trim() ? tr('≈ {tokens} tokens', { tokens: formatNumber(estimateTokens(value)) }) : '';
}

function updateTokenCounters(root) {
    let total = 0;
    for (const row of root.querySelectorAll('.storyline_token_row[data-token-for]')) {
        total += paintTokenRow(root, row);
    }
    for (const live of root.querySelectorAll('[data-token-live]')) paintLiveTokens(root, live.dataset.tokenLive);
    let scenarioTokens = 0;
    for (const content of root.querySelectorAll(`${SCENARIO_ROWS} .storyline_scenario_row_content`)) {
        scenarioTokens += estimateTokens(content.value);
    }
    root.querySelector('#storyline_token_scenarios').textContent = formatNumber(scenarioTokens);
    root.querySelector('#storyline_token_total').textContent = formatNumber(total);
}

/* Check tab: show which configured functions will actually run and whether
   their companion extension is present on THIS SillyTavern. */
const INTEGRATION_STATE_LABELS = {
    [INTEGRATION_STATES.NONE]: 'Built-in',
    [INTEGRATION_STATES.READY]: '✓ Ready',
    [INTEGRATION_STATES.OUTDATED]: '⚠ Update recommended',
    [INTEGRATION_STATES.MISSING]: '✗ Not installed',
    [INTEGRATION_STATES.DISABLED]: '✗ Disabled',
    [INTEGRATION_STATES.OFF]: '✗ Switched off',
};

function updatePublishFunctions(root) {
    const container = root.querySelector('#storyline_publish_functions');
    if (!container) return;
    /* U3: readFunctionsState returns { entries } — the old code indexed the
       wrapper object, so this list always read "(none configured)". */
    const { entries } = readFunctionsState(root);
    container.replaceChildren();
    let rendered = 0;
    for (const def of BUILT_IN_FUNCTIONS) {
        const entry = entries[def.id];
        if (!entry) continue;
        const row = makeEl('div', 'storyline_token_row');
        const label = makeEl('span', null, `${tr(def.name)} (${tr(FUNCTION_MODE_LABELS[entry.mode] ?? entry.mode)})`);
        const integration = getIntegrationStatus(def.id);
        const ready = integration.state === INTEGRATION_STATES.NONE || integration.state === INTEGRATION_STATES.READY;
        /* OUTDATED still runs — it gets the warn colour but stays usable. */
        const status = makeEl('b', ready ? 'storyline_ok_text' : 'storyline_warn_text', tr(INTEGRATION_STATE_LABELS[integration.state]));
        if (!ready) status.title = describeIntegrationStatus(integration);
        row.append(label, status);
        container.append(row);
        rendered += 1;
    }
    if (!rendered) {
        const empty = makeEl('div', 'storyline_token_row');
        empty.append(makeEl('span', null, tr('(none added)')), makeEl('b', null, '—'));
        container.append(empty);
    }
}

/* Readiness (v0.2.0): turns the data the editor already has into concrete,
   clickable guidance. Each item jumps to the tab/field to fix. */
function computeReadiness(root) {
    const items = [];
    const value = (id) => String(root.querySelector(`#${id}`)?.value ?? '').trim();
    const add = (level, text, tab, focusId = null) => items.push({ level, text, tab, focusId });

    if (!value('storyline_editor_title')) add('warn', tr('Give the storyline a title.'), 'story', 'storyline_editor_title');
    if (!value('storyline_editor_plot_ai')) add('warn', tr('World & Plot is empty — the AI has no setting to work from.'), 'story', 'storyline_editor_plot_ai');
    else add('ok', tr('World & Plot is written.'), 'story', 'storyline_editor_plot_ai');
    if (!value('storyline_editor_plot_summary')) add('info', tr('No pitch — the Library and Start screen will show only the title.'), 'story', 'storyline_editor_plot_summary');

    const openings = Array.from(root.querySelectorAll(`${SCENARIO_ROWS} .storyline_scenario_row_content`));
    if (!openings.length) add('info', tr('No opening — sessions start blank and the player writes first.'), 'openings');
    else if (openings.some((textarea) => !textarea.value.trim())) add('warn', tr('An opening has no text — empty openings are skipped.'), 'openings');
    else add('ok', openings.length === 1 ? tr('1 opening ready.') : tr('{n} openings ready.', { n: openings.length }), 'openings');

    const castRows = Array.from(root.querySelectorAll(CAST_ROWS));
    const missing = castRows.filter((row) => row.classList.contains('storyline_cast_row_missing'));
    if (missing.length) {
        const names = missing.map((row) => row.dataset.name).join(', ');
        add('warn', missing.length === 1
            ? tr('1 linked card is missing (renamed or deleted): {names}.', { names })
            : tr('{n} linked cards are missing (renamed or deleted): {names}.', { n: missing.length, names }), 'cast');
    }
    const fullRows = castRows.filter((row) => row.querySelector('.storyline_cast_full')?.getAttribute('aria-pressed') === 'true');
    if (fullRows.length) {
        const fullTokens = fullRows.reduce((sum, row) => sum + cardTokenEstimate(findCardByAvatar(row.dataset.avatar)), 0);
        add(fullTokens > 6000 ? 'warn' : 'info', fullRows.length === 1
            ? tr('1 Full card ≈ {tokens} tokens when present — make sure the model\'s context can hold it.', { tokens: formatNumber(fullTokens) })
            : tr('{n} Full cards ≈ {tokens} tokens when present — make sure the model\'s context can hold it.', { n: fullRows.length, tokens: formatNumber(fullTokens) }), 'cast');
    }

    const { entries } = readFunctionsState(root);
    for (const def of BUILT_IN_FUNCTIONS) {
        if (!entries[def.id]) continue;
        const integration = getIntegrationStatus(def.id);
        if (integration.state !== INTEGRATION_STATES.NONE && integration.state !== INTEGRATION_STATES.READY) {
            const params = { name: tr(def.name), status: describeIntegrationStatus(integration) };
            add('warn', integration.state === INTEGRATION_STATES.OUTDATED
                ? tr('{name}: {status}', params)
                : tr('{name}: {status} Players without it can still play — the function is simply left out.', params), 'extras');
        }
    }

    const storyteller = value('storyline_editor_storyteller_prompt');
    if (estimateTokens(storyteller) > STORYTELLER_TOKEN_LIMIT) add('warn', tr('Narration Style is over the {limit}-token limit.', { limit: formatNumber(STORYTELLER_TOKEN_LIMIT) }), 'narration');

    const total = Number(String(root.querySelector('#storyline_token_total')?.textContent ?? '0').replace(/[^\d]/g, '')) || 0;
    if (total > 4000) add('warn', tr('Fixed prompt is ≈ {tokens} tokens — small-context models will have little room left for the story.', { tokens: formatNumber(total) }), 'check');

    const lorebookNames = Array.from(root.querySelectorAll(`${LOREBOOK_ROWS} .storyline_lorebook_row_name`)).map((select) => select.value);
    if (lorebookNames.some((name) => !name)) add('warn', tr('A lorebook row has no World Info file selected — it will be dropped on save.'), 'extras');
    if (new Set(lorebookNames.filter(Boolean)).size !== lorebookNames.filter(Boolean).length) add('warn', tr('The same lorebook is linked twice — duplicates are dropped on save.'), 'extras');

    return items;
}

function renderReadiness(root) {
    const container = root.querySelector('#storyline_readiness');
    if (!container) return;
    const items = computeReadiness(root);
    const order = { warn: 0, info: 1, ok: 2 };
    items.sort((a, b) => order[a.level] - order[b.level]);
    const icons = { warn: 'fa-solid fa-triangle-exclamation', info: 'fa-solid fa-circle-info', ok: 'fa-solid fa-circle-check' };
    container.replaceChildren(...items.map((item) => {
        const row = makeButton({ icon: icons[item.level], label: item.text, className: `storyline_readiness_item storyline_readiness_${item.level}` });
        row.title = tr('Go to this setting');
        row.addEventListener('click', () => {
            uiState(root).activateTab?.(item.tab);
            if (item.focusId) {
                const field = root.querySelector(`#${CSS.escape(item.focusId)}`);
                field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                field?.focus({ preventScroll: true });
            }
        });
        return row;
    }));
    const warnings = items.filter((item) => item.level === 'warn').length;
    const badge = root.querySelector('#storyline_check_badge');
    if (badge) {
        badge.textContent = String(warnings);
        badge.classList.toggle('storyline_hidden', warnings === 0);
    }
}

function refreshDirty(root) {
    const ui = uiState(root);
    if (ui.snapshot === null || !ui.collect) return;
    const dirty = ui.collect() !== ui.snapshot;
    const was = root.dataset.storylineDirty === '1';
    if (dirty !== was) root.dataset.storylineDirty = dirty ? '1' : '';
}

/* The typed field's own counter repaints immediately (see onEditorInput);
   totals, header chips, readiness, dirty state and integration probes
   refresh on a short debounce so keystrokes don't rebuild the summary. */
const SUMMARY_DEBOUNCE = 150;

function refreshSummaryNow(root) {
    const ui = uiState(root);
    if (ui.summaryTimer) {
        clearTimeout(ui.summaryTimer);
        ui.summaryTimer = null;
    }
    renumberScenarios(root);
    refreshCastMeta(root);
    refreshLorebookMeta(root);
    updateTokenCounters(root);
    refreshDirty(root);
    updateEditorHero(root);
    renderReadiness(root);
    const functionsJson = root.querySelector(FUNCTIONS_JSON_FIELD)?.value ?? '';
    if (functionsJson !== ui.lastFunctionsJson) {
        ui.lastFunctionsJson = functionsJson;
        updatePublishFunctions(root);
    }
}

function scheduleSummaryRefresh(root) {
    const ui = uiState(root);
    if (ui.summaryTimer) clearTimeout(ui.summaryTimer);
    ui.summaryTimer = setTimeout(() => {
        ui.summaryTimer = null;
        if (root.isConnected) refreshSummaryNow(root);
    }, SUMMARY_DEBOUNCE);
}

function wireTabs(root) {
    const tabs = root.querySelectorAll('.storyline_tab');
    const panels = root.querySelectorAll('.storyline_tab_panel');
    const body = root.querySelector('.storyline_shell_body');
    const activate = (target) => {
        const subviewOpen = root.querySelector('.storyline_subview_open');
        if (subviewOpen) {
            if (subviewOpen.id === 'storyline_storyteller_subview') {
                if (!commitStorytellerSubview(root)) return;
            } else {
                closeSubview(root, subviewOpen);
            }
        }
        for (const entry of tabs) {
            const active = entry.dataset.tab === target;
            entry.classList.toggle('storyline_tab_active', active);
            entry.setAttribute('aria-selected', active ? 'true' : 'false');
            entry.tabIndex = active ? 0 : -1;
        }
        for (const panel of panels) panel.classList.toggle('storyline_tab_panel_active', panel.dataset.panel === target);
        body?.scrollTo({ top: 0 });
        if (target === 'check') refreshSummaryNow(root);
    };
    uiState(root).activateTab = activate;
    const tabList = Array.from(tabs);
    for (const tab of tabList) {
        upgradeControl(tab, { role: 'tab', label: tab.textContent.trim() });
        tab.addEventListener('click', () => activate(tab.dataset.tab));
        /* Arrow-key navigation between tabs (WAI-ARIA tabs pattern). */
        tab.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const index = tabList.indexOf(tab);
            const next = tabList[(index + (event.key === 'ArrowRight' ? 1 : tabList.length - 1)) % tabList.length];
            next.focus();
            activate(next.dataset.tab);
        });
    }
    activate('story');
}

/* ---------------------------------------------------------------------------
 * Collect (DOM → storyline). Field IDs are the data contract.
 * ------------------------------------------------------------------------ */

function collectStoryline(root, storyline) {
    /* Shallow copy — the banner (often tens of KB) stays by reference;
       collectStoryline never writes to it. */
    const collected = {
        ...storyline,
        defaultChatSettings: { ...storyline.defaultChatSettings },
        settings: { ...storyline.settings },
    };
    collected.title = root.querySelector('#storyline_editor_title').value.trim() || UNTITLED;
    collected.language = root.querySelector('#storyline_editor_language').value;
    collected.category = root.querySelector('#storyline_editor_category').value.trim();
    collected.plotSummary = root.querySelector('#storyline_editor_plot_summary').value;
    collected.plotUser = root.querySelector('#storyline_editor_plot_user').value;
    collected.plotAI = root.querySelector('#storyline_editor_plot_ai').value;
    collected.storytellerPrompt = root.querySelector('#storyline_editor_storyteller_prompt').value;
    collected.promptGuideline = root.querySelector('#storyline_editor_prompt_guideline').value;
    collected.aiReminder = root.querySelector('#storyline_editor_ai_reminder').value;
    collected.aiOutputReminder = root.querySelector('#storyline_editor_ai_output_reminder').value;
    collected.defaultChatSettings.perspective = String(root.querySelector('#storyline_editor_default_perspective').value);
    collected.settings.maxTokensPerCharacter = Number(root.querySelector('#storyline_editor_max_tokens_per_char').value);
    collected.settings.maxTotalCharacterTokens = Number(root.querySelector('#storyline_editor_max_total_char_tokens').value);
    collected.settings.relevanceWindow = Number(root.querySelector('#storyline_editor_relevance_window').value);
    collected.settings.speakerLabel = root.querySelector('#storyline_editor_speaker_label').value.trim() || 'Narrator';

    collected.firstMessages = Array.from(root.querySelectorAll(SCENARIO_ROWS)).map((row) => ({
        id: row.dataset.id || uuidv4(),
        title: row.querySelector('.storyline_scenario_row_title').value.trim() || 'Opening',
        content: row.querySelector('.storyline_scenario_row_content').value,
    }));

    collected.characters = Array.from(root.querySelectorAll(CAST_ROWS))
        .map((row) => {
            const avatar = String(row.dataset.avatar ?? '');
            if (!avatar) return null;
            const original = row.__storylineLink && typeof row.__storylineLink === 'object' ? row.__storylineLink : {};
            return {
                ...original,
                avatar,
                name: String(row.dataset.name ?? original.name ?? avatar),
                aliases: row.querySelector('.storyline_character_row_aliases').value
                    .split(',')
                    .map((alias) => alias.trim())
                    .filter(Boolean),
                note: row.querySelector('.storyline_character_row_note').value,
                alwaysInclude: row.querySelector('.storyline_cast_always').getAttribute('aria-pressed') === 'true',
                full: row.querySelector('.storyline_cast_full').getAttribute('aria-pressed') === 'true',
            };
        })
        .filter(Boolean);

    const seenBooks = new Set();
    collected.lorebooks = Array.from(root.querySelectorAll(LOREBOOK_ROWS))
        .map((row) => {
            const name = String(row.querySelector('.storyline_lorebook_row_name').value ?? '');
            if (!name || seenBooks.has(name)) return null;
            seenBooks.add(name);
            const original = row.__storylineLink && typeof row.__storylineLink === 'object' ? row.__storylineLink : {};
            return {
                ...original,
                name,
                mode: row.querySelector('.storyline_lorebook_row_mode').value === 'full' ? 'full' : 'smart',
                maxTokens: Number(row.querySelector('.storyline_lorebook_row_tokens').value) || LOREBOOK_TOKENS_DEFAULT,
                enabled: original.enabled !== false,
            };
        })
        .filter(Boolean);

    collected.userCard = { avatar: String(root.querySelector('#storyline_editor_user_card').value ?? '') };

    const functionsState = readFunctionsState(root);
    const functionsEntries = Object.fromEntries(Object.entries(functionsState.entries).map(([id, entry]) => {
        const def = BUILT_IN_FUNCTIONS.find((builtIn) => builtIn.id === id);
        const text = String(entry.instruction ?? '').trim();
        return [id, {
            mode: entry.mode,
            instruction: def && text && text !== def.defaultInstruction.trim() ? entry.instruction : '',
        }];
    }));
    collected.functions = {
        entries: functionsEntries,
        prompt: root.querySelector('#storyline_editor_functions_prompt').value,
        reminder: root.querySelector('#storyline_editor_functions_reminder').value,
    };

    return collected;
}

function formatTimestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/* ---------------------------------------------------------------------------
 * Entry point.
 * ------------------------------------------------------------------------ */

const openEditors = new Map();

export async function openStorylineEditor(storylineId, { onSaved } = {}) {
    /* U10: one editor per storyline — a second open (Library + Hub) used to
       build a second editor whose save silently overwrote the first. */
    const key = storylineId || `new:${uuidv4()}`;
    if (storylineId && openEditors.has(storylineId)) {
        toastr.info(tr('This storyline is already open in an editor.'), 'Storyline');
        return openEditors.get(storylineId);
    }
    const run = openStorylineEditorInner(storylineId, { onSaved });
    openEditors.set(key, run);
    try {
        return await run;
    } finally {
        openEditors.delete(key);
    }
}

async function openStorylineEditorInner(storylineId, { onSaved } = {}) {
    const base = storylineId ? getStoryline(storylineId) : null;
    if (storylineId && !base) {
        toastr.error(tr('Storyline "{id}" not found.', { id: storylineId }), 'Storyline');
        return;
    }
    const storyline = base ? structuredClone(base) : createDefaultStoryline();
    const originalBanner = String(storyline.banner ?? '');

    const content = await renderExtensionTemplateAsync('third-party/Storyline', 'templates/editor');
    const root = $(content)[0];
    localizeTree(root);
    root.querySelector('#storyline_editor_hero_eyebrow').textContent = base ? tr('Editing storyline') : tr('New storyline');

    const setValue = (id, value) => {
        root.querySelector(`#${id}`).value = value ?? '';
    };
    setValue('storyline_editor_title', base ? storyline.title : '');
    setValue('storyline_editor_language', storyline.language ?? '');
    setValue('storyline_editor_category', storyline.category);
    setValue('storyline_editor_plot_summary', storyline.plotSummary);
    setValue('storyline_editor_plot_user', storyline.plotUser);
    setValue('storyline_editor_plot_ai', storyline.plotAI);
    setValue('storyline_editor_storyteller_prompt', storyline.storytellerPrompt);
    setValue('storyline_editor_prompt_guideline', storyline.promptGuideline);
    setValue('storyline_editor_ai_reminder', storyline.aiReminder);
    setValue('storyline_editor_ai_output_reminder', storyline.aiOutputReminder);
    setValue('storyline_editor_functions_prompt', storyline.functions?.prompt ?? '');
    setValue('storyline_editor_functions_reminder', storyline.functions?.reminder ?? '');
    /* Enforce the limits from constants (single source of truth). */
    root.querySelector('#storyline_editor_functions_prompt').maxLength = FUNCTIONS_PROMPT_TOKEN_LIMIT * CHARS_PER_TOKEN;
    root.querySelector('#storyline_editor_functions_reminder').maxLength = FUNCTIONS_REMINDER_TOKEN_LIMIT * CHARS_PER_TOKEN;
    setValue('storyline_editor_default_perspective', storyline.defaultChatSettings.perspective);
    setValue('storyline_editor_max_tokens_per_char', storyline.settings.maxTokensPerCharacter);
    setValue('storyline_editor_max_total_char_tokens', storyline.settings.maxTotalCharacterTokens);
    setValue('storyline_editor_relevance_window', storyline.settings.relevanceWindow);
    setValue('storyline_editor_speaker_label', storyline.settings.speakerLabel);
    root.querySelector('#storyline_detail_id').textContent = storyline.id;
    root.querySelector('#storyline_detail_created').textContent = formatTimestamp(storyline.metadata.created);
    root.querySelector('#storyline_detail_modified').textContent = formatTimestamp(storyline.metadata.modified);

    /* Legacy "Plot (User)" (v0.2.0): never displayed anywhere — offer a merge
       into the Pitch instead of keeping a dead field in the editor. */
    const legacyNote = root.querySelector('#storyline_legacy_plot_user');
    const plotUserField = root.querySelector('#storyline_editor_plot_user');
    const refreshLegacyNote = () => {
        const legacy = plotUserField.value.trim();
        legacyNote.classList.toggle('storyline_hidden', !legacy);
        root.querySelector('#storyline_legacy_plot_user_meta').textContent = legacy ? tr('({chars} characters)', { chars: formatNumber(legacy.length) }) : '';
    };
    const mergeButton = root.querySelector('.storyline_act_merge_plot_user');
    upgradeControl(mergeButton, { label: tr('Merge into Pitch') });
    mergeButton.addEventListener('click', () => {
        const pitch = root.querySelector('#storyline_editor_plot_summary');
        const legacy = plotUserField.value.trim();
        if (!legacy) return;
        pitch.value = [pitch.value.trim(), legacy].filter(Boolean).join('\n\n');
        plotUserField.value = '';
        refreshLegacyNote();
        pitch.dispatchEvent(new Event('input', { bubbles: true }));
        toastr.success(tr('Merged into the Pitch. Save to keep it.'), 'Storyline');
    });
    refreshLegacyNote();

    /* Openings */
    const scenariosList = root.querySelector('#storyline_editor_scenarios');
    for (const scenario of storyline.firstMessages) scenariosList.append(buildScenarioRow(scenario));
    const addScenario = root.querySelector('.storyline_act_add_scenario');
    upgradeControl(addScenario, { label: tr('Add Opening') });
    addScenario.addEventListener('click', () => {
        const row = buildScenarioRow({ id: uuidv4(), title: '', content: '' });
        scenariosList.append(row);
        requestRefresh(scenariosList);
        row.querySelector('.storyline_scenario_row_title')?.focus();
    });

    /* Lorebooks */
    const lorebookList = root.querySelector('#storyline_editor_lorebooks');
    const worldNames = () => getContext().getWorldInfoNames?.() ?? [];
    const initialBooks = Array.isArray(storyline.lorebooks) ? storyline.lorebooks : [];
    lorebookList.replaceChildren(...initialBooks.map((link) => buildLorebookRow(link, worldNames())));
    if (initialBooks.length) root.querySelector('#storyline_details_lorebooks').open = true;
    const addLorebook = root.querySelector('.storyline_act_add_lorebook');
    upgradeControl(addLorebook, { label: tr('Link Lorebook') });
    addLorebook.addEventListener('click', () => {
        if (root.querySelectorAll(LOREBOOK_ROWS).length >= MAX_LOREBOOKS) {
            toastr.warning(tr('Up to {max} lorebooks can be linked to one storyline.', { max: MAX_LOREBOOKS }), 'Storyline');
            return;
        }
        const used = new Set(Array.from(root.querySelectorAll(`${LOREBOOK_ROWS} .storyline_lorebook_row_name`)).map((select) => String(select.value ?? '')).filter(Boolean));
        const names = worldNames();
        const free = names.filter((name) => !used.has(name));
        if (!names.length) {
            toastr.info(tr('No World Info files exist yet — create one in the World Info panel first.'), 'Storyline');
            return;
        }
        lorebookList.append(buildLorebookRow({ name: free[0] ?? '', mode: 'smart', maxTokens: LOREBOOK_TOKENS_DEFAULT, enabled: true }, names));
        requestRefresh(lorebookList);
    });

    /* Cast */
    const charactersList = root.querySelector('#storyline_editor_characters');
    for (const link of storyline.characters) charactersList.append(buildCastRow(link));
    const addCharacter = root.querySelector('.storyline_act_add_character');
    upgradeControl(addCharacter, { label: tr('Add characters') });
    addCharacter.addEventListener('click', () => addCharacters(root));
    const castFilter = root.querySelector('#storyline_cast_filter');
    castFilter.addEventListener('input', (event) => {
        event.stopPropagation(); // a filter is not an edit
        const term = castFilter.value.trim().toLowerCase();
        for (const row of root.querySelectorAll(CAST_ROWS)) {
            row.classList.toggle('storyline_hidden', !!term && !String(row.dataset.search ?? '').includes(term));
        }
    });

    /* Player card default */
    const userCardSelect = root.querySelector('#storyline_editor_user_card');
    const userCardHint = root.querySelector('#storyline_editor_user_card_hint');
    const userCardAvatar = root.querySelector('#storyline_editor_user_card_avatar');
    const initialUserCard = String(storyline.userCard?.avatar ?? '');
    const personaOption = makeEl('option', '', tr('Persona ({name})', { name: getContext().name1 ?? 'User' }));
    personaOption.value = '';
    userCardSelect.append(personaOption);
    const seenUserCards = new Set();
    for (const card of getContext().characters ?? []) {
        if (!card?.avatar || seenUserCards.has(card.avatar) || String(card.avatar).startsWith(HOST_CARD_PREFIX)) continue;
        seenUserCards.add(card.avatar);
        const option = makeEl('option', '', String(card.name ?? card.avatar));
        option.value = card.avatar;
        option.dataset.name = String(card.name ?? card.avatar);
        userCardSelect.append(option);
    }
    if (initialUserCard && !seenUserCards.has(initialUserCard)) {
        const option = makeEl('option', '', tr('{name} (missing)', { name: initialUserCard }));
        option.value = initialUserCard;
        option.dataset.name = initialUserCard;
        userCardSelect.append(option);
    }
    userCardSelect.value = initialUserCard;
    const refreshUserCard = () => {
        const selected = String(userCardSelect.value ?? '');
        userCardAvatar.replaceChildren();
        const card = selected ? findCardByAvatar(selected) : null;
        if (card) {
            const img = document.createElement('img');
            img.src = getThumbnailUrl('avatar', selected);
            img.alt = '';
            userCardAvatar.append(img);
        } else {
            userCardAvatar.append(makeEl('i', 'fa-solid fa-user-astronaut fa-fw'));
        }
        userCardHint.textContent = !selected
            ? tr('New sessions use your active persona ("{name}") as the player unless the Start screen picks a card.', { name: getContext().name1 ?? 'User' })
            : tr('"{name}" becomes the player\'s character sheet (never a speaker). The Start screen can still change it per session.', { name: userCardSelect.selectedOptions?.[0]?.dataset?.name ?? selected });
    };
    userCardSelect.addEventListener('change', refreshUserCard);
    refreshUserCard();

    /* Functions — seed the hidden JSON field from the storyline definition
       BEFORE reading it back: without this, every Edit + Save wiped all
       function modes and custom instructions (data loss, invariant #7). */
    writeFunctionsState(root, { entries: structuredClone(storyline.functions?.entries ?? {}) });
    const functionsState = readFunctionsState(root);
    writeFunctionsState(root, functionsState);
    wireFunctionsSubview(root, functionsState);
    if (Object.keys(functionsState.entries).length) root.querySelector('#storyline_details_functions').open = true;

    wireStorytellerSubview(root);

    /* Banner */
    const bannerPreview = root.querySelector('#storyline_editor_banner_preview');
    const bannerInput = root.querySelector('#storyline_editor_banner_input');
    const bannerDrop = root.querySelector('#storyline_banner_drop');
    const heroBanner = root.querySelector('#storyline_editor_hero_banner');
    const heroBannerImg = root.querySelector('#storyline_editor_hero_banner_img');
    const refreshBannerPreview = () => {
        const banner = safeBannerDataUrl(storyline.banner);
        for (const img of [bannerPreview, heroBannerImg]) {
            if (banner) img.src = banner;
            else img.removeAttribute('src');
        }
        bannerPreview.classList.toggle('storyline_banner_empty', !banner);
        bannerDrop.classList.toggle('storyline_banner_has_img', !!banner);
        heroBannerImg.classList.toggle('storyline_hidden', !banner);
        heroBanner.classList.toggle('storyline_editor_hero_banner_has_img', !!banner);
        root.querySelector('.storyline_act_banner_remove').classList.toggle('storyline_hidden', !banner);
    };
    refreshBannerPreview();

    const setBanner = (dataUrl) => {
        storyline.banner = dataUrl;
        refreshBannerPreview();
        requestRefresh(root);
    };
    const uploadButton = root.querySelector('.storyline_act_banner_upload');
    upgradeControl(uploadButton, { label: tr('Upload banner') });
    uploadButton.addEventListener('click', () => bannerInput.click());
    upgradeControl(bannerDrop, { label: tr('Upload banner') });
    bannerDrop.addEventListener('click', () => bannerInput.click());
    const acceptFile = async (file) => {
        if (!file) return;
        try {
            const dataUrl = await fileToResizedDataUrl(file);
            if (dataUrl.length > BANNER_MAX_CHARS) {
                toastr.error(tr('The banner image is too large even after resizing. Try a smaller source image.'), 'Storyline');
                return;
            }
            setBanner(dataUrl);
        } catch (error) {
            toastr.error(String(error?.message ?? error), 'Storyline');
        }
    };
    bannerInput.addEventListener('change', async () => {
        await acceptFile(bannerInput.files?.[0]);
        bannerInput.value = '';
    });
    bannerDrop.addEventListener('dragover', (event) => {
        event.preventDefault();
        bannerDrop.classList.add('storyline_banner_dragover');
    });
    bannerDrop.addEventListener('dragleave', () => bannerDrop.classList.remove('storyline_banner_dragover'));
    bannerDrop.addEventListener('drop', (event) => {
        event.preventDefault();
        bannerDrop.classList.remove('storyline_banner_dragover');
        acceptFile(event.dataTransfer?.files?.[0]);
    });
    const removeBanner = root.querySelector('.storyline_act_banner_remove');
    upgradeControl(removeBanner, { label: tr('Remove banner') });
    removeBanner.addEventListener('click', () => setBanner(''));

    for (const textarea of root.querySelectorAll('textarea')) {
        if (textarea.id !== 'storyline_storyteller_textarea' && textarea.id !== 'storyline_editor_plot_user') {
            wrapWithExpandButton(textarea);
        }
    }

    const exportButton = root.querySelector('.storyline_act_export');
    upgradeControl(exportButton, { label: tr('Export JSON') });
    exportButton.addEventListener('click', () => {
        try {
            downloadStorylineJson(collectStoryline(root, storyline));
        } catch (error) {
            toastr.error(String(error?.message ?? error), 'Storyline');
        }
    });

    for (const details of root.querySelectorAll('details.storyline_details')) {
        details.addEventListener('toggle', () => details.querySelector('summary')?.setAttribute('aria-expanded', details.open ? 'true' : 'false'));
    }

    /* Dirty tracking (U13): the ONLY signal is a JSON compare of the
       collected storyline against the snapshot taken after setup — clicks
       on labels/tabs/accordions no longer flag "Unsaved". */
    const ui = uiState(root);
    ui.collect = () => JSON.stringify(collectStoryline(root, storyline));
    root.addEventListener('input', (event) => {
        const target = event.target;
        if (target instanceof Element && target.id) {
            const row = root.querySelector(`.storyline_token_row[data-token-for="${CSS.escape(target.id)}"]`);
            if (row) paintTokenRow(root, row);
            paintLiveTokens(root, target.id);
        }
        scheduleSummaryRefresh(root);
    });
    root.addEventListener('change', () => scheduleSummaryRefresh(root));
    root.addEventListener('storyline-rows-changed', () => scheduleSummaryRefresh(root));

    wireTabs(root);
    refreshSummaryNow(root);
    ui.snapshot = ui.collect();
    refreshSummaryNow(root);

    /* One-shot in-memory migration: banners saved under the old multi-MB
       limit are re-encoded when the editor opens them — written back ONLY on
       Save. The snapshot follows the re-encode while nothing else changed,
       so a pure open → Cancel never asks "Discard?" (U13). */
    if (typeof storyline.banner === 'string' && storyline.banner.startsWith('data:image/') && storyline.banner.length > BANNER_MAX_CHARS) {
        dataUrlToResizedDataUrl(storyline.banner)
            .then((resized) => {
                if (resized.length > BANNER_MAX_CHARS) {
                    toastr.warning(tr('The banner still exceeds the size limit after re-encoding — remove it and upload a smaller image.'), 'Storyline');
                    return;
                }
                const clean = ui.collect() === ui.snapshot;
                storyline.banner = resized;
                if (clean) ui.snapshot = ui.collect();
                refreshBannerPreview();
                refreshSummaryNow(root);
                toastr.info(tr('The banner was re-encoded to fit the size limit. Save the storyline to keep it.'), 'Storyline');
            })
            .catch((error) => console.warn('[Storyline] Banner migration failed:', error));
    }

    let saved = null;
    const popup = new Popup(root, POPUP_TYPE.TEXT, '', {
        okButton: tr('Save Storyline'),
        cancelButton: tr('Cancel'),
        wide: true,
        large: true,
        onClosing: async (p) => {
            if (p.result !== POPUP_RESULT.AFFIRMATIVE) {
                /* An open Narration subview counts as an edit too. */
                const subviewText = root.querySelector('#storyline_storyteller_subview.storyline_subview_open #storyline_storyteller_textarea')?.value;
                const subviewDirty = subviewText !== undefined
                    && subviewText !== (root.querySelector('#storyline_editor_storyteller_prompt').value || DEFAULT_STORYTELLER_PROMPT);
                if (ui.collect() === ui.snapshot && !subviewDirty) return true;
                const answer = await callGenericPopup(tr('Discard unsaved changes?'), POPUP_TYPE.CONFIRM, '', { okButton: tr('Discard'), cancelButton: tr('Keep editing') });
                /* AFFIRMATIVE = discard: allow the close (ST blocks the close
                   on any falsy return). Anything else keeps editing. */
                return answer === POPUP_RESULT.AFFIRMATIVE;
            }
            /* Save while the Narration subview is open: commit it first. */
            if (!commitStorytellerSubview(root, { silent: true })) return false;
            try {
                saved = saveStoryline(collectStoryline(root, storyline));
                toastr.success(tr('Storyline "{title}" saved.', { title: saved.title }), 'Storyline');
                return true;
            } catch (error) {
                toastr.error(String(error?.message ?? error), 'Storyline');
                return false;
            }
        },
    });
    await popup.show();
    if (ui.summaryTimer) clearTimeout(ui.summaryTimer);
    if (!saved) return;

    onSaved?.(saved);
    /* Runtime cast add (v0.1.15): a card linked mid-story gets its default
       state seeded into the open chat right away — the bridge no-ops unless
       THIS storyline is the chat's storyline. */
    import('../storyline/world-state-bridge.js')
        .then((bridge) => bridge.seedCastStatesAfterStorylineSave(saved.id))
        .catch((error) => console.warn('[Storyline] Post-save cast seed failed:', error));
    /* v0.2.0: a changed banner now reaches the existing host card (the story
       avatar in chats); before, it only applied to brand-new host cards. */
    if (saved.hostAvatar && String(saved.banner ?? '') !== originalBanner) {
        import('../storyline/host.js')
            .then((host) => host.updateHostBanner(saved))
            .then((updated) => {
                if (updated) toastr.success(tr('Story avatar updated with the new banner.'), 'Storyline');
            })
            .catch((error) => {
                console.warn('[Storyline] Banner → host avatar update failed:', error);
                toastr.warning(tr('The banner was saved, but the story avatar could not be updated.'), 'Storyline');
            });
    }
}
