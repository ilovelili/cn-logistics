import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import {
  fetchAllShipmentFeedback,
  ShipmentFeedbackReview,
} from "../lib/shipmentFeedback";
import { t } from "../lib/i18n";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import { useTableColumnSettings } from "../components/useTableColumnSettings";

interface FeedbackReviewPanelProps {
  superAdminEmail: string;
}

type FeedbackColumnId =
  | "invoice"
  | "operator"
  | "submitter"
  | "rating"
  | "reason"
  | "created_at";

interface FeedbackTableColumn {
  id: FeedbackColumnId;
  label: string;
  width: number;
  render: (item: ShipmentFeedbackReview) => React.ReactNode;
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

  const columns = useMemo<FeedbackTableColumn[]>(
    () => [
      {
        id: "invoice",
        label: t("common.invoice"),
        width: 180,
        render: (item) => (
          <span className="font-bold text-gray-900 dark:text-white">
            {item.shipment_invoice_number ||
              item.shipment_job_id.slice(0, 8).toUpperCase()}
          </span>
        ),
      },
      {
        id: "operator",
        label: t("superAdmin.feedback.operator"),
        width: 220,
        render: (item) => (
          <span className="text-gray-700 dark:text-gray-300">
            {item.admin_operator_email || "-"}
          </span>
        ),
      },
      {
        id: "submitter",
        label: t("superAdmin.feedback.submitter"),
        width: 220,
        render: (item) => (
          <span className="text-gray-700 dark:text-gray-300">
            {item.submitter_email}
          </span>
        ),
      },
      {
        id: "rating",
        label: t("common.feedback"),
        width: 140,
        render: (item) => (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
            <Star className="h-3.5 w-3.5" fill="currentColor" />
            {item.rating} / 5
          </span>
        ),
      },
      {
        id: "reason",
        label: t("feedback.reason"),
        width: 260,
        render: (item) => (
          <span className="line-clamp-2 text-gray-700 dark:text-gray-300">
            {item.reason || "-"}
          </span>
        ),
      },
      {
        id: "created_at",
        label: t("admin.userRegistration.createdAt"),
        width: 160,
        render: (item) => (
          <span className="text-gray-500">
            {new Date(item.created_at).toLocaleDateString("ja-JP")}
          </span>
        ),
      },
    ],
    [],
  );
  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    "super_admin_feedback_table_columns",
    columns.map((column) => ({ id: column.id, label: column.label })),
  );
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const visibleTableColumns = visibleColumns
    .map((column) => columnsById.get(column.id))
    .filter((column): column is FeedbackTableColumn => Boolean(column));
  const orderedColumnConfigs = orderedColumns.map((column) => ({
    id: column.id,
    label: column.label,
  }));
  const tableMinWidth = visibleTableColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

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
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <label className="relative block w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("superAdmin.feedback.searchPlaceholder")}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
              />
            </label>
            <TableColumnSettingsButton
              columns={orderedColumnConfigs}
              visibleColumnIds={visibleColumnIds}
              onVisibilityChange={setColumnVisibility}
              onMoveColumn={moveColumn}
              onReset={resetColumns}
              adminTheme
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full table-fixed text-left text-sm"
            style={{ minWidth: `${Math.max(tableMinWidth, 320)}px` }}
          >
            <colgroup>
              {visibleTableColumns.map((column) => (
                <col key={column.id} style={{ width: `${column.width}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {visibleTableColumns.map((column) => (
                  <th key={column.id} className="py-3 pr-4">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td
                    className="py-8 text-center text-gray-500"
                    colSpan={visibleTableColumns.length}
                  >
                    {t("common.loadingDocuments")}
                  </td>
                </tr>
              ) : filteredFeedback.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-gray-500"
                    colSpan={visibleTableColumns.length}
                  >
                    {t("superAdmin.feedback.noFeedback")}
                  </td>
                </tr>
              ) : (
                filteredFeedback.map((item) => (
                  <tr key={item.id}>
                    {visibleTableColumns.map((column) => (
                      <td key={column.id} className="py-4 pr-4">
                        {column.render(item)}
                      </td>
                    ))}
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
