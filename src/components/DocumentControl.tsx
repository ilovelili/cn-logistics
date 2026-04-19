import * as React from "react";
import {
  Download,
  FileCheck2,
  FileClock,
  LockKeyhole,
  Search,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  documentApprovalClasses,
  documentApprovalLabels,
  downloadShipmentDocument,
  isCustomerDocumentDownloadable,
  ShipmentDocument,
  ShipmentJob,
  statusBadgeClasses,
  statusLabels,
} from "../lib/shipmentJobs";

interface DocumentControlProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
}

interface DocumentRow {
  id: string;
  job: ShipmentJob;
  document: ShipmentDocument;
}

export default function DocumentControl({
  jobs,
  documents,
  loading,
}: DocumentControlProps) {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState("all");

  const rows = React.useMemo<DocumentRow[]>(() => {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    return documents.flatMap((document) => {
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
  }, [documents, jobs]);

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

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
              {t("documents.kicker")}
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">
              {t("documents.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-slate-500">
              {t("documents.description")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <MiniStat label={t("documents.customer")} value={customerCount} />
            <MiniStat label={t("documents.internal")} value={internalCount} />
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
            <option value="internal">{t("documents.filter.internal")}</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-black text-slate-950">
            {t("documents.register")}
          </h2>
          <p className="text-sm text-slate-500">
            {t("documents.count", { count: filteredRows.length })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3">{t("documents.scope")}</th>
                <th className="px-5 py-3">{t("common.documents")}</th>
                <th className="px-5 py-3">{t("documents.approval")}</th>
                <th className="px-5 py-3">{t("common.status")}</th>
                <th className="px-5 py-3">{t("common.invoice")}</th>
                <th className="px-5 py-3">{t("common.parties")}</th>
                <th className="px-5 py-3">BL/AWB</th>
                <th className="px-5 py-3">{t("common.route")}</th>
                <th className="px-5 py-3">{t("documents.action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
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
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${documentApprovalClasses[row.document.approval_status]}`}
                    >
                      {documentApprovalLabels[row.document.approval_status]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[row.job.status]}`}
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
                    <DownloadButton row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredRows.length === 0 && (
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

function DownloadButton({ row }: { row: DocumentRow }) {
  const canDownload = isCustomerDocumentDownloadable(row.document);

  if (row.document.scope === "internal") {
    return (
      <span className="text-xs font-semibold text-slate-400">
        {t("documents.internalOnly")}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={!canDownload}
      onClick={() => downloadShipmentDocument(row.document)}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      title={!canDownload ? t("documents.downloadLocked") : undefined}
    >
      <Download className="h-3.5 w-3.5" />
      {canDownload ? t("common.download") : t("documents.downloadLocked")}
    </button>
  );
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
