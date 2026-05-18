import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../lib/i18n";

interface TableHorizontalScrollHintProps {
  adminTheme?: boolean;
  atStart: boolean;
  atEnd: boolean;
  onScroll: (direction: -1 | 1) => void;
}

export default function TableHorizontalScrollHint({
  adminTheme = false,
  atStart,
  atEnd,
  onScroll,
}: TableHorizontalScrollHintProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border p-1 text-xs font-semibold ${
        adminTheme
          ? "border-cyan-200 bg-white text-cyan-800 dark:border-cyan-900/70 dark:bg-gray-900 dark:text-cyan-200"
          : "border-cyan-200 bg-white text-cyan-800"
      }`}
    >
      <button
        type="button"
        onClick={() => onScroll(-1)}
        disabled={atStart}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
          adminTheme
            ? "hover:bg-cyan-50 disabled:text-gray-300 disabled:hover:bg-transparent dark:hover:bg-cyan-950/50 dark:disabled:text-gray-700"
            : "hover:bg-cyan-50 disabled:text-slate-300 disabled:hover:bg-transparent"
        }`}
        aria-label={t("jobs.tableScrollLeft")}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="px-1">{t("jobs.tableScrollHint")}</span>
      <button
        type="button"
        onClick={() => onScroll(1)}
        disabled={atEnd}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
          adminTheme
            ? "hover:bg-cyan-50 disabled:text-gray-300 disabled:hover:bg-transparent dark:hover:bg-cyan-950/50 dark:disabled:text-gray-700"
            : "hover:bg-cyan-50 disabled:text-slate-300 disabled:hover:bg-transparent"
        }`}
        aria-label={t("jobs.tableScrollRight")}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
