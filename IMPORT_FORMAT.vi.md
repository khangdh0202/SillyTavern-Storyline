# Định dạng Import của Storyline

[English](IMPORT_FORMAT.md) · **Tiếng Việt**

Storyline nhập được một storyline từ một file `.json` (Thư viện → **Import**). Bạn có thể tự viết file đó, hoặc nhờ một AI chat viết rồi import kết quả. Trang này mô tả định dạng và có sẵn một prompt để dán thẳng vào AI.

Ví dụ hoàn chỉnh, import được ngay: [`examples/sample-storyline.json`](examples/sample-storyline.json).

## Quy trình nhanh

1. Copy **prompt cho AI** bên dưới vào ChatGPT, Claude, Gemini hay AI nào khác, rồi thay phần `<<< … >>>` bằng ý tưởng của bạn.
2. Lưu câu trả lời thành file đuôi `.json`, ví dụ `truyen-cua-toi.json`. Chỉ lưu phần JSON, bỏ các dấu ```` ``` ```` bao quanh.
3. Trong SillyTavern, mở **Storylines** → **Import** và chọn file.
4. Mở storyline mới trong **Editor**:
   - Tab **Cast**: liên kết các character card muốn dùng (xem [Nhân vật](#nhân-vật-và-các-liên-kết-khác)).
   - Tab **Story**: thêm banner nếu muốn.
   - Tab **Check**: xem danh sách kiểm tra và kích thước prompt.
5. Bấm **Play**.

Import không bao giờ ghi đè. Mỗi lần import có id mới, và tiêu đề bị trùng sẽ được thêm hậu tố như `(2)`.

## Prompt cho AI

Copy toàn bộ nội dung trong khối. Prompt viết bằng tiếng Anh cho AI hiểu chính xác nhất; truyện vẫn được viết bằng tiếng Việt nếu bạn ghi rõ trong phần ý tưởng (ví dụ "viết truyện bằng tiếng Việt") — AI sẽ đặt `"language": "vi"`.

````text
You are writing a storyline file for the SillyTavern "Storyline" extension. Storyline turns the AI into a narrator (the Storyteller) who runs an interactive story for one player. Output ONE JSON object and nothing else — no explanation, no markdown fences.

MY STORY IDEA:
<<< Mô tả ý tưởng ở đây: thể loại, bối cảnh, người chơi là ai, xung đột chính, giọng văn, ngôn ngữ của truyện, và những gì muốn xảy ra hoặc không bao giờ xảy ra. >>>

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

### Mẹo để có kết quả tốt

- **Cho AI một ý tưởng thật**, đừng chỉ ghi thể loại. Người chơi là ai? Họ muốn gì? Cái gì cản đường? Bí mật là gì?
- **Yêu cầu viết lại** nếu `plotAI` còn sơ sài. Nó nên giống ghi chú của người quản trò: tên, địa điểm, động cơ và bí mật cụ thể.
- **Key Facts càng ngắn càng tốt.** Trường này được gửi ở mọi lượt; 3–8 dòng là đủ.
- **Thế giới lớn nên để trong lorebook.** Nếu bối cảnh cần nhiều trang lore, chỉ giữ phần cốt lõi trong `plotAI`, phần còn lại đưa vào một World Info book của SillyTavern rồi liên kết ở **Extras → Linked Lorebooks**.

## Tham chiếu các trường

Tên key trong file khác với nhãn trong editor. Mọi trường đều không bắt buộc trừ `title`; trường thiếu sẽ dùng giá trị mặc định.

| Key JSON | Nhãn trong editor | Gửi cho AI? | Nội dung |
| --- | --- | --- | --- |
| `version` | — | — | Luôn là `1`. |
| `title` | Title | — | Tên truyện, tối đa 200 ký tự. |
| `category` | Category | — | Nhãn thể loại để nhóm trong Thư viện. |
| `language` | Language | Định hướng tên NPC | `en`, `vi`, `ja`, `zh`, `ko`, `es`, `fr`, `de`, `other`, hoặc `""` để tự động. |
| `plotSummary` | Pitch | **Không** — chỉ người chơi thấy | Đoạn giới thiệu ngắn, không spoil, hiện ở Thư viện và màn hình Start. |
| `plotAI` | World & Plot | Có, mục "Story Context" | Bản brief đầy đủ cho người kể: thế giới, tiền đề, nhân vật, bí mật, tình huống mở đầu. |
| `promptGuideline` | Story Rules | Có, mục "Story Guidelines" | Thế giới vận hành ra sao. Được ưu tiên hơn Narration Style. |
| `aiReminder` | Key Facts | Có, mục "Important Story Facts" | Những sự thật luôn phải đúng. |
| `firstMessages` | Openings | Hiện trong chat | Mảng `{ "title", "content" }`, tối đa 50. Người chơi chọn một khi bắt đầu. |
| `storytellerPrompt` | Narration Style | Có | Để `""` để dùng phong cách có sẵn. Chỉ điền khi muốn giọng kể khác hẳn. Editor giới hạn ~10.000 token; riêng import chấp nhận tới 200.000 ký tự. |
| `aiOutputReminder` | Output Reminder | Có, chỉ dẫn cuối cùng | Để `""` để dùng nhắc nhở có sẵn. Dùng cho quy tắc độ dài hay định dạng ("cuối mỗi lượt có dòng trạng thái"). |
| `defaultChatSettings.perspective` | Default perspective | Có | `"second"` (mặc định), `"first"` hoặc `"third"`. Người chơi đổi được theo từng chat. |
| `settings.speakerLabel` | Speaker label | — | Tên hiện trên tin nhắn của người kể. Mặc định `"Narrator"`. |
| `settings.relevanceWindow` | Name scan (messages) | — | Số tin nhắn gần nhất được quét để tìm tên nhân vật. 1–50, mặc định 6. |
| `settings.maxTokensPerCharacter` | Tokens per character | — | 50–8000, mặc định 700. |
| `settings.maxTotalCharacterTokens` | Total character tokens | — | 100–32000, mặc định 2000. |
| `functions.entries` | Story Functions | Có, khi đang bật | Xem [Function](#function). |
| `functions.prompt` | Game mechanics | Có, khi có function bật | Luật chung cho các function đang bật. Tối đa ~2000 token. |
| `functions.reminder` | Functions reminder | Có, khi có function bật | Để `""` để dùng nhắc nhở có sẵn. Tối đa ~250 token. |
| `characters` | Cast | Có, khi liên quan | Liên kết tới character card có sẵn. Thường để `[]` trong file do AI viết. |
| `userCard.avatar` | Cast → Player | Có | Tên file avatar của card đại diện người chơi, hoặc `""` để dùng persona. |
| `lorebooks` | Linked Lorebooks | Có | Liên kết tới World Info book có sẵn. |
| `banner` | Banner | — | Một URL `data:image/jpeg;base64,…`. Thêm trong editor sẽ dễ hơn. |

Các key sau bị bỏ qua hoặc thay thế khi import, nên đừng ghi vào: `id`, `hostAvatar`, `metadata`, `plotUser`, `playerPersonas`.

### Macro

`{{user}}` (tên người chơi) được thay thế trong mọi trường gửi cho AI. **Openings được hiển thị đúng nguyên văn**, nên ở đó hãy viết "bạn" thay vì `{{user}}`. Tránh dùng `{{char}}`: trong chat Storyline nó trỏ tới host card ẩn của truyện, không phải một nhân vật.

### Function

`functions.entries` là một object với key là id của function. Function nào không dùng thì bỏ ra. Ghi một function với `"default_off"` nghĩa là nó có sẵn trong Story Hub nhưng đang tắt.

| id | Chức năng | Cần cài |
| --- | --- | --- |
| `character_name_generator` | Người kể đăng ký tên mỗi NPC mới, giữ cách viết tên nhất quán | Không cần gì |
| `world_state` | Chỉ số, HP, túi đồ, quan hệ và thời gian trong game được đưa vào prompt | Extension Character State |
| `dice_roller` | Đổ xúc xắc d20 thật, có thẻ kết quả | Extension Dice Weaver |
| `memory_keeper` | Ký ức dài hạn của truyện được đưa vào prompt | Extension Memory Weaver |

Mỗi entry có dạng `{ "mode": "...", "instruction": "" }`:

- `mode` quyết định trạng thái của chat mới. `"default_off"` là có sẵn nhưng tắt. `"default_on"` là bật, người chơi tắt được. `"required"` là luôn bật.
- `instruction` thường để trống để dùng chỉ dẫn có sẵn. Chỉ dẫn tự viết tối đa ~500 token.

Thiếu extension đi kèm thì storyline vẫn import được. Function đó chỉ không hoạt động, và Story Hub hiện nút **Install** cho nó.

### Nhân vật và các liên kết khác

`characters`, `userCard` và `lorebooks` trỏ tới những thứ đã có trong SillyTavern của bạn, theo tên file. AI không thể biết các tên đó, nên đơn giản nhất là để trống rồi liên kết trong editor sau khi import. Nếu bạn biết tên:

```json
"characters": [
    { "avatar": "Tessa Ruel.png", "aliases": ["Tess"], "note": "Học trò của Marrit; đang trốn ở khu ruộng muối.", "alwaysInclude": false, "full": false }
],
"userCard": { "avatar": "" },
"lorebooks": [
    { "name": "Brinmouth Lore", "mode": "smart", "maxTokens": 2000, "enabled": true }
]
```

- `avatar` là tên file của card trong `characters/`, có cả phần đuôi. Entry nhân vật không có `avatar` sẽ bị bỏ khi import.
- `aliases` là các tên khác cũng kéo card vào prompt (tối đa 20).
- `note` là chỉ dẫn thêm cho truyện này (tối đa ~4000 ký tự).
- `alwaysInclude: true` gửi card ở mọi lượt.
- `full: true` gửi toàn bộ card, không giới hạn kích thước.
- `mode` của lorebook là `"smart"` (kích hoạt theo từ khoá) hoặc `"full"` (cả cuốn). `maxTokens` từ 100 đến 32000.

Liên kết tới card hay book không tồn tại vẫn được giữ, và tab **Check** sẽ báo là bị thiếu.

## Giới hạn và lỗi thường gặp

- Mỗi file một storyline. Cấp ngoài cùng phải là một object JSON `{ … }`, không phải mảng.
- Trường văn bản chứa tối đa 200.000 ký tự. Tiêu đề và thể loại tối đa 200.
- **"Invalid storyline JSON"** nghĩa là file không phải JSON hợp lệ. Nguyên nhân thường gặp là dấu phẩy thừa ở cuối, ngoặc kép kiểu chữ (`“ ”`), comment, hoặc còn sót dấu ```` ``` ````. Hãy bảo AI "return only valid JSON", hoặc dán file vào một trang kiểm tra JSON.
- **"Storyline data must be a JSON object"** nghĩa là file chứa mảng hoặc văn bản thường thay vì `{ … }`.
- Key lạ vẫn được giữ nhưng không dùng, còn sai kiểu dữ liệu thì về mặc định. Gõ nhầm như `"plotAi"` vẫn import không báo lỗi, nhưng trường đó sẽ trống, nên hãy xem tab **Check** sau khi import.
