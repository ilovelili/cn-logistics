import * as React from "react";
import {
  AlertCircle,
  CheckCircle,
  Download,
  FileCheck2,
  FileClock,
  LockKeyhole,
  Search,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  downloadShipmentDocument,
  isCustomerDocumentDownloadable,
  DocumentApprovalStatus,
  ShipmentDocument,
  ShipmentJob,
  statusBadgeClasses,
  statusLabels,
  updateShipmentDocumentApproval,
} from "../lib/shipmentJobs";
import PaginationControls from "./PaginationControls";
import SortableTableHeader from "./SortableTableHeader";
import TableColumnSettingsButton from "./TableColumnSettings";
import { useTableColumnSettings } from "./useTableColumnSettings";

interface DocumentControlProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  isAdminAuthenticated: boolean;
  requesterEmail?: string;
  approvalFilter: DocumentApprovalFilter;
}

interface DocumentRow {
  id: string;
  job: ShipmentJob;
  document: ShipmentDocument;
}

type DocumentSortKey =
  | "id"
  | "scope"
  | "document"
  | "approval"
  | "status"
  | "invoice"
  | "parties"
  | "blAwb"
  | "route";
type SortDirection = "asc" | "desc";
type DocumentColumnId = DocumentSortKey;
export type DocumentApprovalFilter = "all" | "approved";

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
}: DocumentControlProps) {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<DocumentSortKey | null>(null);
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [requestingDocumentId, setRequestingDocumentId] = React.useState<
    string | null
  >(null);
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
      const job = jobsById.get(document.shipment_job_id);
      if (!job) return [];

      return [
        {
          id: document.id,
          job,
          document,
        },
      ];
    });
  }, [documents, isAdminAuthenticated, jobs]);

  const filteredRows = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const haystack = [
        row.document.id,
        formatShortId(row.document.id),
        row.document.name,
        row.job.invoice_number,
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
        (approvalFilter === "all" ||
          row.document.approval_status === approvalFilter)
      );
    });
  }, [approvalFilter, query, rows, scope]);

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
    approvalFilter,
    pageSize,
    query,
    scope,
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
        await updateShipmentDocumentApproval(document.id, "pending");
        await onRefresh();
        showToast("success", t("documents.downloadRequested"));
      } catch {
        showToast("error", t("documents.downloadRequestFailed"));
      } finally {
        setRequestingDocumentId(null);
      }
    },
    [onRefresh, showToast],
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

  const columns = React.useMemo<DocumentColumn[]>(() => {
    const documentColumns: DocumentColumn[] = [
      {
        id: "document",
        label: t("common.documents"),
        width: isAdminAuthenticated ? 180 : 220,
        sortKey: "document",
        render: (row) => (
          <span className="font-semibold text-slate-950">
            {row.document.name}
          </span>
        ),
      },
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
        id: "invoice",
        label: t("common.invoice"),
        width: 130,
        sortKey: "invoice",
        render: (row) => (
          <span className="font-mono">{row.job.invoice_number || "-"}</span>
        ),
      },
      {
        id: "parties",
        label: t("common.parties"),
        width: isAdminAuthenticated ? 220 : 240,
        sortKey: "parties",
        render: (row) => (
          <>
            {row.job.shipper_name || "-"} / {row.job.consignee_name || "-"}
          </>
        ),
      },
      {
        id: "blAwb",
        label: "BL/AWB",
        width: 180,
        sortKey: "blAwb",
        render: (row) => (
          <span className="font-mono text-xs">
            {row.job.mbl_mawb || "-"} / {row.job.hbl_hawb || "-"}
          </span>
        ),
      },
      {
        id: "route",
        label: t("common.route"),
        width: 180,
        sortKey: "route",
        render: (row) => (
          <>
            {row.job.pol_aol || "-"} → {row.job.pod_aod || "-"}
          </>
        ),
      },
      {
        id: "approval",
        label: isAdminAuthenticated
          ? t("documents.adminReview")
          : t("documents.downloadRequest"),
        width: 160,
        sortKey: "approval",
        render: (row) => (
          <DocumentActionButton
            row={row}
            isAdminAuthenticated={isAdminAuthenticated}
            requesting={requestingDocumentId === row.document.id}
            onRequest={handleDownloadRequest}
            onReview={handleAdminApproval}
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
                ? "bg-slate-100 text-slate-700"
                : "bg-cyan-50 text-cyan-800"
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
    handleDownloadRequest,
    isAdminAuthenticated,
    requestingDocumentId,
  ]);

  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    "document_control_table_columns",
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

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-[120] flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-2xl ${
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

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-950">
              {t("documents.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-slate-500">
              {t("documents.description")}
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div
          className={`grid grid-cols-1 gap-3 ${
            isAdminAuthenticated ? "md:grid-cols-[1fr_220px]" : ""
          }`}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("documents.searchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
            />
          </div>
          {isAdminAuthenticated && (
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
            >
              <option value="all">{t("documents.filter.all")}</option>
              <option value="customer">{t("documents.filter.customer")}</option>
              <option value="internal">{t("documents.filter.internal")}</option>
            </select>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-black text-slate-950">
              {t("documents.register")}
            </h2>
            <p className="text-sm text-slate-500">
              {t("documents.count", { count: sortedRows.length })}
            </p>
          </div>
          <TableColumnSettingsButton
            columns={orderedColumnConfigs}
            visibleColumnIds={visibleColumnIds}
            onVisibilityChange={setColumnVisibility}
            onMoveColumn={moveColumn}
            onReset={resetColumns}
          />
        </div>
        <div className="overflow-x-auto">
          <table
            className="w-full table-fixed text-left text-sm"
            style={{ minWidth: `${Math.max(tableMinWidth, 320)}px` }}
          >
            <colgroup>
              {visibleTableColumns.map((column) => (
                <col key={column.id} style={{ width: `${column.width}px` }} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                {visibleTableColumns.map((column) => (
                  <SortableTableHeader
                    key={column.id}
                    label={column.label}
                    sortKey={column.sortKey}
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap px-5 py-3"
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50/80">
                  {visibleTableColumns.map((column) => (
                    <td key={column.id} className="px-5 py-4">
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && sortedRows.length === 0 && (
            <div className="py-16 text-center text-slate-500">
              <FileClock className="mx-auto mb-3 h-8 w-8" />
              {t("documents.noMatches")}
            </div>
          )}
          {loading && (
            <div className="py-16 text-center text-slate-500">
              {t("common.loadingDocuments")}
            </div>
          )}
        </div>
        <PaginationControls
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
    </div>
  );
}

function DocumentActionButton({
  row,
  isAdminAuthenticated,
  requesting,
  onRequest,
  onReview,
}: {
  row: DocumentRow;
  isAdminAuthenticated: boolean;
  requesting: boolean;
  onRequest: (document: ShipmentDocument) => Promise<void>;
  onReview: (
    document: ShipmentDocument,
    approvalStatus: Extract<DocumentApprovalStatus, "approved" | "rejected">,
  ) => Promise<void>;
}) {
  const { document } = row;
  const isCustomerDocument = document.scope === "customer";
  const canReview =
    isAdminAuthenticated &&
    isCustomerDocument &&
    document.approval_status === "pending";
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

  if (canReview) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={requesting}
          onClick={() => void onReview(document, "approved")}
          className="inline-flex min-w-[72px] items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
        >
          {requesting ? t("common.saving") : t("common.approve")}
        </button>
        <button
          type="button"
          disabled={requesting}
          onClick={() => void onReview(document, "rejected")}
          className="inline-flex min-w-[72px] items-center justify-center rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
        >
          {t("common.reject")}
        </button>
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
          ? "border-slate-200 text-slate-700 hover:bg-slate-50"
          : canRequest
            ? "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
            : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
      }`}
      title={!canDownload && !canRequest ? lockedTitle : undefined}
    >
      {canDownload && <Download className="h-3.5 w-3.5" />}
      {requesting ? t("common.saving") : buttonLabel}
    </button>
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
    case "approval":
      return getDocumentApprovalSortValue(row.document);
    case "status":
      return statusLabels[row.job.status];
    case "invoice":
      return row.job.invoice_number ?? "";
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
