import { decryptSecret } from "@/lib/security";
import { parseCapabilities, inferProviderProtocol } from "@/lib/provider-profiles";
import { resolveEffectiveModelCapability } from "@/lib/model-capabilities";

export function buildProviderConfig(profile, overrides = {}) {
  const modelId = (overrides.modelId || profile.modelId || "").trim();
  const capabilities = Array.isArray(overrides.capabilities)
    ? overrides.capabilities.filter(Boolean)
    : parseCapabilities(profile);
  let protocol = profile.protocol;
  let finalCapabilities = capabilities;
  let supportsReferenceImages = profile.supportsReferenceImages;

  if (overrides.modelId || overrides.protocol || Array.isArray(overrides.capabilities)) {
    const resolved = resolveEffectiveModelCapability({
      provider: profile.provider,
      modelId,
      profile,
      adapterProbe: {
        capabilities: Array.isArray(overrides.capabilities) ? overrides.capabilities : capabilities,
        protocol: overrides.protocol || "",
      },
    });
    if (resolved.capabilities.length > 0) finalCapabilities = resolved.capabilities;
    protocol = resolved.protocol || inferProviderProtocol(profile.provider, modelId, finalCapabilities);
    supportsReferenceImages = resolved.supportsReferenceImages;
  }

  return {
    id: profile.id, provider: profile.provider, name: profile.name,
    baseUrl: profile.baseUrl, apiKey: decryptSecret(profile),
    modelId, protocol, capabilities: finalCapabilities,
    supportsReferenceImages,
    timeoutMs: profile.timeoutMs, maxRetries: profile.maxRetries, enabled: profile.enabled,
  };
}
