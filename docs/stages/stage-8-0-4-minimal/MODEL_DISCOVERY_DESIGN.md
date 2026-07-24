# Model Discovery Design

## Architecture

```
User saves ProviderProfile (API Key + Base URL)
  → Clicks "获取模型列表"
  → POST /api/provider-models/discover { providerProfileId }
  → Server decrypts API Key, calls adapter.listModels()
  → Provider's official API (e.g. GET /v1beta/models)
  → Returns [{modelId, capabilities, protocol}, ...]
  → Displayed in settings page (in-memory, not persisted)
```

## Dual-Mode Discovery Endpoint

`POST /api/provider-models/discover`

### Mode A: Saved Profile
```json
{ "providerProfileId": "cuid..." }
```
Server reads encrypted API key from database, decrypts, calls adapter.

### Mode B: Draft Form
```json
{ "provider": "gemini", "baseUrl": "...", "apiKey": "..." }
```
Uses un-saved form data. API key never returned to browser, never logged.

## Official Model Endpoints

| Provider | Endpoint |
|----------|----------|
| OpenAI | `GET {baseUrl}/models` (typically `/v1/models`) |
| Gemini | `GET {baseUrl}/models` (typically `/v1beta/models`) |
| DeepSeek | `GET {baseUrl}/models` |
| OpenAI Compatible | `GET {baseUrl}/models` |

## Capability Inference

Per model, `inferModelCapabilities(provider, modelId)` assigns:
- `text` — always present unless pure-image model
- `reasoning` — for reasoning-capable models
- `vision` — for models supporting image input
- `image` — for image generation models
- `asyncImage` — for async image generation

## Protocol Inference

Per model, `inferProviderProtocol(provider, modelId, capabilities)` assigns:
- Gemini + image → `gemini-native-image`
- OpenAI + gpt-image → `openai-images`
- OpenAI + image → `openai-image-edit`
- Doubao → `doubao-image`

## Role Binding with Model Override

```
ModelRoleAssignment {
  providerProfileId  — which account (API key)
  modelId            — which model (overrides profile.modelId)
  isUserForced       — user manually chose this
}
```

Runtime chain:
```
analyze/route.js:
  effectiveModelId = assignment.modelId || profile.modelId
  buildProviderConfig(profile, { modelId: effectiveModelId })
```
