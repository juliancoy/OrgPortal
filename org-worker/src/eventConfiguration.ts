import { z } from "zod";
import { mcpConfiguration } from "./eventMcp";
import { configuredProvider, integrationSchema } from "./eventPlatforms";

// Deliberately returns counts and issue codes, never configuration values or secrets.
export function checkEventConfiguration(env: Env, authorizationMetadata?: unknown) {
  const issues: string[] = [];
  let organizations = 0;
  let subjects = 0;
  try { mcpConfiguration(env); } catch { issues.push("oauth_configuration_invalid_or_missing"); }
  try {
    subjects = Object.keys(z.record(z.string().min(1), z.string().trim().min(1)).parse(JSON.parse(env.MCP_SUBJECT_MAP_JSON || "{}"))).length;
    if (!subjects) issues.push("no_subject_mappings");
  } catch { issues.push("invalid_subject_mappings"); }
  try {
    const integrations = z.record(z.string().min(1), integrationSchema).parse(JSON.parse(env.EVENT_INTEGRATIONS_JSON || "{}"));
    organizations = Object.keys(integrations).length;
    if (!organizations) issues.push("no_event_integrations");
    for (const id of Object.keys(integrations)) {
      try {
        const { provider, config } = configuredProvider(env, id);
        if (config.branding) provider.validateUpdate({ coverUrl: config.branding.coverUrl, tintColor: config.branding.tintColor });
      } catch { issues.push("provider_key_or_branding_invalid"); }
    }
  } catch { issues.push("invalid_event_integrations"); }
  for (const origin of (env.MCP_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:" || url.origin !== origin) throw new Error();
    } catch { issues.push("invalid_allowed_origin"); }
  }
  if (authorizationMetadata !== undefined) {
    const https = z.string().url().refine(value => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.hash;
    });
    const metadata = z.object({ issuer: https, jwks_uri: https, authorization_endpoint: https, token_endpoint: https,
      response_types_supported: z.array(z.string()), code_challenge_methods_supported: z.array(z.string()),
      scopes_supported: z.array(z.string()), grant_types_supported: z.array(z.string()).optional(),
    }).safeParse(authorizationMetadata);
    if (!metadata.success) issues.push("invalid_authorization_metadata");
    else {
      const data = metadata.data;
      if (data.issuer !== env.MCP_OAUTH_ISSUER || data.jwks_uri !== env.MCP_OAUTH_JWKS_URL) issues.push("authorization_metadata_mismatch");
      if (!data.response_types_supported.includes("code") || !data.code_challenge_methods_supported.includes("S256")) issues.push("authorization_code_pkce_s256_required");
      if (data.grant_types_supported && !data.grant_types_supported.includes("authorization_code")) issues.push("authorization_code_grant_required");
      if (!["org:events.read", "org:events.write"].every(scope => data.scopes_supported.includes(scope))) issues.push("event_scopes_not_advertised");
    }
  }
  return { ok: issues.length === 0, organizations, subjects, authorizationMetadataChecked: authorizationMetadata !== undefined,
    issues: [...new Set(issues)], liveConnectivityChecked: false, deploymentPerformed: false };
}
