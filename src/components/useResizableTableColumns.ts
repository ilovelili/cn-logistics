import { useEffect, useMemo, useState } from "react";

const minimumColumnWidth = 72;
const maximumColumnWidth = 640;

export function useResizableTableColumns<TColumnId extends string>(
  storageKey: string,
  columns: { id: TColumnId; width: number }[],
) {
  const [state, setState] = useState<{
    storageKey: string;
    widths: Partial<Record<TColumnId, number>>;
  }>(() => ({
    storageKey,
    widths: readWidths<TColumnId>(storageKey),
  }));

  useEffect(() => {
    if (state.storageKey !== storageKey) {
      setState({ storageKey, widths: readWidths<TColumnId>(storageKey) });
    }
  }, [state.storageKey, storageKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      localStorage.setItem(state.storageKey, JSON.stringify(state.widths));
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [state]);

  const savedWidths =
    state.storageKey === storageKey
      ? state.widths
      : readWidths<TColumnId>(storageKey);

  const widths = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.id,
          clampWidth(savedWidths[column.id] ?? column.width),
        ]),
      ) as Record<TColumnId, number>,
    [columns, savedWidths],
  );

  const resizeColumn = (columnId: TColumnId, width: number) => {
    setState((current) => ({
      storageKey,
      widths: {
        ...(current.storageKey === storageKey
          ? current.widths
          : readWidths<TColumnId>(storageKey)),
        [columnId]: clampWidth(width),
      },
    }));
  };

  const resetColumnWidths = () => setState({ storageKey, widths: {} });

  return { widths, resizeColumn, resetColumnWidths };
}

function clampWidth(width: number) {
  return Math.max(minimumColumnWidth, Math.min(maximumColumnWidth, width));
}

function readWidths<TColumnId extends string>(
  storageKey: string,
): Partial<Record<TColumnId, number>> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey) ?? "{}",
    ) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [TColumnId, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    ) as Partial<Record<TColumnId, number>>;
  } catch {
    return {};
  }
}
