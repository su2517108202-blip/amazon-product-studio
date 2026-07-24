# Product Vision Acceptance Report

## Status: NOT TESTED (database offline)

The PostgreSQL database at `localhost:55432` was not accessible during development.
Migration `202607250001` has not been applied. No real Gemini API call was made.

## Expected Acceptance Flow

1. Start PostgreSQL: `localhost:55432`
2. Run: `npx prisma generate && npx prisma migrate deploy`
3. Open settings page, save Gemini account with real API key
4. Click "获取模型列表" → should return models from `GET /v1beta/models`
5. Select a vision-capable model (e.g. `models/gemini-2.5-flash`)
6. Bind to "商品识图" role
7. Create project, upload a JPG, set primary reference
8. Click "商品识别"

## Expected Request

```
POST https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent
Header: x-goog-api-key: {REDACTED}
Content-Type: application/json
Body: {
  contents: [{
    role: "user",
    parts: [
      { text: "你是严谨的电商商品识图助手..." },
      { text: "参考图顺序和角色：..." },
      { inlineData: { mimeType: "image/jpeg", data: "{BASE64}" } }
    ]
  }],
  generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
}
```

## Expected Error Handling

| Gemini Error | Client Code | User Message |
|-------------|-------------|--------------|
| `INVALID_ARGUMENT` | `INVALID_REQUEST` | 请求格式不正确 |
| `PERMISSION_DENIED` | `INVALID_API_KEY` | API Key 无效或无权限 |
| `NOT_FOUND` | `MODEL_NOT_FOUND` | 模型不存在或已被移除 |
| `RESOURCE_EXHAUSTED` | `RATE_LIMITED` | 请求过于频繁 |
| `DEADLINE_EXCEEDED` | `PROVIDER_TIMEOUT` | 上游服务超时 |

## Blockers

- Database not running → cannot apply migration, cannot save profiles
- No real API key for Gemini test
- Cannot verify end-to-end product analysis
