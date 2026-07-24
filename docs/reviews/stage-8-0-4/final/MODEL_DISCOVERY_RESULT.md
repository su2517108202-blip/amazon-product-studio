# Model Discovery Result

## API Endpoint
`POST /api/provider-models/discover`

## Modes
- **Draft**: `{ provider, baseUrl, apiKey }` — calls adapter.listModels()
- **Saved**: `{ providerProfileId }` — server decrypts, calls adapter.listModels()

## Security
- Saved mode: AND userId check (`where: { id: profileId, userId: user.id }`)
- API Key never returned to browser, never logged

## Return Structure
```json
{
  "models": [{
    "modelId": "string",
    "capabilities": ["text", "vision", ...],
    "protocol": "string",
    "capabilityStatus": "inferred|unverified|...",
    "reason": "string"
  }]
}
```

## Capability Inference Rules
- Gemini: vision only for flash/pro/ultra/vision models (NOT embedding, aqa, text-)
- OpenAI: vision for gpt-4o/o3/o4/vision variants
- GPT-image: image capability, openai-images protocol
- DeepSeek: no vision, no image

## Testing
- Static tests: 25/25 ✅
- Real API test: NOT EXECUTED (database offline, no API key configured)
