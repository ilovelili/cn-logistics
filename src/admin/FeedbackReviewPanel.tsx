import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import {
  fetchAllShipmentFeedback,
  ShipmentFeedbackReview,
} from "../lib/shipmentFeedback";
import type { ShipmentDocument, ShipmentJob } from "../lib/shipmentJobs";
import { t } from "../lib/i18n";
import ShipmentJobDetailModal from "../components/ShipmentJobDetailModal";
import SortableTableHeader, {
  SortDirection,
} from "../components/SortableTableHeader";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import { useTableColumnSettings } from "../components/useTableColumnSettings";

interface FeedbackReviewPanelProps {
  superAdminEmail: string;
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
}

type FeedbackColumnId =
  | "invoice"
  | "operator"
  | "submitter"
  | "total_rating"
  | "attitude_rating"
  | "professionalism_rating"
  | "speed_rating"
  | "accuracy_rating"
  | "price_rating"
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
  jobs,
  documents,
}: FeedbackReviewPanelProps) {
  const [feedback, setFeedback] = useState<ShipmentFeedbackReview[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<FeedbackColumnId>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedShipmentJobId, setSelectedShipmentJobId] = useState<
    string | null
  >(null);

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

  const sortedFeedback = useMemo(() => {
    return [...filteredFeedback].sort((first, second) =>
      compareFeedbackValues(
        getFeedbackSortValue(first, sortKey),
        getFeedbackSortValue(second, sortKey),
        sortDirection,
      ),
    );
  }, [filteredFeedback, sortDirection, sortKey]);

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
        id: "attitude_rating",
        label: t("feedback.attitude"),
        width: 120,
        render: (item) => <RatingPill value={item.attitude_rating} />,
      },
      {
        id: "professionalism_rating",
        label: t("feedback.professionalism"),
        width: 120,
        render: (item) => <RatingPill value={item.professionalism_rating} />,
      },
      {
        id: "speed_rating",
        label: t("feedback.speed"),
        width: 120,
        render: (item) => <RatingPill value={item.speed_rating} />,
      },
      {
        id: "accuracy_rating",
        label: t("feedback.accuracy"),
        width: 120,
        render: (item) => <RatingPill value={item.accuracy_rating} />,
      },
      {
        id: "price_rating",
        label: t("feedback.price"),
        width: 120,
        render: (item) => <RatingPill value={item.price_rating} />,
      },
      {
        id: "total_rating",
        label: t("feedback.summary"),
        width: 140,
        render: (item) => (
          <RatingPill value={getFeedbackServiceSummaryRating(item)} />
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
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedShipmentJobId) ?? null,
    [jobs, selectedShipmentJobId],
  );
  const selectedJobDocuments = useMemo(
    () =>
      selectedJob
        ? documents.filter(
            (document) => document.shipment_job_id === selectedJob.id,
          )
        : [],
    [documents, selectedJob],
  );

  const handleSort = (nextSortKey: FeedbackColumnId) => {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          {t("superAdmin.feedback.title")}
        </h1>
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
                  <SortableTableHeader
                    key={column.id}
                    label={column.label}
                    sortKey={column.id}
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                    className="py-3 pr-4 text-left"
                    buttonClassName="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-left transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
                    activeClassName="text-gray-900 dark:text-white"
                    inactiveClassName="text-gray-500 dark:text-gray-400"
                  />
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
              ) : sortedFeedback.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-gray-500"
                    colSpan={visibleTableColumns.length}
                  >
                    {t("superAdmin.feedback.noFeedback")}
                  </td>
                </tr>
              ) : (
                sortedFeedback.map((item) => (
                  <tr
                    key={`${item.id}-${item.admin_operator_email ?? "none"}`}
                    onClick={() => setSelectedShipmentJobId(item.shipment_job_id)}
                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
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

      <ShipmentJobDetailModal
        job={selectedJob}
        documents={selectedJobDocuments}
        onClose={() => setSelectedShipmentJobId(null)}
      />
    </div>
  );
}

function getFeedbackSortValue(
  item: ShipmentFeedbackReview,
  sortKey: FeedbackColumnId,
) {
  switch (sortKey) {
    case "invoice":
      return item.shipment_invoice_number ?? item.shipment_job_id;
    case "operator":
      return item.admin_operator_email ?? "";
    case "submitter":
      return item.submitter_email;
    case "total_rating":
      return getFeedbackServiceSummaryRating(item);
    case "attitude_rating":
    case "professionalism_rating":
    case "speed_rating":
    case "accuracy_rating":
    case "price_rating":
      return item[sortKey];
    case "reason":
      return item.reason ?? "";
    case "created_at":
      return new Date(item.created_at).getTime();
  }
}

function compareFeedbackValues(
  first: string | number,
  second: string | number,
  direction: SortDirection,
) {
  const comparison =
    typeof first === "number" && typeof second === "number"
      ? first - second
      : String(first).localeCompare(String(second), "ja-JP", {
          numeric: true,
          sensitivity: "base",
        });

  return direction === "asc" ? comparison : -comparison;
}

function getFeedbackServiceSummaryRating(item: ShipmentFeedbackReview) {
  return (
    (item.attitude_rating +
      item.professionalism_rating +
      item.speed_rating +
      item.accuracy_rating) /
    4
  );
}

function RatingPill({ value }: { value: number }) {
  const displayValue = Number.isInteger(value) ? value : value.toFixed(1);

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
      <Star className="h-3.5 w-3.5" fill="currentColor" />
      {displayValue}
    </span>
  );
}
