import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  ShipWheel,
  Star,
  X,
} from "lucide-react";
import ShipmentJobForm from "./ShipmentJobForm";
import ShipmentJobDetailModal from "./ShipmentJobDetailModal";
import PaginationControls from "./PaginationControls";
import SortableTableHeader from "./SortableTableHeader";
import { t } from "../lib/i18n";
import { useAdminAuth } from "../admin/useAdminAuth";
import {
  fetchShipmentFeedbackForUser,
  ShipmentFeedback,
  submitShipmentFeedback,
} from "../lib/shipmentFeedback";
import {
  createShipmentJob,
  getDocumentsForJob,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  statusBadgeClasses,
  statusLabels,
  statusOptions,
  tradeModeLabels,
  tradeModeOptions,
  transportModeLabels,
  transportModeOptions,
} from "../lib/shipmentJobs";

type SortKey =
  | "id"
  | "status"
  | "working_days"
  | "trade"
  | "invoice_number"
  | "transport_mode"
  | "shipper_name"
  | "consignee_name"
  | "pol_aol"
  | "pod_aod"
  | "vessel_flight_numbers"
  | "mbl_mawb"
  | "hbl_hawb"
  | "bl_awb_date";

type SortDirection = "asc" | "desc";
type StatusFilter = ShipmentStatus | "all";

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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
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
      const searchable = [
        job.id,
        formatShortId(job.id),
        job.invoice_number,
        job.shipper_name,
        job.consignee_name,
        job.pol_aol,
        job.pod_aod,
        ...(job.vessel_flight_numbers ?? []),
        job.mbl_mawb,
        job.hbl_hawb,
        ...((job.tracking_events ?? []).flatMap((event) => [
          event.event_date,
          event.location,
          event.description,
        ])),
        ...(job.documents ?? []),
        ...(job.internal_documents ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        !normalizedQuery || searchable.includes(normalizedQuery);
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
      compareSortValues(
        getSortValue(first, sortKey),
        getSortValue(second, sortKey),
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
    return Object.fromEntries(
      jobs.map((job) => [job.id, getDocumentsForJob(documents, job.id)]),
    ) as Record<string, ShipmentDocument[]>;
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

  const handleSort = (nextSortKey: SortKey) => {
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

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <ShipWheel className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-950">{t("jobs.list")}</h2>
              <p className="text-sm text-slate-500">
                {t("jobs.count", {
                  total: jobs.length,
                  filtered: sortedJobs.length,
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className={`w-full table-fixed text-left text-sm ${
              isAdminAuthenticated ? "min-w-[2160px]" : "min-w-[1970px]"
            }`}
          >
            <colgroup>
              {isAdminAuthenticated ? (
                <>
                  <col className="w-[90px]" />
                  <col className="w-[120px]" />
                  <col className="w-[130px]" />
                  <col className="w-[100px]" />
                  <col className="w-[120px]" />
                  <col className="w-[100px]" />
                  <col className="w-[145px]" />
                  <col className="w-[145px]" />
                  <col className="w-[130px]" />
                  <col className="w-[130px]" />
                  <col className="w-[170px]" />
                  <col className="w-[135px]" />
                  <col className="w-[135px]" />
                  <col className="w-[150px]" />
                  <col className="w-[170px]" />
                  <col className="w-[190px]" />
                </>
              ) : (
                <>
                  <col className="w-[90px]" />
                  <col className="w-[120px]" />
                  <col className="w-[130px]" />
                  <col className="w-[100px]" />
                  <col className="w-[120px]" />
                  <col className="w-[100px]" />
                  <col className="w-[145px]" />
                  <col className="w-[145px]" />
                  <col className="w-[130px]" />
                  <col className="w-[130px]" />
                  <col className="w-[170px]" />
                  <col className="w-[135px]" />
                  <col className="w-[135px]" />
                  <col className="w-[150px]" />
                  <col className="w-[190px]" />
                </>
              )}
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <SortableTableHeader
                  label="ID"
                  sortKey="id"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="whitespace-nowrap py-3 pl-3 pr-5"
                />
                <SortableTableHeader
                  label={t("common.status")}
                  sortKey="status"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="whitespace-nowrap py-3 pl-5 pr-3"
                />
                <SortableTableHeader
                  label={t("common.workingDaysSpent")}
                  sortKey="working_days"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label={t("common.trade")}
                  sortKey="trade"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label={t("common.invoice")}
                  sortKey="invoice_number"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label={t("common.transport")}
                  sortKey="transport_mode"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label={t("common.shipper")}
                  sortKey="shipper_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label={t("common.consignee")}
                  sortKey="consignee_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label="POL/AOL"
                  sortKey="pol_aol"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label="POD/AOD"
                  sortKey="pod_aod"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label={t("common.vesselFlightNo")}
                  sortKey="vessel_flight_numbers"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label="MBL/MAWB"
                  sortKey="mbl_mawb"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label="HBL/HAWB"
                  sortKey="hbl_hawb"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableTableHeader
                  label={t("common.blAwbDate")}
                  sortKey="bl_awb_date"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.documents")}
                </th>
                {isAdminAuthenticated && (
                  <th className="whitespace-nowrap px-3 py-3">
                    {t("common.internalDocuments")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedJobs.map((job) => (
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
                    className="cursor-pointer align-top transition hover:bg-slate-50/80 focus:bg-slate-50 focus:outline-none"
                  >
                  <td className="py-4 pl-3 pr-5 font-mono text-xs font-bold text-slate-500">
                    <span title={job.id}>{formatShortId(job.id)}</span>
                  </td>
                  <td className="py-4 pl-5 pr-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[job.status]}`}
                    >
                      {statusLabels[job.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <WorkingDaysBadge job={job} />
                  </td>
                  <td className="px-3 py-4">
                    <div className="whitespace-nowrap font-bold text-slate-900">
                      {tradeModeLabels[job.trade_mode]}
                    </div>
                    <div className="whitespace-nowrap text-xs text-slate-500">
                      {job.trade_term || "-"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-slate-900">
                    {job.invoice_number || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {job.transport_mode
                      ? transportModeLabels[job.transport_mode]
                      : "-"}
                  </td>
                  <td className="px-3 py-4 font-medium text-slate-900">
                    {job.shipper_name || "-"}
                  </td>
                  <td className="px-3 py-4 font-medium text-slate-900">
                    {job.consignee_name || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {job.pol_aol || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {job.pod_aod || "-"}
                  </td>
                  <td className="px-3 py-4 text-xs text-slate-700">
                    <VesselFlightList values={job.vessel_flight_numbers} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">
                    {job.mbl_mawb || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">
                    {job.hbl_hawb || "-"}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2 whitespace-nowrap text-slate-700">
                      <CalendarDays className="h-4 w-4 text-slate-400" />
                      {job.bl_awb_date || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <DocumentPills
                      documents={documentsByJob[job.id]?.filter(
                        (document) => document.scope === "customer",
                      )}
                    />
                  </td>
                  {isAdminAuthenticated && (
                    <td className="px-3 py-4">
                      <DocumentPills
                        documents={documentsByJob[job.id]?.filter(
                          (document) => document.scope === "internal",
                        )}
                        muted
                      />
                    </td>
                  )}
                  </tr>
              ))}
            </tbody>
          </table>
          {!loading && sortedJobs.length === 0 && (
            <div className="py-16 text-center text-slate-500">
              <MoreHorizontal className="mx-auto mb-3 h-8 w-8" />
              {t("jobs.noMatches")}
            </div>
          )}
          {loading && (
            <div className="py-16 text-center text-slate-500">
              {t("common.loadingJobs")}
            </div>
          )}
        </div>
        <PaginationControls
          currentPage={safeCurrentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={sortedJobs.length}
          visibleFrom={visibleFrom}
          visibleTo={visibleTo}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>
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
              rating: feedback.rating,
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

function DocumentPills({
  documents,
  muted = false,
}: {
  documents?: ShipmentDocument[];
  muted?: boolean;
}) {
  if (!documents?.length) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {documents.map((document) => (
        <span
          key={document.id}
          className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            muted ? "bg-slate-100 text-slate-600" : "bg-cyan-50 text-cyan-800"
          }`}
        >
          <FileText className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">{document.name}</span>
        </span>
      ))}
    </div>
  );
}

function WorkingDaysBadge({ job }: { job: ShipmentJob }) {
  const workingDays = getWorkingDaysSpent(job);

  if (!workingDays) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
      {workingDays}営業日
    </span>
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
  initialFeedback?: { rating: number; reason: string | null } | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    jobId: string,
    feedback: { rating: number; reason: string },
  ) => Promise<void>;
}) {
  const [rating, setRating] = useState(initialFeedback?.rating ?? 0);
  const [reason, setReason] = useState(initialFeedback?.reason ?? "");

  useEffect(() => {
    setRating(initialFeedback?.rating ?? 0);
    setReason(initialFeedback?.reason ?? "");
  }, [initialFeedback, job?.id]);

  if (!job) {
    return null;
  }

  const title = job.invoice_number || job.mbl_mawb || formatShortId(job.id);

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
            if (rating === 0) return;
            void onSubmit(job.id, { rating, reason: reason.trim() });
          }}
        >
          <div>
            <div className="text-sm font-black text-slate-950">
              {t("feedback.rating")}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`rounded-2xl p-2 transition hover:bg-amber-50 ${
                    star <= rating ? "text-amber-400" : "text-slate-300"
                  }`}
                  aria-label={t("feedback.star", { count: star })}
                >
                  <Star
                    className="h-8 w-8"
                    fill={star <= rating ? "currentColor" : "none"}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-bold text-slate-500">
                {rating ? t("feedback.ratingValue", { rating }) : "-"}
              </span>
            </div>
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
              disabled={rating === 0 || saving}
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

function getSortValue(job: ShipmentJob, sortKey: SortKey) {
  switch (sortKey) {
    case "id":
      return job.id;
    case "status":
      return statusLabels[job.status];
    case "working_days":
      return getWorkingDaysSpent(job)?.toString() ?? "";
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

function formatShortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function VesselFlightList({ values }: { values?: string[] | null }) {
  const filteredValues = values?.filter(Boolean) ?? [];

  if (filteredValues.length === 0) {
    return <span>-</span>;
  }

  return (
    <div className="space-y-1">
      {filteredValues.map((value, index) => (
        <div key={`${value}-${index}`} className="whitespace-nowrap">
          <span className="font-semibold text-slate-500">{index + 1}.</span>{" "}
          {value}
        </div>
      ))}
    </div>
  );
}

function compareSortValues(
  first: string,
  second: string,
  direction: SortDirection,
  sortKey: SortKey,
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

function getWorkingDaysSpent(job: ShipmentJob) {
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
