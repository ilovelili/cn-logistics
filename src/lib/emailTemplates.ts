import { supabase } from "./supabase";

export interface EmailTemplate {
  template_key: string;
  display_name: string;
  subject_template: string;
  text_template: string;
  html_template: string;
  updated_at: string;
}

export interface EmailTemplateForm {
  subject_template: string;
  text_template: string;
  html_template: string;
}

const shipmentEmailTemplateVariables = [
  "awb_bl_number",
  "origin",
  "destination",
  "previous_status_ja",
  "current_status_ja",
  "update_details_ja",
  "previous_status_en",
  "current_status_en",
  "update_details_en",
  "application_url",
] as const;

const shipperRegistrationEmailTemplateVariables = [
  "customer_name",
  "contact_person",
  "recipient_email",
  "application_url",
] as const;

const documentDownloadRequestEmailTemplateVariables = [
  "admin_name",
  "customer_name",
  "application_url",
] as const;

const documentDownloadApprovedEmailTemplateVariables = [
  "requester_name",
  "recipient_email",
  "customer_name",
  "document_name",
  "job_number",
  "invoice_number",
  "awb_bl_number",
  "approved_by",
  "application_url",
] as const;

export function getEmailTemplateVariables(templateKey: string) {
  if (templateKey === "shipper_registration_approved") {
    return shipperRegistrationEmailTemplateVariables;
  }
  if (templateKey === "document_download_requested_admin") {
    return documentDownloadRequestEmailTemplateVariables;
  }
  if (templateKey === "document_download_approved_user") {
    return documentDownloadApprovedEmailTemplateVariables;
  }
  return shipmentEmailTemplateVariables;
}

export async function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase.rpc(
    "list_email_templates_for_super_admin",
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as EmailTemplate[];
}

export async function updateEmailTemplate(
  templateKey: string,
  form: EmailTemplateForm,
): Promise<EmailTemplate> {
  const { data, error } = await supabase.rpc(
    "update_email_template_for_super_admin",
    {
      target_template_key: templateKey,
      new_subject_template: form.subject_template,
      new_text_template: form.text_template,
      new_html_template: form.html_template,
    },
  );

  if (error) {
    throw error;
  }

  const [updatedTemplate] = (data ?? []) as EmailTemplate[];
  if (!updatedTemplate) {
    throw new Error("Email template was not updated.");
  }

  return updatedTemplate;
}
