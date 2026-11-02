/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { eventSource, event_types } from '../../../../script.js';
import { initGenerationHooks } from './storyline/generation.js';
import { relabelNarrativeMessage, isStorylineChat } from './storyline/chat.js';
import { registerSlashCommands } from './storyline/commands.js';
import { registerStorylineTools } from './storyline/functions.js';
import { seedCastStatesForActiveChat } from './storyline/world-state-bridge.js';
import { invalidateCardCache } from './storyline/characters.js';
import { invalidateStorylineDataCache } from './storyline/data.js';
import { invalidateLorebookCache } from './storyline/lorebooks.js';
import { initChatSettingsButton, refreshChatSettingsButton } from './ui/chat-settings.js';
import { hasFakeToolTranscript } from './storyline/context.js';
import { tr } from './storyline/i18n.js';
import { addWandMenuEntry, addTopBarEntry } from './ui/manager.js';

jQuery(() => {
    try {
        initGenerationHooks();
        initChatSettingsButton();
        addWandMenuEntry();
        addTopBarEntry();
        registerSlashCommands();
        registerStorylineTools();

        console.log('[Storyline] Initialized: generation hooks, chat settings button, UI entries, slash commands');

        /* Seed the cast into Character State on every chat open (idempotent,
           guarded per chat): players see all linked cards in the stats sheet
           immediately, without waiting for a tool call. */
        eventSource.on(event_types.CHAT_CHANGED, () => {
            invalidateLorebookCache();
            void seedCastStatesForActiveChat();
        });
        /* A World Info save mid-session: drop just that book so linked
           lorebooks pick up the edit without F5. */
        eventSource.on(event_types.WORLDINFO_UPDATED, (name) => invalidateLorebookCache(name || null));
        eventSource.on(event_types.APP_READY, () => { void seedCastStatesForActiveChat(); });
        eventSource.on(event_types.CHAT_CHANGED, refreshChatSettingsButton);
        eventSource.on(event_types.APP_READY, refreshChatSettingsButton);
        /* An extension installed from the Install button (or ST's own menu)
           loads without a reload: re-probe the companion integrations. */
        eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, refreshChatSettingsButton);
        /* Keep the send-form badge and an open Story Hub live: NPCs are
           recorded by the name-generator tool during generation, so refresh
           after every reply and after each generation ends. */
        eventSource.on(event_types.MESSAGE_RECEIVED, refreshChatSettingsButton);
        /* A model that types a tool call as text ("state_update({...}) =>
           OK") changes nothing — tell the player instead of letting the
           fake "OK" pass for a real update. */
        eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
            try {
                if (!isStorylineChat()) return;
                const message = globalThis.SillyTavern?.getContext?.()?.chat?.[Number(messageId)];
                if (message && !message.is_user && hasFakeToolTranscript(message.mes)) {
                    toastr.warning(tr('The AI wrote a tool call as story text. It did not run, so nothing was updated. Swipe to regenerate.'), 'Storyline', { timeOut: 10000 });
                }
            } catch (error) {
                console.error('[Storyline] Fake tool transcript check failed:', error);
            }
        });
        eventSource.on(event_types.GENERATION_ENDED, refreshChatSettingsButton);
        /* W5-2: message deletion and swipes can change the chat-local NPC
           data — drop that cache and refresh the badge / open hub. Card
           caches are NOT touched (v0.2.0 P3): messages never change cards,
           and clearing them re-fetched every relevant card on each swipe. */
        const onMessagesChanged = () => {
            invalidateStorylineDataCache();
            refreshChatSettingsButton();
        };
        eventSource.on(event_types.MESSAGE_DELETED, onMessagesChanged);
        eventSource.on(event_types.MESSAGE_SWIPED, onMessagesChanged);
        /* W5-2 (BUGNOTE event-card-reload pattern): MESSAGE_EDITED re-renders
           .mes_text from mes.mes without CHARACTER_MESSAGE_RENDERED — the
           "Narrator" chip reverts until we relabel here. */
        eventSource.on(event_types.MESSAGE_EDITED, (messageId) => {
            try {
                relabelNarrativeMessage(Number(messageId));
            } catch (error) {
                console.error('[Storyline] Failed to relabel narrative message after edit:', error);
            }
        });
        /* Card edits mid-session: drop the cached full card so relevance
           resolution picks up the new name/description immediately. */
        eventSource.on(event_types.CHARACTER_EDITED, () => invalidateCardCache());
        /* Card delete/rename/re-import leave stale cache entries behind:
           a deleted card kept being injected as a full stale block, a
           renamed card resolved to the old object. Full invalidation only —
           the cache is lazily rebuilt and cheap. */
        eventSource.on(event_types.CHARACTER_DELETED, () => invalidateCardCache());
        eventSource.on(event_types.CHARACTER_RENAMED, () => invalidateCardCache());
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            try {
                relabelNarrativeMessage(Number(messageId));
            } catch (error) {
                console.error('[Storyline] Failed to relabel narrative message:', error);
            }
        });
    } catch (error) {
        console.error('[Storyline] Initialization failed:', error);
    }
});
