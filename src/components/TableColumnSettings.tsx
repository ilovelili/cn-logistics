import { GripVertical, RotateCcw, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InstantTooltip from "./InstantTooltip";
import type { TableColumnConfig } from "./useTableColumnSettings";

export type { TableColumnConfig } from "./useTableColumnSettings";

interface TableColumnSettingsButtonProps<TColumnId extends string> {
  columns: TableColumnConfig<TColumnId>[];
  visibleColumnIds: Set<TColumnId>;
  onVisibilityChange: (columnId: TColumnId, visible: boolean) => void;
  onMoveColumn: (fromColumnId: TColumnId, insertionIndex: number) => void;
  onReset: () => void;
  adminTheme?: boolean;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export default function TableColumnSettingsButton<TColumnId extends string>({
  columns,
  visibleColumnIds,
  onVisibilityChange,
  onMoveColumn,
  onReset,
  adminTheme = false,
}: TableColumnSettingsButtonProps<TColumnId>) {
  const [open, setOpen] = useState(false);
  const [draggingColumnId, setDraggingColumnId] = useState<TColumnId | null>(
    null,
  );
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [popoverPosition, setPopoverPosition] =
    useState<PopoverPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePopoverPosition = () => {
      if (!buttonRef.current) return;

      const buttonRect = buttonRef.current.getBoundingClientRect();
      const viewportPadding = 16;
      const popoverGap = 8;
      const width = Math.min(
        window.innerWidth >= 640
          ? 288
          : window.innerWidth - viewportPadding * 2,
        window.innerWidth - viewportPadding * 2,
      );
      const left = Math.min(
        Math.max(viewportPadding, buttonRect.right - width),
        window.innerWidth - viewportPadding - width,
      );
      const top = buttonRect.bottom + popoverGap;

      setPopoverPosition({
        top,
        left,
        width,
        maxHeight: Math.max(
          120,
          Math.min(
            window.innerHeight * 0.7,
            window.innerHeight - top - viewportPadding,
          ),
        ),
      });
    };

    updatePopoverPosition();

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !popoverRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open]);

  return (
    <>
      <div ref={containerRef} className="relative inline-flex">
        <InstantTooltip label="列設定">
          {(tooltipId) => (
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                adminTheme
                  ? "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              aria-label="列設定"
              aria-describedby={tooltipId}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </InstantTooltip>
      </div>

      {open &&
        popoverPosition &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-gray-800 dark:bg-gray-900"
            style={popoverPosition}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <div className="font-bold text-slate-900 dark:text-white">
                列設定
              </div>
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                リセット
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {columns.map((column, columnIndex) => (
                <div
                  key={column.id}
                  onDragOver={(event) => {
                    event.preventDefault();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setDropIndex(
                      event.clientY < bounds.top + bounds.height / 2
                        ? columnIndex
                        : columnIndex + 1,
                    );
                  }}
                  onDrop={(event) => {
                    if (draggingColumnId) {
                      const bounds =
                        event.currentTarget.getBoundingClientRect();
                      onMoveColumn(
                        draggingColumnId,
                        event.clientY < bounds.top + bounds.height / 2
                          ? columnIndex
                          : columnIndex + 1,
                      );
                    }
                    setDraggingColumnId(null);
                    setDropIndex(null);
                  }}
                  className={`relative flex items-center gap-2 rounded-xl border px-2 py-2 ${
                    draggingColumnId === column.id
                      ? "border-cyan-200 bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/30"
                      : "border-transparent hover:bg-slate-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {draggingColumnId && dropIndex === columnIndex && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-2 left-2 right-2 z-10 h-3 rounded-lg border border-dashed border-cyan-400 bg-cyan-50/95 shadow-sm dark:border-cyan-700 dark:bg-cyan-950/90"
                    />
                  )}
                  <span
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", column.id);
                      setDraggingColumnId(column.id);
                      setDropIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggingColumnId(null);
                      setDropIndex(null);
                    }}
                    className="flex shrink-0 cursor-grab items-center active:cursor-grabbing"
                  >
                    <GripVertical className="pointer-events-none h-4 w-4 text-slate-400" />
                  </span>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={visibleColumnIds.has(column.id)}
                      onChange={(event) =>
                        onVisibilityChange(column.id, event.target.checked)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-slate-950"
                    />
                    <span
                      className="min-w-0 truncate font-semibold text-slate-700 dark:text-gray-200"
                      title={column.label}
                    >
                      {column.label}
                    </span>
                  </label>
                </div>
              ))}
              <div
                aria-hidden="true"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropIndex(columns.length);
                }}
                onDrop={() => {
                  if (draggingColumnId) {
                    onMoveColumn(draggingColumnId, columns.length);
                  }
                  setDraggingColumnId(null);
                  setDropIndex(null);
                }}
                className={`mx-2 h-20 shrink-0 rounded-xl border border-dashed transition-colors ${
                  draggingColumnId && dropIndex === columns.length
                    ? "border-cyan-400 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/30"
                    : "border-transparent"
                }`}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
