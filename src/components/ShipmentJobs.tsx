import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  ShipWheel,
} from "lucide-react";
import ShipmentJobForm from "./ShipmentJobForm";
import ShipmentJobDetailModal from "./ShipmentJobDetailModal";
import PaginationControls from "./PaginationControls";
import { t } from "../lib/i18n";
import { useAdminAuth } from "../admin/useAdminAuth";
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
  | "trade"
  | "invoice_number"
  | "transport_mode"
  | "shipper_name"
  | "consignee_name"
  | "pol_aol"
  | "pod_aod"
  | "mbl_mawb"
  | "hbl_hawb"
  | "bl_awb_date";

type SortDirection = "asc" | "desc";
type StatusFilter = ShipmentStatus | "all";

interface ShipmentJobsProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  statusFilter: StatusFilter;
  onStatusFilterChange: (statusFilter: StatusFilter) => void;
}

export default function ShipmentJobs({
  jobs,
  documents,
  loading,
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
        job.mbl_mawb,
        job.hbl_hawb,
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
              isAdminAuthenticated ? "min-w-[1260px]" : "min-w-[1160px]"
            }`}
          >
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              {isAdminAuthenticated && <col className="w-[9%]" />}
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <SortHeader
                  label="ID"
                  sortKey="id"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.status")}
                  sortKey="status"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.trade")}
                  sortKey="trade"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.invoice")}
                  sortKey="invoice_number"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.transport")}
                  sortKey="transport_mode"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.shipper")}
                  sortKey="shipper_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.consignee")}
                  sortKey="consignee_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="POL/AOL"
                  sortKey="pol_aol"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="POD/AOD"
                  sortKey="pod_aod"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="MBL/MAWB"
                  sortKey="mbl_mawb"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="HBL/HAWB"
                  sortKey="hbl_hawb"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
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
                  <td className="px-3 py-4 font-mono text-xs font-bold text-slate-500">
                    <span title={job.id}>{formatShortId(job.id)}</span>
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[job.status]}`}
                    >
                      {statusLabels[job.status]}
                    </span>
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
        onClose={() => setSelectedJob(null)}
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

function SortHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey | null;
  direction: SortDirection;
  onSort: (sortKey: SortKey) => void;
}) {
  const isActive = activeSortKey === sortKey;
  const Icon = !isActive
    ? ArrowUpDown
    : direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <th className="whitespace-nowrap px-3 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-left transition hover:bg-slate-100 hover:text-slate-900 ${
          isActive ? "text-slate-950" : ""
        }`}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </th>
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
          <span className="truncate">{document.name}</span>
        </span>
      ))}
    </div>
  );
}

function getSortValue(job: ShipmentJob, sortKey: SortKey) {
  switch (sortKey) {
    case "id":
      return job.id;
    case "status":
      return statusLabels[job.status];
    case "trade":
      return `${tradeModeLabels[job.trade_mode]} ${job.trade_term ?? ""}`;
    case "transport_mode":
      return job.transport_mode ? transportModeLabels[job.transport_mode] : "";
    case "invoice_number":
    case "shipper_name":
    case "consignee_name":
    case "pol_aol":
    case "pod_aod":
    case "mbl_mawb":
    case "hbl_hawb":
    case "bl_awb_date":
      return job[sortKey] ?? "";
  }
}

function formatShortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function compareSortValues(
  first: string,
  second: string,
  direction: SortDirection,
  sortKey: SortKey,
) {
  if (
    sortKey === "invoice_number" ||
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
