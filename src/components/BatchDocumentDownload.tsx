import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Download,
  FileText,
  Search,
  X,
} from "lucide-react";
import { t } from "../lib/i18n";
import {
  documentApprovalClasses,
  documentApprovalLabels,
  downloadShipmentDocument,
  isCustomerDocumentDownloadable,
  ShipmentDocument,
  ShipmentJob,
  updateShipmentDocumentApproval,
} from "../lib/shipmentJobs";
import DocumentPreviewModal from "./DocumentPreviewModal";
import InstantTooltip from "./InstantTooltip";
import PaginationControls from "./PaginationControls";
import StickyTableHeaderToggle from "./StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "./useStickyTableHeaderPreference";
import TableHorizontalScrollHint from "./TableHorizontalScrollHint";
import { useHorizontalScrollHint } from "./useHorizontalScrollHint";
import { usePagination } from "./usePagination";

interface BatchDocumentDownloadProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  requesterEmail: string;
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
  requesterEmail,
  onRefresh,
}: BatchDocumentDownloadProps) {
  const [query, setQuery] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [previewDocument, setPreviewDocument] =
    useState<ShipmentDocument | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<
    string | null
  >(null);
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollHint = useHorizontalScrollHint(tableScrollRef);
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
  const {
    currentPage,
    pageCount,
    pageSize,
    paginatedItems: paginatedRows,
    visibleFrom,
    visibleTo,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredRows);

  const selectableVisibleDocumentIds = paginatedRows
    .filter(({ document }) => canRequestDocument(document))
    .map(({ document }) => document.id);
  const selectedCount = selectedDocumentIds.length;

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const previewApprovedDocument = (document: ShipmentDocument) => {
    if (isCustomerDocumentDownloadable(document)) {
      setPreviewDocument(document);
    }
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
          updateShipmentDocumentApproval(documentId, "pending", requesterEmail),
        ),
      );
      const requestedCount = selectedDocumentIds.length;
      setSelectedDocumentIds([]);
      await onRefresh();
      showToast(
        "success",
        t("documents.batchRequested", { count: requestedCount }),
      );
    } catch {
      showToast("error", t("documents.batchRequestFailed"));
    } finally {
      setRequesting(false);
    }
  };

  const downloadDocument = async (document: ShipmentDocument) => {
    if (!isCustomerDocumentDownloadable(document)) return;

    setDownloadingDocumentId(document.id);
    try {
      await downloadShipmentDocument(document);
    } catch {
      showToast("error", t("documents.downloadFailed"));
    } finally {
      setDownloadingDocumentId(null);
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

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t("documents.title")}
            </h1>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div
          className={`grid gap-3 lg:items-center ${
            selectableVisibleDocumentIds.length > 0 || selectedCount > 0
              ? "lg:grid-cols-[1fr_auto_auto_auto]"
              : "lg:grid-cols-1"
          }`}
        >
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("documents.batchSearchPlaceholder")}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:focus:bg-gray-900"
            />
          </label>
          {(selectableVisibleDocumentIds.length > 0 || selectedCount > 0) && (
            <>
              <button
                type="button"
                onClick={selectVisibleDocuments}
                disabled={
                  selectableVisibleDocumentIds.length === 0 || requesting
                }
                className="inline-flex justify-center rounded-lg border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t("documents.selectAllVisible")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedDocumentIds([])}
                disabled={selectedCount === 0 || requesting}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
                {t("documents.clearSelection")}
              </button>
              <button
                type="button"
                onClick={submitBatchRequest}
                disabled={selectedCount === 0 || requesting}
                className="inline-flex justify-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
              >
                {requesting ? t("common.saving") : t("documents.batchSubmit")}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex justify-end border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <StickyTableHeaderToggle
            adminTheme
            enabled={stickyHeaderEnabled}
            onToggle={toggleStickyHeader}
          />
        </div>
        <div
          className={`flex justify-end border-b border-gray-200 px-5 py-2 dark:border-gray-800 sm:${scrollHint.canScroll ? "flex" : "hidden"}`}
        >
          <TableHorizontalScrollHint
            adminTheme
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
          <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[140px]" />
              <col className="w-[220px]" />
              <col className="w-[190px]" />
              <col className="w-[190px]" />
              <col className="w-[180px]" />
              <col className="w-[130px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead
              className={`${stickyHeaderEnabled ? "sticky top-0 z-20 shadow-sm" : ""} bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500 dark:bg-gray-950 dark:text-gray-400`}
            >
              <tr>
                <th className="px-4 py-3"></th>
                <th className="px-4 py-3">{t("common.invoice")}</th>
                <th className="px-4 py-3">{t("common.documents")}</th>
                <th className="px-4 py-3">{t("common.shipper")}</th>
                <th className="px-4 py-3">{t("common.consignee")}</th>
                <th className="px-4 py-3">BL/AWB</th>
                <th className="px-4 py-3">{t("documents.approval")}</th>
                <th className="px-4 py-3">{t("documents.action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                  >
                    {t("common.loadingDocuments")}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                  >
                    {t("documents.noMatches")}
                  </td>
                </tr>
              ) : (
                paginatedRows.map(({ job, document }) => {
                  const canRequest = canRequestDocument(document);
                  const canDownload = isCustomerDocumentDownloadable(document);
                  const checked = selectedDocumentIds.includes(document.id);

                  return (
                    <tr
                      key={document.id}
                      className={
                        canRequest
                          ? "hover:bg-slate-50/80 dark:hover:bg-gray-800/70"
                          : "bg-slate-50/50 dark:bg-gray-950/50"
                      }
                    >
                      <td className="px-4 py-4">
                        {canRequest ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={requesting}
                            onChange={() => toggleDocument(document.id)}
                            className="h-4 w-4 rounded border-slate-300"
                            aria-label={`${document.name} ${t("documents.downloadRequest")}`}
                          />
                        ) : (
                          <span className="block h-4 w-4" aria-hidden="true" />
                        )}
                      </td>
                      <td className="px-4 py-4 font-mono font-bold text-gray-900 dark:text-white">
                        {job.invoice_number || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <DocumentNameCell
                          document={document}
                          onPreview={previewApprovedDocument}
                        />
                      </td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                        {job.shipper_name || "-"}
                      </td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                        {job.consignee_name || "-"}
                      </td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                        {[job.mbl_mawb, job.hbl_hawb]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${documentApprovalClasses[document.approval_status]}`}
                        >
                          {documentApprovalLabels[document.approval_status]}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          disabled={
                            !canDownload ||
                            downloadingDocumentId === document.id
                          }
                          onClick={() => void downloadDocument(document)}
                          className={`inline-flex min-w-[88px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                            canDownload
                              ? "border-cyan-200 bg-transparent text-cyan-800 hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-600"
                          }`}
                          title={
                            canDownload
                              ? undefined
                              : t("documents.downloadLocked")
                          }
                        >
                          <Download className="h-3.5 w-3.5" />
                          {downloadingDocumentId === document.id
                            ? t("common.saving")
                            : t("documents.downloadColumn")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          adminTheme
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={filteredRows.length}
          visibleFrom={visibleFrom}
          visibleTo={visibleTo}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>
      {previewDocument && isCustomerDocumentDownloadable(previewDocument) && (
        <DocumentPreviewModal
          document={previewDocument}
          adminTheme
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </div>
  );
}

function DocumentNameCell({
  document,
  onPreview,
}: {
  document: ShipmentDocument;
  onPreview: (document: ShipmentDocument) => void;
}) {
  const canPreview = isCustomerDocumentDownloadable(document);
  const content = (
    <>
      <FileText
        className={`h-4 w-4 shrink-0 ${
          canPreview
            ? "text-cyan-600 dark:text-cyan-300"
            : "text-slate-300 dark:text-gray-600"
        }`}
      />
      <span
        className={`truncate font-semibold ${
          canPreview
            ? "text-gray-900 dark:text-white"
            : "text-slate-400 dark:text-gray-600"
        }`}
        title={document.name}
      >
        {document.name}
      </span>
    </>
  );

  if (!canPreview) {
    return <div className="flex min-w-0 items-center gap-2">{content}</div>;
  }

  return (
    <InstantTooltip label={t("documents.preview")} align="left">
      {(tooltipId) => (
        <button
          type="button"
          onClick={() => onPreview(document)}
          className="flex min-w-0 max-w-full items-center gap-2 rounded-lg text-left transition hover:text-cyan-700 focus:outline-none focus:ring-4 focus:ring-cyan-100 dark:hover:text-cyan-200 dark:focus:ring-cyan-950"
          aria-describedby={tooltipId}
          title={document.name}
        >
          {content}
        </button>
      )}
    </InstantTooltip>
  );
}

function canRequestDocument(document: ShipmentDocument) {
  return (
    document.approval_status === "not_requested" ||
    document.approval_status === "rejected"
  );
}
