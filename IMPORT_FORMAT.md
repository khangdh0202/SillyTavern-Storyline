# Storyline Import Format

**English** · [Tiếng Việt](IMPORT_FORMAT.vi.md)

Storyline can import a storyline from a single `.json` file (Library → **Import**). You can write that file yourself, or have any AI chat assistant write it and then import the result. This page covers the format, and gives you a prompt you can paste straight into an AI.

A complete working example: [`examples/sample-storyline.json`](examples/sample-storyline.json).

## Quick workflow

1. Copy the **AI prompt** below into ChatGPT, Claude, Gemini or another assistant, and replace the `<<< … >>>` part with your idea.
2. Save the reply as a file ending in `.json`, for example `my-story.json`. Save only the JSON, without the ```` ``` ```` fences.
3. In SillyTavern, open **Storylines** → **Import** and pick the file.
4. Open the new storyline in the **Editor**:
   - **Cast** tab: link the character cards you want to use (see [Characters](#characters-and-other-links)).
   - **Story** tab: add a banner if you want one.
   - **Check** tab: read the readiness checklist and the prompt sizes.
5. Press **Play**.

Importing never overwrites anything. Each import gets a new id, and a title that already exists gets a suffix such as `(2)`.

## The AI prompt

Copy everything inside the block. Writing it in English works best even for stories in other languages; the `language` field and your own request decide the story's language.

````text
You are writing a storyline file for the SillyTavern "Storyline" extension. Storyline turns the AI into a narrator (the Storyteller) who runs an interactive story for one player. Output ONE JSON object and nothing else — no explanation, no markdown fences.

MY STORY IDEA:
<<< Describe your idea here: genre, setting, who the player is, the main conflict, the tone, the language the story should be written in, and anything you want to happen or never happen. >>>

FORMAT (all keys are optional except "title"; keep the key names exactly as written):
{
  "version": 1,
  "title": "Short title (max 200 characters)",
  "category": "One genre word, e.g. Fantasy, Mystery, Sci-Fi, Horror, Romance, Slice of Life",
  "language": "Story language code: en, vi, ja, zh, ko, es, fr, de, other — or \"\" for auto",
  "plotSummary": "PITCH. 2–4 sentences shown to the PLAYER in the library. Never sent to the AI. No spoilers.",
  "plotAI": "WORLD & PLOT. The narrator's private briefing: setting, premise, factions, key places, key people (name, role, personality, what they want, what they hide), the hidden truth, and the starting tension. This is the most important field. Use plain-text headings in CAPITALS and short paragraphs or '- ' lists.",
  "promptGuideline": "STORY RULES. 4–10 '- ' bullet rules for how the world behaves and how the narrator should run it: pacing, what must stay secret, how consequences work, tone, content limits.",
  "aiReminder": "KEY FACTS. 3–8 '- ' bullets of facts that must ALWAYS stay true (who the player is, what is already known, who is alive). Keep it short.",
  "firstMessages": [
    { "title": "Short opening name", "content": "The first narrator message the player sees. 120–300 words of in-world prose that sets the scene and ends on a hook or a choice." }
  ],
  "characters": [],
  "defaultChatSettings": { "perspective": "second" },
  "settings": { "speakerLabel": "Narrator" },
  "storytellerPrompt": "",
  "aiOutputReminder": "",
  "functions": {
    "entries": {
      "character_name_generator": { "mode": "default_on", "instruction": "" }
    },
    "prompt": "",
    "reminder": ""
  }
}

RULES:
- Valid JSON only: double quotes, no comments, no trailing commas. Line breaks inside strings are written as \n.
- Write the story content (plotSummary, plotAI, promptGuideline, aiReminder, firstMessages) in the story's language.
- The player character is {{user}}. In plotAI, promptGuideline and aiReminder, write {{user}} to mean the player (it is replaced by the player's name). In firstMessages, do not use {{user}} — address the player as "you" (or by role, e.g. "the new keeper"), and never decide what the player says, thinks or does.
- Everything secret goes in plotAI, clearly marked as hidden from the player. plotSummary must contain no spoilers.
- Give 1–3 openings in firstMessages, each a different way into the story.
- perspective is "second" (you), "first" (I) or "third" (he/she/they, by name).
- Leave "characters" as an empty array: character cards are linked later inside SillyTavern. Describe every important NPC inside plotAI instead.
- Leave storytellerPrompt and aiOutputReminder as "" (the built-in narration style is used) unless I asked for a special narration voice or output format.
- Optional functions in "functions.entries" (mode is "default_off", "default_on" or "required"; leave instruction "" to use the built-in instruction):
  - character_name_generator — the narrator names new NPCs consistently. Usually "default_on".
  - dice_roller — d20 dice rolls (needs the Dice Weaver extension). Use for games with skill checks.
  - world_state — HP, stats, inventory, relationships, game time (needs the Character State extension). Use for RPG-style tracking.
  - memory_keeper — long-term story memory (needs the Memory Weaver extension). Good for long campaigns.
  Only include the functions the story benefits from. If you include dice_roller or world_state, you may put the game's rules (stats, difficulty, what triggers a roll) in "functions.prompt" (max ~2000 tokens).
````

### Tips for a good result

- **Give the AI a real idea**, not just a genre. Who is the player? What do they want? What stands in the way? What is the secret?
- **Ask for a revision** if `plotAI` is thin. It should read like a game master's notes: concrete names, places, motives and secrets.
- **Keep Key Facts short.** It is sent on every turn; 3–8 lines is plenty.
- **Large worlds belong in a lorebook.** If the setting needs pages of lore, keep `plotAI` to the essentials and put the rest in a SillyTavern World Info book, then link it under **Extras → Linked Lorebooks**.

## Field reference

Field names in the file differ from the labels in the editor. Everything is optional except `title`; missing fields get their defaults.

| JSON key | Editor label | Sent to the AI? | What to write |
| --- | --- | --- | --- |
| `version` | — | — | Always `1`. |
| `title` | Title | — | Story name, max 200 characters. |
| `category` | Category | — | A genre label used to group the Library. |
| `language` | Language | Guides NPC names | `en`, `vi`, `ja`, `zh`, `ko`, `es`, `fr`, `de`, `other`, or `""` for auto. |
| `plotSummary` | Pitch | **No** — players only | Short, spoiler-free blurb shown in the Library and on the Start screen. |
| `plotAI` | World & Plot | Yes, as "Story Context" | The narrator's full briefing: world, premise, people, secrets, starting situation. |
| `promptGuideline` | Story Rules | Yes, as "Story Guidelines" | How the world behaves. Takes priority over the Narration Style. |
| `aiReminder` | Key Facts | Yes, as "Important Story Facts" | Facts that must always hold. |
| `firstMessages` | Openings | Shown in chat | Array of `{ "title", "content" }`. Up to 50. The player picks one when starting. |
| `storytellerPrompt` | Narration Style | Yes | Leave `""` to use the built-in style. Only fill it in for a deliberately different voice. The editor limits it to ~10,000 tokens; import itself accepts up to 200,000 characters. |
| `aiOutputReminder` | Output Reminder | Yes, last instruction | Leave `""` for the built-in reminder. Use it for length or format rules ("end every reply with a status line"). |
| `defaultChatSettings.perspective` | Default perspective | Yes | `"second"` (default), `"first"` or `"third"`. Players can change it per chat. |
| `settings.speakerLabel` | Speaker label | — | Name shown on narrator messages. Default `"Narrator"`. |
| `settings.relevanceWindow` | Name scan (messages) | — | How many recent messages are scanned for cast names. 1–50, default 6. |
| `settings.maxTokensPerCharacter` | Tokens per character | — | 50–8000, default 700. |
| `settings.maxTotalCharacterTokens` | Total character tokens | — | 100–32000, default 2000. |
| `functions.entries` | Story Functions | Yes, when active | See [Functions](#functions). |
| `functions.prompt` | Game mechanics | Yes, when a function is active | Shared rules for the active functions. Max ~2000 tokens. |
| `functions.reminder` | Functions reminder | Yes, when a function is active | Leave `""` for the built-in reminder. Max ~250 tokens. |
| `characters` | Cast | Yes, when relevant | Links to existing character cards. Usually `[]` in AI-written files. |
| `userCard.avatar` | Cast → Player | Yes | Avatar file name of a card that represents the player, or `""` to use the persona. |
| `lorebooks` | Linked Lorebooks | Yes | Links to existing World Info books. |
| `banner` | Banner | — | A `data:image/jpeg;base64,…` URL. Easier to add in the editor. |

These keys are ignored or replaced on import, so leave them out: `id`, `hostAvatar`, `metadata`, `plotUser`, `playerPersonas`.

### Macros

`{{user}}` (the player's name) is replaced in every field that is sent to the AI. **Openings are shown exactly as written**, so write "you" there instead of `{{user}}`. Avoid `{{char}}`: in a Storyline chat it refers to the story's hidden host card, not to a person.

### Functions

`functions.entries` is an object keyed by function id. Leave out a function you don't want. Including one with `"default_off"` makes it available in the Story Hub, switched off.

| id | What it does | Needs |
| --- | --- | --- |
| `character_name_generator` | The narrator registers each new NPC name, so spellings stay consistent | Nothing |
| `world_state` | Stats, HP, inventory, relationships and game time in the prompt | Character State extension |
| `dice_roller` | Real d20 dice rolls with result cards | Dice Weaver extension |
| `memory_keeper` | Long-term story memories in the prompt | Memory Weaver extension |

Each entry is `{ "mode": "...", "instruction": "" }`:

- `mode` sets how new chats start. `"default_off"` is available but off. `"default_on"` is on, and players can turn it off. `"required"` is always on.
- `instruction` is usually left empty to use the built-in instruction. A custom instruction can be up to ~500 tokens.

A storyline still imports when the companion extension is missing. The function stays inactive, and the Story Hub shows an **Install** button for it.

### Characters and other links

`characters`, `userCard` and `lorebooks` point to things that already exist in your SillyTavern, by file name. An AI cannot know those names, so it is simpler to leave them empty and link them in the editor after importing. If you do know the names:

```json
"characters": [
    { "avatar": "Tessa Ruel.png", "aliases": ["Tess"], "note": "Marrit's apprentice; hiding in the Pans.", "alwaysInclude": false, "full": false }
],
"userCard": { "avatar": "" },
"lorebooks": [
    { "name": "Brinmouth Lore", "mode": "smart", "maxTokens": 2000, "enabled": true }
]
```

- `avatar` is the card's file name in `characters/`, extension included. A character entry without an `avatar` is dropped on import.
- `aliases` holds other names that should also bring the card into the prompt (up to 20).
- `note` is extra guidance for this story (up to ~4000 characters).
- `alwaysInclude: true` sends the card every turn.
- `full: true` sends the whole card with no size limit.
- Lorebook `mode` is `"smart"` (keyword activation) or `"full"` (whole book). `maxTokens` is 100–32000.

A link to a card or book that doesn't exist is kept, and the **Check** tab reports it as missing.

## Limits and common errors

- One storyline per file. The top level must be a JSON object `{ … }`, not an array.
- Text fields hold up to 200,000 characters. Titles and categories hold up to 200.
- **"Invalid storyline JSON"** means the file is not valid JSON. The usual causes are a trailing comma, smart quotes (`“ ”`), a comment, or markdown fences left in the file. Ask the AI to "return only valid JSON", or paste the file into a JSON validator.
- **"Storyline data must be a JSON object"** means the file holds an array or plain text instead of `{ … }`.
- Unknown keys are kept but unused, and wrong types fall back to defaults. A typo such as `"plotAi"` will import without an error, but the field will be empty, so check the **Check** tab after importing.
