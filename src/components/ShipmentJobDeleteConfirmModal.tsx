import { t } from "../lib/i18n";
import type { ShipmentJob } from "../lib/shipmentJobs";

export default function ShipmentJobDeleteConfirmModal({
  job,
  deleting,
  onCancel,
  onConfirm,
}: {
  job: ShipmentJob;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("jobs.deleteConfirmTitle")}
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("jobs.deleteConfirmTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("jobs.deleteConfirm")}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
          <div className="font-bold text-gray-900 dark:text-white">
            {job.invoice_number || job.job_number || t("common.unset")}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("common.invoice")}: {job.invoice_number || "-"}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("common.jobNumber")}: {job.job_number || "-"}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("common.shipper")}: {job.shipper_name || "-"}
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
