import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Truck,
  FileText,
  Menu,
  X,
  Sun,
  Moon,
  ShieldCheck,
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import Orders from "./components/Orders";
import Tracking from "./components/Tracking";
import Warehouses from "./components/Warehouses";
import Carriers from "./components/Carriers";
import Customs from "./components/Customs";
import { AdminAuthProvider, useAdminAuth } from "./admin/AdminAuthContext";
import AdminLogin from "./admin/AdminLogin";
import AdminPanel from "./admin/AdminPanel";

type View =
  | "dashboard"
  | "orders"
  | "tracking"
  | "warehouses"
  | "carriers"
  | "customs";

function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  return [darkMode, () => setDarkMode((d) => !d)] as const;
}

function MainApp({
  darkMode,
  onToggleDark,
}: {
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAdminMode, setShowAdminMode] = useState(false);
  const { isAuthenticated } = useAdminAuth();

  if (showAdminMode) {
    if (!isAuthenticated) {
      return <AdminLogin onBack={() => setShowAdminMode(false)} />;
    }
    return <AdminPanel darkMode={darkMode} onToggleDark={onToggleDark} />;
  }

  const navigation = [
    { id: "dashboard" as View, name: "ダッシュボード", icon: LayoutDashboard },
    { id: "orders" as View, name: "注文管理", icon: ShoppingCart },
    { id: "tracking" as View, name: "荷物追跡", icon: Package },
    { id: "warehouses" as View, name: "倉庫管理", icon: Warehouse },
    { id: "carriers" as View, name: "キャリア管理", icon: Truck },
    { id: "customs" as View, name: "通関書類", icon: FileText },
  ];

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <Dashboard />;
      case "orders":
        return <Orders />;
      case "tracking":
        return <Tracking />;
      case "warehouses":
        return <Warehouses />;
      case "carriers":
        return <Carriers />;
      case "customs":
        return <Customs />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="flex h-screen overflow-hidden">
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-transform duration-200 ease-in-out`}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  CN Logistics
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  物流管理システム
                </p>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 font-medium"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
              <button
                onClick={() => setShowAdminMode(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700"
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm font-medium">管理者ポータル</span>
              </button>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  デモモード
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  モックデータを使用したPoC
                </p>
              </div>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-gray-900 bg-opacity-50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Menu className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              </button>
              <div className="flex items-center gap-4 ml-auto">
                <div className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <button
                  onClick={onToggleDark}
                  className="relative p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
                  title={
                    darkMode
                      ? "ライトモードに切り替え"
                      : "ダークモードに切り替え"
                  }
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
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
            {renderView()}
          </main>
        </div>
      </div>
    </div>
  );
}

function AppWithAuth() {
  const [darkMode, toggleDark] = useDarkMode();
  return (
    <AdminAuthProvider>
      <MainApp darkMode={darkMode} onToggleDark={toggleDark} />
    </AdminAuthProvider>
  );
}

export default AppWithAuth;
