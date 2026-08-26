# Schema, patch và RLS runbook

## Nguồn và đường triển khai

- Entity: backend/src/entities và backend/src/modules/pricing/entities.
- Snapshot tái lập: backend/db/schema.postgres.sql.
- Bootstrap DB rỗng: backend/db/bootstrap-schema.js.
- Patch ledger: backend/db/apply-patches.js.
- Hướng dẫn hiện hành: backend/db/README.md.
- Flip/rollback RLS: backend/db/TENANT-RLS-RUNBOOK.md và .kiro/specs/tenant-data-isolation.

Snapshot không tự chứa mọi patch mới. Với môi trường mới: extensions → bootstrap snapshot → dry-run/apply patch → seed được chọn → RLS phase riêng nếu cần.

## Không tự chạy trên DB thật

Các lệnh sau có side effect hoặc có thể phá dữ liệu; cần môi trường đích, backup, maintenance window và quyền rõ:

- bootstrap-schema;
- apply-patches không có --dry-run;
- --mark-only;
- seed/backfill;
- dump schema ghi đè file;
- tạo role, Phase A/B RLS;
- index concurrent;
- ALTER/SET NOT NULL hoặc rollback policy.

Không boot AppModule như công cụ migration: boot có thể seed/reconcile, khởi động cron/queue/channel và làm thay đổi DB.

## Patch mới

1. Viết SQL PostgreSQL idempotent, tên YYYY-MM-DD_mo-ta.sql.
2. Cập nhật entity và schema assumptions cùng thay đổi.
3. Xác định patch có được apply-patches quản lý hay phải chạy riêng.
4. Baseline/backfill phải có thống kê trước/sau và rollback.
5. Index concurrent chạy ngoài transaction trong maintenance window; kiểm EXPLAIN trên staging.
6. Test DB rỗng + DB đã có patch; test rerun idempotent.

RLS Phase A/B, role và baseline table bị loại khỏi auto-patch có chủ đích. Không đưa lại vào batch chung để tiện.

## Flip RLS

Chỉ thực hiện theo runbook mới nhất và code hiện tại:

1. Dừng write traffic và backup.
2. Backfill residual sau khi app dừng.
3. Xác minh mọi read/write/background sink đã wire.
4. Tạo/đổi app role NOSUPERUSER.
5. Áp policy đúng mẫu common hoặc baseline-special.
6. Bật TENANT_RLS_ENABLED và để preflight xác minh.
7. Chạy isolation e2e, pricing parity, super-admin, denial audit và smoke.
8. Nếu sai sau mở traffic, dùng rollback đã diễn tập; không vá trực tiếp trong trạng thái nửa bật.

