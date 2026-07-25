# Model Discovery Result

## Endpoint
`POST /api/provider-models/discover`

## Verified Result
- Provider: Gemini.
- Official model list request completed with HTTP 200.
- Returned model count: 50.
- API key was not returned, logged, or written to the response.
- Legacy response compatibility is preserved: `models` remains a string array.
- Enhanced model information is returned in `modelDetails`.

## modelDetails Metadata
For official Gemini results, `modelDetails.metadata` now passes through:
- `displayName`
- `description`
- `supportedGenerationMethods`

## Capability Handling
- Model discovery does not treat unclear Gemini capability metadata as verified.
- When the official list does not explicitly describe vision or image capability, the model remains `unverified`.
- The UI may still let a user force-select an unverified model, but the API does not describe that as verified support.

## Account-Specific Model Finding
- `models/gemini-2.5-flash` was present in the official model list.
- In this account, a real product-vision call to `models/gemini-2.5-flash` returned `MODEL_NOT_FOUND` / HTTP 404 with the provider message that this model is no longer available to new users.
- This is recorded only as the result for the current account and key. It is not a claim that `gemini-2.5-flash` is globally unavailable for all accounts.

## Final Working Model
- Actual successful product-vision model: `gemini-flash-latest`.
