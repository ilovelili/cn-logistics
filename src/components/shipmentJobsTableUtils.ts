import {
  getDocumentsForJob,
  ShipmentDocument,
  ShipmentJob,
  statusLabels,
  tradeModeLabels,
  transportModeLabels,
} from "../lib/shipmentJobs";
import type { SortDirection } from "./SortableTableHeader";
import type { ShipmentJobsTableSortKey } from "./ShipmentJobsTable";

export function buildShipmentJobSearchText(job: ShipmentJob) {
  return [
    job.id,
    formatShipmentJobShortId(job.id),
    job.invoice_number,
    job.shipper_name,
    job.consignee_name,
    job.pol_aol,
    job.pod_aod,
    ...(job.vessel_flight_numbers ?? []),
    job.mbl_mawb,
    job.hbl_hawb,
    ...(job.tracking_events ?? []).flatMap((event) => [
      event.event_date,
      event.location,
      event.description,
    ]),
    ...(job.documents ?? []),
    ...(job.internal_documents ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getShipmentJobSortValue(
  job: ShipmentJob,
  sortKey: ShipmentJobsTableSortKey,
) {
  switch (sortKey) {
    case "id":
      return job.id;
    case "status":
      return statusLabels[job.status];
    case "working_days":
      return getShipmentJobWorkingDays(job)?.toString() ?? "";
    case "trade":
      return `${tradeModeLabels[job.trade_mode]} ${job.trade_term ?? ""}`;
    case "transport_mode":
      return job.transport_mode ? transportModeLabels[job.transport_mode] : "";
    case "invoice_number":
    case "shipper_name":
    case "consignee_name":
    case "pol_aol":
    case "pod_aod":
      return job[sortKey] ?? "";
    case "vessel_flight_numbers":
      return (job.vessel_flight_numbers ?? []).join(" ");
    case "mbl_mawb":
    case "hbl_hawb":
    case "bl_awb_date":
      return job[sortKey] ?? "";
  }
}

export function compareShipmentJobSortValues(
  first: string,
  second: string,
  direction: SortDirection,
  sortKey: ShipmentJobsTableSortKey,
) {
  if (sortKey === "working_days") {
    const firstNumber = first ? Number(first) : Number.NaN;
    const secondNumber = second ? Number(second) : Number.NaN;

    if (Number.isNaN(firstNumber) && Number.isNaN(secondNumber)) return 0;
    if (Number.isNaN(firstNumber)) return 1;
    if (Number.isNaN(secondNumber)) return -1;

    return direction === "asc"
      ? firstNumber - secondNumber
      : secondNumber - firstNumber;
  }

  if (
    sortKey === "invoice_number" ||
    sortKey === "vessel_flight_numbers" ||
    sortKey === "mbl_mawb" ||
    sortKey === "hbl_hawb" ||
    sortKey === "bl_awb_date"
  ) {
    return compareNonPinnedValues(first, second, direction);
  }

  const firstIsEmpty = first.trim() === "";
  const secondIsEmpty = second.trim() === "";

  if (firstIsEmpty && secondIsEmpty) return 0;
  if (firstIsEmpty) return 1;
  if (secondIsEmpty) return -1;

  const comparison = first.localeCompare(second, "ja-JP", {
    numeric: true,
    sensitivity: "base",
  });

  return direction === "asc" ? comparison : -comparison;
}

export function formatShipmentJobShortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function buildShipmentJobDocumentsByJob(
  jobs: ShipmentJob[],
  documents: ShipmentDocument[],
) {
  return Object.fromEntries(
    jobs.map((job) => [job.id, getDocumentsForJob(documents, job.id)]),
  ) as Record<string, ShipmentDocument[]>;
}

export function getShipmentJobWorkingDays(job: ShipmentJob) {
  if (job.status !== "under_process" && job.status !== "completed") {
    return null;
  }

  const startDate = parseDate(job.created_at);
  const endDate =
    job.status === "completed" ? parseDate(job.updated_at) : new Date();

  if (!startDate || !endDate) {
    return null;
  }

  return countWorkingDays(startDate, endDate);
}

function compareNonPinnedValues(
  first: string,
  second: string,
  direction: SortDirection,
) {
  const comparison = first.localeCompare(second, "ja-JP", {
    numeric: true,
    sensitivity: "base",
  });

  return direction === "asc" ? comparison : -comparison;
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countWorkingDays(startDate: Date, endDate: Date) {
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
