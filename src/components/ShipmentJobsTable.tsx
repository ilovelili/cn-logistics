import {
  AlertCircle,
  CalendarDays,
  CheckCircle,
  Eye,
  FileClock,
  FileText,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { t } from "../lib/i18n";
import {
  isCustomerDocumentDownloadable,
  isShipmentDocumentPreviewable,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatusColorMap,
  shipmentStatusOrder,
  statusBadgeClasses,
  statusLabels,
  tradeModeLabels,
  transportModeLabels,
  softDeleteShipmentDocument,
  updateShipmentDocumentApproval,
} from "../lib/shipmentJobs";
import PaginationControls from "./PaginationControls";
import DocumentPreviewModal from "./DocumentPreviewModal";
import SortableTableHeader, { SortDirection } from "./SortableTableHeader";
import StickyTableHeaderToggle from "./StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "./useStickyTableHeaderPreference";
import TableHorizontalScrollHint from "./TableHorizontalScrollHint";
import TableScrollToTopButton from "./TableScrollToTopButton";
import TableColumnSettingsButton from "./TableColumnSettings";
import InstantTooltip from "./InstantTooltip";
import { useHorizontalScrollHint } from "./useHorizontalScrollHint";
import { useTableColumnSettings } from "./useTableColumnSettings";
import {
  getResponsibleAdminAssignments,
  getShipmentJobWorkingDays,
  type ShipmentJobsShipperOption,
} from "./shipmentJobsTableUtils";
import ShipperNameDetailButton from "./ShipperNameDetailButton";
import ResponsibleAdminBadges from "./ResponsibleAdminBadges";
import type { AdminOperator } from "../lib/adminOperators";
import type { ShipperUser } from "../lib/shipperUsers";

export type ShipmentJobsTableSortKey =
  | "id"
  | "shipper_name"
  | "responsible_admins"
  | "status"
  | "working_days"
  | "trade"
  | "invoice_number"
  | "job_number"
  | "transport_mode"
  | "consignee_name"
  | "pol_aol"
  | "pod_aod"
  | "vessel_flight_numbers"
  | "mbl_mawb"
  | "hbl_hawb"
  | "bl_awb_date";

type ShipmentJobsTableColumnId =
  | ShipmentJobsTableSortKey
  | "documents"
  | "internal_documents"
  | "action";

interface ShipmentJobsTableColumn {
  id: ShipmentJobsTableColumnId;
  label: string;
  width: number;
  sortKey?: ShipmentJobsTableSortKey;
  render: (job: ShipmentJob) => ReactNode;
}

interface ShipmentDocumentDeleteTarget {
  job: ShipmentJob;
  document: ShipmentDocument;
}

const columnSettingsStorageKey = "shipment_jobs_table_columns_v8";

interface ShipmentJobsTableProps {
  totalJobs: number;
  sortedJobs: ShipmentJob[];
  paginatedJobs: ShipmentJob[];
  documentsByJob: Record<string, ShipmentDocument[]>;
  statusColorMap?: ShipmentStatusColorMap;
  loading: boolean;
  showInternalDocuments?: boolean;
  selectedJobId?: string | null;
  sortKey: ShipmentJobsTableSortKey | null;
  sortDirection: SortDirection;
  currentPage: number;
  pageCount: number;
  pageSize: number;
  visibleFrom: number;
  visibleTo: number;
  adminTheme?: boolean;
  approvedDocumentsOnly?: boolean;
  shipperOptions?: ShipmentJobsShipperOption[];
  shipperUsers?: ShipperUser[];
  requesterEmail?: string;
  isSuperAdmin?: boolean;
  adminOperators?: AdminOperator[];
  onSort: (sortKey: ShipmentJobsTableSortKey) => void;
  onSelectJob: (job: ShipmentJob) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRefresh?: () => Promise<void>;
}

export default function ShipmentJobsTable({
  totalJobs,
  sortedJobs,
  paginatedJobs,
  documentsByJob,
  statusColorMap = {},
  loading,
  showInternalDocuments = false,
  selectedJobId,
  sortKey,
  sortDirection,
  currentPage,
  pageCount,
  pageSize,
  visibleFrom,
  visibleTo,
  adminTheme = false,
  approvedDocumentsOnly = false,
  shipperOptions = [],
  shipperUsers = [],
  requesterEmail,
  isSuperAdmin = false,
  adminOperators = [],
  onSort,
  onSelectJob,
  onPageChange,
  onPageSizeChange,
  onRefresh,
}: ShipmentJobsTableProps) {
  const [previewDocument, setPreviewDocument] =
    useState<ShipmentDocument | null>(null);
  const [requestingDocumentId, setRequestingDocumentId] = useState<
    string | null
  >(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<ShipmentDocumentDeleteTarget | null>(null);
  const [expandedDocumentJobId, setExpandedDocumentJobId] = useState<
    string | null
  >(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollHint = useHorizontalScrollHint(scrollContainerRef);
  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);
  const requestDocument = useCallback(async (document: ShipmentDocument) => {
    if (!requesterEmail || !canRequestDocument(document)) return;

    setRequestingDocumentId(document.id);
    try {
      await updateShipmentDocumentApproval(
        document.id,
        "pending",
        requesterEmail,
      );
      await onRefresh?.();
      showToast(
        "success",
        t("documents.batchRequested", { count: 1 }),
      );
    } catch {
      showToast("error", t("documents.batchRequestFailed"));
    } finally {
      setRequestingDocumentId(null);
    }
  }, [
    onRefresh,
    requesterEmail,
    showToast,
  ]);
  const approveDocument = useCallback(async (document: ShipmentDocument) => {
    if (!requesterEmail || document.approval_status !== "pending") return;

    setRequestingDocumentId(document.id);
    try {
      await updateShipmentDocumentApproval(
        document.id,
        "approved",
        requesterEmail,
      );
      await onRefresh?.();
      showToast("success", t("admin.documents.approved"));
    } catch {
      showToast("error", t("admin.documents.updateFailed"));
    } finally {
      setRequestingDocumentId(null);
    }
  }, [
    onRefresh,
    requesterEmail,
    showToast,
  ]);
  const deleteDocument = useCallback(async () => {
    if (!deleteTarget || !requesterEmail) return;

    setDeletingDocumentId(deleteTarget.document.id);
    try {
      await softDeleteShipmentDocument(deleteTarget.document.id, requesterEmail);
      await onRefresh?.();
      showToast(
        "success",
        t("documents.deletedWithName", { name: deleteTarget.document.name }),
      );
      setDeleteTarget(null);
    } catch {
      showToast("error", t("documents.deleteFailed"));
    } finally {
      setDeletingDocumentId(null);
    }
  }, [deleteTarget, onRefresh, requesterEmail, showToast]);
  const canDeleteDocuments = Boolean(requesterEmail) && !approvedDocumentsOnly;
  const columns = useMemo(
    () =>
      buildColumns(
        documentsByJob,
        adminTheme,
        showInternalDocuments,
        approvedDocumentsOnly,
        shipperOptions,
        shipperUsers,
        requesterEmail,
        isSuperAdmin,
        adminOperators,
        statusColorMap,
        requestingDocumentId,
        deletingDocumentId,
        canDeleteDocuments,
        expandedDocumentJobId,
        setExpandedDocumentJobId,
        setPreviewDocument,
        requestDocument,
        approveDocument,
        setDeleteTarget,
      ),
    [
      adminTheme,
      shipperOptions,
      documentsByJob,
      approvedDocumentsOnly,
      showInternalDocuments,
      shipperUsers,
      requesterEmail,
      isSuperAdmin,
      adminOperators,
      statusColorMap,
      requestingDocumentId,
      deletingDocumentId,
      canDeleteDocuments,
      expandedDocumentJobId,
      setPreviewDocument,
      requestDocument,
      approveDocument,
      setDeleteTarget,
    ],
  );
  const columnSettingsRoleKey = `${columnSettingsStorageKey}-${
    adminTheme
      ? showInternalDocuments
        ? "admin-internal"
        : "admin"
      : "customer"
  }`;
  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    columnSettingsRoleKey,
    columns.map((column) => ({ id: column.id, label: column.label })),
  );
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const visibleTableColumns = visibleColumns
    .map((column) => columnsById.get(column.id))
    .filter((column): column is ShipmentJobsTableColumn => Boolean(column));
  const orderedColumnConfigs = orderedColumns.map((column) => ({
    id: column.id,
    label: column.label,
  }));
  const tableMinWidth = visibleColumns.reduce(
    (total, column) => total + (columnsById.get(column.id)?.width ?? 0),
    0,
  );
  return (
    <section
      className={`overflow-hidden border bg-white shadow-sm ${
        adminTheme
          ? "rounded-xl border-gray-200 dark:border-gray-800 dark:bg-gray-900"
          : "rounded-3xl border-slate-200"
      }`}
      data-tutorial-target="shipment-table"
    >
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
        className={`flex items-center justify-between border-b px-5 py-4 ${
          adminTheme
            ? "border-gray-200 dark:border-gray-800"
            : "border-slate-200"
        }`}
      >
        <div className="flex items-center">
          <div>
            <h2
              className={`font-black ${
                adminTheme ? "text-gray-900 dark:text-white" : "text-slate-950"
              }`}
            >
              {t("jobs.list")}
            </h2>
            <p
              className={`text-sm ${
                adminTheme
                  ? "text-gray-500 dark:text-gray-400"
                  : "text-slate-500"
              }`}
            >
              {t("jobs.count", {
                total: totalJobs,
                filtered: sortedJobs.length,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StickyTableHeaderToggle
            adminTheme={adminTheme}
            enabled={stickyHeaderEnabled}
            onToggle={toggleStickyHeader}
          />
          <TableColumnSettingsButton
            columns={orderedColumnConfigs}
            visibleColumnIds={visibleColumnIds}
            onVisibilityChange={setColumnVisibility}
            onMoveColumn={moveColumn}
            onReset={resetColumns}
            adminTheme={adminTheme}
          />
        </div>
      </div>

      {(scrollHint.canScroll || tableMinWidth > 320) && (
        <div
          className={`flex justify-end border-b px-5 py-2 sm:${scrollHint.canScroll ? "flex" : "hidden"} ${
            adminTheme
              ? "border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950/40"
              : "border-slate-200 bg-slate-50/70"
          }`}
        >
          <TableHorizontalScrollHint
            adminTheme={adminTheme}
            atStart={scrollHint.atStart}
            atEnd={scrollHint.atEnd}
            onScroll={scrollHint.scrollByDirection}
          />
        </div>
      )}

      <div className="relative">
        {scrollHint.canScroll && !scrollHint.atStart && (
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 ${
              adminTheme
                ? "bg-gradient-to-r from-white via-white/85 to-transparent dark:from-gray-900 dark:via-gray-900/85"
                : "bg-gradient-to-r from-white via-white/85 to-transparent"
            }`}
            aria-hidden="true"
          />
        )}
        {scrollHint.canScroll && !scrollHint.atEnd && (
          <div
            className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 ${
              adminTheme
                ? "bg-gradient-to-l from-white via-white/85 to-transparent dark:from-gray-900 dark:via-gray-900/85"
                : "bg-gradient-to-l from-white via-white/85 to-transparent"
            }`}
            aria-hidden="true"
          />
        )}
        <div
          ref={scrollContainerRef}
          className="max-h-[70vh] overflow-auto overscroll-contain"
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
              className={`${stickyHeaderEnabled ? "sticky top-0 z-20 shadow-sm" : ""} text-xs uppercase tracking-[0.14em] text-slate-500 ${
                adminTheme
                  ? "bg-slate-50 dark:bg-gray-950 dark:text-gray-400"
                  : "bg-slate-50"
              }`}
            >
              <tr>
                {visibleTableColumns.map((column, index) =>
                  column.sortKey ? (
                    <SortableTableHeader
                      key={column.id}
                      label={column.label}
                      sortKey={column.sortKey}
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={onSort}
                      buttonClassName={`inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-left transition ${
                        adminTheme
                          ? "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-gray-800 dark:hover:text-white"
                          : "hover:bg-slate-100 hover:text-slate-900"
                      }`}
                      activeClassName={
                        adminTheme
                          ? "text-slate-950 dark:text-white"
                          : "text-slate-950"
                      }
                      inactiveClassName={
                        adminTheme ? "text-slate-500 dark:text-gray-400" : ""
                      }
                      className={
                        index === 0
                          ? `sticky left-0 z-30 whitespace-nowrap py-3 pl-3 pr-5 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)] ${
                              adminTheme
                                ? "bg-slate-50 dark:bg-gray-950"
                                : "bg-slate-50"
                            }`
                          : "whitespace-nowrap px-3 py-3"
                      }
                    />
                  ) : (
                    <th
                      key={column.id}
                      className={`whitespace-nowrap px-3 py-3 text-left ${
                        index === 0
                          ? `sticky left-0 z-30 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)] ${
                              adminTheme
                                ? "bg-slate-50 dark:bg-gray-950"
                                : "bg-slate-50"
                            }`
                          : ""
                      }`}
                    >
                      {column.label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                adminTheme
                  ? "divide-gray-100 dark:divide-gray-800"
                  : "divide-slate-100"
              }`}
            >
              {paginatedJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={(event) => {
                      if (isInteractiveTableEvent(event)) return;
                      setExpandedDocumentJobId((currentJobId) =>
                        currentJobId === job.id ? null : job.id,
                      );
                    }}
                    onDoubleClick={(event) => {
                      if (isInteractiveTableEvent(event)) return;
                      onSelectJob(job);
                  }}
                  className={`align-top transition ${
                    selectedJobId === job.id
                      ? "cursor-pointer bg-cyan-50/80 dark:bg-cyan-950/20"
                      : adminTheme
                        ? "cursor-pointer hover:bg-slate-50/80 dark:hover:bg-gray-800/70"
                        : "cursor-pointer hover:bg-slate-50/80"
                  }`}
                >
                  {visibleTableColumns.map((column, index) => (
                    <td
                      key={column.id}
                      data-tutorial-target={
                        column.id === "documents" ? "shipment-documents" : undefined
                      }
                      className={`px-3 py-2 ${
                        index === 0
                          ? `sticky left-0 z-10 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)] ${
                              selectedJobId === job.id
                                ? "bg-cyan-50 dark:bg-cyan-950"
                                : adminTheme
                                  ? "bg-white dark:bg-gray-900"
                                  : "bg-white"
                            }`
                          : ""
                      }`}
                    >
                      {column.render(job)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && sortedJobs.length === 0 && (
            <div
              className={`py-16 text-center ${
                adminTheme
                  ? "text-slate-500 dark:text-gray-400"
                  : "text-slate-500"
              }`}
            >
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
        <TableScrollToTopButton
          adminTheme={adminTheme}
          onClick={() =>
            scrollContainerRef.current?.scrollTo({
              top: 0,
              behavior: "smooth",
            })
          }
        />
      </div>
      <PaginationControls
        adminTheme={adminTheme}
        currentPage={currentPage}
        pageCount={pageCount}
        pageSize={pageSize}
        total={sortedJobs.length}
        visibleFrom={visibleFrom}
        visibleTo={visibleTo}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
      {previewDocument &&
        (!approvedDocumentsOnly ||
          isShipmentDocumentPreviewable(previewDocument)) && (
          <DocumentPreviewModal
            document={previewDocument}
            adminTheme={adminTheme}
            hideNativeToolbar={
              approvedDocumentsOnly &&
              !isCustomerDocumentDownloadable(previewDocument)
            }
            onClose={() => setPreviewDocument(null)}
          />
        )}
      {deleteTarget && (
        <ShipmentDocumentDeleteConfirmModal
          target={deleteTarget}
          deleting={deletingDocumentId === deleteTarget.document.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void deleteDocument()}
        />
      )}
    </section>
  );
}

function isInteractiveTableEvent(event: MouseEvent<HTMLElement>) {
  return Boolean(
    (event.target as HTMLElement).closest(
      "a,button,input,select,textarea,[role='button']",
    ),
  );
}

function buildColumns(
  documentsByJob: Record<string, ShipmentDocument[]>,
  adminTheme: boolean,
  showInternalDocuments: boolean,
  approvedDocumentsOnly: boolean,
  shipperOptions: ShipmentJobsShipperOption[],
  shipperUsers: ShipperUser[],
  requesterEmail: string | undefined,
  isSuperAdmin: boolean,
  adminOperators: AdminOperator[],
  statusColorMap: ShipmentStatusColorMap,
  requestingDocumentId: string | null,
  deletingDocumentId: string | null,
  canDeleteDocuments: boolean,
  expandedDocumentJobId: string | null,
  onExpandedDocumentJobIdChange: (jobId: string | null) => void,
  onPreviewDocument: (document: ShipmentDocument) => void,
  onRequestDocument: (document: ShipmentDocument) => void,
  onApproveDocument: (document: ShipmentDocument) => void,
  onDeleteDocument: (target: ShipmentDocumentDeleteTarget) => void,
): ShipmentJobsTableColumn[] {
  const mutedText = adminTheme ? "text-slate-700 dark:text-gray-300" : "";
  const strongText = adminTheme
    ? "text-slate-900 dark:text-white"
    : "text-slate-900";

  const columns: ShipmentJobsTableColumn[] = [
    {
      id: "invoice_number",
      label: t("common.invoice"),
      width: 120,
      sortKey: "invoice_number",
      render: (job) => (
        <span className={`whitespace-nowrap font-mono ${strongText}`}>
          {job.invoice_number || "-"}
        </span>
      ),
    },
    {
      id: "job_number",
      label: t("common.jobNumber"),
      width: 120,
      sortKey: "job_number",
      render: (job) => (
        <span className={`whitespace-nowrap font-mono ${strongText}`}>
          {job.job_number || "-"}
        </span>
      ),
    },
    {
      id: "shipper_name",
      label: t("common.shipperName"),
      width: 150,
      sortKey: "shipper_name",
      render: (job) => (
        <ShipperNameDetailButton
          shipperName={job.shipper_name}
          shipperUsers={shipperUsers}
          requesterEmail={requesterEmail}
          isSuperAdmin={isSuperAdmin}
          adminOperators={adminOperators}
          className={`block max-w-full truncate text-left font-semibold text-cyan-700 underline-offset-4 transition hover:text-cyan-500 hover:underline dark:text-cyan-300 dark:hover:text-cyan-200`}
          fallbackClassName={`block truncate font-semibold ${strongText}`}
        />
      ),
    },
    ...(shipperOptions.length > 0
      ? [
          {
            id: "responsible_admins" as const,
            label: t("admin.userRegistration.assignedAdmins"),
            width: 240,
            sortKey: "responsible_admins" as const,
            render: (job: ShipmentJob) => (
              <ResponsibleAdminBadges
                assignments={getResponsibleAdminAssignments(
                  job,
                  shipperOptions,
                )}
                emptyClassName="text-slate-400"
              />
            ),
          },
        ]
      : []),
    {
      id: "status",
      label: t("common.status"),
      width: 110,
      sortKey: "status",
      render: (job) => (
        <ShipmentProgressStatus job={job} statusColorMap={statusColorMap} />
      ),
    },
    {
      id: "working_days",
      label: t("common.workingDaysSpent"),
      width: 130,
      sortKey: "working_days",
      render: (job) => <WorkingDaysBadge job={job} />,
    },
    {
      id: "documents",
      label: t("common.documents"),
      width: 320,
      render: (job) => (
        <DocumentPills
          documents={documentsByJob[job.id]?.filter(
            (document) => document.scope === "customer",
          )}
          expanded={expandedDocumentJobId === job.id}
          approvedOnly={approvedDocumentsOnly}
          requesterEmail={requesterEmail}
          requestingDocumentId={requestingDocumentId}
          deletingDocumentId={deletingDocumentId}
          canDelete={canDeleteDocuments}
          onRequest={onRequestDocument}
          onApprove={onApproveDocument}
          onDelete={(document) => onDeleteDocument({ job, document })}
          onPreview={onPreviewDocument}
          onToggleExpanded={() =>
            onExpandedDocumentJobIdChange(
              expandedDocumentJobId === job.id ? null : job.id,
            )
          }
        />
      ),
    },
    ...(showInternalDocuments
      ? [
          {
            id: "internal_documents" as const,
            label: t("common.internalDocuments"),
            width: 320,
            render: (job: ShipmentJob) => (
              <DocumentPills
                documents={documentsByJob[job.id]?.filter(
                  (document) => document.scope === "internal",
                )}
                expanded={expandedDocumentJobId === job.id}
                muted
                deletingDocumentId={deletingDocumentId}
                canDelete={canDeleteDocuments}
                onDelete={(document) => onDeleteDocument({ job, document })}
                onPreview={onPreviewDocument}
                onToggleExpanded={() =>
                  onExpandedDocumentJobIdChange(
                    expandedDocumentJobId === job.id ? null : job.id,
                  )
                }
              />
            ),
          },
        ]
      : []),
    {
      id: "trade",
      label: t("common.trade"),
      width: 100,
      sortKey: "trade",
      render: (job) => (
        <>
          <div className={`whitespace-nowrap font-bold ${strongText}`}>
            {tradeModeLabels[job.trade_mode]}
          </div>
          <div
            className={`whitespace-nowrap text-xs ${
              adminTheme
                ? "text-slate-500 dark:text-gray-400"
                : "text-slate-500"
            }`}
          >
            {job.trade_term || "-"}
          </div>
        </>
      ),
    },
    {
      id: "transport_mode",
      label: t("common.transport"),
      width: 100,
      sortKey: "transport_mode",
      render: (job) => (
        <span className={`whitespace-nowrap ${mutedText}`}>
          {job.transport_mode ? transportModeLabels[job.transport_mode] : "-"}
        </span>
      ),
    },
    {
      id: "consignee_name",
      label: t("common.consignee"),
      width: 145,
      sortKey: "consignee_name",
      render: (job) => (
        <span className={`font-medium ${strongText}`}>
          {job.consignee_name || "-"}
        </span>
      ),
    },
    {
      id: "pol_aol",
      label: "POL/AOL",
      width: 130,
      sortKey: "pol_aol",
      render: (job) => (
        <span className={`whitespace-nowrap ${mutedText}`}>
          {job.pol_aol || "-"}
        </span>
      ),
    },
    {
      id: "pod_aod",
      label: "POD/AOD",
      width: 130,
      sortKey: "pod_aod",
      render: (job) => (
        <span className={`whitespace-nowrap ${mutedText}`}>
          {job.pod_aod || "-"}
        </span>
      ),
    },
    {
      id: "vessel_flight_numbers",
      label: t("common.vesselFlightNo"),
      width: 170,
      sortKey: "vessel_flight_numbers",
      render: (job) => (
        <div
          className={`text-xs ${
            adminTheme ? "text-slate-700 dark:text-gray-300" : "text-slate-700"
          }`}
        >
          <VesselFlightList values={job.vessel_flight_numbers} />
        </div>
      ),
    },
    {
      id: "mbl_mawb",
      label: "MBL/MAWB",
      width: 135,
      sortKey: "mbl_mawb",
      render: (job) => (
        <span className={`whitespace-nowrap font-mono text-xs ${mutedText}`}>
          {job.mbl_mawb || "-"}
        </span>
      ),
    },
    {
      id: "hbl_hawb",
      label: "HBL/HAWB",
      width: 135,
      sortKey: "hbl_hawb",
      render: (job) => (
        <span className={`whitespace-nowrap font-mono text-xs ${mutedText}`}>
          {job.hbl_hawb || "-"}
        </span>
      ),
    },
    {
      id: "bl_awb_date",
      label: t("common.blAwbDate"),
      width: 150,
      sortKey: "bl_awb_date",
      render: (job) => (
        <div
          className={`flex items-center gap-2 whitespace-nowrap ${
            adminTheme ? "text-slate-700 dark:text-gray-300" : "text-slate-700"
          }`}
        >
          <CalendarDays className="h-4 w-4 text-slate-400" />
          {job.bl_awb_date || "-"}
        </div>
      ),
    },
  ];

  return columns;
}

function DocumentPills({
  documents,
  expanded,
  muted = false,
  approvedOnly = false,
  requesterEmail,
  requestingDocumentId,
  deletingDocumentId,
  canDelete = false,
  onRequest,
  onApprove,
  onDelete,
  onPreview,
  onToggleExpanded,
}: {
  documents?: ShipmentDocument[];
  expanded: boolean;
  muted?: boolean;
  approvedOnly?: boolean;
  requesterEmail?: string;
  requestingDocumentId?: string | null;
  deletingDocumentId?: string | null;
  canDelete?: boolean;
  onRequest?: (document: ShipmentDocument) => void;
  onApprove?: (document: ShipmentDocument) => void;
  onDelete?: (document: ShipmentDocument) => void;
  onPreview: (document: ShipmentDocument) => void;
  onToggleExpanded: () => void;
}) {
  if (!documents?.length) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onToggleExpanded();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onToggleExpanded();
      }}
      className={`flex flex-col items-start gap-1.5 overflow-hidden transition-[max-height] duration-150 focus:outline-none ${
        expanded ? "max-h-96" : "max-h-10"
      }`}
    >
      {documents.map((document) => {
        const canPreview =
          !approvedOnly || isShipmentDocumentPreviewable(document);
        const canRequest =
          !muted &&
          approvedOnly &&
          Boolean(requesterEmail) &&
          Boolean(onRequest) &&
          canRequestDocument(document);
        const canApprove =
          !muted &&
          !approvedOnly &&
          Boolean(requesterEmail) &&
          Boolean(onApprove) &&
          document.approval_status === "pending";
        const isPendingRequest =
          !muted && approvedOnly && document.approval_status === "pending";
        const showDelete = canDelete && Boolean(onDelete);
        const actionButtonBase =
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50";
        const rowClass = muted
          ? "border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20"
          : "border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900";
        const nameClass = muted
          ? "text-indigo-700 dark:text-indigo-200"
          : canPreview
            ? "text-cyan-800 dark:text-cyan-200"
            : "text-slate-500 dark:text-gray-400";
        const content = (
          <>
            <FileText className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate" title={document.name}>
              {document.name}
            </span>
          </>
        );

        return (
          <div
            key={document.id}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded();
            }}
            className={`w-full rounded-lg border px-2 py-1.5 ${rowClass}`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={`inline-flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold ${nameClass}`}
                title={document.name}
              >
                {content}
              </span>
              <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
                {canPreview && (
                  <InstantTooltip label={t("documents.preview")}>
                    {(tooltipId) => (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreview(document);
                        }}
                        className={`${actionButtonBase} border-cyan-200 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40`}
                        aria-label={t("documents.preview")}
                        aria-describedby={tooltipId}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </InstantTooltip>
                )}
                {(canRequest || isPendingRequest || canApprove) && (
                  <InstantTooltip
                    label={
                      canApprove
                        ? t("documents.downloadApprove")
                        : t("documents.downloadRequest")
                    }
                  >
                    {(tooltipId) => (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (canApprove) {
                            onApprove?.(document);
                          } else if (canRequest) {
                            onRequest?.(document);
                          }
                        }}
                        disabled={
                          isPendingRequest ||
                          requestingDocumentId === document.id
                        }
                        className={`${actionButtonBase} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50`}
                        aria-label={
                          canApprove
                            ? t("documents.downloadApprove")
                            : t("documents.downloadRequest")
                        }
                        aria-describedby={tooltipId}
                      >
                        <FileClock className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </InstantTooltip>
                )}
                {showDelete && (
                  <InstantTooltip label={t("common.delete")}>
                    {(tooltipId) => (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete?.(document);
                        }}
                        disabled={deletingDocumentId === document.id}
                        className={`${actionButtonBase} border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40`}
                        aria-label={t("common.delete")}
                        aria-describedby={tooltipId}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </InstantTooltip>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function canRequestDocument(document: ShipmentDocument) {
  return (
    document.approval_status === "not_requested" ||
    document.approval_status === "rejected"
  );
}

function ShipmentDocumentDeleteConfirmModal({
  target,
  deleting,
  onCancel,
  onConfirm,
}: {
  target: ShipmentDocumentDeleteTarget;
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
            {target.document.name}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("common.invoice")}: {target.job.invoice_number || "-"}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("common.jobNumber")}: {target.job.job_number || "-"}
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

function ShipmentProgressStatus({
  job,
  statusColorMap,
}: {
  job: ShipmentJob;
  statusColorMap: ShipmentStatusColorMap;
}) {
  const activeStepCount = getShipmentProgressStepCount(job);
  const progressPercent = getShipmentProgressPercent(job, activeStepCount);
  const progressLabel = getShipmentProgressLabel(
    job,
    activeStepCount,
    progressPercent,
  );
  const statusClass = statusBadgeClasses[job.status];
  const customColor = job.progress_color_hex || statusColorMap[job.status];
  const customBadgeStyle = customColor
    ? getStatusColorBadgeStyle(customColor)
    : undefined;

  return (
    <div className="space-y-2">
      <span
        className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}
        style={customBadgeStyle}
      >
        {statusLabels[job.status]}
      </span>
      <div
        className="h-2 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        aria-label={t("common.status")}
        title={progressLabel}
      >
        <span
          className="block h-full rounded-full transition-[width]"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: customColor || getDefaultManualProgressColor(job),
          }}
        />
      </div>
    </div>
  );
}

function getShipmentProgressStepCount(job: ShipmentJob) {
  if (typeof job.progress_step === "number") {
    return Math.max(1, Math.min(10, Math.round(job.progress_step)));
  }

  if (typeof job.progress_percent === "number") {
    return Math.max(0, Math.min(10, Math.ceil(job.progress_percent / 10)));
  }

  if (job.status === "completed" || job.status === "delivered") {
    return 10;
  }

  const latestSortOrder = Math.max(
    0,
    ...(job.tracking_events ?? []).map((event) => event.sort_order ?? 0),
  );

  if (latestSortOrder > 0) {
    const stepCount =
      latestSortOrder >= 10 ? Math.ceil(latestSortOrder / 10) : latestSortOrder + 1;
    return Math.max(1, Math.min(10, stepCount));
  }

  if (job.status === "customs_hold") {
    return 7;
  }

  const statusIndex = shipmentStatusOrder.indexOf(job.status);
  return statusIndex >= 0 ? statusIndex + 1 : 1;
}

function getShipmentProgressPercent(job: ShipmentJob, activeStepCount: number) {
  if (typeof job.progress_percent === "number") {
    return Math.max(0, Math.min(100, Math.round(job.progress_percent)));
  }

  return Math.max(0, Math.min(100, activeStepCount * 10));
}

function getShipmentProgressLabel(
  job: ShipmentJob,
  activeStepCount: number,
  progressPercent: number,
) {
  const progressPercentLabel =
    typeof job.progress_percent === "number" ? `${progressPercent}%` : null;
  const progressStep =
    typeof job.progress_step === "number"
      ? `${Math.max(1, Math.min(10, Math.round(job.progress_step)))}/10`
      : `${activeStepCount}/10`;

  return progressPercentLabel
    ? `${progressPercentLabel} (${progressStep})`
    : progressStep;
}

function getStatusColorBadgeStyle(color: string) {
  return {
    backgroundColor: `${color}1a`,
    borderColor: `${color}66`,
    color,
  };
}

function getDefaultManualProgressColor(job: ShipmentJob) {
  if (job.status === "customs_hold") {
    return "#d97706";
  }

  if (job.status === "completed" || job.status === "delivered") {
    return "#059669";
  }

  return "#059669";
}

function WorkingDaysBadge({ job }: { job: ShipmentJob }) {
  const workingDays = getShipmentJobWorkingDays(job);

  if (!workingDays) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
      {workingDays}営業日
    </span>
  );
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
