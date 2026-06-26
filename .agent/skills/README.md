# ZeplaoPrint Skill System

Hệ skill đóng gói năng lực vận hành cho dự án ZeplaoPrint, theo mô hình 5 lớp:
Intent → Knowledge → Execution → Verification → Evolution

## Cấu trúc thư mục

```
.agent/
├── skills/
│   ├── knowledge/          # Tri thức ngành và sản phẩm
│   │   └── printing-industry-rules/
│   ├── verification/       # Kiểm chứng chất lượng
│   │   ├── verify-ai-suggestion/
│   │   └── verify-printing-constraints/
│   ├── automation/         # Tự động hóa quy trình
│   │   └── add-new-product/
│   ├── review/             # Phản biện và nâng chất lượng
│   │   └── review-ai-response/
│   └── runbooks/           # Quy trình vận hành
│       └── debug-ai-pipeline/
└── workflows/              # Workflows đã có
```

## Quy tắc sử dụng

1. **Một skill = một nhiệm vụ** — không nhồi nhiều việc
2. **Mỗi skill là folder** — chứa SKILL.md + examples + verification + changelog
3. **Luôn có verification** — skill không verify = chỉ là generator
4. **Cấu trúc > kiểm soát cứng** — đặt mục tiêu + context, để agent thích nghi
5. **Evolution bắt buộc** — mỗi lỗi = dữ liệu cập nhật skill
