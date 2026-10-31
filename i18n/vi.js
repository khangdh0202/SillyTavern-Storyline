/* Vietnamese UI dictionary: English source text -> Vietnamese. Split by area
   so each file stays reviewable; later files win on a duplicate key. */
import common from './vi/common.js';
import templates from './vi/templates.js';
import editor from './vi/editor.js';
import hub from './vi/hub.js';
import library from './vi/library.js';

export default {
    ...common,
    ...templates,
    ...editor,
    ...hub,
    ...library,
};
