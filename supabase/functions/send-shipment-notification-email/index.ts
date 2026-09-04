import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
// @ts-types="@types/nodemailer"
import nodemailer from "nodemailer";
import { buildUpdateDetails, type ShipmentChange } from "./change-details.ts";

interface EmailDelivery {
  id: string;
  recipient_email: string;
  previous_status: string;
  current_status: string;
  awb_bl_number: string | null;
  origin: string | null;
  destination: string | null;
  change_details?: ShipmentChange[];
}

interface DeliveryRequest {
  delivery_id?: unknown;
  delivery_type?: unknown;
}

interface ShipperRegistrationDelivery {
  id: string;
  recipient_email: string;
  shipper_name: string;
  contact_person: string | null;
}

interface ShipperRegistrationApprovalDelivery {
  id: string;
  recipient_email: string;
  super_admin_name: string;
  customer_name: string;
  registered_by: string;
}

interface DocumentDownloadRequestDelivery {
  id: string;
  recipient_email: string;
  admin_name: string;
  requester_name: string;
  requester_email: string;
  customer_name: string;
  document_name: string;
  job_number: string | null;
  invoice_number: string | null;
  awb_bl_number: string | null;
}

interface DocumentDownloadApprovedDelivery {
  id: string;
  recipient_email: string;
  requester_name: string;
  customer_name: string;
  document_name: string;
  storage_path: string;
  job_number: string | null;
  invoice_number: string | null;
  awb_bl_number: string | null;
  approved_by: string;
}

interface EmailTemplate {
  subject_template: string;
  text_template: string;
  html_template: string;
}

type EmailClient = Pick<SupabaseClient, "from" | "storage">;

const senderAddress = "no-reply@navigator.cnlogistics.co.jp";
const smtpHost = "email-smtp.ap-northeast-1.amazonaws.com";
const configurationSetName = "cn-navigator";
const templateKey = "shipment_status_update";
const shipperRegistrationTemplateKey = "shipper_registration_approved";
const shipperRegistrationApprovalTemplateKey =
  "shipper_registration_approval_admin";
const documentDownloadRequestTemplateKey = "document_download_requested_admin";
const documentDownloadApprovedTemplateKey = "document_download_approved_user";
const shipmentDocumentBucket = "shipment-documents";
const maximumAttachmentBytes = 25 * 1024 * 1024;
const statusLabels: Record<string, { ja: string; en: string }> = {
  __status_set__: { ja: "出荷ステータス設定", en: "Shipment status set" },
  under_process: { ja: "処理中", en: "Under process" },
  customs_hold: { ja: "通関保留", en: "Customs hold" },
  completed: { ja: "完了", en: "Completed" },
  pickup: { ja: "貨物集荷", en: "Pickup" },
  warehouse_in: { ja: "倉庫入庫", en: "Warehouse in" },
  customs_origin: { ja: "輸出通関中", en: "Origin customs clearance" },
  terminal_in: { ja: "ターミナル搬入", en: "Terminal in" },
  departure: { ja: "航空便／本船出発", en: "Flight/vessel departed" },
  arrival: { ja: "到着", en: "Arrival" },
  customs_destination: {
    ja: "輸入通関中",
    en: "Destination customs clearance",
  },
  destination_warehouse_in: {
    ja: "現地倉庫入庫",
    en: "Destination warehouse in",
  },
  delivery: { ja: "配達中", en: "Out for delivery" },
  delivered: { ja: "配達完了", en: "Delivered" },
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const configuredWebhookSecret = requiredEnv("EMAIL_WEBHOOK_SECRET");
  const providedWebhookSecret =
    request.headers.get("x-cn-navigator-webhook-secret") ?? "";

  if (!secureEqual(providedWebhookSecret, configuredWebhookSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DeliveryRequest;
  try {
    body = (await request.json()) as DeliveryRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.delivery_id !== "string" ||
    !uuidPattern.test(body.delivery_id)
  ) {
    return Response.json({ error: "Invalid delivery_id" }, { status: 400 });
  }

  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const deliveryType =
    body.delivery_type === "shipper_registration"
      ? "shipper_registration"
      : body.delivery_type === "shipper_registration_approval"
        ? "shipper_registration_approval"
        : body.delivery_type === "document_download_request"
          ? "document_download_request"
          : body.delivery_type === "document_download_approved"
            ? "document_download_approved"
            : "shipment_status";
  const { data, error: claimError } = await supabase.rpc(
    claimRpcFor(deliveryType),
    { target_delivery_id: body.delivery_id },
  );

  if (claimError) {
    return Response.json(
      { error: "Unable to claim email delivery" },
      { status: 500 },
    );
  }

  const [delivery] = (data ?? []) as (
    | EmailDelivery
    | ShipperRegistrationDelivery
    | ShipperRegistrationApprovalDelivery
    | DocumentDownloadRequestDelivery
    | DocumentDownloadApprovedDelivery
  )[];
  if (!delivery) {
    return Response.json({ status: "already_processed" });
  }

  try {
    const port = parsePort(Deno.env.get("SES_SMTP_PORT") ?? "587");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: requiredEnv("SES_SMTP_USERNAME"),
        pass: requiredEnv("SES_SMTP_PASSWORD"),
      },
      tls: {
        minVersion: "TLSv1.2",
      },
    });
    const applicationUrl = requiredEnv("CN_NAVIGATOR_URL");
    const message = await buildMessage(
      supabase,
      deliveryType,
      delivery,
      applicationUrl,
    );
    const attachments =
      deliveryType === "document_download_approved"
        ? [
            await buildApprovedDocumentAttachment(
              supabase,
              delivery as DocumentDownloadApprovedDelivery,
            ),
          ]
        : undefined;
    const result = await transporter.sendMail({
      from: `CN Navigator <${senderAddress}>`,
      to: delivery.recipient_email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments,
      headers: {
        "X-SES-CONFIGURATION-SET": configurationSetName,
      },
    });

    const { error: completeError } = await supabase.rpc(
      completeRpcFor(deliveryType),
      {
        target_delivery_id: delivery.id,
        message_id: result.messageId ?? "",
      },
    );

    if (completeError) {
      throw new Error("Email sent but delivery status could not be recorded");
    }

    return Response.json({ status: "sent" });
  } catch (error) {
    const safeMessage = safeErrorMessage(error);
    await supabase.rpc(failRpcFor(deliveryType), {
      target_delivery_id: delivery.id,
      failure_message: safeMessage,
    });

    return Response.json({ error: "Email delivery failed" }, { status: 502 });
  }
});

type DeliveryType =
  | "shipment_status"
  | "shipper_registration"
  | "shipper_registration_approval"
  | "document_download_request"
  | "document_download_approved";

type Delivery =
  | EmailDelivery
  | ShipperRegistrationDelivery
  | ShipperRegistrationApprovalDelivery
  | DocumentDownloadRequestDelivery
  | DocumentDownloadApprovedDelivery;

function claimRpcFor(deliveryType: DeliveryType) {
  if (deliveryType === "shipper_registration") {
    return "claim_shipper_registration_email";
  }
  if (deliveryType === "shipper_registration_approval") {
    return "claim_shipper_registration_approval_email";
  }
  if (deliveryType === "document_download_request") {
    return "claim_document_download_request_email";
  }
  if (deliveryType === "document_download_approved") {
    return "claim_document_download_approved_email";
  }
  return "claim_shipment_notification_email";
}

function completeRpcFor(deliveryType: DeliveryType) {
  if (deliveryType === "shipper_registration") {
    return "complete_shipper_registration_email";
  }
  if (deliveryType === "shipper_registration_approval") {
    return "complete_shipper_registration_approval_email";
  }
  if (deliveryType === "document_download_request") {
    return "complete_document_download_request_email";
  }
  if (deliveryType === "document_download_approved") {
    return "complete_document_download_approved_email";
  }
  return "complete_shipment_notification_email";
}

function failRpcFor(deliveryType: DeliveryType) {
  if (deliveryType === "shipper_registration") {
    return "fail_shipper_registration_email";
  }
  if (deliveryType === "shipper_registration_approval") {
    return "fail_shipper_registration_approval_email";
  }
  if (deliveryType === "document_download_request") {
    return "fail_document_download_request_email";
  }
  if (deliveryType === "document_download_approved") {
    return "fail_document_download_approved_email";
  }
  return "fail_shipment_notification_email";
}

async function buildMessage(
  supabase: EmailClient,
  deliveryType: DeliveryType,
  delivery: Delivery,
  applicationUrl: string,
) {
  if (deliveryType === "shipper_registration") {
    return await buildShipperRegistrationMessage(
      supabase,
      delivery as ShipperRegistrationDelivery,
      applicationUrl,
    );
  }
  if (deliveryType === "shipper_registration_approval") {
    return await buildShipperRegistrationApprovalMessage(
      supabase,
      delivery as ShipperRegistrationApprovalDelivery,
      applicationUrl,
    );
  }
  if (deliveryType === "document_download_request") {
    return await buildDocumentDownloadRequestMessage(
      supabase,
      delivery as DocumentDownloadRequestDelivery,
      applicationUrl,
    );
  }
  if (deliveryType === "document_download_approved") {
    return await buildDocumentDownloadApprovedMessage(
      supabase,
      delivery as DocumentDownloadApprovedDelivery,
      applicationUrl,
    );
  }
  return await buildShipmentMessage(
    supabase,
    delivery as EmailDelivery,
    applicationUrl,
  );
}

async function buildShipmentMessage(
  supabase: EmailClient,
  delivery: EmailDelivery,
  applicationUrl: string,
) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject_template,text_template,html_template")
    .eq("template_key", templateKey)
    .single();

  if (error || !data) {
    throw new Error("Shipment email template could not be loaded");
  }

  const template = data as EmailTemplate;
  const awbBlNumber = delivery.awb_bl_number || "-";
  const origin = delivery.origin || "-";
  const destination = delivery.destination || "-";
  const currentStatus = labelFor(delivery.current_status);
  const previousStatus = labelFor(delivery.previous_status);
  const normalizedApplicationUrl = applicationUrl.replace(/\/$/, "");
  const statusUpdateJa =
    delivery.previous_status === "__created__"
      ? `新規案件登録（現在のステータス：${currentStatus.ja}）`
      : delivery.previous_status === "__updated__"
        ? `案件情報更新（現在のステータス：${currentStatus.ja}）`
        : delivery.previous_status === "__status_set__"
          ? `出荷ステータスが「${currentStatus.ja}」に設定されました`
          : `${previousStatus.ja} → ${currentStatus.ja}`;
  const statusUpdateEn =
    delivery.previous_status === "__created__"
      ? `New shipment registered (current status: ${currentStatus.en})`
      : delivery.previous_status === "__updated__"
        ? `Shipment details updated (current status: ${currentStatus.en})`
        : delivery.previous_status === "__status_set__"
          ? `Shipment status has been set to ${currentStatus.en}`
          : `${previousStatus.en} → ${currentStatus.en}`;
  const updateJa = buildUpdateDetails(
    delivery.previous_status,
    statusUpdateJa,
    delivery.change_details,
    "ja",
  );
  const updateEn = buildUpdateDetails(
    delivery.previous_status,
    statusUpdateEn,
    delivery.change_details,
    "en",
  );
  const values = {
    awb_bl_number: awbBlNumber,
    origin,
    destination,
    previous_status_ja: previousStatus.ja,
    current_status_ja: currentStatus.ja,
    update_details_ja: updateJa,
    previous_status_en: previousStatus.en,
    current_status_en: currentStatus.en,
    update_details_en: updateEn,
    application_url: normalizedApplicationUrl,
  };

  return {
    subject: renderTemplate(template.subject_template, values, false).replace(
      /[\r\n]+/g,
      " ",
    ),
    text: renderTemplate(template.text_template, values, false),
    html: renderTemplate(template.html_template, values, true),
  };
}

async function buildShipperRegistrationMessage(
  supabase: EmailClient,
  delivery: ShipperRegistrationDelivery,
  applicationUrl: string,
) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject_template,text_template,html_template")
    .eq("template_key", shipperRegistrationTemplateKey)
    .single();

  if (error || !data) {
    throw new Error("Shipper registration email template could not be loaded");
  }

  const template = data as EmailTemplate;
  const values = {
    customer_name: delivery.shipper_name,
    contact_person: delivery.contact_person || delivery.recipient_email,
    recipient_email: delivery.recipient_email,
    application_url: applicationUrl.replace(/\/$/, ""),
  };

  return {
    subject: renderTemplate(template.subject_template, values, false).replace(
      /[\r\n]+/g,
      " ",
    ),
    text: renderTemplate(template.text_template, values, false),
    html: renderTemplate(template.html_template, values, true),
  };
}

async function buildShipperRegistrationApprovalMessage(
  supabase: EmailClient,
  delivery: ShipperRegistrationApprovalDelivery,
  applicationUrl: string,
) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject_template,text_template,html_template")
    .eq("template_key", shipperRegistrationApprovalTemplateKey)
    .single();

  if (error || !data) {
    throw new Error(
      "Shipper registration approval email template could not be loaded",
    );
  }

  const template = data as EmailTemplate;
  const values = {
    super_admin_name: delivery.super_admin_name,
    customer_name: delivery.customer_name,
    registered_by: delivery.registered_by,
    application_url: applicationUrl.replace(/\/$/, ""),
  };

  return {
    subject: renderTemplate(template.subject_template, values, false).replace(
      /[\r\n]+/g,
      " ",
    ),
    text: renderTemplate(template.text_template, values, false),
    html: renderTemplate(template.html_template, values, true),
  };
}

async function buildDocumentDownloadRequestMessage(
  supabase: EmailClient,
  delivery: DocumentDownloadRequestDelivery,
  applicationUrl: string,
) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject_template,text_template,html_template")
    .eq("template_key", documentDownloadRequestTemplateKey)
    .single();

  if (error || !data) {
    throw new Error(
      "Document download request email template could not be loaded",
    );
  }

  const template = data as EmailTemplate;
  const values = {
    admin_name: delivery.admin_name,
    customer_name: delivery.customer_name,
    requester_name: delivery.requester_name,
    requester_email: delivery.requester_email,
    document_name: delivery.document_name,
    document_category: "顧客用書類",
    job_number: delivery.job_number || "-",
    invoice_number: delivery.invoice_number || "-",
    awb_bl_number: delivery.awb_bl_number || "-",
    application_url: applicationUrl.replace(/\/$/, ""),
  };

  return {
    subject: renderTemplate(template.subject_template, values, false).replace(
      /[\r\n]+/g,
      " ",
    ),
    text: renderTemplate(template.text_template, values, false),
    html: renderTemplate(template.html_template, values, true),
  };
}

async function buildDocumentDownloadApprovedMessage(
  supabase: EmailClient,
  delivery: DocumentDownloadApprovedDelivery,
  applicationUrl: string,
) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject_template,text_template,html_template")
    .eq("template_key", documentDownloadApprovedTemplateKey)
    .single();

  if (error || !data) {
    throw new Error(
      "Document download approval email template could not be loaded",
    );
  }

  const template = data as EmailTemplate;
  const values = {
    requester_name: delivery.requester_name,
    recipient_email: delivery.recipient_email,
    customer_name: delivery.customer_name,
    document_name: delivery.document_name,
    job_number: delivery.job_number || "-",
    invoice_number: delivery.invoice_number || "-",
    awb_bl_number: delivery.awb_bl_number || "-",
    approved_by: delivery.approved_by,
    application_url: applicationUrl.replace(/\/$/, ""),
  };

  return {
    subject: renderTemplate(template.subject_template, values, false).replace(
      /[\r\n]+/g,
      " ",
    ),
    text: renderTemplate(template.text_template, values, false),
    html: renderTemplate(template.html_template, values, true),
  };
}

async function buildApprovedDocumentAttachment(
  supabase: EmailClient,
  delivery: DocumentDownloadApprovedDelivery,
) {
  const { data, error } = await supabase.storage
    .from(shipmentDocumentBucket)
    .download(delivery.storage_path);

  if (error || !data) {
    throw new Error("Approved document attachment could not be downloaded");
  }
  if (data.size > maximumAttachmentBytes) {
    throw new Error(
      "Approved document attachment exceeds the email size limit",
    );
  }

  return {
    filename: safeAttachmentFilename(delivery.document_name),
    content: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || undefined,
  };
}

function renderTemplate(
  template: string,
  values: Record<string, string>,
  escapeValues: boolean,
) {
  return Object.entries(values).reduce((rendered, [key, value]) => {
    const replacement = escapeValues
      ? escapeHtml(value).replace(
          key.startsWith("update_details_") ? /\n/g : /$^/g,
          "<br />",
        )
      : value;
    return rendered.split(`{{${key}}}`).join(replacement);
  }, template);
}

function labelFor(status: string) {
  return statusLabels[status] ?? { ja: status, en: status };
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required Edge Function secret: ${name}`);
  }
  return value;
}

function parsePort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SES_SMTP_PORT must be a valid TCP port");
  }
  return port;
}

function secureEqual(first: string, second: string) {
  const firstBytes = new TextEncoder().encode(first);
  const secondBytes = new TextEncoder().encode(second);
  if (firstBytes.length !== secondBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < firstBytes.length; index += 1) {
    difference |= firstBytes[index] ^ secondBytes[index];
  }
  return difference === 0;
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unknown email error";
  return error.message.replace(/[\r\n]+/g, " ").slice(0, 1000);
}

function safeAttachmentFilename(value: string) {
  const sanitized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join("")
    .replace(/[\\/]/g, "-")
    .trim();
  return sanitized || "approved-document";
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}
