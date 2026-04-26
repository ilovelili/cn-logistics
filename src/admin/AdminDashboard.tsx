import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  ShipWheel,
} from "lucide-react";
import { t } from "../lib/i18n";
import { ShipmentDocument, ShipmentJob } from "../lib/shipmentJobs";
import { ShipmentEntryCriteria } from "./ShipmentEntryForm";

interface AdminDashboardProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  onOpenShipmentEntry: (criteria: ShipmentEntryCriteria) => void;
}

export default function AdminDashboard({
  jobs,
  documents,
  loading,
  onOpenShipmentEntry,
}: AdminDashboardProps) {
  const customsHold = jobs.filter(
    (job) => job.status === "customs_hold",
  ).length;
  const completed = jobs.filter((job) => job.status === "completed").length;
  const pendingApproval = documents.filter(
    (document) =>
      document.scope === "customer" && document.approval_status === "pending",
  );
  const cards = [
    {
      label: t("jobs.title"),
      value: jobs.length,
      icon: ShipWheel,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950",
      criteria: { kind: "all" } satisfies ShipmentEntryCriteria,
    },
    {
      label: t("status.customsHold"),
      value: customsHold,
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950",
      criteria: {
        kind: "status",
        status: "customs_hold",
      } satisfies ShipmentEntryCriteria,
    },
    {
      label: t("status.completed"),
      value: completed,
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950",
      criteria: {
        kind: "status",
        status: "completed",
      } satisfies ShipmentEntryCriteria,
    },
    {
      label: t("documents.pendingApproval"),
      value: pendingApproval.length,
      icon: FileStack,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-950",
      criteria: {
        kind: "documentApproval",
        approvalStatus: "pending",
      } satisfies ShipmentEntryCriteria,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("admin.dashboard")}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          {t("admin.dashboardDescription")}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse"
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4" />
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                type="button"
                key={card.label}
                onClick={() => onOpenShipmentEntry(card.criteria)}
                className="rounded-xl border border-gray-200 bg-white p-6 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-cyan-700"
              >
                <div
                  className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-4`}
                >
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {card.value.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {card.label}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
