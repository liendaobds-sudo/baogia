# Đánh giá AI/RAG

## Test không gọi dịch vụ ngoài

Ưu tiên Jest cho:

- printing-constraints.spec.ts;
- validate-ai-result.spec.ts;
- context-inference.service.spec.ts;
- prompt-builder.service.spec.ts;
- ai-provider.service.spec.ts với provider mock;
- hybrid-search/knowledge-base tenant tests;
- agent-pipeline và learning isolation.

## Eval có side effect

backend/package.json có:

~~~powershell
npm run eval:rag
npm run eval:chat
~~~

Hai runner có thể boot AppModule, đọc/ghi DB, dùng embedding/LLM provider và phát sinh chi phí/egress. Chỉ chạy khi:

- user cho phép;
- dùng DB test/throwaway hoặc dữ liệu đã được phép;
- secret/provider được cấu hình an toàn;
- biết rõ runner nào gọi mạng và lưu kết quả ở đâu.

Không boot toàn AppModule chỉ để unit-test helper: bootstrap có thể seed/reconcile dữ liệu, khởi động cron, queue, KB và Zalo integration.

## Rubric

Đánh giá riêng:

- intent/product đúng;
- groundedness với KB/quote result;
- không bịa giá/chính sách;
- constraint hard/warning đúng, không false positive;
- đủ missing fields nhưng không hỏi thừa;
- giọng tiếng Việt tự nhiên;
- tenant/context isolation;
- latency và provider fallback.

Ghi dataset/version/config và phân biệt deterministic assertion với đánh giá chủ quan. Không đổi golden dataset chỉ vì model mới không đạt.

