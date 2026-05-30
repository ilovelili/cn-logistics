import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle, Plus, Save, Search, XCircle } from "lucide-react";
import TableActionButton from "../components/TableActionButton";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import StickyTableHeaderToggle from "../components/StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "../components/useStickyTableHeaderPreference";
import { useTableColumnSettings } from "../components/useTableColumnSettings";
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

type StandardFlowColumnId =
  | "key"
  | "status"
  | "order"
  | "color"
  | "active"
  | "action";

const standardFlowColumns: {
  id: StandardFlowColumnId;
  label: string;
  width: number;
}[] = [
  { id: "key", label: t("superAdmin.standardFlow.key"), width: 300 },
  { id: "status", label: t("superAdmin.standardFlow.templateText"), width: 320 },
  { id: "order", label: t("superAdmin.standardFlow.order"), width: 110 },
  { id: "color", label: t("superAdmin.standardFlow.color"), width: 76 },
  { id: "active", label: t("superAdmin.standardFlow.active"), width: 92 },
  { id: "action", label: t("admin.userRegistration.action"), width: 92 },
];

export default function StandardFlowManagement() {
  const [templates, setTemplates] = useState<ShipmentTrackingEventTemplate[]>(
    [],
  );
  const [drafts, setDrafts] = useState<
    Record<string, ShipmentTrackingEventTemplateForm>
  >({});
  const [newTemplate, setNewTemplate] = useState(emptyTemplateForm);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    "super_admin_standard_flow_table_columns_v1",
    standardFlowColumns.map((column) => ({
      id: column.id,
      label: column.label,
    })),
  );
  const columnsById = new Map(
    standardFlowColumns.map((column) => [column.id, column]),
  );
  const visibleTableColumns = visibleColumns
    .map((column) => columnsById.get(column.id))
    .filter((column): column is (typeof standardFlowColumns)[number] =>
      Boolean(column),
    );
  const orderedColumnConfigs = orderedColumns.map((column) => ({
    id: column.id,
    label: column.label,
  }));
  const tableMinWidth = visibleTableColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

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
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sortedTemplates;

    return sortedTemplates.filter((template) => {
      const draft = drafts[template.id] ?? templateToForm(template);
      return [
        draft.name,
        draft.description,
        String(draft.sort_order),
        draft.color_hex,
        statusLabels[draft.name as ShipmentStatus] ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [drafts, query, sortedTemplates]);

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
        <div className="flex flex-col gap-4 border-b border-gray-200 p-5 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {t("superAdmin.standardFlow.list")}
          </h3>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:max-w-2xl">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("superAdmin.standardFlow.searchPlaceholder")}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
              />
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <StickyTableHeaderToggle
                adminTheme
                enabled={stickyHeaderEnabled}
                onToggle={toggleStickyHeader}
              />
              <TableColumnSettingsButton
                adminTheme
                columns={orderedColumnConfigs}
                visibleColumnIds={visibleColumnIds}
                onVisibilityChange={setColumnVisibility}
                onMoveColumn={moveColumn}
                onReset={resetColumns}
              />
            </div>
          </div>
        </div>

        <div
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
                {visibleTableColumns.map((column, index) => (
                  <th
                    key={column.id}
                    className={`py-3 pr-4 font-bold ${
                      index === 0 ? "pl-5" : ""
                    } ${
                      index === visibleTableColumns.length - 1 ? "pr-5" : ""
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td
                    className="py-8 text-center text-gray-500"
                    colSpan={visibleTableColumns.length}
                  >
                    {t("common.loading")}
                  </td>
                </tr>
              ) : filteredTemplates.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-gray-500"
                    colSpan={visibleTableColumns.length}
                  >
                    {t("superAdmin.standardFlow.noTemplates")}
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((template) => {
                  const draft = drafts[template.id] ?? templateToForm(template);
                  return (
                    <tr key={template.id}>
                      {visibleTableColumns.map((column, index) => (
                        <td
                          key={column.id}
                          className={`py-4 pr-4 align-middle ${
                            index === 0 ? "pl-5" : ""
                          } ${
                            index === visibleTableColumns.length - 1
                              ? "pr-5"
                              : ""
                          }`}
                        >
                          {renderTemplateCell({
                            columnId: column.id,
                            draft,
                            template,
                            savingId,
                            updateDraft,
                            handleSave,
                          })}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TemplateTextField({
  label,
  value,
  helper,
  inlineHelper = false,
  helperPosition = "after",
  hideLabel = false,
  onChange,
}: {
  label: string;
  value: string;
  helper?: ReactNode;
  inlineHelper?: boolean;
  helperPosition?: "before" | "after";
  hideLabel?: boolean;
  onChange: (value: string) => void;
}) {
  const helperNode = helper ? (
    <div className={inlineHelper ? "shrink-0" : "mt-2"}>{helper}</div>
  ) : null;

  return (
    <label className="block">
      {!hideLabel && (
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
      <div
        className={
          inlineHelper
            ? `${hideLabel ? "" : "mt-2"} flex items-center gap-2`
            : hideLabel
              ? ""
              : "mt-2"
        }
      >
        {helperPosition === "before" && helperNode}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800"
        />
        {helperPosition === "after" && helperNode}
      </div>
    </label>
  );
}

function renderTemplateCell({
  columnId,
  draft,
  template,
  savingId,
  updateDraft,
  handleSave,
}: {
  columnId: StandardFlowColumnId;
  draft: ShipmentTrackingEventTemplateForm;
  template: ShipmentTrackingEventTemplate;
  savingId: string | null;
  updateDraft: <Key extends keyof ShipmentTrackingEventTemplateForm>(
    id: string,
    key: Key,
    value: ShipmentTrackingEventTemplateForm[Key],
  ) => void;
  handleSave: (template: ShipmentTrackingEventTemplate) => Promise<void>;
}) {
  switch (columnId) {
    case "key":
      return (
        <TemplateTextField
          label={t("superAdmin.standardFlow.key")}
          value={draft.name}
          onChange={(value) => updateDraft(template.id, "name", value)}
          helper={<StatusPreview name={draft.name} color={draft.color_hex} />}
          inlineHelper
          helperPosition="before"
          hideLabel
        />
      );
    case "status":
      return (
        <TemplateTextField
          label={t("superAdmin.standardFlow.templateText")}
          value={draft.description}
          onChange={(value) => updateDraft(template.id, "description", value)}
          hideLabel
        />
      );
    case "order":
      return (
        <TemplateNumberField
          label={t("superAdmin.standardFlow.order")}
          value={draft.sort_order}
          onChange={(value) => updateDraft(template.id, "sort_order", value)}
          hideLabel
        />
      );
    case "color":
      return (
        <TemplateColorField
          label={t("superAdmin.standardFlow.color")}
          value={draft.color_hex}
          onChange={(value) => updateDraft(template.id, "color_hex", value)}
          hideLabel
        />
      );
    case "active":
      return (
        <TemplateCheckbox
          label={t("superAdmin.standardFlow.active")}
          checked={draft.is_active}
          onChange={(checked) => updateDraft(template.id, "is_active", checked)}
          compact
        />
      );
    case "action":
      return (
        <TableActionButton
          variant="primary"
          icon={<Save className="h-3.5 w-3.5" />}
          className="h-[42px] w-full"
          disabled={savingId === template.id}
          onClick={() => void handleSave(template)}
        >
          {savingId === template.id ? t("common.saving") : t("common.save")}
        </TableActionButton>
      );
    default:
      return null;
  }
}

function TemplateNumberField({
  label,
  value,
  hideLabel = false,
  onChange,
}: {
  label: string;
  value: number;
  hideLabel?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      {!hideLabel && (
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`${hideLabel ? "" : "mt-2"} w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800`}
      />
    </label>
  );
}

function TemplateColorField({
  label,
  value,
  hideLabel = false,
  onChange,
}: {
  label: string;
  value: string;
  hideLabel?: boolean;
  onChange: (value: string) => void;
}) {
  const normalizedColor = normalizeColorInput(value);

  return (
    <label className="block">
      {!hideLabel && (
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
      <div
        className={`${hideLabel ? "" : "mt-2"} flex h-[42px] items-center justify-center rounded-xl border border-gray-300 bg-white px-2 dark:border-gray-700 dark:bg-gray-800`}
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
  compact = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  compact?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex h-[42px] items-center rounded-xl border border-gray-200 px-3 text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-200 ${
        compact ? "justify-center" : "gap-3"
      }`}
      title={label}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
      />
      {!compact && label}
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
