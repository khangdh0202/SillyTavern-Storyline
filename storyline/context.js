import { chat, name1, max_context, substituteParams, getMaxPromptTokens } from '../../../../../script.js';
import { power_user } from '../../../../../scripts/power-user.js';
import { IGNORE_SYMBOL } from '../../../../../scripts/constants.js';
import {
    DEFAULT_STORYTELLER_PROMPT,
    DEFAULT_OUTPUT_REMINDER,
    DEFAULT_FUNCTIONS_REMINDER,
    PERSPECTIVE_INSTRUCTIONS,
    CONTINUE_INSTRUCTION,
    IMPERSONATE_INSTRUCTION,
    CHARS_PER_TOKEN,
    LOREBOOK_SCAN_MESSAGES,
} from './constants.js';
import { dropLegacyDefault } from './legacy-prompts.js';
import { getStoryline } from './storage.js';
import { readChatState, getChatSettings } from './chat.js';
import { selectRelevantCharacters, getCardText, getCardBookEntries, resolveCard, truncateToTokenBudget, estimateTokens } from './characters.js';
import { getUsableFunctionsForChat, getEffectiveInstruction, isFunctionCallingAvailable } from './functions.js';
import { buildNpcSection, listNpcs } from './data.js';
import { buildLorebookContext } from './lorebooks.js';
import { buildWorldStateContext, isWorldStateAvailable, isWorldStateFunctionActive, resolveName } from './world-state-bridge.js';
import { buildDiceContext, stripDiceMarkers } from './dice-weaver-bridge.js';
import { buildMemoryContext, RECENT_WINDOW as RECENT_SCAN_MESSAGES } from './memory-weaver-bridge.js';
import { getHostInfo } from './host.js';

export let lastBuildInfo = null;

/* Prompt budget planner (invariant #20): the override must fit max_context.
   The override owns ~70% of the window; system blocks + tail instructions go
   first, history gets whatever remains (never below MIN_HISTORY_BUDGET).
   ST does NOT trim the overridden prompt afterwards (script.js hands
   generate_data.prompt straight to the network), so overflowing here means
   an API error or silent server-side cut — this planner is the only guard. */
const PROMPT_BUDGET_SHARE = 0.7;
const MIN_HISTORY_BUDGET = 256;

/* Cut scale — cheapest narrative loss first. Protected (never listed):
   storyteller, functions, reminder, persona, the player's world_state sheet,
   tail output rules. */
const BUDGET_CUT_SCALE = [
    { id: 'npcs', label: 'Known NPCs' },
    { id: 'characters', label: 'Relevant Characters (from #2)', keepFirst: true },
    { id: 'lorebooks', label: 'World Lorebooks' },
    { id: 'world_state_directory', label: 'Character State Directory' },
    { id: 'memories', label: 'Story Memories' },
    { id: 'scene', label: 'Current Scene' },
    { id: 'world_time', label: 'World Time' },
];

/* v0.2.0 (C4): the ACTIVE persona's description lives in
   power_user.persona_description (what {{persona}} resolves to).
   persona_descriptions is keyed by persona AVATAR, never by name1 — the old
   name1 lookup almost never hit and fell through to the default persona
   (wrong persona whenever a per-chat / non-default persona was active). */
function getPersonaDescription() {
    const active = power_user?.persona_description;
    if (typeof active === 'string' && active.trim()) return active.trim();
    return '';
}

/* Usable prompt window for the CURRENT API (v0.2.0 — C1). `max_context` is
   the text-completion slider only; chat completion uses
   oai_settings.openai_max_context. getMaxPromptTokens() picks the right one
   per API and already subtracts the response length. */
export function getPromptWindowTokens() {
    try {
        const tokens = Number(getMaxPromptTokens());
        if (Number.isFinite(tokens) && tokens > 0) return tokens;
    } catch (error) {
        console.warn('[Storyline] getMaxPromptTokens failed, falling back to max_context:', error);
    }
    return Number(max_context);
}

/* Eligible history, oldest → newest. v0.2.0:
   - C3: on a swipe ST pops the message being swiped only from ITS copy of
     the chat (script.js coreChat.pop()); the global `chat` still holds it.
     Mirror that, otherwise the model sees the reply it is re-writing as
     already told and writes the next beat instead of an alternative.
   - C6: history is NOT macro-substituted (ST never does it either —
     re-running {{setvar}}/{{roll}}/{{random}} in old messages every
     generation mutated variables and rewrote the past).
   - P1: walk newest → oldest and stop once both the scan windows and the
     largest possible history budget are covered (O(budget), not O(chat)). */
/* Tool runs in history: the old `[Story tool] name({json}) => result` line
   looked like callable syntax, and models copied it into replies as plain
   text — the "call" never ran and nothing was updated. History now carries a
   past-tense record without the arguments, and fake transcripts already
   written into replies are stripped so they do not teach the pattern. */
const FAKE_TOOL_LINE_RE = /^[ \t]*(?:\[Story tool\][ \t]*)?[a-z_][a-z0-9_]*\(\s*\{[^\n]*\}\s*\)[ \t]*=>[^\n]*$/gim;

export function hasFakeToolTranscript(text) {
    FAKE_TOOL_LINE_RE.lastIndex = 0;
    return FAKE_TOOL_LINE_RE.test(String(text ?? ''));
}

export function stripFakeToolTranscripts(text) {
    const input = String(text ?? '');
    if (!hasFakeToolTranscript(input)) return input;
    return input
        .replace(FAKE_TOOL_LINE_RE, '')
        /* The scene-break dash models put before the fake block. */
        .replace(/\n+[ \t]*[\u2014\u2013-]{1,3}[ \t]*\s*$/, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function collectHistoryMessages(type, { minMessages = 0, maxTokens = Infinity } = {}) {
    const items = [];
    const source = type === 'swipe' ? chat.slice(0, -1) : chat;
    let tokens = 0;
    for (let i = source.length - 1; i >= 0; i--) {
        if (items.length >= minMessages && tokens > maxTokens) break;
        const mes = source[i];
        const toolInvocations = Array.isArray(mes?.extra?.tool_invocations) ? mes.extra.tool_invocations : null;
        if (mes?.is_system && !toolInvocations) continue;
        if (mes?.extra?.type === 'narrator') continue;
        if (mes?.extra?.[IGNORE_SYMBOL]) continue;
        let content;
        if (toolInvocations) {
            const lines = toolInvocations.map((invocation) => {
                const result = String(invocation?.result ?? '').trim().slice(0, 400);
                return `- ${invocation?.name ?? 'tool'}: ${result || 'done'}`;
            });
            content = `(System record, not story text: the system already ran these tools through the tool interface. Never write a record like this in a reply.)\n${lines.join('\n')}`;
        } else {
            content = stripDiceMarkers(String(mes?.mes ?? '').trim());
            if (!mes?.is_user) content = stripFakeToolTranscripts(content);
        }
        if (!content) continue;
        items.push({ isUser: mes.is_user === true || !!toolInvocations, content });
        tokens += estimateTokens(content) + 8;
    }
    return items.reverse();
}

/* Fit the collected history into the token budget, newest first. The latest
   message is ALWAYS kept — it is the player's action — and is truncated to
   the remaining budget when it alone would overflow the whole allocation. */
function trimHistoryToBudget(items, tokenBudget) {
    let used = 0;
    let count = 0;
    let truncated = false;
    for (let i = items.length - 1; i >= 0; i--) {
        const cost = estimateTokens(items[i].content) + 8;
        if (count === 0 && cost > tokenBudget) {
            const shrunk = truncateToTokenBudget(items[i].content, Math.max(1, tokenBudget - 8));
            items = [...items.slice(0, i), { ...items[i], content: shrunk }, ...items.slice(i + 1)];
            truncated = true;
        } else if (count > 0 && used + cost > tokenBudget) {
            break;
        }
        used += estimateTokens(items[i].content) + 8;
        count++;
    }
    return { history: items.slice(items.length - count), truncated };
}

/* Effective player card for THIS chat: the per-chat choice (picked at chat
   start) wins; 'storyline' mode falls back to the storyline definition and
   legacy chats without a mode behave exactly like 'storyline'. */
function resolvePlayerCardAvatar(storyline, chatState) {
    const chatSettings = chatState?.settings ?? {};
    if (chatSettings.userCardMode === 'persona') return '';
    if (chatSettings.userCardMode === 'card') return String(chatSettings.userCardAvatar ?? '').trim();
    return String(storyline?.userCard?.avatar ?? '').trim();
}

/* The Player section. With no player card set the section is exactly the old
 * persona block ("The player plays as ..." + persona description). With a
 * player card set, the card's description/personality become the player's
 * character sheet (per-character token cap), and the persona description is
 * kept as secondary notes. The card is never a speaker or the chat host. */
async function buildPlayerSection(storyline, settings, chatState) {
    const info = { avatar: '', name: '', tokens: 0, source: 'none', fallback: '', mode: 'storyline' };
    const persona = getPersonaDescription();
    const chatName = String(name1 ?? '').trim() || 'the player';
    const mode = chatState?.settings?.userCardMode;
    info.mode = mode === 'persona' || mode === 'card' ? mode : 'storyline';
    const avatar = resolvePlayerCardAvatar(storyline, chatState);
    let cardBody = '';
    let cardName = '';

    if (avatar) {
        info.avatar = avatar;
        const card = await resolveCard(avatar);
        if (card) {
            const cardText = getCardText(card);
            cardName = cardText.name.trim();
            const perBudget = Math.max(0, Number(settings.maxTokensPerCharacter) || 0);
            const parts = [];
            if (cardText.description.trim()) parts.push(truncateToTokenBudget(cardText.description, perBudget));
            if (cardText.personality.trim()) {
                const remaining = Math.max(0, perBudget - estimateTokens(parts.join('\n\n')));
                const personality = truncateToTokenBudget(cardText.personality, remaining);
                if (personality) parts.push(personality);
            }
            cardBody = parts.join('\n\n').trim();
            info.name = cardName;
        } else {
            info.fallback = 'card not found — persona used instead';
            console.warn(`[Storyline] Player card "${avatar}" was not found — falling back to the persona description.`);
        }
    }

    if (!cardBody && !persona) return { text: '', info };

    const lines = [];
    if (cardBody && cardName && cardName.toLowerCase() !== chatName.toLowerCase()) {
        lines.push(`The player plays as "${cardName}" \u2014 the same person as "${chatName}" in the chat.`);
    } else {
        lines.push(`The player plays as "${chatName}".`);
    }
    if (cardBody) {
        lines.push(`[Player character${cardName ? `: ${cardName}` : ''}]`, cardBody);
        info.tokens = estimateTokens(cardBody);
        info.source = 'card';
    }
    if (persona) {
        lines.push(cardBody ? `Player persona notes:\n${persona}` : persona);
        if (!cardBody) info.source = 'persona';
    }
    return { text: lines.join('\n\n'), info };
}

export async function buildStorylineContext({ type = 'normal', options = {} } = {}) {
    const chatState = readChatState();
    if (!chatState) return null;

    const storyline = getStoryline(chatState.storylineId);
    if (!storyline) {
        console.warn(`[Storyline] Storyline "${chatState.storylineId}" referenced by this chat no longer exists. Skipping Storyline context.`);
        window.toastr?.error?.('The Storyline linked to this chat was not found. Detach it via the Storylines menu or restore the storyline.', 'Storyline');
        return null;
    }

    const settings = storyline.settings;
    const perspective = getChatSettings().perspective;

    const sections = [];
    const addSection = (id, title, content) => {
        const text = substituteParams(String(content ?? '')).trim();
        if (text) sections.push({ id, title, text });
    };

    const storytellerOverride = dropLegacyDefault('storyteller', chatState.settings?.storytellerPromptOverride).trim();
    const storytellerBase = storytellerOverride || storyline.storytellerPrompt.trim() || DEFAULT_STORYTELLER_PROMPT;
    const storytellerText = `${storytellerBase}\n\n${PERSPECTIVE_INSTRUCTIONS[perspective]}`;
    addSection('storyteller', 'Storyteller Instructions', storytellerText);
    addSection('plot', 'Story Context', storyline.plotAI);
    addSection('guideline', 'Story Guidelines', storyline.promptGuideline);

    /* Collect ALL eligible history first: the planner needs the full
       system-side token cost before it can decide how much history fits, and
       the lorebook key scan runs over a slice of the same window. */
    const windowTokens = getPromptWindowTokens();
    /* Non-finite window should never happen, but NaN would poison every
       comparison below AND trimHistoryToBudget — disable the planner instead
       of silently keeping an overflowing prompt. */
    const contextShare = Number.isFinite(windowTokens) && windowTokens > 0
        ? Math.floor(windowTokens * PROMPT_BUDGET_SHARE)
        : Infinity;
    const allHistory = collectHistoryMessages(type, {
        minMessages: Math.max(LOREBOOK_SCAN_MESSAGES, RECENT_SCAN_MESSAGES, Number(settings.relevanceWindow) || 6),
        maxTokens: contextShare,
    });

    /* Linked lorebooks (v0.1.23): the ONLY path World Info content reaches a
       Storyline prompt — ST never activates the linked books here (the
       selected character is the host card) and the override discards ST's
       own activation output anyway. */
    const lorebookContext = await buildLorebookContext(
        storyline,
        allHistory.slice(-LOREBOOK_SCAN_MESSAGES).map((item) => item.content),
    );
    for (const section of lorebookContext.sections) {
        addSection('lorebooks', section.title, section.text);
    }

    const activeFunctions = getUsableFunctionsForChat(storyline, chatState);
    if (activeFunctions.length) {
        const functionLines = ['The story AI has the following functions available while writing. Tool functions are real tools the AI can call; context-only functions only add guidance or context and expose no tool — never pretend to call them. Follow each function\'s usage guidance.'];
        for (const activeFunction of activeFunctions) {
            const toolLabel = activeFunction.def.toolName ? `tool: ${activeFunction.def.toolName}` : 'context-only, no tool';
            functionLines.push(`[${activeFunction.def.name} \u2014 ${toolLabel}]\n${getEffectiveInstruction(activeFunction)}`);
        }
        const functionsPrompt = storyline.functions?.prompt?.trim();
        if (functionsPrompt) {
            functionLines.push(`Game mechanics and rules for these functions:\n${functionsPrompt}`);
        }
        if (!isFunctionCallingAvailable()) {
            functionLines.push('NOTE: The current model or API does not support function calling, so these tools cannot actually run. Do not pretend to call them; continue writing the story normally.');
        }
        addSection('functions', 'Story Functions', functionLines.join('\n\n'));
    }

    addSection('reminder', 'Important Story Facts', storyline.aiReminder);

    const playerSection = await buildPlayerSection(storyline, settings, chatState);
    addSection('persona', 'The Player', playerSection.text);

    const windowSize = Math.max(1, Number(settings.relevanceWindow) || 6);
    const recentTexts = allHistory.slice(-windowSize).map((item) => item.content);
    const { relevant, missing } = await selectRelevantCharacters(storyline, recentTexts);
    const relevantLinks = relevant.map(({ link }) => link);

    /* Hoisted for the budget planner: step 2 of the cut scale rebuilds the
       characters section from these parts (keep the first character, keep
       every FULL-card part — the user explicitly owns those tokens). */
    const characterParts = [];
    const characterPartFull = [];
    const skippedCharacters = [];
    if (relevant.length) {
        /* Only REGULAR parts count toward maxTotalCharacterTokens — full-card
           parts are user-owned and must not starve (or drive a negative
           perBudget for) the regular cast listed after them. */
        let totalUsed = 0;
        for (const { link, card } of relevant) {
            const cardText = getCardText(card);
            /* Full-card links bypass every budget — the user owns the token
               cost; the real size is still counted for the planner. Regular
               links past the cap are SKIPPED (continue, not break): a later
               full card must still make it into the prompt (D1). */
            if (!link.full && totalUsed >= settings.maxTotalCharacterTokens) {
                skippedCharacters.push(cardText.name || link.name);
                continue;
            }
            const perBudget = Math.max(0, Math.min(settings.maxTokensPerCharacter, settings.maxTotalCharacterTokens - totalUsed));
            let body = '';
            if (link.note.trim()) body += `${link.note.trim()}\n\n`;
            if (link.full) {
                if (cardText.description.trim()) body += `${cardText.description.trim()}\n\n`;
                if (cardText.personality.trim()) body += `[Personality & inner core]\n${cardText.personality.trim()}\n\n`;
                if (cardText.scenario.trim()) body += `[Scenario — world & setting]\n${cardText.scenario.trim()}\n\n`;
                for (const bookEntry of getCardBookEntries(card)) {
                    body += `[Lorebook: ${bookEntry.name}]\n${bookEntry.content}\n\n`;
                }
            } else {
                if (cardText.description.trim()) body += `${truncateToTokenBudget(cardText.description, perBudget)}\n\n`;
                if (cardText.personality.trim()) {
                    body += truncateToTokenBudget(cardText.personality, Math.max(0, perBudget - estimateTokens(body)));
                }
            }
            const displayName = cardText.name || link.name;
            /* No substituteParams here — addSection already applies it
               (double substitution re-evaluated macros). */
            const part = `[Character: ${displayName}${link.full ? ' \u2014 FULL CARD' : ''}]\n${body.trim()}`;
            if (!link.full) totalUsed += estimateTokens(part);
            characterParts.push(part);
            characterPartFull.push(!!link.full);
        }
        addSection('characters', 'Relevant Characters', characterParts.join('\n\n'));
    }

    let trackedNames = null;
    if (isWorldStateFunctionActive(storyline, chatState) && isWorldStateAvailable()) {
        trackedNames = new Set(listNpcs().map((npc) => npc.name).filter((name) => !!resolveName(name)));
    }

    addSection('npcs', 'Known NPCs', buildNpcSection(trackedNames));

    /* Scene-mention window for the memory bridge: a wider slice than the
       character relevance window so the story can "return" to side NPCs and
       places that are not linked cast cards. buildMemoryContext is async —
       the bounded recall barrier (deadlineMs) delays prompt capture at most
       by that wait. */
    const recentMemoryText = allHistory.slice(-RECENT_SCAN_MESSAGES).map((item) => item.content).join('\n');
    const memoryContext = await buildMemoryContext(storyline, chatState, relevantLinks, recentMemoryText);
    for (const section of memoryContext.sections) {
        addSection(section.id, section.title, section.text);
    }

    let worldStateContext = await buildWorldStateContext(storyline, chatState, relevantLinks);
    for (const section of worldStateContext.sections) {
        addSection(section.id, section.title, section.text);
    }

    const diceContext = buildDiceContext(storyline, chatState, type);
    for (const section of diceContext.sections) {
        addSection(section.id, section.title, section.text);
    }

    const outputReminderOverride = dropLegacyDefault('outputReminder', chatState.settings?.outputReminderOverride).trim();
    let tailInstructions = outputReminderOverride || storyline.aiOutputReminder.trim() || DEFAULT_OUTPUT_REMINDER;
    tailInstructions = substituteParams(tailInstructions);
    tailInstructions += '\n' + PERSPECTIVE_INSTRUCTIONS[perspective];
    if (activeFunctions.length) {
        const functionsReminder = storyline.functions?.reminder?.trim() || DEFAULT_FUNCTIONS_REMINDER;
        tailInstructions += '\n\n' + substituteParams(functionsReminder);
    }
    if (type === 'continue') {
        tailInstructions += '\n\n' + CONTINUE_INSTRUCTION;
    }
    if (type === 'impersonate') {
        tailInstructions += '\n\n' + IMPERSONATE_INSTRUCTION;
    }

    /* ---- Prompt budget planner (invariant #20) ---- */
    const tailTokens = estimateTokens(tailInstructions);
    const systemTokensOf = (list) => list.reduce((sum, section) => sum + estimateTokens(section.text), 0) + tailTokens;
    let kept = [...sections];
    let systemTokens = systemTokensOf(kept);
    const dropped = [];

    if (systemTokens + MIN_HISTORY_BUDGET > contextShare) {
        for (const step of BUDGET_CUT_SCALE) {
            if (systemTokens + MIN_HISTORY_BUDGET <= contextShare) break;
            const matching = kept.filter((section) => section.id === step.id);
            if (!matching.length) continue;
            if (step.keepFirst) {
                /* The characters block is ONE section joined from per-character
                   parts: "keep the first" = keep the first CHARACTER, keep every
                   FULL-card part (user-owned, D1-era contract), and drop the
                   remaining regular part #2+. The rebuild applies
                   substituteParams exactly once — the raw parts were never
                   substituted (addSection only saw the joined original). */
                const charactersSection = matching[0];
                const trimmedParts = characterParts.filter((_, index) => index === 0 || characterPartFull[index]);
                const trimmedText = substituteParams(trimmedParts.join('\n\n')).trim();
                if (trimmedText && estimateTokens(trimmedText) < estimateTokens(charactersSection.text)) {
                    const index = kept.indexOf(charactersSection);
                    kept[index] = { ...charactersSection, text: trimmedText };
                    dropped.push(step.label);
                    systemTokens = systemTokensOf(kept);
                }
                continue;
            }
            kept = kept.filter((section) => section.id !== step.id);
            dropped.push(step.label);
            systemTokens = systemTokensOf(kept);
        }

        /* Stage 6 — world_state: tighten the bridge's total budget so side
           entities drop while the player's sheet (injected first, invariant
           #13) stays. No room left at all: drop the whole block. */
        if (systemTokens + MIN_HISTORY_BUDGET > contextShare) {
            const worldSection = kept.find((section) => section.id === 'world_state');
            if (worldSection) {
                /* Reserve the history floor: systemTokens already includes the
                   tail, so the true room is share − floor − non-world system.
                   Clamp to the CURRENT world size too — a rebuild must never
                   render MORE world state than the first build. */
                const roomForWorld = contextShare - MIN_HISTORY_BUDGET - (systemTokens - estimateTokens(worldSection.text));
                const minWorldBudget = Math.max(100, Math.min(roomForWorld, 800, estimateTokens(worldSection.text)));
                if (roomForWorld >= 100) {
                    const capped = await buildWorldStateContext(storyline, chatState, relevantLinks, {
                        maxTotalCharacterTokens: minWorldBudget,
                    });
                    const preservedIds = new Set(kept.filter((section) => section.id !== 'world_state').map((section) => section.id));
                    const firstIndex = kept.findIndex((section) => section.id === 'world_state');
                    const rebuilt = kept.filter((section) => section.id !== 'world_state');
                    for (const section of capped.sections) {
                        /* world_state itself is spliced back at its original
                           slot below — pushing it here too duplicated the
                           block exactly when the prompt was overflowing (C2). */
                        if (section.id === 'world_state') continue;
                        if (!preservedIds.has(section.id)) continue;
                        const text = substituteParams(String(section.text ?? '')).trim();
                        if (!text) continue;
                        const index = rebuilt.findIndex((existing) => existing.id === section.id);
                        if (index !== -1) rebuilt[index] = { id: section.id, title: section.title, text };
                        else rebuilt.push({ id: section.id, title: section.title, text });
                    }
                    const worldEntry = capped.sections.find((section) => section.id === 'world_state');
                    if (worldEntry) {
                        const text = substituteParams(String(worldEntry.text ?? '')).trim();
                        if (text) rebuilt.splice(Math.min(firstIndex === -1 ? rebuilt.length : firstIndex, rebuilt.length), 0, { id: 'world_state', title: worldEntry.title, text });
                    }
                    kept = rebuilt;
                    /* Merge call-1 provenance into the capped info: the first
                       build did real seeding/reads — debug must not lose it,
                       and bridge calls genuinely happened twice. */
                    worldStateContext = {
                        sections: capped.sections,
                        info: {
                            ...capped.info,
                            bridgeCalls: (worldStateContext.info.bridgeCalls ?? 0) + (capped.info.bridgeCalls ?? 0),
                            seeded: [...(worldStateContext.info.seeded ?? []), ...(capped.info.seeded ?? [])],
                        },
                    };
                    dropped.push(capped.sections.some((section) => section.id === 'world_state')
                        ? 'World Runtime State (side entities trimmed)'
                        : 'World Runtime State');
                } else {
                    kept = kept.filter((section) => section.id !== 'world_state');
                    dropped.push('World Runtime State');
                }
                systemTokens = systemTokensOf(kept);
            }
        }
    }

    let systemText = kept.map((section) => `## ${section.title}\n${section.text}`).join('\n\n');
    if (dropped.length) {
        const budgetNote = `## Prompt Budget\nSome context blocks were cut to fit the ${windowTokens}-token prompt window: ${dropped.join('; ')}. The cut details remain true \u2014 rely on the state_* tools or ask when needed.`;
        systemText = systemText ? `${systemText}\n\n${budgetNote}` : budgetNote;
        /* The note itself rides in the system prompt — charge it BEFORE the
           history split so the total stays inside the share (A6). */
        systemTokens += estimateTokens(budgetNote);
    }

    const historyBudget = Math.max(MIN_HISTORY_BUDGET, contextShare - systemTokens);
    const { history, truncated: historyTruncated } = trimHistoryToBudget(allHistory, historyBudget);

    const messages = [];
    if (systemText) messages.push({ role: 'system', content: systemText });
    for (const item of history) {
        messages.push({ role: item.isUser ? 'user' : 'assistant', content: item.content });
    }
    messages.push({ role: 'system', content: tailInstructions });

    const flatten = [
        systemText,
        ...history.map((item) => item.content),
        `## Output Rules\n${tailInstructions}`,
    ].filter(Boolean).join('\n\n');

    lastBuildInfo = {
        storylineId: storyline.id,
        storylineTitle: storyline.title,
        generationType: type,
        perspective,
        hostCharacter: getHostInfo(),
        chatOverrides: {
            storyteller: !!storytellerOverride,
            outputReminder: !!outputReminderOverride,
        },
        worldState: worldStateContext.info,
        dice: diceContext.info,
        memoryKeeper: memoryContext.info,
        lorebooks: lorebookContext.info,
        player: playerSection.info,
        activeFunctions: activeFunctions.map((activeFunction) => activeFunction.def.id),
        sections: kept.map((section) => ({ id: section.id, title: section.title, tokens: estimateTokens(section.text) })),
        historyMessages: history.length,
        historyTokens: history.reduce((sum, item) => sum + estimateTokens(item.content), 0),
        relevantCharacters: relevant.map(({ link, card }) => card.name || link.name),
        missingCharacters: missing,
        totalTokensEstimate: estimateTokens(flatten),
        budgetCharsPerToken: CHARS_PER_TOKEN,
        budget: {
            windowTokens,
            contextShare,
            systemTokens,
            historyBudget,
            dropped,
            skippedCharacters,
            historyTruncated,
        },
    };

    if (missing.length) {
        console.warn('[Storyline] Linked characters not found (treated as unavailable):', missing.join(', '));
    }

    return { storyline, chatState, perspective, sections: kept, history, messages, flatten };
}
