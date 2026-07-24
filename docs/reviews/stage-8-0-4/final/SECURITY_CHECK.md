# Security Check

## Secrets in Repository
- ✅ No .env file committed
- ✅ No API Key in code or comments
- ✅ No Authorization header in code
- ✅ No database password in code
- ✅ No base64 image data in tests
- ✅ No real product images committed
- ✅ `stage-8-final-release.bundle` in .gitignore?

## Secret Handling in Code
- API Key: encrypted at rest (AES-GCM), decrypted only at runtime via `decryptSecret()`
- API Key never returned to browser
- API Key not written to console.log
- Diagnostic errors: only sanitized `safeSummary` (httpStatus, errorStatus, errorMessage)
- No raw response bodies in error chains
- No image base64 in logs

## Cross-User Protection
- discover endpoint: `where: { id: profileId, userId: user.id }`
- All profile operations gated by `requireCurrentUser()`
- Role assignments bound to `userId`
