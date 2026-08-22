import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// @ts-types="@types/nodemailer"
import nodemailer from "nodemailer";

interface EmailDelivery {
  id: string;
  recipient_email: string;
  previous_status: string;
  current_status: string;
  awb_bl_number: string | null;
  origin: string | null;
  destination: string | null;
}

interface DeliveryRequest {
  delivery_id?: unknown;
}

interface EmailTemplate {
  subject_template: string;
  text_template: string;
  html_template: string;
}

type EmailTemplateClient = Pick<SupabaseClient, "from">;

const senderAddress = "no-reply@navigator.cnlogistics.co.jp";
const smtpHost = "email-smtp.ap-northeast-1.amazonaws.com";
const configurationSetName = "cn-navigator";
const templateKey = "shipment_status_update";
const statusLabels: Record<string, { ja: string; en: string }> = {
  under_process: { ja: "処理中", en: "Under process" },
  customs_hold: { ja: "通関保留", en: "Customs hold" },
  completed: { ja: "完了", en: "Completed" },
  pickup: { ja: "貨物集荷", en: "Pickup" },
  warehouse_in: { ja: "倉庫入庫", en: "Warehouse in" },
  customs_origin: { ja: "輸出通関中", en: "Origin customs clearance" },
  terminal_in: { ja: "ターミナル搬入", en: "Terminal in" },
  departure: { ja: "出発", en: "Departure" },
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
  const { data, error: claimError } = await supabase.rpc(
    "claim_shipment_notification_email",
    { target_delivery_id: body.delivery_id },
  );

  if (claimError) {
    return Response.json(
      { error: "Unable to claim email delivery" },
      { status: 500 },
    );
  }

  const [delivery] = (data ?? []) as EmailDelivery[];
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
    const message = await buildMessage(
      supabase,
      delivery,
      requiredEnv("CN_NAVIGATOR_URL"),
    );
    const result = await transporter.sendMail({
      from: `CN Navigator <${senderAddress}>`,
      to: delivery.recipient_email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: {
        "X-SES-CONFIGURATION-SET": configurationSetName,
      },
    });

    const { error: completeError } = await supabase.rpc(
      "complete_shipment_notification_email",
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
    await supabase.rpc("fail_shipment_notification_email", {
      target_delivery_id: delivery.id,
      failure_message: safeMessage,
    });

    return Response.json({ error: "Email delivery failed" }, { status: 502 });
  }
});

async function buildMessage(
  supabase: EmailTemplateClient,
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
  const previousStatus = labelFor(delivery.previous_status);
  const currentStatus = labelFor(delivery.current_status);
  const normalizedApplicationUrl = applicationUrl.replace(/\/$/, "");
  const updateJa = `${previousStatus.ja} → ${currentStatus.ja}`;
  const updateEn = `${previousStatus.en} → ${currentStatus.en}`;
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

function renderTemplate(
  template: string,
  values: Record<string, string>,
  escapeValues: boolean,
) {
  return Object.entries(values).reduce((rendered, [key, value]) => {
    const replacement = escapeValues ? escapeHtml(value) : value;
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
