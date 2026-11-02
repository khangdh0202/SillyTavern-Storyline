/* Storyline — Copyright (C) 2026 kdturtle — GPL-3.0, see LICENSE. */
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../../../scripts/popup.js';
import {
    getIntegrationStatus,
    getIntegrationAction,
    describeIntegrationStatus,
    INTEGRATION_STATES,
} from '../storyline/integrations.js';
import { tr } from '../storyline/i18n.js';
import { makeEl, makeButton, runUiAction, escapeHtml } from './util.js';

/* Status line + one-click fix for a function's companion extension (Hub and
   editor). Returns null when the function needs nothing or is ready.
   `onChanged` runs after an install dialog closes so the caller can
   re-render (ST loads a freshly installed extension without a reload). */
export function buildIntegrationNotice(functionId, { onChanged = null } = {}) {
    const status = getIntegrationStatus(functionId);
    if (status.state === INTEGRATION_STATES.NONE || status.state === INTEGRATION_STATES.READY) return null;

    const notice = makeEl('div', 'storyline_integration_notice');
    notice.dataset.integrationState = status.state;
    notice.append(
        makeEl('i', 'fa-solid fa-plug-circle-exclamation fa-fw'),
        makeEl('span', 'storyline_integration_notice_text', describeIntegrationStatus(status)),
    );

    const action = getIntegrationAction(functionId, status);
    if (action) {
        const button = makeButton({
            icon: action.icon,
            label: action.label,
            title: action.title,
            className: 'menu_button interactable storyline_button storyline_integration_action',
        });
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            void runUiAction(button, async () => {
                if (action.confirm) {
                    const confirmed = await callGenericPopup(escapeHtml(action.confirm), POPUP_TYPE.CONFIRM, '', {
                        okButton: action.label,
                        cancelButton: tr('Cancel'),
                    });
                    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
                }
                await action.run();
                onChanged?.();
            });
        });
        notice.append(button);
    }
    return notice;
}
