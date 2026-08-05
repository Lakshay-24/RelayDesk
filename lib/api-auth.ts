import { createHash, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type ApiScope =
  | "conversations:read"
  | "conversations:write"
  | "contacts:read"
  | "messages:read";

export type ApiPrincipal = {
  apiKeyId: string;
  workspaceId: string;
  scopes: string[];
};

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function apiKeyHash(value: string) {
  return hashKey(value);
}

export async function authenticateApiKey(request: Request, requiredScope: ApiScope): Promise<ApiPrincipal | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("rd_live_") || token.length < 32) return null;

  const prefix = token.slice(0, 16);
  const digest = hashKey(token);
  const db = createAdminClient();
  const { data: candidates } = await db
    .from("api_keys")
    .select("id,workspace_id,key_hash,scopes,expires_at,revoked_at")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .limit(5);

  const key = (candidates ?? []).find((candidate) => {
    const stored = Buffer.from(candidate.key_hash, "hex");
    const actual = Buffer.from(digest, "hex");
    return stored.length === actual.length && timingSafeEqual(stored, actual);
  });
  if (!key || (key.expires_at && new Date(key.expires_at) <= new Date())) return null;
  if (!(key.scopes as string[]).includes(requiredScope)) return null;

  void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { apiKeyId: key.id, workspaceId: key.workspace_id, scopes: key.scopes as string[] };
}

export function apiJson(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}
