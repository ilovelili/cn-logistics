import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    align: "left" | "right";
  } | null>(null);

  const showTooltip = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPosition({
      top: rect.bottom + 8,
      left: align === "left" ? rect.left : rect.right,
      align,
    });
  }, [align]);

  const hideTooltip = useCallback(() => {
    setPosition(null);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children(tooltipId)}
      {position &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{
              left: position.left,
              top: position.top,
              transform:
                position.align === "left"
                  ? "translateX(0)"
                  : "translateX(-100%)",
            }}
            className="pointer-events-none fixed z-[300] whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-slate-950"
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}
