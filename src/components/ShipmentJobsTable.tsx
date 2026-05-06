import {
  CalendarDays,
  FileText,
  MoreHorizontal,
  ShipWheel,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  ShipmentDocument,
  ShipmentJob,
  statusBadgeClasses,
  statusLabels,
  tradeModeLabels,
  transportModeLabels,
} from "../lib/shipmentJobs";
import PaginationControls from "./PaginationControls";
import SortableTableHeader, { SortDirection } from "./SortableTableHeader";
import {
  formatShipmentJobShortId,
  getShipmentJobWorkingDays,
} from "./shipmentJobsTableUtils";

export type ShipmentJobsTableSortKey =
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
  onSort,
  onSelectJob,
  onPageChange,
  onPageSizeChange,
}: ShipmentJobsTableProps) {
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
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center ${
              adminTheme
                ? "rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                : "rounded-2xl bg-slate-100 text-slate-700"
            }`}
          >
            <ShipWheel className="h-5 w-5" />
          </div>
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
      </div>

      <div className="overflow-x-auto">
        <table
          className={`w-full table-fixed text-left text-sm ${
            showInternalDocuments ? "min-w-[2160px]" : "min-w-[1970px]"
          }`}
        >
          <colgroup>
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
            {showInternalDocuments && <col className="w-[170px]" />}
            <col className="w-[190px]" />
          </colgroup>
          <thead
            className={`text-xs uppercase tracking-[0.14em] text-slate-500 ${
              adminTheme
                ? "bg-slate-50 dark:bg-gray-950 dark:text-gray-400"
                : "bg-slate-50"
            }`}
          >
            <tr>
              <SortableTableHeader
                label="ID"
                sortKey="id"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
                className="whitespace-nowrap py-3 pl-3 pr-5"
              />
              <SortableTableHeader
                label={t("common.status")}
                sortKey="status"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
                className="whitespace-nowrap py-3 pl-5 pr-3"
              />
              <SortableTableHeader
                label={t("common.workingDaysSpent")}
                sortKey="working_days"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label={t("common.trade")}
                sortKey="trade"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label={t("common.invoice")}
                sortKey="invoice_number"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label={t("common.transport")}
                sortKey="transport_mode"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label={t("common.shipper")}
                sortKey="shipper_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label={t("common.consignee")}
                sortKey="consignee_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label="POL/AOL"
                sortKey="pol_aol"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label="POD/AOD"
                sortKey="pod_aod"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label={t("common.vesselFlightNo")}
                sortKey="vessel_flight_numbers"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label="MBL/MAWB"
                sortKey="mbl_mawb"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label="HBL/HAWB"
                sortKey="hbl_hawb"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableTableHeader
                label={t("common.blAwbDate")}
                sortKey="bl_awb_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={onSort}
              />
              <th className="whitespace-nowrap px-3 py-3">
                {t("common.documents")}
              </th>
              {showInternalDocuments && (
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.internalDocuments")}
                </th>
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
                <td className="py-4 pl-3 pr-5 font-mono text-xs font-bold text-slate-500">
                  <span title={job.id}>{formatShipmentJobShortId(job.id)}</span>
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
                  <div
                    className={`whitespace-nowrap font-bold ${
                      adminTheme
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-900"
                    }`}
                  >
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
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-4 font-mono ${
                    adminTheme
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-900"
                  }`}
                >
                  {job.invoice_number || "-"}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-4 ${
                    adminTheme ? "text-slate-700 dark:text-gray-300" : ""
                  }`}
                >
                  {job.transport_mode
                    ? transportModeLabels[job.transport_mode]
                    : "-"}
                </td>
                <td
                  className={`px-3 py-4 font-medium ${
                    adminTheme
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-900"
                  }`}
                >
                  {job.shipper_name || "-"}
                </td>
                <td
                  className={`px-3 py-4 font-medium ${
                    adminTheme
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-900"
                  }`}
                >
                  {job.consignee_name || "-"}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-4 ${
                    adminTheme ? "text-slate-700 dark:text-gray-300" : ""
                  }`}
                >
                  {job.pol_aol || "-"}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-4 ${
                    adminTheme ? "text-slate-700 dark:text-gray-300" : ""
                  }`}
                >
                  {job.pod_aod || "-"}
                </td>
                <td
                  className={`px-3 py-4 text-xs ${
                    adminTheme
                      ? "text-slate-700 dark:text-gray-300"
                      : "text-slate-700"
                  }`}
                >
                  <VesselFlightList values={job.vessel_flight_numbers} />
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-4 font-mono text-xs ${
                    adminTheme ? "text-slate-700 dark:text-gray-300" : ""
                  }`}
                >
                  {job.mbl_mawb || "-"}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-4 font-mono text-xs ${
                    adminTheme ? "text-slate-700 dark:text-gray-300" : ""
                  }`}
                >
                  {job.hbl_hawb || "-"}
                </td>
                <td className="px-3 py-4">
                  <div
                    className={`flex items-center gap-2 whitespace-nowrap ${
                      adminTheme
                        ? "text-slate-700 dark:text-gray-300"
                        : "text-slate-700"
                    }`}
                  >
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
                {showInternalDocuments && (
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
        currentPage={currentPage}
        pageCount={pageCount}
        pageSize={pageSize}
        total={sortedJobs.length}
        visibleFrom={visibleFrom}
        visibleTo={visibleTo}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </section>
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
