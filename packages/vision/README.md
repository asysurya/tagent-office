# @tagent-office/vision

Vision service — **STUB, Phase 6** (PRD 2.16). The API surface is frozen so Manager/QA wiring stays stable:

- `analyze({ images, prompt, task, options, budget })` → `{ analysis, confidence, model, tokensUsed, cost, fallbackUsed }`
- Tasks: `ui-review`, `bug-detect`, `mockup-extract`, `diagram-parse`, `checkTypography`, `checkContrast`, `checkResponsive`, `checkA11y`, `checkDesign`
- Provider-format adapters (OpenAI `image_url`, Anthropic base64, Google `inline_data`), caching (sha256 image+prompt, 24h TTL), and per-iteration budgets arrive with the implementation.

`createVisionService()` currently refuses every call with `VisionNotImplementedError`.
