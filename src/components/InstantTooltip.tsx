import { useId, type ReactNode } from "react";

interface InstantTooltipProps {
  label: string;
  children: (tooltipId: string) => ReactNode;
  align?: "left" | "right";
}

export default function InstantTooltip({
  label,
  children,
  align = "right",
}: InstantTooltipProps) {
  const tooltipId = useId();

  return (
    <div className="group relative inline-flex">
      {children(tooltipId)}
      <div
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute top-12 z-50 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-75 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-white dark:text-slate-950 ${
          align === "left" ? "left-0" : "right-0"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
