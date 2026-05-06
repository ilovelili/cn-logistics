import { useEffect, useMemo, useState } from "react";

export interface TableColumnConfig<TColumnId extends string> {
  id: TColumnId;
  label: string;
}

interface TableColumnSettingsState<TColumnId extends string> {
  order: TColumnId[];
  hidden: TColumnId[];
}

export function useTableColumnSettings<TColumnId extends string>(
  storageKey: string,
  columns: TableColumnConfig<TColumnId>[],
) {
  const [settings, setSettings] = useState<TableColumnSettingsState<TColumnId>>(
    () => readSettings(storageKey),
  );

  const orderedColumns = useMemo(() => {
    const knownColumnIds = new Set(columns.map((column) => column.id));
    const configuredColumns = settings.order
      .filter((columnId) => knownColumnIds.has(columnId))
      .map((columnId) => columns.find((column) => column.id === columnId))
      .filter((column): column is TableColumnConfig<TColumnId> =>
        Boolean(column),
      );
    const missingColumns = columns.filter(
      (column) => !settings.order.includes(column.id),
    );

    return [...configuredColumns, ...missingColumns];
  }, [columns, settings.order]);

  const visibleColumns = orderedColumns.filter(
    (column) => !settings.hidden.includes(column.id),
  );
  const visibleColumnIds = new Set(visibleColumns.map((column) => column.id));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings, storageKey]);

  const setColumnVisibility = (columnId: TColumnId, visible: boolean) => {
    setSettings((current) => {
      if (!visible && visibleColumns.length <= 1) {
        return current;
      }

      return {
        ...current,
        hidden: visible
          ? current.hidden.filter(
              (hiddenColumnId) => hiddenColumnId !== columnId,
            )
          : [...new Set([...current.hidden, columnId])],
      };
    });
  };

  const moveColumn = (fromColumnId: TColumnId, toColumnId: TColumnId) => {
    if (fromColumnId === toColumnId) return;

    setSettings((current) => {
      const nextOrder = orderedColumns.map((column) => column.id);
      const fromIndex = nextOrder.indexOf(fromColumnId);
      const toIndex = nextOrder.indexOf(toColumnId);

      if (fromIndex === -1 || toIndex === -1) {
        return current;
      }

      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, fromColumnId);

      return {
        ...current,
        order: nextOrder,
      };
    });
  };

  const resetColumns = () => {
    setSettings({
      order: columns.map((column) => column.id),
      hidden: [],
    });
  };

  return {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  };
}

function readSettings<TColumnId extends string>(
  storageKey: string,
): TableColumnSettingsState<TColumnId> {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) {
      return { order: [], hidden: [] };
    }

    const parsed = JSON.parse(value) as Partial<
      TableColumnSettingsState<TColumnId>
    >;

    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return { order: [], hidden: [] };
  }
}
