# Storyline — Tài liệu người dùng

[🌐 English](USER_GUIDE.md) | [🇻🇳 Tiếng Việt](USER_GUIDE.vi.md) · ← Quay lại [README](README.vi.md)

Tài liệu đầy đủ cho extension Storyline (**v0.2.0**): mọi tính năng, mọi lệnh, từng bước một.

---

## Mục lục

1. [Khái niệm cốt lõi: định nghĩa truyện vs session chat](#1-khái-niệm-cốt-lõi)
2. [Bắt đầu](#2-bắt-đầu)
3. [Thư viện Truyện](#3-thư-viện-truyện)
4. [Trình soạn thảo Storyline](#4-trình-soạn-thảo-storyline)
5. [Bắt đầu một session](#5-bắt-đầu-một-session)
6. [Chơi: Người Kể Chuyện làm gì](#6-chơi-người-kể-chuyện-làm-gì)
7. [Story Hub](#7-story-hub)
8. [Góc nhìn (perspective)](#8-góc-nhìn-perspective)
9. [Story functions](#9-story-functions)
10. [Prompt tuỳ chỉnh theo chat](#10-prompt-tuỳ-chỉnh-theo-chat)
11. [Story NPCs](#11-story-npcs)
12. [Cast liên kết & độ liên quan](#12-cast-liên-kết--độ-liên-quan)
13. [Lệnh slash](#13-lệnh-slash)
14. [Debug prompt](#14-debug-prompt)
15. [Nhập / Xuất](#15-nhập--xuất)
16. [Dữ liệu nằm ở đâu](#16-dữ-liệu-nằm-ở-đâu)
17. [Tích hợp tuỳ chọn](#17-tích-hợp-tuỳ-chọn)
18. [Giới hạn](#18-giới-hạn)
19. [FAQ & xử lý sự cố](#19-faq--xử-lý-sự-cố)

---

## 1. Khái niệm cốt lõi

Có **hai tầng** dữ liệu, hiểu được hai tầng này là hiểu được phần lớn cách Storyline vận hành:

| Tầng | Nằm ở đâu | Ai thay đổi |
| --- | --- | --- |
| **Định nghĩa truyện** (tiêu đề, cốt truyện, prompt, scenario, cast, mặc định) | Settings SillyTavern (`extension_settings.storyline`) | Chỉ bạn — qua Editor |
| **Trạng thái session chat** (truyện gắn, góc nhìn, override theo chat, công tắc function, NPC đã ghi) | Metadata và biến cục bộ của chat hiện tại | Bạn (Story Hub / lệnh) và bản thân câu chuyện |

- Một định nghĩa truyện nuôi được **nhiều session**: mỗi lần **Start** tạo một chat mới tên `<Tên Truyện> #N`.
- Sửa truyện không thay đổi lịch sử các session có sẵn — phần lớn thay đổi (cốt truyện, prompt, cast) áp dụng từ tin nhắn kế tiếp.
- **Attach** gắn storyline vào chat hiện có, giữ nguyên chat và lịch sử; **detach** chỉ xoá key Storyline và chat trở lại thành chat thường.

## 2. Bắt đầu
1. Cài extension (xem [README](README.vi.md)) rồi reload SillyTavern (F5).
2. Bấm **icon sách vàng** trên thanh công cụ (cùng hàng Persona / World Info) — hoặc menu đũa phép (Extensions) → *Storylines*.
3. Bấm **New**. Đặt **tiêu đề** và viết **World & Plot** (điều AI cần biết về bối cảnh). Mọi thứ khác là tuỳ chọn và có mặc định hợp lý.
4. (Tuỳ chọn) Thêm một **Opening** — đoạn kể mở màn của mỗi session.
5. Mở tab **Check**: danh sách kiểm tra cho biết còn thiếu gì. Bấm **Save Storyline**.
6. Bấm **Play** → chọn bạn chơi vai ai và opening nào → **Start session**. Gõ hành động của nhân vật; Người Kể Chuyện sẽ kể.

Không cần chọn character card, không cần group chat, không cần cấu hình gì thêm.

## 3. Thư viện Truyện
Thư viện Truyện là dashboard quản lý, mở từ thanh trên cùng, menu đũa phép, `/storyline open`, hoặc nút **Library** trong Hub.

- **Thanh tiêu đề** — **New** (tạo mới), **Import** (file JSON) và ô chọn **Ngôn ngữ giao diện** (English / Tiếng Việt — hoặc `/storyline lang en|vi`).
- **Dải chat hiện tại** — một dòng: storyline đang chơi trong chat này kèm **Hub**, **New session**, **Detach**; hoặc *Normal chat* kèm **Attach…**.
- **Tìm kiếm** — theo tiêu đề, thể loại và pitch. Bộ lọc thể loại xuất hiện khi có từ hai thể loại trở lên.
- **Mỗi dòng** — ảnh banner, tiêu đề (chip *Playing* cho truyện đang chơi), thể loại · cast · opening · function · lần sửa cuối, và **Pitch** (2 dòng).
  - **Play** bắt đầu session mới (xem mục 5).
  - Bấm vào chính thẻ để **sửa**.
  - **⋯** mở Edit / Duplicate / Export JSON / Delete. Esc hoặc bấm ra ngoài để đóng menu.
- Bản nhân bản và bản import được báo và tô sáng trong danh sách.

Xoá một storyline không bao giờ xoá chat của bạn — các session vẫn còn như chat SillyTavern bình thường; chỉ định nghĩa truyện bị xoá.

## 4. Trình soạn thảo Storyline
Mở bằng **New** hoặc bấm vào một truyện. Phần đầu hiện banner, tiêu đề và các chip nhỏ (thể loại, số opening, cast, kích thước prompt, và **Unsaved** khi có thay đổi chưa lưu). Sáu tab, theo thứ tự bạn thường cần:

| Tab | Có gì |
| --- | --- |
| **Story** | Banner (bấm hoặc kéo-thả ảnh), **Title**, **Category**, **Language** (cũng định hướng tên NPC được sinh), **Pitch**, **World & Plot**, **Story Rules**, **Key Facts** |
| **Openings** | Đoạn kể mở màn của session. Nhiều cái → người chơi chọn ở màn Start; không có → truyện bắt đầu trống. Đổi thứ tự bằng ↑ |
| **Cast** | Card **Player** mặc định cho `{{user}}`, và các **Characters** liên kết (xem mục 12) |
| **Narration** | **Narration Style** (người kể viết thế nào), **góc nhìn** mặc định, **nhãn người nói**, **Output Reminder** |
| **Extras** | Thu gọn được: **Linked Lorebooks**, **Story Functions** (+ Game mechanics, Functions reminder), **Context Budget** |
| **Check** | Danh sách **Readiness** (bấm một mục để nhảy tới field cần sửa), **Prompt Size** theo field, **Functions & Integrations** (✓ Sẵn sàng / ⚠ Nên cập nhật / ✗ Chưa cài / ✗ Đang tắt / ✗ Tự tắt theo extension bạn bè), **Export JSON**, id và ngày tạo/sửa |

Mọi field được gửi cho AI có chip **Sent to AI**; Pitch có chip **Players only**.

### Các field prompt, nói dễ hiểu

| Field | Vai trò trong prompt | Mặc định nếu để trống |
| --- | --- | --- |
| **Pitch** | Không gửi — hiện ở Thư viện và màn Start | — |
| **World & Plot** | Tiền đề thế giới, dưới tiêu đề "Story Context" | (không có block) |
| **Story Rules** | Thế giới vận hành ra sao, dưới "Story Guidelines" — thắng Narration Style khi mâu thuẫn | (không có block) |
| **Key Facts** | Sự thật luôn phải giữ, dưới "Important Story Facts" | (không có block) |
| **Narration Style** | Giọng kể, văn phong, nhịp và định dạng của Người Kể Chuyện (≤10k token, có trình soạn riêng) | Phong cách có sẵn |
| **Output Reminder** | Chỉ thị cuối cùng trước khi trả lời (độ dài, tracker, định dạng) | Lời nhắc có sẵn |

Narration Style và Output Reminder có thể override **theo chat** (mục 10).

Quy ước của editor:

- Mọi ô văn bản dài có nút **mở rộng** — editor lớn với bộ đếm ký tự/token trực tiếp.
- **Save Storyline** để lưu; Cancel / Esc / × chỉ hỏi *Discard unsaved changes?* khi thật sự có thay đổi.
- Trong trình soạn Narration Style, **Back** giữ nguyên chỉnh sửa (Save Storyline mới lưu).
- **Banner**: thu nhỏ còn ≤512 px JPEG. Đổi banner rồi lưu sẽ cập nhật luôn avatar của truyện trong các session đã có.
- **Storyline cũ** còn chữ trong field *Plot (User)* cũ sẽ hiện ghi chú ở tab Story kèm nút **Merge into Pitch** (field đó trước giờ không hiển thị ở đâu và không gửi cho AI).

## 5. Bắt đầu một session
Bấm **Play** trên một dòng của thư viện (hoặc `/storyline new <title|id>`). Một màn **Start session** duy nhất hiện ra:

- **Pitch** của truyện, kèm banner và thể loại.
- **You play as** — persona của bạn hoặc bất kỳ character card nào (tìm kiếm được; card mặc định của truyện nằm trên cùng và được đánh dấu).
- **Opening** — chọn một opening của truyện (có xem trước) hoặc **Blank start**.
- **Start session** tạo chat; **Cancel** không tạo gì cả.

Phía sau, một **host card** ẩn mang tên truyện giữ chat (nội dung card không bao giờ dùng trong prompt), và chat được tạo **đúng một lần**, tên `<Tên Truyện> #<N>`.

**Attach** (`/storyline attach <title|id>`, hoặc *Attach…* trong Thư viện) gắn storyline vào chat **hiện tại**, giữ toàn bộ lịch sử. Nếu truyện có nhiều opening và chat đang trống, một picker hiện ra (*Start blank* để bỏ qua).

**Detach** (`/storyline detach`, hoặc Hub → Detach) hỏi xác nhận rồi chỉ xoá metadata Storyline; chat và lịch sử vẫn còn.

## 6. Chơi: Người Kể Chuyện làm gì

Gõ nhân vật của bạn làm gì; assistant hồi đáp bằng văn xuôi thuật chuyện — địa điểm, sự kiện, NPC, hội thoại trong ngoặc kép. Cụ thể, mỗi lần generation, extension dựng lại toàn bộ prompt theo thứ tự:

1. Danh tính người kể + chỉ thị góc nhìn
2. Story Context (mạch truyện AI)
3. Story Guidelines
4. Linked Lorebooks — mỗi lorebook liên kết có entry khớp là một block `Lorebook: <tên>`
5. Chỉ thị của các function đang bật (Story Functions)
6. Important Story Facts (reminder)
7. **Người chơi** — persona hoặc card người chơi của bạn
8. **Nhân vật liên quan** — cast được nhắc trong cửa sổ gần đây
9. **NPC đã biết** — tên mà truyện đã ghi
10. Story Memories (nếu Memory Keeper bật)
11. Các block World State (nếu World State bật)
12. Chỉ thị xúc xắc (nếu Dice Roller bật)
13. Lịch sử câu chuyện — marker xúc xắc bị gạch; mỗi lần chạy tool hiện thành một ghi chú ngắn ở thì quá khứ *(System record, not story text…)* kèm kết quả của từng tool nhưng không kèm tham số; lệnh gọi tool mà AI gõ thành chữ trong câu trả lời (dòng `name({...}) => …`) bị xoá
14. Một system message cuối chứa luật output — Output Reminder, nhắc lại dòng góc nhìn và, khi có function bật, Functions reminder

Mọi thứ khác giữ nguyên SillyTavern bản gốc: streaming, abort, regenerate, swipe, sửa tin nhắn, branch. **Swipe** viết lại câu trả lời đang bị swipe (câu cũ không bị gửi lại cho model). Macro trong tin nhắn cũ (`{{roll}}`, `{{setvar}}`…) không bao giờ bị chạy lại. Chip "Narrator" trên tin nhắn chỉ là hiển thị (`message.name`), không bao giờ nằm trong nội dung.

## 7. Story Hub
Nút cạnh ô nhập chat (chỉ hiện trong chat Storyline) mở dashboard của session hiện tại. Badge hiện số NPC đã ghi (ẩn khi chưa có); trạng thái cảnh báo nghĩa là có function đang bật nhưng model không gọi được tool.

- **Phần đầu** — banner, tiêu đề, thể loại · tên session, chip (góc nhìn, function đang bật, world state, cảnh báo không có function calling).
- **Hành động** — Edit, Library, New session, Detach.
- **Prompt budget** — thanh so sánh block truyện và lịch sử chat với cửa sổ context thật của model; **Measure** dựng prompt ngay mà không gửi gì.
- **Perspective**, **Story Functions** (chỉ khi truyện có function), **Cast** (người chơi + nhân vật liên kết), **Story NPCs** (chỉ khi dùng name generator hoặc đã có NPC), **This chat's prompt overrides** (thu gọn) — xem mục 8–12.
- **Chân trang** — nút **Prompt debug** và **NPC data**.

## 8. Góc nhìn (perspective)

Chọn ngôi 1, ngôi 2 (mặc định) hay ngôi 3 — theo từng chat. Đổi từ Hub hoặc:

```
/storyline perspective 1
/storyline perspective 2
/storyline perspective 3
```

Hiệu lực từ tin nhắn kế tiếp và giữ nguyên sau khi restart.

## 9. Story functions

Mỗi storyline có thể thêm các **function** có sẵn (Editor → Extras → Story Functions). Chọn một mode là thêm function: **Off by default** / **On by default** (người chơi bật/tắt theo chat trong Hub) hoặc **Always on** (khoá bật). **Remove** gỡ function khỏi storyline.

| Function | Thêm vào cái gì | Cần |
| --- | --- | --- |
| **Character Name Generator** | AI tự đặt tên phù hợp qua tool thật (`generate_character_name`) và truyện ghi lại thành NPC | Model hỗ trợ tool calling (có fallback text, kém tin cậy hơn trên reasoning model) |
| **World State** | Sheet sống, scene và giờ thế giới được chiếu vào context | Extension [Character State](#17-tích-hợp-tuỳ-chọn) |
| **Dice Roller** | Chỉ thị khi nào/cách gieo xúc xắc; marker xúc xắc không bao giờ quay lại prompt | Extension [Dice Weaver](#17-tích-hợp-tuỳ-chọn) |
| **Memory Keeper** | Block context "Story Memories" với recall theo tầng | Extension [Memory Weaver](#17-tích-hợp-tuỳ-chọn) |

Mỗi function còn hỗ trợ **chỉ thị tuỳ chỉnh** (≤500 token); **Game mechanics** và **Functions reminder** cho toàn truyện nằm ở Extras → Story Functions. Thiếu extension bạn bè, function chỉ đơn giản là không hoạt động — truyện chạy y như trước, không có section rác, và không chỉ dẫn nào của function đó được gửi cho AI. Lựa chọn bật/tắt của người chơi trong Hub vẫn được giữ, nên function tự chạy ngay khi extension có mặt.

Dòng function trong editor và Hub hiện cái gì đang thiếu, kèm nút sửa một chạm:

| Trạng thái | Nghĩa là | Nút |
|---|---|---|
| **Chưa cài** (*Not installed*) | SillyTavern này chưa cài extension bạn bè | **Cài đặt** — mở hộp cài extension của chính SillyTavern, điền sẵn URL repo (bạn vẫn bấm xác nhận, có thể chọn branch hoặc cài cho mọi user) |
| **Đang tắt** (*Disabled*) | Đã cài nhưng đang tắt trong bảng Extensions | **Bật** — hỏi xác nhận rồi bật lại; SillyTavern tải lại trang |
| **Nên cập nhật** (*Outdated*) | Đã cài và chạy được, nhưng cũ hơn phiên bản tối thiểu (mục 17) — có thể thiếu một số tính năng | **Cập nhật** — hỏi xác nhận, tải bản mới nhất rồi tải lại trang |
| **Tự tắt** (*Switched off*) | Đã cài và đã load, nhưng tự tắt trong cài đặt riêng của nó | — bật trong cài đặt của extension đó |

Nếu model không hỗ trợ function calling, tool bị loại nhưng hướng dẫn vẫn hiện kèm ghi chú "không được fake tool results", và nút cạnh ô nhập chat chuyển sang trạng thái cảnh báo.

## 10. Prompt tuỳ chỉnh theo chat
Hub → **This chat's prompt overrides** (thu gọn; tự mở khi đang có override), chỉ cho chat này:

- **Narration Style** (≤10k token) — thay phong cách kể của storyline.
- **Output Reminder** (≤500 token) — thay output reminder của storyline.

Lưu field rỗng (hoặc text trùng với giá trị hiện tại của storyline) sẽ thu về **follows storyline** — update của tác giả truyện tự lan tới, trừ khi người chơi override tường minh. Giới hạn token chỉ áp cho override thật.

## 11. Story NPCs

Khi Character Name Generator đặt tên một nhân vật, tên đó (kèm các thuộc tính giới tính/văn hoá/phong cách/ngữ cảnh do AI cung cấp) được ghi vào biến cục bộ `storylineState` của chat — isolate theo chat, nằm trong file chat, xem được bằng `/setvar` hoặc `/storyline data`.

Panel **Story NPCs** trong Hub (hiện khi truyện dùng name generator hoặc đã có NPC) liệt kê chúng (tìm kiếm được, có marker `[tracked]` khi Character State đang track NPC đó) và cho xoá từng entry. NPC đã biết được chèn vào prompt dưới dạng danh sách gọn (giới hạn 30).

## 12. Cast liên kết & độ liên quan
Tab **Cast** liên kết character card dưới dạng tham chiếu nhẹ. **Add characters** mở picker có tìm kiếm và avatar — tích nhiều card cùng lúc. Mỗi dòng cast là một dòng gọn:

- avatar · tên · **Always** (luôn có trong prompt) · **Full** (nguyên card, không cắt) · ▾ (alias và ghi chú cho truyện) · xoá.
- Ô lọc giúp tìm nhanh khi cast đông. Card bị thiếu (đổi tên/xoá) được đánh dấu và bỏ qua.

Cách hoạt động ở mỗi lần generate:

- Cửa sổ truyện gần đây (N tin nhắn cuối, N = *Name scan* ở Extras → Context Budget) được quét tìm tên/alias. Chỉ nhân vật khớp — cộng những nhân vật bật **Always** — được nạp (có cache) và chèn vào.
- Mỗi block nhân vật bị cắt theo *Tokens per character*; tổng bị giới hạn bởi *Total character tokens*.
- **Full** tắt cả hai giới hạn **cho riêng nhân vật đó**: description, personality, scenario và các entry lorebook nhúng (đang bật) của card được chèn nguyên văn. Dòng cast hiện chi phí token thật. Nâng context của model nếu cần — `/storyline debug` hiện chip đỏ khi cửa sổ vẫn quá nhỏ. Card Full không bao giờ bị planner cắt và không ăn budget của các nhân vật khác.
- Card người chơi **không bao giờ** bị quét như cast; host card **không bao giờ** được resolve thành thực thể.
- Panel **Cast** trong Hub hiện người chơi (có nút **Change** cho chat này), nhân vật liên kết, alias, ghi chú và nút seed 🌱 (khi có Character State).

**Linked Lorebooks** (tab Extras) — liên kết file World Info của SillyTavern thay vì copy nội dung (tối đa 10, không trùng). Chế độ **Smart** chèn entry khi key của nó xuất hiện trong 12 tin nhắn gần nhất, theo đúng luật khớp của SillyTavern: phân biệt hoa/thường và khớp nguyên từ theo từng entry hoặc theo cài đặt chung (mặc định của SillyTavern là khớp chuỗi con, nên key tiếng Nhật/Trung vẫn khớp), key `/regex/flags`, `{{user}}`/`{{char}}` trong key, secondary key với bốn chế độ logic, và xác suất (chỉ khi bật *use probability*). Entry constant luôn được chèn. Chế độ **Full** chèn mọi entry đang bật. Mỗi lorebook có giới hạn token — entry có **order cao nhất** được giữ trước. Tiêu đề entry (comment) không bao giờ được gửi. Trong chat Storyline, World Info không bao giờ tự kích hoạt qua SillyTavern — block này là đường duy nhất. Lưu file World Info là áp dụng từ tin nhắn tiếp theo (không cần F5).

## 13. Lệnh slash

```
/storyline                          — trạng thái: tên truyện, góc nhìn, opening (mặc định)
/storyline open                     — mở Thư viện Truyện
/storyline new <title|id>           — bắt đầu session mới (màn Start session)
/storyline attach <title|id>        — gắn storyline vào chat hiện tại (có confirm nếu đang gắn)
/storyline detach                   — gỡ sau khi xác nhận (chat trở lại bình thường)
/storyline perspective 1|2|3        — đặt góc nhìn thuật chuyện
/storyline seedcast                 — seed cứng toàn bộ cast vào Character State (bỏ gate function)
/storyline data                     — trình xem NPC: danh sách + JSON thô
/storyline debug                    — debug prompt: thanh budget, từng block có nút Copy riêng, Copy toàn bộ prompt
/storyline lang en|vi               — đổi ngôn ngữ giao diện Storyline (alias: language)
```

Tìm storyline theo id hoặc tiêu đề (không phân biệt hoa thường); nếu không có tiêu đề nào khớp đúng, dùng tiêu đề đầu tiên có chứa đoạn chữ đó. Mọi đường đều có toastr phản hồi.

## 14. Debug prompt
`/storyline debug` (hoặc Hub → **Prompt debug**) cho thấy chính xác Người Kể Chuyện sẽ nhận gì:

- **Chip đầu trang** — số block, trạng thái world state / xúc xắc / ký ức / lorebook, card người chơi, chip đỏ **Context overflow** nếu prompt vẫn lớn hơn cửa sổ.
- **Prompt budget** — block truyện và lịch sử so với cửa sổ prompt **thật** của model (với API chat completion là context size của chat completion, trừ độ dài câu trả lời). Khi prompt sắp tràn, các block ưu tiên thấp bị cắt theo thứ tự cố định (NPC → nhân vật phụ → lorebook → directory → ký ức → scene/giờ → thực thể phụ của world state) và prompt mang ghi chú `## Prompt Budget`.
- **Prompt blocks (theo thứ tự)** — mỗi block thu gọn được, có số token và nút **Copy** riêng, rồi tới lịch sử chat và luật output cuối.
- **Runtime** — người chơi, override theo chat, function đang bật, nhân vật trong cảnh, kho NPC, lorebook, và các dòng cho extension bạn bè đang có mặt (cái nào thiếu/tắt được gộp vào một dòng *Unavailable*).
- **Copy full prompt** — prompt đúng như API nhận (cũng in ra console).

Dry run (bộ đếm token, PromptManager) vẫn chạy override nên số đếm chính xác. Nếu dựng prompt truyện bị lỗi, generation sẽ **dừng kèm thông báo lỗi** thay vì lặng lẽ gửi prompt mặc định của SillyTavern.

## 15. Nhập / Xuất

Mỗi storyline xuất thành file JSON (Thư viện → ⋯ → Export JSON, hoặc Editor → Check → Export JSON — bao gồm cả chỉnh sửa chưa lưu). Import coi file thuần là **data**: parse bằng `JSON.parse`, chuẩn hoá theo schema, và gán **id mới** — import hai lần không bao giờ ghi đè. Character card không bao giờ bị nhúng vào file xuất; nhân vật liên kết giữ dạng tham chiếu. Banner (data URL) đi kèm bản xuất.

**Tự viết storyline hoặc nhờ AI viết:** định dạng file đầy đủ, prompt dán sẵn cho AI và file mẫu có trong [IMPORT_FORMAT.vi.md](IMPORT_FORMAT.vi.md).

## 16. Dữ liệu nằm ở đâu

| Dữ liệu | Vị trí |
| --- | --- |
| Định nghĩa storyline (kèm banner) | `settings.json` → `extension_settings.storyline` |
| Trạng thái session (truyện gắn, góc nhìn, override, công tắc function) | metadata key `storyline` của chat |
| Story NPCs | biến cục bộ chat `storylineState` (trong file chat) |
| Host cards | character card thường, cờ nội bộ `storyline-host-<id>`, nội dung không bao giờ được dùng |

Detach chỉ xoá metadata key. Xoá storyline vẫn giữ nguyên các chat. Mọi thứ nằm trên máy bạn.

## 17. Tích hợp tuỳ chọn

Cả ba tích hợp đều là extension tuỳ chọn, cài độc lập. Storyline chỉ đọc chúng qua `globalThis` API đã tài liệu hoá và không bao giờ import trực tiếp.

Phiên bản tối thiểu mà bản này được xây dựng cho: **Character State 3.1.0**, **Dice Weaver 0.6.0**, **Memory Weaver 0.9.1**. Bản cũ hơn vẫn chạy, nhưng hiện *⚠ Nên cập nhật* kèm nút **Cập nhật** (mục 9).

### Character State → *World State*

- Khi function bật và Character State đã cài, context người kể có thêm: **World Runtime State** (player sheet đứng đầu, rồi cast liên quan, rồi thực thể always-inject — đều cắt theo budget, kèm section `Custom:` thu gọn BFS và notes), một **Character State Directory** (một dòng gọn cho mỗi sheet chưa được chèn, dạy AI đọc bằng `state_get`), **Current Scene**, và **World Time**.
- **Seeding**: sheet của cast liên kết được tạo tự động (idempotent, không bao giờ đè state đã chơi) khi session bắt đầu, khi chat mở, khi editor save, hoặc thủ công qua Hub 🌱 / `/storyline seedcast`. Sheet `{{user}}` của bạn không bao giờ được seed ngầm.
- **Thay đổi state không bao giờ ngầm diễn ra**: AI chỉ sửa state qua các tool có kiểm tra của chính Character State, hoạt động bình thường trong chat Storyline. Văn xuôi không bao giờ tự chuyển thành thay đổi state.
- Không có Character State: không section, không crash. Không có Storyline: Character State không bị đụng.

### Dice Weaver → *Dice Roller*

- Storyline thêm lớp *khi nào gieo* (chỉ hành động bất định và có ý nghĩa) và lớp *cách gieo* theo mode: chỉ thị Function Call, fallback tag `<roll>`, hoặc chỉ thị forced-roll nguyên văn cho trigger từ khoá. Tool `roll_dice` thuộc về Dice Weaver và hoạt động trong chat Storyline.
- `stripDiceMarkers` đảm bảo marker xúc xắc không bao giờ quay lại prompt qua history.
- Luật xúc xắc theo nhân vật cấu hình trong Dice Weaver áp dụng khi AI truyền đúng tên nhân vật liên kết (trigger từ khoá theo nhân vật bị giới hạn ở trigger toàn cục trong chat Storyline — giới hạn đã biết).

### Memory Weaver → *Memory Keeper*

- Memory Weaver nén chat thành các entry trí nhớ trong nền. Vì prompt override của Storyline xoá bỏ việc chèn thông thường của nó, function này chiếu lại trí nhớ đã lưu thành block **Story Memories**.
- Memory Weaver bản mới (recall API) tự chạy vector query và tự gói budget (chặn chờ tối đa 400 ms); bản cũ dùng fallback theo tầng: sự kiện được nhắc trong cảnh gần nhất trước, rồi core memories, rồi một mỏ neo recency nhỏ (~1000 token, entry cắt còn 200 ký tự). Sự kiện cốt lõi cũ vẫn được nhặt trong chat rất dài.
- AI không bao giờ tự ghi memories; bạn xem/sửa trong dashboard riêng của Memory Weaver (`/memories`).

## 18. Giới hạn

- **Group chat** không host được Storyline (Người Kể Chuyện là một pipeline thuật chuyện đơn, không phải chọn lượt nói).
- **API text completion**: prompt override là văn xuôi thuần (bỏ qua instruct-mode wrapping); CFG guidance ≠ 1 không được override. Function calling cần API chat completion; trên text API nó hạ cấp thành hướng dẫn inline + cảnh báo.
- **Bảng token PromptManager** (kiểu OpenAI) hiển thị số đếm trước override — chỉ là thẩm mỹ.
- **Không mô phỏng nền**: truyện chỉ tiến triển khi bạn gửi tin nhắn hoặc kích hoạt generation.
- **Linked lorebook** không hỗ trợ chèn theo position/depth, đệ quy, khớp vector, scan depth riêng từng entry, sticky/cooldown hay inclusion group.
- **Budget token** là xấp xỉ theo ký tự (~4 ký tự/token) — cố ý, không async tokenizer trong đường nóng.
- **Relabel-on-render** chỉ sửa chip "Narrator" trên tin nhắn vừa render; attach giữa chừng để lại chip cũ tới khi tin nhắn render lại.
- **Session cũ**: chat tạo trước luồng đặt tên single-file có thể còn file mồ côi `<host> - <timestamp>` (xoá tay); dense map công tắc function giữ function thêm sau ở trạng thái off tới khi tạo session mới.
- Đệ quy tool-call bị chặn bởi `RECURSE_LIMIT` (5) của SillyTavern; fallback text của name generator kế thừa API/preset hiện tại và có thể fail trên reasoning model có budget hoàn thành nhỏ.

## 19. FAQ & xử lý sự cố

**Icon sách vàng không xuất hiện.** Kiểm tra console trình duyệt (F12) tìm `[Storyline]`; xác nhận thư mục đúng tên `Storyline` và có trong panel Extensions; reload bằng F5 (cache ES module rất dai).

**Assistant trả lời có nhãn kiểu `Name:`.** Model đang trôi khỏi luật output. Thử Narration Style mạnh hơn, override Output Reminder, hoặc nhắc nó một lần trong chat.

**Prompt không có nhân vật của tôi.** Chỉ nhân vật **được nhắc gần đây** (hoặc đánh dấu *Always include*) được chèn. Xem `/storyline debug` → Runtime → *Characters in scene* và block **Relevant Characters**: nhân vật hoặc không khớp, hoặc bị cắt theo budget, hoặc card đã bị xoá (tab Check của editor đánh dấu card bị thiếu).

**Tôi Start session nhưng chat không có greeting.** Bạn đã chọn **Blank start**, hoặc truyện không có opening — hãy tự gõ nước đi đầu tiên. Cancel ở màn Start thì không tạo gì cả.

**Có cảnh báo AI đã viết lệnh gọi tool thành chữ trong truyện.** Model gõ một lệnh kiểu `state_update({...}) => OK` vào câu trả lời thay vì dùng giao diện tool. Không có gì chạy nên không có gì được cập nhật — hãy swipe để tạo lại. Những dòng như vậy cũng bị xoá khỏi lịch sử gửi cho AI, để model không học theo.

**Swipe/regenerate hơi lạ với xúc xắc.** Kết quả xúc xắc đến từ tool/thẻ riêng của Dice Weaver; Storyline gạch marker khỏi history ở mỗi lần dựng lại. Nếu thấy marker cũ, reload (F5).

**Override theo chat của tôi "biến mất".** Override thu về *follow storyline* khi lưu rỗng hoặc trùng text hiện tại của storyline — đó là tính năng lan truyền update của tác giả, không phải bug.

**Sheet trong Character State trống với session mới.** Sheet được seed từ starting state của card lúc session bắt đầu / chat mở / editor save. Card không có starting state thì được báo cáo — không bao giờ tự bịa. Dùng Hub 🌱 hoặc `/storyline seedcast` để seed tay.

**World Time hiện ghi chú bootstrap.** Đồng hồ chưa khởi tạo; AI kéo thời gian qua `state_advance_time` ở lượt đầu tiên liên quan tới thời gian.

**Thiếu một mục trong Hub.** Story Functions chỉ hiện khi storyline có function; Story NPCs chỉ hiện khi dùng name generator hoặc đã có NPC.

**Banner mới không hiện ở chat cũ.** Lưu storyline sau khi đổi banner — avatar truyện được cập nhật khi lưu; reload (F5) nếu trình duyệt vẫn hiện ảnh cache.
