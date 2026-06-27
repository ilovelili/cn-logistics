import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Edit3,
  FileStack,
  Filter,
  Plus,
  Search,
  X,
  XCircle,
} from "lucide-react";
import ShipmentJobForm from "../components/ShipmentJobForm";
import DocumentPreviewModal from "../components/DocumentPreviewModal";
import InstantTooltip from "../components/InstantTooltip";
import LogoMark from "../components/LogoMark";
import ShipmentJobsTable, {
  ShipmentJobsTableSortKey,
} from "../components/ShipmentJobsTable";
import {
  buildShipmentJobDocumentsByJob,
  buildShipmentJobSearchText,
  compareShipmentJobSortValues,
  getResponsibleAdminNames,
  getResponsibleAdminSearchTerms,
  getShipmentJobSortValue,
} from "../components/shipmentJobsTableUtils";
import { SortDirection } from "../components/SortableTableHeader";
import { t } from "../lib/i18n";
import type { AdminOperator } from "../lib/adminOperators";
import type { ShipperUser } from "../lib/shipperUsers";
import {
  createShipmentJob,
  DocumentApprovalStatus,
  fetchShipmentTrackingEventTemplates,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  ShipmentStatusColorMap,
  softDeleteShipmentDocument,
  statusOptions,
  tradeModeOptions,
  transportModeOptions,
  updateShipmentJob,
} from "../lib/shipmentJobs";

export type ShipmentEntryCriteria =
  | { kind: "all" }
  | { kind: "status"; status: ShipmentStatus }
  | { kind: "documentApproval"; approvalStatus: DocumentApprovalStatus };

interface ShipmentEntryFormProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  shipperOptions?: Pick<ShipperUser, "shipper_name" | "admin_assignments">[];
  shipperUsers?: ShipperUser[];
  isSuperAdmin?: boolean;
  adminOperators?: AdminOperator[];
  adminEmail: string;
  canEditAssignedAdmins?: boolean;
  criteria?: ShipmentEntryCriteria;
  onRefresh: () => Promise<void>;
}

export default function ShipmentEntryForm({
  jobs,
  documents,
  shipperOptions = [],
  shipperUsers = [],
  isSuperAdmin = false,
  adminOperators = [],
  adminEmail,
  canEditAssignedAdmins = false,
  criteria = { kind: "all" },
  onRefresh,
}: ShipmentEntryFormProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "all">(
    "all",
  );
  const [tradeFilter, setTradeFilter] = useState("all");
  const [transportFilter, setTransportFilter] = useState("all");
  const [shipperFilter, setShipperFilter] = useState("all");
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
  const [statusColorMap, setStatusColorMap] = useState<ShipmentStatusColorMap>(
    {},
  );
  const [activeCriteria, setActiveCriteria] =
    useState<ShipmentEntryCriteria>(criteria);
  const shipperNames = useMemo(
    () => [
      ...new Set(
        shipperOptions
          .map((shipperUser) => shipperUser.shipper_name.trim())
          .filter(Boolean),
      ),
    ],
    [shipperOptions],
  );

  useEffect(() => {
    let active = true;

    fetchShipmentTrackingEventTemplates()
      .then((templates) => {
        if (!active) return;

        setStatusColorMap(
          Object.fromEntries(
            templates
              .filter((template) => template.color_hex)
              .map((template) => [template.name, template.color_hex]),
          ) as ShipmentStatusColorMap,
        );
      })
      .catch(() => {
        if (active) {
          setStatusColorMap({});
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const pendingApprovalJobIds = new Set(
      documents
        .filter(
          (document) =>
            document.scope === "customer" &&
            activeCriteria.kind === "documentApproval" &&
            document.approval_status === activeCriteria.approvalStatus,
        )
        .map((document) => document.shipment_job_id),
    );

    return jobs
      .filter((job) => {
        if (activeCriteria.kind === "status") {
          return job.status === activeCriteria.status;
        }
        if (activeCriteria.kind === "documentApproval") {
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
        if (shipperFilter === "all") return true;
        return job.shipper_name === shipperFilter;
      })
      .filter((job) => {
        if (!normalizedQuery) return true;
        return buildShipmentJobSearchText(
          job,
          getResponsibleAdminSearchTerms(job, shipperOptions),
        ).includes(normalizedQuery);
      });
  }, [
    shipperFilter,
    shipperOptions,
    activeCriteria,
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
        getShipmentJobSortValue(
          first,
          sortKey,
          getResponsibleAdminNames(first, shipperOptions),
        ),
        getShipmentJobSortValue(
          second,
          sortKey,
          getResponsibleAdminNames(second, shipperOptions),
        ),
        sortDirection,
        sortKey,
      ),
    );
  }, [shipperOptions, filteredJobs, sortDirection, sortKey]);

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

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    setActiveCriteria(criteria);
    setMode("update");
    setSelectedJob(null);
    setQuery("");
    setStatusFilter(criteria.kind === "status" ? criteria.status : "all");
    setShipperFilter("all");
    setTradeFilter("all");
    setTransportFilter("all");
    setCurrentPage(1);
  }, [criteria]);

  useEffect(() => {
    if (!selectedJob) return;

    const refreshedJob = jobs.find((job) => job.id === selectedJob.id);
    if (!refreshedJob || !sortedJobs.some((job) => job.id === selectedJob.id)) {
      setSelectedJob(null);
      return;
    }

    if (refreshedJob !== selectedJob) {
      setSelectedJob(refreshedJob);
    }
  }, [jobs, selectedJob, sortedJobs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    pageSize,
    activeCriteria,
    shipperFilter,
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
      await updateShipmentJob(selectedJob.id, form, adminEmail);
      await onRefresh();
      setSelectedJob(null);
      showToast("success", t("admin.entry.updated"));
    } catch {
      showToast("error", t("admin.entry.updateFailed"));
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

  const openMetricFilter = (nextCriteria: ShipmentEntryCriteria) => {
    setActiveCriteria(nextCriteria);
    setMode("update");
    setSelectedJob(null);
    setQuery("");
    setShipperFilter("all");
    setTradeFilter("all");
    setTransportFilter("all");
    setStatusFilter(
      nextCriteria.kind === "status" ? nextCriteria.status : "all",
    );
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
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

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("admin.entry.title")}
        </h2>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 xl:max-w-4xl xl:grid-cols-4">
          <ShipmentHeaderMetric
            label={t("dashboard.totalJobs")}
            value={summaryStats.totalJobs}
            icon={<LogoMark alt="" className="h-4 w-4 rounded" />}
            tone="blue"
            onClick={() => openMetricFilter({ kind: "all" })}
          />
          <ShipmentHeaderMetric
            label={t("status.customsHold")}
            value={summaryStats.customsHold}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="amber"
            onClick={() =>
              openMetricFilter({ kind: "status", status: "customs_hold" })
            }
          />
          <ShipmentHeaderMetric
            label={t("status.delivered")}
            value={summaryStats.delivered}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="emerald"
            onClick={() =>
              openMetricFilter({ kind: "status", status: "delivered" })
            }
          />
          <ShipmentHeaderMetric
            label={t("documents.pendingApproval")}
            value={summaryStats.pendingDocumentApprovals}
            icon={<FileStack className="h-4 w-4" />}
            tone="rose"
            onClick={() =>
              openMetricFilter({
                kind: "documentApproval",
                approvalStatus: "pending",
              })
            }
          />
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900 sm:inline-grid sm:w-auto">
        <button
          onClick={() => setMode("update")}
          className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold sm:px-4 ${
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
          className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold sm:px-4 ${
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
          <section
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            data-tutorial-target="shipment-filters"
          >
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
                value={shipperFilter}
                onChange={setShipperFilter}
                options={[
                  { value: "all", label: t("jobs.filter.allShippers") },
                  ...shipperNames.map((shipperName) => ({
                    value: shipperName,
                    label: shipperName,
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
            statusColorMap={statusColorMap}
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
            showInternalDocuments
            shipperOptions={shipperOptions}
            shipperUsers={shipperUsers}
            requesterEmail={adminEmail}
            isSuperAdmin={isSuperAdmin}
            adminOperators={adminOperators}
            onSort={handleSort}
            onSelectJob={setSelectedJob}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            onRefresh={onRefresh}
          />
          <AdminShipmentJobModal
            job={selectedJob}
            documents={
              selectedJob ? (documentsByJob[selectedJob.id] ?? []) : []
            }
            adminEmail={adminEmail}
            loading={loading}
            onClose={() => setSelectedJob(null)}
            onSubmit={handleUpdate}
            onRefresh={onRefresh}
            shipperOptions={shipperOptions}
            assignedAdminsReadOnly={!canEditAssignedAdmins}
          />
        </div>
      )}

      {mode === "create" && (
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <ShipmentJobForm
            shipperOptions={shipperOptions}
            fixedAssignedAdminEmail={
              canEditAssignedAdmins ? undefined : adminEmail
            }
            assignedAdminsReadOnly={!canEditAssignedAdmins}
            submitLabel={t("common.create")}
            loading={loading}
            onSubmit={handleCreate}
          />
        </section>
      )}
    </div>
  );
}

function ShipmentHeaderMetric({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "blue" | "amber" | "emerald" | "rose";
  onClick?: () => void;
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  };
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left shadow-sm transition dark:border-gray-800 dark:bg-gray-900 ${
        onClick
          ? "hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-slate-100 dark:hover:border-cyan-700 dark:focus:ring-gray-800"
          : ""
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-black leading-none text-gray-900 dark:text-white">
          {value}
        </div>
        <div className="mt-1 truncate text-[11px] font-bold text-gray-500 dark:text-gray-400">
          {label}
        </div>
      </div>
    </Component>
  );
}

function AdminShipmentJobModal({
  job,
  documents,
  adminEmail,
  loading,
  shipperOptions,
  onClose,
  onSubmit,
  onRefresh,
  assignedAdminsReadOnly,
}: {
  job: ShipmentJob | null;
  documents: ShipmentDocument[];
  adminEmail: string;
  loading: boolean;
  shipperOptions: Pick<ShipperUser, "shipper_name" | "admin_assignments">[];
  onClose: () => void;
  onSubmit: (form: Parameters<typeof updateShipmentJob>[1]) => Promise<void>;
  onRefresh: () => Promise<void>;
  assignedAdminsReadOnly: boolean;
}) {
  const [previewDocument, setPreviewDocument] =
    useState<ShipmentDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShipmentDocument | null>(
    null,
  );
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null,
  );

  if (!job) {
    return null;
  }

  const deleteDocument = async () => {
    if (!deleteTarget) return;

    setDeletingDocumentId(deleteTarget.id);
    try {
      await softDeleteShipmentDocument(deleteTarget.id, adminEmail);
      await onRefresh();
      setDeleteTarget(null);
    } finally {
      setDeletingDocumentId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("admin.entry.title")}
    >
      <div
        className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {job.invoice_number || job.mbl_mawb || t("admin.entry.title")}
            </h3>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
              {job.shipper_name || "-"} → {job.consignee_name || "-"}
            </p>
            <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
              {t("common.jobNumber")}: {job.job_number || "-"}
            </p>
          </div>
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

        <ShipmentJobForm
          key={job.id}
          job={job}
          documents={documents}
          shipperOptions={shipperOptions}
          assignedAdminsReadOnly={assignedAdminsReadOnly}
          onPreviewDocument={setPreviewDocument}
          onDeleteDocument={setDeleteTarget}
          submitLabel={t("common.update")}
          loading={loading}
          onSubmit={onSubmit}
        />
      </div>
      {previewDocument && (
        <DocumentPreviewModal
          document={previewDocument}
          adminTheme
          onClose={() => setPreviewDocument(null)}
        />
      )}
      {deleteTarget && (
        <ShipmentEditDocumentDeleteConfirmModal
          document={deleteTarget}
          deleting={deletingDocumentId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void deleteDocument()}
        />
      )}
    </div>
  );
}

function ShipmentEditDocumentDeleteConfirmModal({
  document,
  deleting,
  onCancel,
  onConfirm,
}: {
  document: ShipmentDocument;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("admin.userRegistration.confirmTitle", {
            action: t("common.delete"),
          })}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("documents.deleteConfirm")}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 font-bold text-gray-900 dark:bg-gray-950 dark:text-white">
          {document.name}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? t("common.saving") : t("common.delete")}
          </button>
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
