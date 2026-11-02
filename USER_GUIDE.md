# Storyline — User Guide

[🌐 English](USER_GUIDE.md) | [🇻🇳 Tiếng Việt](USER_GUIDE.vi.md) · ← Back to [README](README.md)

The complete manual for the Storyline extension (**v0.2.0**): every feature, every command, step by step.

---

## Table of contents

1. [Core concept: story definitions vs chat sessions](#1-core-concept)
2. [Getting started](#2-getting-started)
3. [The Story Library](#3-the-story-library)
4. [The Storyline Editor](#4-the-storyline-editor)
5. [Starting a session](#5-starting-a-session)
6. [Playing: what the Storyteller does](#6-playing-what-the-storyteller-does)
7. [The Story Hub](#7-the-story-hub)
8. [Perspective](#8-perspective)
9. [Story functions](#9-story-functions)
10. [Custom prompts per chat](#10-custom-prompts-per-chat)
11. [Story NPCs](#11-story-npcs)
12. [Linked cast & relevance](#12-linked-cast--relevance)
13. [Slash commands](#13-slash-commands)
14. [Debugging the prompt](#14-debugging-the-prompt)
15. [Import / Export](#15-import--export)
16. [Where data lives](#16-where-data-lives)
17. [Optional integrations](#17-optional-integrations)
18. [Limitations](#18-limitations)
19. [FAQ & troubleshooting](#19-faq--troubleshooting)

---

## 1. Core concept

There are **two layers** of data, and understanding them explains most of how Storyline behaves:

| Layer | Where it lives | Who changes it |
| --- | --- | --- |
| **Story definition** (title, plot, prompts, scenarios, cast, defaults) | SillyTavern settings (`extension_settings.storyline`) | Only you — via the Editor |
| **Chat session state** (attached story, perspective, per-chat overrides, function toggles, recorded NPCs) | The current chat's metadata and local variables | You (Story Hub / commands) and the story itself |

- One storyline definition can power **many sessions**: every **Start** creates a new chat named `<Story Title> #N`.
- Editing a story never changes history in existing sessions — most edits (plot, prompts, cast) apply from the next message on.
- **Attaching** a storyline to an existing chat keeps the chat and its history; **detaching** removes only the Storyline key and the chat becomes a normal chat again.

## 2. Getting started
1. Install the extension (see the [README](README.md)) and reload SillyTavern (F5).
2. Click the **golden book icon** in the top toolbar (same row as Persona / World Info) — or use the wand (Extensions) menu → *Storylines*.
3. Click **New**. Give it a **title** and write the **World & Plot** (what the AI should know about the setting). Everything else is optional and has sensible defaults.
4. (Optional) Add an **Opening** — the first narration of every session.
5. Open the **Check** tab: the readiness checklist tells you what is missing. **Save Storyline**.
6. Press **Play** → choose who you play as and which opening → **Start session**. Type what your character does; the Storyteller narrates.

No character card selection is needed, no group chat, nothing else to configure.

## 3. The Story Library
The Story Library is the management dashboard, reachable from the top bar, the wand menu, `/storyline open`, or the Hub's **Library** button.

- **Title bar** — **New** (create), **Import** (JSON file) and the **interface language** dropdown (English / Tiếng Việt — also `/storyline lang en|vi`).
- **Current chat strip** — one line: the storyline playing in this chat with **Hub**, **New session**, **Detach**; or *Normal chat* with **Attach…**.
- **Search** — matches title, category and pitch. The category filter appears once you have two or more categories.
- **Rows** — banner thumbnail, title (with a *Playing* chip for the current story), category · cast · openings · functions · last edit, and the **Pitch** (two lines).
  - **Play** starts a new session (see section 5).
  - Click the card itself to **edit** it.
  - **⋯** opens Edit / Duplicate / Export JSON / Delete. Esc or a click elsewhere closes the menu.
- Duplicates and imports are announced and highlighted in the list.

Deleting a storyline never deletes your chats — the sessions remain as normal SillyTavern chats; only the story definition is removed.

## 4. The Storyline Editor
Open via **New** or by clicking a story. The header shows the banner, title and small chips (category, openings, cast, prompt size, and **Unsaved** while you have changes). Six tabs, in the order you usually need them:

| Tab | What's in it |
| --- | --- |
| **Story** | Banner (click or drag an image), **Title**, **Category**, **Language** (also guides generated NPC names), **Pitch**, **World & Plot**, **Story Rules**, **Key Facts** |
| **Openings** | First narrations of a session. Several → the player picks one on the Start screen; none → the story starts blank. Reorder with ↑ |
| **Cast** | Default **Player** card for `{{user}}`, and the linked **Characters** (see section 12) |
| **Narration** | **Narration Style** (how the storyteller writes), default **perspective**, **speaker label**, **Output Reminder** |
| **Extras** | Collapsible: **Linked Lorebooks**, **Story Functions** (+ Game mechanics, Functions reminder), **Context Budget** |
| **Check** | **Readiness** checklist (click an item to jump to the field), **Prompt Size** per field, **Functions & Integrations** (✓ Ready / ⚠ Update recommended / ✗ Not installed / ✗ Disabled / ✗ Switched off per companion extension), **Export JSON**, id and dates |

Every field that reaches the AI carries a **Sent to AI** chip; the Pitch carries **Players only**.

### Prompt fields, in plain language

| Field | Role in the prompt | Default if empty |
| --- | --- | --- |
| **Pitch** | Not sent — shown in the Library and on the Start screen | — |
| **World & Plot** | The world premise, under "Story Context" | (no block) |
| **Story Rules** | How the world behaves, under "Story Guidelines" — wins over the Narration Style | (no block) |
| **Key Facts** | Facts that must always hold, under "Important Story Facts" | (no block) |
| **Narration Style** | The Storyteller's voice, prose, pacing and format (≤10k tokens, own sub-editor) | The built-in style |
| **Output Reminder** | The last instruction before the reply (length, trackers, format) | A built-in reminder |

Narration Style and Output Reminder can be overridden **per chat** (section 10).

**Genre templates.** Under Story Rules, the **+ Genre template…** picker adds a short, editable block for one genre (Adventure, Slice of Life, Life Sim, Mystery, Romance, Horror, Comedy): tone, pacing and the kind of complications that fit. It is appended to the end of your Story Rules and never replaces what is there; adding the same genre twice only shows a warning. Mix two if the story needs it (Romance + Mystery), and rewrite the text freely. It costs tokens only while it sits in the field.

Editor conventions:

- Every long text field has an **expand** button — a large editor with a live character/token counter.
- **Save Storyline** saves; Cancel / Esc / × asks *Discard unsaved changes?* only when something really changed.
- In the Narration Style sub-editor, **Back** keeps your edits (Save Storyline stores them).
- **Banner**: resized to ≤512 px JPEG. Changing it and saving also updates the story's avatar in existing sessions.
- **Older storylines** that still have text in the old *Plot (User)* field show a note on the Story tab with **Merge into Pitch** (that field was never shown anywhere and never sent to the AI).

## 5. Starting a session
Press **Play** on a library row (or `/storyline new <title|id>`). One **Start session** screen appears:

- **Pitch** of the story, with banner and category.
- **You play as** — your persona or any character card (searchable; the story's default is on top and marked).
- **Opening** — pick one of the story's openings (with preview) or **Blank start**.
- **Start session** creates the chat; **Cancel** creates nothing.

Behind the scenes a dedicated, hidden **host card** named after the story holds the chat (its content is never used in prompts), and the chat is created **once**, named `<Story Title> #<N>`.

**Attach** (`/storyline attach <title|id>`, or *Attach…* in the Library) connects a storyline to your **current** chat, keeping all history. If the story has several openings and the chat is empty, a picker appears (*Start blank* skips it).

**Detach** (`/storyline detach`, or Hub → Detach) asks for confirmation, then removes only the Storyline metadata; the chat and its history stay.

## 6. Playing: what the Storyteller does

Type what your character does; the assistant replies with narrative prose — places, events, NPCs, dialogue in quotes. Concretely, on every generation the extension rebuilds the entire prompt in this order:

1. Storyteller identity + perspective directive
2. Story Context (AI plot)
3. Story Guidelines
4. Linked Lorebooks — one `Lorebook: <name>` block per linked book with matching entries
5. Active functions' instructions (Story Functions)
6. Important Story Facts (reminder)
7. **The Player** — your persona or player card
8. **Relevant Characters** — cast mentioned in the recent window
9. **Known NPCs** — names the story has recorded
10. Story Memories (if Memory Keeper is on)
11. World State blocks (if World State is on)
12. Dice instructions (if Dice Roller is on)
13. The story history itself — dice markers stripped; a tool run appears as a short past-tense *(System record, not story text…)* note with each tool's result but not its arguments; tool calls the AI typed into a reply as plain text (`name({...}) => …` lines) are removed
14. A final output-rules system message — the Output Reminder, the perspective line again and, when functions are active, the Functions reminder

Everything else stays native SillyTavern: streaming, abort, regenerate, swipes, message editing, branching. A **swipe** rewrites the reply being swiped (the old reply is not sent back to the model). Macros inside old messages (`{{roll}}`, `{{setvar}}`…) are never re-run. The "Narrator" chip on messages is display-only (`message.name`), never part of the content.

## 7. The Story Hub
The button next to the chat input (visible only in Storyline chats) opens the dashboard of the current session. Its badge shows the number of recorded NPCs (hidden while there are none); a warning state means functions are on but the model cannot call tools.

- **Header** — banner, title, category · session name, chips (perspective, active functions, world state, no-function-calling warning).
- **Actions** — Edit, Library, New session, Detach.
- **Prompt budget** — a bar of story blocks vs. chat history against the model's real context window; **Measure** builds the prompt now without sending anything.
- **Perspective**, **Story Functions** (only if the story has any), **Cast** (player + linked characters), **Story NPCs** (only when the name generator is used or NPCs exist), **This chat's prompt overrides** (collapsed) — see sections 8–12.
- **Footer** — **Prompt debug** and **NPC data** buttons.

## 8. Perspective

Choose first, second (default) or third person — per chat. Change it from the Hub or:

```
/storyline perspective 1
/storyline perspective 2
/storyline perspective 3
```

Takes effect on the next message and survives restarts.

## 9. Story functions

Each storyline can add built-in **functions** (Editor → Extras → Story Functions). Picking a mode adds the function: **Off by default** / **On by default** (players can switch it per chat in the Hub) or **Always on** (locked). **Remove** takes it out of the storyline.

| Function | What it adds | Needs |
| --- | --- | --- |
| **Character Name Generator** | The AI can invent fitting names via a real tool (`generate_character_name`) and the story records them as NPCs | Tool-calling-capable model (text fallback exists, less reliable on reasoning models) |
| **World State** | Live sheets, scenes and world time projected into context | [Character State](#17-optional-integrations) extension |
| **Dice Roller** | When/how to roll dice instructions; dice markers never re-enter the prompt | [Dice Weaver](#17-optional-integrations) extension |
| **Memory Keeper** | A "Story Memories" context block with tiered recall | [Memory Weaver](#17-optional-integrations) extension |

Each function also supports a **custom instruction** (≤500 tokens); story-wide **Game mechanics** and a **Functions reminder** live under Extras → Story Functions. If a companion extension is missing, the function is simply inactive — the story runs exactly as before, with no junk sections, and none of its instructions are sent to the AI. The player's on/off choice in the Hub is kept, so the function starts working as soon as the extension is available.

Function rows in the editor and the Hub show what is missing, with a one-click fix:

| Status | Meaning | Button |
|---|---|---|
| **Not installed** | The companion extension is not in this SillyTavern | **Install** — opens SillyTavern's own install dialog with the repository URL filled in (you still confirm, and can pick a branch or install for all users) |
| **Disabled** | Installed but disabled in the Extensions panel | **Enable** — asks for confirmation, then enables it; SillyTavern reloads the page |
| **Outdated** (*⚠ Update recommended*) | Installed and working, but older than the minimum version (section 17) — some features may be missing | **Update** — asks for confirmation, downloads the latest release and reloads the page |
| **Switched off** | Installed and loaded, but turned off in its own settings | — turn it on in that extension's settings |

If the model does not support function calling, tools are dropped but the guidance remains with an explicit "don't fake tool results" note, and the send-form button shows a warning state.

## 10. Custom prompts per chat
Hub → **This chat's prompt overrides** (collapsed; opens by itself when an override is active), for this chat only:

- **Narration Style** (≤10k tokens) — replaces the storyline's style.
- **Output Reminder** (≤500 tokens) — replaces the storyline's output reminder.

Saving an empty field (or text identical to the storyline's current value) collapses back to **follows storyline** — so creator updates propagate unless the player explicitly overrides. The limit only applies to a real override.

## 11. Story NPCs

When the Character Name Generator names a character, the name (with gender/culture/style/context attributes the AI provided) is recorded in the chat's local `storylineState` variable — isolated per chat, stored inside the chat file, and inspectable via `/setvar` or `/storyline data`.

The Hub's **Story NPCs** panel (shown when the story uses the name generator or NPCs exist) lists them (searchable, with a `[tracked]` marker when Character State tracks that NPC) and allows per-entry delete. Known NPCs are injected into the prompt as a compact list (capped at 30).

## 12. Linked cast & relevance
The **Cast** tab links character cards as lightweight references. **Add characters** opens a searchable picker with avatars — tick several at once. Each cast row is one compact line:

- avatar · name · **Always** (always in the prompt) · **Full** (whole card, untrimmed) · ▾ (aliases and a story note) · remove.
- A filter box helps with large casts. Missing cards (renamed/deleted) are flagged and skipped.

How it works on every generation:

- The recent story window (the latest messages, N = *Name scan* under Extras → Context Budget) is scanned for names/aliases. Only matched characters — plus those marked **Always** — are loaded (cached) and injected.
- Each character block is trimmed to *Tokens per character*; the total is capped by *Total character tokens*.
- **Full** turns both caps off **for that character**: description, personality, scenario and the card's enabled embedded lorebook entries go in verbatim. The row shows the real token cost. Raise the model's context if needed — `/storyline debug` shows a red overflow chip when the window is still too small. Full cards are never trimmed by the budget planner and never eat the budget of the other cast.
- The player card is **never** scanned as cast; the host card is **never** resolved as an entity.
- The Hub's **Cast** panel shows the player (with **Change** for this chat), the linked characters, aliases, notes and the 🌱 seed button (when Character State is installed).

**Linked Lorebooks** (Extras tab) — link SillyTavern World Info files instead of copying their content (up to 10, no duplicates). **Smart** mode injects an entry when its keys appear in the last 12 story messages, using SillyTavern's own matching rules: per-entry or global case sensitivity and whole-word settings (SillyTavern's default is plain substring matching, so Japanese/Chinese keys work), `/regex/flags` keys, `{{user}}`/`{{char}}` in keys, secondary keys with the four logic modes, and probability (only when *use probability* is on). Constant entries always inject. **Full** mode injects every enabled entry. Each book has a token cap — the **highest-order** entries are kept first. Entry titles (comments) are never sent. World Info never activates through SillyTavern itself in a Storyline chat — this block is the only path. Saving a World Info file applies on the next message (no F5 needed).

## 13. Slash commands

```
/storyline                          — status: story title, perspective, opening (default)
/storyline open                     — open the Story Library
/storyline new <title|id>           — start a new session (Start session screen)
/storyline attach <title|id>        — attach a storyline to the current chat (confirms if one is attached)
/storyline detach                   — detach after confirmation (chat becomes normal again)
/storyline perspective 1|2|3        — set narrative perspective
/storyline seedcast                 — force-seed all linked cast into Character State (skips the function gate)
/storyline data                     — story NPC viewer: list + raw JSON
/storyline debug                    — prompt debug: budget bar, every block with its own Copy, full prompt Copy
/storyline lang en|vi               — switch the Storyline interface language (alias: language)
```

Storylines are looked up by id or title (case-insensitive); if no title matches exactly, the first title that contains the text is used. Every path gives toastr feedback.

## 14. Debugging the prompt
`/storyline debug` (or Hub → **Prompt debug**) shows exactly what the Storyteller will see:

- **Header chips** — blocks, world state / dice / memories / lorebook status, player card, red **Context overflow** if the prompt is still larger than the window.
- **Prompt budget** — story blocks vs. history against the model's **real** prompt window (the chat-completion context size for chat APIs, minus the reply length). When the prompt would overflow, low-priority blocks are cut in a fixed order (NPCs → extra characters → lorebooks → directory → memories → scene/time → world-state side entities) and the prompt carries a `## Prompt Budget` note.
- **Prompt blocks (in order)** — every block collapsible, with its token size and its own **Copy** button, then the chat history and the final output rules.
- **Runtime** — player, per-chat overrides, active functions, characters in scene, NPC archive, lorebooks, and rows for the companion extensions that are present (the missing/disabled ones are listed in one *Unavailable* line).
- **Copy full prompt** — the exact prompt as the API receives it (also logged to the console).

Dry runs (token counter, PromptManager) still run the override, so counts are accurate. If building the story prompt fails, the generation is **stopped with an error toast** instead of silently sending SillyTavern's default prompt.

## 15. Import / Export

Each storyline exports as a JSON file (Library → ⋯ → Export JSON, or Editor → Check → Export JSON — includes unsaved edits). Import treats the file strictly as **data**: parsed with `JSON.parse`, normalized against the schema, and assigned a **fresh id** — importing twice never overwrites. Character cards are never embedded; linked characters stay as references. The banner (a data URL) travels with the export.

**Writing a storyline by hand or with an AI:** the full file format, a ready-to-paste AI prompt and a sample file are in [IMPORT_FORMAT.md](IMPORT_FORMAT.md).

## 16. Where data lives

| Data | Location |
| --- | --- |
| Storyline definitions (incl. banner) | `settings.json` → `extension_settings.storyline` |
| Session state (attached story, perspective, overrides, function toggles) | chat metadata key `storyline` |
| Story NPCs | chat-local variable `storylineState` (inside the chat file) |
| Host cards | normal character cards, `storyline-host-<id>` internal flag, content never used |

Detaching removes only the metadata key. Deleting a storyline leaves chats intact. Everything stays on your machine.

## 17. Optional integrations

All three integrations are optional, independently installed extensions. Storyline reads them only through their documented `globalThis` APIs and never imports them directly.

Minimum versions this release is built for: **Character State 3.1.0**, **Dice Weaver 0.6.0**, **Memory Weaver 0.9.1**. An older version still runs, but shows *⚠ Update recommended* with an **Update** button (section 9).

### Character State → *World State*

- When the function is active and Character State is installed, the Storyteller context gains: **World Runtime State** (player sheet first, then relevant cast, then always-inject entities — all budget-truncated, plus a BFS-collapsed `Custom:` section and notes), a **Character State Directory** (one compact line per not-yet-injected sheet, teaching the AI to read it with `state_get`), **Current Scene**, and **World Time**.
- **Seeding**: linked cast sheets are created automatically (idempotently, never overwriting played state) when a session starts, when a chat opens, when the editor saves, or manually via Hub 🌱 / `/storyline seedcast`. Your `{{user}}` sheet is never seeded implicitly.
- **State changes never happen implicitly**: the AI mutates state only through Character State's own validated tools, which work inside Storyline chats. Narrative prose is never auto-converted into state changes.
- Without Character State: no sections, no crash. Without Storyline: Character State is untouched.

### Dice Weaver → *Dice Roller*

- Storyline adds the *when to roll* layer (uncertain, meaningful actions only) and a mode-aware *how*: Function Call instructions, `<roll>` tag fallback, or a verbatim forced-roll directive for keyword triggers. The `roll_dice` tool belongs to Dice Weaver and works inside Storyline chats.
- `stripDiceMarkers` guarantees dice markers never re-enter the prompt through history.
- Per-character dice rules configured in Dice Weaver apply when the AI passes a linked character's exact name (per-character *trigger* keywords are limited to global triggers inside Storyline chats — a known limitation).

### Memory Weaver → *Memory Keeper*

- Memory Weaver compresses the chat into memory entries in the background. Because Storyline's prompt override wipes its usual injection, this function re-projects the stored memories as a **Story Memories** block.
- Newer Memory Weaver versions (recall API) run a vector query and pack the budget themselves (bounded to 400 ms); older versions get a tiered local fallback: scene-mentioned facts first, then core memories, then a small recency anchor (~1000 tokens, entries truncated to 200 chars). Old core facts are still picked up in very long chats.
- The AI never writes memories itself; you view/edit them in Memory Weaver's own dashboard (`/memories`).

## 18. Limitations

- **Group chats** cannot host a Storyline (the Storyteller is a single narrative pipeline, not speaker selection).
- **Text-completion APIs**: the overridden prompt is plain prose continuation (instruct-mode wrapping is bypassed); CFG guidance ≠ 1 is not overridden. Function calling requires a chat-completion API; on text APIs it degrades to inline guidance + warning.
- The **PromptManager token breakdown** (OpenAI-style) shows pre-override counts — cosmetic only.
- **No background simulation**: the story advances only when you send a message or trigger a generation.
- **Linked lorebooks** do not support position/depth injection, recursion, vector matching, per-entry scan depth, sticky/cooldown or inclusion groups.
- **Token budgets** are character-based approximations (~4 chars/token) — deliberate, no async tokenizer in the hot path.
- **Relabel-on-render** fixes the "Narrator" chip only on newly rendered messages; attaching mid-chat leaves old chips until they re-render.
- **Legacy sessions**: chats created before the single-file naming flow may hold orphan `<host> - <timestamp>` files (delete manually); dense function-toggle maps keep later-added functions off until a new session is created.
- Tool-call recursion is bounded by SillyTavern's `RECURSE_LIMIT` (5); the name generator's text fallback inherits the current API/preset and can fail on reasoning models with a small completion budget.

## 19. FAQ & troubleshooting

**The golden book button doesn't appear.** Check the browser console (F12) for `[Storyline]` messages; confirm the folder is exactly `Storyline` and listed in the Extensions panel; reload with F5 (ES module caching is aggressive).

**The assistant speaks with labels like `Name:`.** That's the model drifting from the output rules. Try a stronger Narration Style, an Output Reminder override, or remind it once in chat.

**The prompt doesn't include my character.** Only characters **mentioned recently** (or marked *Always include*) are injected. Check `/storyline debug` → Runtime → *Characters in scene* and the **Relevant Characters** block: the character is either not matched, trimmed to budget, or the card was deleted (the Check tab of the editor flags missing cards).

**I started a session but the chat has no greeting.** You picked **Blank start**, or the story has no openings — write the first move yourself. Cancel on the Start screen creates nothing.

**A warning says the AI wrote a tool call as story text.** The model typed a call like `state_update({...}) => OK` into its reply instead of using the tool interface. Nothing ran, so nothing was updated — swipe to regenerate. Such lines are also removed from the history sent to the AI, so they do not teach the pattern.

**Swipes/regenerate behave oddly with dice.** Dice results come from Dice Weaver's own tool/cards; Storyline strips markers from history on each rebuild. If you see stale markers, reload (F5).

**My per-chat override was "lost".** Overrides collapse back to *follow storyline* when saved empty or identical to the storyline's current text — that's the propagation feature, not a bug.

**Cast sheets in Character State are empty for a new session.** Sheets seed from the cards' starting state on session start / chat open / editor save. If a card has no starting state, it is reported — never invented. Use Hub 🌱 or `/storyline seedcast` to seed manually.

**World Time shows a bootstrap note.** The clock is uninitialized; the AI advances it via `state_advance_time` on the first time-relevant turn.

**A Hub section is missing.** Story Functions only appear when the storyline has functions; Story NPCs only when the name generator is used or NPCs exist.

**My new banner doesn't show in old chats.** Save the storyline after changing the banner — the story avatar is updated on save; reload (F5) if your browser still shows the cached image.
