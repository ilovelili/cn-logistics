import {
  CalendarDays,
  Download,
  FileText,
  MapPin,
  Star,
  X,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  getShipmentFeedbackSummaryRating,
  ShipmentFeedback,
} from "../lib/shipmentFeedback";
import {
  documentApprovalClasses,
  documentApprovalLabels,
  downloadShipmentDocument,
  getStandardFlowStatusPeriods,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatusPeriod,
  statusBadgeClasses,
  statusLabels,
  tradeModeLabels,
  transportModeLabels,
} from "../lib/shipmentJobs";
import InstantTooltip from "./InstantTooltip";

interface ShipmentJobDetailModalProps {
  job: ShipmentJob | null;
  documents: ShipmentDocument[];
  feedback?: ShipmentFeedback | null;
  feedbackLoading?: boolean;
  showInternalDocuments?: boolean;
  onOpenFeedback?: (job: ShipmentJob) => void;
  onClose: () => void;
}

export default function ShipmentJobDetailModal({
  job,
  documents,
  feedback,
  feedbackLoading = false,
  showInternalDocuments = false,
  onOpenFeedback,
  onClose,
}: ShipmentJobDetailModalProps) {
  if (!job) {
    return null;
  }

  const internalDocuments = documents.filter(
    (document) => document.scope === "internal",
  );
  const statusPeriods = getStandardFlowStatusPeriods(job);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("jobs.detail.title")}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white">
                {job.invoice_number || job.mbl_mawb || t("jobs.detail.title")}
              </h2>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[job.status]}`}
              >
                {statusLabels[job.status]}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
              {job.shipper_name || "-"} → {job.consignee_name || "-"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenFeedback && (
              <button
                type="button"
                disabled={feedbackLoading || Boolean(feedback)}
                onClick={() => {
                  if (!feedbackLoading && !feedback) {
                    onOpenFeedback(job);
                  }
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition ${
                  feedbackLoading || feedback
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                <Star
                  className={`h-4 w-4 ${
                    feedbackLoading || feedback
                      ? "text-slate-400"
                      : "text-slate-400"
                  }`}
                  fill={feedbackLoading || feedback ? "currentColor" : "none"}
                />
                {feedbackLoading
                  ? t("common.loadingFeedback")
                  : feedback
                    ? t("feedback.ratingValue", {
                        rating:
                          getShipmentFeedbackSummaryRating(feedback).toFixed(1),
                      })
                    : t("feedback.open")}
              </button>
            )}
            <InstantTooltip label={t("jobs.detail.close")}>
              {(tooltipId) => (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                  aria-label={t("jobs.detail.close")}
                  aria-describedby={tooltipId}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </InstantTooltip>
          </div>
        </div>

        <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <DetailCard title={t("jobs.detail.shipment")}>
              <DetailField
                label={t("common.tradeMode")}
                value={tradeModeLabels[job.trade_mode]}
              />
              <DetailField
                label={t("common.tradeTerm")}
                value={job.trade_term}
              />
              <DetailField
                label={t("common.transportMode")}
                value={
                  job.transport_mode
                    ? transportModeLabels[job.transport_mode]
                    : null
                }
              />
              <DetailField
                label={t("common.blAwbDate")}
                value={job.bl_awb_date}
              />
            </DetailCard>

            <DetailCard title={t("jobs.detail.route")}>
              <DetailField label="POL/AOL" value={job.pol_aol} />
              <DetailField label="POD/AOD" value={job.pod_aod} />
              <DetailField
                label={t("common.vesselFlightNo")}
                value={formatVesselFlightNumbers(job.vessel_flight_numbers)}
              />
              <DetailField label="MBL/MAWB" value={job.mbl_mawb} />
              <DetailField label="HBL/HAWB" value={job.hbl_hawb} />
            </DetailCard>

            <DetailCard title={t("jobs.detail.parties")}>
              <DetailField
                label={t("common.shipper")}
                value={job.shipper_name}
              />
              <DetailField
                label={t("common.consignee")}
                value={job.consignee_name}
              />
              <DetailField
                label={t("common.invoice")}
                value={job.invoice_number}
              />
              <DetailField
                label={t("common.jobNumber")}
                value={job.job_number}
              />
              <DetailField label={t("common.notes")} value={job.notes} />
            </DetailCard>
          </div>

          <StatusPeriodTimeline periods={statusPeriods} />

          <TrackingTimeline events={job.tracking_events} />

          {showInternalDocuments && (
            <div className="mt-6">
              <DocumentSection
                title={t("common.internalDocuments")}
                documents={internalDocuments}
                muted
                canDownload={() => true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatVesselFlightNumbers(values?: string[] | null) {
  const filteredValues = values?.filter(Boolean) ?? [];

  if (filteredValues.length === 0) {
    return null;
  }

  return filteredValues
    .map((value, index) => `${index + 1}. ${value}`)
    .join("\n");
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <h3 className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 whitespace-pre-line text-sm font-semibold text-gray-900 dark:text-white">
        {value || "-"}
      </div>
    </div>
  );
}

function StatusPeriodTimeline({
  periods,
}: {
  periods: ShipmentStatusPeriod[];
}) {
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <h3 className="mb-4 text-lg font-black text-gray-900 dark:text-white">
        {t("form.statusPeriods")}
      </h3>
      {periods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("common.noData")}
        </div>
      ) : (
        <div className="space-y-3">
          {periods.map((period, index) => {
            const isCurrent = index === periods.length - 1;
            return (
              <div
                key={period.status}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      isCurrent
                        ? "bg-cyan-600 text-white"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[period.status]}`}
                      >
                        {statusLabels[period.status]}
                      </span>
                      {isCurrent && (
                        <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">
                          {t("dashboard.currentStatusShort")}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {formatDateRange(period.fromDate, period.toDate)}
                    </div>
                  </div>
                </div>
                <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
                  {t("common.workingDaysSpent")}:{" "}
                  {formatWorkingDays(period.durationDays)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TrackingTimeline({
  events,
}: {
  events: ShipmentJob["tracking_events"];
}) {
  const groupedEvents = groupTrackingEventsByDate(events ?? []);

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <h3 className="mb-4 text-lg font-black text-gray-900 dark:text-white">
        {t("tracking.title")}
      </h3>
      {groupedEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("tracking.noEvents")}
        </div>
      ) : (
        <div className="space-y-5">
          {groupedEvents.map(([date, dateEvents]) => (
            <div key={date} className="relative pl-8">
              <div className="absolute left-2 top-1 h-full w-px bg-gray-200 dark:bg-gray-800" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                </span>
                <div className="text-sm font-black text-gray-900 dark:text-white">
                  {new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                </div>
              </div>
              <div className="space-y-3">
                {dateEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
                  >
                    {event.location && (
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </div>
                    )}
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                      {event.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatWorkingDays(days: number | null) {
  return typeof days === "number" ? `${days}営業日` : "-";
}

function formatDateRange(fromDate: string | null, toDate: string | null) {
  const from = formatDate(fromDate);
  const to = formatDate(toDate);

  if (from && to) {
    return `${from} - ${to}`;
  }

  if (from) {
    return `${from} -`;
  }

  if (to) {
    return `- ${to}`;
  }

  return "-";
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function groupTrackingEventsByDate(events: ShipmentJob["tracking_events"]) {
  const groups = events.reduce<Record<string, ShipmentJob["tracking_events"]>>(
    (currentGroups, event) => {
      currentGroups[event.event_date] = [
        ...(currentGroups[event.event_date] ?? []),
        event,
      ];
      return currentGroups;
    },
    {},
  );

  return Object.entries(groups).sort(([firstDate], [secondDate]) =>
    secondDate.localeCompare(firstDate),
  );
}

function DocumentSection({
  title,
  documents,
  muted = false,
  canDownload,
}: {
  title: string;
  documents: ShipmentDocument[];
  muted?: boolean;
  canDownload: (document: ShipmentDocument) => boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <h3 className="mb-4 text-lg font-black text-gray-900 dark:text-white">
        {title}
      </h3>
      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("common.noData")}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((document) => {
            const downloadable = canDownload(document);
            return (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText
                      className={`h-4 w-4 shrink-0 ${muted ? "text-gray-400 dark:text-gray-500" : "text-cyan-700 dark:text-cyan-300"}`}
                    />
                    <span
                      className="truncate text-sm font-bold text-gray-900 dark:text-white"
                      title={document.name}
                    >
                      {document.name}
                    </span>
                  </div>
                  <span
                    className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${documentApprovalClasses[document.approval_status]}`}
                  >
                    {documentApprovalLabels[document.approval_status]}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!downloadable}
                  onClick={() => void downloadShipmentDocument(document)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadable
                    ? t("common.download")
                    : t("documents.downloadLocked")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
