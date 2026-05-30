import { t, type TranslationKey } from "../lib/i18n";
import type { ShipperUserAdminAssignment } from "../lib/shipperUsers";

interface ResponsibleAdminBadgesProps {
  assignments: ShipperUserAdminAssignment[];
  emptyClassName?: string;
}

export default function ResponsibleAdminBadges({
  assignments,
  emptyClassName = "text-sm text-gray-400 dark:text-gray-500",
}: ResponsibleAdminBadgesProps) {
  if (assignments.length === 0) {
    return <span className={emptyClassName}>-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {assignments.map((assignment) => {
        const name = assignment.user_name || assignment.email;
        const roleLabel = t(
          `superAdmin.operators.staffRole.${assignment.staff_role}` as TranslationKey,
        );

        return (
          <span
            key={assignment.admin_user_id}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-1 dark:ring-cyan-900"
            title={`${name} / ${roleLabel}`}
          >
            <span className="min-w-0 truncate">{name}</span>
            <span className="shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-black text-cyan-900 dark:bg-cyan-900/60 dark:text-cyan-100">
              {roleLabel}
            </span>
          </span>
        );
      })}
    </div>
  );
}
