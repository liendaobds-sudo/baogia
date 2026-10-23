# Bugfix Requirements Document

## Introduction

Audit UI/UX và tương tác của module CSKH (Inbox) trên đường chạy thật: layout 3 cột,
chat với khách, quản lý hội thoại, quản lý khách hàng, file/media. Mọi phát hiện được
trace theo `audit-rules.md` §1 (entry point → hook/service → sink → consumer) và gắn nhãn
`[VERIFIED]` (đã đọc code trên đường chạy, chứng minh được bằng file:dòng) hoặc
`[SUSPECTED]` (cần môi trường chạy thật để chốt).

Đường chạy đã trace (dùng chung cho toàn bộ finding dưới đây):

- Frontend: `inbox/page.tsx` → `_hooks/useInboxLogic.ts` (React Query + Socket.IO) →
  `_components/{ConversationList,ChatArea,MessageBubble,RightSidebar,MediaPanel,CustomerCard}.tsx`
- Backend: `conversations.controller.ts` → `conversations.service.ts`;
  `messages.controller.ts` → `messages.service.ts` / `message-processor.service.ts` →
  `outbound-attachment.helper.ts` → ZaloPool; `chat-media.controller.ts` (upload);
  `media.controller.ts` + `zalo-media-archiver.service.ts` (lưu trữ/phục vụ media);
  `pricing/controllers/customers.controller.ts` → `customers.service.lookupByPhone`.

Nhóm tác động nghiêm trọng nhất đã xác minh: **mất nội dung tin nhắn khi gửi lỗi**,
**chuyển tiếp ghi bubble vào hội thoại đang mở**, **không gửi được file thiết kế**,
**toàn bộ media đã lưu trữ không tải được**, **trần 50 hội thoại**, **tab Khách hàng
luôn trống**, **tra cứu SĐT có thể trả về khách khác**, **xoá hội thoại là xoá vĩnh viễn
với mọi nhân viên CSKH**.

Bốn finding cần môi trường chạy thật để chốt được đánh `[SUSPECTED]` và ghi rõ cần gì:
1.32 (build production), 1.31/1.30 (một request thật tới `/media/file`), 1.22 (dữ liệu tag
thật), 1.28 (dữ liệu SĐT trùng hậu tố thật).

## Bug Analysis

### Current Behavior (Defect)

Hành vi hiện tại, nhóm theo 5 vùng audit. Mỗi khoản ghi: điều kiện đầu vào/trạng thái làm
lỗi xuất hiện (bug condition), mức độ, nhãn xác minh, bằng chứng `file:dòng`.

**Vùng 1 — UI/UX chung, layout, trạng thái, accessibility**

1.1 WHEN query `conversations`/`messages` trả lỗi (mạng, 5xx, token hết hạn) THEN danh sách
hiển thị thông báo "Chưa có hội thoại phù hợp." giống hệt trường hợp thật sự rỗng, không
có nút thử lại. — 🟠 `[VERIFIED]`; `ConversationList.tsx:325-330` (chỉ nhánh `loading` và
`length === 0`), `useInboxLogic.ts:60-70` (không trả `isError`/`error` ra `state`).

1.2 WHEN người dùng mở menu ngữ cảnh của một hội thoại và chỉ dùng bàn phím THEN không di
chuyển/kích hoạt được mục nào và không đóng được bằng ESC, vì mục menu là `div` chỉ nghe
`onMouseDown` và menu không có `role="menu"`/`role="menuitem"`, không bắt `keydown`. — 🟠
`[VERIFIED]`; `ConversationList.tsx:70-95` (`MenuItem` dùng `onMouseDown`),
`ConversationList.tsx:474-575` (container menu không có role/keyboard).

1.3 WHEN tiêu điểm nằm ở nút "..." của một hàng hội thoại và người dùng bấm Enter/Space
THEN sự kiện `keydown` nổi bọt lên hàng cha (`role="button"`) làm hội thoại bị chọn cùng
lúc với việc mở menu. — 🟢 `[VERIFIED]`; `ConversationList.tsx:349` (`onKeyDown` của hàng
không kiểm `e.target`), `ConversationList.tsx:377-400` (nút con nằm trong hàng).

1.4 WHEN người dùng mở bảng emoji hoặc bảng sticker rồi bấm ra ngoài hoặc bấm ESC THEN
bảng vẫn mở (ESC chỉ được xử lý khi tiêu điểm đang ở trong ô soạn tin). — 🟢 `[VERIFIED]`;
`ChatArea.tsx:597-616` (không có listener click-outside/ESC cho picker),
`ChatArea.tsx:474-478` (ESC chỉ trong `onKeyDown` của textarea).

1.5 WHEN Lightbox ảnh mở THEN không có `role="dialog"`/`aria-modal`, tiêu điểm không bị
giữ trong lớp phủ và không được trả về phần tử đã kích hoạt sau khi đóng; người dùng bàn
phím/đọc màn hình vẫn tab được xuống nội dung phía dưới. — 🟠 `[VERIFIED]`;
`Lightbox.tsx:8-22` (toàn bộ component).

1.6 WHEN người dùng bấm nút "Chụp màn hình" trên thanh công cụ ô soạn tin THEN không có gì
xảy ra vì nút không được gắn handler. — 🟢 `[VERIFIED]`; `ChatArea.tsx:541-547`.

1.7 WHEN người dùng đưa tiêu điểm vào thanh kéo đổi độ rộng (`role="separator"`,
`tabIndex=0`) THEN trình đọc màn hình không biết giá trị/khoảng cho phép vì thiếu
`aria-valuenow`/`aria-valuemin`/`aria-valuemax`. — 🟢 `[VERIFIED]`;
`page.tsx:213-224` và `page.tsx:270-281`.

**Vùng 2 — Tương tác chat với khách**

1.8 WHEN `POST /conversations/{id}/send` trả về status ngoài 2xx (400 tệp không hợp lệ, 403
không xác định được tenant, 404 hội thoại, 5xx) THEN `sendMessage` trả `null` mà không ném
lỗi, `ChatArea` đã xoá sạch ô soạn trước đó nên **nội dung tin nhắn bị mất, không có toast
lỗi, không có bubble nào xuất hiện** — nhân viên tưởng đã gửi. — 🔴 `[VERIFIED]`;
`useInboxLogic.ts:349-378` (`if (res.ok) {...}` rồi `return null;`),
`ChatArea.tsx:216-243` (`catch` chỉ chạy khi có throw; đã `setReplyText('')` ở trước),
`auth-context.tsx:233-268` (`authFetch` KHÔNG ném lỗi với 4xx/5xx).

1.9 WHEN nhân viên chuyển tiếp một tin nhắn sang hội thoại khác (`convId ≠ selectedId`)
THEN bubble của tin vừa gửi được ghi vào cache tin nhắn của **hội thoại đang mở** thay vì
hội thoại đích, làm hiện một tin không tồn tại trong hội thoại đang xem. — 🔴 `[VERIFIED]`;
`useInboxLogic.ts:358-368` (`setQueryData(['messages', selectedId], ...)` dù tham số là
`convId`), `page.tsx:243-249` (`onForwardMessage` gọi `actions.sendMessage(tid, ...)`).

1.10 WHEN nhân viên chuyển tiếp một tin nhắn có ảnh/tệp THEN chỉ phần văn bản được gửi
(thường là placeholder `[Hình ảnh]`), ảnh/tệp bị bỏ. — 🟠 `[VERIFIED]`;
`page.tsx:243-248` (chỉ dựng `fwdText`), `ForwardModal` truyền `content` là `msg.content`.

1.11 WHEN một tin nhắn chuyển sang trạng thái `failed` (backend phát `message_status`
`failed` sau 3 lần thử) THEN UI chỉ hiện "❌ Thất bại" và không có bất kỳ hành động gửi lại
nào; nhân viên phải tự gõ lại. — 🟠 `[VERIFIED]`; `MessageBubble.tsx:196-205`,
`MessageActions.tsx:22-120` (không có mục gửi lại), `ChatArea.tsx:659-690` (context menu
không có "Gửi lại"), `message-processor.service.ts:714-722` (nguồn phát trạng thái).

1.12 WHEN nhân viên đính kèm tệp không phải ảnh raster (PDF, AI, CDR, ZIP — đúng nghiệp vụ
in ấn) qua nút kẹp giấy THEN upload bị từ chối và người dùng chỉ nhận toast chung "Gửi tin
nhắn thất bại", không biết lý do; tính năng gửi file thiết kế thực chất không hoạt động. —
🔴 `[VERIFIED]`; `ChatArea.tsx:548-553` (`accept="*/*"`),
`useInboxLogic.ts:321-338` (mọi tệp đều đẩy vào `/chat-media/upload-image`),
`chat-media.controller.ts:41-49` (allowlist chỉ ảnh),
`outbound-attachment.helper.ts:26-33` (`EXTENSIONS_BY_MIME` chỉ ảnh),
`ChatArea.tsx:236-238` (toast chung chung, mất thông điệp lỗi từ server).

1.13 WHEN nhân viên chọn tệp 15–50MB THEN client báo hợp lệ nhưng server chặn ở tầng
multer, kết quả là lỗi upload không giải thích được. — 🟠 `[VERIFIED]`;
`ChatArea.tsx:264` (`50 * 1024 * 1024`), `chat-media.controller.ts:13`
(`CHAT_UPLOAD_MAX_BYTES = 15MB`), `useInboxLogic.ts:337` (`'Upload file thất bại'`).

1.14 WHEN nhân viên đã thả cảm xúc lên một tin nhắn THEN mọi cập nhật `reactions` của tin
đó từ socket (`message_reacted`) không còn được hiển thị, vì state optimistic tồn tại vĩnh
viễn theo `msgId` và luôn được ưu tiên khi render; state này cũng không được xoá khi đổi
hội thoại. — 🟠 `[VERIFIED]`; `MessageBubble.tsx:167` và `MessageBubble.tsx:380-386`
(`hasOptimistic = msg.id in optimisticReactions` → dùng optimistic),
`ChatArea.tsx:143-180` (chỉ ghi, không xoá khoá khi thành công),
`useInboxLogic.ts:236-244` (socket ghi vào `msg.reactions` — bị che).

1.15 WHEN có tin nhắn mới đến trong lúc nhân viên đang cuộn lên đọc lịch sử THEN khung chat
tự cuộn về đáy, làm mất vị trí đang đọc. — 🟠 `[VERIFIED]`; `ChatArea.tsx:199-203`
(effect phụ thuộc `messages.length`, luôn `scrollToBottom`).

1.16 WHEN hội thoại có hơn 100 tin nhắn THEN nhân viên không có cách nào xem tin cũ hơn:
frontend luôn gọi `?limit=100` và không dùng con trỏ `before`, cũng không đọc `hasMore` mà
backend đã trả. — 🟠 `[VERIFIED]`; `useInboxLogic.ts:106`,
`messages.service.ts:72-88` (hỗ trợ `before` + `hasMore` nhưng không consumer nào dùng).

**Vùng 3 — Quản lý hội thoại**

1.17 WHEN đơn vị có hơn 50 hội thoại THEN nhân viên chỉ thấy được 50 hội thoại mới nhất:
frontend gọi cố định `page=1&limit=50`, backend chặn `limit` tối đa 50, không có cuộn vô
hạn/nút trang. Tab "Chưa đọc" và ô tìm kiếm chỉ lọc trong 50 bản ghi đã tải → hội thoại
chưa đọc cũ biến mất khỏi UI. — 🔴 `[VERIFIED]`; `useInboxLogic.ts:62`,
`conversations.service.ts:51` (`Math.min(query.limit || 20, 50)`),
`ConversationList.tsx:130-135` (lọc phía client trên mảng đã tải).

1.18 WHEN danh sách hội thoại render THEN dòng preview tin nhắn cuối không bao giờ hiện và
tìm kiếm theo nội dung tin nhắn cuối hoặc theo số điện thoại không bao giờ khớp, vì DTO
danh sách không trả `lastMessage`, `metadata`, `externalId`, cũng không trả `contact.phone`
— đúng những trường mà UI và hàm tìm kiếm đang đọc. — 🔴 `[VERIFIED]`;
`conversations.service.ts:76-90` (mapping DTO: không có `lastMessage`/`metadata`/`externalId`,
`contact` chỉ gồm `id/displayName/avatarUrl/externalUserId`),
`ConversationList.tsx:437-443` (`conv.lastMessage && ...`),
`_lib/conversationSearch.ts:44-58` (khớp trên `lastMessage`, `metadata.phone`, `externalId`),
`contact.entity.ts:53` (`phone` có trong bảng nhưng không được phơi ra).

1.19 WHEN nhân viên ghim một hội thoại rồi mở lại menu THEN nhãn vẫn là "Ghim hội thoại",
biểu tượng 📌 không xuất hiện, và bấm lại chỉ gửi `isPinned: true` một lần nữa nên **không
bao giờ bỏ ghim được**, trong khi backend vẫn sắp xếp `isPinned DESC` → hội thoại bị kẹt
trên đầu danh sách. — 🔴 `[VERIFIED]`; `conversations.service.ts:76-90` (DTO thiếu
`isPinned`), `ConversationList.tsx:487-495` (`onTogglePin(id, !!menuState.conv.isPinned)`),
`useInboxLogic.ts:604-614` (`isPinned: !currentPinned`),
`conversations.service.ts:57-59` (`orderBy('c.isPinned', 'DESC')`).

1.20 WHEN cập nhật trạng thái/mức ưu tiên/chuyển giao/thêm-gỡ cộng tác viên bị server từ
chối (ví dụ 400 "Không thể chuyển từ new sang won") THEN UI im lặng hoàn toàn: không toast,
không rollback, dữ liệu không đổi, thông điệp giải thích của backend bị nuốt — vì các action
này chỉ `await authFetch(...)` mà không kiểm `res.ok`. — 🟠 `[VERIFIED]`;
`useInboxLogic.ts:386-393` (status), `useInboxLogic.ts:397-404` (priority),
`useInboxLogic.ts:555-562` (assign), `useInboxLogic.ts:565-590` (`collabActions`),
`conversations.service.ts:135-142` (nơi sinh 400 kèm thông điệp tiếng Việt),
`auth-context.tsx:253-266` (`authFetch` trả Response, không throw).

1.21 WHEN bất kỳ nhân viên CSKH nào chọn "Xóa hội thoại" và xác nhận THEN hội thoại cùng
toàn bộ tin nhắn, gợi ý AI, ghi chú, follow-up, participant bị **xoá vĩnh viễn khỏi DB**
(hard delete, không soft-delete, không giới hạn role, không đường khôi phục). — 🔴
`[VERIFIED]`; `conversations.controller.ts:186-190` (chỉ `AuthGuard('jwt')` +
`CskhScopeGuard`, không `RolesGuard`), `conversations.service.ts:175-195`
(`manager.delete` các bảng con rồi `manager.remove(conv)`).

1.22 WHEN lọc theo thẻ phân loại có dấu gạch dưới (`báo_giá`, `chờ_file`, `chốt_đơn` — toàn
bộ thẻ CRM mặc định) THEN truy vấn dùng `LIKE '%"báo_giá"%'` mà `_` là ký tự đại diện một
ký tự của SQL, nên có thể khớp cả thẻ khác dạng `"báoXgiá"`. — 🟢 `[SUSPECTED]`;
`conversations.service.ts:68-72` (comment ghi rõ đã bỏ escaping `\_`),
`ConversationList.tsx:104-111` (danh sách thẻ mặc định đều có `_`).
Cần để chốt: dữ liệu thẻ thật của một tenant có cặp thẻ đụng nhau ở đúng vị trí `_`, hoặc
một truy vấn đối chứng trên Postgres đang phục vụ.

1.23 WHEN một hội thoại nhận cảnh báo SLA (`sla_warning`) rồi được nhân viên trả lời THEN
biểu tượng ⏳ vẫn dính trên hàng đó tới khi tải lại trang, vì tập `slaWarnings` chỉ được
thêm, không bao giờ bị xoá. — 🟢 `[VERIFIED]`; `useInboxLogic.ts:198-200`
(`setSlaWarnings(prev => new Set(prev).add(...))`), `ConversationList.tsx:424-425`.

**Vùng 4 — Quản lý khách hàng**

1.24 WHEN nhân viên mở tab "Khách hàng" trong bảng thông tin THEN tab **luôn trắng trơn**
với mọi hội thoại, vì số điện thoại được lấy từ `selectedConversation.metadata?.phone` hoặc
`externalId` — hai trường mà DTO danh sách hội thoại không trả — nên `phone = ''` và
`CustomerCard` return `null` ngay. — 🔴 `[VERIFIED]`; `RightSidebar.tsx:133-138`,
`conversations.service.ts:76-90` (DTO không có `metadata`/`externalId`/`contact.phone`),
`CustomerCard.tsx:31-38` (`if (!phone) return null`).

1.25 WHEN nhánh dự phòng `externalId.replace(/[^0-9]/g,'')` có giá trị (kênh Zalo cá nhân
lưu UID số) THEN UID Zalo bị dùng làm số điện thoại để tra cứu ERP, hiển thị "Chưa có hồ sơ
với SĐT <UID Zalo>" hoặc khớp sai hồ sơ. Hiện tại chưa phát tác do 1.24, nhưng sẽ phát tác
ngay khi DTO được bổ sung. — 🟠 `[VERIFIED]` (mã nguồn), consumer hiện tại: moot vì 1.24;
`RightSidebar.tsx:136`.

1.26 WHEN tra cứu khách hàng thất bại (mất mạng, 403 thiếu quyền `customer.view`, 5xx,
JSON lỗi) THEN UI hiển thị khung cam "🆕 Khách hàng mới — Chưa có hồ sơ với SĐT ..." tức là
**biến lỗi hệ thống thành một khẳng định sai về dữ liệu khách**. — 🟠 `[VERIFIED]`;
`CustomerCard.tsx:31-41` (`.catch(() => setData({ found: false }))`),
`CustomerCard.tsx:47-60` (nhánh render "Khách hàng mới").

1.27 WHEN access token hết hạn trong lúc mở tab Khách hàng THEN request tra cứu 401 và
không được refresh/retry vì component dùng `fetch` thô thay cho `authFetch`/`apiGet`; kết
quả rơi vào 1.26. — 🟢 `[VERIFIED]`; `CustomerCard.tsx:31-34`,
`auth-context.tsx:253-266` (đường refresh chỉ có trong `authFetch`).

1.28 WHEN tra cứu theo SĐT mà trong bảng `customers` tồn tại số khác có **cùng hậu tố**
(ví dụ `840912345678`, `+84 912345678` chưa chuẩn hoá, hoặc số nội bộ dài hơn) THEN truy
vấn `c.phone = $1 OR c.phone LIKE '%' || $1` với `LIMIT 1` có thể trả về **hồ sơ của khách
khác** cùng toàn bộ thống kê đơn hàng/tổng chi tiêu và 3 báo giá gần nhất, tức rò rỉ dữ
liệu khách sang hội thoại không liên quan; trường hợp nhiều hồ sơ trùng SĐT thì im lặng
chọn một. — 🔴 `[SUSPECTED]`; `customers.service.ts:157-183` (chuẩn hoá chỉ bỏ khoảng
trắng/`-`/`.` và `+84|84` ở đầu; `LIKE '%' || phone`; `LIMIT 1`).
Cần để chốt: một truy vấn đối chứng trên dữ liệu `customers` thật của tenant để xem có cặp
SĐT trùng hậu tố hay không (mã nguồn đã đủ chứng minh cơ chế, chưa đủ chứng minh có dữ liệu
đụng trong thực tế).

1.29 WHEN cùng một khách được nhắc tới trong hội thoại Zalo và trong ERP THEN không có liên
kết bền vững nào giữa `contacts` và `customers`: bảng `contacts` không có `customer_id`, mọi
tra cứu chỉ so chuỗi số điện thoại, nên đổi/sửa SĐT ở một bên là mất liên kết. — 🟠
`[VERIFIED]`; `contact.entity.ts:28-110` (không có cột liên kết customer),
`customers.service.ts:157-183` (đối sánh bằng chuỗi phone).

**Vùng 5 — File / media**

1.30 WHEN bubble tin nhắn render một attachment đã được lưu trữ nội bộ (`att.localUrl`)
THEN trình duyệt nạp `<img src>`/`<audio src>` tới `GET /media/file?path=...` **không kèm
header `Authorization`**, guard JWT của route từ chối request, ảnh hiện placeholder "Hình
ảnh đã hết hạn hoặc không thể tải" dù tệp vẫn còn trên đĩa. — 🔴 `[SUSPECTED]`;
`MessageBubble.tsx:219,265,302` (dựng URL cho `<img>`/`<audio>`),
`media.controller.ts:57-58` (`@UseGuards(AuthGuard('jwt'), CskhScopeGuard)`),
`jwt.strategy.ts:23` (`ExtractJwt.fromAuthHeaderAsBearerToken()` — chỉ lấy token từ header,
không nhận cookie/query).
Cần để chốt: một request thật từ trình duyệt đã đăng nhập tới `/media/file` để đọc status
code (suy luận từ mã nguồn là chắc chắn, nhưng chưa chạy).

1.31 WHEN `path` gửi lên `/media/file` là giá trị `localUrl` do archiver sinh ra THEN nó
luôn bắt đầu bằng `/` (ví dụ `/t1/2026/08/29/xxx.jpg`), bị `path.isAbsolute()` coi là đường
dẫn tuyệt đối và bị từ chối 404 — nghĩa là **đường phục vụ media lưu trữ hỏng độc lập với
lỗi 1.30**, và bộ test hiện có không phát hiện vì chỉ truyền path không có dấu `/` đầu. —
🔴 `[SUSPECTED]`; `zalo-media-archiver.service.ts:147`
(``attachment.localUrl = `/${relDir}/${safeFileName}` ``),
`media.controller.ts:74-78` (`if (path.isAbsolute(filePath)) throw NotFoundException`),
`media.tenant.spec.ts:26-62` (mọi ca test đều dùng `t1/2026/...` không có `/` đầu),
đã kiểm `node -e "path.isAbsolute('/t1/2026/08/29/a.jpg')"` → `true` trên cả win32 và posix.
Cần để chốt: một request thật với `path` lấy nguyên từ DB (mã nguồn + kiểm `path.isAbsolute`
đã chứng minh cơ chế).

1.32 WHEN chạy ở môi trường production THEN ảnh do nhân viên gửi không hiển thị lại trong
bubble: URL lưu trong attachment là `${API_BASE_URL}/uploads/chat/...` nhưng static
`/uploads` chỉ được mount khi `!isProduction`; khách vẫn nhận được ảnh (backend đọc tệp từ
đĩa để đẩy sang Zalo) nên lỗi chỉ hiện ở phía nhân viên. — 🟠 `[SUSPECTED]`;
`chat-media.controller.ts:68-76` (URL trả về), `main.ts:200-207`
(`if (!isProduction) app.useStaticAssets(...)`),
`outbound-attachment.helper.ts:160-215` (đường gửi ra Zalo đọc tệp từ đĩa, không qua HTTP).
Cần để chốt: build/chạy với `NODE_ENV=production` và mở một hội thoại có ảnh do agent gửi.

1.33 WHEN mở tab "Tài liệu" (MediaPanel) THEN ảnh/tệp được nạp từ `att.url` (CDN Zalo, hết
hạn theo thời gian) chứ không phải bản lưu trữ nội bộ `att.localUrl` như bubble đang dùng,
nên panel hiện ô trống/ảnh vỡ trong khi bubble vẫn có dữ liệu. — 🟠 `[VERIFIED]`;
`MediaPanel.tsx:64,66` (`onPreviewImage(att.url)`, `src={att.url}`),
`MediaPanel.tsx:123` (`window.open(att.url)`), đối chiếu `MessageBubble.tsx:219`.

1.34 WHEN MediaPanel liệt kê tệp THEN mọi tệp đều hiển thị dung lượng **"2.4 MB"** vì con
số bị hard-code. — 🟠 `[VERIFIED]`; `MediaPanel.tsx:117`.

1.35 WHEN bubble hiển thị một tệp đính kèm THEN luôn kèm dấu tick xanh "Đã có trên máy" kể
cả khi attachment chưa được lưu trữ (`localUrl` rỗng) hoặc đã `archiveFailed`. — 🟠
`[VERIFIED]`; `MessageBubble.tsx:270-279` (nhãn không phụ thuộc `att.localUrl`),
`zalo-media-archiver.service.ts:151-176` (nguồn `archiveFailed`).

1.36 WHEN một ảnh trong MediaPanel lỗi tải THEN thẻ `<img>` bị ẩn (`display:none`) để lại ô
xám vẫn bấm được, mở Lightbox với URL lỗi → lớp phủ đen trống. — 🟢 `[VERIFIED]`;
`MediaPanel.tsx:64,66`.

1.37 WHEN nhân viên gửi tệp đính kèm THEN tên tệp gốc do frontend gửi lên bị bỏ: backend
chỉ lưu `[{url, type}]`, nên UI sau đó phải suy tên từ URL đã băm (`1727...-a1b2c3.png`). —
🟢 `[VERIFIED]`; `useInboxLogic.ts:342-346` (frontend gửi `attachments[0].name`),
`messages.controller.ts:34-40` (chỉ đọc `attachments[0].url`/`type`),
`message-processor.service.ts:551-560` (`attachments: [{ url, type }]`),
`MessageBubble.tsx:262` (fallback `att.url?.split('/').pop()`).

### Expected Behavior (Correct)

**Vùng 1 — UI/UX chung, layout, trạng thái, accessibility**

2.1 WHEN query `conversations`/`messages` trả lỗi THEN hệ thống SHALL hiển thị trạng thái
lỗi riêng biệt (khác trạng thái rỗng) kèm hành động thử lại, và không được ngụ ý "không có
dữ liệu".

2.2 WHEN người dùng mở menu ngữ cảnh hội thoại bằng bàn phím THEN hệ thống SHALL cho di
chuyển giữa các mục bằng mũi tên, kích hoạt bằng Enter/Space, đóng bằng ESC, và cung cấp
`role="menu"`/`role="menuitem"` cho trình đọc màn hình.

2.3 WHEN tiêu điểm đang ở một điều khiển con trong hàng hội thoại và người dùng bấm
Enter/Space THEN hệ thống SHALL chỉ kích hoạt điều khiển đó, không đồng thời chọn hội thoại.

2.4 WHEN bảng emoji hoặc sticker đang mở và người dùng bấm ra ngoài hoặc bấm ESC THEN hệ
thống SHALL đóng bảng đó.

2.5 WHEN Lightbox ảnh mở THEN hệ thống SHALL đặt `role="dialog"` + `aria-modal="true"`, giữ
tiêu điểm trong lớp phủ, và trả tiêu điểm về phần tử đã mở nó khi đóng.

2.6 WHEN người dùng bấm "Chụp màn hình" THEN hệ thống SHALL thực hiện một hành vi xác định
(mở luồng chụp/dán ảnh) hoặc không hiển thị nút đó nữa.

2.7 WHEN thanh kéo đổi độ rộng nhận tiêu điểm THEN hệ thống SHALL cung cấp
`aria-valuenow`/`aria-valuemin`/`aria-valuemax` khớp giá trị và khoảng kẹp thật.

**Vùng 2 — Tương tác chat với khách**

2.8 WHEN `POST /conversations/{id}/send` trả status ngoài 2xx THEN hệ thống SHALL giữ lại
nội dung đang soạn (kèm ảnh đính kèm và ngữ cảnh trả lời), hiển thị thông báo lỗi có nội
dung từ server, và KHÔNG được để tin nhắn biến mất không dấu vết.

2.9 WHEN gửi tin vào hội thoại `convId` THEN hệ thống SHALL chỉ cập nhật cache tin nhắn của
đúng `convId`, không bao giờ ghi vào hội thoại đang mở khi hai giá trị khác nhau.

2.10 WHEN chuyển tiếp một tin nhắn có ảnh/tệp THEN hệ thống SHALL chuyển tiếp cả phần
ảnh/tệp, hoặc thông báo rõ giới hạn trước khi người dùng xác nhận.

2.11 WHEN một tin nhắn ở trạng thái `failed` THEN hệ thống SHALL cung cấp hành động "Gửi
lại" trên chính tin đó, dùng khoá idempotency để không gửi trùng cho khách.

2.12 WHEN nhân viên đính kèm tệp không phải ảnh THEN hệ thống SHALL hoặc hỗ trợ gửi tệp đó
qua đường riêng, hoặc chặn ngay tại bước chọn tệp với thông báo nêu rõ định dạng được phép;
mọi lỗi upload SHALL truyền đúng thông điệp của server ra toast.

2.13 WHEN nhân viên chọn tệp vượt giới hạn THEN hệ thống SHALL dùng cùng một ngưỡng ở client
và server và báo đúng ngưỡng đó.

2.14 WHEN nhận cập nhật `reactions` từ socket cho một tin nhắn THEN hệ thống SHALL hiển thị
dữ liệu server sau khi thao tác optimistic đã hoàn tất, và SHALL xoá state optimistic khi
thành công hoặc khi đổi hội thoại.

2.15 WHEN có tin nhắn mới trong lúc người dùng đang cuộn lên đọc lịch sử THEN hệ thống SHALL
giữ vị trí cuộn và hiển thị chỉ báo "có tin mới"; chỉ tự cuộn khi người dùng đang ở gần đáy
hoặc vừa đổi hội thoại.

2.16 WHEN hội thoại có nhiều hơn một trang tin nhắn THEN hệ thống SHALL cho tải thêm tin cũ
bằng con trỏ `before` và dùng `hasMore` để quyết định còn dữ liệu hay không.

**Vùng 3 — Quản lý hội thoại**

2.17 WHEN đơn vị có nhiều hơn một trang hội thoại THEN hệ thống SHALL cho phép tải tiếp
(cuộn vô hạn hoặc phân trang), và bộ lọc "Chưa đọc"/tìm kiếm SHALL phản ánh toàn bộ dữ liệu
phía server chứ không chỉ trang đã tải.

2.18 WHEN danh sách hội thoại render THEN hệ thống SHALL trả và hiển thị tin nhắn cuối cùng
cùng số điện thoại liên hệ, và tìm kiếm theo nội dung/SĐT SHALL khớp đúng.

2.19 WHEN nhân viên ghim/bỏ ghim một hội thoại THEN hệ thống SHALL phản ánh đúng trạng thái
`isPinned` hiện tại trên nhãn menu và biểu tượng, và SHALL bỏ ghim được.

2.20 WHEN thao tác trạng thái/ưu tiên/chuyển giao/cộng tác viên bị server từ chối THEN hệ
thống SHALL hoàn tác thay đổi lạc quan và hiển thị thông điệp lỗi do server trả về.

2.21 WHEN người dùng yêu cầu xoá hội thoại THEN hệ thống SHALL giới hạn hành động này theo
vai trò được phép và SHALL không phá huỷ dữ liệu không thể khôi phục (dùng soft delete hoặc
lưu bản sao/nhật ký), đồng thời nêu rõ trong hộp xác nhận rằng toàn bộ tin nhắn sẽ mất.

2.22 WHEN lọc theo thẻ có ký tự đại diện của SQL (`_`, `%`) THEN hệ thống SHALL khớp chính
xác tên thẻ.

2.23 WHEN một hội thoại đã được trả lời hoặc SLA được đặt lại THEN hệ thống SHALL xoá cảnh
báo SLA khỏi hàng đó mà không cần tải lại trang.

**Vùng 4 — Quản lý khách hàng**

2.24 WHEN nhân viên mở tab "Khách hàng" của một hội thoại có liên hệ THEN hệ thống SHALL
dùng số điện thoại thật của liên hệ (từ dữ liệu server) để tra cứu và hiển thị hồ sơ, hoặc
nêu rõ "liên hệ chưa có số điện thoại" khi thiếu.

2.25 WHEN không có số điện thoại THEN hệ thống SHALL KHÔNG dùng định danh ngoài (UID Zalo)
thay cho số điện thoại để tra cứu ERP.

2.26 WHEN tra cứu khách hàng thất bại vì lỗi mạng/quyền/hệ thống THEN hệ thống SHALL hiển
thị trạng thái lỗi kèm hành động thử lại, và SHALL KHÔNG khẳng định đây là khách hàng mới.

2.27 WHEN token hết hạn trong lúc tra cứu khách hàng THEN hệ thống SHALL đi qua đường
refresh chung (`authFetch`/`apiGet`) và thử lại một lần.

2.28 WHEN tra cứu theo SĐT THEN hệ thống SHALL chuẩn hoá số về một dạng chuẩn ở cả hai phía
và chỉ khớp chính xác dạng chuẩn đó; khi có nhiều hồ sơ trùng, SHALL báo trùng cho nhân viên
chọn thay vì im lặng lấy một bản ghi.

2.29 WHEN một liên hệ được xác định là một khách hàng ERP THEN hệ thống SHALL lưu liên kết
bền vững giữa liên hệ và khách hàng đó, không phụ thuộc vào việc so chuỗi SĐT mỗi lần.

**Vùng 5 — File / media**

2.30 WHEN bubble render media đã lưu trữ nội bộ THEN hệ thống SHALL nạp được tệp trong thẻ
`<img>`/`<audio>` với đúng cơ chế xác thực mà thẻ media hỗ trợ (URL có chữ ký ngắn hạn, hoặc
tải qua fetch có token rồi tạo blob URL), và vẫn cưỡng chế quyền + cô lập tenant ở backend.

2.31 WHEN `path` là giá trị `localUrl` do archiver sinh ra THEN `GET /media/file` SHALL
phục vụ đúng tệp (chuẩn hoá dấu `/` đầu thành đường dẫn tương đối) trong khi vẫn chặn
traversal và vẫn chặn đọc chéo tenant theo tiền tố `t<tenantId>/`.

2.32 WHEN chạy ở production THEN ảnh do nhân viên gửi SHALL hiển thị lại được trong bubble
qua một đường phục vụ có xác thực, không phụ thuộc static `/uploads` chỉ có ở dev.

2.33 WHEN MediaPanel liệt kê ảnh/tệp THEN hệ thống SHALL ưu tiên bản lưu trữ nội bộ
(`localUrl`) đúng như bubble, chỉ dùng URL CDN khi chưa có bản lưu trữ.

2.34 WHEN MediaPanel liệt kê tệp THEN hệ thống SHALL hiển thị dung lượng thật của tệp, hoặc
không hiển thị dung lượng khi không có dữ liệu.

2.35 WHEN bubble hiển thị tệp đính kèm THEN hệ thống SHALL chỉ báo "Đã có trên máy" khi tệp
thực sự đã được lưu trữ, và SHALL báo trạng thái khác khi chưa lưu/đã thất bại.

2.36 WHEN một ảnh trong MediaPanel lỗi tải THEN hệ thống SHALL hiển thị placeholder rõ ràng
và SHALL không mở Lightbox rỗng.

2.37 WHEN nhân viên gửi tệp đính kèm THEN hệ thống SHALL lưu và hiển thị lại tên tệp gốc.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN gửi tin nhắn thành công (2xx) THEN hệ thống SHALL CONTINUE TO xoá ô soạn, thêm
bubble một lần duy nhất (chống trùng theo `id` giữa response và socket `new_message`), và
cập nhật trạng thái `sending → sent/delivered/read` theo `message_status`.

3.2 WHEN có tin nhắn mới đến qua socket cho hội thoại đang mở THEN hệ thống SHALL CONTINUE
TO nối tin vào cuối danh sách, giữ `unreadCount = 0` cho hội thoại đang xem, và không tăng
badge (backend chỉ tăng khi phòng hội thoại không có người xem).

3.3 WHEN người dùng thao tác trong Bố_Cục_Hẹp (<1024px) THEN hệ thống SHALL CONTINUE TO
chuyển giữa Khung_Danh_Sách / Khung_Chat / Khung_Thông_Tin theo đúng máy trạng thái
`nextNarrowView` hiện có, kèm nút quay lại trong header.

3.4 WHEN người dùng kéo thanh phân cách trong Bố_Cục_Rộng hoặc điều chỉnh bằng mũi tên
THEN hệ thống SHALL CONTINUE TO kẹp độ rộng trong khoảng hiện tại (trái 200–500px, phải
280–600px) và lưu vào localStorage.

3.5 WHEN các action `markAsUnread`, `togglePinConversation`, `toggleTag`, `markAllRead` thất
bại THEN hệ thống SHALL CONTINUE TO hoàn tác optimistic bằng `runOptimistic` và hiển thị
toast lỗi như hiện nay.

3.6 WHEN render nội dung gợi ý AI THEN hệ thống SHALL CONTINUE TO escape HTML trước khi áp
`**đậm**` (`renderSafeBold`) và dùng `stripMarkdown` khi đưa text vào ô soạn.

3.7 WHEN một user của tenant khác biết UUID hội thoại/tin nhắn/liên hệ THEN hệ thống SHALL
CONTINUE TO trả 404 (`assertConversationInTenant`, `applyTenantFilter`, `inTenant`) và
SHALL CONTINUE TO chặn đọc media chéo tenant theo tiền tố `t<tenantId>/`
(`assertTenantOwnsPath`).

3.8 WHEN `path` gửi tới `/media/file` chứa `..` hoặc thoát ra ngoài gốc lưu trữ THEN hệ
thống SHALL CONTINUE TO trả 404 và ghi log cảnh báo.

3.9 WHEN nhân viên upload ảnh THEN hệ thống SHALL CONTINUE TO áp allowlist ảnh raster (loại
SVG có chủ đích), giới hạn dung lượng ngay tại tầng multer, và xác minh MIME thật bằng magic
bytes trước khi gửi ra provider.

3.10 WHEN gửi ra Zalo gặp timeout THEN hệ thống SHALL CONTINUE TO dừng retry và đánh dấu
`failed` để tránh gửi trùng cho khách.

3.11 WHEN chuyển trạng thái hội thoại không hợp lệ THEN backend SHALL CONTINUE TO từ chối
bằng 400 kèm danh sách trạng thái cho phép (chỉ phần hiển thị lỗi ở frontend được sửa).

3.12 WHEN dùng mini báo giá trong Inbox THEN hệ thống SHALL CONTINUE TO lấy VAT từ đúng ô
VAT của mini (mặc định từ company-info) và không lấy VAT từ `pricing_config`; không finding
nào trong tài liệu này được phép thay đổi số liệu giá/VAT.

3.13 WHEN archiver tải media Zalo THEN hệ thống SHALL CONTINUE TO phân vùng theo
`t<tenantId>/YYYY/MM/DD/`, đánh dấu `archiveFailed` cho các mã HTTP vĩnh viễn và không thử
lại vô hạn.
