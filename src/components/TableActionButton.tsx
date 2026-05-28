import type { ButtonHTMLAttributes, ReactNode } from "react";

type TableActionButtonVariant = "primary" | "success" | "warning" | "danger";

const variantClasses: Record<TableActionButtonVariant, string> = {
  primary:
    "border border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800",
  success:
    "border border-emerald-200 bg-transparent text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40",
  warning:
    "border border-amber-200 bg-transparent text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-200 dark:hover:bg-amber-950/40",
  danger:
    "border border-rose-200 bg-transparent text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40",
};

interface TableActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant: TableActionButtonVariant;
}

export default function TableActionButton({
  children,
  icon,
  variant,
  className = "",
  type = "button",
  ...props
}: TableActionButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
