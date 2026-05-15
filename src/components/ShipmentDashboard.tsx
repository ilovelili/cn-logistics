import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FileStack,
  Plane,
  ShipWheel,
  TrendingUp,
} from "lucide-react";
import ShipmentJobDetailModal from "./ShipmentJobDetailModal";
import { t } from "../lib/i18n";
import {
  getLatestShipmentStatusUpdate,
  getDocumentsForJob,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  TradeMode,
  TransportMode,
  statusAccentClasses,
  statusBadgeClasses,
  statusLabels,
  tradeModeLabels,
  transportModeLabels,
} from "../lib/shipmentJobs";

interface ShipmentDashboardProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  error: string | null;
  onOpenJobs: (status: ShipmentStatus | "all") => void;
  onOpenJobsByTrade: (tradeMode: TradeMode) => void;
  onOpenJobsByTransport: (transportMode: TransportMode) => void;
  onOpenDocuments: (filter?: "all" | "approved") => void;
}

export default function ShipmentDashboard({
  jobs,
  documents,
  loading,
  error,
  onOpenJobs,
  onOpenJobsByTrade,
  onOpenJobsByTransport,
  onOpenDocuments,
}: ShipmentDashboardProps) {
  const [selectedJob, setSelectedJob] = useState<ShipmentJob | null>(null);
  const underProcess = jobs.filter(
    (job) => job.status === "under_process",
  ).length;
  const customsHold = jobs.filter(
    (job) => job.status === "customs_hold",
  ).length;
  const completed = jobs.filter((job) => job.status === "completed").length;
  const approvedDownloads = documents.filter(
    (document) =>
      document.scope === "customer" && document.approval_status === "approved",
  );
  const customerDocuments = documents.filter(
    (document) => document.scope === "customer",
  );
  const tradeCounts = countBy(jobs, (job) => job.trade_mode);
  const transportCounts = countBy(
    jobs,
    (job) => job.transport_mode ?? "unknown",
  );
  const recentJobs = useMemo(
    () =>
      [...jobs]
        .sort(
          (first, second) =>
            new Date(getLatestShipmentStatusUpdate(second).updatedAt).getTime() -
            new Date(getLatestShipmentStatusUpdate(first).updatedAt).getTime(),
        )
        .slice(0, 5),
    [jobs],
  );
  const documentsByJob = useMemo(() => {
    return Object.fromEntries(
      jobs.map((job) => [job.id, getDocumentsForJob(documents, job.id)]),
    ) as Record<string, ShipmentDocument[]>;
  }, [documents, jobs]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("dashboard.title")}
        </h2>
      </div>

      {error && <SetupError error={error} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard
          label={t("dashboard.totalJobs")}
          value={jobs.length}
          icon={<ShipWheel />}
          tone="slate"
          onClick={() => onOpenJobs("all")}
        />
        <MetricCard
          label={t("status.underProcess")}
          value={underProcess}
          icon={<CircleDashed />}
          tone="blue"
          onClick={() => onOpenJobs("under_process")}
        />
        <MetricCard
          label={t("status.customsHold")}
          value={customsHold}
          icon={<AlertTriangle />}
          tone="amber"
          onClick={() => onOpenJobs("customs_hold")}
        />
        <MetricCard
          label={t("status.completed")}
          value={completed}
          icon={<CheckCircle2 />}
          tone="emerald"
          onClick={() => onOpenJobs("completed")}
        />
        <MetricCard
          label={t("documents.approvedDownloads")}
          value={`${approvedDownloads.length} / ${customerDocuments.length}`}
          icon={<FileStack />}
          tone="rose"
          onClick={() => onOpenDocuments("approved")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title={t("dashboard.statusPipeline")}
          icon={<TrendingUp className="h-5 w-5" />}
        >
          <div className="space-y-4">
            {Object.entries(statusLabels).map(([status, label]) => {
              const shipmentStatus = status as ShipmentStatus;
              const count = jobs.filter(
                (job) => job.status === shipmentStatus,
              ).length;
              const width = jobs.length
                ? Math.max((count / jobs.length) * 100, 4)
                : 4;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onOpenJobs(shipmentStatus)}
                  className="block w-full rounded-lg p-2 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 dark:hover:bg-gray-800 dark:focus:ring-gray-800"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {label}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {count}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                    <div
                      className={`h-full rounded-full ${statusAccentClasses[shipmentStatus]}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          title={t("dashboard.tradeMix")}
          icon={<ShipWheel className="h-5 w-5" />}
        >
          <DistributionList
            items={Object.entries(tradeCounts).map(([key, count]) => ({
              label:
                tradeModeLabels[key as keyof typeof tradeModeLabels] ?? key,
              count,
              onClick: () => onOpenJobsByTrade(key as TradeMode),
            }))}
          />
        </Panel>

        <Panel
          title={t("dashboard.transportMix")}
          icon={<Plane className="h-5 w-5" />}
        >
          <DistributionList
            items={Object.entries(transportCounts).map(([key, count]) => ({
              label:
                key === "unknown"
                  ? t("common.unset")
                  : (transportModeLabels[
                      key as keyof typeof transportModeLabels
                    ] ?? key),
              count,
              onClick:
                key === "unknown"
                  ? undefined
                  : () => onOpenJobsByTransport(key as TransportMode),
            }))}
          />
        </Panel>
      </div>

      <Panel
        title={t("dashboard.recentJobs")}
        icon={<FileStack className="h-5 w-5" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.14em] text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="py-3 pr-4">{t("dashboard.previousStatus")}</th>
                <th className="py-3 pr-4">{t("dashboard.currentStatus")}</th>
                <th className="py-3 pr-4">{t("common.invoice")}</th>
                <th className="py-3 pr-4">{t("common.route")}</th>
                <th className="py-3 pr-4">{t("common.parties")}</th>
                <th className="py-3 pr-4">{t("dashboard.statusDays")}</th>
                <th className="py-3">{t("common.documents")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {recentJobs.map((job) => (
                <tr
                  key={job.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => setSelectedJob(job)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedJob(job);
                    }
                  }}
                  className="cursor-pointer text-gray-700 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:text-gray-300 dark:hover:bg-gray-800/70 dark:focus:bg-gray-800"
                >
                  <td className="py-4 pr-4">
                    <StatusPeriodCell job={job} type="previous" />
                  </td>
                  <td className="py-4 pr-4">
                    <StatusPeriodCell job={job} type="current" />
                  </td>
                  <td className="py-4 pr-4 font-semibold text-gray-900 dark:text-white">
                    {job.invoice_number || "-"}
                  </td>
                  <td className="py-4 pr-4">
                    {job.pol_aol || "-"} → {job.pod_aod || "-"}
                  </td>
                  <td className="py-4 pr-4">
                    {job.shipper_name || "-"} / {job.consignee_name || "-"}
                  </td>
                  <td className="whitespace-nowrap py-4 pr-4">
                    <StatusDaysCell job={job} />
                  </td>
                  <td className="py-4">
                    {(job.documents?.length ?? 0) +
                      (job.internal_documents?.length ?? 0)}{" "}
                    件
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentJobs.length === 0 && (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">
              {t("dashboard.noJobs")}
            </div>
          )}
        </div>
      </Panel>
      <ShipmentJobDetailModal
        job={selectedJob}
        documents={selectedJob ? (documentsByJob[selectedJob.id] ?? []) : []}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}

function countBy(jobs: ShipmentJob[], getKey: (job: ShipmentJob) => string) {
  return jobs.reduce<Record<string, number>>((counts, job) => {
    const key = getKey(job);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function StatusPeriodCell({
  job,
  type,
}: {
  job: ShipmentJob;
  type: "previous" | "current";
}) {
  const statusUpdate = getLatestShipmentStatusUpdate(job);
  const period =
    type === "previous"
      ? statusUpdate.previousPeriod
      : statusUpdate.currentPeriod;

  if (!period) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="space-y-1.5">
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[period.status]}`}
      >
        {statusLabels[period.status]}
      </span>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {formatDateRange(period.fromDate, period.toDate)}
      </div>
    </div>
  );
}

function StatusDaysCell({ job }: { job: ShipmentJob }) {
  const statusUpdate = getLatestShipmentStatusUpdate(job);

  return (
    <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
      <StatusDayLine
        label={t("dashboard.previousStatusShort")}
        days={statusUpdate.previousPeriod?.durationDays ?? null}
      />
      <StatusDayLine
        label={t("dashboard.currentStatusShort")}
        days={statusUpdate.currentPeriod.durationDays}
      />
      <StatusDayLine label={t("dashboard.totalShort")} days={statusUpdate.totalDays} bold />
    </div>
  );
}

function StatusDayLine({
  label,
  days,
  bold = false,
}: {
  label: string;
  days: number | null;
  bold?: boolean;
}) {
  return (
    <div className={bold ? "font-bold text-gray-800 dark:text-white" : ""}>
      {label}: {formatWorkingDays(days)}
    </div>
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
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: "slate" | "blue" | "amber" | "emerald" | "rose";
  onClick?: () => void;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
  };

  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`w-full rounded-xl border border-gray-200 bg-white p-6 text-left transition dark:border-gray-800 dark:bg-gray-900 ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-slate-200 dark:hover:border-cyan-700"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {label}
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {value}
          </div>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
    </Component>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function DistributionList({
  items,
}: {
  items: { label: string; count: number; onClick?: () => void }[];
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <button
          type="button"
          key={item.label}
          onClick={item.onClick}
          className="w-full rounded-lg bg-slate-50 p-4 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-100 dark:bg-gray-950 dark:hover:bg-gray-800 dark:focus:ring-gray-800"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {item.label}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {item.count}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-slate-950 dark:bg-cyan-300"
              style={{ width: `${Math.max((item.count / total) * 100, 4)}%` }}
            />
          </div>
        </button>
      ))}
      {items.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {t("common.noData")}
        </div>
      )}
    </div>
  );
}

function SetupError({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-bold">{t("dashboard.setup.title")}</div>
          <p className="mt-1 text-sm">{t("dashboard.setup.body")}</p>
          <p className="mt-2 break-all text-xs text-amber-800">{error}</p>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-gray-800" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-gray-900"
          />
        ))}
      </div>
    </div>
  );
}
