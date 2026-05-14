import { CalendarDays, FileText, MoreHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { t } from "../lib/i18n";
import {
  ShipmentDocument,
  ShipmentJob,
  statusLabels,
  tradeModeLabels,
  transportModeLabels,
} from "../lib/shipmentJobs";
import PaginationControls from "./PaginationControls";
import DocumentPreviewModal from "./DocumentPreviewModal";
import SortableTableHeader, { SortDirection } from "./SortableTableHeader";
import TableColumnSettingsButton from "./TableColumnSettings";
import { useTableColumnSettings } from "./useTableColumnSettings";
import {
  getResponsibleAdminNames,
  getShipmentJobWorkingDays,
  type ShipmentJobsCompanyOption,
} from "./shipmentJobsTableUtils";

export type ShipmentJobsTableSortKey =
  | "id"
  | "company_name"
  | "responsible_admins"
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

type ShipmentJobsTableColumnId =
  | ShipmentJobsTableSortKey
  | "documents"
  | "internal_documents";

interface ShipmentJobsTableColumn {
  id: ShipmentJobsTableColumnId;
  label: string;
  width: number;
  sortKey?: ShipmentJobsTableSortKey;
  render: (job: ShipmentJob) => ReactNode;
}

const columnSettingsStorageKey = "shipment_jobs_table_columns_v5";

interface ShipmentJobsTableProps {
  totalJobs: number;
  sortedJobs: ShipmentJob[];
  paginatedJobs: ShipmentJob[];
  documentsByJob: Record<string, ShipmentDocument[]>;
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
  companyOptions?: ShipmentJobsCompanyOption[];
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
  companyOptions = [],
  onSort,
  onSelectJob,
  onPageChange,
  onPageSizeChange,
}: ShipmentJobsTableProps) {
  const [previewDocument, setPreviewDocument] =
    useState<ShipmentDocument | null>(null);
  const columns = useMemo(
    () =>
      buildColumns(
        documentsByJob,
        adminTheme,
        showInternalDocuments,
        companyOptions,
        setPreviewDocument,
      ),
    [
      adminTheme,
      companyOptions,
      documentsByJob,
      showInternalDocuments,
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
        <TableColumnSettingsButton
          columns={orderedColumnConfigs}
          visibleColumnIds={visibleColumnIds}
          onVisibilityChange={setColumnVisibility}
          onMoveColumn={moveColumn}
          onReset={resetColumns}
          adminTheme={adminTheme}
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
          <thead
            className={`text-xs uppercase tracking-[0.14em] text-slate-500 ${
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
                tabIndex={0}
                role="button"
                onClick={() => onSelectJob(job)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectJob(job);
                  }
                }}
                className={`cursor-pointer align-top transition focus:outline-none ${
                  selectedJobId === job.id
                    ? "bg-cyan-50/80 dark:bg-cyan-950/20"
                    : adminTheme
                      ? "hover:bg-slate-50/80 focus:bg-slate-50 dark:hover:bg-gray-800/70 dark:focus:bg-gray-800"
                      : "hover:bg-slate-50/80 focus:bg-slate-50"
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
      {previewDocument && (
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
  companyOptions: ShipmentJobsCompanyOption[],
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
      id: "company_name",
      label: t("common.companyName"),
      width: 150,
      sortKey: "company_name",
      render: (job) => (
        <span
          className={`block truncate font-semibold ${strongText}`}
          title={job.company_name ?? undefined}
        >
          {job.company_name || "-"}
        </span>
      ),
    },
    ...(companyOptions.length > 0
      ? [
          {
            id: "responsible_admins" as const,
            label: t("admin.userRegistration.contactPerson"),
            width: 120,
            sortKey: "responsible_admins" as const,
            render: (job: ShipmentJob) => (
              <ResponsibleAdminNames
                names={getResponsibleAdminNames(job, companyOptions)}
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
      render: (job) => <ShipmentProgressStatus job={job} />,
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
      id: "shipper_name",
      label: t("common.shipper"),
      width: 145,
      sortKey: "shipper_name",
      render: (job) => (
        <span className={`font-medium ${strongText}`}>
          {job.shipper_name || "-"}
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

  return columns;
}

function DocumentPills({
  documents,
  muted = false,
  onPreview,
}: {
  documents?: ShipmentDocument[];
  muted?: boolean;
  onPreview: (document: ShipmentDocument) => void;
}) {
  if (!documents?.length) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {documents.map((document) => (
        <button
          type="button"
          key={document.id}
          onClick={(event) => {
            event.stopPropagation();
            onPreview(document);
          }}
          className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            muted
              ? "bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              : "bg-cyan-50 text-cyan-800 transition hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:bg-cyan-950"
          }`}
          title={document.name}
        >
          <FileText className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">{document.name}</span>
        </button>
      ))}
    </div>
  );
}

function ShipmentProgressStatus({ job }: { job: ShipmentJob }) {
  const completedAt = getShipmentCompletedAt(job);
  const recentlyCompleted =
    job.status === "completed" && isWithinRecentBusinessDays(completedAt, 3);
  const staleCompleted = job.status === "completed" && !recentlyCompleted;
  const activeStepCount = getShipmentProgressStepCount(job);
  const statusClass = staleCompleted
    ? "border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
    : job.status === "completed"
      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
      : job.status === "customs_hold"
        ? "border-amber-200 bg-amber-100 text-amber-800"
        : "border-orange-200 bg-orange-100 text-orange-800";

  return (
    <div className="min-w-[150px] space-y-2">
      <span
        className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}
      >
        {statusLabels[job.status]}
      </span>
      <div
        className="grid grid-cols-9 gap-0.5"
        aria-label={t("common.status")}
        title={`${activeStepCount}/9`}
      >
        {Array.from({ length: 9 }, (_, stepIndex) => (
          <span
            key={stepIndex}
            className={`h-1.5 rounded-full ${getProgressSegmentClass(
              stepIndex,
              activeStepCount,
              job.status,
              staleCompleted,
            )}`}
          />
        ))}
      </div>
    </div>
  );
}

function getShipmentProgressStepCount(job: ShipmentJob) {
  if (job.status === "completed") {
    return 9;
  }

  const latestSortOrder = Math.max(
    0,
    ...(job.tracking_events ?? []).map((event) => event.sort_order ?? 0),
  );

  if (latestSortOrder > 0) {
    return Math.max(1, Math.min(9, Math.ceil(latestSortOrder / 10)));
  }

  if (job.status === "customs_hold") {
    return 7;
  }

  return 1;
}

function getShipmentCompletedAt(job: ShipmentJob) {
  if (job.status !== "completed") {
    return null;
  }

  const completionEvent = [...(job.tracking_events ?? [])]
    .filter(
      (event) =>
        (event.sort_order ?? 0) >= 90 || event.description.includes("完了"),
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

  if (status === "completed") {
    return "bg-emerald-500";
  }

  if (stepIndex === activeStepCount - 1) {
    return status === "customs_hold" ? "bg-amber-500" : "bg-orange-500";
  }

  return "bg-blue-500";
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

function ResponsibleAdminNames({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="inline-flex max-w-full items-center rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-1 dark:ring-cyan-900"
          title={name}
        >
          <span className="min-w-0 truncate">{name}</span>
        </span>
      ))}
    </div>
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
