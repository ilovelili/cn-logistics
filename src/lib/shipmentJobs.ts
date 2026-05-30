import { supabase } from "./supabase";
import { t } from "./i18n";

export type LegacyShipmentStatus =
  | "under_process"
  | "customs_hold"
  | "completed";
export type StandardFlowShipmentStatus =
  | "pickup"
  | "warehouse_in"
  | "customs_origin"
  | "terminal_in"
  | "departure"
  | "arrival"
  | "customs_destination"
  | "destination_warehouse_in"
  | "delivery"
  | "delivered";
export type ShipmentStatus = LegacyShipmentStatus | StandardFlowShipmentStatus;
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
  status: ShipmentStatus;
  under_process_from_date: string | null;
  under_process_to_date: string | null;
  customs_hold_from_date: string | null;
  customs_hold_to_date: string | null;
  completed_from_date: string | null;
  completed_to_date: string | null;
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
  assigned_admin_user_ids: string[];
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
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentTrackingEventTemplateForm {
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  color_hex: string;
}

export type ShipmentStatusColorMap = Partial<Record<ShipmentStatus, string>>;

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
  under_process_from_date: string;
  under_process_to_date: string;
  customs_hold_from_date: string;
  customs_hold_to_date: string;
  completed_from_date: string;
  completed_to_date: string;
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
  assigned_admin_user_ids: string[];
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

export const standardFlowStatusOptions: {
  value: StandardFlowShipmentStatus;
  label: string;
}[] = [
  { value: "pickup", label: t("status.pickup") },
  { value: "warehouse_in", label: t("status.warehouseIn") },
  { value: "customs_origin", label: t("status.customsOrigin") },
  { value: "terminal_in", label: t("status.terminalIn") },
  { value: "departure", label: t("status.departure") },
  { value: "arrival", label: t("status.arrival") },
  { value: "customs_destination", label: t("status.customsDestination") },
  {
    value: "destination_warehouse_in",
    label: t("status.destinationWarehouseIn"),
  },
  { value: "delivery", label: t("status.delivery") },
  { value: "delivered", label: t("status.delivered") },
];

export const legacyStatusOptions: {
  value: LegacyShipmentStatus;
  label: string;
}[] = [
  { value: "under_process", label: t("status.underProcess") },
  { value: "customs_hold", label: t("status.customsHold") },
  { value: "completed", label: t("status.completed") },
];

export const statusOptions: { value: ShipmentStatus; label: string }[] = [
  ...standardFlowStatusOptions,
];

export const shipmentStatusOrder: ShipmentStatus[] =
  standardFlowStatusOptions.map((option) => option.value);

export const legacyShipmentStatusPeriodOrder: LegacyShipmentStatus[] = [
  "under_process",
  "customs_hold",
  "completed",
];

export const shipmentStatusDateFields: Record<
  LegacyShipmentStatus,
  { from: keyof ShipmentJob; to: keyof ShipmentJob }
> = {
  under_process: {
    from: "under_process_from_date",
    to: "under_process_to_date",
  },
  customs_hold: {
    from: "customs_hold_from_date",
    to: "customs_hold_to_date",
  },
  completed: {
    from: "completed_from_date",
    to: "completed_to_date",
  },
};

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
  [...standardFlowStatusOptions, ...legacyStatusOptions].map((option) => [
    option.value,
    option.label,
  ]),
) as Record<ShipmentStatus, string>;

export const tradeModeLabels = Object.fromEntries(
  tradeModeOptions.map((option) => [option.value, option.label]),
) as Record<TradeMode, string>;

export const transportModeLabels = Object.fromEntries(
  transportModeOptions.map((option) => [option.value, option.label]),
) as Record<TransportMode, string>;

export const statusBadgeClasses: Record<ShipmentStatus, string> = {
  pickup:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
  warehouse_in:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900",
  customs_origin:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  terminal_in:
    "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-900",
  departure:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-900",
  arrival:
    "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-200 dark:border-cyan-900",
  customs_destination:
    "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900",
  destination_warehouse_in:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-900",
  delivery:
    "bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-950/40 dark:text-lime-200 dark:border-lime-900",
  delivered:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
  under_process:
    "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-900",
  customs_hold:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  completed:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
};

export const statusAccentClasses: Record<ShipmentStatus, string> = {
  pickup: "bg-sky-500",
  warehouse_in: "bg-blue-500",
  customs_origin: "bg-amber-500",
  terminal_in: "bg-indigo-500",
  departure: "bg-violet-500",
  arrival: "bg-cyan-500",
  customs_destination: "bg-rose-500",
  destination_warehouse_in: "bg-teal-500",
  delivery: "bg-lime-500",
  delivered: "bg-emerald-500",
  under_process: "bg-orange-500",
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
  status: "pickup",
  under_process_from_date: "",
  under_process_to_date: "",
  customs_hold_from_date: "",
  customs_hold_to_date: "",
  completed_from_date: "",
  completed_to_date: "",
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
  assigned_admin_user_ids: [],
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
    status: job.status,
    under_process_from_date: job.under_process_from_date ?? "",
    under_process_to_date: job.under_process_to_date ?? "",
    customs_hold_from_date: job.customs_hold_from_date ?? "",
    customs_hold_to_date: job.customs_hold_to_date ?? "",
    completed_from_date: job.completed_from_date ?? "",
    completed_to_date: job.completed_to_date ?? "",
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
    assigned_admin_user_ids: job.assigned_admin_user_ids ?? [],
    documents: formatDocumentList(job.documents ?? []),
    internal_documents: formatDocumentList(job.internal_documents ?? []),
    document_files: [],
    internal_document_files: [],
    tracking_events:
      job.tracking_events?.map((event) => ({
        event_date: event.event_date,
        location: event.location ?? "",
        description: event.description,
      })) ?? [],
    notes: job.notes ?? "",
  };
}

export function formToPayload(form: ShipmentJobForm) {
  return {
    status: form.status,
    under_process_from_date: form.under_process_from_date || null,
    under_process_to_date: form.under_process_to_date || null,
    customs_hold_from_date: form.customs_hold_from_date || null,
    customs_hold_to_date: form.customs_hold_to_date || null,
    completed_from_date: form.completed_from_date || null,
    completed_to_date: form.completed_to_date || null,
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
    assigned_admin_user_ids: form.assigned_admin_user_ids,
    documents: getDocumentNames(form, "customer"),
    internal_documents: getDocumentNames(form, "internal"),
    notes: form.notes || null,
  };
}

export async function fetchShipmentJobs(
  requesterEmail: string,
): Promise<ShipmentJob[]> {
  const { data: jobsData, error: jobsError } = await supabase.rpc(
    "list_accessible_shipment_jobs",
    {
      requester_email: requesterEmail,
    },
  );

  if (jobsError) {
    throw jobsError;
  }

  const shipmentJobs = (jobsData ?? []) as Omit<
    ShipmentJob,
    "tracking_events"
  >[];
  const trackingEvents = await fetchShipmentTrackingEvents(requesterEmail);
  const trackingEventsByJob = groupTrackingEventsByJob(trackingEvents);

  return shipmentJobs.map((job) => ({
    ...job,
    tracking_events: trackingEventsByJob[job.id] ?? [],
  }));
}

export async function fetchShipmentTrackingEvents(
  requesterEmail: string,
): Promise<ShipmentTrackingEvent[]> {
  const { data, error } = await supabase.rpc(
    "list_accessible_shipment_tracking_events",
    {
      requester_email: requesterEmail,
    },
  );

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

export async function fetchAllShipmentTrackingEventTemplates(): Promise<
  ShipmentTrackingEventTemplate[]
> {
  const { data, error } = await supabase
    .from("shipment_tracking_event_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentTrackingEventTemplate[];
}

export async function createShipmentTrackingEventTemplate(
  form: ShipmentTrackingEventTemplateForm,
) {
  const { data, error } = await supabase
    .from("shipment_tracking_event_templates")
    .insert({
      name: form.name.trim(),
      description: form.description.trim(),
      sort_order: form.sort_order,
      is_active: form.is_active,
      color_hex: normalizeStatusColor(form.color_hex),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ShipmentTrackingEventTemplate;
}

export async function updateShipmentTrackingEventTemplate(
  id: string,
  form: ShipmentTrackingEventTemplateForm,
) {
  const { data, error } = await supabase
    .from("shipment_tracking_event_templates")
    .update({
      name: form.name.trim(),
      description: form.description.trim(),
      sort_order: form.sort_order,
      is_active: form.is_active,
      color_hex: normalizeStatusColor(form.color_hex),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ShipmentTrackingEventTemplate;
}

function normalizeStatusColor(value: string) {
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

export async function fetchShipmentDocuments(
  requesterEmail: string,
): Promise<ShipmentDocument[]> {
  const { data, error } = await supabase.rpc(
    "list_accessible_shipment_documents",
    {
      requester_email: requesterEmail,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipmentDocument[];
}

export async function createShipmentJob(form: ShipmentJobForm) {
  const jobId = crypto.randomUUID();
  const { error } = await supabase
    .from("shipment_jobs")
    .insert({ id: jobId, ...formToPayload(form) });

  if (error) {
    throw error;
  }

  await replaceShipmentDocuments(jobId, form);
  await replaceShipmentTrackingEvents(jobId, form);
}

export async function updateShipmentJob(
  id: string,
  form: ShipmentJobForm,
  requesterEmail: string,
) {
  const { error } = await supabase.rpc("update_accessible_shipment_job", {
    requester_email: requesterEmail,
    target_job_id: id,
    job_payload: formToPayload(form),
  });

  if (error) {
    throw error;
  }

  await replaceShipmentDocuments(id, form, requesterEmail);
  await replaceShipmentTrackingEvents(id, form);
}

export async function updateShipmentDocumentApproval(
  id: string,
  approvalStatus: DocumentApprovalStatus,
  requesterEmail?: string,
) {
  if (requesterEmail && approvalStatus === "pending") {
    const { error } = await supabase.rpc(
      "request_accessible_shipment_document_download",
      {
        requester_email: requesterEmail,
        target_document_id: id,
      },
    );

    if (error) {
      throw error;
    }

    return;
  }

  if (
    requesterEmail &&
    (approvalStatus === "approved" || approvalStatus === "rejected")
  ) {
    const { error } = await supabase.rpc(
      "update_accessible_shipment_document_approval",
      {
        requester_email: requesterEmail,
        target_document_id: id,
        next_approval_status: approvalStatus,
      },
    );

    if (error) {
      throw error;
    }

    return;
  }

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

export async function softDeleteShipmentDocument(
  id: string,
  requesterEmail?: string,
) {
  if (requesterEmail) {
    const { error } = await supabase.rpc(
      "soft_delete_accessible_shipment_document",
      {
        requester_email: requesterEmail,
        target_document_id: id,
      },
    );

    if (error) {
      throw error;
    }

    return;
  }

  const { data, error } = await supabase
    .from("shipment_documents")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: requesterEmail?.trim().toLowerCase() || null,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Shipment document was not deleted.");
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

export interface ShipmentStatusPeriod {
  status: ShipmentStatus;
  fromDate: string | null;
  toDate: string | null;
  durationDays: number | null;
}

export interface ShipmentLatestStatusUpdate {
  previousPeriod: ShipmentStatusPeriod | null;
  currentPeriod: ShipmentStatusPeriod;
  updatedAt: string;
  totalDays: number | null;
}

export function getStandardFlowStatusPeriods(job: ShipmentJob) {
  const currentStatus = getStandardFlowStatusForJob(job);
  const currentIndex = standardFlowStatusOptions.findIndex(
    (option) => option.value === currentStatus,
  );

  if (currentIndex < 0) {
    return [];
  }

  const eventsByStatus = getTrackingEventsByStandardStatus(job);

  return standardFlowStatusOptions
    .slice(0, currentIndex + 1)
    .map((option, index): ShipmentStatusPeriod => {
      const currentEvent = eventsByStatus[option.value];
      const nextStatus = standardFlowStatusOptions[index + 1]?.value;
      const nextEvent = nextStatus ? eventsByStatus[nextStatus] : null;
      const fromDate =
        normalizeDateValue(currentEvent?.event_date) ??
        (index === 0 ? normalizeDateValue(job.created_at) : null);
      const toDate = nextEvent ? normalizeDateValue(nextEvent.event_date) : null;
      const effectiveToDate =
        toDate ??
        (option.value === currentStatus ? new Date().toISOString() : null);
      const parsedFromDate = parseDate(fromDate);
      const parsedToDate = parseDate(effectiveToDate);

      return {
        status: option.value,
        fromDate,
        toDate,
        durationDays:
          parsedFromDate && parsedToDate
            ? countWorkingDays(parsedFromDate, parsedToDate)
            : null,
      };
    });
}

export function getShipmentStatusPeriods(job: ShipmentJob) {
  const statusDates = Object.fromEntries(
    legacyShipmentStatusPeriodOrder.map((status) => {
      const fields = shipmentStatusDateFields[status];
      return [
        status,
        {
          fromDate: normalizeDateValue(job[fields.from]),
          toDate: normalizeDateValue(job[fields.to]),
        },
      ];
    }),
  ) as Record<
    LegacyShipmentStatus,
    { fromDate: string | null; toDate: string | null }
  >;

  return legacyShipmentStatusPeriodOrder
    .map((status, index) => {
      const { fromDate, toDate: explicitToDate } = statusDates[status];
      const nextFromDate = legacyShipmentStatusPeriodOrder
        .slice(index + 1)
        .map((nextStatus) => statusDates[nextStatus].fromDate)
        .find(Boolean);
      const toDate =
        explicitToDate ??
        nextFromDate ??
        getFallbackStatusToDate(job, status, fromDate);

      if (!fromDate && !toDate) {
        return null;
      }

      const effectiveFromDate =
        fromDate ?? (status === "under_process" ? job.created_at : null);
      const effectiveToDate =
        toDate ?? (status === job.status ? new Date().toISOString() : null);
      const parsedFromDate = parseDate(effectiveFromDate);
      const parsedToDate = parseDate(effectiveToDate);

      return {
        status: status as ShipmentStatus,
        fromDate: effectiveFromDate,
        toDate:
          explicitToDate ??
          (status === job.status ? null : (nextFromDate ?? null)),
        durationDays:
          parsedFromDate && parsedToDate
            ? countWorkingDays(parsedFromDate, parsedToDate)
            : null,
      };
    })
    .filter((period): period is ShipmentStatusPeriod => Boolean(period));
}

export function getLatestShipmentStatusUpdate(
  job: ShipmentJob,
): ShipmentLatestStatusUpdate {
  const periods = getShipmentStatusPeriods(job);
  const currentPeriod =
    periods.find((period) => period.status === job.status) ??
    buildFallbackCurrentStatusPeriod(job);
  const currentIndex = getShipmentStatusOrderIndex(currentPeriod.status);
  const previousPeriod =
    [...periods]
      .filter(
        (period) => getShipmentStatusOrderIndex(period.status) < currentIndex,
      )
      .sort(compareStatusPeriodsNewestFirst)[0] ?? null;
  const updatedAt =
    currentPeriod.fromDate ?? currentPeriod.toDate ?? job.updated_at;

  return {
    previousPeriod,
    currentPeriod,
    updatedAt,
    totalDays: getShipmentTotalWorkingDays(job),
  };
}

export function getShipmentTotalWorkingDays(job: ShipmentJob) {
  const periods = getShipmentStatusPeriods(job);
  const firstFromDate =
    periods.find((period) => period.fromDate)?.fromDate ?? job.created_at;
  const finalToDate =
    job.completed_to_date ??
    (job.status === "completed" || job.status === "delivered"
      ? job.updated_at
      : new Date().toISOString());
  const startDate = parseDate(firstFromDate);
  const endDate = parseDate(finalToDate);

  if (!startDate || !endDate) {
    return null;
  }

  return countWorkingDays(startDate, endDate);
}

export async function downloadShipmentDocument(
  document: ShipmentDocument,
  options: { allowUnapprovedCustomer?: boolean } = {},
) {
  if (
    document.scope === "customer" &&
    !options.allowUnapprovedCustomer &&
    !isCustomerDocumentDownloadable(document)
  ) {
    throw new Error("Document download is not approved.");
  }

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

function getStandardFlowStatusForJob(
  job: ShipmentJob,
): StandardFlowShipmentStatus {
  if (standardFlowStatusOptions.some((option) => option.value === job.status)) {
    return job.status as StandardFlowShipmentStatus;
  }

  if (job.status === "completed") {
    return "delivered";
  }

  if (job.status === "customs_hold") {
    return "customs_destination";
  }

  return "pickup";
}

function getTrackingEventsByStandardStatus(job: ShipmentJob) {
  const sortedEvents = [...(job.tracking_events ?? [])].sort(
    compareTrackingEventsByFlowOrder,
  );

  return Object.fromEntries(
    standardFlowStatusOptions.map((option, index) => {
      const event = sortedEvents[index];
      return [option.value, event ?? null];
    }),
  ) as Record<StandardFlowShipmentStatus, ShipmentTrackingEvent | null>;
}

function compareTrackingEventsByFlowOrder(
  first: ShipmentTrackingEvent,
  second: ShipmentTrackingEvent,
) {
  return (
    (first.sort_order ?? 0) - (second.sort_order ?? 0) ||
    getTrackingEventTime(first) - getTrackingEventTime(second)
  );
}

function getTrackingEventTime(event: ShipmentTrackingEvent) {
  return Math.max(
    parseDate(event.event_date)?.getTime() ?? 0,
    parseDate(event.updated_at)?.getTime() ?? 0,
    parseDate(event.created_at)?.getTime() ?? 0,
  );
}

function buildFallbackCurrentStatusPeriod(
  job: ShipmentJob,
): ShipmentStatusPeriod {
  const fromDate = job.created_at;
  const toDate =
    job.status === "completed" || job.status === "delivered"
      ? (job.completed_to_date ?? job.updated_at)
      : null;
  const effectiveToDate = toDate ?? new Date().toISOString();
  const parsedFromDate = parseDate(fromDate);
  const parsedToDate = parseDate(effectiveToDate);

  return {
    status: job.status,
    fromDate,
    toDate,
    durationDays:
      parsedFromDate && parsedToDate
        ? countWorkingDays(parsedFromDate, parsedToDate)
        : null,
  };
}

function getFallbackStatusToDate(
  job: ShipmentJob,
  status: ShipmentStatus,
  fromDate: string | null,
) {
  if (
    !fromDate ||
    status !== "completed" ||
    (job.status !== "completed" && job.status !== "delivered")
  ) {
    return null;
  }

  return job.updated_at;
}

function compareStatusPeriodsNewestFirst(
  first: ShipmentStatusPeriod,
  second: ShipmentStatusPeriod,
) {
  return (
    getStatusPeriodTime(second) - getStatusPeriodTime(first) ||
    getShipmentStatusOrderIndex(second.status) -
      getShipmentStatusOrderIndex(first.status)
  );
}

function getShipmentStatusOrderIndex(status: ShipmentStatus) {
  const standardIndex = shipmentStatusOrder.indexOf(status);
  if (standardIndex >= 0) return standardIndex;

  const legacyIndex = legacyShipmentStatusPeriodOrder.indexOf(
    status as LegacyShipmentStatus,
  );
  return legacyIndex >= 0 ? legacyIndex : shipmentStatusOrder.length;
}

function getStatusPeriodTime(period: ShipmentStatusPeriod) {
  return Math.max(
    parseDate(period.toDate)?.getTime() ?? 0,
    parseDate(period.fromDate)?.getTime() ?? 0,
  );
}

function normalizeDateValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

export function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function countWorkingDays(startDate: Date, endDate: Date) {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);

  if (end < start) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function replaceShipmentDocuments(
  jobId: string,
  form: ShipmentJobForm,
  requesterEmail?: string,
) {
  const existing = requesterEmail
    ? await fetchDocumentsForJob(jobId, requesterEmail)
    : [];
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

  if (requesterEmail) {
    const { error } = await supabase.rpc(
      "replace_accessible_shipment_documents",
      {
        requester_email: requesterEmail,
        target_job_id: jobId,
        documents_payload: nextDocuments,
      },
    );

    if (error) {
      throw error;
    }

    return;
  }

  const { error: upsertError } = await supabase
    .from("shipment_documents")
    .upsert(nextDocuments, {
      onConflict: "shipment_job_id,scope,name",
    });

  if (upsertError) {
    throw upsertError;
  }
}

async function fetchDocumentsForJob(
  jobId: string,
  requesterEmail: string,
): Promise<ShipmentDocument[]> {
  const { data, error } = await supabase.rpc(
    "list_accessible_shipment_documents",
    {
      requester_email: requesterEmail,
    },
  );

  if (error) {
    throw error;
  }

  return ((data ?? []) as ShipmentDocument[]).filter(
    (document) => document.shipment_job_id === jobId,
  );
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
    deleted_at: null,
    deleted_by: null,
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
