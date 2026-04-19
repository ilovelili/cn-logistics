import { supabase } from "./supabase";
import { t } from "./i18n";

export type ShipmentStatus = "under_process" | "customs_hold" | "completed";
export type TradeMode = "export" | "import" | "triangle";
export type TransportMode = "air" | "lcl" | "fcl";
export type DocumentScope = "customer" | "internal";
export type DocumentApprovalStatus = "pending" | "approved" | "rejected";

export interface ShipmentJob {
  id: string;
  status: ShipmentStatus;
  trade_mode: TradeMode;
  trade_term: string | null;
  invoice_number: string | null;
  transport_mode: TransportMode | null;
  shipper_name: string | null;
  consignee_name: string | null;
  pol_aol: string | null;
  pod_aod: string | null;
  mbl_mawb: string | null;
  hbl_hawb: string | null;
  bl_awb_date: string | null;
  documents: string[];
  internal_documents: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentDocument {
  id: string;
  shipment_job_id: string;
  scope: DocumentScope;
  name: string;
  storage_path: string | null;
  file_url: string | null;
  approval_status: DocumentApprovalStatus;
  rejection_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentJobForm {
  status: ShipmentStatus;
  trade_mode: TradeMode;
  trade_term: string;
  invoice_number: string;
  transport_mode: TransportMode;
  shipper_name: string;
  consignee_name: string;
  pol_aol: string;
  pod_aod: string;
  mbl_mawb: string;
  hbl_hawb: string;
  bl_awb_date: string;
  documents: string;
  internal_documents: string;
  notes: string;
}

export const statusOptions: { value: ShipmentStatus; label: string }[] = [
  { value: "under_process", label: t("status.underProcess") },
  { value: "customs_hold", label: t("status.customsHold") },
  { value: "completed", label: t("status.completed") },
];

export const tradeModeOptions: { value: TradeMode; label: string }[] = [
  { value: "export", label: t("trade.export") },
  { value: "import", label: t("trade.import") },
  { value: "triangle", label: t("trade.triangle") },
];

export const transportModeOptions: { value: TransportMode; label: string }[] = [
  { value: "air", label: t("transport.air") },
  { value: "lcl", label: t("transport.lcl") },
  { value: "fcl", label: t("transport.fcl") },
];

export const statusLabels = Object.fromEntries(
  statusOptions.map((option) => [option.value, option.label]),
) as Record<ShipmentStatus, string>;

export const tradeModeLabels = Object.fromEntries(
  tradeModeOptions.map((option) => [option.value, option.label]),
) as Record<TradeMode, string>;

export const transportModeLabels = Object.fromEntries(
  transportModeOptions.map((option) => [option.value, option.label]),
) as Record<TransportMode, string>;

export const statusBadgeClasses: Record<ShipmentStatus, string> = {
  under_process: "bg-blue-100 text-blue-800 border-blue-200",
  customs_hold: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const statusAccentClasses: Record<ShipmentStatus, string> = {
  under_process: "bg-blue-500",
  customs_hold: "bg-amber-500",
  completed: "bg-emerald-500",
};

export const documentApprovalLabels: Record<DocumentApprovalStatus, string> = {
  pending: t("documents.approval.pending"),
  approved: t("documents.approval.approved"),
  rejected: t("documents.approval.rejected"),
};

export const documentApprovalClasses: Record<DocumentApprovalStatus, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
};

export const defaultShipmentJobForm: ShipmentJobForm = {
  status: "under_process",
  trade_mode: "export",
  trade_term: "CIF",
  invoice_number: "",
  transport_mode: "air",
  shipper_name: "",
  consignee_name: "",
  pol_aol: "",
  pod_aod: "",
  mbl_mawb: "",
  hbl_hawb: "",
  bl_awb_date: "",
  documents: "",
  internal_documents: "",
  notes: "",
};

export function parseDocumentList(value: string): string[] {
  return value
    .split(/[・,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDocumentList(documents: string[]): string {
  return documents.join("・");
}

export function jobToForm(job: ShipmentJob): ShipmentJobForm {
  return {
    status: job.status,
    trade_mode: job.trade_mode,
    trade_term: job.trade_term ?? "",
    invoice_number: job.invoice_number ?? "",
    transport_mode: job.transport_mode ?? "air",
    shipper_name: job.shipper_name ?? "",
    consignee_name: job.consignee_name ?? "",
    pol_aol: job.pol_aol ?? "",
    pod_aod: job.pod_aod ?? "",
    mbl_mawb: job.mbl_mawb ?? "",
    hbl_hawb: job.hbl_hawb ?? "",
    bl_awb_date: job.bl_awb_date ?? "",
    documents: formatDocumentList(job.documents ?? []),
    internal_documents: formatDocumentList(job.internal_documents ?? []),
    notes: job.notes ?? "",
  };
}

export function formToPayload(form: ShipmentJobForm) {
  return {
    status: form.status,
    trade_mode: form.trade_mode,
    trade_term: form.trade_term || null,
    invoice_number: form.invoice_number || null,
    transport_mode: form.transport_mode || null,
    shipper_name: form.shipper_name || null,
    consignee_name: form.consignee_name || null,
    pol_aol: form.pol_aol || null,
    pod_aod: form.pod_aod || null,
    mbl_mawb: form.mbl_mawb || null,
    hbl_hawb: form.hbl_hawb || null,
    bl_awb_date: form.bl_awb_date || null,
    documents: parseDocumentList(form.documents),
    internal_documents: parseDocumentList(form.internal_documents),
    notes: form.notes || null,
  };
}

export async function fetchShipmentJobs(): Promise<ShipmentJob[]> {
  const { data, error } = await supabase
    .from("shipment_jobs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentJob[];
}

export async function fetchShipmentDocuments(): Promise<ShipmentDocument[]> {
  const { data, error } = await supabase
    .from("shipment_documents")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentDocument[];
}

export async function createShipmentJob(form: ShipmentJobForm) {
  const { data, error } = await supabase
    .from("shipment_jobs")
    .insert(formToPayload(form))
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await replaceShipmentDocuments(data.id, form);
}

export async function updateShipmentJob(id: string, form: ShipmentJobForm) {
  const { error } = await supabase
    .from("shipment_jobs")
    .update(formToPayload(form))
    .eq("id", id);

  if (error) {
    throw error;
  }

  await replaceShipmentDocuments(id, form);
}

export async function updateShipmentDocumentApproval(
  id: string,
  approvalStatus: DocumentApprovalStatus,
) {
  const { error } = await supabase
    .from("shipment_documents")
    .update({
      approval_status: approvalStatus,
      approved_at:
        approvalStatus === "approved" ? new Date().toISOString() : null,
      approved_by: approvalStatus === "approved" ? "admin" : null,
      rejection_reason: approvalStatus === "rejected" ? "" : null,
    })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export function getOpenDocumentCount(job: ShipmentJob): number {
  return (job.documents?.length ?? 0) + (job.internal_documents?.length ?? 0);
}

export function getDocumentsForJob(
  documents: ShipmentDocument[],
  jobId: string,
): ShipmentDocument[] {
  return documents.filter((document) => document.shipment_job_id === jobId);
}

export function isCustomerDocumentDownloadable(document: ShipmentDocument) {
  return (
    document.scope === "customer" && document.approval_status === "approved"
  );
}

export function downloadShipmentDocument(document: ShipmentDocument) {
  if (document.file_url) {
    const link = window.document.createElement("a");
    link.href = document.file_url;
    link.download = `${document.name}.pdf`;
    link.click();
    return;
  }

  const link = window.document.createElement("a");
  link.href = "/sample-document.pdf";
  link.download = `${document.name}.pdf`;
  link.click();
}

async function replaceShipmentDocuments(jobId: string, form: ShipmentJobForm) {
  const existing = await fetchDocumentsForJob(jobId);
  const existingByKey = new Map(
    existing.map((document) => [
      documentKey(document.scope, document.name),
      document,
    ]),
  );
  const nextDocuments = [
    ...parseDocumentList(form.documents).map((name) =>
      buildDocumentPayload(jobId, "customer", name, existingByKey),
    ),
    ...parseDocumentList(form.internal_documents).map((name) =>
      buildDocumentPayload(jobId, "internal", name, existingByKey),
    ),
  ];

  const { error: deleteError } = await supabase
    .from("shipment_documents")
    .delete()
    .eq("shipment_job_id", jobId);

  if (deleteError) {
    throw deleteError;
  }

  if (!nextDocuments.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from("shipment_documents")
    .insert(nextDocuments);

  if (insertError) {
    throw insertError;
  }
}

async function fetchDocumentsForJob(
  jobId: string,
): Promise<ShipmentDocument[]> {
  const { data, error } = await supabase
    .from("shipment_documents")
    .select("*")
    .eq("shipment_job_id", jobId);

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentDocument[];
}

function buildDocumentPayload(
  jobId: string,
  scope: DocumentScope,
  name: string,
  existingByKey: Map<string, ShipmentDocument>,
) {
  const existing = existingByKey.get(documentKey(scope, name));
  return {
    shipment_job_id: jobId,
    scope,
    name,
    storage_path: existing?.storage_path ?? null,
    file_url: existing?.file_url ?? null,
    approval_status:
      existing?.approval_status ??
      (scope === "internal" ? "approved" : "pending"),
    rejection_reason: existing?.rejection_reason ?? null,
    approved_at: existing?.approved_at ?? null,
    approved_by: existing?.approved_by ?? null,
  };
}

function documentKey(scope: DocumentScope, name: string) {
  return `${scope}:${name}`;
}
