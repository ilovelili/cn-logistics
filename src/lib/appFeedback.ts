import { supabase } from "./supabase";

export interface AppFeedbackForm {
  title: string;
  message: string;
  page: string;
}

export async function submitAppFeedback(
  feedback: AppFeedbackForm,
): Promise<string> {
  const { data, error } = await supabase.rpc("submit_app_feedback", {
    feedback_title: feedback.title,
    feedback_message: feedback.message,
    feedback_page: feedback.page || null,
  });

  if (error) {
    throw error;
  }

  if (typeof data !== "string") {
    throw new Error("Feedback was not saved.");
  }

  return data;
}
