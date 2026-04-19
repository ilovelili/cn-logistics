import { Download, FileText, X } from "lucide-react";
import { useAdminAuth } from "../admin/useAdminAuth";
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
  tradeModeLabels,
  transportModeLabels,
} from "../lib/shipmentJobs";

interface ShipmentJobDetailModalProps {
  job: ShipmentJob | null;
  documents: ShipmentDocument[];
  onClose: () => void;
}

export default function ShipmentJobDetailModal({
  job,
  documents,
  onClose,
}: ShipmentJobDetailModalProps) {
  const { isAdminAuthenticated } = useAdminAuth();

  if (!job) {
    return null;
  }

  const customerDocuments = documents.filter(
    (document) => document.scope === "customer",
  );
  const internalDocuments = documents.filter(
    (document) => document.scope === "internal",
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("jobs.detail.title")}
      onMouseDown={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black text-slate-950">
                {job.invoice_number || job.mbl_mawb || t("jobs.detail.title")}
              </h2>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[job.status]}`}
              >
                {statusLabels[job.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {job.shipper_name || "-"} → {job.consignee_name || "-"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("jobs.detail.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <DetailCard title={t("jobs.detail.shipment")}>
              <DetailField
                label={t("common.tradeMode")}
                value={tradeModeLabels[job.trade_mode]}
              />
              <DetailField
                label={t("common.tradeTerm")}
                value={job.trade_term}
              />
              <DetailField
                label={t("common.transportMode")}
                value={
                  job.transport_mode
                    ? transportModeLabels[job.transport_mode]
                    : null
                }
              />
              <DetailField
                label={t("common.blAwbDate")}
                value={job.bl_awb_date}
              />
            </DetailCard>

            <DetailCard title={t("jobs.detail.route")}>
              <DetailField label="POL/AOL" value={job.pol_aol} />
              <DetailField label="POD/AOD" value={job.pod_aod} />
              <DetailField label="MBL/MAWB" value={job.mbl_mawb} />
              <DetailField label="HBL/HAWB" value={job.hbl_hawb} />
            </DetailCard>

            <DetailCard title={t("jobs.detail.parties")}>
              <DetailField
                label={t("common.shipper")}
                value={job.shipper_name}
              />
              <DetailField
                label={t("common.consignee")}
                value={job.consignee_name}
              />
              <DetailField
                label={t("common.invoice")}
                value={job.invoice_number}
              />
              <DetailField label={t("common.notes")} value={job.notes} />
            </DetailCard>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <DocumentSection
              title={t("common.documents")}
              documents={customerDocuments}
              canDownload={(document) =>
                isCustomerDocumentDownloadable(document)
              }
            />
            {isAdminAuthenticated && (
              <DocumentSection
                title={t("common.internalDocuments")}
                documents={internalDocuments}
                muted
                canDownload={() => true}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-slate-500">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-xs font-bold text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">
        {value || "-"}
      </div>
    </div>
  );
}

function DocumentSection({
  title,
  documents,
  muted = false,
  canDownload,
}: {
  title: string;
  documents: ShipmentDocument[];
  muted?: boolean;
  canDownload: (document: ShipmentDocument) => boolean;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-lg font-black text-slate-950">{title}</h3>
      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">
          {t("common.noData")}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((document) => {
            const downloadable = canDownload(document);
            return (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText
                      className={`h-4 w-4 shrink-0 ${muted ? "text-slate-400" : "text-cyan-700"}`}
                    />
                    <span className="truncate text-sm font-bold text-slate-900">
                      {document.name}
                    </span>
                  </div>
                  <span
                    className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${documentApprovalClasses[document.approval_status]}`}
                  >
                    {documentApprovalLabels[document.approval_status]}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!downloadable}
                  onClick={() => downloadShipmentDocument(document)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadable
                    ? t("common.download")
                    : t("documents.downloadLocked")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
