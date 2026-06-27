import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { t } from "../lib/i18n";
import InstantTooltip from "./InstantTooltip";

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
  const runWithoutViewportJump = (callback: () => void) => {
    const scrollY = window.scrollY;
    callback();
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY });
    });
  };
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
  const inactiveStateClass = "cursor-not-allowed opacity-40";

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
        <div
          className={`inline-flex overflow-hidden rounded-xl border ${groupClass}`}
        >
          <InstantTooltip label={t("jobs.pagination.first")} align="left">
            {(tooltipId) => (
              <button
                type="button"
                aria-disabled={currentPage === 1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (currentPage !== 1) {
                    runWithoutViewportJump(() => onPageChange(1));
                  }
                }}
                className={`inline-flex min-w-10 items-center justify-center border-r px-3 py-2 text-sm font-semibold transition ${dividerClass} ${inactiveButtonClass} ${
                  currentPage === 1 ? inactiveStateClass : ""
                }`}
                aria-label={t("jobs.pagination.first")}
                aria-describedby={tooltipId}
              >
                <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </InstantTooltip>
          {pageItems.map((pageItem) => (
            <button
              key={pageItem}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                runWithoutViewportJump(() => onPageChange(pageItem))
              }
              className={`min-w-10 border-r px-3 py-2 text-sm font-semibold transition ${dividerClass} ${
                pageItem === currentPage
                  ? activeButtonClass
                  : inactiveButtonClass
              }`}
            >
              {pageItem}
            </button>
          ))}
          <InstantTooltip label={t("jobs.pagination.last")}>
            {(tooltipId) => (
              <button
                type="button"
                aria-disabled={currentPage === pageCount}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (currentPage !== pageCount) {
                    runWithoutViewportJump(() => onPageChange(pageCount));
                  }
                }}
                className={`inline-flex min-w-10 items-center justify-center px-3 py-2 text-sm font-semibold transition ${inactiveButtonClass} ${
                  currentPage === pageCount ? inactiveStateClass : ""
                }`}
                aria-label={t("jobs.pagination.last")}
                aria-describedby={tooltipId}
              >
                <ChevronsRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </InstantTooltip>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${mutedTextClass}`}>
            {t("jobs.pagination.pageSize")}
          </span>
          <div
            className={`inline-flex overflow-hidden rounded-xl border ${groupClass}`}
          >
            {pageSizeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  runWithoutViewportJump(() => onPageSizeChange(option))
                }
                className={`min-w-10 border-r px-3 py-2 text-sm font-semibold transition last:border-r-0 ${dividerClass} ${
                  option === pageSize ? activeButtonClass : inactiveButtonClass
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

function getPaginationItems(currentPage: number, pageCount: number): number[] {
  const windowSize = Math.min(5, pageCount);
  const maxStart = pageCount - windowSize + 1;
  const start = Math.max(Math.min(currentPage - 2, maxStart), 1);

  return Array.from({ length: windowSize }, (_, index) => start + index);
}
