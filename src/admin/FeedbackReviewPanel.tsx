import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Search } from "lucide-react";
import {
  fetchAllShipmentFeedback,
  ShipmentFeedbackReview,
  ShipmentFeedbackTargetRole,
} from "../lib/shipmentFeedback";
import type { ShipmentDocument, ShipmentJob } from "../lib/shipmentJobs";
import { t } from "../lib/i18n";
import ShipmentJobDetailModal from "../components/ShipmentJobDetailModal";
import PaginationControls from "../components/PaginationControls";
import SortableTableHeader, {
  SortDirection,
} from "../components/SortableTableHeader";
import StickyTableHeaderToggle from "../components/StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "../components/useStickyTableHeaderPreference";
import TableHorizontalScrollHint from "../components/TableHorizontalScrollHint";
import TableScrollToTopButton from "../components/TableScrollToTopButton";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import { useTableColumnSettings } from "../components/useTableColumnSettings";
import { useHorizontalScrollHint } from "../components/useHorizontalScrollHint";
import { usePagination } from "../components/usePagination";

interface FeedbackReviewPanelProps {
  superAdminEmail: string;
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
}

type FeedbackColumnId =
  | "invoice"
  | "jobNumber"
  | "operator"
  | "targetRole"
  | "submitter"
  | "total_score"
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

function isInteractiveTableEvent(event: MouseEvent<HTMLElement>) {
  return Boolean(
    (event.target as HTMLElement).closest(
      "a,button,input,select,textarea,[role='button']",
    ),
  );
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
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollHint = useHorizontalScrollHint(tableScrollRef);
  const [selectedShipmentJobId, setSelectedShipmentJobId] = useState<
    string | null
  >(null);
  const jobsById = useMemo(
    () => new Map(jobs.map((job) => [job.id, job])),
    [jobs],
  );

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
        jobsById.get(item.shipment_job_id)?.job_number,
        item.submitter_email,
        item.admin_operator_email,
        getFeedbackTargetRoleLabel(item.admin_operator_staff_role),
        item.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [feedback, jobsById, query]);

  const sortedFeedback = useMemo(() => {
    return [...filteredFeedback].sort((first, second) =>
      compareFeedbackValues(
        getFeedbackSortValue(first, sortKey, jobsById),
        getFeedbackSortValue(second, sortKey, jobsById),
        sortDirection,
      ),
    );
  }, [filteredFeedback, jobsById, sortDirection, sortKey]);
  const {
    currentPage,
    pageCount,
    pageSize,
    paginatedItems: paginatedFeedback,
    visibleFrom,
    visibleTo,
    setCurrentPage,
    setPageSize,
  } = usePagination(sortedFeedback);

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
        id: "jobNumber",
        label: t("common.jobNumber"),
        width: 140,
        render: (item) => (
          <span className="font-mono font-bold text-gray-900 dark:text-white">
            {jobsById.get(item.shipment_job_id)?.job_number || "-"}
          </span>
        ),
      },
      {
        id: "operator",
        label: t("superAdmin.feedback.operator"),
        width: 210,
        render: (item) => (
          <span
            className="block truncate text-gray-700 dark:text-gray-300"
            title={item.admin_operator_email ?? undefined}
          >
            {item.admin_operator_email || "-"}
          </span>
        ),
      },
      {
        id: "targetRole",
        label: t("feedback.targetRole"),
        width: 130,
        render: (item) => (
          <span className="inline-flex rounded-full border border-cyan-200 bg-transparent px-2.5 py-1 text-xs font-black text-cyan-800 dark:border-cyan-900 dark:text-cyan-200">
            {getFeedbackTargetRoleLabel(item.admin_operator_staff_role)}
          </span>
        ),
      },
      {
        id: "submitter",
        label: t("superAdmin.feedback.submitter"),
        width: 200,
        render: (item) => (
          <span
            className="block truncate text-gray-700 dark:text-gray-300"
            title={item.submitter_email}
          >
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
        id: "total_score",
        label: t("feedback.totalScore"),
        width: 140,
        render: (item) => <RatingPill value={getFeedbackTotalScore(item)} />,
      },
      {
        id: "total_rating",
        label: t("feedback.summary"),
        width: 140,
        render: (item) => <RatingPill value={getFeedbackAverageScore(item)} />,
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
    [jobsById],
  );
  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    "super_admin_feedback_table_columns_v2",
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
          <span data-tutorial-target="feedback-review-page">
            {t("superAdmin.feedback.title")}
          </span>
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
            <div className="flex items-center gap-2">
              <StickyTableHeaderToggle
                adminTheme
                enabled={stickyHeaderEnabled}
                onToggle={toggleStickyHeader}
              />
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
        </div>

        <div
          className={`mb-3 flex justify-end sm:${scrollHint.canScroll ? "flex" : "hidden"}`}
        >
          <TableHorizontalScrollHint
            adminTheme
            atStart={scrollHint.atStart}
            atEnd={scrollHint.atEnd}
            onScroll={scrollHint.scrollByDirection}
          />
        </div>

        <div className="relative">
          <div
            ref={tableScrollRef}
            className={
              stickyHeaderEnabled
                ? "max-h-[70vh] overflow-auto overscroll-contain"
                : "overflow-x-auto"
            }
          >
            <table
              className="w-full table-fixed text-left text-sm"
              style={{ minWidth: `${Math.max(tableMinWidth, 320)}px` }}
            >
            <colgroup>
              {visibleTableColumns.map((column) => (
                <col key={column.id} style={{ width: `${column.width}px` }} />
              ))}
            </colgroup>
            <thead
              className={`${stickyHeaderEnabled ? "sticky top-0 z-20 shadow-sm" : ""} bg-white dark:bg-gray-900`}
            >
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {visibleTableColumns.map((column, index) => (
                  <SortableTableHeader
                    key={column.id}
                    label={column.label}
                    sortKey={column.id}
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleSort}
                    className={`py-3 pr-4 text-left ${
                      index === 0
                        ? "sticky left-0 z-30 bg-white pl-4 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)] dark:bg-gray-900"
                        : ""
                    }`}
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
                paginatedFeedback.map((item) => (
                  <tr
                    key={`${item.id}-${item.admin_operator_email ?? "none"}`}
                    onDoubleClick={(event) => {
                      if (isInteractiveTableEvent(event)) return;
                      setSelectedShipmentJobId(item.shipment_job_id);
                    }}
                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  >
                    {visibleTableColumns.map((column, index) => (
                      <td
                        key={column.id}
                        className={`py-4 pr-4 align-middle ${
                          index === 0
                            ? "sticky left-0 z-10 bg-white pl-4 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)] dark:bg-gray-900"
                            : ""
                        }`}
                      >
                        {column.render(item)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
          <TableScrollToTopButton
            adminTheme
            onClick={() =>
              tableScrollRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
          />
        </div>
        <PaginationControls
          adminTheme
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={sortedFeedback.length}
          visibleFrom={visibleFrom}
          visibleTo={visibleTo}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>

      <ShipmentJobDetailModal
        job={selectedJob}
        documents={selectedJobDocuments}
        showInternalDocuments
        onClose={() => setSelectedShipmentJobId(null)}
      />
    </div>
  );
}

function getFeedbackSortValue(
  item: ShipmentFeedbackReview,
  sortKey: FeedbackColumnId,
  jobsById?: Map<string, ShipmentJob>,
) {
  switch (sortKey) {
    case "invoice":
      return item.shipment_invoice_number ?? item.shipment_job_id;
    case "jobNumber":
      return jobsById?.get(item.shipment_job_id)?.job_number ?? "";
    case "operator":
      return item.admin_operator_email ?? "";
    case "targetRole":
      return getFeedbackTargetRoleLabel(item.admin_operator_staff_role);
    case "submitter":
      return item.submitter_email;
    case "total_score":
      return getFeedbackTotalScore(item);
    case "total_rating":
      return getFeedbackAverageScore(item);
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

function getFeedbackTargetRoleLabel(
  targetRole: ShipmentFeedbackTargetRole | null,
) {
  if (targetRole === "sales") {
    return t("superAdmin.operators.staffRole.sales");
  }
  if (targetRole === "operations") {
    return t("superAdmin.operators.staffRole.operations");
  }

  return "-";
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

function getFeedbackTotalScore(item: ShipmentFeedbackReview) {
  return (
    item.attitude_rating +
    item.professionalism_rating +
    item.speed_rating +
    item.accuracy_rating +
    item.price_rating
  );
}

function getFeedbackAverageScore(item: ShipmentFeedbackReview) {
  return getFeedbackTotalScore(item) / 5;
}

function RatingPill({ value }: { value: number }) {
  const displayValue = Number.isInteger(value) ? value : value.toFixed(1);

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-transparent px-2.5 py-1 text-xs font-black text-amber-700 dark:border-amber-900 dark:text-amber-200">
      {displayValue}
    </span>
  );
}
