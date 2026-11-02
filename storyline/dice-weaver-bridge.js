/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { getActiveFunctionsForChat, isFunctionCallingAvailable } from './functions.js';
import { ToolManager } from '../../../../../scripts/tool-calling.js';

const DICE_FUNCTION_ID = 'dice_roller';

/* Marker format is owned by Dice Weaver (`[dice:#id outcome total vsDC]`).
   This fallback regex is only used when DiceWeaverAPI.stripMarkers is not
   available; keep it in sync with st-diceweaver/dice.js MARKER_RE. */
const DICE_MARKER_RE = /\[dice:#[0-9a-f]{6,12}(?:[ \t]+(?:crit|critfail|success|fail)(?:[ \t]+-?\d+(?:[ \t]+vs[ \t]*\d+)?)?)?\]/gi;

function getApi() {
    const api = globalThis.DiceWeaverAPI;
    return api && typeof api === 'object' ? api : null;
}

export function isDiceWeaverAvailable() {
    const api = getApi();
    return !!api && typeof api.isEnabled === 'function' && api.isEnabled() === true;
}

export function isDiceFunctionActive(storyline, chatState) {
    return getActiveFunctionsForChat(storyline, chatState).some((fn) => fn.def.id === DICE_FUNCTION_ID);
}

/* Roll outcomes must not re-enter the prompt: DW markers live inside saved
   message text (that is how cards re-render), so history serialization strips
   them — the AI should never see dice numbers or imitate marker syntax. */
export function stripDiceMarkers(text) {
    const api = getApi();
    if (api && typeof api.stripMarkers === 'function') {
        try {
            return api.stripMarkers(text);
        } catch {
            /* fall through to the local regex */
        }
    }
    return String(text ?? '')
        .replace(DICE_MARKER_RE, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd();
}

function isToolPathUsable(generationType) {
    if (!isFunctionCallingAvailable()) return false;
    try {
        return ToolManager.canPerformToolCalls(generationType ?? 'normal');
    } catch {
        return isFunctionCallingAvailable();
    }
}

export function buildDiceContext(storyline, chatState, generationType = null) {
    const info = {
        available: isDiceWeaverAvailable(),
        active: false,
        mode: null,
        toolSupported: false,
        forced: false,
        trigger: '',
    };

    if (!info.available) {
        info.reason = 'Dice Weaver extension not found or disabled';
        return { sections: [], info };
    }

    if (!isDiceFunctionActive(storyline, chatState)) {
        return { sections: [], info };
    }

    info.active = true;
    const api = getApi();
    let mode = 'auto';
    try {
        if (typeof api.getMode === 'function') mode = String(api.getMode() ?? 'auto');
    } catch (error) {
        console.warn('[Storyline] Dice Weaver getMode failed:', error);
    }
    info.mode = mode;
    info.toolSupported = isToolPathUsable(generationType);
    if (typeof api.getTrigger === 'function') {
        try {
            info.trigger = String(api.getTrigger() ?? '').trim();
        } catch {
            info.trigger = '';
        }
    }

    const forcedDirective = typeof api.hasForcedRoll === 'function' && api.hasForcedRoll() && typeof api.getForcedDirective === 'function'
        ? String(api.getForcedDirective() ?? '').trim()
        : '';
    if (forcedDirective) {
        info.forced = true;
        return { sections: [{ id: 'dice', title: 'Dice Rolls', text: forcedDirective }], info };
    }

    const useTool = info.toolSupported && mode !== 'tag_only';
    const paragraphs = [];

    if (useTool) {
        paragraphs.push([
            'Dice rolls: after you finish narrating an action whose outcome is genuinely uncertain and meaningful, call the roll_dice tool as the LAST part of your reply, as the only tool call of that reply.',
            'Args: character = the exact name of the acting character from this story (per-character dice rules apply to them); action = short and vivid; dc = difficulty; optional advantage ("adv"/"dis"), stat_label ("STR 3"), stat_value (number), formula ("1d20+3"), note.',
            'The system rolls and renders the result to the player. NEVER invent dice numbers, totals or outcomes yourself, and do not narrate the result — the roll card appears after your message.',
        ].join('\n'));
    }

    paragraphs.push([
        useTool ? 'Fallback when you cannot call the tool: ' : 'Dice rolls: ',
        'end your reply with exactly one roll line and write nothing after it:',
        '<roll char="Character name" stat="STR 3" stat_value="3" dc="10" adv="" note="brief reason">the action being attempted</roll>',
        'char is the exact name of the acting character from this story (per-character dice rules apply to them).',
        'The system rolls and replaces the line with a result card. Never write dice numbers, totals or outcomes yourself.',
    ].join('\n'));

    return { sections: [{ id: 'dice', title: 'Dice Rolls', text: paragraphs.join('\n\n') }], info };
}
