import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, X, XCircle } from "lucide-react";
import {
  AdminOperator,
  AdminOperatorStaffRole,
  AssignedCompanyUser,
  adminOperatorStaffRoleOptions,
  createAdminOperator,
  defaultAdminOperatorForm,
  deleteAdminOperator,
  fetchAdminOperators,
  updateAdminOperator,
} from "../lib/adminOperators";
import {
  fetchCompanyUsersByAdmin,
  updateCompanyUserAdminAssignments,
  type CompanyUser,
} from "../lib/companyUsers";
import { t } from "../lib/i18n";
import type { TranslationKey } from "../lib/i18n";
import SortableTableHeader from "../components/SortableTableHeader";
import TableActionButton from "../components/TableActionButton";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import { useTableColumnSettings } from "../components/useTableColumnSettings";
import { UserDetailModal } from "./UserRegistrationForm";

interface AdminOperatorManagementProps {
  superAdminEmail: string;
}

type SortKey = "id" | "email" | "user_name" | "staff_role" | "created_at";
type SortDirection = "asc" | "desc";
type OperatorColumnId = SortKey | "assigned_company_users" | "action";

interface OperatorTableColumn {
  id: OperatorColumnId;
  label: string;
  width: number;
  sortKey?: SortKey;
  render: (operator: AdminOperator) => React.ReactNode;
}

function getStaffRoleLabelKey(role: AdminOperatorStaffRole): TranslationKey {
  return `superAdmin.operators.staffRole.${role}` as TranslationKey;
}

export default function AdminOperatorManagement({
  superAdminEmail,
}: AdminOperatorManagementProps) {
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(defaultAdminOperatorForm);
  const [selectedCompanyUserIds, setSelectedCompanyUserIds] = useState<
    string[]
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminOperator | null>(null);
  const [editTarget, setEditTarget] = useState<AdminOperator | null>(null);
  const [editForm, setEditForm] = useState<{
    user_name: string;
    staff_role: AdminOperatorStaffRole;
    company_user_ids: string[];
  }>({
    user_name: "",
    staff_role: "other",
    company_user_ids: [],
  });
  const [selectedCompanyUser, setSelectedCompanyUser] =
    useState<CompanyUser | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadOperators = useCallback(async () => {
    setLoading(true);
    try {
      setOperators(await fetchAdminOperators(superAdminEmail));
    } catch {
      showToast("error", t("superAdmin.operators.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [superAdminEmail]);

  useEffect(() => {
    void loadOperators();
  }, [loadOperators]);

  const loadCompanyUsers = useCallback(async () => {
    try {
      setCompanyUsers(await fetchCompanyUsersByAdmin(superAdminEmail));
    } catch {
      setCompanyUsers([]);
    }
  }, [superAdminEmail]);

  useEffect(() => {
    void loadCompanyUsers();
  }, [loadCompanyUsers]);

  const filteredOperators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return operators;

    return operators.filter((operator) =>
      [
        operator.id,
        operator.email,
        operator.user_name,
        t(getStaffRoleLabelKey(operator.staff_role)),
        ...(operator.assigned_company_users ?? []).flatMap((companyUser) => [
          companyUser.company_name,
          companyUser.email,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [operators, query]);

  const sortedOperators = useMemo(() => {
    return [...filteredOperators].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "created_at") {
        return (
          (new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()) *
          direction
        );
      }

      const aValue = a[sortKey] ?? "";
      const bValue = b[sortKey] ?? "";
      return String(aValue).localeCompare(String(bValue), "ja") * direction;
    });
  }, [filteredOperators, sortDirection, sortKey]);

  const changeSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "created_at" ? "desc" : "asc");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createAdminOperator(form, superAdminEmail);
      const updatedOperators = await fetchAdminOperators(superAdminEmail);
      const createdOperator = updatedOperators.find(
        (operator) =>
          operator.email.toLowerCase() === form.email.trim().toLowerCase(),
      );

      if (createdOperator && selectedCompanyUserIds.length > 0) {
        await Promise.all(
          selectedCompanyUserIds.map((companyUserId) => {
            const companyUser = companyUsers.find(
              (currentCompanyUser) => currentCompanyUser.id === companyUserId,
            );
            const adminUserIds = new Set(
              (companyUser?.admin_assignments ?? []).map(
                (assignment) => assignment.admin_user_id,
              ),
            );
            adminUserIds.add(createdOperator.id);

            return updateCompanyUserAdminAssignments({
              superAdminEmail,
              userId: companyUserId,
              adminUserIds: [...adminUserIds],
            });
          }),
        );
      }

      setForm(defaultAdminOperatorForm);
      setSelectedCompanyUserIds([]);
      setShowForm(false);
      await loadCompanyUsers();
      await loadOperators();
      showToast("success", t("superAdmin.operators.created"));
    } catch {
      showToast("error", t("superAdmin.operators.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  const syncOperatorCompanyAssignments = async (
    operatorId: string,
    selectedCompanyUserIdsForOperator: string[],
  ) => {
    const selectedCompanyUserIdSet = new Set(selectedCompanyUserIdsForOperator);

    await Promise.all(
      companyUsers.map((companyUser) => {
        const adminUserIds = new Set(
          (companyUser.admin_assignments ?? []).map(
            (assignment) => assignment.admin_user_id,
          ),
        );

        if (selectedCompanyUserIdSet.has(companyUser.id)) {
          adminUserIds.add(operatorId);
        } else {
          adminUserIds.delete(operatorId);
        }

        return updateCompanyUserAdminAssignments({
          superAdminEmail,
          userId: companyUser.id,
          adminUserIds: [...adminUserIds],
        });
      }),
    );
  };

  const openEditModal = (operator: AdminOperator) => {
    setEditTarget(operator);
    setEditForm({
      user_name: operator.user_name ?? "",
      staff_role: operator.staff_role,
      company_user_ids: (operator.assigned_company_users ?? []).map(
        (companyUser) => companyUser.id,
      ),
    });
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editTarget) return;

    setEditSaving(true);
    try {
      await updateAdminOperator({
        superAdminEmail,
        operatorId: editTarget.id,
        operatorName: editForm.user_name,
        staffRole: editForm.staff_role,
      });
      await syncOperatorCompanyAssignments(
        editTarget.id,
        editForm.company_user_ids,
      );
      setEditTarget(null);
      await loadCompanyUsers();
      await loadOperators();
      showToast("success", t("superAdmin.operators.updated"));
    } catch {
      showToast("error", t("superAdmin.operators.updateFailed"));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeletingId(deleteTarget.id);
    try {
      await deleteAdminOperator({
        superAdminEmail,
        operatorId: deleteTarget.id,
      });
      setOperators((currentOperators) =>
        currentOperators.filter((operator) => operator.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      showToast("success", t("superAdmin.operators.deleted"));
    } catch {
      showToast("error", t("superAdmin.operators.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo<OperatorTableColumn[]>(
    () => [
      {
        id: "email",
        label: t("superAdmin.operators.email"),
        width: 220,
        sortKey: "email",
        render: (operator) => (
          <span className="font-bold text-gray-900 dark:text-white">
            {operator.email}
          </span>
        ),
      },
      {
        id: "user_name",
        label: t("superAdmin.operators.name"),
        width: 160,
        sortKey: "user_name",
        render: (operator) => (
          <span className="text-gray-700 dark:text-gray-300">
            {operator.user_name || "-"}
          </span>
        ),
      },
      {
        id: "staff_role",
        label: t("superAdmin.operators.staffRole"),
        width: 160,
        sortKey: "staff_role",
        render: (operator) => (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {t(getStaffRoleLabelKey(operator.staff_role))}
          </span>
        ),
      },
      {
        id: "created_at",
        label: t("admin.userRegistration.createdAt"),
        width: 120,
        sortKey: "created_at",
        render: (operator) => (
          <span className="text-gray-500">
            {new Date(operator.created_at).toLocaleDateString("ja-JP")}
          </span>
        ),
      },
      {
        id: "assigned_company_users",
        label: t("superAdmin.operators.assignedCompanies"),
        width: 300,
        render: (operator) => (
          <AssignedCompanyUsers
            companyUsers={operator.assigned_company_users ?? []}
            onSelect={(companyUser) =>
              setSelectedCompanyUser(toCompanyUser(companyUser))
            }
          />
        ),
      },
      {
        id: "action",
        label: t("admin.userRegistration.action"),
        width: 210,
        render: (operator) => (
          <div className="flex items-center gap-2">
            <TableActionButton
              variant="success"
              onClick={() => openEditModal(operator)}
            >
              {t("common.edit")}
            </TableActionButton>
            <TableActionButton
              variant="danger"
              disabled={deletingId === operator.id}
              onClick={() => setDeleteTarget(operator)}
            >
              {t("common.delete")}
            </TableActionButton>
          </div>
        ),
      },
    ],
    [deletingId],
  );

  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    "admin_operators_table_columns_v5",
    columns.map((column) => ({ id: column.id, label: column.label })),
  );
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const visibleTableColumns = visibleColumns
    .map((column) => columnsById.get(column.id))
    .filter((column): column is OperatorTableColumn => Boolean(column));
  const orderedColumnConfigs = orderedColumns.map((column) => ({
    id: column.id,
    label: column.label,
  }));
  const tableMinWidth = visibleTableColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-[100] flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-rose-50 text-rose-800"
          }`}
        >
          {toast.type === "error" && <XCircle className="h-5 w-5" />}
          {toast.message}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          operator={deleteTarget}
          deleting={deletingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      )}

      {editTarget && (
        <EditOperatorModal
          operator={editTarget}
          form={editForm}
          companyUsers={companyUsers}
          saving={editSaving}
          onChange={setEditForm}
          onCancel={() => setEditTarget(null)}
          onSubmit={handleEditSubmit}
        />
      )}

      {selectedCompanyUser && (
        <UserDetailModal
          user={selectedCompanyUser}
          isSuperAdmin
          actionLoading={false}
          adminOperators={operators}
          superAdminEmail={superAdminEmail}
          detailsReadOnly
          showActions={false}
          onSaved={(updatedUser) => {
            setSelectedCompanyUser(updatedUser);
            void loadOperators();
          }}
          onAssignmentsSaved={(updatedUser) => {
            setSelectedCompanyUser(updatedUser);
            void loadOperators();
          }}
          onRequestAction={() => undefined}
          onClose={() => setSelectedCompanyUser(null)}
        />
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">
              {t("superAdmin.operators.title")}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-gray-200"
          >
            <Plus className="h-4 w-4" />
            {t("superAdmin.operators.new")}
          </button>
        </div>
      </section>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <FormField
              label={t("superAdmin.operators.email")}
              value={form.email}
              type="email"
              required
              onChange={(value) => setForm({ ...form, email: value })}
            />
            <FormField
              label={t("superAdmin.operators.name")}
              value={form.user_name}
              required
              onChange={(value) => setForm({ ...form, user_name: value })}
            />
            <FormSelect
              label={t("superAdmin.operators.staffRole")}
              value={form.staff_role}
              options={adminOperatorStaffRoleOptions.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              onChange={(value) =>
                setForm({
                  ...form,
                  staff_role: value as typeof form.staff_role,
                })
              }
            />
            <FormField
              label={t("superAdmin.operators.password")}
              value={form.password}
              type="password"
              required
              onChange={(value) => setForm({ ...form, password: value })}
            />
          </div>
          <div className="mt-4">
            <FormMultiSelect
              label={t("superAdmin.operators.assignedCompanies")}
              value={selectedCompanyUserIds}
              options={companyUsers.map((companyUser) => ({
                value: companyUser.id,
                label: companyUser.company_name,
                description: companyUser.email,
              }))}
              emptyLabel={t("admin.userRegistration.noUsers")}
              onChange={setSelectedCompanyUserIds}
            />
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? t("common.saving") : t("common.create")}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-black text-gray-900 dark:text-white">
            {t("superAdmin.operators.list")}
          </h2>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <label className="relative block w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("superAdmin.operators.searchPlaceholder")}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
              />
            </label>
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

        <div className="overflow-x-auto">
          <table
            className="w-full table-fixed text-left text-sm"
            style={{ minWidth: `${Math.max(tableMinWidth, 320)}px` }}
          >
            <colgroup>
              {visibleTableColumns.map((column) => (
                <col key={column.id} style={{ width: `${column.width}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {visibleTableColumns.map((column) =>
                  column.sortKey ? (
                    <OperatorSortableHeader
                      key={column.id}
                      label={column.label}
                      sortKey={column.sortKey}
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={changeSort}
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
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td
                    className="py-8 text-center text-gray-500"
                    colSpan={visibleTableColumns.length}
                  >
                    {t("common.loadingDocuments")}
                  </td>
                </tr>
              ) : filteredOperators.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-gray-500"
                    colSpan={visibleTableColumns.length}
                  >
                    {t("superAdmin.operators.noOperators")}
                  </td>
                </tr>
              ) : (
                sortedOperators.map((operator) => (
                  <tr key={operator.id}>
                    {visibleTableColumns.map((column) => (
                      <td key={column.id} className="py-4 pr-4 text-left">
                        {column.render(operator)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OperatorSortableHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  direction: SortDirection;
  onSort: (sortKey: SortKey) => void;
}) {
  return (
    <SortableTableHeader
      label={label}
      sortKey={sortKey}
      activeSortKey={activeSortKey}
      direction={direction}
      onSort={onSort}
      className="py-3 pr-4 font-bold"
      buttonClassName="inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-gray-900 dark:hover:text-white"
      activeClassName="text-gray-900 dark:text-white"
      inactiveClassName="text-gray-500 dark:text-gray-400"
    />
  );
}

function AssignedCompanyUsers({
  companyUsers,
  onSelect,
}: {
  companyUsers: NonNullable<AdminOperator["assigned_company_users"]>;
  onSelect: (companyUser: AssignedCompanyUser) => void;
}) {
  if (companyUsers.length === 0) {
    return <span className="text-sm text-gray-400">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {companyUsers.map((companyUser) => (
        <button
          type="button"
          key={companyUser.id}
          onClick={() => onSelect(companyUser)}
          className="inline-flex max-w-full items-center rounded-full bg-cyan-50 px-2.5 py-1 text-left text-xs font-bold text-cyan-800 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-1 dark:ring-cyan-900 dark:hover:bg-cyan-950"
          title={companyUser.email}
        >
          <span className="min-w-0 truncate">{companyUser.company_name}</span>
        </button>
      ))}
    </div>
  );
}

function toCompanyUser(companyUser: AssignedCompanyUser): CompanyUser {
  return {
    id: companyUser.id,
    email: companyUser.email,
    company_name: companyUser.company_name,
    zipcode: companyUser.zipcode,
    company_address: companyUser.company_address ?? "",
    telephone: companyUser.telephone ?? "",
    budget: Number(companyUser.budget ?? 0),
    contact_person: companyUser.contact_person,
    notes: companyUser.notes,
    approval_status:
      companyUser.approval_status === "approved" ||
      companyUser.approval_status === "rejected" ||
      companyUser.approval_status === "to_be_approved"
        ? companyUser.approval_status
        : "to_be_approved",
    created_by: null,
    created_at: companyUser.created_at,
    updated_at: companyUser.updated_at,
    admin_assignments: companyUser.admin_assignments ?? [],
  };
}

function EditOperatorModal({
  operator,
  form,
  companyUsers,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  operator: AdminOperator;
  form: {
    user_name: string;
    staff_role: AdminOperatorStaffRole;
    company_user_ids: string[];
  };
  companyUsers: CompanyUser[];
  saving: boolean;
  onChange: (form: {
    user_name: string;
    staff_role: AdminOperatorStaffRole;
    company_user_ids: string[];
  }) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
      <form
        onSubmit={onSubmit}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              {t("common.edit")}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {operator.email}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            label={t("superAdmin.operators.name")}
            value={form.user_name}
            required
            onChange={(value) => onChange({ ...form, user_name: value })}
          />
          <FormSelect
            label={t("superAdmin.operators.staffRole")}
            value={form.staff_role}
            options={adminOperatorStaffRoleOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            onChange={(value) =>
              onChange({
                ...form,
                staff_role: value as AdminOperatorStaffRole,
              })
            }
          />
        </div>

        <div className="mt-4">
          <FormMultiSelect
            label={t("superAdmin.operators.assignedCompanies")}
            value={form.company_user_ids}
            options={companyUsers.map((companyUser) => ({
              value: companyUser.id,
              label: companyUser.company_name,
              description: companyUser.email,
            }))}
            emptyLabel={t("admin.userRegistration.noUsers")}
            onChange={(companyUserIds) =>
              onChange({ ...form, company_user_ids: companyUserIds })
            }
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDeleteModal({
  operator,
  deleting,
  onCancel,
  onConfirm,
}: {
  operator: AdminOperator;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("superAdmin.operators.confirmDeleteTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("superAdmin.operators.confirmDelete")}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
          <div className="font-bold text-gray-900 dark:text-white">
            {operator.user_name || "-"}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {operator.email}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? t("common.saving") : t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  type = "text",
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <input
        value={value}
        type={type}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
        {label}
        <span className="ml-1 text-rose-500">*</span>
      </span>
      <select
        value={value}
        required
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormMultiSelect({
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: string[];
  options: { value: string; label: string; description?: string }[];
  emptyLabel: string;
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : options;
  const selectedValueSet = new Set(value);
  const toggleValue = (nextValue: string) => {
    onChange(
      selectedValueSet.has(nextValue)
        ? value.filter((currentValue) => currentValue !== nextValue)
        : [...value, nextValue],
    );
  };

  return (
    <div>
      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
        {label}
      </span>
      {options.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-2 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("admin.userRegistration.searchPlaceholder")}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {filteredOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                {t("admin.userRegistration.noMatches")}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20"
                >
                  <input
                    type="checkbox"
                    checked={selectedValueSet.has(option.value)}
                    onChange={() => toggleValue(option.value)}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-gray-900 dark:text-white">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {option.description}
                      </span>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>
          {value.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {value.map((selectedValue) => {
                const selectedOption = options.find(
                  (option) => option.value === selectedValue,
                );
                if (!selectedOption) return null;

                return (
                  <button
                    key={selectedValue}
                    type="button"
                    onClick={() => toggleValue(selectedValue)}
                    className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-900 transition hover:bg-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:hover:bg-cyan-900"
                  >
                    {selectedOption.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
