import { t } from "../lib/i18n";

interface PaginationControlsProps {
  currentPage: number;
  pageCount: number;
  pageSize: number;
  total: number;
  visibleFrom: number;
  visibleTo: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const defaultPageSizeOptions = [10, 15, 30];

export default function PaginationControls({
  currentPage,
  pageCount,
  pageSize,
  total,
  visibleFrom,
  visibleTo,
  pageSizeOptions = defaultPageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const pageItems = getPaginationItems(currentPage, pageCount);

  return (
    <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="text-sm font-medium text-slate-500">
        {t("jobs.pagination.summary", {
          total,
          from: visibleFrom,
          to: visibleTo,
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
        <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            className="border-r border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("jobs.pagination.previous")}
          </button>
          {pageItems.map((pageItem, index) =>
            pageItem === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="min-w-10 border-r border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-400"
              >
                ...
              </span>
            ) : (
              <button
                key={pageItem}
                type="button"
                onClick={() => onPageChange(pageItem)}
                className={`min-w-10 border-r border-slate-200 px-3 py-2 text-sm font-semibold transition ${
                  pageItem === currentPage
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {pageItem}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => onPageChange(Math.min(currentPage + 1, pageCount))}
            className="border-l border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("jobs.pagination.next")}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-500">
            {t("jobs.pagination.pageSize")}
          </span>
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white">
            {pageSizeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onPageSizeChange(option)}
                className={`min-w-10 border-r border-slate-200 px-3 py-2 text-sm font-semibold transition last:border-r-0 ${
                  option === pageSize
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getPaginationItems(
  currentPage: number,
  pageCount: number,
): Array<number | "ellipsis"> {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", pageCount];
  }

  if (currentPage >= pageCount - 2) {
    return [
      1,
      "ellipsis",
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ];
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    pageCount,
  ];
}
