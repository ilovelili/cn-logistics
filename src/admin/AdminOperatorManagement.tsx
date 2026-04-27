import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, ShieldCheck, XCircle } from "lucide-react";
import {
  AdminOperator,
  createAdminOperator,
  defaultAdminOperatorForm,
  fetchAdminOperators,
} from "../lib/adminOperators";
import { t } from "../lib/i18n";

interface AdminOperatorManagementProps {
  superAdminEmail: string;
}

export default function AdminOperatorManagement({
  superAdminEmail,
}: AdminOperatorManagementProps) {
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(defaultAdminOperatorForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const filteredOperators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return operators;

    return operators.filter((operator) =>
      [operator.id, operator.email, operator.user_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [operators, query]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createAdminOperator(form, superAdminEmail);
      setForm(defaultAdminOperatorForm);
      setShowForm(false);
      await loadOperators();
      showToast("success", t("superAdmin.operators.created"));
    } catch {
      showToast("error", t("superAdmin.operators.createFailed"));
    } finally {
      setSaving(false);
    }
  };

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

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">
              {t("superAdmin.operators.title")}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("superAdmin.operators.description")}
            </p>
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
          <div className="grid gap-4 md:grid-cols-3">
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
            <FormField
              label={t("superAdmin.operators.password")}
              value={form.password}
              type="password"
              required
              onChange={(value) => setForm({ ...form, password: value })}
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
          <label className="relative block w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("superAdmin.operators.searchPlaceholder")}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="py-3 pr-4">ID</th>
                <th className="py-3 pr-4">{t("superAdmin.operators.email")}</th>
                <th className="py-3 pr-4">{t("superAdmin.operators.name")}</th>
                <th className="py-3 pr-4">
                  {t("superAdmin.operators.status")}
                </th>
                <th className="py-3">
                  {t("admin.userRegistration.createdAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td className="py-8 text-center text-gray-500" colSpan={5}>
                    {t("common.loadingDocuments")}
                  </td>
                </tr>
              ) : filteredOperators.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-gray-500" colSpan={5}>
                    {t("superAdmin.operators.noOperators")}
                  </td>
                </tr>
              ) : (
                filteredOperators.map((operator) => (
                  <tr key={operator.id}>
                    <td className="py-4 pr-4 font-mono text-xs text-gray-500">
                      {operator.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-4 pr-4 font-bold text-gray-900 dark:text-white">
                      {operator.email}
                    </td>
                    <td className="py-4 pr-4 text-gray-700 dark:text-gray-300">
                      {operator.user_name || "-"}
                    </td>
                    <td className="py-4 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {operator.is_active
                          ? t("superAdmin.operators.active")
                          : t("superAdmin.operators.inactive")}
                      </span>
                    </td>
                    <td className="py-4 text-gray-500">
                      {new Date(operator.created_at).toLocaleDateString(
                        "ja-JP",
                      )}
                    </td>
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
