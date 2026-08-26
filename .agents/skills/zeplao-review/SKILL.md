---
name: zeplao-review
description: "Review và audit ZeplaoPrint dựa trên bằng chứng: code review diff, audit dọc, security review, performance investigation và production-readiness. Dùng khi user yêu cầu review/audit/rà soát/săn bug ẩn/tối ưu/bảo mật. Chỉ chẩn đoán nếu user chưa yêu cầu sửa."
---

# Review ZeplaoPrint

Chọn một chế độ, giữ đúng phạm vi và quyền:

- Diff review: tìm regression trong thay đổi hiện tại.
- Audit dọc: trace một hành động người dùng từ entry đến DB/provider và consumer.
- Security: trace input không tin cậy đến tài sản/sink và guard thực tế.
- Performance: đo latency/query/hot path trước và sau.
- Production readiness: kiểm từng cổng build, config, data safety và smoke.

Đọc references/audit.md cho audit dọc hoặc chiến dịch lớn. Đọc references/security.md cho bảo mật. Đọc references/performance.md cho điều tra hiệu năng. Với pricing, tenant hoặc AI, nạp thêm skill chuyên domain tương ứng.

## Chuẩn finding

Mỗi finding phải có:

- trạng thái VERIFIED, SUSPECTED, EXPECTED hoặc DISPROVED;
- entry → handler → sink và consumer live;
- file:dòng, điều kiện tái hiện hoặc output lệnh;
- tác động, phạm vi tenant/dữ liệu/tiền và confidence;
- đề xuất nhỏ nhất cùng cách kiểm chứng.

Chỉ gán mức:

- P0: mất dữ liệu diện rộng, rò secret nghiêm trọng hoặc dịch vụ không thể vận hành.
- P1: sai tiền, rò tenant, auth bypass, crash đường chính.
- P2: correctness có phạm vi, hiệu năng có số đo hoặc rủi ro vận hành đáng kể.
- P3: maintainability/UX nhỏ, không gắn nhãn vulnerability.

Code smell, dependency cũ hay catch rộng không tự động là finding. Phải chứng minh reachability, dữ liệu attacker/user kiểm soát và guard hiện hữu.

## Ranh giới hành động

- Yêu cầu review/audit không tự cho phép sửa, deploy, migration, gửi issue hoặc gọi dịch vụ ngoài.
- Nếu user đã yêu cầu audit và sửa, chỉ sửa finding đã xác nhận trong phạm vi; không ép xin duyệt lại cho thay đổi nhỏ, an toàn.
- Dừng xin hướng khi cần thay business rule giá, flip RLS, xóa dữ liệu, thay auth model hoặc chọn một kiến trúc có trade-off lớn.
- Giữ nguyên thay đổi có sẵn của user; untracked không đồng nghĩa rác.

Kết luận bằng độ phủ đã đạt và proof gap còn lại, không nói toàn dự án không còn bug.
