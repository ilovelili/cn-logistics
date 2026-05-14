import { X } from "lucide-react";
import { t } from "../lib/i18n";
import type { ShipmentDocument } from "../lib/shipmentJobs";

interface DocumentPreviewModalProps {
  document: ShipmentDocument;
  adminTheme: boolean;
  onClose: () => void;
}

export default function DocumentPreviewModal({
  document,
  adminTheme,
  onClose,
}: DocumentPreviewModalProps) {
  const previewUrl = document.file_url || "/sample-document.pdf";

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("documents.preview")}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl ${
          adminTheme
            ? "rounded-xl bg-white dark:bg-gray-900"
            : "rounded-[2rem] bg-white"
        }`}
      >
        <div
          className={`flex items-center justify-between border-b px-6 py-4 ${
            adminTheme
              ? "border-gray-200 dark:border-gray-800"
              : "border-slate-200"
          }`}
        >
          <div className="min-w-0">
            <h3
              className={`truncate text-xl font-black ${
                adminTheme ? "text-gray-900 dark:text-white" : "text-slate-950"
              }`}
            >
              {document.name}
            </h3>
            <p
              className={`mt-1 text-sm ${
                adminTheme
                  ? "text-gray-500 dark:text-gray-400"
                  : "text-slate-500"
              }`}
            >
              {t("documents.preview")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 transition ${
              adminTheme
                ? "rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
                : "rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            }`}
            aria-label={t("jobs.detail.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <iframe
          title={document.name}
          src={previewUrl}
          className={
            adminTheme
              ? "h-[72vh] w-full bg-gray-100 dark:bg-gray-950"
              : "h-[72vh] w-full bg-slate-100"
          }
        />
      </div>
    </div>
  );
}
