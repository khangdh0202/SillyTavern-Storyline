import { eventSource, event_types, stopGeneration } from '../../../../../script.js';
import { buildStorylineContext } from './context.js';
import { readChatState } from './chat.js';
import { getContext } from '../../../../../scripts/st-context.js';

/* A recorded generation that never reaches a prompt-ready event (interceptor
   abort, ping failure, an exception inside ST's prompt build) never gets
   GENERATION_ENDED either — ST only emits it from hideStopButton(). Without
   a heal the NEXT generateRaw of another extension (Memory Weaver, AI
   Background Manager) would be replaced by the story prompt (v0.2.0 — C7). */
const GENERATION_STALE_MS = 2 * 60 * 1000;

const generationState = {
    type: null,
    options: null,
    dryRun: false,
    overrode: false,
    recordedAt: 0,
};

function resetGenerationState() {
    generationState.type = null;
    generationState.options = null;
    generationState.dryRun = false;
    generationState.overrode = false;
    generationState.recordedAt = 0;
}

function isOverridable() {
    /* `type` is recorded only by GENERATION_AFTER_COMMANDS (main Generate flow).
       Stray `generateRaw` calls from other extensions emit
       CHAT_COMPLETION_PROMPT_READY too (script.js:3978) — with type === null
       they must NEVER be hijacked (e.g. Memory Weaver / AI Background Manager
       building their own prompts inside an open Storyline chat). */
    if (generationState.type === null) return false;
    if (generationState.overrode) return false;
    if (Date.now() - generationState.recordedAt > GENERATION_STALE_MS) {
        console.warn('[Storyline] Recorded generation went stale without a prompt — state healed.');
        resetGenerationState();
        return false;
    }
    if (!readChatState()) return false;
    if (getContext().groupId) return false;
    if (generationState.type === 'quiet') return false;
    if (generationState.options?.quiet_prompt) return false;
    return true;
}

/* Claim the override SYNCHRONOUSLY before any await: the build can wait up
   to ~400ms on memory recall, and a generateRaw landing in that window used
   to be hijacked AND consume the override (C7). On failure the claim is
   rolled back so a retry within the same generation can still override. */
async function buildCurrentContext() {
    generationState.overrode = true;
    const dryRun = generationState.dryRun;
    try {
        const build = await buildStorylineContext({
            type: generationState.type ?? 'normal',
            options: generationState.options ?? {},
        });
        if (!build) generationState.overrode = false;
        return build;
    } catch (error) {
        generationState.overrode = false;
        /* ST's EventEmitter swallows listener errors — without this the
           un-overridden ST prompt (empty host card + defaults) would go out
           silently (C5). Abort instead of sending the wrong prompt. */
        console.error('[Storyline] Failed to build the story prompt:', error);
        if (!dryRun) {
            window.toastr?.error?.(`Story prompt could not be built — generation stopped. ${error?.message ?? error}`, 'Storyline', { timeOut: 10000 });
            try { stopGeneration(); } catch { /* best effort */ }
        }
        return null;
    }
}

async function onBeforeCombinePrompts(data) {
    if (!isOverridable()) return;
    const build = await buildCurrentContext();
    if (!build) return;
    data.combinedPrompt = build.flatten;
}

async function onChatCompletionPromptReady(eventData) {
    if (!isOverridable()) return;
    const build = await buildCurrentContext();
    if (!build) return;
    eventData.chat.length = 0;
    for (const message of build.messages) {
        eventData.chat.push(message);
    }
}

export function initGenerationHooks() {
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, (type, options, dryRun) => {
        generationState.type = type;
        generationState.options = options;
        generationState.dryRun = dryRun;
        generationState.overrode = false;
        generationState.recordedAt = Date.now();
    });
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, onBeforeCombinePrompts);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    /* Clear the recorded generation when the pipeline ends: stray
       `generateRaw` calls from other extensions emit
       CHAT_COMPLETION_PROMPT_READY with NO type recorded — isOverridable()
       refuses them only while type === null, so reset here. STOPPED and
       CHAT_CHANGED also end any in-flight generation (C7). */
    eventSource.on(event_types.GENERATION_ENDED, resetGenerationState);
    eventSource.on(event_types.GENERATION_STOPPED, resetGenerationState);
    eventSource.on(event_types.CHAT_CHANGED, resetGenerationState);
}

