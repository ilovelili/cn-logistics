import { supabase } from "./supabase";

export type AppUserRole = "user" | "admin";

interface LoginResult {
  role: AppUserRole;
}

export async function verifyAppLogin(
  email: string,
  password: string,
): Promise<AppUserRole | null> {
  const { data, error } = await supabase.rpc("verify_app_login", {
    login_email: email,
    login_password: password,
  });

  if (error) {
    throw error;
  }

  const [result] = (data ?? []) as LoginResult[];
  return result?.role ?? null;
}
