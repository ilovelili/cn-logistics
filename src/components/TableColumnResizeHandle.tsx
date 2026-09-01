import type { PointerEvent } from "react";
import { t } from "../lib/i18n";

export default function TableColumnResizeHandle({
  label,
  width,
  onResize,
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
}) {
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let animationFrame: number | null = null;
    let nextWidth = startWidth;

    const move = (moveEvent: globalThis.PointerEvent) => {
      nextWidth = startWidth + moveEvent.clientX - startX;
      if (animationFrame !== null) return;

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        onResize(nextWidth);
      });
    };
    const stop = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
        onResize(nextWidth);
      }
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  return (
    <div
      role="separator"
      aria-label={t("common.resizeColumn", { column: label })}
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={startResize}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        onResize(width + (event.key === "ArrowRight" ? 10 : -10));
      }}
      className="group absolute -right-1 top-0 z-40 flex h-full w-3 cursor-col-resize touch-none select-none items-center justify-center outline-none"
    >
      <span className="h-5 w-0.5 rounded-full bg-slate-300 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100 dark:bg-gray-600" />
    </div>
  );
}
