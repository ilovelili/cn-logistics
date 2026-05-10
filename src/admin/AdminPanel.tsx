import { useEffect, useMemo, useState } from "react";
import {
  FilePlus2,
  LogOut,
  Menu,
  Moon,
  ShipWheel,
  Star,
  Sun,
  LayoutDashboard,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import { useAdminAuth } from "./useAdminAuth";
import AdminDashboard from "./AdminDashboard";
import ShipmentEntryForm, { ShipmentEntryCriteria } from "./ShipmentEntryForm";
import UserRegistrationForm from "./UserRegistrationForm";
import AdminOperatorManagement from "./AdminOperatorManagement";
import FeedbackReviewPanel from "./FeedbackReviewPanel";
import ProfileButton from "../components/ProfileButton";
import { AdminOperator, fetchAdminOperators } from "../lib/adminOperators";
import { CompanyUser, fetchCompanyUsersByAdmin } from "../lib/companyUsers";
import { AppUserRole } from "../lib/auth";
import { t } from "../lib/i18n";
import { ShipmentDocument, ShipmentJob } from "../lib/shipmentJobs";

type AdminView =
  | "dashboard"
  | "shipmentEntry"
  | "userRegistration"
  | "adminOperators"
  | "feedbackReview";

interface AdminPanelProps {
  darkMode: boolean;
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  jobsLoading: boolean;
  onToggleDark: () => void;
  profileEmail: string;
  profileRole: AppUserRole;
  onSwitchToUser?: (email: string, role?: AppUserRole) => void;
  onBackToAdmin?: () => void;
  onLogout?: () => void;
  onRefreshJobs: () => Promise<void>;
}

export default function AdminPanel({
  darkMode,
  jobs,
  documents,
  jobsLoading,
  onToggleDark,
  profileEmail,
  profileRole,
  onSwitchToUser,
  onBackToAdmin,
  onLogout,
  onRefreshJobs,
}: AdminPanelProps) {
  const { logout } = useAdminAuth();
  const [view, setView] = useState<AdminView>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [switchableUsers, setSwitchableUsers] = useState<CompanyUser[]>([]);
  const [switchableOperators, setSwitchableOperators] = useState<
    AdminOperator[]
  >([]);
  const [shipmentEntryCriteria, setShipmentEntryCriteria] =
    useState<ShipmentEntryCriteria>({ kind: "all" });
  const isSuperAdmin = profileRole === "super_admin";
  const shipmentCompanyOptions = useMemo(
    () =>
      [...switchableUsers]
        .sort((first, second) =>
          first.company_name.localeCompare(second.company_name, "ja-JP"),
        )
        .map((user) => ({
          company_name: user.company_name,
          admin_assignments: user.admin_assignments,
        })),
    [switchableUsers],
  );

  useEffect(() => {
    setView("dashboard");
    setShipmentEntryCriteria({ kind: "all" });
  }, [profileEmail, profileRole]);

  useEffect(() => {
    let active = true;
    async function loadSwitchableUsers() {
      try {
        const users = await fetchCompanyUsersByAdmin(profileEmail);
        if (active) {
          setSwitchableUsers(users);
        }
      } catch {
        if (active) {
          setSwitchableUsers([]);
        }
      }
    }

    void loadSwitchableUsers();

    return () => {
      active = false;
    };
  }, [profileEmail]);

  useEffect(() => {
    if (!onSwitchToUser || !isSuperAdmin) {
      setSwitchableOperators([]);
      return;
    }

    let active = true;
    async function loadSwitchableOperators() {
      try {
        const operators = await fetchAdminOperators(profileEmail);
        if (active) {
          setSwitchableOperators(operators);
        }
      } catch {
        if (active) {
          setSwitchableOperators([]);
        }
      }
    }

    void loadSwitchableOperators();

    return () => {
      active = false;
    };
  }, [isSuperAdmin, onSwitchToUser, profileEmail]);

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
    {
      id: "userRegistration" as AdminView,
      label: t("admin.nav.userRegistration"),
      icon: UserPlus,
    },
    ...(isSuperAdmin
      ? [
          {
            id: "adminOperators" as AdminView,
            label: t("superAdmin.nav.adminOperators"),
            icon: ShieldCheck,
          },
          {
            id: "feedbackReview" as AdminView,
            label: t("superAdmin.nav.feedback"),
            icon: Star,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              className="p-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              aria-label="メニューを切り替え"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <span className="font-bold text-gray-900 dark:text-white">
                CN Logistics
              </span>
              <span className="ml-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                {isSuperAdmin ? t("common.superAdmin") : t("common.admin")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onSwitchToUser && (
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    const [role, email] = event.target.value.split(":");
                    onSwitchToUser(email, role as AppUserRole);
                  }
                }}
                className="max-w-56 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <option value="">
                  {isSuperAdmin
                    ? t("superAdmin.switch.selectAccount")
                    : t("admin.switch.selectUser")}
                </option>
                {isSuperAdmin && switchableOperators.length > 0 && (
                  <optgroup label={t("superAdmin.switch.adminOperators")}>
                    {switchableOperators
                      .filter((operator) => operator.email !== profileEmail)
                      .map((operator) => (
                        <option
                          key={operator.id}
                          value={`admin:${operator.email}`}
                        >
                          {operator.user_name || operator.email}
                        </option>
                      ))}
                  </optgroup>
                )}
                {switchableUsers.length > 0 && (
                  <optgroup label={t("superAdmin.switch.normalUsers")}>
                    {switchableUsers.map((user) => (
                      <option key={user.id} value={`normal:${user.email}`}>
                        {user.company_name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
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
            <ProfileButton email={profileEmail} />
            <button
              onClick={onLogout ?? logout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t("common.logout")}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {!sidebarCollapsed && (
          <aside className="w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 flex flex-col">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = view === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === "shipmentEntry") {
                        setShipmentEntryCriteria({ kind: "all" });
                      }
                      setView(item.id);
                    }}
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
            {onBackToAdmin && (
              <div className="mt-auto border-t border-gray-200 pt-4 dark:border-gray-800">
                <button
                  type="button"
                  onClick={onBackToAdmin}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <ShipWheel className="h-4 w-4" />
                  {t("superAdmin.switch.backToSuperAdmin")}
                </button>
              </div>
            )}
          </aside>
        )}

        <main className="flex-1 p-6 overflow-y-auto">
          {view === "dashboard" && (
            <AdminDashboard
              jobs={jobs}
              documents={documents}
              loading={jobsLoading}
              onOpenShipmentEntry={(criteria) => {
                setShipmentEntryCriteria(criteria);
                setView("shipmentEntry");
              }}
            />
          )}
          {view === "shipmentEntry" && (
            <ShipmentEntryForm
              jobs={jobs}
              documents={documents}
              companyOptions={shipmentCompanyOptions}
              criteria={shipmentEntryCriteria}
              onRefresh={onRefreshJobs}
            />
          )}
          {view === "userRegistration" && (
            <UserRegistrationForm
              adminEmail={profileEmail}
              isSuperAdmin={isSuperAdmin}
            />
          )}
          {view === "adminOperators" && isSuperAdmin && (
            <AdminOperatorManagement superAdminEmail={profileEmail} />
          )}
          {view === "feedbackReview" && isSuperAdmin && (
            <FeedbackReviewPanel superAdminEmail={profileEmail} />
          )}
        </main>
      </div>
    </div>
  );
}
