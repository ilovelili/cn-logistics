import * as React from "react";
import {
  AlertCircle,
  CheckCircle,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  LockKeyhole,
  Search,
  Trash2,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  downloadShipmentDocument,
  isCustomerDocumentDownloadable,
  DocumentApprovalStatus,
  ShipmentDocument,
  ShipmentJob,
  softDeleteShipmentDocument,
  statusBadgeClasses,
  statusLabels,
  updateShipmentDocumentApproval,
} from "../lib/shipmentJobs";
import PaginationControls from "./PaginationControls";
import DocumentPreviewModal from "./DocumentPreviewModal";
import SortableTableHeader from "./SortableTableHeader";
import StickyTableHeaderToggle from "./StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "./useStickyTableHeaderPreference";
import TableHorizontalScrollHint from "./TableHorizontalScrollHint";
import TableColumnSettingsButton from "./TableColumnSettings";
import { useTableColumnSettings } from "./useTableColumnSettings";
import { useHorizontalScrollHint } from "./useHorizontalScrollHint";
import ShipperNameDetailButton from "./ShipperNameDetailButton";
import ResponsibleAdminBadges from "./ResponsibleAdminBadges";
import {
  getResponsibleAdminAssignments,
  getResponsibleAdminNames,
  type ShipmentJobsShipperOption,
} from "./shipmentJobsTableUtils";
import type { AdminOperator } from "../lib/adminOperators";
import type { ShipperUser } from "../lib/shipperUsers";

interface DocumentControlProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  isAdminAuthenticated: boolean;
  requesterEmail?: string;
  approvalFilter: DocumentApprovalFilter;
  shipperOptions?: ShipmentJobsShipperOption[];
  shipperUsers?: ShipperUser[];
  isSuperAdmin?: boolean;
  adminOperators?: AdminOperator[];
}

interface DocumentRow {
  id: string;
  job: ShipmentJob;
  document: ShipmentDocument;
  responsibleAdminNames: string[];
  responsibleAdminAssignments: ReturnType<
    typeof getResponsibleAdminAssignments
  >;
}

type DocumentSortKey =
  | "id"
  | "scope"
  | "shipper"
  | "responsibleAdmins"
  | "document"
  | "approval"
  | "status"
  | "downloadRequestDate"
  | "invoice"
  | "jobNumber"
  | "parties"
  | "blAwb"
  | "route";
type SortDirection = "asc" | "desc";
type DocumentColumnId = DocumentSortKey;
export type DocumentApprovalFilter = "all" | DocumentApprovalStatus;

interface DocumentColumn {
  id: DocumentColumnId;
  label: string;
  width: number;
  sortKey: DocumentSortKey;
  render: (row: DocumentRow) => React.ReactNode;
}

export default function DocumentControl({
  jobs,
  documents,
  loading,
  onRefresh,
  isAdminAuthenticated,
  requesterEmail,
  approvalFilter,
  shipperOptions = [],
  shipperUsers = [],
  isSuperAdmin = false,
  adminOperators = [],
}: DocumentControlProps) {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [selectedApprovalFilter, setSelectedApprovalFilter] =
    React.useState<DocumentApprovalFilter>(approvalFilter);
  const [sortKey, setSortKey] = React.useState<DocumentSortKey | null>(null);
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [requestingDocumentId, setRequestingDocumentId] = React.useState<
    string | null
  >(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = React.useState<
    string | null
  >(null);
  const [deletingDocumentId, setDeletingDocumentId] = React.useState<
    string | null
  >(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DocumentRow | null>(
    null,
  );
  const [locallyDeletedDocumentIds, setLocallyDeletedDocumentIds] =
    React.useState<Set<string>>(() => new Set());
  const [previewDocument, setPreviewDocument] =
    React.useState<ShipmentDocument | null>(null);
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const scrollHint = useHorizontalScrollHint(tableScrollRef);
  const [toast, setToast] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = React.useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  React.useEffect(() => {
    setSelectedApprovalFilter(approvalFilter);
  }, [approvalFilter]);

  React.useEffect(() => {
    if (!isAdminAuthenticated && scope === "internal") {
      setScope("all");
    }
    if (!isAdminAuthenticated && sortKey === "scope") {
      setSortKey(null);
    }
  }, [isAdminAuthenticated, scope, sortKey]);

  React.useEffect(() => {
    void onRefresh();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void onRefresh();
      }
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [onRefresh]);

  const rows = React.useMemo<DocumentRow[]>(() => {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const visibleDocuments = isAdminAuthenticated
      ? documents
      : documents.filter((document) => document.scope !== "internal");

    return visibleDocuments.flatMap((document) => {
      if (locallyDeletedDocumentIds.has(document.id)) return [];

      const job = jobsById.get(document.shipment_job_id);
      if (!job) return [];

      return [
        {
          id: document.id,
          job,
          document,
          responsibleAdminNames: getResponsibleAdminNames(job, shipperOptions),
          responsibleAdminAssignments: getResponsibleAdminAssignments(
            job,
            shipperOptions,
          ),
        },
      ];
    });
  }, [
    shipperOptions,
    documents,
    isAdminAuthenticated,
    jobs,
    locallyDeletedDocumentIds,
  ]);

  const filteredRows = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const haystack = [
        row.document.id,
        formatShortId(row.document.id),
        row.document.name,
        row.responsibleAdminNames.join(" "),
        row.job.invoice_number,
        row.job.job_number,
        row.job.shipper_name,
        row.job.consignee_name,
        row.job.mbl_mawb,
        row.job.hbl_hawb,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || haystack.includes(normalizedQuery)) &&
        (scope === "all" || row.document.scope === scope) &&
        (selectedApprovalFilter === "all" ||
          row.document.approval_status === selectedApprovalFilter)
      );
    });
  }, [query, rows, scope, selectedApprovalFilter]);

  const sortedRows = React.useMemo(() => {
    if (!sortKey) return filteredRows;

    return [...filteredRows].sort((first, second) =>
      compareDocumentSortValues(
        getDocumentSortValue(first, sortKey),
        getDocumentSortValue(second, sortKey),
        sortDirection,
      ),
    );
  }, [filteredRows, sortDirection, sortKey]);

  const pageCount = Math.max(Math.ceil(sortedRows.length / pageSize), 1);
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedRows = sortedRows.slice(
    pageStartIndex,
    pageStartIndex + pageSize,
  );
  const visibleFrom = sortedRows.length ? pageStartIndex + 1 : 0;
  const visibleTo = Math.min(pageStartIndex + pageSize, sortedRows.length);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [
    pageSize,
    query,
    scope,
    selectedApprovalFilter,
    sortDirection,
    sortKey,
    isAdminAuthenticated,
  ]);

  React.useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  const handleSort = (nextSortKey: DocumentSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  };

  const handleDownloadRequest = React.useCallback(
    async (document: ShipmentDocument) => {
      setRequestingDocumentId(document.id);
      try {
        await updateShipmentDocumentApproval(
          document.id,
          "pending",
          requesterEmail,
        );
        await onRefresh();
        showToast("success", t("documents.downloadRequested"));
      } catch {
        showToast("error", t("documents.downloadRequestFailed"));
      } finally {
        setRequestingDocumentId(null);
      }
    },
    [onRefresh, requesterEmail, showToast],
  );

  const handleAdminApproval = React.useCallback(
    async (
      document: ShipmentDocument,
      approvalStatus: Extract<DocumentApprovalStatus, "approved" | "rejected">,
    ) => {
      if (!requesterEmail) return;

      setRequestingDocumentId(document.id);
      try {
        await updateShipmentDocumentApproval(
          document.id,
          approvalStatus,
          requesterEmail,
        );
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
        setRequestingDocumentId(null);
      }
    },
    [onRefresh, requesterEmail, showToast],
  );

  const handleAdminDownload = React.useCallback(
    async (document: ShipmentDocument) => {
      setDownloadingDocumentId(document.id);
      try {
        await downloadShipmentDocument(document, {
          allowUnapprovedCustomer: isAdminAuthenticated,
        });
      } catch {
        showToast("error", t("documents.downloadFailed"));
      } finally {
        setDownloadingDocumentId(null);
      }
    },
    [isAdminAuthenticated, showToast],
  );

  const handleAdminDelete = React.useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    setDeletingDocumentId(deleteTarget.document.id);
    try {
      await softDeleteShipmentDocument(
        deleteTarget.document.id,
        requesterEmail,
      );
      setLocallyDeletedDocumentIds((current) => {
        const next = new Set(current);
        next.add(deleteTarget.document.id);
        return next;
      });
      setDeleteTarget(null);
      showToast(
        "success",
        t("documents.deletedWithName", { name: deleteTarget.document.name }),
      );
      await onRefresh().catch(() => undefined);
    } catch {
      showToast("error", t("documents.deleteFailed"));
    } finally {
      setDeletingDocumentId(null);
    }
  }, [deleteTarget, onRefresh, requesterEmail, showToast]);

  const columns = React.useMemo<DocumentColumn[]>(() => {
    const documentColumns: DocumentColumn[] = [
      {
        id: "document",
        label: t("common.documents"),
        width: isAdminAuthenticated ? 180 : 220,
        sortKey: "document",
        render: (row) => (
          <span className="font-semibold text-gray-900 dark:text-white">
            {row.document.name}
          </span>
        ),
      },
      ...(isAdminAuthenticated
        ? [
            {
              id: "shipper" as const,
              label: t("common.shipperName"),
              width: 190,
              sortKey: "shipper" as const,
              render: (row: DocumentRow) => (
                <ShipperNameDetailButton
                  shipperName={row.job.shipper_name}
                  shipperUsers={shipperUsers}
                  requesterEmail={requesterEmail}
                  isSuperAdmin={isSuperAdmin}
                  adminOperators={adminOperators}
                  className="max-w-full truncate font-semibold text-cyan-700 underline-offset-4 transition hover:text-cyan-500 hover:underline dark:text-cyan-300 dark:hover:text-cyan-200"
                  fallbackClassName="font-semibold text-gray-700 dark:text-gray-200"
                />
              ),
            },
            {
              id: "responsibleAdmins" as const,
              label: t("admin.userRegistration.assignedAdmins"),
              width: 170,
              sortKey: "responsibleAdmins" as const,
              render: (row: DocumentRow) => (
                <ResponsibleAdminBadges
                  assignments={row.responsibleAdminAssignments}
                />
              ),
            },
          ]
        : []),
      {
        id: "status",
        label: t("common.status"),
        width: 120,
        sortKey: "status",
        render: (row) => (
          <span
            className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[row.job.status]}`}
          >
            {statusLabels[row.job.status]}
          </span>
        ),
      },
      {
        id: "downloadRequestDate",
        label: t("documents.downloadRequestDate"),
        width: 150,
        sortKey: "downloadRequestDate",
        render: (row) => (
          <span className="whitespace-nowrap text-gray-600 dark:text-gray-300">
            {row.document.approval_status === "pending"
              ? formatDocumentDate(row.document.updated_at)
              : "-"}
          </span>
        ),
      },
      {
        id: "invoice",
        label: t("common.invoice"),
        width: 130,
        sortKey: "invoice",
        render: (row) => (
          <span className="font-mono">{row.job.invoice_number || "-"}</span>
        ),
      },
      {
        id: "jobNumber",
        label: t("common.jobNumber"),
        width: 130,
        sortKey: "jobNumber",
        render: (row) => (
          <span className="font-mono">{row.job.job_number || "-"}</span>
        ),
      },
      ...(!isAdminAuthenticated
        ? [
            {
              id: "parties" as const,
              label: t("common.parties"),
              width: 240,
              sortKey: "parties" as const,
              render: (row: DocumentRow) => (
                <>
                  {row.job.shipper_name || "-"} /{" "}
                  {row.job.consignee_name || "-"}
                </>
              ),
            },
            {
              id: "blAwb" as const,
              label: "BL/AWB",
              width: 180,
              sortKey: "blAwb" as const,
              render: (row: DocumentRow) => (
                <span className="font-mono text-xs">
                  {row.job.mbl_mawb || "-"} / {row.job.hbl_hawb || "-"}
                </span>
              ),
            },
            {
              id: "route" as const,
              label: t("common.route"),
              width: 180,
              sortKey: "route" as const,
              render: (row: DocumentRow) => (
                <>
                  {row.job.pol_aol || "-"} → {row.job.pod_aod || "-"}
                </>
              ),
            },
          ]
        : []),
      {
        id: "approval",
        label: isAdminAuthenticated
          ? t("documents.adminReview")
          : t("documents.downloadRequest"),
        width: isAdminAuthenticated ? 430 : 160,
        sortKey: "approval",
        render: (row) => (
          <DocumentActionButton
            row={row}
            isAdminAuthenticated={isAdminAuthenticated}
            requesting={requestingDocumentId === row.document.id}
            downloading={downloadingDocumentId === row.document.id}
            deleting={deletingDocumentId === row.document.id}
            onRequest={handleDownloadRequest}
            onReview={handleAdminApproval}
            onPreview={setPreviewDocument}
            onDownload={handleAdminDownload}
            onDelete={setDeleteTarget}
          />
        ),
      },
    ];

    if (isAdminAuthenticated) {
      documentColumns.splice(1, 0, {
        id: "scope",
        label: t("documents.scope"),
        width: 130,
        sortKey: "scope",
        render: (row) => (
          <span
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
              row.document.scope === "internal"
                ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                : "bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200"
            }`}
          >
            {row.document.scope === "internal" ? (
              <LockKeyhole className="h-3.5 w-3.5" />
            ) : (
              <FileCheck2 className="h-3.5 w-3.5" />
            )}
            {row.document.scope === "internal"
              ? t("documents.internal")
              : t("documents.customer")}
          </span>
        ),
      });
    }

    return documentColumns;
  }, [
    handleAdminApproval,
    handleAdminDelete,
    handleAdminDownload,
    handleDownloadRequest,
    deletingDocumentId,
    downloadingDocumentId,
    isAdminAuthenticated,
    isSuperAdmin,
    requestingDocumentId,
    requesterEmail,
    adminOperators,
    shipperUsers,
  ]);

  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    isAdminAuthenticated
      ? "document_control_table_columns_admin_v3"
      : "document_control_table_columns_customer_v3",
    columns.map((column) => ({ id: column.id, label: column.label })),
  );
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const visibleTableColumns = visibleColumns
    .map((column) => columnsById.get(column.id))
    .filter((column): column is DocumentColumn => Boolean(column));
  const orderedColumnConfigs = orderedColumns.map((column) => ({
    id: column.id,
    label: column.label,
  }));
  const tableMinWidth = visibleTableColumns.reduce(
    (total, column) => total + column.width,
    0,
  );
  const isAdminStyle = isAdminAuthenticated;

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

      <div
        className={
          isAdminStyle
            ? "rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            : "rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1
              className={
                isAdminStyle
                  ? "text-2xl font-bold text-gray-900 dark:text-white"
                  : "text-3xl font-black text-slate-950"
              }
            >
              {t("documents.title")}
            </h1>
          </div>
        </div>
      </div>

      <section
        className={
          isAdminStyle
            ? "rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            : "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        }
      >
        <div
          className={`grid grid-cols-1 gap-3 ${
            isAdminAuthenticated ? "md:grid-cols-[1fr_220px_220px]" : ""
          }`}
        >
          <div className="relative">
            <Search
              className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
                isAdminStyle ? "text-gray-400" : "text-slate-400"
              }`}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("documents.searchPlaceholder")}
              className={
                isAdminStyle
                  ? "w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
                  : "w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
              }
            />
          </div>
          {isAdminAuthenticated && (
            <>
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
              >
                <option value="all">{t("documents.filter.all")}</option>
                <option value="customer">
                  {t("documents.filter.customer")}
                </option>
                <option value="internal">
                  {t("documents.filter.internal")}
                </option>
              </select>
              <select
                value={selectedApprovalFilter}
                onChange={(event) =>
                  setSelectedApprovalFilter(
                    event.target.value as DocumentApprovalFilter,
                  )
                }
                className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
              >
                <option value="all">{t("documents.filter.allApproval")}</option>
                <option value="pending">
                  {t("documents.approval.pending")}
                </option>
                <option value="approved">
                  {t("documents.approval.approved")}
                </option>
                <option value="rejected">
                  {t("documents.approval.rejected")}
                </option>
              </select>
            </>
          )}
        </div>
      </section>

      <section
        className={
          isAdminStyle
            ? "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
            : "overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        }
      >
        <div
          className={
            isAdminStyle
              ? "flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"
              : "flex items-center justify-between border-b border-slate-200 px-5 py-4"
          }
        >
          <div>
            <h2
              className={
                isAdminStyle
                  ? "font-bold text-gray-900 dark:text-white"
                  : "font-black text-slate-950"
              }
            >
              {t("documents.register")}
            </h2>
            <p
              className={
                isAdminStyle
                  ? "text-sm text-gray-500 dark:text-gray-400"
                  : "text-sm text-slate-500"
              }
            >
              {t("documents.count", { count: sortedRows.length })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StickyTableHeaderToggle
              adminTheme={isAdminStyle}
              enabled={stickyHeaderEnabled}
              onToggle={toggleStickyHeader}
            />
            <TableColumnSettingsButton
              columns={orderedColumnConfigs}
              visibleColumnIds={visibleColumnIds}
              onVisibilityChange={setColumnVisibility}
              onMoveColumn={moveColumn}
              onReset={resetColumns}
              adminTheme={isAdminStyle}
            />
          </div>
        </div>
        <div
          className={`flex justify-end border-b px-5 py-2 sm:${scrollHint.canScroll ? "flex" : "hidden"} ${
            isAdminStyle
              ? "border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950/40"
              : "border-slate-200 bg-slate-50/70"
          }`}
        >
          <TableHorizontalScrollHint
            adminTheme={isAdminStyle}
            atStart={scrollHint.atStart}
            atEnd={scrollHint.atEnd}
            onScroll={scrollHint.scrollByDirection}
          />
        </div>
        <div
          ref={tableScrollRef}
          className={
            stickyHeaderEnabled
              ? "max-h-[70vh] overflow-auto overscroll-contain"
              : "overflow-x-auto"
          }
        >
          <table
            className="w-full table-fixed text-left text-sm"
            style={{ minWidth: `${Math.max(tableMinWidth, 320)}px` }}
          >
            <colgroup>
              {visibleTableColumns.map((column) => (
                <col key={column.id} style={{ width: `${column.width}px` }} />
              ))}
            </colgroup>
            <thead
              className={
                isAdminStyle
                  ? `${stickyHeaderEnabled ? "sticky top-0 z-20 shadow-sm" : ""} bg-white text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400`
                  : `${stickyHeaderEnabled ? "sticky top-0 z-20 shadow-sm" : ""} bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500`
              }
            >
              <tr
                className={
                  isAdminStyle
                    ? "border-b border-gray-200 dark:border-gray-800"
                    : undefined
                }
              >
                {visibleTableColumns.map((column, columnIndex) => (
                  <SortableTableHeader
                    key={column.id}
                    label={column.label}
                    sortKey={column.sortKey}
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                    className={
                      isAdminStyle
                        ? `whitespace-nowrap py-3 pr-4 font-bold ${
                            columnIndex === 0 ? "pl-5" : ""
                          }`
                        : "whitespace-nowrap px-5 py-3"
                    }
                    buttonClassName={
                      isAdminStyle
                        ? "inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-gray-900 dark:hover:text-white"
                        : undefined
                    }
                    activeClassName={
                      isAdminStyle ? "text-gray-900 dark:text-white" : undefined
                    }
                    inactiveClassName={
                      isAdminStyle
                        ? "text-gray-500 dark:text-gray-400"
                        : undefined
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody className={isAdminStyle ? "" : "divide-y divide-slate-100"}>
              {paginatedRows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    isAdminStyle
                      ? "border-b border-gray-100 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                      : "transition hover:bg-slate-50/80"
                  }
                >
                  {visibleTableColumns.map((column, columnIndex) => (
                    <td
                      key={column.id}
                      className={
                        isAdminStyle
                          ? `overflow-hidden py-4 pr-4 text-gray-700 dark:text-gray-300 ${
                              columnIndex === 0 ? "pl-5" : ""
                            }`
                          : "px-5 py-4"
                      }
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && sortedRows.length === 0 && (
            <div
              className={
                isAdminStyle
                  ? "py-16 text-center text-gray-500 dark:text-gray-400"
                  : "py-16 text-center text-slate-500"
              }
            >
              <FileClock className="mx-auto mb-3 h-8 w-8" />
              {t("documents.noMatches")}
            </div>
          )}
          {loading && (
            <div
              className={
                isAdminStyle
                  ? "py-16 text-center text-gray-500 dark:text-gray-400"
                  : "py-16 text-center text-slate-500"
              }
            >
              {t("common.loadingDocuments")}
            </div>
          )}
        </div>
        <PaginationControls
          adminTheme={isAdminStyle}
          currentPage={safeCurrentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={sortedRows.length}
          visibleFrom={visibleFrom}
          visibleTo={visibleTo}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>
      {previewDocument && (
        <DocumentPreviewModal
          document={previewDocument}
          adminTheme={isAdminStyle}
          onClose={() => setPreviewDocument(null)}
        />
      )}
      {deleteTarget && (
        <DocumentDeleteConfirmModal
          row={deleteTarget}
          deleting={deletingDocumentId === deleteTarget.document.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleAdminDelete}
        />
      )}
    </div>
  );
}

function DocumentActionButton({
  row,
  isAdminAuthenticated,
  requesting,
  downloading,
  deleting,
  onRequest,
  onReview,
  onPreview,
  onDownload,
  onDelete,
}: {
  row: DocumentRow;
  isAdminAuthenticated: boolean;
  requesting: boolean;
  downloading: boolean;
  deleting: boolean;
  onRequest: (document: ShipmentDocument) => Promise<void>;
  onReview: (
    document: ShipmentDocument,
    approvalStatus: Extract<DocumentApprovalStatus, "approved" | "rejected">,
  ) => Promise<void>;
  onPreview: (document: ShipmentDocument) => void;
  onDownload: (document: ShipmentDocument) => Promise<void>;
  onDelete: (row: DocumentRow) => void;
}) {
  const { document } = row;
  const isCustomerDocument = document.scope === "customer";
  const canReview =
    isAdminAuthenticated &&
    isCustomerDocument &&
    document.approval_status === "pending";
  const canPreview = isAdminAuthenticated && !canReview;
  const canDownload = isCustomerDocumentDownloadable(document);
  const canRequest =
    isCustomerDocument &&
    (document.approval_status === "not_requested" ||
      document.approval_status === "rejected");
  const buttonLabel = getDocumentActionLabel(document);
  const lockedTitle =
    document.scope === "internal"
      ? t("documents.internalOnly")
      : t("documents.downloadLocked");

  const handleClick = () => {
    if (canDownload) {
      void downloadShipmentDocument(document);
      return;
    }

    if (canRequest) {
      void onRequest(document);
    }
  };

  if (canReview || canPreview) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={requesting}
          onClick={() => onPreview(document)}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-transparent px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
        >
          <Eye className="h-3.5 w-3.5" />
          {t("common.view")}
        </button>
        <button
          type="button"
          disabled={downloading}
          onClick={() => void onDownload(document)}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-xl border border-cyan-200 bg-transparent px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-60 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? t("common.saving") : t("documents.downloadColumn")}
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={() => onDelete(row)}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-transparent px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleting ? t("common.saving") : t("common.delete")}
        </button>
        {canReview && (
          <>
            <button
              type="button"
              disabled={requesting}
              onClick={() => void onReview(document, "approved")}
              className="inline-flex min-w-[72px] items-center justify-center rounded-xl border border-cyan-200 bg-transparent px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-60 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
            >
              {requesting ? t("common.saving") : t("common.approve")}
            </button>
            <button
              type="button"
              disabled={requesting}
              onClick={() => void onReview(document, "rejected")}
              className="inline-flex min-w-[72px] items-center justify-center rounded-xl border border-rose-200 bg-transparent px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
            >
              {t("common.reject")}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={(!canRequest && !canDownload) || requesting}
      onClick={handleClick}
      className={`inline-flex min-w-[96px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${
        canDownload
          ? "border-cyan-200 bg-transparent text-cyan-800 hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
          : canRequest
            ? "border-cyan-200 bg-transparent text-cyan-800 hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
            : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
      }`}
      title={!canDownload && !canRequest ? lockedTitle : undefined}
    >
      {canDownload && <Download className="h-3.5 w-3.5" />}
      {requesting ? t("common.saving") : buttonLabel}
    </button>
  );
}

function DocumentDeleteConfirmModal({
  row,
  deleting,
  onCancel,
  onConfirm,
}: {
  row: DocumentRow;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("admin.userRegistration.confirmTitle", {
            action: t("common.delete"),
          })}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("documents.deleteConfirm")}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
          <div className="font-bold text-gray-900 dark:text-white">
            {row.document.name}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {row.job.invoice_number || "-"}
          </div>
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

function getDocumentActionLabel(document: ShipmentDocument) {
  if (document.scope === "internal") return t("documents.internalOnly");

  switch (document.approval_status) {
    case "not_requested":
    case "rejected":
      return t("documents.downloadRequest");
    case "pending":
      return t("documents.downloadRequestApplied");
    case "approved":
      return t("documents.downloadColumn");
  }
}

function getDocumentSortValue(row: DocumentRow, sortKey: DocumentSortKey) {
  switch (sortKey) {
    case "id":
      return row.document.id;
    case "scope":
      return row.document.scope === "internal"
        ? t("documents.internal")
        : t("documents.customer");
    case "document":
      return row.document.name;
    case "shipper":
      return row.job.shipper_name ?? "";
    case "responsibleAdmins":
      return row.responsibleAdminNames.join(" ");
    case "approval":
      return getDocumentApprovalSortValue(row.document);
    case "status":
      return statusLabels[row.job.status];
    case "downloadRequestDate":
      return row.document.approval_status === "pending"
        ? row.document.updated_at
        : "";
    case "invoice":
      return row.job.invoice_number ?? "";
    case "jobNumber":
      return row.job.job_number ?? "";
    case "parties":
      return `${row.job.shipper_name ?? ""} ${row.job.consignee_name ?? ""}`;
    case "blAwb":
      return `${row.job.mbl_mawb ?? ""} ${row.job.hbl_hawb ?? ""}`;
    case "route":
      return `${row.job.pol_aol ?? ""} ${row.job.pod_aod ?? ""}`;
  }
}

function formatShortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function formatDocumentDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("ja-JP");
}

function getDocumentApprovalSortValue(document: ShipmentDocument) {
  const statusOrder = {
    not_requested: 0,
    pending: 1,
    approved: 2,
    rejected: 3,
  } satisfies Record<ShipmentDocument["approval_status"], number>;

  return `${statusOrder[document.approval_status]}-${document.approval_status}`;
}

function compareDocumentSortValues(
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
