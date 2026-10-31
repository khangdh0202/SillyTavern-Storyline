/* Shared strings: constants displayed in the UI (perspective/mode labels,
   function catalog), companion integrations and generic buttons. */
export default {
    /* Generic buttons */
    'Cancel': 'Huỷ',
    'Close': 'Đóng',
    'Save': 'Lưu',
    'Delete': 'Xoá',
    'Edit': 'Sửa',
    'Back': 'Quay lại',
    'Remove': 'Gỡ',

    /* PERSPECTIVE_LABELS */
    '1st Person': 'Ngôi thứ nhất',
    '2nd Person': 'Ngôi thứ hai',
    '3rd Person': 'Ngôi thứ ba',

    /* FUNCTION_MODE_LABELS / FUNCTION_MODE_HINTS */
    'Off by default': 'Mặc định tắt',
    'On by default': 'Mặc định bật',
    'Always on': 'Luôn bật',
    'Available, but new chats start with it off — players can turn it on in the Story Hub.': 'Có sẵn, nhưng chat mới bắt đầu ở trạng thái tắt — người chơi bật được trong Story Hub.',
    'New chats start with it on — players can turn it off in the Story Hub.': 'Chat mới bắt đầu ở trạng thái bật — người chơi tắt được trong Story Hub.',
    'Always active; players cannot turn it off. Use only when the story depends on it.': 'Luôn hoạt động; người chơi không tắt được. Chỉ dùng khi truyện phụ thuộc vào nó.',

    /* BUILT_IN_FUNCTIONS (display only — the AI always gets the English text) */
    'Character Name Generator': 'Trình đặt tên nhân vật',
    'Registers the name for a newly introduced character. Invent an original name yourself — native to the story\'s language, culture and era — and pass it in the name parameter.': 'Ghi nhận tên của nhân vật mới xuất hiện. AI tự nghĩ một cái tên độc đáo — hợp với ngôn ngữ, văn hoá và thời đại của truyện — rồi truyền vào tham số name.',
    'Register the name you invented for a new character: pass it in the name parameter and the system records it so the story keeps reusing the exact spelling. Only omit name to ask the system to generate one instead.': 'Ghi nhận tên AI tự nghĩ cho nhân vật mới: truyền vào tham số name và hệ thống lưu lại để truyện luôn dùng đúng cách viết đó. Chỉ bỏ trống name khi muốn hệ thống tự tạo tên.',
    'World State (Character State)': 'Trạng thái thế giới (Character State)',
    'Optional bridge to the Character State extension: projects runtime state, the active scene, game time and relationships into the story context. Requires the Character State extension to be installed.': 'Cầu nối tuỳ chọn tới extension Character State: đưa trạng thái lúc chơi, cảnh hiện tại, thời gian trong game và các mối quan hệ vào ngữ cảnh truyện. Cần cài extension Character State.',
    'The Character State extension (installed separately). When it is missing or the API is unavailable, this function is inactive and the story continues without runtime state.': 'Extension Character State (cài riêng). Khi thiếu hoặc API không dùng được, chức năng này không hoạt động và truyện tiếp tục mà không có trạng thái lúc chơi.',
    'Tools are provided by the Character State extension (state_get, state_update, state_history, state_add_effect, state_remove_effect, state_advance_time, state_relationships, UpdateCharacterState). This function only projects runtime data into the story context.': 'Các tool do extension Character State cung cấp (state_get, state_update, state_history, state_add_effect, state_remove_effect, state_advance_time, state_relationships, UpdateCharacterState). Chức năng này chỉ đưa dữ liệu lúc chơi vào ngữ cảnh truyện.',
    'Dice Roller (Dice Weaver)': 'Gieo xúc xắc (Dice Weaver)',
    'Optional bridge to the Dice Weaver extension: teaches the AI when and how to trigger d20-style dice rolls that the system resolves and renders as result cards. Requires the Dice Weaver extension to be installed and enabled.': 'Cầu nối tuỳ chọn tới extension Dice Weaver: dạy AI khi nào và cách gọi lượt gieo kiểu d20, hệ thống tự gieo và hiện thẻ kết quả. Cần cài và bật extension Dice Weaver.',
    'The Dice Weaver extension (installed separately and enabled). When it is missing or disabled, this function is inactive and the story runs without dice.': 'Extension Dice Weaver (cài riêng và đang bật). Khi thiếu hoặc bị tắt, chức năng này không hoạt động và truyện chạy không có xúc xắc.',
    'The roll_dice tool is provided by the Dice Weaver extension (stealth: narrate first, call last; the system rolls and renders a result card, then the story continues on the next pass).': 'Tool roll_dice do extension Dice Weaver cung cấp (ẩn: kể trước, gọi sau; hệ thống gieo và hiện thẻ kết quả, rồi truyện tiếp tục ở lượt sau).',
    'Memory Keeper (Memory Weaver)': 'Giữ ký ức (Memory Weaver)',
    'Optional bridge to the Memory Weaver extension: projects the chat\'s long-term narrative memories into the story context, so events from earlier in the story keep influencing the narrative. Requires the Memory Weaver extension to be installed and enabled.': 'Cầu nối tuỳ chọn tới extension Memory Weaver: đưa ký ức dài hạn của chat vào ngữ cảnh truyện, để những sự kiện trước đó tiếp tục ảnh hưởng tới câu chuyện. Cần cài và bật extension Memory Weaver.',
    'The Memory Weaver extension (installed separately and enabled). When it is missing or disabled, this function is inactive and the story runs without long-term memories.': 'Extension Memory Weaver (cài riêng và đang bật). Khi thiếu hoặc bị tắt, chức năng này không hoạt động và truyện chạy không có ký ức dài hạn.',
    'No tool: memory entries are recorded automatically by the Memory Weaver extension (a silent optimizer pass every N messages). This function only re-projects the stored memories into the story context, filtered for relevance and budget-truncated.': 'Không có tool: ký ức được extension Memory Weaver tự ghi (một lượt tối ưu chạy ngầm sau mỗi N tin nhắn). Chức năng này chỉ đưa lại các ký ức đã lưu vào ngữ cảnh truyện, có lọc theo mức liên quan và cắt theo ngân sách.',

    /* storyline/integrations.js */
    'Needs {name} — not installed. Inactive until it is.': 'Cần {name} — chưa cài. Chưa hoạt động cho tới khi cài.',
    '{name} is installed but disabled in Extensions. Inactive until enabled.': '{name} đã cài nhưng đang tắt trong Extensions. Chưa hoạt động cho tới khi bật.',
    '{name} is switched off in its own settings. Inactive until it is turned on.': '{name} đang tự tắt trong cài đặt riêng. Chưa hoạt động cho tới khi bật lên.',
    '{name} {version} is older than the {min} this Storyline is built for. It still runs, but some features may be missing — update it.': '{name} {version} cũ hơn bản {min} mà Storyline này cần. Vẫn chạy được, nhưng có thể thiếu tính năng — hãy cập nhật.',
    'Install': 'Cài đặt',
    'Install {name} from {url} (branch {branch})': 'Cài {name} từ {url} (nhánh {branch})',
    'Enable': 'Bật',
    'Enable {name} (the page reloads)': 'Bật {name} (trang sẽ tải lại)',
    'Enable {name}? SillyTavern reloads the page to load it. Unsaved changes in open Storyline windows are lost.': 'Bật {name}? SillyTavern sẽ tải lại trang để nạp extension. Thay đổi chưa lưu trong các cửa sổ Storyline đang mở sẽ mất.',
    'Update': 'Cập nhật',
    'Update {name} to the latest release (needs {min} or newer)': 'Cập nhật {name} lên bản mới nhất (cần {min} trở lên)',
    'Update {name}? SillyTavern downloads the latest version and reloads the page. Unsaved changes in open Storyline windows are lost.': 'Cập nhật {name}? SillyTavern sẽ tải bản mới nhất và tải lại trang. Thay đổi chưa lưu trong các cửa sổ Storyline đang mở sẽ mất.',
    '{name} is already the newest version on its branch.': '{name} đã là bản mới nhất trên nhánh của nó.',
    '{name} updated. Reloading…': 'Đã cập nhật {name}. Đang tải lại…',

    /* ui/util.js formatRelativeTime */
    'just now': 'vừa xong',
    '1 minute ago': '1 phút trước',
    '{n} minutes ago': '{n} phút trước',
    '1 hour ago': '1 giờ trước',
    '{n} hours ago': '{n} giờ trước',
    '1 day ago': '1 ngày trước',
    '{n} days ago': '{n} ngày trước',
    '1 month ago': '1 tháng trước',
    '{n} months ago': '{n} tháng trước',
    '1 year ago': '1 năm trước',
    '{n} years ago': '{n} năm trước',

    /* index.js fake tool transcript warning */
    'The AI wrote a tool call as story text. It did not run, so nothing was updated. Swipe to regenerate.': 'AI đã viết lệnh gọi tool thành chữ trong truyện. Lệnh đó không chạy nên không có gì được cập nhật. Hãy swipe để tạo lại.',

    /* Language switch */
    'Usage: /storyline lang en|vi': 'Cách dùng: /storyline lang en|vi',
    'Interface language': 'Ngôn ngữ giao diện',
    'Language changed — reopening Storyline windows.': 'Đã đổi ngôn ngữ — đang mở lại các cửa sổ Storyline.',
};
