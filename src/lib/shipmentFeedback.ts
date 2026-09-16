import { supabase } from "./supabase";

export type ShipmentFeedbackTargetRole = "sales" | "operations";

export interface ShipmentFeedback {
  id: string;
  shipment_job_id: string;
  submitter_email: string;
  admin_operator_id: string;
  admin_operator_name: string;
  admin_operator_email: string | null;
  admin_operator_staff_role: ShipmentFeedbackTargetRole | null;
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

export interface ShipmentFeedbackTarget {
  adminOperatorId: string;
  name: string;
  email: string;
  role: ShipmentFeedbackTargetRole;
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

export async function submitShipmentFeedbackForTargets({
  shipmentJobId,
  submitterEmail,
  feedbackByTarget,
  targets,
  reason,
}: {
  shipmentJobId: string;
  submitterEmail: string;
  feedbackByTarget: Record<string, FeedbackRatingPayload>;
  targets: ShipmentFeedbackTarget[];
  reason: string;
}): Promise<ShipmentFeedback[]> {
  const { data, error } = await supabase.rpc("submit_shipment_feedback_batch", {
    feedback_shipment_job_id: shipmentJobId,
    feedback_submitter_email: submitterEmail,
    feedback_by_target: targets.map((target) => ({
      admin_operator_id: target.adminOperatorId,
      target_role: target.role,
      attitude_rating: feedbackByTarget[target.adminOperatorId].attitudeRating,
      professionalism_rating:
        feedbackByTarget[target.adminOperatorId].professionalismRating,
      speed_rating: feedbackByTarget[target.adminOperatorId].speedRating,
      accuracy_rating: feedbackByTarget[target.adminOperatorId].accuracyRating,
      price_rating: feedbackByTarget[target.adminOperatorId].priceRating,
    })),
    feedback_reason: reason,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentFeedback[];
}

export interface FeedbackRatingPayload {
  attitudeRating: number;
  professionalismRating: number;
  speedRating: number;
  accuracyRating: number;
  priceRating: number;
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
