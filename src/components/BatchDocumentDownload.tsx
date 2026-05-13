import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  FileText,
  Search,
  X,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  documentApprovalClasses,
  documentApprovalLabels,
  ShipmentDocument,
  ShipmentJob,
  updateShipmentDocumentApproval,
} from "../lib/shipmentJobs";

interface BatchDocumentDownloadProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

interface DocumentRow {
  job: ShipmentJob;
  document: ShipmentDocument;
}

export default function BatchDocumentDownload({
  jobs,
  documents,
  loading,
  onRefresh,
}: BatchDocumentDownloadProps) {
  const [query, setQuery] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const rows = useMemo<DocumentRow[]>(() => {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));

    return documents.flatMap((document) => {
      if (document.scope !== "customer") return [];
      const job = jobsById.get(document.shipment_job_id);
      if (!job) return [];
      return [{ job, document }];
    });
  }, [documents, jobs]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter(({ job, document }) =>
      [
        document.name,
        job.invoice_number,
        job.shipper_name,
        job.consignee_name,
        job.mbl_mawb,
        job.hbl_hawb,
        job.pol_aol,
        job.pod_aod,
        ...(job.vessel_flight_numbers ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rows]);

  const selectableVisibleDocumentIds = filteredRows
    .filter(({ document }) => canRequestDocument(document))
    .map(({ document }) => document.id);
  const selectedCount = selectedDocumentIds.length;

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const toggleDocument = (documentId: string) => {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  };

  const selectVisibleDocuments = () => {
    setSelectedDocumentIds((current) => [
      ...new Set([...current, ...selectableVisibleDocumentIds]),
    ]);
  };

  const submitBatchRequest = async () => {
    if (selectedDocumentIds.length === 0) return;

    setRequesting(true);
    try {
      await Promise.all(
        selectedDocumentIds.map((documentId) =>
          updateShipmentDocumentApproval(documentId, "pending"),
        ),
      );
      const requestedCount = selectedDocumentIds.length;
      setSelectedDocumentIds([]);
      await onRefresh();
      showToast("success", t("documents.batchRequested", { count: requestedCount }));
    } catch {
      showToast("error", t("documents.batchRequestFailed"));
    } finally {
      setRequesting(false);
    }
  };

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

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-950">
              {t("documents.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-slate-500">
              {t("documents.batchDescription")}
            </p>
          </div>
          <div className="rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-900">
            {t("documents.batchSelected", { count: selectedCount })}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("documents.batchSearchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={selectVisibleDocuments}
            disabled={selectableVisibleDocumentIds.length === 0 || requesting}
            className="inline-flex justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("documents.selectAllVisible")}
          </button>
          <button
            type="button"
            onClick={() => setSelectedDocumentIds([])}
            disabled={selectedCount === 0 || requesting}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            {t("documents.clearSelection")}
          </button>
          <button
            type="button"
            onClick={submitBatchRequest}
            disabled={selectedCount === 0 || requesting}
            className="inline-flex justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requesting ? t("common.saving") : t("documents.batchSubmit")}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[140px]" />
              <col className="w-[220px]" />
              <col className="w-[190px]" />
              <col className="w-[190px]" />
              <col className="w-[180px]" />
              <col className="w-[130px]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3"></th>
                <th className="px-4 py-3">{t("common.invoice")}</th>
                <th className="px-4 py-3">{t("common.documents")}</th>
                <th className="px-4 py-3">{t("common.shipper")}</th>
                <th className="px-4 py-3">{t("common.consignee")}</th>
                <th className="px-4 py-3">BL/AWB</th>
                <th className="px-4 py-3">{t("documents.approval")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    {t("common.loadingDocuments")}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    {t("documents.noMatches")}
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ job, document }) => {
                  const canRequest = canRequestDocument(document);
                  const checked = selectedDocumentIds.includes(document.id);

                  return (
                    <tr
                      key={document.id}
                      className={canRequest ? "hover:bg-cyan-50/40" : "bg-slate-50/50"}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canRequest || requesting}
                          onChange={() => toggleDocument(document.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-4 font-mono font-bold text-slate-950">
                        {job.invoice_number || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="truncate font-semibold text-slate-950">
                            {document.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {job.shipper_name || "-"}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {job.consignee_name || "-"}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {[job.mbl_mawb, job.hbl_hawb].filter(Boolean).join(" / ") ||
                          "-"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${documentApprovalClasses[document.approval_status]}`}
                        >
                          {documentApprovalLabels[document.approval_status]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function canRequestDocument(document: ShipmentDocument) {
  return (
    document.approval_status === "not_requested" ||
    document.approval_status === "rejected"
  );
}
