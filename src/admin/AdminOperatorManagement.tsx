import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Plus, Save, Search, Trash2, X, XCircle } from "lucide-react";
import {
  AdminOperator,
  AdminOperatorStaffRole,
  AssignedShipperUser,
  adminOperatorStaffRoleOptions,
  createAdminOperator,
  defaultAdminOperatorForm,
  deleteAdminOperator,
  fetchAdminOperators,
  updateAdminOperator,
} from "../lib/adminOperators";
import {
  fetchShipperUsersByAdmin,
  updateShipperUserAdminAssignments,
  type ShipperUser,
} from "../lib/shipperUsers";
import { t } from "../lib/i18n";
import type { TranslationKey } from "../lib/i18n";
import SortableTableHeader from "../components/SortableTableHeader";
import PaginationControls from "../components/PaginationControls";
import StickyTableHeaderToggle from "../components/StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "../components/useStickyTableHeaderPreference";
import TableHorizontalScrollHint from "../components/TableHorizontalScrollHint";
import TableActionButton from "../components/TableActionButton";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import { useHorizontalScrollHint } from "../components/useHorizontalScrollHint";
import { useTableColumnSettings } from "../components/useTableColumnSettings";
import { usePagination } from "../components/usePagination";
import { UserDetailModal } from "./UserRegistrationForm";

interface AdminOperatorManagementProps {
  superAdminEmail: string;
}

type SortKey = "id" | "email" | "user_name" | "staff_role" | "created_at";
type SortDirection = "asc" | "desc";
type OperatorColumnId = SortKey | "assigned_shipper_users" | "action";

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

function getOperatorStaffRoles(
  operator: Pick<AdminOperator, "staff_role" | "staff_roles">,
) {
  return operator.staff_roles?.length > 0
    ? operator.staff_roles
    : [operator.staff_role];
}

function getStaffRoleLabels(roles: AdminOperatorStaffRole[]) {
  return roles.map((role) => t(getStaffRoleLabelKey(role)));
}

function getOperatorCreateErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("email already exists")
  ) {
    return t("superAdmin.operators.emailAlreadyExists");
  }

  return t("superAdmin.operators.createFailed");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default function AdminOperatorManagement({
  superAdminEmail,
}: AdminOperatorManagementProps) {
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [shipperUsers, setShipperUsers] = useState<ShipperUser[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(defaultAdminOperatorForm);
  const [selectedShipperUserIds, setSelectedShipperUserIds] = useState<
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
    staff_roles: AdminOperatorStaffRole[];
    shipper_user_ids: string[];
  }>({
    user_name: "",
    staff_roles: ["sales"],
    shipper_user_ids: [],
  });
  const [selectedShipperUser, setSelectedShipperUser] =
    useState<ShipperUser | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollHint = useHorizontalScrollHint(tableScrollRef);
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

  const loadShipperUsers = useCallback(async () => {
    try {
      setShipperUsers(await fetchShipperUsersByAdmin(superAdminEmail));
    } catch {
      setShipperUsers([]);
    }
  }, [superAdminEmail]);

  useEffect(() => {
    void loadShipperUsers();
  }, [loadShipperUsers]);

  const filteredOperators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return operators;

    return operators.filter((operator) =>
      [
        operator.id,
        operator.email,
        operator.user_name,
        ...getStaffRoleLabels(getOperatorStaffRoles(operator)),
        ...(operator.assigned_shipper_users ?? []).flatMap((shipperUser) => [
          shipperUser.shipper_name,
          shipperUser.email,
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
      if (sortKey === "staff_role") {
        return (
          getStaffRoleLabels(getOperatorStaffRoles(a))
            .join(", ")
            .localeCompare(
              getStaffRoleLabels(getOperatorStaffRoles(b)).join(", "),
              "ja",
            ) * direction
        );
      }

      return String(aValue).localeCompare(String(bValue), "ja") * direction;
    });
  }, [filteredOperators, sortDirection, sortKey]);
  const {
    currentPage,
    pageCount,
    pageSize,
    paginatedItems: paginatedOperators,
    visibleFrom,
    visibleTo,
    setCurrentPage,
    setPageSize,
  } = usePagination(sortedOperators);

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
    const normalizedFormEmail = normalizeEmail(form.email);
    if (
      operators.some(
        (operator) => normalizeEmail(operator.email) === normalizedFormEmail,
      )
    ) {
      showToast("error", t("superAdmin.operators.emailAlreadyExists"));
      return;
    }
    if (
      shipperUsers.some(
        (shipperUser) =>
          normalizeEmail(shipperUser.email) === normalizedFormEmail,
      )
    ) {
      showToast("error", t("superAdmin.operators.emailUsedByShipper"));
      return;
    }

    setSaving(true);
    try {
      await createAdminOperator(form, superAdminEmail);
      const updatedOperators = await fetchAdminOperators(superAdminEmail);
      const createdOperator = updatedOperators.find(
        (operator) =>
          operator.email.toLowerCase() === form.email.trim().toLowerCase(),
      );

      if (createdOperator && selectedShipperUserIds.length > 0) {
        await Promise.all(
          selectedShipperUserIds.map((shipperUserId) => {
            const shipperUser = shipperUsers.find(
              (currentShipperUser) => currentShipperUser.id === shipperUserId,
            );
            const adminUserIds = new Set(
              (shipperUser?.admin_assignments ?? []).map(
                (assignment) => assignment.admin_user_id,
              ),
            );
            adminUserIds.add(createdOperator.id);

            return updateShipperUserAdminAssignments({
              superAdminEmail,
              userId: shipperUserId,
              adminUserIds: [...adminUserIds],
            });
          }),
        );
      }

      setForm(defaultAdminOperatorForm);
      setSelectedShipperUserIds([]);
      setShowForm(false);
      await loadShipperUsers();
      await loadOperators();
      showToast("success", t("superAdmin.operators.created"));
    } catch (error) {
      showToast("error", getOperatorCreateErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const syncOperatorShipperAssignments = async (
    operatorId: string,
    selectedShipperUserIdsForOperator: string[],
  ) => {
    const selectedShipperUserIdSet = new Set(selectedShipperUserIdsForOperator);

    await Promise.all(
      shipperUsers.map((shipperUser) => {
        const adminUserIds = new Set(
          (shipperUser.admin_assignments ?? []).map(
            (assignment) => assignment.admin_user_id,
          ),
        );

        if (selectedShipperUserIdSet.has(shipperUser.id)) {
          adminUserIds.add(operatorId);
        } else {
          adminUserIds.delete(operatorId);
        }

        return updateShipperUserAdminAssignments({
          superAdminEmail,
          userId: shipperUser.id,
          adminUserIds: [...adminUserIds],
        });
      }),
    );
  };

  const openEditModal = (operator: AdminOperator) => {
    setEditTarget(operator);
    setEditForm({
      user_name: operator.user_name ?? "",
      staff_roles: getOperatorStaffRoles(operator),
      shipper_user_ids: (operator.assigned_shipper_users ?? []).map(
        (shipperUser) => shipperUser.id,
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
        staffRoles: editForm.staff_roles,
      });
      await syncOperatorShipperAssignments(
        editTarget.id,
        editForm.shipper_user_ids,
      );
      setEditTarget(null);
      await loadShipperUsers();
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
          <StaffRoleChips roles={getOperatorStaffRoles(operator)} />
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
        id: "assigned_shipper_users",
        label: t("superAdmin.operators.assignedShippers"),
        width: 300,
        render: (operator) => (
          <AssignedShipperUsers
            shipperUsers={operator.assigned_shipper_users ?? []}
            onSelect={(shipperUser) =>
              setSelectedShipperUser(toShipperUser(shipperUser))
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
              icon={<Edit3 className="h-3.5 w-3.5" />}
              onClick={() => openEditModal(operator)}
            >
              {t("common.edit")}
            </TableActionButton>
            <TableActionButton
              variant="danger"
              icon={<Trash2 className="h-3.5 w-3.5" />}
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
          className={`fixed right-6 top-6 z-[200] flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl ${
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
          shipperUsers={shipperUsers}
          saving={editSaving}
          onChange={setEditForm}
          onCancel={() => setEditTarget(null)}
          onSubmit={handleEditSubmit}
        />
      )}

      {selectedShipperUser && (
        <UserDetailModal
          user={selectedShipperUser}
          isSuperAdmin
          adminOperators={operators}
          superAdminEmail={superAdminEmail}
          detailsReadOnly
          onNotify={showToast}
          onSaved={(updatedUsers) => {
            setSelectedShipperUser(updatedUsers[0] ?? selectedShipperUser);
            void loadOperators();
          }}
          onAssignmentsSaved={(updatedUser) => {
            setSelectedShipperUser(updatedUser);
            void loadOperators();
          }}
          onClose={() => setSelectedShipperUser(null)}
        />
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:rounded-3xl sm:p-6">
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
            <FormRoleMultiSelect
              label={t("superAdmin.operators.staffRole")}
              value={form.staff_roles}
              onChange={(value) =>
                setForm({
                  ...form,
                  staff_roles: value,
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
              label={t("superAdmin.operators.assignedShippers")}
              value={selectedShipperUserIds}
              options={shipperUsers.map((shipperUser) => ({
                value: shipperUser.id,
                label: shipperUser.shipper_name,
                description: shipperUser.email,
              }))}
              emptyLabel={t("admin.userRegistration.noUsers")}
              onChange={setSelectedShipperUserIds}
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

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:rounded-3xl sm:p-6">
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
            <div className="flex items-center gap-2">
              <StickyTableHeaderToggle
                adminTheme
                enabled={stickyHeaderEnabled}
                onToggle={toggleStickyHeader}
              />
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
        </div>

        <div
          className={`mb-3 flex justify-end sm:${scrollHint.canScroll ? "flex" : "hidden"}`}
        >
          <TableHorizontalScrollHint
            adminTheme
            atStart={scrollHint.atStart}
            atEnd={scrollHint.atEnd}
            onScroll={scrollHint.scrollByDirection}
          />
        </div>

        <div
          ref={tableScrollRef}
          className={
            stickyHeaderEnabled
              ? "max-h-[70vh] overflow-auto overscroll-contain"
              : "overflow-x-auto"
          }
        >
          <table
            className="w-full table-fixed text-left text-sm"
            style={{ minWidth: `${Math.max(tableMinWidth, 320)}px` }}
          >
            <colgroup>
              {visibleTableColumns.map((column) => (
                <col key={column.id} style={{ width: `${column.width}px` }} />
              ))}
            </colgroup>
            <thead
              className={`${stickyHeaderEnabled ? "sticky top-0 z-20 shadow-sm" : ""} bg-white dark:bg-gray-900`}
            >
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
                paginatedOperators.map((operator) => (
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
        <PaginationControls
          adminTheme
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={sortedOperators.length}
          visibleFrom={visibleFrom}
          visibleTo={visibleTo}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
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

function AssignedShipperUsers({
  shipperUsers,
  onSelect,
}: {
  shipperUsers: NonNullable<AdminOperator["assigned_shipper_users"]>;
  onSelect: (shipperUser: AssignedShipperUser) => void;
}) {
  if (shipperUsers.length === 0) {
    return <span className="text-sm text-gray-400">-</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {shipperUsers.map((shipperUser) => (
        <button
          type="button"
          key={shipperUser.id}
          onClick={() => onSelect(shipperUser)}
          className="inline-flex max-w-full items-center rounded-full border border-cyan-200 bg-transparent px-2.5 py-1 text-left text-xs font-bold text-cyan-800 transition hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-300 dark:border-cyan-900 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
          title={`${shipperUser.shipper_name} / ${shipperUser.email}`}
        >
          <span className="min-w-0 truncate" title={shipperUser.shipper_name}>
            {shipperUser.shipper_name}
          </span>
        </button>
      ))}
    </div>
  );
}

function toShipperUser(shipperUser: AssignedShipperUser): ShipperUser {
  return {
    id: shipperUser.id,
    email: shipperUser.email,
    shipper_name: shipperUser.shipper_name,
    zipcode: shipperUser.zipcode,
    shipper_address: shipperUser.shipper_address ?? "",
    telephone: shipperUser.telephone ?? "",
    budget: Number(shipperUser.budget ?? 0),
    contact_person: shipperUser.contact_person,
    notes: shipperUser.notes,
    approval_status:
      shipperUser.approval_status === "approved" ||
      shipperUser.approval_status === "rejected" ||
      shipperUser.approval_status === "to_be_approved"
        ? shipperUser.approval_status
        : "to_be_approved",
    created_by: null,
    created_at: shipperUser.created_at,
    updated_at: shipperUser.updated_at,
    admin_assignments: shipperUser.admin_assignments ?? [],
  };
}

function EditOperatorModal({
  operator,
  form,
  shipperUsers,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  operator: AdminOperator;
  form: {
    user_name: string;
    staff_roles: AdminOperatorStaffRole[];
    shipper_user_ids: string[];
  };
  shipperUsers: ShipperUser[];
  saving: boolean;
  onChange: (form: {
    user_name: string;
    staff_roles: AdminOperatorStaffRole[];
    shipper_user_ids: string[];
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
          <FormRoleMultiSelect
            label={t("superAdmin.operators.staffRole")}
            value={form.staff_roles}
            onChange={(value) =>
              onChange({
                ...form,
                staff_roles: value,
              })
            }
          />
        </div>

        <div className="mt-4">
          <FormMultiSelect
            label={t("superAdmin.operators.assignedShippers")}
            value={form.shipper_user_ids}
            options={shipperUsers.map((shipperUser) => ({
              value: shipperUser.id,
              label: shipperUser.shipper_name,
              description: shipperUser.email,
            }))}
            emptyLabel={t("admin.userRegistration.noUsers")}
            onChange={(shipperUserIds) =>
              onChange({ ...form, shipper_user_ids: shipperUserIds })
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

function StaffRoleChips({ roles }: { roles: AdminOperatorStaffRole[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <span
          key={role}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {t(getStaffRoleLabelKey(role))}
        </span>
      ))}
    </div>
  );
}

function FormRoleMultiSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AdminOperatorStaffRole[];
  onChange: (value: AdminOperatorStaffRole[]) => void;
}) {
  const selectedRoleSet = new Set(value);
  const toggleRole = (role: AdminOperatorStaffRole) => {
    if (selectedRoleSet.has(role)) {
      const nextRoles = value.filter((currentRole) => currentRole !== role);
      onChange(nextRoles.length > 0 ? nextRoles : value);
      return;
    }

    onChange([...value, role]);
  };

  return (
    <div>
      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
        {label}
        <span className="ml-1 text-rose-500">*</span>
      </span>
      <div className="mt-2 grid gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
        {adminOperatorStaffRoleOptions.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-800 transition hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20"
          >
            <input
              type="checkbox"
              checked={selectedRoleSet.has(option.value)}
              onChange={() => toggleRole(option.value)}
              className="h-4 w-4 rounded border-gray-300"
            />
            {t(option.labelKey)}
          </label>
        ))}
      </div>
    </div>
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
                    <span
                      className="block truncate text-sm font-bold text-gray-900 dark:text-white"
                      title={option.label}
                    >
                      {option.label}
                    </span>
                    {option.description && (
                      <span
                        className="block truncate text-xs text-gray-500 dark:text-gray-400"
                        title={option.description}
                      >
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
