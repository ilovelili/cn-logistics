import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDirection = "asc" | "desc";

interface SortableTableHeaderProps<TSortKey extends string> {
  label: string;
  sortKey: TSortKey;
  activeSortKey: TSortKey | null;
  direction: SortDirection;
  onSort: (sortKey: TSortKey) => void;
  className?: string;
  buttonClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
}

export default function SortableTableHeader<TSortKey extends string>({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  className = "whitespace-nowrap px-3 py-3",
  buttonClassName = "inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-left transition hover:bg-slate-100 hover:text-slate-900",
  activeClassName = "text-slate-950",
  inactiveClassName = "",
}: SortableTableHeaderProps<TSortKey>) {
  const isActive = activeSortKey === sortKey;
  const Icon = !isActive
    ? ArrowUpDown
    : direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`${buttonClassName} ${
          isActive ? activeClassName : inactiveClassName
        }`}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </th>
  );
}
