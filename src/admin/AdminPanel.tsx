import { useEffect, useMemo, useState } from "react";
import {
  FilePlus2,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Star,
  Sun,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import { useAdminAuth } from "./useAdminAuth";
import ShipmentEntryForm, { ShipmentEntryCriteria } from "./ShipmentEntryForm";
import UserRegistrationForm from "./UserRegistrationForm";
import AdminOperatorManagement from "./AdminOperatorManagement";
import FeedbackReviewPanel from "./FeedbackReviewPanel";
import StandardFlowManagement from "./StandardFlowManagement";
import ProfileButton from "../components/ProfileButton";
import DynamicTutorial from "../components/DynamicTutorial";
import LanguageSelect from "../components/LanguageSelect";
import InstantTooltip from "../components/InstantTooltip";
import LogoMark from "../components/LogoMark";
import { AdminOperator, fetchAdminOperators } from "../lib/adminOperators";
import { ShipperUser, fetchShipperUsersByAdmin } from "../lib/shipperUsers";
import { AppUserRole } from "../lib/auth";
import { t } from "../lib/i18n";
import { ShipmentDocument, ShipmentJob } from "../lib/shipmentJobs";

type AdminView =
  | "shipmentEntry"
  | "userRegistration"
  | "adminOperators"
  | "standardFlow"
  | "feedbackReview";

interface AdminPanelProps {
  darkMode: boolean;
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  onToggleDark: () => void;
  profileEmail: string;
  profileRole: AppUserRole;
  switchedAccountName?: string;
  onSwitchToUser?: (
    email: string,
    role?: AppUserRole,
    shipperName?: string | null,
  ) => void;
  onBackToAdmin?: () => void;
  onLogout?: () => void;
  onRefreshJobs: () => Promise<void>;
}

export default function AdminPanel({
  darkMode,
  jobs,
  documents,
  onToggleDark,
  profileEmail,
  profileRole,
  switchedAccountName,
  onSwitchToUser,
  onBackToAdmin,
  onLogout,
  onRefreshJobs,
}: AdminPanelProps) {
  const { logout } = useAdminAuth();
  const [view, setView] = useState<AdminView>("shipmentEntry");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switchableUsers, setSwitchableUsers] = useState<ShipperUser[]>([]);
  const [switchableOperators, setSwitchableOperators] = useState<
    AdminOperator[]
  >([]);
  const [shipmentEntryCriteria, setShipmentEntryCriteria] =
    useState<ShipmentEntryCriteria>({ kind: "all" });
  const isSuperAdmin = profileRole === "super_admin";
  const shipmentShipperOptions = useMemo(
    () =>
      [...switchableUsers]
        .sort((first, second) =>
          first.shipper_name.localeCompare(second.shipper_name, "ja-JP"),
        )
        .map((user) => ({
          shipper_name: user.shipper_name,
          admin_assignments: user.admin_assignments,
        })),
    [switchableUsers],
  );
  useEffect(() => {
    setView("shipmentEntry");
    setShipmentEntryCriteria({ kind: "all" });
  }, [profileEmail, profileRole]);

  useEffect(() => {
    let active = true;
    async function loadSwitchableUsers() {
      try {
        const users = await fetchShipperUsersByAdmin(profileEmail);
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
    if (!isSuperAdmin) {
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
  }, [isSuperAdmin, profileEmail]);

  const navItems = [
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
            id: "standardFlow" as AdminView,
            label: t("superAdmin.nav.standardFlow"),
            icon: ListChecks,
          },
          {
            id: "feedbackReview" as AdminView,
            label: t("superAdmin.nav.feedback"),
            icon: Star,
          },
        ]
      : []),
  ];

  const handleSidebarToggle = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed((collapsed) => !collapsed);
    } else {
      setSidebarOpen(true);
    }
  };

  const handleTutorialStepChange = (_stepIndex: number, stepId: string) => {
    switch (stepId) {
      case "admin-shipments":
        setView("shipmentEntry");
        setShipmentEntryCriteria({ kind: "all" });
        setSidebarOpen(false);
        return;
      case "admin-shippers":
        setView("userRegistration");
        setSidebarOpen(false);
        return;
      case "admin-operators":
        if (isSuperAdmin) {
          setView("adminOperators");
          setSidebarOpen(false);
        }
        return;
      case "admin-standard-flow":
        if (isSuperAdmin) {
          setView("standardFlow");
          setSidebarOpen(false);
        }
        return;
      case "admin-documents":
        setView("shipmentEntry");
        setShipmentEntryCriteria({
          kind: "documentApproval",
          approvalStatus: "pending",
        });
        setSidebarOpen(false);
        return;
      case "admin-feedback":
        if (isSuperAdmin) {
          setView("feedbackReview");
          setSidebarOpen(false);
        }
        return;
      default:
        return;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <InstantTooltip label={t("app.menu.toggle")} align="left">
              {(tooltipId) => (
                <button
                  type="button"
                  onClick={handleSidebarToggle}
                  className="p-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                  aria-label={t("app.menu.toggle")}
                  aria-describedby={tooltipId}
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
            </InstantTooltip>
            <LogoMark className="h-9 w-9 rounded-xl" />
            <div className="min-w-0">
              <span
                className="block truncate font-bold text-gray-900 dark:text-white sm:inline"
                title="CN Navigator"
              >
                CN Navigator
              </span>
              <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:ml-2 sm:mt-0">
                {isSuperAdmin ? t("common.superAdmin") : t("common.admin")}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
            {onSwitchToUser && (
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    const [role, email, shipperName] =
                      event.target.value.split(":");
                    onSwitchToUser(
                      decodeURIComponent(email),
                      role as AppUserRole,
                      shipperName ? decodeURIComponent(shipperName) : null,
                    );
                  }
                }}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto sm:max-w-56 sm:flex-none"
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
                          value={`admin:${encodeURIComponent(
                            operator.email,
                          )}:${encodeURIComponent(
                            operator.user_name || operator.email,
                          )}`}
                        >
                          {operator.user_name || operator.email}
                        </option>
                      ))}
                  </optgroup>
                )}
                {switchableUsers.length > 0 && (
                  <optgroup label={t("superAdmin.switch.normalUsers")}>
                    {switchableUsers.map((user) => (
                      <option
                        key={user.id}
                        value={`normal:${encodeURIComponent(
                          user.email,
                        )}:${encodeURIComponent(user.shipper_name)}`}
                      >
                        {user.shipper_name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            {onBackToAdmin && (
              <div className="hidden items-center gap-2 sm:flex">
                <div
                  className="max-w-80 truncate rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-bold text-cyan-800 ring-1 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-900"
                  title={t("admin.switch.currentlySwitchedAs", {
                    name: switchedAccountName?.trim() || profileEmail,
                  })}
                >
                  {t("admin.switch.currentlySwitchedAs", {
                    name: switchedAccountName?.trim() || profileEmail,
                  })}
                </div>
                <button
                  type="button"
                  onClick={onBackToAdmin}
                  className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
                >
                  {t("superAdmin.switch.backToSuperAdmin")}
                </button>
              </div>
            )}
            <InstantTooltip
              label={darkMode ? t("app.theme.light") : t("app.theme.dark")}
            >
              {(tooltipId) => (
                <button
                  onClick={onToggleDark}
                  className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
                  aria-label={
                    darkMode ? t("app.theme.light") : t("app.theme.dark")
                  }
                  aria-describedby={tooltipId}
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
              )}
            </InstantTooltip>
            <ProfileButton email={profileEmail} />
            <DynamicTutorial
              variant="admin"
              adminTheme
              profileRole={profileRole}
              onStepChange={handleTutorialStepChange}
            />
            <InstantTooltip label={t("common.logout")}>
              {(tooltipId) => (
                <button
                  type="button"
                  onClick={onLogout ?? logout}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto sm:gap-2 sm:px-4"
                  aria-label={t("common.logout")}
                  aria-describedby={tooltipId}
                >
                  <LogOut className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span className="hidden whitespace-nowrap text-sm font-medium sm:inline">
                    {t("common.logout")}
                  </span>
                </button>
              )}
            </InstantTooltip>
            <LanguageSelect />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {!sidebarCollapsed && (
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-gray-200 bg-white p-4 transition-transform duration-200 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:static lg:translate-x-0 ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <nav className="space-y-1" data-tutorial-target="admin-nav">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = view === item.id;
                return (
                  <button
                    key={item.id}
                    data-tutorial-target={
                      item.id === "feedbackReview"
                        ? "admin-feedback-nav"
                        : undefined
                    }
                    onClick={() => {
                      if (item.id === "shipmentEntry") {
                        setShipmentEntryCriteria({ kind: "all" });
                      }
                      setView(item.id);
                      setSidebarOpen(false);
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
          </aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {view === "shipmentEntry" && (
            <ShipmentEntryForm
              jobs={jobs}
              documents={documents}
              adminEmail={profileEmail}
              canEditAssignedAdmins={isSuperAdmin}
              shipperOptions={shipmentShipperOptions}
              shipperUsers={switchableUsers}
              isSuperAdmin={isSuperAdmin}
              adminOperators={switchableOperators}
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
          {view === "standardFlow" && isSuperAdmin && (
            <StandardFlowManagement />
          )}
          {view === "feedbackReview" && isSuperAdmin && (
            <FeedbackReviewPanel
              superAdminEmail={profileEmail}
              jobs={jobs}
              documents={documents}
            />
          )}
        </main>
      </div>
    </div>
  );
}
