<div align="center">

# Storyline — Chế độ chat "Người Kể Chuyện" cho SillyTavern

**Bạn vào vai nhân vật chính. Cả thế giới tự kể chuyện.**

[🌐 English](README.md) | [🇻🇳 Tiếng Việt](README.vi.md) · [📖 Tài liệu đầy đủ (VI)](USER_GUIDE.vi.md) · [📖 Full Documentation (EN)](USER_GUIDE.md)

</div>

---

## Đây là gì?

**Storyline** thêm một chế độ chat mới vào SillyTavern: assistant trở thành **Người Kể Chuyện (Storyteller)** — thuật lại thế giới quanh nhân vật của bạn bằng văn xuôi liên tục. Không nhãn nhân vật, không lượt nói, không cần một character card đóng vai người dẫn chuyện. Bạn gõ nhân vật làm gì; câu chuyện tự triển khai xung quanh họ.

```
Character Chat:  một nhân vật đang nói với tôi.
Group Chat:      vài nhân vật đang nói với tôi.
Storyline:       một câu chuyện đang được kể quanh tôi.
```

## Có gì mới ở v0.2.0

- **Editor thiết kế lại** — sáu tab theo đúng thứ tự viết truyện (Story · Openings · Cast · Narration · Extras · Check), nhãn "Sent to AI" / "Players only" trên từng field, và **danh sách Readiness** bấm vào là nhảy tới chỗ còn thiếu.
- **Một màn Start duy nhất** — pitch, bạn chơi vai ai và opening nào (hoặc bắt đầu trống) trong một popup; Cancel không bao giờ tạo gì.
- **Cast gọn** — thêm nhiều nhân vật một lúc từ picker có tìm kiếm và avatar; mỗi nhân vật một dòng mảnh với công tắc Always / Full.
- **Thư viện và Hub gọn hơn** — nút Play + menu ⋯, pitch trên mỗi dòng, thanh **prompt budget** trực tiếp trong Hub, các block thu gọn có nút Copy trong `/storyline debug`.
- **Swipe viết lại thật sự** — câu đang bị swipe không còn bị gửi lại cho model; dùng đúng **persona đang chọn** (không phải persona mặc định); budget prompt dùng **context size thật** của API chat completion.
- **Linked lorebook khớp key giống SillyTavern** — theo cài đặt hoa/thường và nguyên từ, regex có flag, key tiếng Nhật/Trung, giữ entry order cao trước; sửa World Info không cần F5.
- **Sửa lỗi** — editor không còn hỏng với storyline có lorebook, theme sáng đọc được, đổi banner cập nhật avatar truyện, Enter không còn bấm nút hai lần.
- **Lệnh gọi tool bị gõ thành chữ** — các lần chạy tool trước đó đến với AI dưới dạng một ghi chú hệ thống ngắn thay vì cú pháp gọi hàm dễ bị chép lại, dòng giả `name({...}) => …` bị xoá khỏi lịch sử, và một cảnh báo báo cho bạn khi câu trả lời có dòng như vậy (lệnh đó không chạy — hãy swipe để tạo lại).
- **Seed cast khi bắt đầu** — bắt đầu session luôn seed cast liên kết vào Character State (khi World State bật), kể cả khi truyện đó đã từng được seed.

## Vì sao bạn cần nó

| Không có | Có Storyline |
| --- | --- |
| Narrator = một card nhân vật giả, description bị leak vào mọi prompt | Người Kể Chuyện **không có danh tính card** — host card chỉ là nơi lưu chat, bị loại khỏi prompt hoàn toàn |
| Một card = một giọng nói | Cả thế giới được kể: địa điểm, sự kiện, NPC, hội thoại trong ngoặc kép — không gì là "diễn giả" |
| Định nghĩa nhân vật của bạn xung đột với card | **Bạn quyết định chơi vai ai** — persona hoặc bất kỳ card nào, chọn mỗi session |
| Chat dài là quên cốt truyện | Các tích hợp tuỳ chọn thêm world state, xúc xắc và trí nhớ dài hạn — phủ lên trên |
| Truyện nằm lộn xộn trong lorebook | **Thư viện Truyện (Story Library)**: mỗi truyện là một định nghĩa có version, xuất/nhập được, có banner, pitch, opening, cast và prompt riêng |

## Nó làm được gì

- **Thư viện Truyện** — định nghĩa truyện độc lập với character card: tiêu đề, thể loại, banner, pitch, world & plot, story rules, key facts, narration style, opening, cast và lorebook liên kết. Xuất/nhập JSON ([định dạng + prompt cho AI](IMPORT_FORMAT.vi.md)), nhân bản, tìm kiếm và lọc theo thể loại.
- **Thuật kể chuyện** — toàn bộ prompt generation được dựng lại qua các hook chính thức của SillyTavern: nhận diện người kể → bối cảnh truyện → guideline → linked lorebook → story function → key facts → người chơi → nhân vật liên quan → NPC → ký ức → world state → xúc xắc → lịch sử → luật output. Mọi thứ khác giữ nguyên bản: streaming, abort, swipe, branch, lưu chat.
- **Màn Start session** — trước mỗi session, chọn persona của bạn hoặc bất kỳ card nào làm người chơi (`{{user}}`) và chọn opening. Card người chơi không bao giờ là người nói và không bị quét như cast; description/personality của card trở thành sheet người chơi.
- **Chèn nhân vật thông minh** — nhân vật liên kết chỉ là tham chiếu nhẹ. Mỗi lượt, chỉ những nhân vật được nhắc trong cửa sổ truyện gần đây mới được nạp (có cache) và chèn vào, mỗi người giới hạn token riêng và tổng chung. Truyện chạy hoàn hảo với **không** nhân vật liên kết nào.
- **Story Hub** — nút dashboard trực tiếp cạnh ô nhập chat: thanh prompt budget, góc nhìn (ngôi 1/2/3), công tắc function, cast, NPC đã ghi và override prompt theo chat.
- **Session có tên thật** — chat được đặt tên `"<Tên Truyện> #<số session>"`, banner truyện thành avatar của chat, chip "Narrator" thay tên host card.
- **Functions có sẵn (alpha)** — Character Name Generator (có tool thật), World State, Dice Roller, Memory Keeper. Bật/tắt theo truyện, theo chat.

## Triết lý thiết kế

- **Độc lập mặc định.** Storyline là lớp định nghĩa/thuật chuyện. Ba extension bạn bè — Character State, Dice Weaver, Memory Weaver — là nguồn dữ liệu tuỳ chọn. Thiếu cái nào: truyện vẫn chạy y nguyên, không crash, không section rác trong prompt. Không import chéo bao giờ (chỉ đọc `globalThis` API đã tài liệu hoá).
- **Không có thực thể narrator giả.** Host card chỉ để lưu chat. Nó không bao giờ được resolve, chèn hay nhắc tới trong bất kỳ block prompt nào.
- **Override prompt có kiểm soát.** Quiet prompt, group chat và generateRaw của extension khác không bao giờ bị chiếm. Dry run vẫn override (đếm token chính xác). Chat thường của extension khác không bị đụng.
- **Mọi thứ là data.** Import là `JSON.parse` + chuẩn hoá schema. Định nghĩa truyện nằm trong settings; trạng thái theo chat nằm trong chat metadata. Không có gì rời khỏi máy bạn.

## Điểm nổi bật

- 🌐 **Giao diện tiếng Anh hoặc tiếng Việt** — đổi ở thanh tiêu đề Thư viện truyện hoặc bằng `/storyline lang en|vi` (mặc định tiếng Anh; prompt gửi cho AI luôn là tiếng Anh).
- 🌗 **Theo theme của bạn** — mọi cửa sổ Storyline dùng màu theme SillyTavern, sáng hay tối.
- 🎭 **Góc nhìn theo chat** — ngôi 1, ngôi 2 (mặc định) hay ngôi 3, đổi giữa truyện từ Hub hoặc `/storyline perspective 2`.
- 🧠 **Tiết kiệm token** — block nhân vật quét theo độ liên quan, cắt theo budget, **budget planner luôn giữ prompt vừa cửa sổ prompt thật của model** (có ghi chú `## Prompt Budget` khi phải cắt), 30 NPC mới nhất vào prompt còn toàn bộ registry lưu trong file chat, recall trí nhớ theo tầng — `/storyline debug` hiện đúng thứ tự block, số token và các lần cắt budget, kèm nút Copy cho prompt đã flatten.
- 🖼 **Theo ý bạn** — banner truyện (làm avatar của truyện trong chat), nhiều opening, narration style tuỳ chỉnh theo truyện và theo chat, editor mở rộng với bộ đếm token trực tiếp, danh sách readiness.
- 🤝 **Tích hợp có kiểm soát** — đọc world state chỉ là chiếu dữ liệu; thay đổi state chỉ qua tool của Character State; độ ngẫu nhiên xúc xắc chỉ từ Dice Weaver; AI không bao giờ tự ghi memories.

## Tương thích

- SillyTavern **1.18.0+**
- API chat completion: trải nghiệm đầy đủ (tool calling tự nhận diện). API text completion: chạy được, nhưng function calling hạ cấp thành hướng dẫn inline và instruct-mode wrapping bị bỏ qua.
- Chat đơn nhân vật (group chat không host được Storyline).

## Cài đặt

**Yêu cầu:** SillyTavern **1.18.0+**.

**Cách 1 — cài từ SillyTavern (khuyên dùng):**

1. Mở panel **Extensions** (icon mảnh ghép) → bấm **Install extension**.
2. Dán Git URL của repository này: `https://github.com/khangdh0202/SillyTavern-Storyline`.
3. Chọn **Install just for me** hoặc **Install for all users**.
4. Reload SillyTavern (F5). **Icon sách vàng** xuất hiện trên thanh công cụ — bấm vào để tạo truyện đầu tiên.

**Cách 2 — thủ công:**

Clone hoặc copy repository vào thư mục extensions, rồi reload SillyTavern (F5):

- Theo user: `data/<user-handle>/extensions/Storyline`
- Cho mọi user: `public/scripts/extensions/third-party/Storyline`

**Nâng phiên bản mới:** panel Extensions → **Manage extensions** → *Update* (hoặc `git pull` trong thư mục extension), rồi reload trang (F5). Định nghĩa truyện nằm trong file settings và trạng thái theo chat nằm trong file chat — nâng version không bao giờ đụng tới chúng.

**Xử lý sự cố:** nếu icon sách vàng không xuất hiện — kiểm tra console trình duyệt (F12) tìm `[Storyline]`, xác nhận tên thư mục đúng là `Storyline`, và extension có xuất hiện trong panel Extensions.

## Tài liệu

📖 **[USER_GUIDE.vi.md](USER_GUIDE.vi.md)** — tài liệu đầy đủ bằng tiếng Việt.
🌐 **[USER_GUIDE.md](USER_GUIDE.md)** — the full manual in English.

## Các extension bạn bè (tuỳ chọn)

Storyline được thiết kế là lớp thuật chuyện bên trên ba extension tuỳ chọn, hoàn toàn độc lập:

- **Character State** → function *World State*: sheet sống cho người chơi, cast và side NPC, scene và đồng hồ trong game, được chiếu vào context người kể mỗi lượt. Thay đổi state chỉ qua tool có kiểm tra của chính nó.
- **Dice Weaver** → function *Dice Roller*: nguồn duy nhất của độ ngẫu nhiên xúc xắc với thẻ kết quả trong chat; Storyline thêm hướng dẫn khi nào gieo và gạch marker xúc xắc khỏi lịch sử.
- **Memory Weaver** → function *Memory Keeper*: trí nhớ dài hạn ghi nền, được chiếu lại thành block **Story Memories** giới hạn budget với recall theo tầng.

Không cái nào là bắt buộc. Với 0 extension, Storyline vẫn là trải nghiệm người kể chuyện hoàn chỉnh.

| Extension bạn bè | Function của Storyline | Phiên bản tối thiểu cho Storyline này |
|---|---|---|
| [Character State](https://github.com/khangdh0202/SillyTavern-CharacterStats) | World State | 3.1.0 |
| [Dice Weaver](https://github.com/khangdh0202/SillyTavern-DiceWeaver) | Dice Roller | 0.6.0 |
| [Memory Weaver](https://github.com/khangdh0202/SillyTavern-MemoryWeaver) | Memory Keeper | 0.9.1 |

Không cần cài tay: mỗi dòng function trong editor và Story Hub hiện trạng thái extension kèm nút **Cài đặt** (hộp cài của chính SillyTavern, điền sẵn nhánh `main`), **Bật**, hoặc **Cập nhật** khi bản đã cài cũ hơn bản tối thiểu. Function thiếu extension chỉ đơn giản bị bỏ khỏi prompt.

## 🐞 Báo lỗi & hỗ trợ

Gặp lỗi hoặc có câu hỏi? Mở issue tại **[GitHub Issues](https://github.com/khangdh0202/SillyTavern-Storyline/issues/new/choose)** và chọn *Bug report* hoặc *Question / idea* — form sẽ hỏi đủ thông tin cần thiết.

Một báo lỗi tốt gồm:

- phiên bản SillyTavern và phiên bản Storyline (panel Extensions → Manage extensions)
- API / model bạn đang dùng
- các bước tái hiện: bạn đã làm gì, mong đợi gì, thực tế xảy ra gì
- lỗi trong console trình duyệt (F12 → Console) nếu có — copy các dòng màu đỏ
- ảnh chụp màn hình khi hiển thị sai

Hãy xoá nội dung truyện riêng tư và API key trước khi đăng — issue là công khai.

## ❤️ Ủng hộ

Nếu Storyline làm câu chuyện của bạn hay hơn, hãy cân nhắc ủng hộ dự án:

[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/kdturtle)

hoặc bấm nút **💜 Sponsor** trên đầu repository (được bật qua [`.github/FUNDING.yml`](.github/FUNDING.yml) → `ko_fi: kdturtle`).

## License

Phát hành theo [GNU General Public License v3.0 (GPL-3.0)](LICENSE) — tự do sử dụng, sửa đổi và phân phối lại; mọi fork hoặc redistribution phải giữ mã nguồn mở theo cùng license. © 2026 kdturtle.
