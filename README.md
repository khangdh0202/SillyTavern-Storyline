<div align="center">

# Storyline — Storyteller Chat Mode for SillyTavern

**You play the main character. The world tells the story.**

[🌐 English](README.md) | [🇻🇳 Tiếng Việt](README.vi.md) · [📖 Full Documentation (EN)](USER_GUIDE.md) · [📖 Tài liệu đầy đủ (VI)](USER_GUIDE.vi.md)

<img src="docs/screenshots/storyteller-chat.webp" alt="Storyline: storyteller narration with a dice roll and a stat change card" width="680">

</div>

---

## What is this?

**Storyline** adds a new chat mode to SillyTavern: the assistant becomes the **Storyteller** — narrating the world around your character in continuous narrative prose. No character labels, no speaker turns, no character card playing the narrator. You type what your character does; a story unfolds around them.

**Any genre works:** adventure, slice-of-life, life sim, mystery, romance, horror, school or workplace drama. Dice rolls and character sheets are optional add-ons for when you want RPG mechanics.

```
Character Chat:  a character is talking to me.
Group Chat:      several characters are talking to me.
Storyline:       a story is being narrated around me.
```

## What's new in v0.2.0

- **Redesigned editor** — six tabs in the order you write a story (Story · Openings · Cast · Narration · Extras · Check), "Sent to AI" / "Players only" labels on every field, and a **Readiness checklist** that jumps to whatever is missing.
- **One Start screen** — pitch, who you play as and which opening (or a blank start) in a single popup; Cancel never creates anything.
- **Compact cast** — add many characters at once from a searchable picker with avatars; one slim row per character with Always / Full toggles.
- **Cleaner Library and Hub** — Play button + ⋯ menu, story pitch on every row, a live **prompt budget** bar in the Hub, collapsible blocks with Copy buttons in `/storyline debug`.
- **Swipes really rewrite** — the reply being swiped is no longer sent back to the model; the **active persona** is used (not the default one); the prompt budget uses the **real context size** of chat-completion APIs.
- **Linked lorebooks match like SillyTavern** — case/whole-word settings, regex flags, CJK keys, highest-order entries kept first; World Info edits apply without F5.
- **Fixes** — the editor no longer breaks on storylines with linked lorebooks, light themes are readable, changing the banner updates the story avatar, Enter no longer triggers buttons twice.
- **Tool calls typed as text** — past tool runs reach the AI as a short system record instead of copyable call syntax, fake `name({...}) => …` lines are removed from the history, and a warning tells you when a reply contains one (it did not run — swipe to regenerate).
- **Cast seeding on start** — starting a session always seeds the linked cast into Character State (when World State is active), even if that story was seeded before.

## Why you want it

| Without | With Storyline |
| --- | --- |
| Narrator = a fake character card that leaks its description into every prompt | The Storyteller has **no card identity** — the host card is only a save-file holder and is fully excluded from the prompt |
| One card = one voice | The whole world narrated: places, events, NPCs, dialogue in quotes — nothing is a "speaker" |
| Your character's definition fights the card's | **You decide who you play as** — persona or any card, chosen per session |
| Long chats forget the plot | Optional integrations add world state, dice and long-term memory — layered on top |
| Stories are scattered lorebooks | A **Story Library**: every story is a versioned, exportable definition with banner, pitch, openings, cast and prompts |

## What it does

- **Story Library** — define stories independently of character cards: title, category, banner, pitch, world & plot, story rules, key facts, narration style, openings, linked cast and lorebooks. Export/import as JSON ([format + AI prompt](IMPORT_FORMAT.md)), duplicate, search and filter by category.
- **Storyteller narration** — the entire generation prompt is rebuilt through SillyTavern's official hook events: storyteller identity → story context → guidelines → linked lorebooks → story functions → key facts → player → relevant characters → NPCs → memories → world state → dice → history → output rules. Everything else stays native (streaming, abort, swipes, branching, chat persistence).
- **Start session screen** — before each session, pick your persona or any character card as the player (`{{user}}`) and the opening. The player card is never a speaker and never scanned as cast; its description/personality becomes the player's sheet.
- **Smart character injection** — linked characters are lightweight references. Each turn, only characters mentioned in the recent story window are loaded (cached) and injected, each capped by a per-character and total token budget. A story works perfectly with zero linked characters.
- **Story Hub** — a live dashboard button next to the chat input: prompt budget bar, perspective (1st/2nd/3rd person), function toggles, cast, recorded NPCs and per-chat prompt overrides.
- **Sessions with real names** — chats are named `"<Story Title> #<session number>"`, the story banner becomes the chat's avatar, and the "Narrator" chip replaces the host card's name.
- **Built-in functions (alpha)** — Character Name Generator (with a real tool), World State, Dice Roller, Memory Keeper. Toggle per story, per chat.

<p align="center"><img src="docs/screenshots/story-hub.webp" alt="Storyline Story Hub" width="360"></p>

<p align="center"><em>The Story Hub: perspective, prompt budget and per-chat function toggles.</em></p>

## Design principles

- **Independent by default.** Storyline is the definition/narration layer. The three companion extensions — Character State, Dice Weaver, Memory Weaver — are optional data sources. Missing any of them: the story runs exactly the same, no crash, no junk sections in the prompt. No cross-imports, ever (only documented `globalThis` APIs).
- **No fake narrator entity.** The host card stores the chat. It is never resolved, injected, or referenced in any prompt block.
- **Prompt override with guardrails.** Quiet prompts, group chats, and other extensions' raw generations are never hijacked. Dry runs still override (accurate token counting). Other extensions' normal chats are untouched.
- **Everything is data.** Imports are `JSON.parse` + schema normalization. Storyline definitions live in your settings; per-chat state lives in chat metadata. Nothing leaves your machine.

## Highlights

- 🌐 **English or Vietnamese UI** — switch in the Story Library title bar or with `/storyline lang en|vi` (English by default; prompts sent to the AI stay English).
- 🌗 **Follows your theme** — every Storyline window uses your SillyTavern theme colors, light or dark.
- 🎭 **Perspective per chat** — first, second (default) or third person, switchable mid-story from the Hub or `/storyline perspective 2`.
- 🧠 **Token-smart** — relevance-scanned character blocks, budget truncation, a context budget planner that always fits the model's real prompt window (with a `## Prompt Budget` note when blocks are cut), the last 30 recorded NPCs in the prompt with the full registry kept in the chat file, tiered memory recall — `/storyline debug` shows the exact block order, token sizes and any budget cuts, with a Copy button for the flattened prompt.
- 🖼 **Yours to shape** — story banners (used as the story's chat avatar), multiple openings, a custom narration style per story and per chat, expandable editors with live token counters, a readiness checklist.
- 🤝 **Sandboxed integrations** — world state reads are projections; state changes happen only through Character State's own tools; dice randomness comes only from Dice Weaver; the AI never writes memories itself.

## Compatibility

- SillyTavern **1.18.0+**
- Chat completion APIs: full experience (native tool calling detected automatically). Text completion APIs: works, but function-calling degrades to inline guidance and instruct-mode wrapping is bypassed.
- Single-character chats (group chats cannot host a Storyline).

## Installation

**Requirements:** SillyTavern **1.18.0+**.

**Option 1 — install from SillyTavern (recommended):**

1. Open the **Extensions** panel (puzzle icon) → click **Install extension**.
2. Paste the Git URL of this repository: `https://github.com/khangdh0202/SillyTavern-Storyline`.
3. Pick **Install just for me** or **Install for all users**.
4. Reload SillyTavern (F5). The **golden book icon** appears in the top toolbar — open it to create your first storyline.

**Option 2 — manual:**

Clone or copy the repository into an extensions folder, then reload SillyTavern (F5):

- Per user: `data/<user-handle>/extensions/Storyline`
- All users: `public/scripts/extensions/third-party/Storyline`

**Updating to a new version:** Extensions panel → **Manage extensions** → *Update* (or `git pull` inside the extension folder), then reload the page (F5). Story definitions live in your settings file and per-chat state lives in chat files — an update never touches them.

**Troubleshoot:** if the golden book button doesn't appear — check the browser console (F12) for `[Storyline]` messages, confirm the folder name is exactly `Storyline`, and confirm the extension is listed in the Extensions panel.

## Documentation

📖 **[USER_GUIDE.md](USER_GUIDE.md)** — the full manual: every feature, every command, step by step.
🇻🇳 **[USER_GUIDE.vi.md](USER_GUIDE.vi.md)** — tài liệu đầy đủ bằng tiếng Việt.

## Optional companion extensions

Storyline is designed to be the narrative layer on top of three optional, fully independent extensions:

- **Character State** → *World State* function: live sheets for the player, cast and side NPCs, scenes and an in-story clock, projected into the Storyteller's context each turn. State changes happen only through its own validated tools.
- **Dice Weaver** → *Dice Roller* function: single source of dice randomness with result cards in chat; Storyline adds the when-to-roll instructions and strips dice markers from history.
- **Memory Weaver** → *Memory Keeper* function: background long-term memory, re-projected into the story as a budget-capped **Story Memories** block with tiered recall.

None of them are required. With zero of them, Storyline is a complete storyteller experience.

| Companion | Storyline function | Minimum version for this Storyline |
|---|---|---|
| [Character State](https://github.com/khangdh0202/SillyTavern-CharacterStats) | World State | 3.1.0 |
| [Dice Weaver](https://github.com/khangdh0202/SillyTavern-DiceWeaver) | Dice Roller | 0.6.0 |
| [Memory Weaver](https://github.com/khangdh0202/SillyTavern-MemoryWeaver) | Memory Keeper | 0.9.1 |

You don't have to install them by hand: every function row in the editor and the Story Hub shows the companion's status with a one-click **Install** (SillyTavern's own install dialog, `main` branch prefilled), **Enable**, or **Update** when the installed version is older than the minimum. A function whose companion is missing is simply left out of the prompt.

## 🐞 Bug reports & help

Found a bug or have a question? Open an issue on **[GitHub Issues](https://github.com/khangdh0202/SillyTavern-Storyline/issues/new/choose)** and pick *Bug report* or *Question / idea* — the form asks for everything needed.

A good bug report includes:

- your SillyTavern version and Storyline version (Extensions panel → Manage extensions)
- the API / model you use
- steps to reproduce: what you did, what you expected, what happened instead
- errors from the browser console (F12 → Console), if any — copy the red lines
- a screenshot when something looks wrong

Remove private story content and API keys before posting — issues are public.

## ❤️ Support

If Storyline makes your stories better, consider supporting the project:

[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/kdturtle)

or click the **💜 Sponsor** button at the top of this repository (enabled via [`.github/FUNDING.yml`](.github/FUNDING.yml) → `ko_fi: kdturtle`).

## License

Released under the [GNU General Public License v3.0 (GPL-3.0)](LICENSE) — free to use, modify and redistribute; any fork or redistribution must stay open-source under the same license. © 2026 kdturtle.
