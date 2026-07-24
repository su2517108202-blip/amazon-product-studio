# Remaining Issues — Checkpoint 0.1

1. **Database still offline**: `localhost:55432` not running. Migration 202607250001 NOT applied.
2. **No real API testing**: No Gemini/OpenAI API keys configured. Cannot verify model discovery or product analysis E2E.
3. **OpenAI error classification**: Still uses generic `classifyHttpError`. Needs body parsing like Gemini's `classifyGeminiError`.
4. **GPT Image reference image conflict**: `gpt-image → openai-images` protocol cannot send reference images. Documented but not resolved.
5. **Discovered models not persisted**: In-memory only, lost on page refresh. Intentional design; may revisit if needed.
6. **ModelId still required in ProviderProfile**: Account-first flow ideally makes modelId optional. Currently user must pick a default.
7. **No regression tests re-run**: Previous stage tests not executed.
8. **No GitHub Actions CI**: Automated CI not configured for this branch.
