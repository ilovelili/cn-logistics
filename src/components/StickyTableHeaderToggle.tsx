import { Lock, Unlock } from "lucide-react";
import { t } from "../lib/i18n";
import InstantTooltip from "./InstantTooltip";

interface StickyTableHeaderToggleProps {
  adminTheme?: boolean;
  enabled: boolean;
  onToggle: () => void;
}

export default function StickyTableHeaderToggle({
  adminTheme = false,
  enabled,
  onToggle,
}: StickyTableHeaderToggleProps) {
  const Icon = enabled ? Lock : Unlock;
  const label = enabled
    ? t("table.stickyHeader.disable")
    : t("table.stickyHeader.enable");

  return (
    <InstantTooltip label={label}>
      {(tooltipId) => (
        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
            enabled
              ? adminTheme
                ? "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:bg-cyan-950"
                : "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
              : adminTheme
                ? "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
          aria-pressed={enabled}
          aria-label={label}
          aria-describedby={tooltipId}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </InstantTooltip>
  );
}
