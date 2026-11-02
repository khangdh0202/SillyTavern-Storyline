/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import {
    extensionNames,
    extensionTypes,
    extension_settings,
    getExtensionManifest,
    enableExtension,
    openThirdPartyExtensionMenu,
} from '../../../../../scripts/extensions.js';
import { getRequestHeaders } from '../../../../../script.js';
import { tr } from './i18n.js';

/* Companion extensions behind the context-only functions (v0.2.0).
   A function whose companion is not READY is left out of the prompt even
   when the player toggled it on — its guidance would teach the model tools
   that do not exist. The per-chat on/off choice is kept untouched, so the
   function starts working as soon as the companion is installed/enabled.

   Detection never relies on a folder name alone: an install from the repo
   URL lands in a folder named after the repo, a manual copy can use any
   name — the manifest display name is matched as well.

   Versions: `minVersion` is the oldest companion release this Storyline
   version is tested against (manifest.json "version"). Raise it in the same
   commit that starts relying on a newer companion feature, and tag the
   companion release (vX.Y.Z on `installBranch`) so Install/Update get it.
   An older companion still runs (every bridge degrades gracefully) but shows
   an Update prompt. */
export const INTEGRATIONS = {
    world_state: {
        label: 'Character State',
        repoUrl: 'https://github.com/khangdh0202/SillyTavern-CharacterStats',
        installBranch: 'main',
        minVersion: '3.1.0',
        folders: ['character-state', 'SillyTavern-CharacterStats'],
        displayNames: ['character stats / character state', 'character state', 'character stats'],
        /* Same gate as world-state-bridge isWorldStateAvailable. */
        probe: () => Array.isArray(globalThis.CharacterStateAPI?.capabilities),
    },
    dice_roller: {
        label: 'Dice Weaver',
        repoUrl: 'https://github.com/khangdh0202/SillyTavern-DiceWeaver',
        installBranch: 'main',
        minVersion: '0.6.0',
        folders: ['st-diceweaver', 'SillyTavern-DiceWeaver'],
        displayNames: ['dice weaver'],
        probe: () => callIsEnabled(globalThis.DiceWeaverAPI),
    },
    memory_keeper: {
        label: 'Memory Weaver',
        repoUrl: 'https://github.com/khangdh0202/SillyTavern-MemoryWeaver',
        installBranch: 'main',
        minVersion: '0.9.1',
        folders: ['st-memoryweaver', 'SillyTavern-MemoryWeaver'],
        displayNames: ['memory weaver'],
        probe: () => callIsEnabled(globalThis.MemoryWeaverAPI),
    },
};

export const INTEGRATION_STATES = {
    NONE: 'none', // built-in function, needs nothing
    READY: 'ready',
    OUTDATED: 'outdated', // loaded and usable, but older than minVersion
    MISSING: 'missing', // not installed
    DISABLED: 'disabled', // installed, disabled in ST's Extensions panel
    OFF: 'off', // installed and loaded, but switched off in its own settings (or failed to start)
};

/* States in which the companion's API is live and the function may run. */
const USABLE_STATES = new Set([INTEGRATION_STATES.NONE, INTEGRATION_STATES.READY, INTEGRATION_STATES.OUTDATED]);

function callIsEnabled(api) {
    if (!api || typeof api !== 'object' || typeof api.isEnabled !== 'function') return false;
    try {
        return api.isEnabled() === true;
    } catch {
        return false;
    }
}

/* Numeric dotted compare ("0.10.0" > "0.9.1"); a pre-release/build suffix
   is ignored. Unparseable versions compare as equal (never nag). */
export function compareVersions(left, right) {
    const parse = (value) => String(value ?? '').trim().replace(/^v/i, '').split(/[-+]/)[0].split('.').map((part) => Number.parseInt(part, 10));
    const a = parse(left);
    const b = parse(right);
    if (a.some(Number.isNaN) || b.some(Number.isNaN)) return 0;
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const diff = (a[index] ?? 0) - (b[index] ?? 0);
        if (diff) return Math.sign(diff);
    }
    return 0;
}

function findInstalledName(integration) {
    const folders = integration.folders.map((folder) => `third-party/${folder}`.toLowerCase());
    for (const name of extensionNames) {
        const lower = String(name).toLowerCase();
        if (folders.includes(lower)) return name;
    }
    for (const name of extensionNames) {
        if (!String(name).startsWith('third-party/')) continue;
        const displayName = String(getExtensionManifest(name)?.display_name ?? '').trim().toLowerCase();
        if (displayName && integration.displayNames.includes(displayName)) return name;
    }
    return null;
}

/* { state, label, extensionName, version, minVersion } for one function id. */
export function getIntegrationStatus(functionId) {
    const integration = INTEGRATIONS[functionId];
    if (!integration) return { state: INTEGRATION_STATES.NONE, label: '', extensionName: null, version: '', minVersion: '' };
    const extensionName = findInstalledName(integration);
    const version = extensionName ? String(getExtensionManifest(extensionName)?.version ?? '') : '';
    const base = { label: integration.label, extensionName, version, minVersion: integration.minVersion };
    if (integration.probe()) {
        const outdated = version && compareVersions(version, integration.minVersion) < 0;
        return { ...base, state: outdated ? INTEGRATION_STATES.OUTDATED : INTEGRATION_STATES.READY };
    }
    if (!extensionName) return { ...base, state: INTEGRATION_STATES.MISSING };
    const disabled = (extension_settings.disabledExtensions ?? []).includes(extensionName);
    return { ...base, state: disabled ? INTEGRATION_STATES.DISABLED : INTEGRATION_STATES.OFF };
}

export function isIntegrationReady(functionId) {
    return USABLE_STATES.has(getIntegrationStatus(functionId).state);
}

/* Short player-facing status line, '' when nothing is needed. */
export function describeIntegrationStatus(status) {
    const params = { name: status.label, version: status.version, min: status.minVersion };
    switch (status.state) {
        case INTEGRATION_STATES.MISSING: return tr('Needs {name} — not installed. Inactive until it is.', params);
        case INTEGRATION_STATES.DISABLED: return tr('{name} is installed but disabled in Extensions. Inactive until enabled.', params);
        case INTEGRATION_STATES.OFF: return tr('{name} is switched off in its own settings. Inactive until it is turned on.', params);
        case INTEGRATION_STATES.OUTDATED: return tr('{name} {version} is older than the {min} this Storyline is built for. It still runs, but some features may be missing — update it.', params);
        default: return '';
    }
}

/* ST's own update endpoint (the same call as the Extensions panel's update
   button — that helper is not exported). Pulls the branch the companion was
   installed from. */
async function updateCompanion(extensionName) {
    const folder = String(extensionName).replace(/^third-party\//, '');
    const response = await fetch('/api/extensions/update', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ extensionName: folder, global: extensionTypes[extensionName] === 'global' }),
    });
    if (!response.ok) throw new Error(await response.text() || response.statusText);
    return response.json();
}

/* ST's install dialog has no branch argument; prefill its branch field so the
   user sees (and can change) where the companion comes from. Best effort. */
function prefillInstallBranch(branch) {
    let tries = 0;
    const tick = () => {
        const input = document.getElementById('extension_branch_name');
        if (input) {
            if (!input.value) input.value = branch;
            return;
        }
        if (++tries < 40) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

/* The one action that fixes the status, or null:
   { icon, label, title, confirm?, run }. `confirm` is a message the caller
   must confirm first (the action reloads the page). */
export function getIntegrationAction(functionId, status = getIntegrationStatus(functionId)) {
    const integration = INTEGRATIONS[functionId];
    if (!integration) return null;
    const params = { name: integration.label, url: integration.repoUrl, branch: integration.installBranch, min: integration.minVersion };
    if (status.state === INTEGRATION_STATES.MISSING) {
        return {
            icon: 'fa-solid fa-download',
            label: tr('Install'),
            title: tr('Install {name} from {url} (branch {branch})', params),
            run: async () => {
                prefillInstallBranch(integration.installBranch);
                await openThirdPartyExtensionMenu(integration.repoUrl);
            },
        };
    }
    if (status.state === INTEGRATION_STATES.DISABLED) {
        return {
            icon: 'fa-solid fa-power-off',
            label: tr('Enable'),
            title: tr('Enable {name} (the page reloads)', params),
            confirm: tr('Enable {name}? SillyTavern reloads the page to load it. Unsaved changes in open Storyline windows are lost.', params),
            run: () => enableExtension(status.extensionName, true),
        };
    }
    if (status.state === INTEGRATION_STATES.OUTDATED) {
        return {
            icon: 'fa-solid fa-arrows-rotate',
            label: tr('Update'),
            title: tr('Update {name} to the latest release (needs {min} or newer)', params),
            confirm: tr('Update {name}? SillyTavern downloads the latest version and reloads the page. Unsaved changes in open Storyline windows are lost.', params),
            run: async () => {
                const result = await updateCompanion(status.extensionName);
                window.toastr?.success?.(result?.isUpToDate
                    ? tr('{name} is already the newest version on its branch.', params)
                    : tr('{name} updated. Reloading…', params), 'Storyline');
                if (!result?.isUpToDate) location.reload();
            },
        };
    }
    return null;
}
