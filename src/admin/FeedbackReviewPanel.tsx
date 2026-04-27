import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import {
  fetchAllShipmentFeedback,
  ShipmentFeedbackReview,
} from "../lib/shipmentFeedback";
import { t } from "../lib/i18n";

interface FeedbackReviewPanelProps {
  superAdminEmail: string;
}

export default function FeedbackReviewPanel({
  superAdminEmail,
}: FeedbackReviewPanelProps) {
  const [feedback, setFeedback] = useState<ShipmentFeedbackReview[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    try {
      setFeedback(await fetchAllShipmentFeedback(superAdminEmail));
    } finally {
      setLoading(false);
    }
  }, [superAdminEmail]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const filteredFeedback = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return feedback;

    return feedback.filter((item) =>
      [
        item.shipment_job_id,
        item.shipment_invoice_number,
        item.submitter_email,
        item.admin_operator_email,
        item.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [feedback, query]);

  const averageRating =
    feedback.length === 0
      ? 0
      : feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">
              {t("superAdmin.feedback.title")}
            </h1>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
            <div className="text-xs font-bold">
              {t("superAdmin.feedback.average")}
            </div>
            <div className="mt-1 text-2xl font-black">
              {averageRating ? averageRating.toFixed(1) : "-"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-black text-gray-900 dark:text-white">
            {t("superAdmin.feedback.list")}
          </h2>
          <label className="relative block w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("superAdmin.feedback.searchPlaceholder")}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="py-3 pr-4">{t("common.invoice")}</th>
                <th className="py-3 pr-4">
                  {t("superAdmin.feedback.operator")}
                </th>
                <th className="py-3 pr-4">
                  {t("superAdmin.feedback.submitter")}
                </th>
                <th className="py-3 pr-4">{t("common.feedback")}</th>
                <th className="py-3 pr-4">{t("feedback.reason")}</th>
                <th className="py-3">
                  {t("admin.userRegistration.createdAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td className="py-8 text-center text-gray-500" colSpan={6}>
                    {t("common.loadingDocuments")}
                  </td>
                </tr>
              ) : filteredFeedback.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-gray-500" colSpan={6}>
                    {t("superAdmin.feedback.noFeedback")}
                  </td>
                </tr>
              ) : (
                filteredFeedback.map((item) => (
                  <tr key={item.id}>
                    <td className="py-4 pr-4 font-bold text-gray-900 dark:text-white">
                      {item.shipment_invoice_number ||
                        item.shipment_job_id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-4 pr-4 text-gray-700 dark:text-gray-300">
                      {item.admin_operator_email || "-"}
                    </td>
                    <td className="py-4 pr-4 text-gray-700 dark:text-gray-300">
                      {item.submitter_email}
                    </td>
                    <td className="py-4 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                        <Star className="h-3.5 w-3.5" fill="currentColor" />
                        {item.rating} / 5
                      </span>
                    </td>
                    <td className="max-w-xs py-4 pr-4 text-gray-700 dark:text-gray-300">
                      <span className="line-clamp-2">{item.reason || "-"}</span>
                    </td>
                    <td className="py-4 text-gray-500">
                      {new Date(item.created_at).toLocaleDateString("ja-JP")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
