import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Plus, Save, XCircle } from "lucide-react";
import {
  createCompanyUser,
  defaultCompanyUserForm,
  CompanyUserForm,
  CompanyUser,
  fetchCompanyUsersByAdmin,
} from "../lib/companyUsers";
import { t } from "../lib/i18n";
import { lookupJapaneseAddress } from "../lib/zipcode";

interface UserRegistrationFormProps {
  adminEmail: string;
}

export default function UserRegistrationForm({
  adminEmail,
}: UserRegistrationFormProps) {
  const [form, setForm] = useState<CompanyUserForm>(defaultCompanyUserForm);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [users, setUsers] = useState<CompanyUser[]>([]);
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
              {t("admin.userRegistration.count", { count: users.length })}
            </span>
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="py-3 pr-4 font-bold">
                      {t("admin.userRegistration.companyName")}
                    </th>
                    <th className="py-3 pr-4 font-bold">
                      {t("admin.userRegistration.email")}
                    </th>
                    <th className="py-3 pr-4 font-bold">
                      {t("admin.userRegistration.budget")}
                    </th>
                    <th className="py-3 pr-4 font-bold">
                      {t("admin.userRegistration.status")}
                    </th>
                    <th className="py-3 pr-4 font-bold">
                      {t("admin.userRegistration.createdAt")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
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
