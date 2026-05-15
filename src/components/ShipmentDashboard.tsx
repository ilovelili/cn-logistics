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
  onOpenDocuments: (filter?: "all" | "approved") => void;
}

export default function ShipmentDashboard({
  jobs,
  documents,
  loading,
  error,
  onOpenJobs,
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
    <div className="space-y-8">
      <div className="rounded-[2rem] border border-slate-800 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/20 overflow-hidden relative">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-32 bottom-0 h-48 w-48 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative">
          <div>
            <h1 className="text-4xl font-black tracking-tight">
              {t("dashboard.title")}
            </h1>
          </div>
        </div>
      </div>

      {error && <SetupError error={error} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              const count = jobs.filter((job) => job.status === status).length;
              const width = jobs.length
                ? Math.max((count / jobs.length) * 100, 4)
                : 4;
              return (
                <div key={status}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">
                      {label}
                    </span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${statusAccentClasses[status as keyof typeof statusAccentClasses]}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
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
              <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                <th className="py-3 pr-4">{t("dashboard.previousStatus")}</th>
                <th className="py-3 pr-4">{t("dashboard.currentStatus")}</th>
                <th className="py-3 pr-4">{t("common.invoice")}</th>
                <th className="py-3 pr-4">{t("common.route")}</th>
                <th className="py-3 pr-4">{t("common.parties")}</th>
                <th className="py-3 pr-4">{t("dashboard.statusDays")}</th>
                <th className="py-3">{t("common.documents")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
                  className="cursor-pointer text-slate-700 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <td className="py-4 pr-4">
                    <StatusPeriodCell job={job} type="previous" />
                  </td>
                  <td className="py-4 pr-4">
                    <StatusPeriodCell job={job} type="current" />
                  </td>
                  <td className="py-4 pr-4 font-semibold text-slate-950">
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
            <div className="py-12 text-center text-slate-500">
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
      <div className="text-xs text-slate-500">
        {formatDateRange(period.fromDate, period.toDate)}
      </div>
    </div>
  );
}

function StatusDaysCell({ job }: { job: ShipmentJob }) {
  const statusUpdate = getLatestShipmentStatusUpdate(job);

  return (
    <div className="space-y-1 text-xs text-slate-600">
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
    <div className={bold ? "font-bold text-slate-800" : ""}>
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
      className={`w-full rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-slate-200"
          : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone]}`}
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
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DistributionList({
  items,
}: {
  items: { label: string; count: number }[];
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">{item.label}</span>
            <span className="text-slate-500">{item.count}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-slate-950"
              style={{ width: `${Math.max((item.count / total) * 100, 4)}%` }}
            />
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-sm text-slate-500">{t("common.noData")}</div>
      )}
    </div>
  );
}

function SetupError({ error }: { error: string }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
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
      <div className="h-64 animate-pulse rounded-[2rem] bg-slate-200" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-3xl bg-slate-100"
          />
        ))}
      </div>
    </div>
  );
}
