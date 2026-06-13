import { ArrowUp } from "lucide-react";
import { t } from "../lib/i18n";
import InstantTooltip from "./InstantTooltip";

interface TableScrollToTopButtonProps {
  adminTheme?: boolean;
  onClick: () => void;
}

export default function TableScrollToTopButton({
  adminTheme = false,
  onClick,
}: TableScrollToTopButtonProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-40">
      <InstantTooltip label={t("table.scrollToTop")}>
        {(tooltipId) => (
          <button
            type="button"
            onClick={() => {
              onClick();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition ${
              adminTheme
                ? "border-cyan-200 bg-white text-cyan-800 hover:bg-cyan-50 dark:border-cyan-900/70 dark:bg-gray-900 dark:text-cyan-200 dark:hover:bg-cyan-950/50"
                : "border-cyan-200 bg-white text-cyan-800 hover:bg-cyan-50"
            }`}
            aria-label={t("table.scrollToTop")}
            aria-describedby={tooltipId}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </InstantTooltip>
    </div>
  );
}
