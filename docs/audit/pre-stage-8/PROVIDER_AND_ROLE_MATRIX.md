# Provider And Role Matrix

## Roles

| Role | Purpose | Required Capability | Current Behavior |
| --- | --- | --- | --- |
| `product_vision` | multi-image product recognition | `vision` | Uses selected reference images and saves `ProductIdentity` plus `ProductAnalysisRun`. |
| `image_planning` | five-image ecommerce planning | `text` | Generates or reuses exactly 5 `ImagePlan` rows. |
| `image_generation` | single image generation | `image` or `asyncImage` | Requires a reference-image-capable protocol before generating. |

## Providers

| Provider | Product Vision | Image Planning | Image Generation | Reference Images Actually Used | Key Transport | Sync/Async | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | yes via chat/compatible payload | yes via chat/compatible payload | yes via `openai-images` or `openai-image-edit`; generic async allowed by protocol | image edit path supports references; plain images protocol is treated as capable by protocol gate | `Authorization: Bearer` header | sync or generic async | Review OpenAI image protocol before production to avoid UI showing support for models that cannot edit with references. |
| Gemini | yes | yes | yes via `gemini-native-image` | yes for native Gemini image generation | `x-goog-api-key` header | sync | Stage 6.1 removed key-in-URL usage. Real audit triggered one vision call and one planning reuse. |
| DeepSeek | inherits OpenAI-compatible text/vision planning methods | yes for text-compatible use | adapter points to OpenAI-compatible image methods | depends on configured compatible endpoint | `Authorization: Bearer` header | sync/generic async by protocol | Needs provider-specific image support verification before offering as image generation. |
| Doubao / Volcengine Ark | OpenAI-compatible analysis path | OpenAI-compatible planning path | `doubao-image` through OpenAI image code path | protocol gate requires `doubao-image` | `Authorization: Bearer` header | sync | Needs real Doubao reference-image protocol validation. |
| OpenAI Compatible | OpenAI-compatible analysis/planning/image methods | yes | `openai-images`, `openai-image-edit`, or `generic-async-image` | depends on endpoint contract | `Authorization: Bearer` header | sync/generic async | Generic async remains a convention protocol and must be configured carefully. |

## Findings

- Gemini no longer sends API keys in query strings.
- Provider profile responses expose masked keys only.
- `externalTaskId`, `promptSnapshot`, encrypted key fields, and Authorization headers were not observed in front-end candidate/download responses.
- Generic async protocol is still convention-based; it should stay marked as advanced/risky until each target endpoint is validated.
