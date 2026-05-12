import type { ButtonHTMLAttributes, ReactNode } from "react";

type TableActionButtonVariant = "primary" | "success" | "warning" | "danger";

const variantClasses: Record<TableActionButtonVariant, string> = {
  primary:
    "bg-slate-950 text-white hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  warning: "bg-amber-500 text-white hover:bg-amber-600",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
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
