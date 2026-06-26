# Requirements Document

## Introduction

Backend ZeplaoPrint đang ở **NestJS 10.4** nhưng `@nestjs/swagger` lại là **^11** → xung đột peer khiến `npm install`/`npm ci` phải dùng `--legacy-peer-deps`, và bị **32 lỗ hổng prod (12 HIGH)** qua `npm audit --omit=dev` (chủ yếu `ws`/`socket.io`). Việc vá lẻ đã được thử và làm vulns TĂNG (downgrade kéo dep cũ) → kết luận: cần **nâng đồng bộ cả hệ NestJS 10→11** (kèm swagger@11, socket.io/ws mới hơn) như một đợt hiện đại-hoá có kiểm thử, KHÔNG vá vụn.

Mục tiêu: gỡ xung đột peer (cài sạch không cần `--legacy-peer-deps`), giảm lỗ hổng HIGH/critical, GIỮ NGUYÊN hành vi + toàn bộ test (722) + frontend build xanh, không đổi schema DB, không lệch giá.

## Glossary

- **Hệ NestJS**: nhóm gói `@nestjs/*` (common, core, platform-express, websockets, platform-socket.io, jwt, passport, typeorm, schedule, swagger, throttler, bullmq, event-emitter...).
- **Peer conflict**: ràng buộc peerDependency không khớp (vd swagger@11 cần common@11 nhưng có common@10).
- **Parity hành vi**: cùng input → cùng output (giá/báo giá/chat) trước và sau nâng cấp.
- **Cài sạch**: `npm ci` thành công KHÔNG cần `--legacy-peer-deps`.

## Requirements

### Requirement 1: Nâng đồng bộ hệ NestJS lên v11
**User Story:** Là người bảo trì, tôi muốn toàn bộ `@nestjs/*` cùng major v11 nhất quán, để hết xung đột peer và cài đặt tái lập được.

#### Acceptance Criteria
1. WHEN nâng cấp THEN mọi gói `@nestjs/*` SHALL ở dải tương thích v11 (core/common/platform/websockets/jwt/passport/typeorm/schedule/throttler/swagger/bullmq/event-emitter).
2. WHEN chạy `npm ci` (KHÔNG `--legacy-peer-deps`) THEN cài đặt SHALL thành công, không peer conflict.
3. WHERE một gói phụ thuộc (vd `socket.io`, `ws`, `sqlite3`, `multer`) cần bump để tương thích v11, THE việc bump SHALL theo bản ổn định mới nhất tương thích.
4. IF một API NestJS v11 có breaking change ảnh hưởng code hiện tại THEN code SHALL được cập nhật theo hướng dẫn migration chính thức.

### Requirement 2: Giảm lỗ hổng bảo mật
**User Story:** Là chủ hệ thống cho thuê, tôi muốn giảm tối đa lỗ hổng HIGH/critical trên đường production, để an toàn khi mở ra mạng.

#### Acceptance Criteria
1. WHEN chạy `npm audit --omit=dev` sau nâng cấp THEN SHALL KHÔNG còn lỗ hổng **critical**, và số **HIGH** SHALL giảm so với baseline (12).
2. WHERE còn lỗ hổng không thể vá (do thượng nguồn chưa phát hành) THE phải ghi nhận rõ ràng kèm lý do + đường giảm thiểu.
3. THE lockfile mới SHALL được commit (reproducibility).

### Requirement 3: Không hồi quy hành vi & test xanh
**User Story:** Là người bảo trì, tôi muốn nâng cấp mà không vỡ tính năng nào, để yên tâm phát hành.

#### Acceptance Criteria
1. WHEN chạy test backend THEN toàn bộ **722 test** SHALL pass.
2. WHEN chạy `npx tsc --noEmit` THEN SHALL exit 0.
3. WHEN chạy `npm run build` frontend THEN SHALL thành công.
4. THE engine giá / payload builder SHALL KHÔNG đổi → cùng input cho cùng `grand_total` (zero-tolerance).
5. THE schema DB SHALL KHÔNG đổi (`synchronize:false` giữ nguyên).
6. WHEN khởi động app sau nâng cấp THEN socket.io, BullMQ, cron, zca-js, Swagger (dev) SHALL hoạt động như trước.
