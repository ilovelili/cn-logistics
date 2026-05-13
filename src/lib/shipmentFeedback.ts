import { supabase } from "./supabase";

export interface ShipmentFeedback {
  id: string;
  shipment_job_id: string;
  submitter_email: string;
  admin_operator_email: string | null;
  rating: number;
  attitude_rating: number;
  professionalism_rating: number;
  speed_rating: number;
  accuracy_rating: number;
  price_rating: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentFeedbackReview extends ShipmentFeedback {
  shipment_invoice_number: string | null;
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
  attitudeRating,
  professionalismRating,
  speedRating,
  accuracyRating,
  priceRating,
  reason,
}: {
  shipmentJobId: string;
  submitterEmail: string;
  attitudeRating: number;
  professionalismRating: number;
  speedRating: number;
  accuracyRating: number;
  priceRating: number;
  reason: string;
}): Promise<ShipmentFeedback> {
  const { data, error } = await supabase.rpc("submit_shipment_feedback", {
    feedback_shipment_job_id: shipmentJobId,
    feedback_submitter_email: submitterEmail,
    feedback_attitude_rating: attitudeRating,
    feedback_professionalism_rating: professionalismRating,
    feedback_speed_rating: speedRating,
    feedback_accuracy_rating: accuracyRating,
    feedback_price_rating: priceRating,
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

export async function fetchAllShipmentFeedback(
  superAdminEmail: string,
): Promise<ShipmentFeedbackReview[]> {
  const { data, error } = await supabase.rpc("list_all_shipment_feedback", {
    super_admin_email: superAdminEmail,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentFeedbackReview[];
}

export function getShipmentFeedbackSummaryRating(
  feedback: Pick<
    ShipmentFeedback,
    | "attitude_rating"
    | "professionalism_rating"
    | "speed_rating"
    | "accuracy_rating"
    | "price_rating"
  >,
) {
  return (
    (feedback.attitude_rating +
      feedback.professionalism_rating +
      feedback.speed_rating +
      feedback.accuracy_rating +
      feedback.price_rating) /
    5
  );
}
