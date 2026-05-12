import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Plus, Save, Search, X, XCircle } from "lucide-react";
import {
  AdminOperator,
  AdminOperatorStaffRole,
  fetchAdminOperators,
} from "../lib/adminOperators";
import {
  createCompanyUser,
  defaultCompanyUserForm,
  CompanyUserForm,
  CompanyUser,
  CompanyUserApprovalStatus,
  deleteCompanyUser,
  fetchCompanyUsersByAdmin,
  updateCompanyUserApprovalStatus,
  updateCompanyUserAdminAssignments,
  updatePendingCompanyUser,
} from "../lib/companyUsers";
import { t } from "../lib/i18n";
import { lookupJapaneseAddress } from "../lib/zipcode";
import SortableTableHeader from "../components/SortableTableHeader";
import TableActionButton from "../components/TableActionButton";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import { useTableColumnSettings } from "../components/useTableColumnSettings";
import CompanyUserReadOnlyDetails from "./CompanyUserReadOnlyDetails";

function getStaffRoleLabel(role: AdminOperatorStaffRole) {
  return t(`superAdmin.operators.staffRole.${role}`);
}

interface UserRegistrationFormProps {
  adminEmail: string;
  isSuperAdmin?: boolean;
}

type SortKey =
  | "id"
  | "company_name"
  | "email"
  | "budget"
  | "approval_status"
  | "created_at";
type SortDirection = "asc" | "desc";
type UserColumnId = SortKey | "admins" | "action";
export type UserAction = "approve" | "reject" | "delete";

interface UserTableColumn {
  id: UserColumnId;
  label: string;
  width: number;
  sortKey?: SortKey;
  render: (user: CompanyUser) => React.ReactNode;
}

export default function UserRegistrationForm({
  adminEmail,
  isSuperAdmin = false,
}: UserRegistrationFormProps) {
  const [form, setForm] = useState<CompanyUserForm>(defaultCompanyUserForm);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [adminOperators, setAdminOperators] = useState<AdminOperator[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    CompanyUserApprovalStatus | "all"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    user: CompanyUser;
    action: UserAction;
  } | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const updateField = (field: keyof CompanyUserForm, value: string) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const registeredUsers = await fetchCompanyUsersByAdmin(adminEmail);
      setUsers(registeredUsers);
    } catch {
      showToast("error", t("admin.userRegistration.loadFailed"));
    } finally {
      setUsersLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setAdminOperators([]);
      return;
    }

    let active = true;
    async function loadAdminOperators() {
      try {
        const operators = await fetchAdminOperators(adminEmail);
        if (active) {
          setAdminOperators(operators);
        }
      } catch {
        if (active) {
          setAdminOperators([]);
        }
      }
    }

    void loadAdminOperators();

    return () => {
      active = false;
    };
  }, [adminEmail, isSuperAdmin]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      await createCompanyUser(form, adminEmail);
      setForm(defaultCompanyUserForm);
      setShowCreateForm(false);
      await loadUsers();
      showToast("success", t("admin.userRegistration.created"));
    } catch {
      showToast("error", t("admin.userRegistration.createFailed"));
    } finally {
      setLoading(false);
    }
  };

  const fillAddressFromZipcode = async () => {
    setAddressLoading(true);

    try {
      const address = await lookupJapaneseAddress(form.zipcode);
      if (address) {
        updateField("company_address", address);
      } else {
        showToast("error", t("admin.userRegistration.zipcodeLookupFailed"));
      }
    } catch {
      showToast("error", t("admin.userRegistration.zipcodeLookupFailed"));
    } finally {
      setAddressLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      if (statusFilter !== "all" && user.approval_status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) return true;

      return [
        user.id,
        user.company_name,
        user.email,
        user.zipcode,
        user.company_address,
        user.telephone,
        user.contact_person,
        ...(user.admin_assignments ?? []).flatMap((assignment) => [
          assignment.email,
          assignment.user_name,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, statusFilter, users]);

  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (sortKey === "budget") {
        return (Number(aValue) - Number(bValue)) * direction;
      }
      if (sortKey === "created_at") {
        return (
          (new Date(aValue).getTime() - new Date(bValue).getTime()) * direction
        );
      }

      return String(aValue).localeCompare(String(bValue), "ja") * direction;
    });
  }, [filteredUsers, sortDirection, sortKey]);

  const changeSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "created_at" ? "desc" : "asc");
  };

  const handleApprovalChange = async (
    user: CompanyUser,
    status: "approved" | "rejected",
  ) => {
    setActionLoadingId(user.id);
    try {
      const updatedUser = await updateCompanyUserApprovalStatus({
        superAdminEmail: adminEmail,
        userId: user.id,
        status,
      });
      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === updatedUser.id ? updatedUser : currentUser,
        ),
      );
      setSelectedUser((currentUser) =>
        currentUser?.id === updatedUser.id ? updatedUser : currentUser,
      );
      showToast(
        "success",
        status === "approved"
          ? t("admin.userRegistration.approved")
          : t("admin.userRegistration.rejected"),
      );
    } catch {
      showToast("error", t("admin.userRegistration.approvalFailed"));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteUser = async (user: CompanyUser) => {
    setActionLoadingId(user.id);
    try {
      await deleteCompanyUser({
        superAdminEmail: adminEmail,
        userId: user.id,
      });
      setUsers((currentUsers) =>
        currentUsers.filter((currentUser) => currentUser.id !== user.id),
      );
      setSelectedUser((currentUser) =>
        currentUser?.id === user.id ? null : currentUser,
      );
      showToast("success", t("admin.userRegistration.deleted"));
    } catch {
      showToast("error", t("admin.userRegistration.deleteFailed"));
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;

    const { user, action } = pendingAction;
    setPendingAction(null);

    if (action === "approve") {
      await handleApprovalChange(user, "approved");
      return;
    }
    if (action === "reject") {
      await handleApprovalChange(user, "rejected");
      return;
    }

    await handleDeleteUser(user);
  };

  const columns = useMemo<UserTableColumn[]>(() => {
    const userColumns: UserTableColumn[] = [
      {
        id: "id",
        label: "ID",
        width: isSuperAdmin ? 7 : 12,
        sortKey: "id",
        render: (user) => (
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
            {user.id.slice(0, 8)}
          </span>
        ),
      },
      {
        id: "company_name",
        label: t("admin.userRegistration.companyName"),
        width: isSuperAdmin ? 16 : 24,
        sortKey: "company_name",
        render: (user) => (
          <span
            className="block truncate font-semibold text-gray-900 dark:text-white"
            title={user.company_name}
          >
            {user.company_name}
          </span>
        ),
      },
      {
        id: "email",
        label: t("admin.userRegistration.email"),
        width: isSuperAdmin ? 18 : 32,
        sortKey: "email",
        render: (user) => (
          <span
            className="block truncate text-gray-600 dark:text-gray-300"
            title={user.email}
          >
            {user.email}
          </span>
        ),
      },
      {
        id: "budget",
        label: t("admin.userRegistration.budget"),
        width: isSuperAdmin ? 10 : 12,
        sortKey: "budget",
        render: (user) => (
          <span className="whitespace-nowrap text-gray-600 dark:text-gray-300">
            {Number(user.budget).toLocaleString()}{" "}
            {t("admin.userRegistration.budgetUnit")}
          </span>
        ),
      },
      {
        id: "approval_status",
        label: t("admin.userRegistration.status"),
        width: isSuperAdmin ? 9 : 11,
        sortKey: "approval_status",
        render: (user) => <StatusBadge status={user.approval_status} />,
      },
      {
        id: "created_at",
        label: t("admin.userRegistration.createdAt"),
        width: 9,
        sortKey: "created_at",
        render: (user) => (
          <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">
            {new Date(user.created_at).toLocaleDateString("ja-JP")}
          </span>
        ),
      },
      ...(isSuperAdmin
        ? [
            {
              id: "admins" as const,
              label: t("admin.userRegistration.assignedAdmins"),
              width: 14,
              render: (user: CompanyUser) => (
                <AssignedAdminsSummary
                  assignments={user.admin_assignments ?? []}
                />
              ),
            },
          ]
        : []),
      {
        id: "action" as const,
        label: t("admin.userRegistration.action"),
        width: isSuperAdmin ? 23 : 8,
        render: (user: CompanyUser) => (
          <div className="flex flex-nowrap gap-1.5">
            <TableActionButton
              variant="primary"
              onClick={() => setSelectedUser(user)}
            >
              {t("common.edit")}
            </TableActionButton>
            {isSuperAdmin && (
              <ApprovalButtons
                disabled={
                  actionLoadingId === user.id ||
                  user.approval_status !== "to_be_approved"
                }
                deleteDisabled={actionLoadingId === user.id}
                onApprove={() => {
                  setPendingAction({ user, action: "approve" });
                }}
                onReject={() => {
                  setPendingAction({ user, action: "reject" });
                }}
                onDelete={() => {
                  setPendingAction({ user, action: "delete" });
                }}
              />
            )}
          </div>
        ),
      },
    ];

    return userColumns;
  }, [actionLoadingId, isSuperAdmin]);

  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    "admin_user_registration_table_columns_v4",
    columns.map((column) => ({ id: column.id, label: column.label })),
  );
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const visibleTableColumns = visibleColumns
    .map((column) => columnsById.get(column.id))
    .filter((column): column is UserTableColumn => Boolean(column));
  const orderedColumnConfigs = orderedColumns.map((column) => ({
    id: column.id,
    label: column.label,
  }));
  const visibleColumnWeight = visibleTableColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t("admin.userRegistration.title")}
          </h2>
          <button
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
          >
            <Plus className="h-4 w-4" />
            {showCreateForm
              ? t("common.cancel")
              : t("admin.userRegistration.newUser")}
          </button>
        </div>
      </div>

      {!showCreateForm && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t("admin.userRegistration.dashboard")}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t("admin.userRegistration.count", {
                  count: filteredUsers.length,
                })}
              </span>
              <TableColumnSettingsButton
                columns={orderedColumnConfigs}
                visibleColumnIds={visibleColumnIds}
                onVisibilityChange={setColumnVisibility}
                onMoveColumn={moveColumn}
                onReset={resetColumns}
                adminTheme
              />
            </div>
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("admin.userRegistration.searchPlaceholder")}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as CompanyUserApprovalStatus | "all",
                )
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">
                {t("admin.userRegistration.status.all")}
              </option>
              <option value="to_be_approved">
                {t("admin.userRegistration.status.toBeApproved")}
              </option>
              <option value="approved">
                {t("admin.userRegistration.status.approved")}
              </option>
              <option value="rejected">
                {t("admin.userRegistration.status.rejected")}
              </option>
            </select>
          </div>

          {usersLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
                />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {t("admin.userRegistration.noUsers")}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {t("admin.userRegistration.noMatches")}
            </div>
          ) : (
            <div className="overflow-hidden">
              <table
                className="w-full table-fixed text-left text-sm"
                style={{ minWidth: "320px" }}
              >
                <colgroup>
                  {visibleTableColumns.map((column) => (
                    <col
                      key={column.id}
                      style={{
                        width: `${(column.width / visibleColumnWeight) * 100}%`,
                      }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    {visibleTableColumns.map((column) =>
                      column.sortKey ? (
                        <SortableTableHeader
                          key={column.id}
                          label={column.label}
                          sortKey={column.sortKey}
                          activeSortKey={sortKey}
                          direction={sortDirection}
                          onSort={changeSort}
                          className="py-3 pr-4 font-bold"
                          buttonClassName="inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-gray-900 dark:hover:text-white"
                          activeClassName="text-gray-900 dark:text-white"
                          inactiveClassName="text-gray-500 dark:text-gray-400"
                        />
                      ) : (
                        <th
                          key={column.id}
                          className="py-3 pr-4 text-left font-bold"
                        >
                          {column.label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                    >
                      {visibleTableColumns.map((column) => (
                        <td
                          key={column.id}
                          className="overflow-hidden py-4 pr-4"
                        >
                          {column.render(user)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onSaved={(updatedUser) => {
            setUsers((currentUsers) =>
              currentUsers.map((user) =>
                user.id === updatedUser.id ? updatedUser : user,
              ),
            );
            setSelectedUser(updatedUser);
          }}
          isSuperAdmin={isSuperAdmin}
          actionLoading={actionLoadingId === selectedUser.id}
          adminOperators={adminOperators}
          superAdminEmail={adminEmail}
          onRequestAction={(action) =>
            setPendingAction({ user: selectedUser, action })
          }
          onAssignmentsSaved={(updatedUser) => {
            setUsers((currentUsers) =>
              currentUsers.map((user) =>
                user.id === updatedUser.id ? updatedUser : user,
              ),
            );
            setSelectedUser(updatedUser);
          }}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {pendingAction && (
        <ConfirmActionModal
          user={pendingAction.user}
          action={pendingAction.action}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmPendingAction()}
        />
      )}

      {showCreateForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <Field
              label={t("admin.userRegistration.email")}
              type="email"
              value={form.email}
              onChange={(value) => updateField("email", value)}
              required
            />
            <Field
              label={t("admin.userRegistration.companyName")}
              value={form.company_name}
              onChange={(value) => updateField("company_name", value)}
              required
            />
            <Field
              label={t("admin.userRegistration.zipcode")}
              value={form.zipcode}
              onChange={(value) => updateField("zipcode", value)}
              onBlur={() => {
                if (form.zipcode.replace(/[^\d]/g, "").length === 7) {
                  void fillAddressFromZipcode();
                }
              }}
              required
              action={
                <button
                  type="button"
                  onClick={fillAddressFromZipcode}
                  disabled={addressLoading}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  {addressLoading
                    ? t("admin.userRegistration.addressSearching")
                    : t("admin.userRegistration.addressSearch")}
                </button>
              }
            />
            <Field
              label={t("admin.userRegistration.telephone")}
              type="tel"
              value={form.telephone}
              onChange={(value) => updateField("telephone", value)}
              required
            />
            <Field
              label={t("admin.userRegistration.budget")}
              type="number"
              min="100"
              step="0.5"
              value={form.budget}
              onChange={(value) => updateField("budget", value)}
              required
              suffix={t("admin.userRegistration.budgetUnit")}
            />
            <Field
              label={t("admin.userRegistration.contactPerson")}
              value={form.contact_person}
              onChange={(value) => updateField("contact_person", value)}
              required
            />
          </div>

          <div className="mt-5 grid gap-5">
            <TextArea
              label={t("admin.userRegistration.companyAddress")}
              value={form.company_address}
              onChange={(value) => updateField("company_address", value)}
              required
            />
            <TextArea
              label={t("admin.userRegistration.notes")}
              value={form.notes}
              onChange={(value) => updateField("notes", value)}
            />
          </div>

          <div className="mt-6 flex justify-end gap-4 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
            >
              <Save className="h-4 w-4" />
              {loading ? t("common.saving") : t("common.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function UserDetailModal({
  user,
  onSaved,
  isSuperAdmin,
  actionLoading,
  adminOperators,
  superAdminEmail,
  detailsReadOnly = false,
  showActions = true,
  onRequestAction,
  onAssignmentsSaved,
  onClose,
}: {
  user: CompanyUser;
  onSaved: (user: CompanyUser) => void;
  isSuperAdmin: boolean;
  actionLoading: boolean;
  adminOperators: AdminOperator[];
  superAdminEmail: string;
  detailsReadOnly?: boolean;
  showActions?: boolean;
  onRequestAction: (action: UserAction) => void;
  onAssignmentsSaved: (user: CompanyUser) => void;
  onClose: () => void;
}) {
  const isEditable =
    user.approval_status === "to_be_approved" && !detailsReadOnly;
  const [form, setForm] = useState<CompanyUserForm>({
    email: user.email,
    company_name: user.company_name,
    zipcode: user.zipcode ?? "",
    company_address: user.company_address,
    telephone: user.telephone,
    budget: String(user.budget),
    contact_person: user.contact_person ?? "",
    notes: user.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [assignmentsSaving, setAssignmentsSaving] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [error, setError] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>(() =>
    (user.admin_assignments ?? []).map(
      (assignment) => assignment.admin_user_id,
    ),
  );

  useEffect(() => {
    setSelectedAdminIds(
      (user.admin_assignments ?? []).map(
        (assignment) => assignment.admin_user_id,
      ),
    );
  }, [user.admin_assignments, user.id]);

  const updateField = (field: keyof CompanyUserForm, value: string) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const fillAddressFromZipcode = async () => {
    setAddressLoading(true);
    setError("");

    try {
      const address = await lookupJapaneseAddress(form.zipcode);
      if (address) {
        updateField("company_address", address);
      } else {
        setError(t("admin.userRegistration.zipcodeLookupFailed"));
      }
    } catch {
      setError(t("admin.userRegistration.zipcodeLookupFailed"));
    } finally {
      setAddressLoading(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isEditable) return;

    setSaving(true);
    setError("");

    try {
      const updatedUser = await updatePendingCompanyUser(user.id, form);
      onSaved(updatedUser);
    } catch {
      setError(t("admin.userRegistration.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleAdminAssignment = (adminUserId: string) => {
    setSelectedAdminIds((currentIds) =>
      currentIds.includes(adminUserId)
        ? currentIds.filter((currentId) => currentId !== adminUserId)
        : [...currentIds, adminUserId],
    );
  };

  const handleSaveAssignments = async () => {
    setAssignmentsSaving(true);
    setAssignmentError("");

    try {
      const updatedUser = await updateCompanyUserAdminAssignments({
        superAdminEmail,
        userId: user.id,
        adminUserIds: selectedAdminIds,
      });
      onAssignmentsSaved(updatedUser);
    } catch {
      setAssignmentError(t("admin.userRegistration.assignmentUpdateFailed"));
    } finally {
      setAssignmentsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <form
        onSubmit={handleSave}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {user.company_name}
            </h3>
            <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
              {user.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6">
          <StatusBadge status={user.approval_status} />
        </div>

        {isSuperAdmin && (
          <section className="mb-6 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white">
                  {t("admin.userRegistration.assignedAdmins")}
                </h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.userRegistration.assignedAdminsDescription")}
                </p>
              </div>
              <button
                type="button"
                disabled={assignmentsSaving}
                onClick={() => void handleSaveAssignments()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
              >
                <Save className="h-4 w-4" />
                {assignmentsSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>

            {adminOperators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t("superAdmin.operators.noOperators")}
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {adminOperators.map((operator) => (
                  <label
                    key={operator.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAdminIds.includes(operator.id)}
                      onChange={() => toggleAdminAssignment(operator.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-gray-900 dark:text-white">
                          {operator.user_name || operator.email}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {getStaffRoleLabel(operator.staff_role)}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {operator.email}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {assignmentError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {assignmentError}
              </div>
            )}
          </section>
        )}

        {isEditable ? (
          <div className="grid gap-5 md:grid-cols-2">
            <DetailItem label="ID" value={user.id} mono />
            <DetailItem
              label={t("admin.userRegistration.status")}
              value={t("admin.userRegistration.status.toBeApproved")}
            />
            <Field
              label={t("admin.userRegistration.email")}
              type="email"
              value={form.email}
              onChange={(value) => updateField("email", value)}
              required
            />
            <Field
              label={t("admin.userRegistration.companyName")}
              value={form.company_name}
              onChange={(value) => updateField("company_name", value)}
              required
            />
            <Field
              label={t("admin.userRegistration.zipcode")}
              value={form.zipcode}
              onChange={(value) => updateField("zipcode", value)}
              required
              action={
                <button
                  type="button"
                  onClick={fillAddressFromZipcode}
                  disabled={addressLoading}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  {addressLoading
                    ? t("admin.userRegistration.addressSearching")
                    : t("admin.userRegistration.addressSearch")}
                </button>
              }
            />
            <Field
              label={t("admin.userRegistration.telephone")}
              type="tel"
              value={form.telephone}
              onChange={(value) => updateField("telephone", value)}
              required
            />
            <Field
              label={t("admin.userRegistration.budget")}
              type="number"
              min="100"
              step="0.5"
              value={form.budget}
              onChange={(value) => updateField("budget", value)}
              required
              suffix={t("admin.userRegistration.budgetUnit")}
            />
            <Field
              label={t("admin.userRegistration.contactPerson")}
              value={form.contact_person}
              onChange={(value) => updateField("contact_person", value)}
              required
            />
            <div className="md:col-span-2">
              <TextArea
                label={t("admin.userRegistration.companyAddress")}
                value={form.company_address}
                onChange={(value) => updateField("company_address", value)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <TextArea
                label={t("admin.userRegistration.notes")}
                value={form.notes}
                onChange={(value) => updateField("notes", value)}
              />
            </div>
          </div>
        ) : (
          <CompanyUserReadOnlyDetails companyUser={user} />
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          {isSuperAdmin && showActions && (
            <ApprovalButtons
              disabled={
                actionLoading || user.approval_status !== "to_be_approved"
              }
              deleteDisabled={actionLoading}
              onApprove={() => onRequestAction("approve")}
              onReject={() => onRequestAction("reject")}
              onDelete={() => onRequestAction("delete")}
            />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          {isEditable && (
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
            >
              <Save className="h-4 w-4" />
              {saving ? t("common.saving") : t("common.save")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function ApprovalButtons({
  disabled,
  deleteDisabled,
  onApprove,
  onReject,
  onDelete,
}: {
  disabled: boolean;
  deleteDisabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-nowrap gap-1.5">
      <TableActionButton
        variant="success"
        disabled={disabled}
        onClick={onApprove}
      >
        {t("admin.userRegistration.approve")}
      </TableActionButton>
      <TableActionButton
        variant="warning"
        disabled={disabled}
        onClick={onReject}
      >
        {t("admin.userRegistration.unapprove")}
      </TableActionButton>
      <TableActionButton
        variant="danger"
        disabled={deleteDisabled}
        onClick={onDelete}
      >
        {t("common.delete")}
      </TableActionButton>
    </div>
  );
}

function AssignedAdminsSummary({
  assignments,
}: {
  assignments: NonNullable<CompanyUser["admin_assignments"]>;
}) {
  if (assignments.length === 0) {
    return <span className="text-sm text-gray-400">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {assignments.map((assignment) => (
        <span
          key={assignment.admin_user_id}
          className="inline-flex max-w-full items-center rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800"
          title={assignment.email}
        >
          <span className="min-w-0 truncate">
            {assignment.user_name || assignment.email}
          </span>
        </span>
      ))}
    </div>
  );
}

function ConfirmActionModal({
  user,
  action,
  onCancel,
  onConfirm,
}: {
  user: CompanyUser;
  action: UserAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const actionLabel =
    action === "approve"
      ? t("admin.userRegistration.approve")
      : action === "reject"
        ? t("admin.userRegistration.unapprove")
        : t("common.delete");
  const description =
    action === "approve"
      ? t("admin.userRegistration.confirmApprove")
      : action === "reject"
        ? t("admin.userRegistration.confirmReject")
        : t("admin.userRegistration.confirmDelete");
  const confirmClass =
    action === "approve"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : action === "reject"
        ? "bg-amber-500 hover:bg-amber-600"
        : "bg-rose-600 hover:bg-rose-700";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("admin.userRegistration.confirmTitle", { action: actionLabel })}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {description}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
          <div className="font-bold text-gray-900 dark:text-white">
            {user.company_name}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {user.email}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition ${confirmClass}`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  wide = false,
  mono = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-gray-50 p-4 dark:bg-gray-950 ${wide ? "md:col-span-2" : ""}`}
    >
      <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div
        className={`mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CompanyUser["approval_status"] }) {
  const label =
    status === "approved"
      ? t("admin.userRegistration.status.approved")
      : status === "rejected"
        ? t("admin.userRegistration.status.rejected")
        : t("admin.userRegistration.status.toBeApproved");
  const classes =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "rejected"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${classes}`}>
      {label}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  step,
  suffix,
  action,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
  suffix?: string;
  action?: React.ReactNode;
  onBlur?: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <div className={action ? "flex gap-2" : "relative"}>
        <div className="relative min-w-0 flex-1">
          <input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            required={required}
            min={min}
            step={step}
            className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white ${suffix ? "pr-14" : ""}`}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500 dark:text-gray-400">
              {suffix}
            </span>
          )}
        </div>
        {action}
      </div>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        rows={3}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
    </label>
  );
}
