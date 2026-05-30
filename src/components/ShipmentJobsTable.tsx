import { CalendarDays, FileText, MoreHorizontal } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "../lib/i18n";
import {
  isCustomerDocumentDownloadable,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatusColorMap,
  shipmentStatusOrder,
  statusBadgeClasses,
  statusLabels,
  tradeModeLabels,
  transportModeLabels,
} from "../lib/shipmentJobs";
import PaginationControls from "./PaginationControls";
import DocumentPreviewModal from "./DocumentPreviewModal";
import SortableTableHeader, { SortDirection } from "./SortableTableHeader";
import StickyTableHeaderToggle from "./StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "./useStickyTableHeaderPreference";
import TableHorizontalScrollHint from "./TableHorizontalScrollHint";
import TableColumnSettingsButton from "./TableColumnSettings";
import TableActionButton from "./TableActionButton";
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

const columnSettingsStorageKey = "shipment_jobs_table_columns_v6";

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
}: ShipmentJobsTableProps) {
  const [previewDocument, setPreviewDocument] =
    useState<ShipmentDocument | null>(null);
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollHint = useHorizontalScrollHint(scrollContainerRef);
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
        onSelectJob,
        setPreviewDocument,
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
      onSelectJob,
      setPreviewDocument,
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
    >
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
                          ? "whitespace-nowrap py-3 pl-3 pr-5"
                          : "whitespace-nowrap px-3 py-3"
                      }
                    />
                  ) : (
                    <th
                      key={column.id}
                      className="whitespace-nowrap px-3 py-3 text-left"
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
                  className={`align-top transition ${
                    selectedJobId === job.id
                      ? "bg-cyan-50/80 dark:bg-cyan-950/20"
                      : adminTheme
                        ? "hover:bg-slate-50/80 dark:hover:bg-gray-800/70"
                        : "hover:bg-slate-50/80"
                  }`}
                >
                  {visibleTableColumns.map((column) => (
                    <td key={column.id} className="px-3 py-4">
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
          isCustomerDocumentDownloadable(previewDocument)) && (
          <DocumentPreviewModal
            document={previewDocument}
            adminTheme={adminTheme}
            onClose={() => setPreviewDocument(null)}
          />
        )}
    </section>
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
  onSelectJob: (job: ShipmentJob) => void,
  onPreviewDocument: (document: ShipmentDocument) => void,
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
            width: 120,
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
      width: 180,
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
    {
      id: "documents",
      label: t("common.documents"),
      width: 190,
      render: (job) => (
        <DocumentPills
          documents={documentsByJob[job.id]?.filter(
            (document) => document.scope === "customer",
          )}
          approvedOnly={approvedDocumentsOnly}
          onPreview={onPreviewDocument}
        />
      ),
    },
  ];

  if (showInternalDocuments) {
    columns.push({
      id: "internal_documents",
      label: t("common.internalDocuments"),
      width: 170,
      render: (job) => (
        <DocumentPills
          documents={documentsByJob[job.id]?.filter(
            (document) => document.scope === "internal",
          )}
          muted
          onPreview={onPreviewDocument}
        />
      ),
    });
  }

  columns.push({
    id: "action",
    label: t("admin.userRegistration.action"),
    width: 110,
    render: (job) => (
      <TableActionButton variant="primary" onClick={() => onSelectJob(job)}>
        {t("common.edit")}
      </TableActionButton>
    ),
  });

  return columns;
}

function DocumentPills({
  documents,
  muted = false,
  approvedOnly = false,
  onPreview,
}: {
  documents?: ShipmentDocument[];
  muted?: boolean;
  approvedOnly?: boolean;
  onPreview: (document: ShipmentDocument) => void;
}) {
  if (!documents?.length) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {documents.map((document) => {
        const canPreview =
          !approvedOnly || isCustomerDocumentDownloadable(document);
        const pillClass = muted
          ? "border border-indigo-200 bg-transparent text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-200 dark:hover:bg-indigo-950/40"
          : !canPreview
            ? "bg-slate-100 text-slate-400 dark:bg-gray-800 dark:text-gray-500"
            : "border border-cyan-200 bg-transparent text-cyan-800 transition hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40";
        const content = (
          <>
            <FileText className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate" title={document.name}>
              {document.name}
            </span>
          </>
        );

        if (!canPreview) {
          return (
            <span
              key={document.id}
              onClick={(event) => event.stopPropagation()}
              className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass}`}
              title={document.name}
            >
              {content}
            </span>
          );
        }

        return (
          <button
            type="button"
            key={document.id}
            onClick={(event) => {
              event.stopPropagation();
              if (canPreview) {
                onPreview(document);
              }
            }}
            className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass}`}
            title={document.name}
          >
            {content}
          </button>
        );
      })}
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
  const completedAt = getShipmentCompletedAt(job);
  const isCompletedStatus =
    job.status === "completed" || job.status === "delivered";
  const recentlyCompleted =
    isCompletedStatus && isWithinRecentBusinessDays(completedAt, 3);
  const staleCompleted = isCompletedStatus && !recentlyCompleted;
  const activeStepCount = getShipmentProgressStepCount(job);
  const statusClass = staleCompleted
    ? "border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
    : statusBadgeClasses[job.status];
  const customColor = !staleCompleted ? statusColorMap[job.status] : undefined;
  const customBadgeStyle = customColor
    ? getStatusColorBadgeStyle(customColor)
    : undefined;

  return (
    <div className="min-w-[150px] space-y-2">
      <span
        className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}
        style={customBadgeStyle}
      >
        {statusLabels[job.status]}
      </span>
      <div
        className="grid grid-cols-10 gap-0.5"
        aria-label={t("common.status")}
        title={`${activeStepCount}/10`}
      >
        {Array.from({ length: 10 }, (_, stepIndex) => (
          <span
            key={stepIndex}
            className={`h-1.5 rounded-full ${getProgressSegmentClass(
              stepIndex,
              activeStepCount,
              job.status,
              staleCompleted,
            )}`}
            style={getProgressSegmentStyle(
              stepIndex,
              activeStepCount,
              customColor,
              staleCompleted,
            )}
          />
        ))}
      </div>
    </div>
  );
}

function getShipmentProgressStepCount(job: ShipmentJob) {
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

function getShipmentCompletedAt(job: ShipmentJob) {
  if (job.status !== "completed" && job.status !== "delivered") {
    return null;
  }

  const completionEvent = [...(job.tracking_events ?? [])]
    .filter(
      (event) =>
        (event.sort_order ?? 0) >= 100 || event.description.includes("完了"),
    )
    .sort(compareTrackingEventsNewestFirst)[0];

  return (
    completionEvent?.event_date ??
    completionEvent?.updated_at ??
    completionEvent?.created_at ??
    job.updated_at
  );
}

function compareTrackingEventsNewestFirst(
  first: ShipmentJob["tracking_events"][number],
  second: ShipmentJob["tracking_events"][number],
) {
  const firstTime = getTrackingEventTime(first);
  const secondTime = getTrackingEventTime(second);

  if (secondTime !== firstTime) {
    return secondTime - firstTime;
  }

  return (second.sort_order ?? 0) - (first.sort_order ?? 0);
}

function getTrackingEventTime(event: ShipmentJob["tracking_events"][number]) {
  return Math.max(
    parseDate(event.event_date)?.getTime() ?? 0,
    parseDate(event.updated_at)?.getTime() ?? 0,
    parseDate(event.created_at)?.getTime() ?? 0,
  );
}

function getProgressSegmentClass(
  stepIndex: number,
  activeStepCount: number,
  status: ShipmentJob["status"],
  staleCompleted: boolean,
) {
  if (staleCompleted || stepIndex >= activeStepCount) {
    return "bg-gray-200 dark:bg-gray-700";
  }

  if (status === "completed" || status === "delivered") {
    return "bg-emerald-500";
  }

  if (stepIndex === activeStepCount - 1) {
    return status === "customs_hold" ? "bg-amber-500" : "bg-orange-500";
  }

  return "bg-blue-500";
}

function getStatusColorBadgeStyle(color: string) {
  return {
    backgroundColor: `${color}1a`,
    borderColor: `${color}66`,
    color,
  };
}

function getProgressSegmentStyle(
  stepIndex: number,
  activeStepCount: number,
  color: string | undefined,
  staleCompleted: boolean,
) {
  if (!color || staleCompleted || stepIndex >= activeStepCount) {
    return undefined;
  }

  return { backgroundColor: color };
}

function isWithinRecentBusinessDays(
  value: string | null,
  maxBusinessDays: number,
) {
  const date = parseDate(value);
  if (!date) {
    return false;
  }

  return countBusinessDays(date, new Date()) <= maxBusinessDays;
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countBusinessDays(startDate: Date, endDate: Date) {
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
