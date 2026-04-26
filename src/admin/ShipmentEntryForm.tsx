import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Edit3,
  Plus,
  Search,
  ShipWheel,
  XCircle,
} from "lucide-react";
import ShipmentJobForm from "../components/ShipmentJobForm";
import { t } from "../lib/i18n";
import {
  createShipmentJob,
  documentApprovalClasses,
  documentApprovalLabels,
  getDocumentsForJob,
  DocumentApprovalStatus,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  statusBadgeClasses,
  statusLabels,
  statusOptions,
  updateShipmentDocumentApproval,
  updateShipmentJob,
} from "../lib/shipmentJobs";

export type ShipmentEntryCriteria =
  | { kind: "all" }
  | { kind: "status"; status: ShipmentStatus }
  | { kind: "documentApproval"; approvalStatus: DocumentApprovalStatus };

interface ShipmentEntryFormProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  criteria?: ShipmentEntryCriteria;
  onRefresh: () => Promise<void>;
}

export default function ShipmentEntryForm({
  jobs,
  documents,
  criteria = { kind: "all" },
  onRefresh,
}: ShipmentEntryFormProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "all">(
    "all",
  );
  const [selectedJob, setSelectedJob] = useState<ShipmentJob | null>(null);
  const [mode, setMode] = useState<"create" | "update">("update");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const pendingApprovalJobIds = new Set(
      documents
        .filter(
          (document) =>
            document.scope === "customer" &&
            criteria.kind === "documentApproval" &&
            document.approval_status === criteria.approvalStatus,
        )
        .map((document) => document.shipment_job_id),
    );

    return jobs
      .filter((job) => {
        if (criteria.kind === "status") {
          return job.status === criteria.status;
        }
        if (criteria.kind === "documentApproval") {
          return pendingApprovalJobIds.has(job.id);
        }
        return true;
      })
      .filter((job) => {
        if (statusFilter === "all") return true;
        return job.status === statusFilter;
      })
      .filter((job) => {
        if (!normalizedQuery) return true;
        return [
          job.invoice_number,
          job.shipper_name,
          job.consignee_name,
          job.mbl_mawb,
          job.hbl_hawb,
          job.pol_aol,
          job.pod_aod,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [criteria, documents, jobs, query, statusFilter]);

  const criteriaLabel = (() => {
    if (criteria.kind === "status") {
      return statusLabels[criteria.status];
    }
    if (criteria.kind === "documentApproval") {
      return documentApprovalLabels[criteria.approvalStatus];
    }
    return t("admin.entry.filter.all");
  })();

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    setMode("update");
    setSelectedJob(null);
    setQuery("");
    setStatusFilter(criteria.kind === "status" ? criteria.status : "all");
  }, [criteria]);

  useEffect(() => {
    if (!selectedJob || !results.some((job) => job.id === selectedJob.id)) {
      setSelectedJob(results[0] ?? null);
    }
  }, [results, selectedJob]);

  const handleCreate = async (
    form: Parameters<typeof createShipmentJob>[0],
  ) => {
    setLoading(true);
    try {
      await createShipmentJob(form);
      await onRefresh();
      showToast("success", t("admin.entry.created"));
    } catch {
      showToast("error", t("admin.entry.createFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (
    form: Parameters<typeof updateShipmentJob>[1],
  ) => {
    if (!selectedJob) return;
    setLoading(true);
    try {
      await updateShipmentJob(selectedJob.id, form);
      await onRefresh();
      showToast("success", t("admin.entry.updated"));
    } catch {
      showToast("error", t("admin.entry.updateFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentApproval = async (
    document: ShipmentDocument,
    approvalStatus: "approved" | "rejected",
  ) => {
    setLoading(true);
    try {
      await updateShipmentDocumentApproval(document.id, approvalStatus);
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
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("admin.entry.title")}
        </h2>
      </div>

      <div className="flex gap-2 rounded-xl bg-gray-100 dark:bg-gray-900 p-1 w-fit">
        <button
          onClick={() => setMode("update")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            mode === "update"
              ? "bg-white dark:bg-gray-800 text-gray-950 dark:text-white shadow-sm"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          <Edit3 className="h-4 w-4" />
          {t("admin.entry.updateExisting")}
        </button>
        <button
          onClick={() => {
            setMode("create");
            setSelectedJob(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            mode === "create"
              ? "bg-white dark:bg-gray-800 text-gray-950 dark:text-white shadow-sm"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          <Plus className="h-4 w-4" />
          {t("admin.entry.createNew")}
        </button>
      </div>

      {mode === "update" && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 h-fit">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {t("admin.entry.findJob")}
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {criteriaLabel}
              </span>
            </div>
            <div className="mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("admin.entry.searchPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as ShipmentStatus | "all");
                  setSelectedJob(null);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="all">{t("jobs.filter.allStatus")}</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 max-h-[560px] overflow-y-auto">
              {results.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedJob?.id === job.id
                      ? "border-blue-300 bg-blue-50 dark:bg-blue-950/40"
                      : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {job.invoice_number ||
                          job.mbl_mawb ||
                          t("admin.entry.untitledJob")}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {job.shipper_name || "-"} → {job.consignee_name || "-"}
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClasses[job.status]}`}
                    >
                      {statusLabels[job.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            {selectedJob ? (
              <>
                <ShipmentJobForm
                  key={selectedJob.id}
                  job={selectedJob}
                  submitLabel={t("common.update")}
                  loading={loading}
                  onSubmit={handleUpdate}
                />
                <DocumentApprovalPanel
                  documents={getDocumentsForJob(documents, selectedJob.id)}
                  loading={loading}
                  onApprove={(document) =>
                    handleDocumentApproval(document, "approved")
                  }
                  onReject={(document) =>
                    handleDocumentApproval(document, "rejected")
                  }
                />
              </>
            ) : (
              <div className="flex min-h-[380px] flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
                <ShipWheel className="mb-4 h-10 w-10" />
                <p>{t("admin.entry.selectJob")}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {mode === "create" && (
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <ShipmentJobForm
            submitLabel={t("common.create")}
            loading={loading}
            onSubmit={handleCreate}
          />
        </section>
      )}
    </div>
  );
}

function DocumentApprovalPanel({
  documents,
  loading,
  onApprove,
  onReject,
}: {
  documents: ShipmentDocument[];
  loading: boolean;
  onApprove: (document: ShipmentDocument) => void;
  onReject: (document: ShipmentDocument) => void;
}) {
  return (
    <section className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-800">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {t("admin.documents.title")}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("admin.documents.description")}
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("admin.documents.noDocuments")}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((document) => {
            const canReview = document.approval_status === "pending";

            return (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {document.name}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {document.scope === "customer"
                        ? t("documents.customer")
                        : t("documents.internal")}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${documentApprovalClasses[document.approval_status]}`}
                    >
                      {documentApprovalLabels[document.approval_status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {document.scope === "customer"
                      ? t("documents.downloadLocked")
                      : t("documents.internalOnly")}
                  </p>
                </div>
                {document.scope === "customer" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading || !canReview}
                      onClick={() => onApprove(document)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t("common.approve")}
                    </button>
                    <button
                      type="button"
                      disabled={loading || !canReview}
                      onClick={() => onReject(document)}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {t("common.reject")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
