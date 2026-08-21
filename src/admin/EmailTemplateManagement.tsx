import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";
import {
  EmailTemplate,
  EmailTemplateForm,
  FailedShipmentEmailDelivery,
  fetchEmailTemplates,
  fetchFailedShipmentEmailDeliveries,
  retryFailedShipmentEmailDelivery,
  shipmentEmailTemplateVariables,
  updateEmailTemplate,
} from "../lib/emailTemplates";
import { getLocale, t } from "../lib/i18n";
import { statusLabels } from "../lib/shipmentJobs";

const emptyForm: EmailTemplateForm = {
  subject_template: "",
  text_template: "",
  html_template: "",
};

export default function EmailTemplateManagement() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [form, setForm] = useState<EmailTemplateForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failedDeliveries, setFailedDeliveries] = useState<
    FailedShipmentEmailDelivery[]
  >([]);
  const [failedDeliveriesLoading, setFailedDeliveriesLoading] = useState(true);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.template_key === selectedKey) ??
      null,
    [selectedKey, templates],
  );
  const hasChanges = Boolean(
    selectedTemplate &&
    (form.subject_template !== selectedTemplate.subject_template ||
      form.text_template !== selectedTemplate.text_template ||
      form.html_template !== selectedTemplate.html_template),
  );

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      window.setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  const selectTemplate = useCallback((template: EmailTemplate) => {
    setSelectedKey(template.template_key);
    setForm(templateToForm(template));
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const nextTemplates = await fetchEmailTemplates();
      setTemplates(nextTemplates);
      if (nextTemplates.length > 0) {
        selectTemplate(
          nextTemplates.find(
            (template) => template.template_key === selectedKey,
          ) ?? nextTemplates[0],
        );
      } else {
        setSelectedKey(null);
        setForm(emptyForm);
      }
    } catch {
      showToast("error", t("superAdmin.emailTemplates.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [selectTemplate, selectedKey, showToast]);

  const loadFailedDeliveries = useCallback(async () => {
    setFailedDeliveriesLoading(true);
    try {
      setFailedDeliveries(await fetchFailedShipmentEmailDeliveries());
    } catch {
      showToast(
        "error",
        t("superAdmin.emailTemplates.failedEmails.loadFailed"),
      );
    } finally {
      setFailedDeliveriesLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadTemplates();
    void loadFailedDeliveries();
    // The selected key is intentionally excluded so local edits do not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = (field: keyof EmailTemplateForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;

    if (
      !form.subject_template.trim() ||
      !form.text_template.trim() ||
      !form.html_template.trim() ||
      /[\r\n]/.test(form.subject_template)
    ) {
      showToast("error", t("superAdmin.emailTemplates.validationFailed"));
      return;
    }

    setSaving(true);
    try {
      const updatedTemplate = await updateEmailTemplate(
        selectedTemplate.template_key,
        form,
      );
      setTemplates((current) =>
        current.map((template) =>
          template.template_key === updatedTemplate.template_key
            ? updatedTemplate
            : template,
        ),
      );
      setForm(templateToForm(updatedTemplate));
      showToast("success", t("superAdmin.emailTemplates.updated"));
    } catch {
      showToast("error", t("superAdmin.emailTemplates.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = async (delivery: FailedShipmentEmailDelivery) => {
    const confirmed = window.confirm(
      t("superAdmin.emailTemplates.failedEmails.confirmRetry", {
        email: delivery.recipient_email,
      }),
    );
    if (!confirmed) return;

    setRetryingDeliveryId(delivery.id);
    try {
      await retryFailedShipmentEmailDelivery(delivery.id);
      setFailedDeliveries((current) =>
        current.filter((item) => item.id !== delivery.id),
      );
      showToast(
        "success",
        t("superAdmin.emailTemplates.failedEmails.retryStarted"),
      );
    } catch {
      showToast(
        "error",
        t("superAdmin.emailTemplates.failedEmails.retryFailed"),
      );
    } finally {
      setRetryingDeliveryId(null);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          role="status"
          className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-cyan-50 p-3 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">
              {t("superAdmin.emailTemplates.title")}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("superAdmin.emailTemplates.description")}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="px-2 pb-3 text-sm font-black text-gray-900 dark:text-white">
            {t("superAdmin.emailTemplates.list")}
          </h2>
          {loading ? (
            <p className="px-2 py-6 text-sm text-gray-500">
              {t("common.loading")}
            </p>
          ) : templates.length === 0 ? (
            <p className="px-2 py-6 text-sm text-gray-500">
              {t("superAdmin.emailTemplates.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.template_key}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedKey === template.template_key
                      ? "border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-100"
                      : "border-transparent bg-gray-50 text-gray-700 hover:border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-gray-700"
                  }`}
                >
                  <span className="block text-sm font-bold">
                    {template.display_name}
                  </span>
                  <span className="mt-1 block truncate text-xs opacity-70">
                    {template.template_key}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {!selectedTemplate ? (
            <p className="py-12 text-center text-sm text-gray-500">
              {loading
                ? t("common.loading")
                : t("superAdmin.emailTemplates.empty")}
            </p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-gray-900 dark:text-white">
                    {selectedTemplate.display_name}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("superAdmin.emailTemplates.lastUpdated", {
                      date: formatDate(selectedTemplate.updated_at),
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectTemplate(selectedTemplate)}
                    disabled={!hasChanges || saving}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("superAdmin.emailTemplates.discard")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!hasChanges || saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 dark:border-cyan-900 dark:bg-cyan-950/30">
                <p className="text-sm font-bold text-cyan-950 dark:text-cyan-100">
                  {t("superAdmin.emailTemplates.variables")}
                </p>
                <p className="mt-1 text-xs text-cyan-800 dark:text-cyan-300">
                  {t("superAdmin.emailTemplates.variablesDescription")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {shipmentEmailTemplateVariables.map((variable) => (
                    <code
                      key={variable}
                      className="rounded-lg border border-cyan-200 bg-white px-2 py-1 text-xs text-cyan-900 dark:border-cyan-800 dark:bg-gray-950 dark:text-cyan-200"
                    >
                      {`{{${variable}}}`}
                    </code>
                  ))}
                </div>
              </div>

              <TemplateField
                label={t("superAdmin.emailTemplates.subject")}
                value={form.subject_template}
                onChange={(value) => updateField("subject_template", value)}
                maxLength={500}
              />
              <TemplateField
                label={t("superAdmin.emailTemplates.plainText")}
                value={form.text_template}
                onChange={(value) => updateField("text_template", value)}
                multiline
                rows={18}
                maxLength={50000}
              />
              <TemplateField
                label={t("superAdmin.emailTemplates.html")}
                value={form.html_template}
                onChange={(value) => updateField("html_template", value)}
                multiline
                rows={24}
                maxLength={200000}
                monospace
              />
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-6 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  {t("superAdmin.emailTemplates.failedEmails.title")}
                </h2>
                {!failedDeliveriesLoading && (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-700 dark:bg-red-950 dark:text-red-300">
                    {failedDeliveries.length}
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                {t("superAdmin.emailTemplates.failedEmails.description")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadFailedDeliveries()}
            disabled={failedDeliveriesLoading || retryingDeliveryId !== null}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw
              className={`h-4 w-4 ${failedDeliveriesLoading ? "animate-spin" : ""}`}
            />
            {t("superAdmin.emailTemplates.failedEmails.refresh")}
          </button>
        </div>

        {failedDeliveriesLoading ? (
          <p className="p-8 text-center text-sm text-gray-500">
            {t("common.loading")}
          </p>
        ) : failedDeliveries.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="rounded-full bg-emerald-50 p-4 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-bold text-gray-700 dark:text-gray-300">
              {t("superAdmin.emailTemplates.failedEmails.empty")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">
                    {t("superAdmin.emailTemplates.failedEmails.recipient")}
                  </th>
                  <th className="px-5 py-3">
                    {t("superAdmin.emailTemplates.failedEmails.shipment")}
                  </th>
                  <th className="px-5 py-3">
                    {t("superAdmin.emailTemplates.failedEmails.attempts")}
                  </th>
                  <th className="px-5 py-3">
                    {t("superAdmin.emailTemplates.failedEmails.error")}
                  </th>
                  <th className="px-5 py-3">
                    {t("superAdmin.emailTemplates.failedEmails.lastAttempt")}
                  </th>
                  <th className="px-5 py-3 text-right">
                    {t("superAdmin.emailTemplates.failedEmails.action")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {failedDeliveries.map((delivery) => (
                  <tr key={delivery.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-4 font-bold text-gray-900 dark:text-white">
                      {delivery.recipient_email}
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      <p className="font-bold text-gray-900 dark:text-white">
                        {delivery.awb_bl_number || "-"}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-xs">
                        {formatStatus(delivery.previous_status)} →{" "}
                        {formatStatus(delivery.current_status)}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-xs text-gray-400">
                        {delivery.origin || "-"} → {delivery.destination || "-"}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-bold text-red-700 dark:text-red-300">
                      {delivery.attempts}
                    </td>
                    <td className="max-w-sm px-5 py-4 text-xs text-red-700 dark:text-red-300">
                      <p className="break-words">
                        {delivery.last_error ||
                          t(
                            "superAdmin.emailTemplates.failedEmails.unknownError",
                          )}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(delivery.updated_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleRetry(delivery)}
                        disabled={retryingDeliveryId !== null}
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RotateCcw
                          className={`h-3.5 w-3.5 ${retryingDeliveryId === delivery.id ? "animate-spin" : ""}`}
                        />
                        {retryingDeliveryId === delivery.id
                          ? t("superAdmin.emailTemplates.failedEmails.retrying")
                          : t("superAdmin.emailTemplates.failedEmails.retry")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateField({
  label,
  value,
  onChange,
  multiline = false,
  rows,
  maxLength,
  monospace = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  maxLength: number;
  monospace?: boolean;
}) {
  const className = `mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-cyan-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:focus:border-cyan-700 ${
    monospace ? "font-mono" : ""
  }`;

  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          maxLength={maxLength}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          className={className}
        />
      )}
      <span className="mt-1 block text-right text-xs text-gray-400">
        {value.length.toLocaleString()} / {maxLength.toLocaleString()}
      </span>
    </label>
  );
}

function templateToForm(template: EmailTemplate): EmailTemplateForm {
  return {
    subject_template: template.subject_template,
    text_template: template.text_template,
    html_template: template.html_template,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(getLocale() === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return statusLabels[value as keyof typeof statusLabels] ?? value;
}
