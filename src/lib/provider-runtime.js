import { decryptSecret } from "@/lib/security";
import { parseCapabilities, inferModelCapabilities, inferProviderProtocol } from "@/lib/provider-profiles";

export function buildProviderConfig(profile, overrides = {}) {
  const modelId = (overrides.modelId || profile.modelId || "").trim();
  const capabilities = Array.isArray(overrides.capabilities)
    ? overrides.capabilities.filter(Boolean)
    : parseCapabilities(profile);
  let protocol = profile.protocol;
  let finalCapabilities = capabilities;

  if (overrides.modelId && overrides.modelId !== profile.modelId) {
    const inferred = inferModelCapabilities(profile.provider, modelId);
    if (inferred.length > 0) finalCapabilities = inferred;
    protocol = inferProviderProtocol(profile.provider, modelId, finalCapabilities);
  }

  return {
    id: profile.id, provider: profile.provider, name: profile.name,
    baseUrl: profile.baseUrl, apiKey: decryptSecret(profile),
    modelId, protocol, capabilities: finalCapabilities,
    timeoutMs: profile.timeoutMs, maxRetries: profile.maxRetries, enabled: profile.enabled,
  };
}
