# Điều tra hiệu năng ZeplaoPrint

## Bằng chứng trước tối ưu

Chọn đúng đại lượng người dùng thấy và ghi baseline:

- latency P50/P95/P99 và tỉ lệ lỗi;
- query count, rows scanned và connection-pool wait;
- CPU/RAM/event-loop lag;
- queue wait/processing/retry;
- provider/embedding/rerank latency;
- frontend request count, render và stale-response behavior.

Dùng EXPLAIN (ANALYZE, BUFFERS) trên staging hoặc bản sao có dữ liệu tương đương, không trên production nếu chưa được phép. Một microbenchmark pure function không chứng minh endpoint nhanh hơn.

## Bất biến không được đánh đổi

- Không đổi giá, VAT, số con/tờ hoặc rounding để lấy tốc độ.
- Không bỏ tenant predicate/RLS/permission.
- Không retry gửi tin/webhook mù khi kết quả timeout chưa biết.
- Không cache object tổ chức bằng key toàn cục.
- Không giảm context/eval AI mà không đo chất lượng cùng latency.

## Các hướng cần đo

- KnowledgeBaseService có đường tải và score nhiều chunk trong JS, embedding/rerank và rechunk; tách thời gian từng tầng trước khi thêm index/cache.
- Search dùng pattern text và một số list có thể thiếu pagination; lấy query plan và cardinality thật.
- Rà N+1 ở role permissions, quote CRUD và master-data; chứng minh bằng query count.
- Pool/timeout PostgreSQL đã cấu hình trong backend/src/app.module.ts; phân biệt pool exhaustion với query chậm.
- Redis/BullMQ/Socket.IO có fallback và retry riêng; đo reconnect/backlog, không chỉ thời gian handler.
- Frontend pricing có request sequence guard; debounce/cache không được để response cũ ghi state.

## Cache và index

Cache phải có tenant key, size/TTL, invalidation và test A/B. Đo hit rate và dữ liệu stale.

Index mới phải:

1. có query plan chứng minh lợi ích;
2. khớp predicate/order thực;
3. được biểu diễn trong entity khi phù hợp và SQL idempotent;
4. áp concurrent ngoài transaction trong maintenance window theo backend/db/README.md;
5. có kế hoạch rollback và đo write overhead.

Kết quả bàn giao gồm baseline, thay đổi, số đo sau, confidence, test correctness và phần môi trường chưa tương đương production.

