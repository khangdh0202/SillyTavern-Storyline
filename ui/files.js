/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
export function downloadStorylineJson(storyline) {
    if (!storyline) return;
    const blob = new Blob([JSON.stringify(storyline, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `storyline-${String(storyline.title || 'export').replace(/[^\w\-]+/g, '_').toLowerCase()}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export function pickJsonFile() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        const settle = (value) => {
            input.removeEventListener('change', onChange);
            input.removeEventListener('cancel', onCancel);
            resolve(value);
        };
        const onChange = () => {
            const file = input.files?.[0];
            if (!file) {
                settle(null);
                return;
            }
            const reader = new FileReader();
            reader.addEventListener('load', () => settle(String(reader.result ?? '')));
            reader.addEventListener('error', () => settle(null));
            reader.readAsText(file);
        };
        /* Cancel (Esc / close dialog) must settle the promise, not leave it
           pending forever. */
        const onCancel = () => settle(null);

        input.addEventListener('change', onChange);
        input.addEventListener('cancel', onCancel);
        input.click();
    });
}
