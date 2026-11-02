/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
/* Fingerprints of built-in texts that shipped in earlier versions. Kept ONLY
   so a storyline (or chat override) that saved one of them verbatim is
   recognised as "built-in" and follows the current default instead of
   freezing an outdated copy. The retired texts themselves are not shipped:
   each entry is `<trimmed length>:<cyrb53 hash>` of the trimmed text. */

const LEGACY = {
    storyteller: ['6532:2b0sy7175xs'],
    outputReminder: ['220:1qw1lbzgb46'],
    functionsReminder: ['167:17u04sjibgr', '188:1kvdghupmds'],
};

/* cyrb53: small, fast, well-distributed 53-bit string hash. */
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* Returns '' when `text` is a verbatim copy of a retired built-in text of
   that kind, otherwise `text` unchanged. */
export function dropLegacyDefault(kind, text) {
    const value = String(text ?? '');
    const trimmed = value.trim();
    if (!trimmed) return value;
    const fingerprints = LEGACY[kind];
    if (!fingerprints) return value;
    const prefix = `${trimmed.length}:`;
    if (!fingerprints.some((entry) => entry.startsWith(prefix))) return value;
    return fingerprints.includes(`${prefix}${cyrb53(trimmed)}`) ? '' : value;
}
