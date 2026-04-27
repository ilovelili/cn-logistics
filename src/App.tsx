import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  FileStack,
  LogOut,
  Menu,
  Moon,
  ShipWheel,
  Sun,
  X,
} from "lucide-react";
import ShipmentDashboard from "./components/ShipmentDashboard";
import ShipmentJobs from "./components/ShipmentJobs";
import LoginPage from "./components/LoginPage";
import ProfileButton from "./components/ProfileButton";
import DocumentControl, {
  DocumentApprovalFilter,
} from "./components/DocumentControl";
import { AdminAuthProvider } from "./admin/AdminAuthContext";
import { useAdminAuth } from "./admin/useAdminAuth";
import AdminPanel from "./admin/AdminPanel";
import { verifyAppLogin } from "./lib/auth";
import { t } from "./lib/i18n";
import {
  fetchShipmentDocuments,
  fetchShipmentJobs,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
} from "./lib/shipmentJobs";

type View = "dashboard" | "jobs" | "documents";
type JobsStatusFilter = ShipmentStatus | "all";
type AuthRole = "user" | "admin";

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

  return [darkMode, () => setDarkMode((value) => !value)] as const;
}

function MainApp({
  darkMode,
  onToggleDark,
  profileEmail,
  initialAdminMode = false,
  onSwitchToUser,
  onBackToAdmin,
  onLogout,
}: {
  darkMode: boolean;
  onToggleDark: () => void;
  profileEmail: string;
  initialAdminMode?: boolean;
  onSwitchToUser?: (email: string) => void;
  onBackToAdmin?: () => void;
  onLogout: () => void;
}) {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const showAdminMode = initialAdminMode;
  const [jobs, setJobs] = useState<ShipmentJob[]>([]);
  const [documents, setDocuments] = useState<ShipmentDocument[]>([]);
  const [jobsStatusFilter, setJobsStatusFilter] =
    useState<JobsStatusFilter>("all");
  const [documentsApprovalFilter, setDocumentsApprovalFilter] =
    useState<DocumentApprovalFilter>("all");
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const { isAdminAuthenticated } = useAdminAuth();

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const [shipmentJobs, shipmentDocuments] = await Promise.all([
        fetchShipmentJobs(),
        fetchShipmentDocuments(),
      ]);
      setJobs(shipmentJobs);
      setDocuments(shipmentDocuments);
      setJobsError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("app.error.unknownSupabase");
      setJobs([]);
      setDocuments([]);
      setJobsError(message);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  if (showAdminMode) {
    return (
      <AdminPanel
        darkMode={darkMode}
        jobs={jobs}
        documents={documents}
        jobsLoading={jobsLoading}
        onToggleDark={onToggleDark}
        profileEmail={profileEmail}
        onSwitchToUser={onSwitchToUser}
        onLogout={onLogout}
        onRefreshJobs={loadJobs}
      />
    );
  }

  const navigation = [
    { id: "dashboard" as View, name: t("app.nav.dashboard"), icon: BarChart3 },
    { id: "jobs" as View, name: t("app.nav.jobs"), icon: ShipWheel },
    { id: "documents" as View, name: t("app.nav.documents"), icon: FileStack },
  ];

  const openJobsWithStatus = (status: JobsStatusFilter) => {
    setJobsStatusFilter(status);
    setCurrentView("jobs");
  };

  const openDocumentsWithFilter = (
    approvalFilter: DocumentApprovalFilter = "all",
  ) => {
    setDocumentsApprovalFilter(approvalFilter);
    setCurrentView("documents");
  };

  const handleSidebarToggle = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed((collapsed) => !collapsed);
    } else {
      setSidebarOpen(true);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return (
          <ShipmentDashboard
            jobs={jobs}
            documents={documents}
            loading={jobsLoading}
            error={jobsError}
            onOpenJobs={openJobsWithStatus}
            onOpenDocuments={openDocumentsWithFilter}
          />
        );
      case "jobs":
        return (
          <ShipmentJobs
            jobs={jobs}
            documents={documents}
            loading={jobsLoading}
            profileEmail={profileEmail}
            onRefresh={loadJobs}
            statusFilter={jobsStatusFilter}
            onStatusFilterChange={setJobsStatusFilter}
          />
        );
      case "documents":
        return (
          <DocumentControl
            jobs={jobs}
            documents={documents}
            loading={jobsLoading}
            onRefresh={loadJobs}
            isAdminAuthenticated={isAdminAuthenticated}
            approvalFilter={documentsApprovalFilter}
          />
        );
      default:
        return (
          <ShipmentDashboard
            jobs={jobs}
            documents={documents}
            loading={jobsLoading}
            error={jobsError}
            onOpenJobs={openJobsWithStatus}
            onOpenDocuments={openDocumentsWithFilter}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f2ec] dark:bg-gray-950">
      <div className="flex h-screen overflow-hidden">
        <aside
          className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} ${
            sidebarCollapsed ? "lg:hidden" : "lg:translate-x-0"
          } fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white transition-transform duration-200 ease-in-out lg:static`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
                    <ShipWheel className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight">
                      CN Logistics
                    </h1>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-2 overflow-y-auto p-4">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === "documents") {
                        setDocumentsApprovalFilter("all");
                      }
                      setCurrentView(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                      isActive
                        ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/20"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-3 font-bold">
                      <Icon className="h-5 w-5" />
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="space-y-3 border-t border-white/10 p-4">
              {onBackToAdmin && (
                <button
                  onClick={onBackToAdmin}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <ShipWheel className="h-5 w-5" />
                  <span className="text-sm font-bold">
                    {t("admin.switch.backToAdmin")}
                  </span>
                </button>
              )}
              <button
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-5 w-5" />
                <span className="text-sm font-bold">{t("common.logout")}</span>
              </button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="border-b border-slate-200 bg-white/80 px-5 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
            <div className="flex items-center justify-between">
              <button
                onClick={handleSidebarToggle}
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800"
                aria-label="メニューを切り替え"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="ml-auto flex items-center gap-4">
                <div className="hidden text-sm font-medium text-slate-500 sm:block dark:text-gray-400">
                  {new Date().toLocaleDateString("ja-JP", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <button
                  onClick={onToggleDark}
                  className="relative rounded-xl bg-slate-100 p-2 transition hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                  title={darkMode ? t("app.theme.light") : t("app.theme.dark")}
                >
                  <span className="relative flex h-5 w-5 items-center justify-center">
                    <Sun
                      className={`absolute h-5 w-5 text-amber-500 transition-all duration-300 ${darkMode ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"}`}
                    />
                    <Moon
                      className={`absolute h-5 w-5 text-slate-600 transition-all duration-300 dark:text-gray-300 ${darkMode ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`}
                    />
                  </span>
                </button>
                <ProfileButton email={profileEmail} />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-5 lg:p-8">
            {renderView()}
          </main>
        </div>
      </div>
    </div>
  );
}

function AppContent({
  darkMode,
  onToggleDark,
}: {
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const {
    login: loginAdmin,
    logout: logoutAdmin,
    isAdminAuthenticated,
  } = useAdminAuth();
  const [authRole, setAuthRole] = useState<AuthRole | null>(() => {
    const savedRole = sessionStorage.getItem("app_auth_role");
    const savedEmail = sessionStorage.getItem("app_auth_email");
    if (
      savedEmail &&
      ((savedRole === "admin" &&
        sessionStorage.getItem("admin_auth") === "true") ||
        savedRole === "user")
    ) {
      return savedRole;
    }
    return null;
  });
  const [authEmail, setAuthEmail] = useState(() => {
    return sessionStorage.getItem("app_auth_email") ?? "";
  });
  const [adminEmail, setAdminEmail] = useState(() => {
    return sessionStorage.getItem("app_admin_email") ?? "";
  });

  const handleLogin = async (email: string, password: string) => {
    const profile = await verifyAppLogin(email, password);
    if (profile?.role === "normal") {
      setAuthRole("user");
      setAuthEmail(profile.email);
      sessionStorage.setItem("app_auth_role", "user");
      sessionStorage.setItem("app_auth_email", profile.email);
      logoutAdmin();
      return true;
    }
    if (profile?.role === "admin" || profile?.role === "super_admin") {
      await loginAdmin(email, password);
      setAuthRole("admin");
      setAuthEmail(profile.email);
      setAdminEmail(profile.email);
      sessionStorage.setItem("app_auth_role", "admin");
      sessionStorage.setItem("app_auth_email", profile.email);
      sessionStorage.setItem("app_admin_email", profile.email);
      return true;
    }
    return false;
  };

  const handleSwitchToUser = (email: string) => {
    setAuthRole("user");
    setAuthEmail(email);
    sessionStorage.setItem("app_auth_role", "user");
    sessionStorage.setItem("app_auth_email", email);
  };

  const handleBackToAdmin = () => {
    if (!adminEmail) return;
    setAuthRole("admin");
    setAuthEmail(adminEmail);
    sessionStorage.setItem("app_auth_role", "admin");
    sessionStorage.setItem("app_auth_email", adminEmail);
  };

  const handleLogout = () => {
    logoutAdmin();
    setAuthRole(null);
    setAuthEmail("");
    setAdminEmail("");
    sessionStorage.removeItem("app_auth_role");
    sessionStorage.removeItem("app_auth_email");
    sessionStorage.removeItem("app_admin_email");
  };

  if (
    !authRole ||
    !authEmail ||
    (authRole === "admin" && !isAdminAuthenticated)
  ) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <MainApp
      darkMode={darkMode}
      onToggleDark={onToggleDark}
      profileEmail={authEmail}
      initialAdminMode={authRole === "admin"}
      onSwitchToUser={authRole === "admin" ? handleSwitchToUser : undefined}
      onBackToAdmin={
        authRole === "user" && adminEmail ? handleBackToAdmin : undefined
      }
      onLogout={handleLogout}
    />
  );
}

function AppWithAuth() {
  const [darkMode, toggleDark] = useDarkMode();
  return (
    <AdminAuthProvider>
      <AppContent darkMode={darkMode} onToggleDark={toggleDark} />
    </AdminAuthProvider>
  );
}

export default AppWithAuth;
