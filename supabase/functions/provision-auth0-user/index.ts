import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

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
    `https://${domain}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
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
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    try {
      const { data, error } = await context.supabase.rpc("sync_auth0_app_user");
      const requester = (data?.[0] ?? null) as AppUserProfile | null;

      if (error || !requester) {
        return Response.json(
          { error: "The signed-in user is not provisioned" },
          { status: 403 },
        );
      }

      const users = normalizeUsers(
        (await request.json()) as ProvisioningRequest,
      );
      assertCanProvision(requester.role, users);
      const provisioningRpc = context.supabase.rpc.bind(
        context.supabase,
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
        return Response.json(
          {
            error: "One or more Auth0 users could not be provisioned",
            failures,
          },
          { status: 502 },
        );
      }

      return Response.json({ users: results });
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

      return Response.json({ error: message }, { status });
    }
  }),
};
