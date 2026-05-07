import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle,
  Edit3,
  Filter,
  Plus,
  Search,
  X,
  XCircle,
} from "lucide-react";
import ShipmentJobForm from "../components/ShipmentJobForm";
import ShipmentJobsTable, {
  ShipmentJobsTableSortKey,
} from "../components/ShipmentJobsTable";
import {
  buildShipmentJobDocumentsByJob,
  buildShipmentJobSearchText,
  compareShipmentJobSortValues,
  getShipmentJobSortValue,
} from "../components/shipmentJobsTableUtils";
import { SortDirection } from "../components/SortableTableHeader";
import { t } from "../lib/i18n";
import {
  createShipmentJob,
  documentApprovalClasses,
  documentApprovalLabels,
  DocumentApprovalStatus,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  statusOptions,
  tradeModeOptions,
  transportModeOptions,
  updateShipmentDocumentApproval,
  updateShipmentJob,
} from "../lib/shipmentJobs";

export type ShipmentEntryCriteria =
  | { kind: "all" }
  | { kind: "status"; status: ShipmentStatus }
  | { kind: "documentApproval"; approvalStatus: DocumentApprovalStatus };

interface ShipmentEntryFormProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  companyNames?: string[];
  criteria?: ShipmentEntryCriteria;
  onRefresh: () => Promise<void>;
}

export default function ShipmentEntryForm({
  jobs,
  documents,
  companyNames = [],
  criteria = { kind: "all" },
  onRefresh,
}: ShipmentEntryFormProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "all">(
    "all",
  );
  const [tradeFilter, setTradeFilter] = useState("all");
  const [transportFilter, setTransportFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<ShipmentJob | null>(null);
  const [mode, setMode] = useState<"create" | "update">("update");
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<ShipmentJobsTableSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const pendingApprovalJobIds = new Set(
      documents
        .filter(
          (document) =>
            document.scope === "customer" &&
            criteria.kind === "documentApproval" &&
            document.approval_status === criteria.approvalStatus,
        )
        .map((document) => document.shipment_job_id),
    );

    return jobs
      .filter((job) => {
        if (criteria.kind === "status") {
          return job.status === criteria.status;
        }
        if (criteria.kind === "documentApproval") {
          return pendingApprovalJobIds.has(job.id);
        }
        return true;
      })
      .filter((job) => {
        if (statusFilter === "all") return true;
        return job.status === statusFilter;
      })
      .filter((job) => {
        if (tradeFilter === "all") return true;
        return job.trade_mode === tradeFilter;
      })
      .filter((job) => {
        if (transportFilter === "all") return true;
        return job.transport_mode === transportFilter;
      })
      .filter((job) => {
        if (companyFilter === "all") return true;
        return job.company_name === companyFilter;
      })
      .filter((job) => {
        if (!normalizedQuery) return true;
        return buildShipmentJobSearchText(job).includes(normalizedQuery);
      });
  }, [
    companyFilter,
    criteria,
    documents,
    jobs,
    query,
    statusFilter,
    tradeFilter,
    transportFilter,
  ]);

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

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    setMode("update");
    setSelectedJob(null);
    setQuery("");
    setStatusFilter(criteria.kind === "status" ? criteria.status : "all");
    setCompanyFilter("all");
    setTradeFilter("all");
    setTransportFilter("all");
    setCurrentPage(1);
  }, [criteria]);

  useEffect(() => {
    if (selectedJob && !sortedJobs.some((job) => job.id === selectedJob.id)) {
      setSelectedJob(null);
    }
  }, [selectedJob, sortedJobs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    pageSize,
    companyFilter,
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

  const handleCreate = async (
    form: Parameters<typeof createShipmentJob>[0],
  ) => {
    setLoading(true);
    try {
      await createShipmentJob(form);
      await onRefresh();
      showToast("success", t("admin.entry.created"));
    } catch {
      showToast("error", t("admin.entry.createFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (
    form: Parameters<typeof updateShipmentJob>[1],
  ) => {
    if (!selectedJob) return;
    setLoading(true);
    try {
      await updateShipmentJob(selectedJob.id, form);
      await onRefresh();
      showToast("success", t("admin.entry.updated"));
    } catch {
      showToast("error", t("admin.entry.updateFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentApproval = async (
    document: ShipmentDocument,
    approvalStatus: "approved" | "rejected",
  ) => {
    setLoading(true);
    try {
      await updateShipmentDocumentApproval(document.id, approvalStatus);
      await onRefresh();
      showToast(
        "success",
        approvalStatus === "approved"
          ? t("admin.documents.approved")
          : t("admin.documents.rejected"),
      );
    } catch {
      showToast("error", t("admin.documents.updateFailed"));
    } finally {
      setLoading(false);
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
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("admin.entry.title")}
        </h2>
      </div>

      <div className="flex gap-2 rounded-xl bg-gray-100 dark:bg-gray-900 p-1 w-fit">
        <button
          onClick={() => setMode("update")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            mode === "update"
              ? "bg-white dark:bg-gray-800 text-gray-950 dark:text-white shadow-sm"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          <Edit3 className="h-4 w-4" />
          {t("admin.entry.updateExisting")}
        </button>
        <button
          onClick={() => {
            setMode("create");
            setSelectedJob(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            mode === "create"
              ? "bg-white dark:bg-gray-800 text-gray-950 dark:text-white shadow-sm"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          <Plus className="h-4 w-4" />
          {t("admin.entry.createNew")}
        </button>
      </div>

      {mode === "update" && (
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_180px_180px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("jobs.searchPlaceholder")}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
                />
              </div>
              <FilterSelect
                value={companyFilter}
                onChange={setCompanyFilter}
                options={[
                  { value: "all", label: t("jobs.filter.allCompanies") },
                  ...companyNames.map((companyName) => ({
                    value: companyName,
                    label: companyName,
                  })),
                ]}
              />
              <FilterSelect
                icon={<Filter className="h-4 w-4" />}
                value={statusFilter}
                onChange={(value) =>
                  setStatusFilter(value as ShipmentStatus | "all")
                }
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
            loading={false}
            selectedJobId={selectedJob?.id}
            sortKey={sortKey}
            sortDirection={sortDirection}
            currentPage={safeCurrentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            visibleFrom={visibleFrom}
            visibleTo={visibleTo}
            adminTheme
            onSort={handleSort}
            onSelectJob={setSelectedJob}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
          <AdminShipmentJobModal
            job={selectedJob}
            documents={selectedJob ? documentsByJob[selectedJob.id] : []}
            loading={loading}
            onClose={() => setSelectedJob(null)}
            onSubmit={handleUpdate}
            companyOptions={companyNames}
            onApprove={(document) =>
              handleDocumentApproval(document, "approved")
            }
            onReject={(document) =>
              handleDocumentApproval(document, "rejected")
            }
          />
        </div>
      )}

      {mode === "create" && (
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <ShipmentJobForm
            companyOptions={companyNames}
            submitLabel={t("common.create")}
            loading={loading}
            onSubmit={handleCreate}
          />
        </section>
      )}
    </div>
  );
}

function AdminShipmentJobModal({
  job,
  documents,
  loading,
  companyOptions,
  onClose,
  onSubmit,
  onApprove,
  onReject,
}: {
  job: ShipmentJob | null;
  documents: ShipmentDocument[];
  loading: boolean;
  companyOptions: string[];
  onClose: () => void;
  onSubmit: (form: Parameters<typeof updateShipmentJob>[1]) => Promise<void>;
  onApprove: (document: ShipmentDocument) => void;
  onReject: (document: ShipmentDocument) => void;
}) {
  if (!job) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("admin.entry.title")}
    >
      <div
        className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-gray-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {job.invoice_number || job.mbl_mawb || t("admin.entry.title")}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {job.shipper_name || "-"} → {job.consignee_name || "-"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label={t("jobs.detail.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-6">
          <ShipmentJobForm
            key={job.id}
            job={job}
            companyOptions={companyOptions}
            submitLabel={t("common.update")}
            loading={loading}
            onSubmit={onSubmit}
          />
          <DocumentApprovalPanel
            documents={documents}
            loading={loading}
            onApprove={onApprove}
            onReject={onReject}
          />
        </div>
      </div>
    </div>
  );
}

function DocumentApprovalPanel({
  documents,
  loading,
  onApprove,
  onReject,
}: {
  documents: ShipmentDocument[];
  loading: boolean;
  onApprove: (document: ShipmentDocument) => void;
  onReject: (document: ShipmentDocument) => void;
}) {
  return (
    <section className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-800">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {t("admin.documents.title")}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("admin.documents.description")}
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("admin.documents.noDocuments")}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((document) => {
            const canReview = document.approval_status === "pending";

            return (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {document.name}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {document.scope === "customer"
                        ? t("documents.customer")
                        : t("documents.internal")}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${documentApprovalClasses[document.approval_status]}`}
                    >
                      {documentApprovalLabels[document.approval_status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {document.scope === "customer"
                      ? t("documents.downloadLocked")
                      : t("documents.internalOnly")}
                  </p>
                </div>
                {document.scope === "customer" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading || !canReview}
                      onClick={() => onApprove(document)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t("common.approve")}
                    </button>
                    <button
                      type="button"
                      disabled={loading || !canReview}
                      onClick={() => onReject(document)}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {t("common.reject")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FilterSelect({
  icon,
  value,
  options,
  onChange,
}: {
  icon?: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-xl border border-gray-300 bg-white py-2.5 pr-3 text-sm font-medium text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800 ${
          icon ? "pl-10" : "pl-3"
        }`}
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
