# Remaining Issues

1. **PostgreSQL not running**: binaries missing, cannot apply migration or test E2E
2. **No real API testing**: No Gemini/OpenAI API keys configured
3. **OpenAI error classification**: Still uses generic classifyHttpError (needs body parsing)
4. **GPT Image reference images**: gpt-image → openai-images → no reference image support
5. **Discovered models ephemeral**: In-memory only, lost on page refresh
6. **ModelId still required in ProviderProfile**: Account-first flow would benefit from optional modelId
7. **No regression tests re-run**: stage-7, stage-8, stage-8-0-2, stage-8-0-3 not executed
8. **No GitHub Actions CI**: Not configured for this branch
