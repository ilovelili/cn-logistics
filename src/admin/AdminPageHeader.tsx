import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface AdminPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  titleTutorialTarget?: string;
  actions?: ReactNode;
}

export default function AdminPageHeader({
  icon: Icon,
  title,
  description,
  titleTutorialTarget,
  actions,
}: AdminPageHeaderProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:rounded-3xl sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 rounded-2xl bg-cyan-50 p-3 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1
              className="text-2xl font-black text-gray-900 dark:text-white"
              data-tutorial-target={titleTutorialTarget}
            >
              {title}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          </div>
        </div>
        {actions}
      </div>
    </section>
  );
}
