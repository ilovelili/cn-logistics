import { t } from "../lib/i18n";

interface PaginationControlsProps {
  adminTheme?: boolean;
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
  adminTheme = false,
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
  const borderClass = adminTheme
    ? "border-gray-200 dark:border-gray-800"
    : "border-slate-100";
  const mutedTextClass = adminTheme
    ? "text-gray-500 dark:text-gray-400"
    : "text-slate-500";
  const groupClass = adminTheme
    ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    : "border-slate-200 bg-white";
  const dividerClass = adminTheme
    ? "border-gray-200 dark:border-gray-700"
    : "border-slate-200";
  const inactiveButtonClass = adminTheme
    ? "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
    : "text-slate-600 hover:bg-slate-50";
  const activeButtonClass = adminTheme
    ? "bg-gray-950 text-white dark:bg-cyan-300 dark:text-gray-950"
    : "bg-slate-950 text-white";

  return (
    <div
      className={`flex flex-col gap-4 border-t px-5 py-4 lg:flex-row lg:items-center lg:justify-between ${borderClass}`}
    >
      <div className={`text-sm font-medium ${mutedTextClass}`}>
        {t("jobs.pagination.summary", {
          total,
          from: visibleFrom,
          to: visibleTo,
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
        <div className={`inline-flex overflow-hidden rounded-xl border ${groupClass}`}>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            className={`border-r px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${dividerClass} ${inactiveButtonClass}`}
          >
            {t("jobs.pagination.previous")}
          </button>
          {pageItems.map((pageItem, index) =>
            pageItem === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className={`min-w-10 border-r px-3 py-2 text-center text-sm font-semibold text-slate-400 dark:text-gray-500 ${dividerClass}`}
              >
                ...
              </span>
            ) : (
              <button
                key={pageItem}
                type="button"
                onClick={() => onPageChange(pageItem)}
                className={`min-w-10 border-r px-3 py-2 text-sm font-semibold transition ${dividerClass} ${
                  pageItem === currentPage
                    ? activeButtonClass
                    : inactiveButtonClass
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
            className={`border-l px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${dividerClass} ${inactiveButtonClass}`}
          >
            {t("jobs.pagination.next")}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${mutedTextClass}`}>
            {t("jobs.pagination.pageSize")}
          </span>
          <div className={`inline-flex overflow-hidden rounded-xl border ${groupClass}`}>
            {pageSizeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onPageSizeChange(option)}
                className={`min-w-10 border-r px-3 py-2 text-sm font-semibold transition last:border-r-0 ${dividerClass} ${
                  option === pageSize
                    ? activeButtonClass
                    : inactiveButtonClass
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
