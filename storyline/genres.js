/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
/* Genre templates for the Story Rules field. Inserted as plain, editable text
   (never stored as a setting), so they cost tokens only when a storyline uses
   one and old storylines are untouched. Story Rules outrank the Narration
   Style, so these stay about tone, pacing and complications: no output-format
   rules. Kept in English like the rest of the prompt. */
export const GENRE_TEMPLATES = [
    {
        id: 'adventure',
        label: 'Adventure',
        hint: 'journeys, danger, discovery',
        text: `Genre: ADVENTURE. The story is a journey toward a goal, with danger and discovery along the way.
- Pacing: keep up the momentum. Each scene moves {{user}} closer to the goal or further from it; cover travel and downtime with a short time jump unless something happens there. Short and punchy in action, fuller on arrival somewhere new.
- Complications: obstacles with real stakes: rivals, harsh terrain, traps, failing gear, a guide with their own agenda. Clever plans can work; reckless ones cost something.
- Tone: bold and vivid, with wonder at new places and real tension when lives are on the line.`,
    },
    {
        id: 'slice-of-life',
        label: 'Slice of Life',
        hint: 'everyday moments, small stakes',
        text: `Genre: SLICE OF LIFE. The story is about ordinary days and the people in them; small moments matter more than big events.
- Pacing: unhurried. Let scenes breathe: a meal, a walk, a conversation that drifts. Move on with a gentle time jump rather than a crisis.
- Complications: everyday friction: a misunderstanding, a deadline, a friend in a bad mood, a plan that falls through, a favor that comes back around. No villains or disasters unless the story already has them.
- Tone: warm, observant and quietly funny; let feelings show in small gestures.`,
    },
    {
        id: 'life-sim',
        label: 'Life Sim',
        hint: 'building a life over time',
        text: `Genre: LIFE SIM. The story follows {{user}} building a life over weeks, seasons or years: work, money, home, skills and relationships.
- Pacing: time moves in steps. Sum up routine days in a line or two; play out in full what changes something: a first day, a big purchase, a falling-out, a milestone. Say the date or time of day when it jumps.
- Complications: limited time, money and energy; choices that close other doors; people who grow closer or drift away depending on how {{user}} treats them. Progress comes slowly and can slip.
- Tone: grounded and practical, with satisfaction in small gains.`,
    },
    {
        id: 'mystery',
        label: 'Mystery',
        hint: 'clues, suspects, fair play',
        text: `Genre: MYSTERY. The story turns on a question someone wants kept hidden: a crime, a disappearance, a secret.
- Pacing: steady and deliberate. Each scene gives {{user}} at least one new clue, lead or contradiction; do not stall on dead ends. Never solve the case for {{user}}.
- Complications: suspects who lie or hold back for their own reasons, evidence that points the wrong way, a culprit who reacts when {{user}} gets close. Play fair: once the truth is set it does not change, and every clue needed to solve it can be found.
- Tone: tense and observant, alert to small details that do not fit.`,
    },
    {
        id: 'romance',
        label: 'Romance',
        hint: 'slow burn, a relationship that grows',
        text: `Genre: ROMANCE. At the heart of the story is a relationship between {{user}} and one or more characters, and how it grows.
- Pacing: slow burn. Attraction builds through shared moments, small touches and things left unsaid; no confessions or intimacy the relationship has not earned.
- Complications: what keeps them apart: pride, timing, duty, rivals, secrets, old hurts. A love interest has their own life, doubts and wants, and does not fall for {{user}} by default.
- Tone: emotionally attentive; linger on glances, pauses and what a character almost says.`,
    },
    {
        id: 'horror',
        label: 'Horror',
        hint: 'dread, a threat not understood',
        text: `Genre: HORROR. The story builds dread around a threat that is wrong, dangerous and not fully understood.
- Pacing: a slow build. Start with small details that are off and escalate; keep quiet stretches so the scares land. Reveal the threat in pieces, never all at once.
- Complications: safe places stop being safe, help does not come, light, signal or supplies run low, companions panic or make things worse. The danger is real and mistakes can be fatal.
- Tone: unsettling and restrained; suggest more than you show, and lean on sound, silence and the body's senses.`,
    },
    {
        id: 'comedy',
        label: 'Comedy',
        hint: 'misunderstandings, plans that backfire',
        text: `Genre: COMEDY. The story aims to be funny while staying a real story with something at stake.
- Pacing: brisk. Set up jokes and pay them off later; let bad ideas escalate into worse ones.
- Complications: misunderstandings, bad timing, plans that backfire, characters whose quirks clash. Things go wrong in ways that are funny, not cruel.
- Tone: playful and light. Characters take themselves seriously while being absurd; the humor comes from character and situation, never from the narrator winking at the reader.`,
    },
];

/* Append a template after a blank line, never replacing what is there.
   Returns { text, added: false } when that genre's heading is already in the
   field, so inserting twice does not duplicate it. */
export function appendGenreTemplate(current, genreId) {
    const template = GENRE_TEMPLATES.find(item => item.id === genreId);
    const existing = String(current ?? '');
    if (!template) return { text: existing, added: false };
    const heading = template.text.slice(0, template.text.indexOf('.') + 1);
    if (existing.toLowerCase().includes(heading.toLowerCase())) return { text: existing, added: false };
    const base = existing.trimEnd();
    return { text: base ? `${base}\n\n${template.text}` : template.text, added: true };
}
