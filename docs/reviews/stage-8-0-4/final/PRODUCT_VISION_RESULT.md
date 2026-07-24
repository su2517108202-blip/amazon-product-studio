# Product Vision Result

## Status: NOT TESTED

**PostgreSQL not available**: The database at localhost:55432 could not be started. PostgreSQL binaries not found (data directory exists but no pg_ctl.exe). Migration not applied.

## Expected Flow (documented, not executed)
1. Database start → migrate → save Gemini profile with API key
2. Click "获取模型列表" → GET /v1beta/models
3. Select vision model from returned list
4. Bind to product_vision role
5. Create project, upload JPG, set primary reference
6. Click "商品识别"
7. Image enters Gemini request as inlineData
8. Response parsed into ProductIdentity
9. Name suggestions displayed

## Expected Request
```
POST https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent
Content-Type: application/json
x-goog-api-key: [REDACTED]

{ "contents": [{ "role": "user", "parts": [
    { "text": "你是严谨的电商商品识图助手..." },
    { "inlineData": { "mimeType": "image/jpeg", "data": "[BASE64_REDACTED]" } }
]}] }
```

## Error Handling (implemented, not tested against real API)
11 error codes mapped from Gemini error.status:
INVALID_API_KEY, BILLING_REQUIRED, QUOTA_EXCEEDED, MODEL_NOT_FOUND,
MODEL_ACCESS_DENIED, RATE_LIMITED, IMAGE_INPUT_UNSUPPORTED,
INVALID_REQUEST, PROVIDER_TIMEOUT, PROVIDER_NETWORK_ERROR, UPSTREAM_ERROR

## Blockers
1. PostgreSQL not running (binaries missing)
2. No Gemini API key configured
3. Migration not applied
