import { useCallback, useEffect, useMemo, useState } from "react";
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
import BatchDocumentDownload from "./components/BatchDocumentDownload";
import LoginPage from "./components/LoginPage";
import ProfileButton from "./components/ProfileButton";
import DocumentControl, {
  DocumentApprovalFilter,
} from "./components/DocumentControl";
import { AdminAuthProvider } from "./admin/AdminAuthContext";
import { useAdminAuth } from "./admin/useAdminAuth";
import AdminPanel from "./admin/AdminPanel";
import { AppUserRole, fetchAppUserProfile, verifyAppLogin } from "./lib/auth";
import { t } from "./lib/i18n";
import {
  fetchShipmentDocuments,
  fetchShipmentJobs,
  ShipmentDocument,
  ShipmentJob,
  ShipmentStatus,
  TradeMode,
  TransportMode,
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
  profileRole,
  profileCompanyName,
  switchedAccountName,
  initialAdminMode = false,
  onSwitchToUser,
  onBackToAdmin,
  onLogout,
}: {
  darkMode: boolean;
  onToggleDark: () => void;
  profileEmail: string;
  profileRole: AppUserRole;
  profileCompanyName: string | null;
  switchedAccountName: string;
  initialAdminMode?: boolean;
  onSwitchToUser?: (
    email: string,
    role?: AppUserRole,
    companyName?: string | null,
  ) => void;
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
  const [jobsTradeFilter, setJobsTradeFilter] = useState<TradeMode | "all">(
    "all",
  );
  const [jobsTransportFilter, setJobsTransportFilter] = useState<
    TransportMode | "all"
  >("all");
  const [documentsApprovalFilter, setDocumentsApprovalFilter] =
    useState<DocumentApprovalFilter>("all");
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const { isAdminAuthenticated } = useAdminAuth();
  const visibleJobs = useMemo(() => {
    if (profileRole !== "normal") {
      return jobs;
    }

    const normalizedCompanyName = profileCompanyName?.trim().toLowerCase();
    if (!normalizedCompanyName) {
      return [];
    }

    return jobs.filter(
      (job) => job.company_name?.trim().toLowerCase() === normalizedCompanyName,
    );
  }, [jobs, profileCompanyName, profileRole]);
  const visibleDocuments = useMemo(() => {
    if (profileRole !== "normal") {
      return documents;
    }

    const visibleJobIds = new Set(visibleJobs.map((job) => job.id));
    return documents.filter((document) =>
      visibleJobIds.has(document.shipment_job_id),
    );
  }, [documents, profileRole, visibleJobs]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const [shipmentJobs, shipmentDocuments] = await Promise.all([
        fetchShipmentJobs(profileEmail),
        fetchShipmentDocuments(profileEmail),
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
  }, [profileEmail]);

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
        profileRole={profileRole}
        switchedAccountName={switchedAccountName}
        onSwitchToUser={onSwitchToUser}
        onBackToAdmin={onBackToAdmin}
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
    setJobsTradeFilter("all");
    setJobsTransportFilter("all");
    setCurrentView("jobs");
  };

  const openJobsWithTrade = (tradeMode: TradeMode) => {
    setJobsStatusFilter("all");
    setJobsTradeFilter(tradeMode);
    setJobsTransportFilter("all");
    setCurrentView("jobs");
  };

  const openJobsWithTransport = (transportMode: TransportMode) => {
    setJobsStatusFilter("all");
    setJobsTradeFilter("all");
    setJobsTransportFilter(transportMode);
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
            jobs={visibleJobs}
            documents={visibleDocuments}
            loading={jobsLoading}
            error={jobsError}
            onOpenJobs={openJobsWithStatus}
            onOpenJobsByTrade={openJobsWithTrade}
            onOpenJobsByTransport={openJobsWithTransport}
            onOpenDocuments={openDocumentsWithFilter}
          />
        );
      case "jobs":
        return (
          <ShipmentJobs
            jobs={visibleJobs}
            documents={visibleDocuments}
            loading={jobsLoading}
            profileEmail={profileEmail}
            canManageShipments={
              profileRole !== "normal" && isAdminAuthenticated
            }
            onRefresh={loadJobs}
            statusFilter={jobsStatusFilter}
            tradeFilter={jobsTradeFilter}
            transportFilter={jobsTransportFilter}
            onStatusFilterChange={setJobsStatusFilter}
            onTradeFilterChange={setJobsTradeFilter}
            onTransportFilterChange={setJobsTransportFilter}
          />
        );
      case "documents":
        return profileRole === "normal" ? (
          <BatchDocumentDownload
            jobs={visibleJobs}
            documents={visibleDocuments}
            loading={jobsLoading}
            requesterEmail={profileEmail}
            onRefresh={loadJobs}
          />
        ) : (
          <DocumentControl
            jobs={visibleJobs}
            documents={visibleDocuments}
            loading={jobsLoading}
            onRefresh={loadJobs}
            isAdminAuthenticated={isAdminAuthenticated}
            requesterEmail={profileEmail}
            approvalFilter={documentsApprovalFilter}
          />
        );
      default:
        return (
          <ShipmentDashboard
            jobs={visibleJobs}
            documents={visibleDocuments}
            loading={jobsLoading}
            error={jobsError}
            onOpenJobs={openJobsWithStatus}
            onOpenJobsByTrade={openJobsWithTrade}
            onOpenJobsByTransport={openJobsWithTransport}
            onOpenDocuments={openDocumentsWithFilter}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="flex h-screen overflow-hidden">
        <aside
          className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} ${
            sidebarCollapsed ? "lg:hidden" : "lg:translate-x-0"
          } fixed inset-y-0 left-0 z-50 w-60 border-r border-gray-200 bg-white transition-transform duration-200 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:static`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="font-bold text-gray-900 dark:text-white">
                      CN Logistics
                    </h1>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white lg:hidden"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
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
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-gray-200 p-4 dark:border-gray-800" />
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <button
                onClick={handleSidebarToggle}
                className="rounded-xl bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label="メニューを切り替え"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="ml-auto flex items-center gap-3">
                {onBackToAdmin && (
                  <div className="hidden items-center gap-2 sm:flex">
                    <div className="max-w-80 truncate rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-bold text-cyan-800 ring-1 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-900">
                    {t("admin.switch.currentlySwitchedAs", {
                      name:
                        switchedAccountName.trim() ||
                        profileCompanyName?.trim() ||
                        profileEmail,
                    })}
                    </div>
                    <button
                      onClick={onBackToAdmin}
                      className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
                    >
                      {t("admin.switch.backToAdmin")}
                    </button>
                  </div>
                )}
                <div className="hidden text-sm font-medium text-gray-500 sm:block dark:text-gray-400">
                  {new Date().toLocaleDateString("ja-JP", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <button
                  onClick={onToggleDark}
                  className="relative rounded-xl bg-gray-100 p-2 transition hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                  title={darkMode ? t("app.theme.light") : t("app.theme.dark")}
                >
                  <span className="relative flex h-5 w-5 items-center justify-center">
                    <Sun
                      className={`absolute h-5 w-5 text-amber-500 transition-all duration-300 ${darkMode ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"}`}
                    />
                    <Moon
                      className={`absolute h-5 w-5 text-gray-600 transition-all duration-300 dark:text-gray-300 ${darkMode ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`}
                    />
                  </span>
                </button>
                <ProfileButton email={profileEmail} />
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <LogOut className="h-4 w-4" />
                  {t("common.logout")}
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6">
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
  const [profileRole, setProfileRole] = useState<AppUserRole>(() => {
    const savedRole = sessionStorage.getItem("app_profile_role");
    return savedRole === "normal" ||
      savedRole === "admin" ||
      savedRole === "super_admin"
      ? savedRole
      : "normal";
  });
  const [profileCompanyName, setProfileCompanyName] = useState(() => {
    return sessionStorage.getItem("app_profile_company_name") ?? "";
  });
  const [switchedAccountName, setSwitchedAccountName] = useState(() => {
    return sessionStorage.getItem("app_switched_account_name") ?? "";
  });
  const [adminEmail, setAdminEmail] = useState(() => {
    return sessionStorage.getItem("app_admin_email") ?? "";
  });
  const [adminProfileRole, setAdminProfileRole] = useState<AppUserRole>(() => {
    const savedRole = sessionStorage.getItem("app_admin_profile_role");
    return savedRole === "admin" || savedRole === "super_admin"
      ? savedRole
      : "admin";
  });
  const [returnAdminEmail, setReturnAdminEmail] = useState(() => {
    return sessionStorage.getItem("app_return_admin_email") ?? "";
  });
  const [returnAdminProfileRole, setReturnAdminProfileRole] =
    useState<AppUserRole>(() => {
      const savedRole = sessionStorage.getItem("app_return_admin_profile_role");
      return savedRole === "admin" || savedRole === "super_admin"
        ? savedRole
        : "admin";
    });
  const [returnAdminAccountName, setReturnAdminAccountName] = useState(() => {
    return sessionStorage.getItem("app_return_admin_account_name") ?? "";
  });

  useEffect(() => {
    if (!authEmail) return;

    let active = true;

    const refreshProfileRole = async () => {
      try {
        const profile = await fetchAppUserProfile(authEmail);
        if (!active || !profile) return;

        setProfileRole(profile.role);
        setProfileCompanyName(profile.company_name ?? "");
        sessionStorage.setItem("app_profile_role", profile.role);
        if (profile.company_name) {
          sessionStorage.setItem(
            "app_profile_company_name",
            profile.company_name,
          );
        } else {
          sessionStorage.removeItem("app_profile_company_name");
        }

        if (authRole === "admin" && authEmail === adminEmail) {
          setAdminProfileRole(profile.role);
          sessionStorage.setItem("app_admin_profile_role", profile.role);
        }
      } catch {
        // Keep the current session role if profile refresh is temporarily unavailable.
      }
    };

    void refreshProfileRole();

    return () => {
      active = false;
    };
  }, [adminEmail, authEmail, authRole]);

  const handleLogin = async (email: string, password: string) => {
    const profile = await verifyAppLogin(email, password);
    if (profile?.role === "normal") {
      setAuthRole("user");
      setAuthEmail(profile.email);
      setProfileRole(profile.role);
      setProfileCompanyName(profile.company_name ?? "");
      setSwitchedAccountName("");
      sessionStorage.setItem("app_auth_role", "user");
      sessionStorage.setItem("app_auth_email", profile.email);
      sessionStorage.setItem("app_profile_role", profile.role);
      if (profile.company_name) {
        sessionStorage.setItem(
          "app_profile_company_name",
          profile.company_name,
        );
      } else {
        sessionStorage.removeItem("app_profile_company_name");
      }
      sessionStorage.removeItem("app_switched_account_name");
      sessionStorage.removeItem("app_return_admin_email");
      sessionStorage.removeItem("app_return_admin_profile_role");
      sessionStorage.removeItem("app_return_admin_account_name");
      logoutAdmin();
      return true;
    }
    if (profile?.role === "admin" || profile?.role === "super_admin") {
      await loginAdmin(email, password);
      setAuthRole("admin");
      setAuthEmail(profile.email);
      setProfileRole(profile.role);
      setProfileCompanyName(profile.company_name ?? "");
      setSwitchedAccountName("");
      setAdminEmail(profile.email);
      setAdminProfileRole(profile.role);
      setReturnAdminEmail("");
      setReturnAdminProfileRole("admin");
      setReturnAdminAccountName("");
      sessionStorage.setItem("app_auth_role", "admin");
      sessionStorage.setItem("app_auth_email", profile.email);
      sessionStorage.setItem("app_profile_role", profile.role);
      if (profile.company_name) {
        sessionStorage.setItem(
          "app_profile_company_name",
          profile.company_name,
        );
      } else {
        sessionStorage.removeItem("app_profile_company_name");
      }
      sessionStorage.removeItem("app_switched_account_name");
      sessionStorage.removeItem("app_return_admin_email");
      sessionStorage.removeItem("app_return_admin_profile_role");
      sessionStorage.removeItem("app_return_admin_account_name");
      sessionStorage.setItem("app_admin_email", profile.email);
      sessionStorage.setItem("app_admin_profile_role", profile.role);
      return true;
    }
    return false;
  };

  const handleSwitchToUser = (
    email: string,
    role: AppUserRole = "normal",
    accountName: string | null = null,
  ) => {
    if (role === "normal" && authRole === "admin") {
      const adminAccountName = switchedAccountName || authEmail;
      setReturnAdminEmail(authEmail);
      setReturnAdminProfileRole(profileRole);
      setReturnAdminAccountName(adminAccountName);
      sessionStorage.setItem("app_return_admin_email", authEmail);
      sessionStorage.setItem("app_return_admin_profile_role", profileRole);
      sessionStorage.setItem("app_return_admin_account_name", adminAccountName);
    } else {
      setReturnAdminEmail("");
      setReturnAdminProfileRole("admin");
      setReturnAdminAccountName("");
      sessionStorage.removeItem("app_return_admin_email");
      sessionStorage.removeItem("app_return_admin_profile_role");
      sessionStorage.removeItem("app_return_admin_account_name");
    }

    setAuthRole(role === "normal" ? "user" : "admin");
    setAuthEmail(email);
    setProfileRole(role);
    setProfileCompanyName(role === "normal" ? (accountName ?? "") : "");
    setSwitchedAccountName(accountName ?? email);
    sessionStorage.setItem(
      "app_auth_role",
      role === "normal" ? "user" : "admin",
    );
    sessionStorage.setItem("app_auth_email", email);
    sessionStorage.setItem("app_profile_role", role);
    if (role === "normal" && accountName) {
      sessionStorage.setItem("app_profile_company_name", accountName);
    } else {
      sessionStorage.removeItem("app_profile_company_name");
    }
    sessionStorage.setItem("app_switched_account_name", accountName ?? email);
  };

  const handleBackToAdmin = () => {
    if (authRole === "user" && returnAdminEmail) {
      setAuthRole("admin");
      setAuthEmail(returnAdminEmail);
      setProfileRole(returnAdminProfileRole);
      setProfileCompanyName("");
      setSwitchedAccountName(returnAdminAccountName);
      setReturnAdminEmail("");
      setReturnAdminProfileRole("admin");
      setReturnAdminAccountName("");
      sessionStorage.setItem("app_auth_role", "admin");
      sessionStorage.setItem("app_auth_email", returnAdminEmail);
      sessionStorage.setItem("app_profile_role", returnAdminProfileRole);
      sessionStorage.removeItem("app_profile_company_name");
      if (returnAdminAccountName) {
        sessionStorage.setItem(
          "app_switched_account_name",
          returnAdminAccountName,
        );
      } else {
        sessionStorage.removeItem("app_switched_account_name");
      }
      sessionStorage.removeItem("app_return_admin_email");
      sessionStorage.removeItem("app_return_admin_profile_role");
      sessionStorage.removeItem("app_return_admin_account_name");
      return;
    }

    if (!adminEmail) return;
    setAuthRole("admin");
    setAuthEmail(adminEmail);
    setProfileRole(adminProfileRole);
    setProfileCompanyName("");
    setSwitchedAccountName("");
    setReturnAdminEmail("");
    setReturnAdminProfileRole("admin");
    setReturnAdminAccountName("");
    sessionStorage.setItem("app_auth_role", "admin");
    sessionStorage.setItem("app_auth_email", adminEmail);
    sessionStorage.setItem("app_profile_role", adminProfileRole);
    sessionStorage.removeItem("app_profile_company_name");
    sessionStorage.removeItem("app_switched_account_name");
    sessionStorage.removeItem("app_return_admin_email");
    sessionStorage.removeItem("app_return_admin_profile_role");
    sessionStorage.removeItem("app_return_admin_account_name");
  };

  const handleLogout = () => {
    logoutAdmin();
    setAuthRole(null);
    setAuthEmail("");
    setProfileRole("normal");
    setProfileCompanyName("");
    setSwitchedAccountName("");
    setAdminEmail("");
    setAdminProfileRole("admin");
    setReturnAdminEmail("");
    setReturnAdminProfileRole("admin");
    setReturnAdminAccountName("");
    sessionStorage.removeItem("app_auth_role");
    sessionStorage.removeItem("app_auth_email");
    sessionStorage.removeItem("app_profile_role");
    sessionStorage.removeItem("app_profile_company_name");
    sessionStorage.removeItem("app_switched_account_name");
    sessionStorage.removeItem("app_admin_email");
    sessionStorage.removeItem("app_admin_profile_role");
    sessionStorage.removeItem("app_return_admin_email");
    sessionStorage.removeItem("app_return_admin_profile_role");
    sessionStorage.removeItem("app_return_admin_account_name");
  };

  const isSwitchedFromAdmin =
    Boolean(adminEmail) && authEmail.toLowerCase() !== adminEmail.toLowerCase();

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
      profileRole={profileRole}
      profileCompanyName={profileCompanyName}
      switchedAccountName={switchedAccountName}
      initialAdminMode={authRole === "admin"}
      onSwitchToUser={authRole === "admin" ? handleSwitchToUser : undefined}
      onBackToAdmin={isSwitchedFromAdmin ? handleBackToAdmin : undefined}
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
