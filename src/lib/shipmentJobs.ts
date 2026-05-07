import { supabase } from "./supabase";
import { t } from "./i18n";

export type ShipmentStatus = "under_process" | "customs_hold" | "completed";
export type TradeMode = "export" | "import" | "triangle";
export type TransportMode = "air" | "lcl" | "fcl";
export type DocumentScope = "customer" | "internal";
export type DocumentApprovalStatus =
  | "not_requested"
  | "pending"
  | "approved"
  | "rejected";

export interface ShipmentJob {
  id: string;
  company_name: string | null;
  status: ShipmentStatus;
  trade_mode: TradeMode;
  trade_term: string | null;
  invoice_number: string | null;
  transport_mode: TransportMode | null;
  shipper_name: string | null;
  consignee_name: string | null;
  pol_aol: string | null;
  pod_aod: string | null;
  vessel_flight_numbers: string[];
  mbl_mawb: string | null;
  hbl_hawb: string | null;
  bl_awb_date: string | null;
  documents: string[];
  internal_documents: string[];
  notes: string | null;
  tracking_events: ShipmentTrackingEvent[];
  created_at: string;
  updated_at: string;
}

export interface ShipmentTrackingEvent {
  id: string;
  shipment_job_id: string;
  event_date: string;
  location: string | null;
  description: string;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentTrackingEventForm {
  event_date: string;
  location: string;
  description: string;
}

export interface ShipmentTrackingEventTemplate {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
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
  company_name: string;
  status: ShipmentStatus;
  trade_mode: TradeMode;
  trade_term: string;
  invoice_number: string;
  transport_mode: TransportMode;
  shipper_name: string;
  consignee_name: string;
  pol_aol: string;
  pod_aod: string;
  vessel_flight_numbers: string[];
  mbl_mawb: string;
  hbl_hawb: string;
  bl_awb_date: string;
  documents: string;
  internal_documents: string;
  document_files: File[];
  internal_document_files: File[];
  tracking_events: ShipmentTrackingEventForm[];
  notes: string;
}

interface UploadedShipmentDocument {
  name: string;
  storagePath: string;
  fileUrl: string;
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
  not_requested: t("documents.approval.notRequested"),
  pending: t("documents.approval.pending"),
  approved: t("documents.approval.approved"),
  rejected: t("documents.approval.rejected"),
};

export const documentApprovalClasses: Record<DocumentApprovalStatus, string> = {
  not_requested: "bg-slate-50 text-slate-700 border-slate-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
};

export const defaultShipmentJobForm: ShipmentJobForm = {
  company_name: "",
  status: "under_process",
  trade_mode: "export",
  trade_term: "CIF",
  invoice_number: "",
  transport_mode: "air",
  shipper_name: "",
  consignee_name: "",
  pol_aol: "",
  pod_aod: "",
  vessel_flight_numbers: [""],
  mbl_mawb: "",
  hbl_hawb: "",
  bl_awb_date: "",
  documents: "",
  internal_documents: "",
  document_files: [],
  internal_document_files: [],
  tracking_events: [],
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
    company_name: job.company_name ?? "",
    status: job.status,
    trade_mode: job.trade_mode,
    trade_term: job.trade_term ?? "",
    invoice_number: job.invoice_number ?? "",
    transport_mode: job.transport_mode ?? "air",
    shipper_name: job.shipper_name ?? "",
    consignee_name: job.consignee_name ?? "",
    pol_aol: job.pol_aol ?? "",
    pod_aod: job.pod_aod ?? "",
    vessel_flight_numbers:
      job.vessel_flight_numbers && job.vessel_flight_numbers.length > 0
        ? job.vessel_flight_numbers
        : [""],
    mbl_mawb: job.mbl_mawb ?? "",
    hbl_hawb: job.hbl_hawb ?? "",
    bl_awb_date: job.bl_awb_date ?? "",
    documents: formatDocumentList(job.documents ?? []),
    internal_documents: formatDocumentList(job.internal_documents ?? []),
    document_files: [],
    internal_document_files: [],
    tracking_events: job.tracking_events?.map((event) => ({
      event_date: event.event_date,
      location: event.location ?? "",
      description: event.description,
    })) ?? [],
    notes: job.notes ?? "",
  };
}

export function formToPayload(form: ShipmentJobForm) {
  return {
    company_name: form.company_name || null,
    status: form.status,
    trade_mode: form.trade_mode,
    trade_term: form.trade_term || null,
    invoice_number: form.invoice_number || null,
    transport_mode: form.transport_mode || null,
    shipper_name: form.shipper_name || null,
    consignee_name: form.consignee_name || null,
    pol_aol: form.pol_aol || null,
    pod_aod: form.pod_aod || null,
    vessel_flight_numbers: form.vessel_flight_numbers
      .map((value) => value.trim())
      .filter(Boolean),
    mbl_mawb: form.mbl_mawb || null,
    hbl_hawb: form.hbl_hawb || null,
    bl_awb_date: form.bl_awb_date || null,
    documents: getDocumentNames(form, "customer"),
    internal_documents: getDocumentNames(form, "internal"),
    notes: form.notes || null,
  };
}

export async function fetchShipmentJobs(): Promise<ShipmentJob[]> {
  const { data: jobsData, error: jobsError } = await supabase
    .from("shipment_jobs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (jobsError) {
    throw jobsError;
  }

  const shipmentJobs = (jobsData ?? []) as Omit<
    ShipmentJob,
    "tracking_events"
  >[];
  const trackingEvents = await fetchShipmentTrackingEvents();
  const trackingEventsByJob = groupTrackingEventsByJob(trackingEvents);

  return shipmentJobs.map((job) => ({
    ...job,
    tracking_events: trackingEventsByJob[job.id] ?? [],
  }));
}

export async function fetchShipmentTrackingEvents(): Promise<
  ShipmentTrackingEvent[]
> {
  const { data, error } = await supabase
    .from("shipment_tracking_events")
    .select("*")
    .is("deleted_at", null)
    .order("event_date", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentTrackingEvent[];
}

export async function fetchShipmentTrackingEventTemplates(): Promise<
  ShipmentTrackingEventTemplate[]
> {
  const { data, error } = await supabase
    .from("shipment_tracking_event_templates")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentTrackingEventTemplate[];
}

export async function fetchShipmentDocuments(): Promise<ShipmentDocument[]> {
  const { data, error } = await supabase
    .from("shipment_documents")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

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
  await replaceShipmentTrackingEvents(data.id, form);
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
  await replaceShipmentTrackingEvents(id, form);
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

export async function downloadShipmentDocument(document: ShipmentDocument) {
  const fileUrl = document.file_url || "/sample-document.pdf";
  const fileName = getDownloadFileName(document);
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Failed to download document: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  window.document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(objectUrl);
}

function getDownloadFileName(document: ShipmentDocument) {
  const hasExtension = /\.[a-z0-9]+$/i.test(document.name);
  return hasExtension ? document.name : `${document.name}.pdf`;
}

async function replaceShipmentDocuments(jobId: string, form: ShipmentJobForm) {
  const existing = await fetchDocumentsForJob(jobId);
  const [customerUploads, internalUploads] = await Promise.all([
    uploadShipmentDocumentFiles(jobId, "customer", form.document_files),
    uploadShipmentDocumentFiles(
      jobId,
      "internal",
      form.internal_document_files,
    ),
  ]);
  const existingByKey = new Map(
    existing.map((document) => [
      documentKey(document.scope, document.name),
      document,
    ]),
  );
  const nextDocuments = [
    ...getDocumentNames(form, "customer").map((name) =>
      buildDocumentPayload(
        jobId,
        "customer",
        name,
        existingByKey,
        customerUploads,
      ),
    ),
    ...getDocumentNames(form, "internal").map((name) =>
      buildDocumentPayload(
        jobId,
        "internal",
        name,
        existingByKey,
        internalUploads,
      ),
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
  uploadedDocuments: UploadedShipmentDocument[],
) {
  const existing = existingByKey.get(documentKey(scope, name));
  const uploaded = uploadedDocuments.find((document) => document.name === name);
  return {
    shipment_job_id: jobId,
    scope,
    name,
    storage_path: uploaded?.storagePath ?? existing?.storage_path ?? null,
    file_url: uploaded?.fileUrl ?? existing?.file_url ?? null,
    approval_status:
      existing?.approval_status ??
      (scope === "internal" ? "approved" : "not_requested"),
    rejection_reason: existing?.rejection_reason ?? null,
    approved_at: existing?.approved_at ?? null,
    approved_by: existing?.approved_by ?? null,
  };
}

function documentKey(scope: DocumentScope, name: string) {
  return `${scope}:${name}`;
}

async function replaceShipmentTrackingEvents(
  jobId: string,
  form: ShipmentJobForm,
) {
  const nextEvents = form.tracking_events
    .map((event, index) => ({
      shipment_job_id: jobId,
      event_date: event.event_date,
      location: event.location.trim() || null,
      description: event.description.trim(),
      sort_order: index,
    }))
    .filter((event) => event.event_date && event.description);

  const { error: deleteError } = await supabase
    .from("shipment_tracking_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("shipment_job_id", jobId);

  if (deleteError) {
    throw deleteError;
  }

  if (!nextEvents.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from("shipment_tracking_events")
    .insert(nextEvents);

  if (insertError) {
    throw insertError;
  }
}

function groupTrackingEventsByJob(events: ShipmentTrackingEvent[]) {
  return events.reduce<Record<string, ShipmentTrackingEvent[]>>(
    (groups, event) => {
      groups[event.shipment_job_id] = [
        ...(groups[event.shipment_job_id] ?? []),
        event,
      ];
      return groups;
    },
    {},
  );
}

function getDocumentNames(form: ShipmentJobForm, scope: DocumentScope) {
  const existingNames =
    scope === "customer"
      ? parseDocumentList(form.documents)
      : parseDocumentList(form.internal_documents);
  const fileNames =
    scope === "customer"
      ? form.document_files.map((file) => file.name)
      : form.internal_document_files.map((file) => file.name);

  return Array.from(new Set([...existingNames, ...fileNames]));
}

async function uploadShipmentDocumentFiles(
  jobId: string,
  scope: DocumentScope,
  files: File[],
): Promise<UploadedShipmentDocument[]> {
  if (!files.length) return [];

  return Promise.all(
    files.map(async (file) => {
      const storagePath = `${jobId}/${scope}/${Date.now()}-${crypto.randomUUID()}-${sanitizeStorageName(file.name)}`;
      const { error } = await supabase.storage
        .from("shipment-documents")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const { data } = supabase.storage
        .from("shipment-documents")
        .getPublicUrl(storagePath);

      return {
        name: file.name,
        storagePath,
        fileUrl: data.publicUrl,
      };
    }),
  );
}

function sanitizeStorageName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, "_");
}
