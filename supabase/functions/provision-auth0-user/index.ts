import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type ProvisionableRole = "admin" | "normal";

interface ProvisioningRequest {
  users?: Array<{
    email?: string;
    role?: ProvisionableRole;
  }>;
}

interface AppUserProfile {
  email: string;
  role: "normal" | "admin" | "super_admin";
}

interface Auth0Identity {
  connection?: string;
}

interface Auth0User {
  user_id: string;
  identities?: Auth0Identity[];
}

interface Auth0TokenResponse {
  access_token: string;
  expires_in: number;
}

interface PreparedUser {
  email: string;
  role: ProvisionableRole;
}

type ProvisioningRpc = {
  (
    name: "begin_auth0_user_provisioning",
    args: {
      requested_users: Array<{ email: string; role: ProvisionableRole }>;
    },
  ): PromiseLike<{ data: PreparedUser[] | null; error: unknown }>;
  (
    name: "finish_auth0_user_provisioning",
    args: {
      provisioned_email: string;
      provisioned_auth0_user_id: string | null;
      provisioning_error: string | null;
    },
  ): PromiseLike<{ data: null; error: unknown }>;
};

let cachedManagementToken: { token: string; expiresAt: number } | null = null;

const allowedOrigins = new Set([
  "https://navigator.cnlogistics.co.jp",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const baseCorsHeaders = {
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  return origin && allowedOrigins.has(origin)
    ? {
        ...baseCorsHeaders,
        "access-control-allow-origin": origin,
        vary: "origin",
      }
    : baseCorsHeaders;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required Edge Function secret: ${name}`);
  }
  return value;
}

function normalizeAuth0Domain(domain: string) {
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function normalizeUsers(body: ProvisioningRequest) {
  const users = body.users ?? [];
  const normalizedUsers = new Map<
    string,
    { email: string; role: ProvisionableRole }
  >();

  for (const user of users) {
    const email = user.email?.trim().toLowerCase() ?? "";
    const role = user.role;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("A valid email address is required");
    }
    if (role !== "admin" && role !== "normal") {
      throw new Error("Only admin and normal users can be provisioned");
    }

    const existing = normalizedUsers.get(email);
    if (existing && existing.role !== role) {
      throw new Error("The same email cannot be provisioned with two roles");
    }
    normalizedUsers.set(email, { email, role });
  }

  if (normalizedUsers.size === 0) {
    throw new Error("At least one user is required");
  }

  return [...normalizedUsers.values()];
}

function assertCanProvision(
  requesterRole: AppUserProfile["role"],
  users: Array<{ role: ProvisionableRole }>,
) {
  if (requesterRole === "super_admin") return;

  if (
    requesterRole === "admin" &&
    users.every((user) => user.role === "normal")
  ) {
    return;
  }

  throw new Error("The signed-in user cannot provision the requested roles");
}

async function getManagementToken(domain: string) {
  const now = Date.now();
  if (cachedManagementToken && cachedManagementToken.expiresAt > now + 60_000) {
    return cachedManagementToken.token;
  }

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: requiredEnv("AUTH0_MANAGEMENT_CLIENT_ID"),
      client_secret: requiredEnv("AUTH0_MANAGEMENT_CLIENT_SECRET"),
      audience: `https://${domain}/api/v2/`,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error("Auth0 Management API authentication failed");
  }

  const tokenResponse = (await response.json()) as Auth0TokenResponse;
  cachedManagementToken = {
    token: tokenResponse.access_token,
    expiresAt: now + tokenResponse.expires_in * 1000,
  };
  return tokenResponse.access_token;
}

async function findPasswordlessUser({
  domain,
  token,
  email,
  connection,
}: {
  domain: string;
  token: string;
  email: string;
  connection: string;
}) {
  const response = await fetch(
    `https://${domain}/api/v2/users-by-email?email=${encodeURIComponent(
      email,
    )}`,
    {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error("Auth0 user lookup failed");
  }

  const users = (await response.json()) as Auth0User[];
  return users.find((user) =>
    user.identities?.some((identity) => identity.connection === connection),
  );
}

async function provisionUser({
  domain,
  token,
  connection,
  email,
}: {
  domain: string;
  token: string;
  connection: string;
  email: string;
}) {
  const existingUser = await findPasswordlessUser({
    domain,
    token,
    email,
    connection,
  });
  if (existingUser) {
    return { email, userId: existingUser.user_id, created: false };
  }

  const response = await fetch(`https://${domain}/api/v2/users`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      connection,
      email,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error("Auth0 user creation failed");
  }

  const createdUser = (await response.json()) as Auth0User;
  return { email, userId: createdUser.user_id, created: true };
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      const headers = corsHeaders(request);
      if (!("access-control-allow-origin" in headers)) {
        return new Response(null, { status: 403, headers });
      }
      return new Response(null, { status: 204, headers });
    }

    const authorization = request.headers.get("authorization")?.trim();
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        request,
        { error: "Authentication is required" },
        401,
      );
    }

    // The caller supplies an Auth0 token. Forward it to PostgREST so the
    // configured Supabase third-party Auth integration validates the token and
    // the database functions can authorize the corresponding app user.
    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    try {
      const { data, error } = await supabase.rpc("sync_auth0_app_user");
      const requester = (data?.[0] ?? null) as AppUserProfile | null;

      if (error || !requester) {
        return jsonResponse(
          request,
          { error: "The signed-in user is not provisioned" },
          403,
        );
      }

      const users = normalizeUsers(
        (await request.json()) as ProvisioningRequest,
      );
      assertCanProvision(requester.role, users);
      const provisioningRpc = supabase.rpc.bind(
        supabase,
      ) as unknown as ProvisioningRpc;

      const { data: preparedUsers, error: prepareError } =
        await provisioningRpc("begin_auth0_user_provisioning", {
          requested_users: users,
        });

      if (prepareError) {
        throw new Error(
          "The requested application users cannot be provisioned",
        );
      }

      const domain = normalizeAuth0Domain(requiredEnv("AUTH0_DOMAIN"));
      const connection =
        Deno.env.get("AUTH0_USER_CONNECTION")?.trim() || "email";
      const token = await getManagementToken(domain);
      const results = [];
      const failures = [];

      for (const user of preparedUsers ?? []) {
        try {
          const result = await provisionUser({
            domain,
            token,
            connection,
            email: user.email,
          });
          const { error: completionError } = await provisioningRpc(
            "finish_auth0_user_provisioning",
            {
              provisioned_email: user.email,
              provisioned_auth0_user_id: result.userId,
              provisioning_error: null,
            },
          );
          if (completionError) {
            throw new Error("Auth0 provisioning status could not be saved");
          }
          results.push(result);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Auth0 provisioning failed";
          await provisioningRpc("finish_auth0_user_provisioning", {
            provisioned_email: user.email,
            provisioned_auth0_user_id: null,
            provisioning_error: message,
          });
          failures.push({ email: user.email, error: message });
        }
      }

      if (failures.length > 0) {
        return jsonResponse(
          request,
          {
            error: "One or more Auth0 users could not be provisioned",
            failures,
          },
          502,
        );
      }

      return jsonResponse(request, { users: results });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "User provisioning failed";
      const status =
        message.includes("cannot provision") ||
        message.includes("valid email") ||
        message.includes("At least one") ||
        message.includes("Only admin") ||
        message.includes("same email")
          ? 400
          : 502;

      return jsonResponse(request, { error: message }, status);
    }
  },
};
