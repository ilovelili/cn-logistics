import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  FileCheck2,
  FileClock,
  LockKeyhole,
  Search,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  documentApprovalLabels,
  downloadShipmentDocument,
  isCustomerDocumentDownloadable,
  ShipmentDocument,
  ShipmentJob,
  statusBadgeClasses,
  statusLabels,
  updateShipmentDocumentApproval,
} from "../lib/shipmentJobs";

interface DocumentControlProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  isAdminAuthenticated: boolean;
}

interface DocumentRow {
  id: string;
  job: ShipmentJob;
  document: ShipmentDocument;
}

type DocumentSortKey =
  | "scope"
  | "document"
  | "status"
  | "invoice"
  | "parties"
  | "blAwb"
  | "route";
type SortDirection = "asc" | "desc";

export default function DocumentControl({
  jobs,
  documents,
  loading,
  onRefresh,
  isAdminAuthenticated,
}: DocumentControlProps) {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<DocumentSortKey | null>(null);
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>("asc");
  const [requestingDocumentId, setRequestingDocumentId] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (!isAdminAuthenticated && scope === "internal") {
      setScope("all");
    }
  }, [isAdminAuthenticated, scope]);

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
        (scope === "all" || row.document.scope === scope)
      );
    });
  }, [query, rows, scope]);

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

  const customerCount = rows.filter(
    (row) => row.document.scope === "customer",
  ).length;
  const internalCount = rows.filter(
    (row) => row.document.scope === "internal",
  ).length;
  const pendingApproval = rows.filter(
    (row) =>
      row.document.scope === "customer" &&
      row.document.approval_status === "pending",
  ).length;

  const handleSort = (nextSortKey: DocumentSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  };

  const handleDownloadRequest = async (document: ShipmentDocument) => {
    setRequestingDocumentId(document.id);
    try {
      await updateShipmentDocumentApproval(document.id, "pending");
      await onRefresh();
    } finally {
      setRequestingDocumentId(null);
    }
  };

  return (
    <div className="space-y-6">
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
          <div
            className={`grid gap-3 text-center ${
              isAdminAuthenticated ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <MiniStat label={t("documents.customer")} value={customerCount} />
            {isAdminAuthenticated && (
              <MiniStat label={t("documents.internal")} value={internalCount} />
            )}
            <MiniStat
              label={t("documents.pendingApproval")}
              value={pendingApproval}
              warn
            />
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("documents.searchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
            />
          </div>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
          >
            <option value="all">{t("documents.filter.all")}</option>
            <option value="customer">{t("documents.filter.customer")}</option>
            {isAdminAuthenticated && (
              <option value="internal">{t("documents.filter.internal")}</option>
            )}
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-black text-slate-950">
            {t("documents.register")}
          </h2>
          <p className="text-sm text-slate-500">
            {t("documents.count", { count: sortedRows.length })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[130px]" />
              <col className="w-[180px]" />
              <col className="w-[120px]" />
              <col className="w-[130px]" />
              <col className="w-[220px]" />
              <col className="w-[180px]" />
              <col className="w-[180px]" />
              <col className="w-[130px]" />
              <col className="w-[160px]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <SortHeader
                  label={t("documents.scope")}
                  sortKey="scope"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.documents")}
                  sortKey="document"
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
                  label={t("common.invoice")}
                  sortKey="invoice"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.parties")}
                  sortKey="parties"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="BL/AWB"
                  sortKey="blAwb"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("common.route")}
                  sortKey="route"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <StaticHeader label={t("documents.downloadRequest")} />
                <StaticHeader label={t("documents.downloadColumn")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-4">
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
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-950">
                    {row.document.name}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[row.job.status]}`}
                    >
                      {statusLabels[row.job.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono">
                    {row.job.invoice_number || "-"}
                  </td>
                  <td className="px-5 py-4">
                    {row.job.shipper_name || "-"} /{" "}
                    {row.job.consignee_name || "-"}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs">
                    {row.job.mbl_mawb || "-"} / {row.job.hbl_hawb || "-"}
                  </td>
                  <td className="px-5 py-4">
                    {row.job.pol_aol || "-"} → {row.job.pod_aod || "-"}
                  </td>
                  <td className="px-5 py-4">
                    <DownloadRequestButton
                      row={row}
                      requesting={requestingDocumentId === row.document.id}
                      onRequest={handleDownloadRequest}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <DownloadButton row={row} />
                  </td>
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
      </section>
    </div>
  );
}

function DownloadRequestButton({
  row,
  requesting,
  onRequest,
}: {
  row: DocumentRow;
  requesting: boolean;
  onRequest: (document: ShipmentDocument) => Promise<void>;
}) {
  const { document } = row;
  const isCustomerDocument = document.scope === "customer";
  const canRequest =
    isCustomerDocument &&
    (document.approval_status === "not_requested" ||
      document.approval_status === "rejected");
  const buttonLabel = getDownloadRequestLabel(document);

  return (
    <button
      type="button"
      disabled={!canRequest || requesting}
      onClick={() => onRequest(document)}
      className={`inline-flex min-w-[96px] items-center justify-center whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${
        canRequest
          ? "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
      }`}
      title={!isCustomerDocument ? t("documents.internalOnly") : undefined}
    >
      {requesting ? t("common.saving") : buttonLabel}
    </button>
  );
}

function getDownloadRequestLabel(document: ShipmentDocument) {
  if (document.scope === "internal") return t("documents.internalOnly");

  switch (document.approval_status) {
    case "not_requested":
    case "rejected":
      return t("documents.downloadRequest");
    case "pending":
      return t("documents.downloadRequestApplied");
    case "approved":
      return documentApprovalLabels.approved;
  }
}

function DownloadButton({ row }: { row: DocumentRow }) {
  const canDownload = isCustomerDocumentDownloadable(row.document);
  const lockedTitle =
    row.document.scope === "internal"
      ? t("documents.internalOnly")
      : t("documents.downloadLocked");

  return (
    <button
      type="button"
      disabled={!canDownload}
      onClick={() => downloadShipmentDocument(row.document)}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
        canDownload
          ? "border-slate-200 text-slate-700 hover:bg-slate-50"
          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
      }`}
      title={!canDownload ? lockedTitle : undefined}
    >
      <Download className="h-3.5 w-3.5" />
      {t("documents.downloadColumn")}
    </button>
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
  sortKey: DocumentSortKey;
  activeSortKey: DocumentSortKey | null;
  direction: SortDirection;
  onSort: (sortKey: DocumentSortKey) => void;
}) {
  const isActive = activeSortKey === sortKey;
  const Icon = !isActive
    ? ArrowUpDown
    : direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <th className="whitespace-nowrap px-5 py-3">
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

function StaticHeader({ label }: { label: string }) {
  return <th className="whitespace-nowrap px-5 py-3">{label}</th>;
}

function MiniStat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 ${warn ? "bg-amber-50" : "bg-slate-50"}`}
    >
      <div
        className={`text-2xl font-black ${warn ? "text-amber-700" : "text-slate-950"}`}
      >
        {value}
      </div>
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function getDocumentSortValue(row: DocumentRow, sortKey: DocumentSortKey) {
  switch (sortKey) {
    case "scope":
      return row.document.scope === "internal"
        ? t("documents.internal")
        : t("documents.customer");
    case "document":
      return row.document.name;
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
