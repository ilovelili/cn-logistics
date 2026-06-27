import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  FileStack,
  Filter,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import ShipmentJobForm from "./ShipmentJobForm";
import ShipmentJobDetailModal from "./ShipmentJobDetailModal";
import InstantTooltip from "./InstantTooltip";
import LogoMark from "./LogoMark";
import ShipmentJobsTable, {
  ShipmentJobsTableSortKey,
} from "./ShipmentJobsTable";
import {
  buildShipmentJobDocumentsByJob,
  buildShipmentJobSearchText,
  compareShipmentJobSortValues,
  formatShipmentJobShortId,
  getShipmentJobSortValue,
} from "./shipmentJobsTableUtils";
import { SortDirection } from "./SortableTableHeader";
import { t } from "../lib/i18n";
import {
  FeedbackRatingPayload,
  fetchShipmentFeedbackForUser,
  feedbackTargetRoles,
  ShipmentFeedback,
  ShipmentFeedbackTargetRole,
  submitShipmentFeedbackForTargets,
} from "../lib/shipmentFeedback";
import {
  createShipmentJob,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  TradeMode,
  TransportMode,
  statusOptions,
  tradeModeOptions,
  transportModeOptions,
} from "../lib/shipmentJobs";

type StatusFilter = ShipmentStatus | "all";

type FeedbackRatings = FeedbackRatingPayload;
type FeedbackRatingsByTarget = Record<
  ShipmentFeedbackTargetRole,
  FeedbackRatings
>;

interface ShipmentJobsProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  error?: string | null;
  profileEmail: string;
  canManageShipments?: boolean;
  onRefresh: () => Promise<void>;
  statusFilter: StatusFilter;
  tradeFilter: TradeMode | "all";
  transportFilter: TransportMode | "all";
  onStatusFilterChange: (statusFilter: StatusFilter) => void;
  onTradeFilterChange: (tradeFilter: TradeMode | "all") => void;
  onTransportFilterChange: (transportFilter: TransportMode | "all") => void;
}

export default function ShipmentJobs({
  jobs,
  documents,
  loading,
  error,
  profileEmail,
  canManageShipments = false,
  onRefresh,
  statusFilter,
  tradeFilter,
  transportFilter,
  onStatusFilterChange,
  onTradeFilterChange,
  onTransportFilterChange,
}: ShipmentJobsProps) {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<ShipmentJobsTableSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedJob, setSelectedJob] = useState<ShipmentJob | null>(null);
  const [feedbackJob, setFeedbackJob] = useState<ShipmentJob | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackByJob, setFeedbackByJob] = useState<
    Record<string, ShipmentFeedback[]>
  >({});
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesQuery =
        !normalizedQuery ||
        buildShipmentJobSearchText(job).includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" || job.status === statusFilter;
      const matchesTrade =
        tradeFilter === "all" || job.trade_mode === tradeFilter;
      const matchesTransport =
        transportFilter === "all" || job.transport_mode === transportFilter;

      return matchesQuery && matchesStatus && matchesTrade && matchesTransport;
    });
  }, [jobs, query, statusFilter, tradeFilter, transportFilter]);

  const sortedJobs = useMemo(() => {
    if (!sortKey) return filteredJobs;

    return [...filteredJobs].sort((first, second) =>
      compareShipmentJobSortValues(
        getShipmentJobSortValue(first, sortKey),
        getShipmentJobSortValue(second, sortKey),
        sortDirection,
        sortKey,
      ),
    );
  }, [filteredJobs, sortDirection, sortKey]);

  const pageCount = Math.max(Math.ceil(sortedJobs.length / pageSize), 1);
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedJobs = sortedJobs.slice(
    pageStartIndex,
    pageStartIndex + pageSize,
  );
  const visibleFrom = sortedJobs.length ? pageStartIndex + 1 : 0;
  const visibleTo = Math.min(pageStartIndex + pageSize, sortedJobs.length);

  const documentsByJob = useMemo(() => {
    return buildShipmentJobDocumentsByJob(jobs, documents);
  }, [documents, jobs]);
  const summaryStats = useMemo(() => {
    const customsHold = jobs.filter(
      (job) => job.status === "customs_hold",
    ).length;
    const delivered = jobs.filter((job) => job.status === "delivered").length;
    const pendingDocumentApprovals = documents.filter(
      (document) =>
        document.scope === "customer" && document.approval_status === "pending",
    ).length;

    return {
      totalJobs: jobs.length,
      customsHold,
      delivered,
      pendingDocumentApprovals,
    };
  }, [documents, jobs]);

  const showAllJobs = () => {
    onStatusFilterChange("all");
    onTradeFilterChange("all");
    onTransportFilterChange("all");
  };

  const showJobsByStatus = (status: StatusFilter) => {
    onStatusFilterChange(status);
    onTradeFilterChange("all");
    onTransportFilterChange("all");
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    pageSize,
    query,
    sortDirection,
    sortKey,
    statusFilter,
    tradeFilter,
    transportFilter,
  ]);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  useEffect(() => {
    if (!canManageShipments) {
      setShowCreate(false);
    }
  }, [canManageShipments]);

  useEffect(() => {
    let active = true;

    const loadFeedback = async () => {
      setFeedbackLoading(true);
      try {
        const feedback = await fetchShipmentFeedbackForUser(profileEmail);
        if (!active) return;
        setFeedbackByJob(groupFeedbackByJob(feedback));
      } catch {
        if (active) {
          setFeedbackByJob({});
        }
      } finally {
        if (active) {
          setFeedbackLoading(false);
        }
      }
    };

    void loadFeedback();

    return () => {
      active = false;
    };
  }, [profileEmail]);

  useEffect(() => {
    if (feedbackJob && isFeedbackComplete(feedbackByJob[feedbackJob.id])) {
      setFeedbackJob(null);
    }
  }, [feedbackByJob, feedbackJob]);

  const openFeedbackModal = (job: ShipmentJob) => {
    if (feedbackLoading || isFeedbackComplete(feedbackByJob[job.id])) return;
    setFeedbackJob(job);
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCreate = async (
    form: Parameters<typeof createShipmentJob>[0],
  ) => {
    if (!canManageShipments) return;

    setSaving(true);
    try {
      await createShipmentJob(form);
      await onRefresh();
      setShowCreate(false);
      showToast("success", t("admin.entry.created"));
    } catch {
      showToast("error", t("admin.entry.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleSort = (nextSortKey: ShipmentJobsTableSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-[200] flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-2xl ${
            toast.type === "success"
              ? "bg-emerald-500 text-white"
              : "bg-rose-500 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          {toast.message}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t("jobs.title")}
            </h1>
          </div>
          {canManageShipments && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
            >
              <Plus className="h-4 w-4" />
              {t("jobs.new")}
            </button>
          )}
        </div>
        {error && <ShipmentSetupError error={error} />}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ShipmentSummaryCard
            label={t("dashboard.totalJobs")}
            value={loading ? "-" : summaryStats.totalJobs}
            icon={<LogoMark alt="" className="h-5 w-5 rounded-md" />}
            tone="blue"
            onClick={showAllJobs}
          />
          <ShipmentSummaryCard
            label={t("status.customsHold")}
            value={loading ? "-" : summaryStats.customsHold}
            icon={<AlertTriangle className="h-5 w-5" />}
            tone="amber"
            onClick={() => showJobsByStatus("customs_hold")}
          />
          <ShipmentSummaryCard
            label={t("status.delivered")}
            value={loading ? "-" : summaryStats.delivered}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="emerald"
            onClick={() => showJobsByStatus("delivered")}
          />
          <ShipmentSummaryCard
            label={t("documents.pendingApproval")}
            value={loading ? "-" : summaryStats.pendingDocumentApprovals}
            icon={<FileStack className="h-5 w-5" />}
            tone="rose"
            onClick={showAllJobs}
          />
        </div>
      </div>

      {canManageShipments && showCreate && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {t("jobs.createTitle")}
              </h2>
            </div>
          </div>
          <ShipmentJobForm
            submitLabel={t("common.create")}
            loading={saving}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </section>
      )}

      <section
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        data-tutorial-target="shipment-filters"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("jobs.searchPlaceholder")}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:focus:bg-gray-900"
            />
          </div>
          <FilterSelect
            icon={<Filter className="h-4 w-4" />}
            value={statusFilter}
            onChange={(value) => onStatusFilterChange(value as StatusFilter)}
            options={[
              { value: "all", label: t("jobs.filter.allStatus") },
              ...statusOptions,
            ]}
          />
          <FilterSelect
            value={tradeFilter}
            onChange={(value) =>
              onTradeFilterChange(value as TradeMode | "all")
            }
            options={[
              { value: "all", label: t("jobs.filter.allTrade") },
              ...tradeModeOptions,
            ]}
          />
          <FilterSelect
            value={transportFilter}
            onChange={(value) =>
              onTransportFilterChange(value as TransportMode | "all")
            }
            options={[
              { value: "all", label: t("jobs.filter.allTransport") },
              ...transportModeOptions,
            ]}
          />
        </div>
      </section>

      <ShipmentJobsTable
        totalJobs={jobs.length}
        sortedJobs={sortedJobs}
        paginatedJobs={paginatedJobs}
        documentsByJob={documentsByJob}
        loading={loading}
        showInternalDocuments={canManageShipments}
        sortKey={sortKey}
        sortDirection={sortDirection}
        currentPage={safeCurrentPage}
        pageCount={pageCount}
        pageSize={pageSize}
        visibleFrom={visibleFrom}
        visibleTo={visibleTo}
        onSort={handleSort}
        onSelectJob={setSelectedJob}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        requesterEmail={profileEmail}
        onRefresh={onRefresh}
        adminTheme
        approvedDocumentsOnly={!canManageShipments}
      />
      <ShipmentJobDetailModal
        job={selectedJob}
        documents={selectedJob ? (documentsByJob[selectedJob.id] ?? []) : []}
        feedback={
          selectedJob
            ? getFeedbackSummaryForJob(feedbackByJob[selectedJob.id])
            : null
        }
        feedbackLoading={feedbackLoading}
        showInternalDocuments={canManageShipments}
        onOpenFeedback={openFeedbackModal}
        onClose={() => setSelectedJob(null)}
      />
      <FeedbackModal
        job={feedbackJob}
        initialFeedback={feedbackJob ? feedbackByJob[feedbackJob.id] : null}
        saving={feedbackSaving}
        onClose={() => setFeedbackJob(null)}
        onSubmit={async (jobId, feedback) => {
          if (isFeedbackComplete(feedbackByJob[jobId])) {
            setFeedbackJob(null);
            return;
          }

          setFeedbackJob(null);
          setFeedbackSaving(true);
          try {
            const existingFeedback =
              await fetchShipmentFeedbackForUser(profileEmail);
            const existingFeedbackByJob = groupFeedbackByJob(existingFeedback);

            if (isFeedbackComplete(existingFeedbackByJob[jobId])) {
              setFeedbackByJob(existingFeedbackByJob);
              showToast("error", t("feedback.alreadySubmitted"));
              return;
            }

            const existingJobFeedback = existingFeedbackByJob[jobId] ?? [];
            const missingTargetRoles = feedbackTargetRoles.filter(
              (targetRole) =>
                !existingJobFeedback.some(
                  (item) => item.admin_operator_staff_role === targetRole,
                ),
            );
            const savedFeedback = await submitShipmentFeedbackForTargets({
              shipmentJobId: jobId,
              submitterEmail: profileEmail,
              feedbackByTarget: feedback.feedbackByTarget,
              targetRoles: missingTargetRoles,
              reason: feedback.reason,
            });
            setFeedbackByJob((currentFeedback) => ({
              ...currentFeedback,
              [jobId]: [...existingJobFeedback, ...savedFeedback],
            }));
            showToast("success", t("feedback.saved"));
          } catch {
            showToast("error", t("feedback.submitFailed"));
          } finally {
            setFeedbackSaving(false);
          }
        }}
      />
    </div>
  );
}

function ShipmentSummaryCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: "blue" | "amber" | "emerald" | "rose";
  onClick?: () => void;
}) {
  const tones = {
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    amber:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    emerald:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  };
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition dark:border-gray-800 dark:bg-gray-950 ${
        onClick
          ? "hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-slate-100 dark:hover:border-cyan-700 dark:focus:ring-gray-800"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {value}
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {label}
          </div>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
    </Component>
  );
}

function ShipmentSetupError({ error }: { error: string }) {
  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-bold">{t("dashboard.setup.title")}</div>
          <p className="mt-1 text-sm">{t("dashboard.setup.body")}</p>
          <p className="mt-2 break-all text-xs">{error}</p>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  icon,
  value,
  options,
  onChange,
}: {
  icon?: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pr-4 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:focus:bg-gray-900 ${icon ? "pl-10" : "pl-4"}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FeedbackModal({
  job,
  initialFeedback,
  saving,
  onClose,
  onSubmit,
}: {
  job: ShipmentJob | null;
  initialFeedback?: ShipmentFeedback[] | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    jobId: string,
    feedback: {
      feedbackByTarget: FeedbackRatingsByTarget;
      reason: string;
    },
  ) => Promise<void>;
}) {
  type PendingFeedbackSubmission = {
    feedbackByTarget: FeedbackRatingsByTarget;
    reason: string;
  };

  const [feedbackByTarget, setFeedbackByTarget] =
    useState<FeedbackRatingsByTarget>(() =>
      getInitialFeedbackRatingsByTarget(initialFeedback),
    );
  const [reason, setReason] = useState(initialFeedback?.[0]?.reason ?? "");
  const [pendingFeedback, setPendingFeedback] =
    useState<PendingFeedbackSubmission | null>(null);

  useEffect(() => {
    setFeedbackByTarget(getInitialFeedbackRatingsByTarget(initialFeedback));
    setReason(initialFeedback?.[0]?.reason ?? "");
    setPendingFeedback(null);
  }, [initialFeedback, job?.id]);

  if (!job) {
    return null;
  }

  const title =
    job.invoice_number || job.mbl_mawb || formatShipmentJobShortId(job.id);
  const isAlreadySubmitted = isFeedbackComplete(initialFeedback);
  const isComplete = isFeedbackByTargetComplete(feedbackByTarget);
  const feedbackCategories = [
    {
      key: "attitudeRating" as const,
      label: t("feedback.attitude"),
    },
    {
      key: "professionalismRating" as const,
      label: t("feedback.professionalism"),
    },
    {
      key: "speedRating" as const,
      label: t("feedback.speed"),
    },
    {
      key: "accuracyRating" as const,
      label: t("feedback.accuracy"),
    },
    {
      key: "priceRating" as const,
      label: t("feedback.price"),
    },
  ];
  const setCategoryRating = (
    targetRole: ShipmentFeedbackTargetRole,
    key: keyof FeedbackRatings,
    ratingValue: number,
  ) => {
    setFeedbackByTarget((currentFeedback) => ({
      ...currentFeedback,
      [targetRole]: {
        ...currentFeedback[targetRole],
        [key]: ratingValue,
      },
    }));
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("feedback.title")}
      onMouseDown={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">
              {t("feedback.title")}
            </h2>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
              {t("common.jobNumber")}: {job.job_number || "-"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label={t("feedback.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="max-h-[calc(90vh-112px)] space-y-6 overflow-y-auto p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isComplete || isAlreadySubmitted) return;
            setPendingFeedback({
              feedbackByTarget,
              reason: reason.trim(),
            });
          }}
        >
          <div className="space-y-6">
            {feedbackTargetRoleOptions.map((option) => (
              <section
                key={option.value}
                className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <h3 className="text-sm font-black text-gray-900 dark:text-white">
                  {t(option.labelKey)}
                </h3>
                <div className="mt-4 space-y-4">
                  {feedbackCategories.map((category) => (
                    <StarRatingInput
                      key={category.key}
                      label={category.label}
                      value={feedbackByTarget[option.value][category.key]}
                      disabled={isAlreadySubmitted}
                      onChange={(ratingValue) =>
                        setCategoryRating(
                          option.value,
                          category.key,
                          ratingValue,
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-black text-gray-900 dark:text-white">
              {t("feedback.reason")}
            </span>
            <textarea
              value={reason}
              readOnly={isAlreadySubmitted}
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              placeholder={t("feedback.reasonPlaceholder")}
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 read-only:cursor-not-allowed read-only:text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:focus:bg-gray-900"
            />
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-5 py-3 font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!isComplete || saving || isAlreadySubmitted}
              className="rounded-lg bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAlreadySubmitted
                ? t("feedback.submitted")
                : saving
                  ? t("common.saving")
                  : t("feedback.submit")}
            </button>
          </div>
        </form>
      </div>
      {pendingFeedback && (
        <FeedbackSubmitConfirmModal
          submitting={saving}
          title={title}
          jobNumber={job.job_number}
          onCancel={() => setPendingFeedback(null)}
          onConfirm={() => {
            void onSubmit(job.id, pendingFeedback);
            setPendingFeedback(null);
          }}
        />
      )}
    </div>
  );
}

function FeedbackSubmitConfirmModal({
  submitting,
  title,
  jobNumber,
  onCancel,
  onConfirm,
}: {
  submitting: boolean;
  title: string;
  jobNumber: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("feedback.confirmTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("feedback.confirmBody")}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
          <div className="font-bold text-gray-900 dark:text-white">{title}</div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("common.jobNumber")}: {jobNumber || "-"}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("feedback.confirmTargets")}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t("common.saving") : t("feedback.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function getEmptyFeedbackRatings(): FeedbackRatings {
  return {
    attitudeRating: 0,
    professionalismRating: 0,
    speedRating: 0,
    accuracyRating: 0,
    priceRating: 0,
  };
}

function getInitialFeedbackRatingsByTarget(
  feedback?: ShipmentFeedback[] | null,
): FeedbackRatingsByTarget {
  return feedbackTargetRoles.reduce((ratingsByTarget, targetRole) => {
    const targetFeedback = feedback?.find(
      (item) => item.admin_operator_staff_role === targetRole,
    );

    ratingsByTarget[targetRole] = targetFeedback
      ? getFeedbackRatings(targetFeedback)
      : getEmptyFeedbackRatings();

    return ratingsByTarget;
  }, {} as FeedbackRatingsByTarget);
}

function getFeedbackRatings(feedback: ShipmentFeedback): FeedbackRatings {
  return {
    attitudeRating: feedback?.attitude_rating ?? 0,
    professionalismRating: feedback?.professionalism_rating ?? 0,
    speedRating: feedback?.speed_rating ?? 0,
    accuracyRating: feedback?.accuracy_rating ?? 0,
    priceRating: feedback?.price_rating ?? 0,
  };
}

const feedbackTargetRoleOptions: {
  value: ShipmentFeedbackTargetRole;
  labelKey:
    | "superAdmin.operators.staffRole.sales"
    | "superAdmin.operators.staffRole.operations";
}[] = [
  { value: "sales", labelKey: "superAdmin.operators.staffRole.sales" },
  {
    value: "operations",
    labelKey: "superAdmin.operators.staffRole.operations",
  },
];

function groupFeedbackByJob(feedback: ShipmentFeedback[]) {
  return feedback.reduce<Record<string, ShipmentFeedback[]>>(
    (grouped, item) => {
      grouped[item.shipment_job_id] = [
        ...(grouped[item.shipment_job_id] ?? []),
        item,
      ];
      return grouped;
    },
    {},
  );
}

function isFeedbackComplete(feedback?: ShipmentFeedback[] | null) {
  return feedbackTargetRoles.every((targetRole) =>
    feedback?.some((item) => item.admin_operator_staff_role === targetRole),
  );
}

function isFeedbackByTargetComplete(feedbackByTarget: FeedbackRatingsByTarget) {
  return feedbackTargetRoles.every((targetRole) =>
    Object.values(feedbackByTarget[targetRole]).every((rating) => rating > 0),
  );
}

function getFeedbackSummaryForJob(feedback?: ShipmentFeedback[]) {
  if (!feedback?.length || !isFeedbackComplete(feedback)) {
    return null;
  }

  const [firstFeedback] = feedback;
  return {
    ...firstFeedback,
    attitude_rating: averageFeedbackRating(feedback, "attitude_rating"),
    professionalism_rating: averageFeedbackRating(
      feedback,
      "professionalism_rating",
    ),
    speed_rating: averageFeedbackRating(feedback, "speed_rating"),
    accuracy_rating: averageFeedbackRating(feedback, "accuracy_rating"),
    price_rating: averageFeedbackRating(feedback, "price_rating"),
  };
}

function averageFeedbackRating(
  feedback: ShipmentFeedback[],
  key:
    | "attitude_rating"
    | "professionalism_rating"
    | "speed_rating"
    | "accuracy_rating"
    | "price_rating",
) {
  return (
    feedback.reduce((total, item) => total + item[key], 0) / feedback.length
  );
}

function StarRatingInput({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (rating: number) => void;
}) {
  return (
    <div>
      <div className="text-sm font-black text-gray-900 dark:text-white">
        {label}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <InstantTooltip
            key={star}
            label={`${label}: ${t("feedback.star", { count: star })}`}
          >
            {(tooltipId) => (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(star)}
                className={`rounded-xl p-2 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:hover:bg-amber-950/40 ${
                  star <= value
                    ? "text-amber-400"
                    : "text-gray-300 dark:text-gray-700"
                }`}
                aria-label={`${label}: ${t("feedback.star", { count: star })}`}
                aria-describedby={tooltipId}
              >
                <Star
                  className="h-7 w-7"
                  fill={star <= value ? "currentColor" : "none"}
                />
              </button>
            )}
          </InstantTooltip>
        ))}
        <span className="ml-1 text-sm font-bold text-gray-500 dark:text-gray-400">
          {value ? t("feedback.ratingValue", { rating: value }) : "-"}
        </span>
      </div>
    </div>
  );
}
