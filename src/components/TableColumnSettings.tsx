import { GripVertical, RotateCcw, Settings } from "lucide-react";
import { useState } from "react";
import type { TableColumnConfig } from "./useTableColumnSettings";

export type { TableColumnConfig } from "./useTableColumnSettings";

interface TableColumnSettingsButtonProps<TColumnId extends string> {
  columns: TableColumnConfig<TColumnId>[];
  visibleColumnIds: Set<TColumnId>;
  onVisibilityChange: (columnId: TColumnId, visible: boolean) => void;
  onMoveColumn: (fromColumnId: TColumnId, toColumnId: TColumnId) => void;
  onReset: () => void;
  adminTheme?: boolean;
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
          adminTheme
            ? "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
        aria-label="列設定"
        title="列設定"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-gray-800 dark:bg-gray-900"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
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
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {columns.map((column) => (
              <div
                key={column.id}
                draggable
                onDragStart={() => setDraggingColumnId(column.id)}
                onDragEnd={() => setDraggingColumnId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingColumnId) {
                    onMoveColumn(draggingColumnId, column.id);
                  }
                  setDraggingColumnId(null);
                }}
                className={`flex cursor-grab items-center gap-2 rounded-xl border px-2 py-2 active:cursor-grabbing ${
                  draggingColumnId === column.id
                    ? "border-cyan-200 bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/30"
                    : "border-transparent hover:bg-slate-50 dark:hover:bg-gray-800"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={visibleColumnIds.has(column.id)}
                    onChange={(event) =>
                      onVisibilityChange(column.id, event.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-slate-950"
                  />
                  <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-gray-200">
                    {column.label}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
