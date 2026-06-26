# SKILL: debug-ai-pipeline

## Purpose
Diagnostic và fix lỗi trong pipeline AI suggestion — từ message ingestion đến AI response generation. Skill này dùng khi AI trả lời sai, không trả lời, hoặc bị lỗi.

## Use When
- AI suggestion không xuất hiện (timeout, error)
- AI trả lời sai nội dung/giá/sản phẩm
- AI bị hallucinate (bịa giá, bịa tính năng)
- Performance chậm (>10s)
- AI provider bị lỗi (429, 500)

## Diagnostic Flowchart

```
Lỗi AI suggestion
├── Không xuất hiện
│   ├── WebSocket disconnected? → Check EventsGateway logs
│   ├── Message not processed? → Check MessageProcessorService
│   ├── AI call failed? → Check AiProviderService logs
│   └── Timeout? → Check latency, model response time
│
├── Nội dung sai
│   ├── Sản phẩm detect sai? → Check product templates matching
│   ├── Giá sai? → Check QuoteService + ERP connection
│   ├── Rules không apply? → Check checkPrintingConstraints()
│   └── Hallucinate? → Check KB results, prompt content
│
└── Performance chậm
    ├── Model chậm? → Check provider latency
    ├── KB search chậm? → Check embedding index
    └── ERP chậm? → Check QuoteService ERP connection
```

## Execution — Debug Steps

### Step 1: Check backend logs
```bash
# Terminal đang chạy npm run start:dev — tìm conversation
# Look for these log patterns:
#   📩 Processing message for conversation: [id]
#   🏭 Matched template: [product]
#   📏 Injecting X/Y constraint rules
#   📏 Prompt length: SYSTEM=X chars, USER=Y chars
#   ✅ AI call succeeded with [provider] ([model])
#   💡 Suggestion generated for [id] (Xms)
#   🚨 Constraint violations detected: [warnings]
```

### Step 2: Check AI provider status
```
Log patterns to look for:
  ⚠️ Gemini API 429  → quota exceeded, circuit breaker opens
  🔴 Circuit OPENED   → provider disabled temporarily
  🟢 Circuit CLOSED   → provider recovered
  ✅ AI call succeeded with groq → fallback working
```

### Step 3: Check prompt content
- Prompt too long? → `⚠️ Prompt too long (X chars > 16000), truncating...`
- Fix: Reduce KB results, reduce constraint rules, simplify product fields
- Xem prompt: Add temporary `this.logger.debug()` in `buildFinalPrompt()`

### Step 4: Check ERP connection
```
Log patterns:
  🔗 ERP connection: ✅ Online    → ERP working
  🔗 ERP connection: ❌ Offline   → ERP down, no pricing
  📦 Loaded ERP master data       → materials, sizes loaded
  💰 Price calculation result     → pricing working
```

### Step 5: Reproduce in Test Chat
- Mở http://localhost:3000/test-chat
- Reset conversation
- Gửi tin nhắn giống khách
- Quan sát AI suggestion panel

## Common Issues & Fixes

| Triệu chứng       | Nguyên nhân           | Fix                                    |
| ----------------- | --------------------- | -------------------------------------- |
| No suggestion     | WebSocket disconnect  | Refresh frontend                       |
| 429 error         | Gemini quota exceeded | Wait or switch to Groq                 |
| Giá = 0           | ERP offline           | Check ERP URL in .env                  |
| Sản phẩm sai      | Keywords overlap      | Adjust product templates               |
| Warning duplicate | GSM from both msgs    | Use lastMsg only                       |
| Prompt truncated  | >16000 chars          | Reduce context injection               |
| Slow (>10s)       | Model timeout         | Check internet, try different provider |

## Key Files
| File                           | Purpose                                |
| ------------------------------ | -------------------------------------- |
| `ai-suggest.service.ts`        | Main pipeline orchestrator             |
| `prompt-builder.service.ts`    | System/user prompt construction        |
| `context-inference.service.ts` | Knowledge injection + constraint rules |
| `ai-provider.service.ts`       | Multi-provider with circuit breaker    |
| `message-processor.service.ts` | Message ingestion + trigger            |
| `events.gateway.ts`            | WebSocket communication                |

## Changelog
- v1.0 (2026-03-19): Initial runbook with diagnostic flowchart
