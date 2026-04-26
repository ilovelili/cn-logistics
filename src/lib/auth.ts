import { supabase } from "./supabase";

export type AppUserRole = "normal" | "admin" | "super_admin";

export interface AppUserProfile {
  email: string;
  role: AppUserRole;
  avatar_url: string | null;
}

export async function verifyAppLogin(
  email: string,
  password: string,
): Promise<AppUserProfile | null> {
  const { data, error } = await supabase.rpc("verify_app_login", {
    login_email: email,
    login_password: password,
  });

  if (error) {
    throw error;
  }

  const [result] = (data ?? []) as AppUserProfile[];
  return result ?? null;
}

export async function fetchAppUserProfile(
  email: string,
): Promise<AppUserProfile | null> {
  const { data, error } = await supabase.rpc("get_app_user_profile", {
    profile_email: email,
  });

  if (error) {
    throw error;
  }

  const [result] = (data ?? []) as AppUserProfile[];
  return result ?? null;
}

export async function updateAppUserAvatar(
  email: string,
  avatarUrl: string,
): Promise<AppUserProfile | null> {
  const { data, error } = await supabase.rpc("update_app_user_avatar", {
    profile_email: email,
    profile_avatar_url: avatarUrl,
  });

  if (error) {
    throw error;
  }

  const [result] = (data ?? []) as AppUserProfile[];
  return result ?? null;
}

export async function uploadAppUserAvatar(email: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeEmail = email.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = `${safeEmail}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from("app-avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from("app-avatars").getPublicUrl(path);
  return data.publicUrl;
}
