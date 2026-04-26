import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle,
  Plus,
  Save,
  Search,
  X,
  XCircle,
} from "lucide-react";
import {
  createCompanyUser,
  defaultCompanyUserForm,
  CompanyUserForm,
  CompanyUser,
  CompanyUserApprovalStatus,
  fetchCompanyUsersByAdmin,
  updatePendingCompanyUser,
} from "../lib/companyUsers";
import { t } from "../lib/i18n";
import { lookupJapaneseAddress } from "../lib/zipcode";

interface UserRegistrationFormProps {
  adminEmail: string;
}

type SortKey =
  | "id"
  | "company_name"
  | "email"
  | "budget"
  | "approval_status"
  | "created_at";
type SortDirection = "asc" | "desc";

export default function UserRegistrationForm({
  adminEmail,
}: UserRegistrationFormProps) {
  const [form, setForm] = useState<CompanyUserForm>(defaultCompanyUserForm);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    CompanyUserApprovalStatus | "all"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
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
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t("admin.userRegistration.dashboard")}
            </h3>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("admin.userRegistration.count", {
                count: filteredUsers.length,
              })}
            </span>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <SortableHeader
                      label="ID"
                      sortKey="id"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t("admin.userRegistration.companyName")}
                      sortKey="company_name"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t("admin.userRegistration.email")}
                      sortKey="email"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t("admin.userRegistration.budget")}
                      sortKey="budget"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t("admin.userRegistration.status")}
                      sortKey="approval_status"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t("admin.userRegistration.createdAt")}
                      sortKey="created_at"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={changeSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr
                      key={user.id}
                      tabIndex={0}
                      onClick={() => setSelectedUser(user)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedUser(user);
                        }
                      }}
                      className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:border-gray-800 dark:hover:bg-gray-800/60 dark:focus:bg-gray-800/60"
                    >
                      <td className="py-4 pr-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {user.id.slice(0, 8)}
                      </td>
                      <td className="py-4 pr-4 font-semibold text-gray-900 dark:text-white">
                        {user.company_name}
                      </td>
                      <td className="py-4 pr-4 text-gray-600 dark:text-gray-300">
                        {user.email}
                      </td>
                      <td className="py-4 pr-4 text-gray-600 dark:text-gray-300">
                        {Number(user.budget).toLocaleString()}{" "}
                        {t("admin.userRegistration.budgetUnit")}
                      </td>
                      <td className="py-4 pr-4">
                        <StatusBadge status={user.approval_status} />
                      </td>
                      <td className="py-4 pr-4 text-gray-500 dark:text-gray-400">
                        {new Date(user.created_at).toLocaleDateString("ja-JP")}
                      </td>
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
          onClose={() => setSelectedUser(null)}
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

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-gray-200 pt-5 dark:border-gray-800">
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {t("admin.userRegistration.status.toBeApproved")}
            </span>
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

function UserDetailModal({
  user,
  onSaved,
  onClose,
}: {
  user: CompanyUser;
  onSaved: (user: CompanyUser) => void;
  onClose: () => void;
}) {
  const isEditable = user.approval_status === "to_be_approved";
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
  const [addressLoading, setAddressLoading] = useState(false);
  const [error, setError] = useState("");

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
          <div className="grid gap-4 md:grid-cols-2">
            <DetailItem label="ID" value={user.id} mono />
            <DetailItem
              label={t("admin.userRegistration.email")}
              value={user.email}
            />
            <DetailItem
              label={t("admin.userRegistration.companyName")}
              value={user.company_name}
            />
            <DetailItem
              label={t("admin.userRegistration.budget")}
              value={`${Number(user.budget).toLocaleString()} ${t("admin.userRegistration.budgetUnit")}`}
            />
            <DetailItem
              label={t("admin.userRegistration.zipcode")}
              value={user.zipcode || t("common.unset")}
            />
            <DetailItem
              label={t("admin.userRegistration.telephone")}
              value={user.telephone}
            />
            <DetailItem
              label={t("admin.userRegistration.contactPerson")}
              value={user.contact_person || t("common.unset")}
            />
            <DetailItem
              label={t("admin.userRegistration.createdAt")}
              value={new Date(user.created_at).toLocaleString("ja-JP")}
            />
            <DetailItem
              label={t("admin.userRegistration.companyAddress")}
              value={user.company_address}
              wide
            />
            <DetailItem
              label={t("admin.userRegistration.notes")}
              value={user.notes || t("common.unset")}
              wide
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
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

function SortableHeader({
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
  const isActive = sortKey === activeSortKey;

  return (
    <th className="py-3 pr-4 font-bold">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-gray-900 dark:hover:text-white"
      >
        {label}
        <ArrowDownUp
          className={`h-3.5 w-3.5 ${
            isActive ? "text-cyan-500" : "text-gray-400"
          }`}
        />
        {isActive && (
          <span className="text-[10px] text-cyan-600 dark:text-cyan-300">
            {direction === "asc" ? "ASC" : "DESC"}
          </span>
        )}
      </button>
    </th>
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
