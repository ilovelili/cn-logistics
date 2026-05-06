import { useEffect, useMemo, useState } from "react";
import { Filter, Plus, Search, Star, X } from "lucide-react";
import ShipmentJobForm from "./ShipmentJobForm";
import ShipmentJobDetailModal from "./ShipmentJobDetailModal";
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
import { useAdminAuth } from "../admin/useAdminAuth";
import {
  fetchShipmentFeedbackForUser,
  ShipmentFeedback,
  submitShipmentFeedback,
} from "../lib/shipmentFeedback";
import {
  createShipmentJob,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  statusOptions,
  tradeModeOptions,
  transportModeOptions,
} from "../lib/shipmentJobs";

type StatusFilter = ShipmentStatus | "all";

type FeedbackRatings = {
  attitudeRating: number;
  speedRating: number;
  accuracyRating: number;
  priceRating: number;
};

interface ShipmentJobsProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  profileEmail: string;
  onRefresh: () => Promise<void>;
  statusFilter: StatusFilter;
  onStatusFilterChange: (statusFilter: StatusFilter) => void;
}

export default function ShipmentJobs({
  jobs,
  documents,
  loading,
  profileEmail,
  onRefresh,
  statusFilter,
  onStatusFilterChange,
}: ShipmentJobsProps) {
  const { isAdminAuthenticated } = useAdminAuth();
  const [query, setQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [transportFilter, setTransportFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<ShipmentJobsTableSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedJob, setSelectedJob] = useState<ShipmentJob | null>(null);
  const [feedbackJob, setFeedbackJob] = useState<ShipmentJob | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackByJob, setFeedbackByJob] = useState<
    Record<string, ShipmentFeedback>
  >({});

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
    if (!isAdminAuthenticated) {
      setShowCreate(false);
    }
  }, [isAdminAuthenticated]);

  useEffect(() => {
    let active = true;

    const loadFeedback = async () => {
      try {
        const feedback = await fetchShipmentFeedbackForUser(profileEmail);
        if (!active) return;
        setFeedbackByJob(
          Object.fromEntries(
            feedback.map((item) => [item.shipment_job_id, item]),
          ),
        );
      } catch {
        if (active) {
          setFeedbackByJob({});
        }
      }
    };

    void loadFeedback();

    return () => {
      active = false;
    };
  }, [profileEmail]);

  const handleCreate = async (
    form: Parameters<typeof createShipmentJob>[0],
  ) => {
    if (!isAdminAuthenticated) return;

    setSaving(true);
    try {
      await createShipmentJob(form);
      await onRefresh();
      setShowCreate(false);
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
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-950">
              {t("jobs.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-slate-500">
              {t("jobs.description")}
            </p>
          </div>
          {isAdminAuthenticated && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              {t("jobs.new")}
            </button>
          )}
        </div>
      </div>

      {isAdminAuthenticated && showCreate && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
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

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("jobs.searchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
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
            onChange={setTradeFilter}
            options={[
              { value: "all", label: t("jobs.filter.allTrade") },
              ...tradeModeOptions,
            ]}
          />
          <FilterSelect
            value={transportFilter}
            onChange={setTransportFilter}
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
        showInternalDocuments={isAdminAuthenticated}
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
      />
      <ShipmentJobDetailModal
        job={selectedJob}
        documents={selectedJob ? (documentsByJob[selectedJob.id] ?? []) : []}
        feedback={selectedJob ? feedbackByJob[selectedJob.id] : null}
        onOpenFeedback={(job) => setFeedbackJob(job)}
        onClose={() => setSelectedJob(null)}
      />
      <FeedbackModal
        job={feedbackJob}
        initialFeedback={feedbackJob ? feedbackByJob[feedbackJob.id] : null}
        saving={feedbackSaving}
        onClose={() => setFeedbackJob(null)}
        onSubmit={async (jobId, feedback) => {
          setFeedbackJob(null);
          setFeedbackSaving(true);
          try {
            const savedFeedback = await submitShipmentFeedback({
              shipmentJobId: jobId,
              submitterEmail: profileEmail,
              attitudeRating: feedback.attitudeRating,
              speedRating: feedback.speedRating,
              accuracyRating: feedback.accuracyRating,
              priceRating: feedback.priceRating,
              reason: feedback.reason,
            });
            setFeedbackByJob((currentFeedback) => ({
              ...currentFeedback,
              [jobId]: savedFeedback,
            }));
          } finally {
            setFeedbackSaving(false);
          }
        }}
      />
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
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 ${icon ? "pl-10" : "pl-4"}`}
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
  initialFeedback?: ShipmentFeedback | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    jobId: string,
    feedback: FeedbackRatings & { reason: string },
  ) => Promise<void>;
}) {
  const [ratings, setRatings] = useState<FeedbackRatings>(() =>
    getInitialFeedbackRatings(initialFeedback),
  );
  const [reason, setReason] = useState(initialFeedback?.reason ?? "");

  useEffect(() => {
    setRatings(getInitialFeedbackRatings(initialFeedback));
    setReason(initialFeedback?.reason ?? "");
  }, [initialFeedback, job?.id]);

  if (!job) {
    return null;
  }

  const title =
    job.invoice_number || job.mbl_mawb || formatShipmentJobShortId(job.id);
  const summaryRating =
    (ratings.attitudeRating +
      ratings.speedRating +
      ratings.accuracyRating +
      ratings.priceRating) /
    4;
  const isComplete = Object.values(ratings).every((rating) => rating > 0);
  const feedbackCategories = [
    {
      key: "attitudeRating" as const,
      label: t("feedback.attitude"),
      value: ratings.attitudeRating,
    },
    {
      key: "speedRating" as const,
      label: t("feedback.speed"),
      value: ratings.speedRating,
    },
    {
      key: "accuracyRating" as const,
      label: t("feedback.accuracy"),
      value: ratings.accuracyRating,
    },
    {
      key: "priceRating" as const,
      label: t("feedback.price"),
      value: ratings.priceRating,
    },
  ];
  const setCategoryRating = (
    key: keyof FeedbackRatings,
    ratingValue: number,
  ) => {
    setRatings((currentRatings) => ({
      ...currentRatings,
      [key]: ratingValue,
    }));
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("feedback.title")}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[2rem] bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-2xl font-black text-slate-950">
              {t("feedback.title")}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("feedback.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="space-y-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isComplete) return;
            void onSubmit(job.id, { ...ratings, reason: reason.trim() });
          }}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
              <span className="text-sm font-black">
                {t("feedback.summary")}
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-black">
                <Star className="h-4 w-4" fill="currentColor" />
                {isComplete
                  ? t("feedback.ratingValue", {
                      rating: summaryRating.toFixed(1),
                    })
                  : "-"}
              </span>
            </div>
            {feedbackCategories.map((category) => (
              <StarRatingInput
                key={category.key}
                label={category.label}
                value={category.value}
                onChange={(ratingValue) =>
                  setCategoryRating(category.key, ratingValue)
                }
              />
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-black text-slate-950">
              {t("feedback.reason")}
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              placeholder={t("feedback.reasonPlaceholder")}
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
            />
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-600 transition hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!isComplete || saving}
              className="rounded-2xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("feedback.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getInitialFeedbackRatings(
  feedback?: ShipmentFeedback | null,
): FeedbackRatings {
  const fallbackRating = feedback?.rating ?? 0;
  return {
    attitudeRating: feedback?.attitude_rating ?? fallbackRating,
    speedRating: feedback?.speed_rating ?? fallbackRating,
    accuracyRating: feedback?.accuracy_rating ?? fallbackRating,
    priceRating: feedback?.price_rating ?? fallbackRating,
  };
}

function StarRatingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <div>
      <div className="text-sm font-black text-slate-950">{label}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={`rounded-2xl p-2 transition hover:bg-amber-50 ${
              star <= value ? "text-amber-400" : "text-slate-300"
            }`}
            aria-label={`${label}: ${t("feedback.star", { count: star })}`}
          >
            <Star
              className="h-7 w-7"
              fill={star <= value ? "currentColor" : "none"}
            />
          </button>
        ))}
        <span className="ml-1 text-sm font-bold text-slate-500">
          {value ? t("feedback.ratingValue", { rating: value }) : "-"}
        </span>
      </div>
    </div>
  );
}
