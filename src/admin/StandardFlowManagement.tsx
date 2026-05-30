import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle, Plus, Save, XCircle } from "lucide-react";
import TableActionButton from "../components/TableActionButton";
import { t } from "../lib/i18n";
import {
  createShipmentTrackingEventTemplate,
  fetchAllShipmentTrackingEventTemplates,
  ShipmentTrackingEventTemplate,
  ShipmentTrackingEventTemplateForm,
  statusBadgeClasses,
  statusLabels,
  updateShipmentTrackingEventTemplate,
  type ShipmentStatus,
} from "../lib/shipmentJobs";

const emptyTemplateForm: ShipmentTrackingEventTemplateForm = {
  name: "",
  description: "",
  sort_order: 10,
  is_active: true,
  color_hex: "#0891b2",
};

export default function StandardFlowManagement() {
  const [templates, setTemplates] = useState<ShipmentTrackingEventTemplate[]>(
    [],
  );
  const [drafts, setDrafts] = useState<
    Record<string, ShipmentTrackingEventTemplateForm>
  >({});
  const [newTemplate, setNewTemplate] = useState(emptyTemplateForm);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const nextTemplates = await fetchAllShipmentTrackingEventTemplates();
      setTemplates(nextTemplates);
      setDrafts(buildDrafts(nextTemplates));
    } catch {
      showToast("error", t("superAdmin.standardFlow.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort(
        (first, second) =>
          first.sort_order - second.sort_order ||
          first.created_at.localeCompare(second.created_at),
      ),
    [templates],
  );

  const updateDraft = <Key extends keyof ShipmentTrackingEventTemplateForm>(
    id: string,
    key: Key,
    value: ShipmentTrackingEventTemplateForm[Key],
  ) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [key]: value,
      },
    }));
  };

  const handleSave = async (template: ShipmentTrackingEventTemplate) => {
    const draft = drafts[template.id];
    if (!isValidTemplateForm(draft)) {
      showToast("error", t("superAdmin.standardFlow.validationFailed"));
      return;
    }

    setSavingId(template.id);
    try {
      const updatedTemplate = await updateShipmentTrackingEventTemplate(
        template.id,
        draft,
      );
      setTemplates((current) =>
        current.map((item) =>
          item.id === updatedTemplate.id ? updatedTemplate : item,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [updatedTemplate.id]: templateToForm(updatedTemplate),
      }));
      showToast("success", t("superAdmin.standardFlow.updated"));
    } catch {
      showToast("error", t("superAdmin.standardFlow.updateFailed"));
    } finally {
      setSavingId(null);
    }
  };

  const handleCreate = async () => {
    if (!isValidTemplateForm(newTemplate)) {
      showToast("error", t("superAdmin.standardFlow.validationFailed"));
      return;
    }

    setCreating(true);
    try {
      const createdTemplate =
        await createShipmentTrackingEventTemplate(newTemplate);
      setTemplates((current) => [...current, createdTemplate]);
      setDrafts((current) => ({
        ...current,
        [createdTemplate.id]: templateToForm(createdTemplate),
      }));
      setNewTemplate({
        ...emptyTemplateForm,
        sort_order: newTemplate.sort_order + 10,
      });
      showToast("success", t("superAdmin.standardFlow.created"));
    } catch {
      showToast("error", t("superAdmin.standardFlow.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-[200] flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("superAdmin.standardFlow.title")}
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t("superAdmin.standardFlow.description")}
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
          {t("superAdmin.standardFlow.add")}
        </h3>
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,300px)_minmax(240px,0.8fr)_110px_76px_92px_92px] lg:items-end">
          <TemplateTextField
            label={t("superAdmin.standardFlow.key")}
            value={newTemplate.name}
            onChange={(value) =>
              setNewTemplate((current) => ({ ...current, name: value }))
            }
          />
          <TemplateTextField
            label={t("superAdmin.standardFlow.templateText")}
            value={newTemplate.description}
            onChange={(value) =>
              setNewTemplate((current) => ({
                ...current,
                description: value,
              }))
            }
          />
          <TemplateNumberField
            label={t("superAdmin.standardFlow.order")}
            value={newTemplate.sort_order}
            onChange={(value) =>
              setNewTemplate((current) => ({
                ...current,
                sort_order: value,
              }))
            }
          />
          <TemplateColorField
            label={t("superAdmin.standardFlow.color")}
            value={newTemplate.color_hex}
            onChange={(value) =>
              setNewTemplate((current) => ({
                ...current,
                color_hex: value,
              }))
            }
          />
          <TemplateCheckbox
            label={t("superAdmin.standardFlow.active")}
            checked={newTemplate.is_active}
            onChange={(checked) =>
              setNewTemplate((current) => ({
                ...current,
                is_active: checked,
              }))
            }
          />
          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            className="inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
          >
            <Plus className="h-4 w-4" />
            {creating ? t("common.saving") : t("common.create")}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {t("superAdmin.standardFlow.list")}
          </h3>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-gray-500 dark:text-gray-400">
            {t("common.loading")}
          </div>
        ) : sortedTemplates.length === 0 ? (
          <div className="p-5 text-sm text-gray-500 dark:text-gray-400">
            {t("superAdmin.standardFlow.noTemplates")}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {sortedTemplates.map((template) => {
              const draft = drafts[template.id] ?? templateToForm(template);
              return (
                <div
                  key={template.id}
                  className="grid gap-3 p-5 xl:grid-cols-[300px_minmax(260px,0.8fr)_110px_76px_92px_92px] xl:items-end"
                >
                  <TemplateTextField
                    label={t("superAdmin.standardFlow.key")}
                    value={draft.name}
                    onChange={(value) =>
                      updateDraft(template.id, "name", value)
                    }
                    helper={
                      <StatusPreview name={draft.name} color={draft.color_hex} />
                    }
                    inlineHelper
                  />
                  <TemplateTextField
                    label={t("superAdmin.standardFlow.templateText")}
                    value={draft.description}
                    onChange={(value) =>
                      updateDraft(template.id, "description", value)
                    }
                  />
                  <TemplateNumberField
                    label={t("superAdmin.standardFlow.order")}
                    value={draft.sort_order}
                    onChange={(value) =>
                      updateDraft(template.id, "sort_order", value)
                    }
                  />
                  <TemplateColorField
                    label={t("superAdmin.standardFlow.color")}
                    value={draft.color_hex}
                    onChange={(value) =>
                      updateDraft(template.id, "color_hex", value)
                    }
                  />
                  <TemplateCheckbox
                    label={t("superAdmin.standardFlow.active")}
                    checked={draft.is_active}
                    onChange={(checked) =>
                      updateDraft(template.id, "is_active", checked)
                    }
                  />
                  <TableActionButton
                    variant="primary"
                    icon={<Save className="h-3.5 w-3.5" />}
                    className="h-[42px] w-full"
                    disabled={savingId === template.id}
                    onClick={() => void handleSave(template)}
                  >
                    {savingId === template.id
                      ? t("common.saving")
                      : t("common.save")}
                  </TableActionButton>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateTextField({
  label,
  value,
  helper,
  inlineHelper = false,
  onChange,
}: {
  label: string;
  value: string;
  helper?: ReactNode;
  inlineHelper?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div
        className={
          inlineHelper
            ? "mt-2 flex items-center gap-2"
            : "mt-2"
        }
      >
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
        />
        {helper && (
          <div className={inlineHelper ? "shrink-0" : "mt-2"}>{helper}</div>
        )}
      </div>
    </label>
  );
}

function TemplateNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
      />
    </label>
  );
}

function TemplateColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalizedColor = normalizeColorInput(value);

  return (
    <label className="block">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div
        className="mt-2 flex h-[42px] items-center justify-center rounded-xl border border-gray-300 bg-white px-2 dark:border-gray-700 dark:bg-gray-800"
        title={value}
      >
        <input
          type="color"
          value={normalizedColor}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </div>
    </label>
  );
}

function TemplateCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
      />
      {label}
    </label>
  );
}

function StatusPreview({ name, color }: { name: string; color: string }) {
  if (!isShipmentStatus(name)) {
    return null;
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusBadgeClasses[name]}`}
      style={getStatusPreviewStyle(color)}
    >
      {statusLabels[name]}
    </span>
  );
}

function templateToForm(
  template: ShipmentTrackingEventTemplate,
): ShipmentTrackingEventTemplateForm {
  return {
    name: template.name,
    description: template.description,
    sort_order: template.sort_order,
    is_active: template.is_active,
    color_hex: template.color_hex ?? getDefaultStatusColor(template.name),
  };
}

function buildDrafts(templates: ShipmentTrackingEventTemplate[]) {
  return Object.fromEntries(
    templates.map((template) => [template.id, templateToForm(template)]),
  );
}

function isValidTemplateForm(
  form: ShipmentTrackingEventTemplateForm | undefined,
) {
  return Boolean(
    form &&
      form.name.trim() &&
      form.description.trim() &&
      /^#[0-9a-f]{6}$/i.test(form.color_hex.trim()) &&
      Number.isFinite(form.sort_order),
  );
}

function isShipmentStatus(value: string): value is ShipmentStatus {
  return value in statusLabels;
}

function normalizeColorInput(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#0891b2";
}

function getStatusPreviewStyle(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    return undefined;
  }

  return {
    backgroundColor: `${value}1a`,
    borderColor: `${value}66`,
    color: value,
  };
}

function getDefaultStatusColor(name: string) {
  const defaultColors: Record<string, string> = {
    pickup: "#0284c7",
    warehouse_in: "#2563eb",
    customs_origin: "#d97706",
    terminal_in: "#4f46e5",
    departure: "#7c3aed",
    arrival: "#0891b2",
    customs_destination: "#e11d48",
    destination_warehouse_in: "#0d9488",
    delivery: "#65a30d",
    delivered: "#059669",
  };

  return defaultColors[name] ?? "#0891b2";
}
