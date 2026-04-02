import { useState } from "react";
import {
  Package,
  LogOut,
  Sun,
  Moon,
  LayoutDashboard,
  ClipboardList,
} from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import TrackingEntryForm from "./TrackingEntryForm";
import AdminDashboard from "./AdminDashboard";

type AdminView = "dashboard" | "tracking";

interface AdminPanelProps {
  darkMode: boolean;
  onToggleDark: () => void;
}

export default function AdminPanel({
  darkMode,
  onToggleDark,
}: AdminPanelProps) {
  const { logout } = useAdminAuth();
  const [view, setView] = useState<AdminView>("dashboard");

  const navItems = [
    {
      id: "dashboard" as AdminView,
      label: "ダッシュボード",
      icon: LayoutDashboard,
    },
    { id: "tracking" as AdminView, label: "追跡情報入力", icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-gray-900 dark:text-white">
                CN Logistics
              </span>
              <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                管理者
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
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4">
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
                      ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          {view === "dashboard" && <AdminDashboard />}
          {view === "tracking" && <TrackingEntryForm />}
        </main>
      </div>
    </div>
  );
}
