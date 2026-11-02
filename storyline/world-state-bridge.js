/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { getActiveFunctionsForChat } from './functions.js';
import { CHARS_PER_TOKEN } from './constants.js';
import { readChatState, isStorylineChat } from './chat.js';
import { getStoryline } from './storage.js';

const WORLD_STATE_FUNCTION_ID = 'world_state';
const MAX_ALWAYS_INJECT_ENTITIES = 6;
/* Compact per-entity lines for sheets that exist but are NOT injected:
   the model reads any of them on demand with state_get. */
const MAX_DIRECTORY_ENTITIES = 50;
/* CS protocol name for the player entity ({{user}} resolves to this). */
const USER_PROTOCOL_NAME = 'USER';

/* Cast seeding on chat open: every linked card gets its runtime state (from
   the card's own startingState) the moment the chat opens — no waiting for
   the model to call state_update first. Idempotent; guarded per chat+storyline
   so re-fires on the same chat are no-ops. */
let lastSeededKey = '';

export async function seedCastStatesForActiveChat({ force = false, requireFunction = true } = {}) {
    try {
        if (!isStorylineChat()) return { ok: false, skipped: 'not-storyline-chat' };
        const chatState = readChatState();
        const storyline = getStoryline(chatState?.storylineId);
        if (!storyline) return { ok: false, skipped: 'no-storyline' };

        if (requireFunction) {
            const activeFunctions = getActiveFunctionsForChat(storyline, chatState);
            if (!activeFunctions.some(({ def }) => def.id === WORLD_STATE_FUNCTION_ID)) {
                return { ok: false, skipped: 'world-state-inactive' };
            }
        }

        const api = getApi();
        if (!api || typeof api.integration?.ensureState !== 'function') {
            return { ok: false, skipped: 'cs-ensurestate-unavailable' };
        }

        const chatId = String(globalThis.SillyTavern?.getContext?.()?.chatId ?? '');
        const guardKey = `${chatId}|${storyline.id}|${storyline.metadata?.modified ?? ''}`;
        if (!force && guardKey === lastSeededKey) return { ok: false, skipped: 'already-seeded' };

        const cast = Array.isArray(storyline.characters) ? storyline.characters : [];
        const seeded = [];
        const failed = [];
        let transientFailures = 0;

        for (const link of cast) {
            const name = String(link?.name ?? '').trim();
            if (!name) continue;
            try {
                const probe = await api.integration.ensureState(name);
                if (probe?.ok) {
                    seeded.push(name);
                } else if (probe?.code === 'UNKNOWN_ENTITY') {
                    /* Card deleted or not resolvable — not a state problem. */
                    failed.push(`${name}: ${probe.code}`);
                } else if (probe?.code === 'NO_STARTING_STATE') {
                    failed.push(`${name}: NO_STARTING_STATE`);
                } else {
                    failed.push(`${name}: ${probe?.code ?? 'FAILED'}`);
                    transientFailures++;
                }
            } catch (error) {
                failed.push(`${name}: ${error?.message ?? error}`);
                transientFailures++;
            }
        }

        /* Guard only sticks when nothing failed TRANSIENTLY (e.g. Character
           State momentarily unavailable): a fully-failed pass must be
           retried on the next CHAT_CHANGED/APP_READY, not marked as
           already-seeded until the storyline is re-saved. Terminal results
           (NO_STARTING_STATE / UNKNOWN_ENTITY) still stick the guard. */
        if (transientFailures === 0) {
            lastSeededKey = guardKey;
        }
        console.log(
            `[Storyline] World State bridge: cast seed on chat open →`,
            { seeded, skipped: failed.length ? failed : '(none)' },
        );
        return { ok: true, seeded, failed };
    } catch (error) {
        console.warn('[Storyline] World State bridge: cast seeding failed:', error);
        return { ok: false, error };
    }
}

function getApi() {
    const api = globalThis.CharacterStateAPI;
    if (!api || typeof api !== 'object' || !Array.isArray(api.capabilities)) return null;
    return api;
}

/* Runtime cast add (v0.1.15): saving a storyline from the editor never fires
   CHAT_CHANGED/APP_READY, so a card added to the cast mid-story stayed
   unseeded until the chat was reopened. Called fire-and-forget after a
   successful editor save; no-ops unless THIS storyline is the one attached
   to the open chat. Explicit user action → skips the world_state function
   gate (the CS sheet is useful on its own) and the seed guard. */
export async function seedCastStatesAfterStorylineSave(storylineId) {
    try {
        if (!isStorylineChat()) return { ok: false, skipped: 'not-storyline-chat' };
        const chatState = readChatState();
        if (chatState?.storylineId !== storylineId) return { ok: false, skipped: 'other-storyline' };
        return await seedCastStatesForActiveChat({ force: true, requireFunction: false });
    } catch (error) {
        console.warn('[Storyline] World State bridge: post-save cast seeding failed:', error);
        return { ok: false, error };
    }
}

/* Single-card seed for explicit UI actions (Hub cast row, /storyline seedcast
   fallback). stateGet first so the caller can tell "already tracked" from
   "seeded now"; ensureState is idempotent and never overwrites played data. */
export async function ensureCastMemberState(name) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return { ok: false, code: 'INVALID_NAME' };
    if (!isStorylineChat()) return { ok: false, code: 'NOT_STORYLINE_CHAT' };
    const api = getApi();
    if (!api) return { ok: false, code: 'CS_UNAVAILABLE' };

    if (typeof api.integration?.stateGet === 'function') {
        const probe = await safeCallAsync(`state ${trimmed}`, () => api.integration.stateGet(trimmed));
        if (probe.ok && probe.value?.ok) {
            return { ok: true, already: true, name: probe.value.name ?? trimmed };
        }
        if (probe.ok && probe.value?.code && probe.value.code !== 'NO_STATE') {
            return { ok: false, code: probe.value.code };
        }
    }

    if (typeof api.integration?.ensureState !== 'function') {
        return { ok: false, code: 'CS_ENSURESTATE_UNAVAILABLE' };
    }
    const probe = await safeCallAsync(`ensure ${trimmed}`, () => api.integration.ensureState(trimmed));
    if (probe.ok && probe.value?.ok) {
        return { ok: true, seeded: true, name: probe.value.name ?? trimmed };
    }
    return { ok: false, code: probe.ok ? (probe.value?.code ?? 'FAILED') : 'FAILED' };
}

export function isWorldStateAvailable() {
    return !!getApi();
}

export function supports(capability) {
    const api = getApi();
    if (!api) return false;
    return Array.isArray(api.capabilities) && api.capabilities.includes(capability);
}

function truncateToTokenBudget(text, tokenBudget) {
    const input = String(text ?? '').trim();
    if (!input) return '';
    const maxChars = Math.max(0, Math.floor(tokenBudget)) * CHARS_PER_TOKEN;
    if (input.length <= maxChars) return input;
    const slice = input.slice(0, maxChars);
    const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf(' '));
    return (cut > 0 ? slice.slice(0, cut) : slice).trim();
}

export function isWorldStateFunctionActive(storyline, chatState) {
    return getActiveFunctionsForChat(storyline, chatState).some((fn) => fn.def.id === WORLD_STATE_FUNCTION_ID);
}

export function resolveName(name) {
    const api = getApi();
    if (!api || typeof api.integration?.resolveCharacter !== 'function') return null;
    const probe = safeCall(`resolve ${name}`, () => api.integration.resolveCharacter(String(name ?? '').trim()));
    return probe.ok ? probe.value : null;
}

function safeCall(label, fn) {
    try {
        return { ok: true, value: fn() };
    } catch (error) {
        console.warn(`[Storyline] World State bridge: ${label} failed:`, error);
        return { ok: false, value: null };
    }
}

async function safeCallAsync(label, fn) {
    try {
        return { ok: true, value: await fn() };
    } catch (error) {
        console.warn(`[Storyline] World State bridge: ${label} failed:`, error);
        return { ok: false, value: null };
    }
}

function resolveLinkEntity(api, link) {
    const candidates = [];
    if (link.stateEntityKey) candidates.push(String(link.stateEntityKey).trim());
    if (link.name) candidates.push(String(link.name).trim());
    candidates.push(...(Array.isArray(link.aliases) ? link.aliases : []).map((alias) => String(alias).trim()).filter(Boolean));

    for (const candidate of candidates) {
        const resolved = api.integration?.resolveCharacter?.(candidate);
        if (resolved && resolved.key) {
            return resolved;
        }
    }

    return null;
}

function renderStateLines(state) {
    const lines = [];

    const stats = state?.stats && typeof state.stats === 'object' ? state.stats : {};
    for (const [name, stat] of Object.entries(stats)) {
        if (!stat || typeof stat !== 'object') continue;
        const type = String(stat.type ?? '').toLowerCase();
        if (type === 'boolean' || typeof stat.base === 'boolean') {
            lines.push(`${name}: ${stat.base ? 'yes' : 'no'}`);
            continue;
        }
        if (type === 'number' || (typeof stat.base === 'number' || typeof stat.mod === 'number')) {
            /* Prefer the CS-provided effective value (base + mod + active
               effect deltas) so the prompt matches the Character State sheet. */
            const provided = state.effective ? Number(state.effective[name]) : NaN;
            const effective = Number.isFinite(provided)
                ? provided
                : Number(stat.base ?? 0) + Number(stat.mod ?? 0);
            const max = Number(stat.max);
            const min = Number(stat.min);
            let range = '';
            if (Number.isFinite(max) && max !== 0) {
                range = `/${max}`;
                if (Number.isFinite(Number(stat.min)) && Number(stat.min) !== 0) range += ` (min ${stat.min})`;
            }
            lines.push(`${name}: ${effective}${range}`);
            continue;
        }
        const value = String(stat.base ?? stat.mod ?? '').trim();
        if (value) lines.push(`${name}: ${value}`);
    }

    const effects = Array.isArray(state?.effects) ? state.effects : [];
    for (const effect of effects) {
        if (!effect?.name) continue;
        const duration = Number.isFinite(Number(effect.duration)) && effect.unit
            ? ` (${effect.duration} ${effect.unit})`
            : '';
        lines.push(`Effect: ${effect.name}${duration}`);
    }

    const skills = Array.isArray(state?.skills) ? state.skills : [];
    if (skills.length) {
        const names = skills.map((skill) => skill?.name).filter(Boolean);
        lines.push(`Skills: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` (+${names.length - 6})` : ''}`);
    }

    const inventory = Array.isArray(state?.inventory) ? state.inventory : [];
    if (inventory.length) {
        const names = inventory.map((item) => item?.name).filter(Boolean);
        lines.push(`Inventory: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` (+${names.length - 6})` : ''}`);
    }

    const custom = state?.custom && typeof state.custom === 'object' ? state.custom : {};
    const customLines = [];

    /* Structured custom data (v0.1.17): render the REAL leaf values — before
       this, the prompt never showed the custom object at all, so the model
       had to state_get every turn and wrote tracker updates blind. */
    flattenCustomLines(custom, '', customLines, 24);

    if (customLines.length) {
        lines.push('Custom:');
        lines.push(...customLines);
    }

    const customText = String(state?.customText ?? '').trim();
    if (customText) {
        /* The rules text is the tracker maintenance manual — the model needs
           more than a glimpse to follow it (was 80 tokens). */
        lines.push(`Notes: ${truncateToTokenBudget(customText, 150)}`);
    }

    return lines;
}

/* Flatten a custom object into "path: value" lines — BREADTH-FIRST so every
   top-level container shows its skeleton before any single container floods
   the lines (depth-first let "firsts" eat the whole budget and events/genital
   were never visible → the model invented parallel trackers). Large deeper
   containers collapse to a summary line "(N fields)". */
function flattenCustomLines(custom, prefix, out, limit) {
    let frontier = [[prefix, custom]];

    while (frontier.length && out.length < limit) {
        const next = [];

        for (const [path, node] of frontier) {
            if (out.length >= limit) break;

            if (node === null || typeof node !== "object" || Array.isArray(node)) {
                const text = String(node ?? "");
                out.push(`custom.${path}: ${text.length > 90 ? `${text.slice(0, 90)}\u2026` : text}`);
                continue;
            }

            const children = Object.entries(node);

            if (!children.length) {
                out.push(`custom.${path}: {}`);
                continue;
            }

            /* Big containers deeper than the top level collapse to a summary
               so their EXISTENCE and path stay visible without flooding. */
            if (path && path.includes(".") && children.length > 8) {
                out.push(`custom.${path} (${children.length} fields \u2014 read with state_get)`);
                continue;
            }

            for (const [key, value] of children) {
                next.push([path ? `${path}.${key}` : key, value]);
            }
        }

        frontier = next;
    }
}

function renderEntityBlock(entity, link, tokenBudget) {
    const lines = [`[Runtime Entity: ${entity.name}]  (key: ${entity.key})`];
    if (link?.note?.trim()) lines.push(`Story note: ${link.note.trim()}`);
    lines.push(...renderStateLines(entity.state));
    const status = typeof entity.status === 'string' && entity.status && entity.status !== 'unknown' ? `Status: ${entity.status}` : '';

    let text = lines.filter(Boolean).join('\n');
    if (status) text += `\n${status}`;
    if (tokenBudget && tokenBudget > 0) {
        text = truncateToTokenBudget(text, tokenBudget);
    }
    return text;
}

/* One compact directory line for a sheet that is NOT injected into the
   prompt — counts only; the full state stays readable via state_get. */
function formatDirectoryLine(entity) {
    const counts = [
        entity.stats ? `${entity.stats} stats` : '',
        entity.skills ? `${entity.skills} skills` : '',
        entity.items ? `${entity.items} items` : '',
        entity.effects ? `${entity.effects} effects` : '',
        entity.customTopLevel ? `${entity.customTopLevel} custom` : '',
    ].filter(Boolean).join(', ') || 'empty sheet';

    const typeLabel = entity.type === 'user'
        ? 'player'
        : entity.type === 'side_npc'
            ? 'side NPC'
            : 'character';
    const status = entity.status && entity.status !== 'active' ? `, status: ${entity.status}` : '';

    return `- ${entity.name} \u2014 ${typeLabel} (${counts}${status})`;
}

export async function buildWorldStateContext(storyline, chatState, relevantLinks, budgetOverride = null) {
    const info = {
        available: isWorldStateAvailable(),
        active: false,
        capabilities: [],
        scene: null,
        time: null,
        resolved: [],
        unresolved: [],
        injectedEntities: [],
        seeded: [],
        noStartingState: [],
        timeUninitialized: false,
        stateTokens: 0,
        bridgeCalls: 0,
        errors: [],
        userState: 'unknown',
        directory: [],
    };

    if (!isWorldStateAvailable()) {
        info.errors.push('Character State API not found');
        return { sections: [], info };
    }

    if (!isWorldStateFunctionActive(storyline, chatState)) {
        return { sections: [], info };
    }

    info.active = true;
    const api = getApi();
    info.capabilities = Array.isArray(api.capabilities) ? [...api.capabilities] : [];

    if (!supports('state') || typeof api.integration?.stateGet !== 'function') {
        info.errors.push('Character State capability "state" missing');
        return { sections: [], info };
    }

    const sections = [];
    /* budgetOverride lets the context planner tighten the totals when the
       prompt is overflowing: side entities drop, the player sheet (injected
       first below) stays as long as any room remains. */
    const budgets = { ...(storyline.settings ?? {}), ...(budgetOverride && typeof budgetOverride === 'object' ? budgetOverride : {}) };
    const perEntityBudget = Math.max(50, Number(budgets.maxTokensPerCharacter) || 700);
    const totalBudget = Math.max(100, Number(budgets.maxTotalCharacterTokens) || 2000);
    let totalTokens = 0;

    const entityBlocks = [];
    const resolvedEntities = [];
    const unresolvedLinks = [];

    for (const link of relevantLinks) {
        const resolveProbe = safeCall(`resolve ${link.name}`, () => resolveLinkEntity(api, link));
        info.bridgeCalls += 1;
        const resolved = resolveProbe.ok ? resolveProbe.value : null;

        if (!resolved) {
            unresolvedLinks.push(link.name);
            continue;
        }

        const stateProbe = safeCall(`state ${resolved.name}`, () => api.integration.stateGet(resolved.name));
        info.bridgeCalls += 1;
        let projection = stateProbe.ok ? stateProbe.value : null;

        /* No sheet yet: try the CS-side idempotent seed (same path the chat
           host card uses). Cards without a starting state stay unseeded —
           then the entity is listed with a teach-line instead of silence. */
        if (!projection?.ok && projection?.code === 'NO_STATE' && typeof api.integration?.ensureState === 'function') {
            const ensureProbe = await safeCallAsync(`ensure ${resolved.name}`, () => api.integration.ensureState(resolved.name));
            info.bridgeCalls += 1;
            if (ensureProbe.ok && ensureProbe.value?.ok) {
                projection = ensureProbe.value;
                info.seeded.push(resolved.name);
            } else if (ensureProbe.ok && ensureProbe.value?.code === 'NO_STARTING_STATE') {
                info.noStartingState.push(resolved.name);
                unresolvedLinks.push(link.name);
                continue;
            } else {
                projection = null;
            }
        }

        if (!projection?.ok) {
            if (projection?.code && projection.code !== 'NO_STATE') {
                info.errors.push(`${resolved.name}: ${projection.code}`);
            }
            unresolvedLinks.push(link.name);
            continue;
        }

        resolvedEntities.push({ link, projection, resolved });
        info.resolved.push({ linkName: link.name ?? resolved.name, entityKey: resolved.key, hasState: true });
    }

    const entityBlocksFromProjections = (projections) => {
        for (const { link, projection } of projections) {
            if (totalTokens >= totalBudget) break;
            const remaining = totalBudget - totalTokens;
            const block = renderEntityBlock(projection, link, Math.min(perEntityBudget, remaining));
            if (!block) continue;
            const tokens = Math.ceil(block.length / CHARS_PER_TOKEN);
            if (totalTokens + tokens > totalBudget) break;
            totalTokens += tokens;
            entityBlocks.push(block);
            info.injectedEntities.push(projection.name);
        }
    };

    /* The player's own sheet ({{user}}) is always part of the scene: project
       it FIRST so the budget favors it. Creation stays explicit — never seed
       the user state here (CS invariant: only an explicit user/AI create
       request instantiates it). */
    {
        const userProbe = safeCall('user state', () => api.integration.stateGet(USER_PROTOCOL_NAME));
        info.bridgeCalls += 1;

        if (userProbe.ok && userProbe.value?.ok) {
            const block = renderEntityBlock(userProbe.value, null, Math.min(perEntityBudget, totalBudget - totalTokens));
            if (block) {
                const tokens = Math.ceil(block.length / CHARS_PER_TOKEN);
                if (totalTokens + tokens <= totalBudget) {
                    totalTokens += tokens;
                    entityBlocks.push(block);
                    info.injectedEntities.push(userProbe.value.name);
                }
            }
            info.userState = 'injected';
        } else {
            info.userState = userProbe.ok ? (userProbe.value?.code ?? 'FAILED') : 'FAILED';
        }
    }

    entityBlocksFromProjections(resolvedEntities);
    let alwaysKeys = [];
    const priorityProbe = safeCall('priorities', () => api.integration?.priorities?.());
    if (priorityProbe.ok && priorityProbe.value && typeof priorityProbe.value === 'object') {
        alwaysKeys = Object.entries(priorityProbe.value)
            .filter(([, priority]) => Number(priority) === 3)
            .map(([key]) => key)
            .filter(Boolean)
            .slice(0, MAX_ALWAYS_INJECT_ENTITIES);
    }

    for (const key of alwaysKeys) {
        if (resolvedEntities.some((entry) => entry.resolved.key === key)) continue;
        if (totalTokens >= totalBudget) break;
        /* Priority keys are internal (id:/character:/scene:...) — CS resolves
           by DISPLAY NAME only, so translate key → name via describeEntity. */
        const descProbe = safeCall(`describe ${key}`, () => api.describeEntity?.(key));
        info.bridgeCalls += 1;
        const desc = descProbe.ok ? descProbe.value : null;
        if (!desc?.name) continue;

        const stateProbe = safeCall(`state ${desc.name}`, () => api.integration.stateGet(desc.name));
        info.bridgeCalls += 1;
        const projection = stateProbe.ok ? stateProbe.value : null;
        if (!projection?.ok) continue;

        /* Copy, never mutate the object CS handed back (may be shared). */
        entityBlocksFromProjections([{ link: null, projection: desc.status ? { ...projection, status: desc.status } : projection }]);
    }

    const seedHintLines = info.noStartingState.length
        ? [`No sheet yet (create it with a state_update call when the character first matters): ${info.noStartingState.join(', ')}.`]
        : [];

    if (entityBlocks.length) {
        sections.push({
            id: 'world_state',
            title: 'World Runtime State',
            text: [
                'Runtime facts below are the current truth for this world (source: Character State). Keep them consistent; changes happen only via the Character State tools.',
                ...entityBlocks,
                ...seedHintLines,
            ].join('\n\n'),
        });
    } else if (seedHintLines.length) {
        /* Dead-air guard: the function is active and the cast resolved, but no
           sheet exists and none could be seeded. Teach the model how to seed. */
        sections.push({
            id: 'world_state',
            title: 'World Runtime State',
            text: [
                'No runtime state sheets exist yet in this chat (Character State).',
                ...seedHintLines,
            ].join('\n'),
        });
    }

    /* Character State Directory (v0.1.16): every sheet that EXISTS but was
       not injected above, one compact line each — the model knows all
       entities and reads any full sheet on demand with state_get. Priority-0
       entities are user-hidden from the prompt and stay out; scenes have
       their own section. */
    {
        const overviewProbe = safeCall('overview', () => api.world?.overview?.());
        info.bridgeCalls += 1;
        const overview = overviewProbe.ok ? overviewProbe.value : null;

        if (overview?.groups && typeof overview.groups === 'object') {
            const injected = new Set(info.injectedEntities.map((name) => String(name).toLowerCase()));
            const priorityMap = priorityProbe.ok && priorityProbe.value && typeof priorityProbe.value === 'object'
                ? priorityProbe.value
                : {};

            const pending = [];
            for (const [groupType, list] of Object.entries(overview.groups)) {
                if (groupType === 'scene') continue;
                for (const entity of Array.isArray(list) ? list : []) {
                    if (!entity?.hasState) continue;
                    const name = String(entity.name ?? '').trim();
                    if (!name || injected.has(name.toLowerCase())) continue;
                    if (Number(priorityMap[entity.key]) === 0) continue;
                    pending.push(entity);
                }
            }

            pending.sort((a, b) => String(a.name).localeCompare(String(b.name)));
            const listed = pending.slice(0, MAX_DIRECTORY_ENTITIES);
            const lines = listed.map((entity) => formatDirectoryLine(entity));
            if (pending.length > listed.length) {
                lines.push(`\u2026 +${pending.length - listed.length} more (read with state_get).`);
            }

            if (lines.length) {
                sections.push({
                    id: 'world_state_directory',
                    title: 'Character State Directory',
                    text: [
                        'Sheets that exist in this chat (source: Character State). Their values are NOT injected here to keep the prompt small — read the full sheet of any entity with the state_get tool (exact name as listed). Never invent stats for these entities; read them first.',
                        ...lines,
                    ].join('\n'),
                });
            }

            info.directory = listed.map((entity) => entity.name);
        }
    }

    if (supports('scene') && typeof api.scenes?.active === 'function') {
        const sceneProbe = safeCall('scene', () => api.scenes.active());
        info.bridgeCalls += 1;
        const sceneKey = sceneProbe.ok ? sceneProbe.value : null;

        if (sceneKey) {
            info.scene = sceneKey;
            const stateProbe = safeCall('scene state', () => api.integration.stateGet(sceneKey));
            info.bridgeCalls += 1;
            const projection = stateProbe.ok ? stateProbe.value : null;
            const sceneName = String(sceneKey).replace(/^scene:/, '');
            const sceneLines = projection?.ok ? renderStateLines(projection.state) : [];

            sections.push({
                id: 'scene',
                title: 'Current Scene',
                text: sceneLines.length
                    ? [`Active scene: ${sceneName}`, ...sceneLines].join('\n')
                    : `Active scene: ${sceneName}`,
            });
        }
    }

    if (supports('time') && typeof api.integration?.timeGet === 'function') {
        const timeProbe = safeCall('time', () => api.integration.timeGet());
        info.bridgeCalls += 1;

        if (timeProbe.ok && timeProbe.value) {
            info.time = timeProbe.value;
            sections.push({
                id: 'world_time',
                title: 'World Time',
                text: `In-story time: ${timeProbe.value.formatted} (${timeProbe.value.calendar}).${timeProbe.value.stale ? ' The clock is stale — advance it with state_advance_time when the story moves on.' : ''}`,
            });
        } else {
            /* Clock bootstrap: an uninitialized clock must still be visible,
               or the model never learns the world has one. */
            info.timeUninitialized = true;
            sections.push({
                id: 'world_time',
                title: 'World Time',
                text: 'The in-story world clock exists but is not initialized yet. When the story establishes a starting moment, set it with the state_advance_time tool (it creates the clock on first use).',
            });
        }
    }

    info.unresolved = unresolvedLinks;
    info.stateTokens = totalTokens;

    return { sections, info };
}
