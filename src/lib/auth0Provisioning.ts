import { supabase } from "./supabase";
import type { AppUserRole } from "./auth";

export interface Auth0ProvisioningUser {
  email: string;
  role: Extract<AppUserRole, "admin" | "normal">;
}

export type Auth0ProvisioningStatus =
  "unknown" | "pending" | "provisioned" | "failed";

export async function provisionAuth0Users(users: Auth0ProvisioningUser[]) {
  const normalizedUsers = [
    ...new Map(
      users.map((user) => {
        const email = user.email.trim().toLowerCase();
        return [email, { email, role: user.role }] as const;
      }),
    ).values(),
  ];

  const { error } = await supabase.functions.invoke("provision-auth0-user", {
    body: { users: normalizedUsers },
  });

  if (error) {
    throw error;
  }
}

export async function deleteAuth0User(userId: string) {
  const { error } = await supabase.functions.invoke("provision-auth0-user", {
    body: { action: "delete", user_id: userId },
  });

  if (error) {
    throw error;
  }
}
