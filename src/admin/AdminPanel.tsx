import { useState } from "react";
import {
  FilePlus2,
  LogOut,
  Moon,
  Package,
  ShipWheel,
  Sun,
  LayoutDashboard,
} from "lucide-react";
import { useAdminAuth } from "./useAdminAuth";
import AdminDashboard from "./AdminDashboard";
import ShipmentEntryForm from "./ShipmentEntryForm";
import { t } from "../lib/i18n";
import { ShipmentDocument, ShipmentJob } from "../lib/shipmentJobs";

type AdminView = "dashboard" | "shipmentEntry";

interface AdminPanelProps {
  darkMode: boolean;
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  jobsLoading: boolean;
  onToggleDark: () => void;
  onRefreshJobs: () => Promise<void>;
}

export default function AdminPanel({
  darkMode,
  jobs,
  documents,
  jobsLoading,
  onToggleDark,
  onRefreshJobs,
}: AdminPanelProps) {
  const { logout } = useAdminAuth();
  const [view, setView] = useState<AdminView>("dashboard");

  const navItems = [
    {
      id: "dashboard" as AdminView,
      label: t("admin.nav.dashboard"),
      icon: LayoutDashboard,
    },
    {
      id: "shipmentEntry" as AdminView,
      label: t("admin.nav.shipmentEntry"),
      icon: FilePlus2,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-950 dark:bg-white rounded-lg flex items-center justify-center">
              <ShipWheel className="w-4 h-4 text-white dark:text-slate-950" />
            </div>
            <div>
              <span className="font-bold text-gray-900 dark:text-white">
                CN Logistics
              </span>
              <span className="ml-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                {t("common.admin")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleDark}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
            >
              <span className="relative flex items-center justify-center w-5 h-5">
                <Sun
                  className={`w-5 h-5 text-amber-500 absolute transition-all duration-300 ${darkMode ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"}`}
                />
                <Moon
                  className={`w-5 h-5 text-gray-600 dark:text-gray-300 absolute transition-all duration-300 ${darkMode ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`}
                />
              </span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t("common.logout")}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 text-xs text-gray-500 dark:text-gray-400">
            <Package className="mb-2 h-4 w-4" />
            {t("admin.workflowHint")}
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          {view === "dashboard" && (
            <AdminDashboard
              jobs={jobs}
              documents={documents}
              loading={jobsLoading}
            />
          )}
          {view === "shipmentEntry" && (
            <ShipmentEntryForm
              jobs={jobs}
              documents={documents}
              onRefresh={onRefreshJobs}
            />
          )}
        </main>
      </div>
    </div>
  );
}
