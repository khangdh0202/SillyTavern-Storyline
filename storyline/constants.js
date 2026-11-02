/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
export const STORAGE_KEY = 'storyline';
export const CHAT_METADATA_KEY = 'storyline';
export const SCHEMA_VERSION = 1;

/* Extension folder as SillyTavern sees it (e.g. 'third-party/SillyTavern-Storyline').
   Derived from this module's URL because ST names the install folder after the
   repo, so a hardcoded 'third-party/Storyline' 404s on every template load. */
export const EXTENSION_FOLDER = (() => {
    const match = new URL('..', import.meta.url).pathname.match(/\/scripts\/extensions\/(.+?)\/?$/);
    return match ? decodeURIComponent(match[1]) : 'third-party/Storyline';
})();

export const PERSPECTIVES = {
    FIRST: 'first',
    SECOND: 'second',
    THIRD: 'third',
};

export const PERSPECTIVE_LABELS = {
    first: '1st Person',
    second: '2nd Person',
    third: '3rd Person',
};

export const VALID_PERSPECTIVES = [PERSPECTIVES.FIRST, PERSPECTIVES.SECOND, PERSPECTIVES.THIRD];

export const CHARS_PER_TOKEN = 4;
export const MAX_FIELD_LENGTH = 200000;
/* v0.1.21: tightened from 3,500,000 — a 512px JPEG @0.82 lands around
   40–70KB, so the old ceiling only invited multi-MB settings.json bloat.
   normalizeStoryline never slices the banner; oversized legacy banners are
   re-encoded once in the editor (only persisted on Save). */
export const BANNER_MAX_CHARS = 400000;

/* Linked lorebooks (v0.1.23). */
export const MAX_LOREBOOKS = 10;
/* Key-matching window for smart-mode lorebooks: deeper than the character
   relevance window because lorebook keys are sparser than character names. */
export const LOREBOOK_SCAN_MESSAGES = 12;
export const LOREBOOK_TOKENS_MIN = 100;
export const LOREBOOK_TOKENS_MAX = 32000;
export const LOREBOOK_TOKENS_DEFAULT = 2000;
export const MAX_SCENARIOS = 50;
export const MAX_CHARACTERS = 100;

export const HOST_CARD_PREFIX = 'storyline-host-';

export const DEFAULT_CHAT_SETTINGS = {
    perspective: PERSPECTIVES.SECOND,
};

export const DEFAULT_STORYLINE_SETTINGS = {
    maxTokensPerCharacter: 700,
    maxTotalCharacterTokens: 2000,
    relevanceWindow: 6,
    speakerLabel: 'Narrator',
};

/* Built-in Narration Style (v0.2.0 rewrite). It is written against the real
   prompt layout built in context.js: it names the section titles the model
   actually sees ("Story Context", "Story Guidelines", ...), never hardcodes a
   perspective (PERSPECTIVE_INSTRUCTIONS is appended after it) and contains no
   output example, so it stays neutral for every language and person. */
export const DEFAULT_STORYTELLER_PROMPT = `### YOUR ROLE
You are the storyteller of an interactive story written together with {{user}}, the player. You narrate the world and voice every character in it except {{user}}. The player decides what {{user}} does; you decide how the world answers. Aim for the story the player will want to keep reading.

### READING THE STORY NOTES
The sections after these instructions are your private notes for this story. Use them; never quote or summarize them back.
- Story Context: the world, its factions and secrets, and where the plot stands.
- Story Guidelines: the rules of this particular story. When they conflict with anything in these instructions, the Story Guidelines win.
- Important Story Facts: details that must stay true for the whole story.
- The Player: who {{user}} is. Use it to understand {{user}}, never to decide for them.
- Relevant Characters, Known NPCs, Lorebook entries, Story Memories and any runtime state: established canon. Keep names, looks, relationships, possessions, injuries and promises consistent with them.
Sections only appear when they matter. If one is missing, carry on with what you have and invent nothing that contradicts the rest.

### THE PLAYER'S CHARACTER
- Never write {{user}}'s dialogue, decisions, thoughts or feelings, and never settle a choice the player has not made.
- Narrate what follows from the player's last message, then stop at a moment where {{user}} can act or answer. Do not carry {{user}} through a chain of actions on their behalf.
- The obvious completion of an action the player stated is fine; anything that would be a new choice is not.
- If the player's message is vague, read it in the way that makes the most sense for the scene instead of asking what they meant.

### A WORLD THAT PUSHES BACK
- Every character has their own goals, fears, opinions and limits. They can disagree, refuse, lie, bargain, change their minds and act while {{user}} is not looking. Nobody exists only to please {{user}} or to serve the plot.
- People change. Trust is earned and lost, wounds leave marks, and choices are remembered.
- Actions have consequences that fit the world. Do not rescue {{user}} from bad decisions, and do not punish good ones out of nowhere.
- Keep the story moving. When a scene has run its course, bring in a complication, a discovery, an arrival or a jump in time. Slow down for moments that deserve weight. Never let the story stall, loop, or wrap itself up on its own.
- Steer toward the open threads in the Story Context, but follow the player when they take the story somewhere new. Offer hooks; never force them.

### WHAT CHARACTERS KNOW
You know everything; the characters do not. A character acts only on what they saw or heard themselves, what someone told them, or what they could reasonably work out from evidence.
- People elsewhere do not know what just happened here.
- Secrets, private conversations and anyone's inner thoughts stay hidden until they come out in the story.
- No sudden "feeling that something is wrong", no guard who happens to know where {{user}} is hiding, no villain who knows a plan they never heard.

### NEW CHARACTERS
Name new characters the way this world would: match the language, culture, era and naming patterns of the existing cast and places, and avoid stock names that could belong to any story. People who only pass through the scene can stay unnamed ("the innkeeper", "a guard").

### CRAFT
- Write in the language the story is written in. If the player switches language, switch with them.
- Show through concrete detail: what is seen, heard, smelled and touched. One precise detail beats three generic ones.
- Give each character a voice of their own: word choice, rhythm, what they avoid saying.
- Trust the reader with subtext, humor and irony. Do not explain the joke or name the emotion the scene already shows.
- Vary sentence length and paragraph shape. Avoid purple prose, filler and stock phrases such as "a shiver ran down her spine" or "little did they know".
- Never reuse an image, phrase or sentence opening from your recent replies.
- Fit the length to the moment: quick and short for action and banter, fuller for new places and turning points. Two to five paragraphs is usually right.
- Use ellipses and em dashes sparingly.

### FORMAT
- Plain prose. Put spoken dialogue in double quotes: "Stay close," she said.
- No titles, headings, lists, markdown, character-name prefixes, or notes about what you are doing.
- Stay inside the story. Do not comment on it, recap it, offer the player options or ask what they want to do. If the player writes out of character first, answer briefly out of character, then return to the story.
- End on something the player can react to: a line of dialogue, an action, a change in the scene.`;

/* Last block before the reply (after every story note), so it carries only
   the rules models most often drift from in long chats. */
export const DEFAULT_OUTPUT_REMINDER = [
    'Write only the next part of the story: plain prose, with spoken dialogue in double quotes.',
    'Do not write {{user}}\'s words, actions, thoughts or decisions; stop at a moment where {{user}} can respond.',
    'No character-name prefixes, headings, analysis or out-of-story commentary.',
].join('\n');

export const PERSPECTIVE_INSTRUCTIONS = {
    first: 'Narrative perspective: FIRST PERSON. Narrate through the player\'s own eyes, using I, me and my for the player\'s character.',
    second: 'Narrative perspective: SECOND PERSON. Address the player\'s character as "you" in the narration (for example: "You push open the door.").',
    third: 'Narrative perspective: THIRD PERSON. Refer to the player\'s character by name, with the pronouns that fit them.',
};

export const CONTINUE_INSTRUCTION = 'Continue the last message exactly where it stops, as if it had never been cut off. Do not repeat or rephrase any of its text, and do not start a new scene.';
/* Appended last, so it overrides the "never write for the player" rules
   above for this one turn. */
export const IMPERSONATE_INSTRUCTION = 'This turn is different: write the player\'s next message yourself, overriding the rules above about not writing for the player. Output only what the player\'s character says, does or thinks next, in their own voice and in the chosen perspective. Do not narrate how the world or other characters respond.';

export const FUNCTION_MODES = {
    DEFAULT_OFF: 'default_off',
    DEFAULT_ON: 'default_on',
    REQUIRED: 'required',
};

export const VALID_FUNCTION_MODES = [FUNCTION_MODES.DEFAULT_OFF, FUNCTION_MODES.DEFAULT_ON, FUNCTION_MODES.REQUIRED];

export const FUNCTION_MODE_LABELS = {
    [FUNCTION_MODES.DEFAULT_OFF]: 'Off by default',
    [FUNCTION_MODES.DEFAULT_ON]: 'On by default',
    [FUNCTION_MODES.REQUIRED]: 'Always on',
};

/* One-line explanation per mode (editor + hub tooltips). */
export const FUNCTION_MODE_HINTS = {
    [FUNCTION_MODES.DEFAULT_OFF]: 'Available, but new chats start with it off — players can turn it on in the Story Hub.',
    [FUNCTION_MODES.DEFAULT_ON]: 'New chats start with it on — players can turn it off in the Story Hub.',
    [FUNCTION_MODES.REQUIRED]: 'Always active; players cannot turn it off. Use only when the story depends on it.',
};

export const FUNCTION_INSTRUCTION_TOKEN_LIMIT = 500;
export const FUNCTIONS_PROMPT_TOKEN_LIMIT = 2000;
export const FUNCTIONS_REMINDER_TOKEN_LIMIT = 250;

export const DEFAULT_FUNCTIONS_REMINDER = [
    'Story functions are active: call a tool before you narrate its result, and never invent a result yourself.',
    'Tool calls go through the tool interface only. Never type a tool call or its result into the reply (no lines like "state_update({...}) => OK"): written as text, it does not run and nothing changes.',
].join('\n');

export const BUILT_IN_FUNCTIONS = [
    {
        id: 'character_name_generator',
        name: 'Character Name Generator',
        description: 'Registers the name for a newly introduced character. Invent an original name yourself — native to the story\'s language, culture and era — and pass it in the name parameter.',
        toolName: 'generate_character_name',
        toolSummary: 'Register the name you invented for a new character: pass it in the name parameter and the system records it so the story keeps reusing the exact spelling. Only omit name to ask the system to generate one instead.',
        parameters: [
            {
                name: 'name',
                type: 'string',
                required: false,
                description: 'The name YOU invented for the new character (preferred). Only omit it to ask the system to generate one',
            },
            {
                name: 'gender',
                type: 'string (male | female | neutral)',
                required: true,
                description: 'The gender for the character name',
            },
            {
                name: 'culture',
                type: 'string',
                required: false,
                description: 'The cultural origin of the name (e.g. Japanese, Korean, Arabic, Chinese, European, Latin, Norse, African, Indian, etc.)',
            },
            {
                name: 'style',
                type: 'string',
                required: false,
                description: 'The genre/aesthetic style of the name (e.g. fantasy, modern, medieval, sci-fi, mythological, steampunk, etc.)',
            },
            {
                name: 'context',
                type: 'string',
                required: false,
                description: 'Relevant context about the character or story to help generate a fitting name',
            },
        ],
        output: {
            name: 'name',
            type: 'string',
            description: 'The registered character name (the one you provided, or a system-generated fallback) in the chat\'s language script',
        },
        toolSchema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The name you invented for the new character. Provide it yourself — original and native to the story\'s language, culture and era. Only omit it to ask the system to generate one',
                },
                gender: {
                    type: 'string',
                    enum: ['male', 'female', 'neutral'],
                    description: 'The gender for the character name',
                },
                culture: {
                    type: 'string',
                    description: 'The cultural origin of the name (e.g. Japanese, Korean, Arabic, Chinese, European, Latin, Norse, African, Indian, etc.)',
                },
                style: {
                    type: 'string',
                    description: 'The genre/aesthetic style of the name (e.g. fantasy, modern, medieval, sci-fi, mythological, steampunk, etc.)',
                },
                context: {
                    type: 'string',
                    description: 'Relevant context about the character or story to help generate a fitting name',
                },
            },
            required: ['gender'],
        },
        defaultInstruction: 'You MUST use the generate_character_name tool whenever a NEW named character enters the story: introducing a new character, a stranger who joins the scene and speaks or acts, anyone who will keep appearing or matters to the plot. Every such character MUST be named through this tool — invent the name yourself and pass it in the name parameter; do not write the name into the story text before the tool returns it. Invent names that feel native to this story\'s world: analyze the naming patterns of existing characters, match the setting\'s culture and era, and never use generic overused names. If multiple new characters appear, call the tool once for each. EXCEPTION — do NOT call this tool for incidental background figures who are only mentioned in passing and need no name (e.g. "a guard", "the shopkeeper", "a girl in the crowd"), or when a name would only be a minor world-building or dialogue detail: leave them unnamed and keep writing the story. Never interrupt or replace the story response just to name a character.',
    },
    {
        id: 'world_state',
        name: 'World State (Character State)',
        description: 'Optional bridge to the Character State extension: projects runtime state, the active scene, game time and relationships into the story context. Requires the Character State extension to be installed.',
        contextOnly: true,
        toolSummary: 'Tools are provided by the Character State extension (state_get, state_update, state_history, state_add_effect, state_remove_effect, state_advance_time, state_relationships, UpdateCharacterState). This function only projects runtime data into the story context.',
        requires: 'The Character State extension (installed separately). When it is missing or the API is unavailable, this function is inactive and the story continues without runtime state.',
        tokenLimit: 500,
        defaultInstruction: 'World State integration is active: a <WORLD_STATE> block in the context shows the current runtime state of relevant entities, plus the active scene and world time when available. A Character State Directory section lists every other sheet that exists in this chat (player, side NPCs, characters) with counts only \u2014 the full sheet of any entity is one state_get call away (read it when its values are NOT already in this conversation; never re-read a sheet you already have). Consult the block for facts that must stay consistent (HP, trust, effects, inventory, relationships, time). If a value already exists as a STAT (money, HP, level, counters), change it via \"stats\" in the state tools \u2014 never create a custom key that duplicates a stat name (any casing); custom holds only data with no stat counterpart. Runtime state changes ONLY through the Character State tools (state_get to read on demand, state_update / state_add_effect / state_remove_effect for changes, state_advance_time for the clock) — call them explicitly when the story demands a persistent change. NEVER auto-infer a state change from narrative prose alone ("Alice looks tired" is narration, not fatigue +10). IMPORTANT: state_get/state_update CANNOT create characters (unknown name = UNKNOWN_ENTITY). When the user asks to track or create a NEW NPC (from the Known NPCs list or by name), create it by calling the state_create_npc tool (name + starting stats) — or, when tools are unavailable, by emitting ONE <SIDE_NPC_CREATE>{"name":"<exact spelling>","stats":{"<stat key from the sheet>":<value>}}</SIDE_NPC_CREATE> block in your reply text with its starting stats (plain stat keys copied from the sheet/world state; no _base/_max suffixes) — only when the user explicitly asks, never on your own; entries marked [tracked] already exist in Character State. Always call tools through the tool interface; never write tool calls as text or XML in the reply (no <tool_calls>/<invoke> blocks), never emit tool-call syntax, JSON or meta commentary in the visible story text.',
    },
    {
        id: 'dice_roller',
        name: 'Dice Roller (Dice Weaver)',
        description: 'Optional bridge to the Dice Weaver extension: teaches the AI when and how to trigger d20-style dice rolls that the system resolves and renders as result cards. Requires the Dice Weaver extension to be installed and enabled.',
        contextOnly: true,
        toolSummary: 'The roll_dice tool is provided by the Dice Weaver extension (stealth: narrate first, call last; the system rolls and renders a result card, then the story continues on the next pass).',
        requires: 'The Dice Weaver extension (installed separately and enabled). When it is missing or disabled, this function is inactive and the story runs without dice.',
        tokenLimit: 250,
        defaultInstruction: 'Dice rolls in this story are resolved by the system, never by you: never invent dice numbers, totals or outcomes, and never narrate a result before the system shows it. Roll only for actions whose outcome is genuinely uncertain and meaningful — never for trivial narration. When the user asks for a manual roll, tell them to use the /roll command. If a Dice Rolls section is present in the context, follow it for the exact mechanics available in this chat.',
    },
    {
        id: 'memory_keeper',
        name: 'Memory Keeper (Memory Weaver)',
        description: 'Optional bridge to the Memory Weaver extension: projects the chat\'s long-term narrative memories into the story context, so events from earlier in the story keep influencing the narrative. Requires the Memory Weaver extension to be installed and enabled.',
        contextOnly: true,
        toolSummary: 'No tool: memory entries are recorded automatically by the Memory Weaver extension (a silent optimizer pass every N messages). This function only re-projects the stored memories into the story context, filtered for relevance and budget-truncated.',
        requires: 'The Memory Weaver extension (installed separately and enabled). When it is missing or disabled, this function is inactive and the story runs without long-term memories.',
        tokenLimit: 600,
        defaultInstruction: 'Story Memories integration is active: when a Story Memories section is present in the context, it lists facts and events recorded earlier in this chat by the Memory Weaver extension. Treat them as established canon — keep names, promises, possessions, injuries, relationships and consequences consistent with them, and never contradict or re-explain them as new. Memories are recorded automatically in the background; you never create, edit or call anything to store them. If the section is absent or empty, continue normally.',
    },
];
