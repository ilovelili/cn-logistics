import { supabase } from "./supabase";

export interface AppNotification {
  id: string;
  event_type: string;
  actor_email: string | null;
  shipper_name: string | null;
  subject: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export async function fetchAppNotifications(profileEmail: string) {
  const { data, error } = await supabase.rpc("list_app_notifications", {
    profile_email: profileEmail,
  });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markAppNotificationsRead(
  profileEmail: string,
  notificationId?: string,
) {
  const { error } = await supabase.rpc("mark_app_notification_read", {
    profile_email: profileEmail,
    target_notification_id: notificationId ?? null,
  });
  if (error) throw error;
}
