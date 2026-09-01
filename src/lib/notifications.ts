import { supabase } from "./supabase";
export interface ShipmentNotification {
  id: string;
  shipment_job_id: string;
  previous_status: string;
  current_status: string;
  awb_bl_number: string | null;
  origin: string | null;
  destination: string | null;
  read_at: string | null;
  created_at: string;
}

export async function fetchShipmentNotifications(
  profileEmail: string,
): Promise<ShipmentNotification[]> {
  const { data, error } = await supabase.rpc("list_shipment_notifications", {
    profile_email: profileEmail,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentNotification[];
}

export async function markShipmentNotificationRead(
  profileEmail: string,
  notificationId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "mark_shipment_notification_read",
    {
      profile_email: profileEmail,
      notification_id: notificationId,
    },
  );

  if (error) {
    throw error;
  }

  return data as string;
}
