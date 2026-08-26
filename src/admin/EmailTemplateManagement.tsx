import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Code2,
  Eye,
  Info,
  Mail,
  RefreshCw,
  Save,
  XCircle,
} from "lucide-react";
import {
  EmailTemplate,
  EmailTemplateForm,
  fetchEmailTemplates,
  getEmailTemplateVariables,
  updateEmailTemplate,
} from "../lib/emailTemplates";
import { getLocale, t } from "../lib/i18n";
import AdminPageHeader from "./AdminPageHeader";

const emptyForm: EmailTemplateForm = {
  subject_template: "",
  text_template: "",
  html_template: "",
};

export default function EmailTemplateManagement() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [form, setForm] = useState<EmailTemplateForm>(emptyForm);
  const [htmlTab, setHtmlTab] = useState<"source" | "preview">("source");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    void loadTemplates();
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

      <AdminPageHeader
        icon={Mail}
        title={t("superAdmin.emailTemplates.title")}
        description={t("superAdmin.emailTemplates.description")}
      />

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
                  {getEmailTemplateVariables(selectedTemplate.template_key).map(
                    (variable) => (
                      <code
                        key={variable}
                        className="rounded-lg border border-cyan-200 bg-white px-2 py-1 text-xs text-cyan-900 dark:border-cyan-800 dark:bg-gray-950 dark:text-cyan-200"
                      >
                        {`{{${variable}}}`}
                      </code>
                    ),
                  )}
                </div>
              </div>

              <TemplateField
                label={t("superAdmin.emailTemplates.subject")}
                value={form.subject_template}
                onChange={(value) => updateField("subject_template", value)}
                maxLength={500}
              />
              <HtmlTemplateField
                value={form.html_template}
                onChange={(value) => updateField("html_template", value)}
                activeTab={htmlTab}
                onTabChange={setHtmlTab}
              />
              <TemplateField
                label={t("superAdmin.emailTemplates.plainText")}
                tooltip={t("superAdmin.emailTemplates.plainTextTooltip")}
                value={form.text_template}
                onChange={(value) => updateField("text_template", value)}
                multiline
                rows={18}
                maxLength={50000}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HtmlTemplateField({
  value,
  onChange,
  activeTab,
  onTabChange,
}: {
  value: string;
  onChange: (value: string) => void;
  activeTab: "source" | "preview";
  onTabChange: (tab: "source" | "preview") => void;
}) {
  return (
    <div>
      <div
        role="tablist"
        aria-label={t("superAdmin.emailTemplates.html")}
        className="flex w-fit rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-950"
      >
        <button
          type="button"
          role="tab"
          id="html-source-tab"
          aria-selected={activeTab === "source"}
          aria-controls="html-source-panel"
          onClick={() => onTabChange("source")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
            activeTab === "source"
              ? "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-white"
              : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          }`}
        >
          <Code2 className="h-4 w-4" />
          {t("superAdmin.emailTemplates.html")}
        </button>
        <button
          type="button"
          role="tab"
          id="html-preview-tab"
          aria-selected={activeTab === "preview"}
          aria-controls="html-preview-panel"
          onClick={() => onTabChange("preview")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
            activeTab === "preview"
              ? "bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-white"
              : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          }`}
        >
          <Eye className="h-4 w-4" />
          {t("superAdmin.emailTemplates.htmlPreview")}
        </button>
      </div>

      {activeTab === "source" ? (
        <div
          role="tabpanel"
          id="html-source-panel"
          aria-labelledby="html-source-tab"
        >
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={24}
            maxLength={200000}
            aria-label={t("superAdmin.emailTemplates.html")}
            className="mt-2 w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-900 outline-none transition focus:border-cyan-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:focus:border-cyan-700"
          />
          <span className="mt-1 block text-right text-xs text-gray-400">
            {value.length.toLocaleString()} / {Number(200000).toLocaleString()}
          </span>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="html-preview-panel"
          aria-labelledby="html-preview-tab"
          className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800"
        >
          <iframe
            title={t("superAdmin.emailTemplates.htmlPreviewTitle")}
            srcDoc={value}
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-[680px] w-full bg-white"
          />
        </div>
      )}
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
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  maxLength: number;
  monospace?: boolean;
  tooltip?: string;
}) {
  const className = `mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-cyan-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:focus:border-cyan-700 ${
    monospace ? "font-mono" : ""
  }`;

  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800 dark:text-gray-200">
        <span>{label}</span>
        {tooltip && (
          <span
            tabIndex={0}
            aria-label={tooltip}
            className="group relative inline-flex cursor-help text-gray-400 outline-none focus-visible:text-cyan-600 dark:text-gray-500 dark:focus-visible:text-cyan-300"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-slate-100 dark:text-slate-950"
            >
              {tooltip}
            </span>
          </span>
        )}
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
