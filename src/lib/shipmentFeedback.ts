import { supabase } from "./supabase";

export interface ShipmentFeedback {
  id: string;
  shipment_job_id: string;
  submitter_email: string;
  admin_operator_email: string | null;
  rating: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchShipmentFeedbackForUser(
  email: string,
): Promise<ShipmentFeedback[]> {
  const { data, error } = await supabase.rpc(
    "list_shipment_feedback_for_user",
    {
      feedback_submitter_email: email,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentFeedback[];
}

export async function submitShipmentFeedback({
  shipmentJobId,
  submitterEmail,
  rating,
  reason,
}: {
  shipmentJobId: string;
  submitterEmail: string;
  rating: number;
  reason: string;
}): Promise<ShipmentFeedback> {
  const { data, error } = await supabase.rpc("submit_shipment_feedback", {
    feedback_shipment_job_id: shipmentJobId,
    feedback_submitter_email: submitterEmail,
    feedback_rating: rating,
    feedback_reason: reason,
  });

  if (error) {
    throw error;
  }

  const [result] = (data ?? []) as ShipmentFeedback[];
  if (!result) {
    throw new Error("Feedback was not saved.");
  }

  return result;
}
