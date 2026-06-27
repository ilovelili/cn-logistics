import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  Edit3,
  Plus,
  Save,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import TableActionButton from "../components/TableActionButton";
import TableColumnSettingsButton from "../components/TableColumnSettings";
import TableScrollToTopButton from "../components/TableScrollToTopButton";
import StickyTableHeaderToggle from "../components/StickyTableHeaderToggle";
import { useStickyTableHeaderPreference } from "../components/useStickyTableHeaderPreference";
import { useTableColumnSettings } from "../components/useTableColumnSettings";
import { t } from "../lib/i18n";
import {
  createShipmentTrackingEventTemplate,
  fetchAllShipmentTrackingEventTemplates,
  ShipmentTrackingEventTemplate,
  ShipmentTrackingEventTemplateForm,
  softDeleteShipmentTrackingEventTemplate,
  statusBadgeClasses,
  statusLabels,
  updateShipmentTrackingEventTemplate,
  type ShipmentStatus,
} from "../lib/shipmentJobs";

const defaultFlowName = "door_to_door";

const emptyTemplateForm: ShipmentTrackingEventTemplateForm = {
  flow_name: defaultFlowName,
  name: "",
  description: "",
  sort_order: 10,
  is_active: true,
  color_hex: "",
};

type FlowColumnId = "flow" | "steps" | "active" | "action";

interface FlowSummary {
  flowName: string;
  templates: ShipmentTrackingEventTemplate[];
  activeCount: number;
  totalCount: number;
  firstOrder: number | null;
  lastOrder: number | null;
}

const flowColumns: {
  id: FlowColumnId;
  label: string;
  width: number;
}[] = [
  { id: "flow", label: t("superAdmin.standardFlow.flow"), width: 260 },
  { id: "steps", label: t("superAdmin.standardFlow.stepCount"), width: 130 },
  {
    id: "active",
    label: t("superAdmin.standardFlow.activeStepCount"),
    width: 130,
  },
  { id: "action", label: t("admin.userRegistration.action"), width: 150 },
];

export default function StandardFlowManagement() {
  const [templates, setTemplates] = useState<ShipmentTrackingEventTemplate[]>(
    [],
  );
  const [drafts, setDrafts] = useState<
    Record<string, ShipmentTrackingEventTemplateForm>
  >({});
  const [newTemplate, setNewTemplate] = useState(emptyTemplateForm);
  const [selectedFlowName, setSelectedFlowName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [flowFilter, setFlowFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<ShipmentTrackingEventTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [stickyHeaderEnabled, toggleStickyHeader] =
    useStickyTableHeaderPreference();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const {
    orderedColumns,
    visibleColumns,
    visibleColumnIds,
    setColumnVisibility,
    moveColumn,
    resetColumns,
  } = useTableColumnSettings(
    "super_admin_standard_flow_flow_columns_v1",
    flowColumns.map((column) => ({ id: column.id, label: column.label })),
  );

  const columnsById = new Map(flowColumns.map((column) => [column.id, column]));
  const visibleTableColumns = visibleColumns
    .map((column) => columnsById.get(column.id))
    .filter((column): column is (typeof flowColumns)[number] =>
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
          getTemplateFlowName(first).localeCompare(
            getTemplateFlowName(second),
            "ja",
          ) ||
          first.sort_order - second.sort_order ||
          first.created_at.localeCompare(second.created_at),
      ),
    [templates],
  );

  const flowOptions = useMemo(
    () =>
      [
        ...new Set([
          defaultFlowName,
          ...templates.map((template) => getTemplateFlowName(template)),
        ]),
      ]
        .filter(Boolean)
        .sort((first, second) => first.localeCompare(second, "ja")),
    [templates],
  );

  const flowSummaries = useMemo(
    () => buildFlowSummaries(sortedTemplates),
    [sortedTemplates],
  );

  const filteredFlowSummaries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return flowSummaries.filter((summary) => {
      if (flowFilter !== "all" && summary.flowName !== flowFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        summary.flowName,
        ...summary.templates.flatMap((template) => [
          template.name,
          template.description,
          String(template.sort_order),
          statusLabels[template.name as ShipmentStatus] ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [flowFilter, flowSummaries, query]);

  const selectedFlow = selectedFlowName
    ? (flowSummaries.find((summary) => summary.flowName === selectedFlowName) ??
      null)
    : null;

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
    const draft = drafts[template.id]
      ? {
          ...drafts[template.id],
          flow_name: getTemplateFlowName(template),
        }
      : undefined;
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

  const handleCreate = async (flowName: string) => {
    const form = { ...newTemplate, flow_name: flowName };
    if (!isValidTemplateForm(form)) {
      showToast("error", t("superAdmin.standardFlow.validationFailed"));
      return;
    }

    setCreating(true);
    try {
      const createdTemplate = await createShipmentTrackingEventTemplate(form);
      setTemplates((current) => [...current, createdTemplate]);
      setDrafts((current) => ({
        ...current,
        [createdTemplate.id]: templateToForm(createdTemplate),
      }));
      setNewTemplate({
        ...emptyTemplateForm,
        flow_name: flowName,
        sort_order: form.sort_order + 10,
      });
      showToast("success", t("superAdmin.standardFlow.created"));
    } catch {
      showToast("error", t("superAdmin.standardFlow.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setDeletingId(deleteTarget.id);
    try {
      await softDeleteShipmentTrackingEventTemplate(deleteTarget.id);
      setTemplates((current) =>
        current.filter((template) => template.id !== deleteTarget.id),
      );
      setDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[deleteTarget.id];
        return nextDrafts;
      });
      showToast("success", t("superAdmin.standardFlow.deleted"));
      setDeleteTarget(null);
    } catch {
      showToast("error", t("superAdmin.standardFlow.deleteFailed"));
    } finally {
      setDeletingId(null);
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

      {deleteTarget && (
        <StandardFlowDeleteConfirmModal
          template={deleteTarget}
          deleting={deletingId === deleteTarget.id}
          onCancel={() => {
            if (!deletingId) {
              setDeleteTarget(null);
            }
          }}
          onConfirm={() => void handleDeleteConfirm()}
        />
      )}

      {selectedFlow && (
        <StandardFlowStepsModal
          flow={selectedFlow}
          drafts={drafts}
          newTemplate={newTemplate}
          creating={creating}
          savingId={savingId}
          deletingId={deletingId}
          onNewTemplateChange={setNewTemplate}
          onDraftChange={updateDraft}
          onCreate={handleCreate}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onClose={() => setSelectedFlowName(null)}
        />
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          <span data-tutorial-target="standard-flow-page">
            {t("superAdmin.standardFlow.title")}
          </span>
        </h2>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-black text-gray-900 dark:text-white">
            {t("superAdmin.standardFlow.list")}
          </h3>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <label className="relative block w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("superAdmin.standardFlow.searchPlaceholder")}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
              />
            </label>
            <select
              value={flowFilter}
              onChange={(event) => setFlowFilter(event.target.value)}
              className="min-w-44 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold text-gray-900 outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-white"
            >
              <option value="all">
                {t("superAdmin.standardFlow.allFlows")}
              </option>
              {flowOptions.map((flowName) => (
                <option key={flowName} value={flowName}>
                  {flowName}
                </option>
              ))}
            </select>
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

        <div className="relative">
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
                  {visibleTableColumns.map((column, index) => (
                    <th
                      key={column.id}
                      className={`py-3 pr-4 font-bold ${
                        index === 0
                          ? "sticky left-0 z-30 bg-white pl-4 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)] dark:bg-gray-900"
                          : ""
                      } ${index === visibleTableColumns.length - 1 ? "pr-5" : ""}`}
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
                ) : filteredFlowSummaries.length === 0 ? (
                  <tr>
                    <td
                      className="py-8 text-center text-gray-500"
                      colSpan={visibleTableColumns.length}
                    >
                      {t("superAdmin.standardFlow.noTemplates")}
                    </td>
                  </tr>
                ) : (
                  filteredFlowSummaries.map((flow) => (
                    <tr key={flow.flowName}>
                      {visibleTableColumns.map((column, index) => (
                        <td
                          key={column.id}
                          className={`py-4 pr-4 align-middle ${
                            index === 0
                              ? "sticky left-0 z-10 bg-white pl-4 shadow-[8px_0_16px_-16px_rgba(15,23,42,0.45)] dark:bg-gray-900"
                              : ""
                          } ${index === visibleTableColumns.length - 1 ? "pr-5" : ""}`}
                        >
                          {renderFlowCell(column.id, flow, () =>
                            setSelectedFlowName(flow.flowName),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TableScrollToTopButton
            adminTheme
            onClick={() =>
              tableScrollRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
          />
        </div>
      </section>
    </div>
  );
}

function renderFlowCell(
  columnId: FlowColumnId,
  flow: FlowSummary,
  onEdit: () => void,
) {
  switch (columnId) {
    case "flow":
      return (
        <span className="font-black text-gray-900 dark:text-white">
          {flow.flowName}
        </span>
      );
    case "steps":
      return (
        <span className="font-bold text-gray-700 dark:text-gray-300">
          {flow.totalCount}
        </span>
      );
    case "active":
      return (
        <span className="font-bold text-gray-700 dark:text-gray-300">
          {flow.activeCount} / {flow.totalCount}
        </span>
      );
    case "action":
      return (
        <TableActionButton
          variant="primary"
          icon={<Edit3 className="h-3.5 w-3.5" />}
          onClick={onEdit}
        >
          {t("common.edit")}
        </TableActionButton>
      );
    default:
      return null;
  }
}

function StandardFlowStepsModal({
  flow,
  drafts,
  newTemplate,
  creating,
  savingId,
  deletingId,
  onNewTemplateChange,
  onDraftChange,
  onCreate,
  onSave,
  onDelete,
  onClose,
}: {
  flow: FlowSummary;
  drafts: Record<string, ShipmentTrackingEventTemplateForm>;
  newTemplate: ShipmentTrackingEventTemplateForm;
  creating: boolean;
  savingId: string | null;
  deletingId: string | null;
  onNewTemplateChange: (form: ShipmentTrackingEventTemplateForm) => void;
  onDraftChange: <Key extends keyof ShipmentTrackingEventTemplateForm>(
    id: string,
    key: Key,
    value: ShipmentTrackingEventTemplateForm[Key],
  ) => void;
  onCreate: (flowName: string) => Promise<void>;
  onSave: (template: ShipmentTrackingEventTemplate) => Promise<void>;
  onDelete: (template: ShipmentTrackingEventTemplate) => void;
  onClose: () => void;
}) {
  const nextSortOrder =
    flow.lastOrder === null ? 10 : Math.ceil(flow.lastOrder / 10) * 10 + 10;
  const stepForm =
    newTemplate.flow_name === flow.flowName
      ? newTemplate
      : {
          ...emptyTemplateForm,
          flow_name: flow.flowName,
          sort_order: nextSortOrder,
        };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              {flow.flowName}
            </h3>
            <p className="mt-1 text-sm font-bold text-gray-500 dark:text-gray-400">
              {flow.activeCount} / {flow.totalCount}{" "}
              {t("superAdmin.standardFlow.active")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label={t("jobs.detail.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <section className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
          <h4 className="mb-4 font-semibold text-gray-900 dark:text-white">
            {t("superAdmin.standardFlow.add")}
          </h4>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,280px)_minmax(240px,1fr)_110px_92px_170px] lg:items-end">
            <TemplateTextField
              label={t("superAdmin.standardFlow.key")}
              value={stepForm.name}
              onChange={(value) =>
                onNewTemplateChange({ ...stepForm, name: value })
              }
            />
            <TemplateTextField
              label={t("superAdmin.standardFlow.templateText")}
              value={stepForm.description}
              onChange={(value) =>
                onNewTemplateChange({ ...stepForm, description: value })
              }
            />
            <TemplateNumberField
              label={t("superAdmin.standardFlow.order")}
              value={stepForm.sort_order}
              onChange={(value) =>
                onNewTemplateChange({ ...stepForm, sort_order: value })
              }
            />
            <TemplateCheckbox
              label={t("superAdmin.standardFlow.active")}
              checked={stepForm.is_active}
              onChange={(checked) =>
                onNewTemplateChange({ ...stepForm, is_active: checked })
              }
            />
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCreate(flow.flowName)}
              className="inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
            >
              <Plus className="h-4 w-4" />
              {creating ? t("common.saving") : t("common.create")}
            </button>
          </div>
        </section>

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[900px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[140px]" />
              <col className="w-[220px]" />
              <col />
              <col className="w-[110px]" />
              <col className="w-[100px]" />
              <col className="w-[190px]" />
            </colgroup>
            <thead className="bg-white dark:bg-gray-900">
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="px-4 py-3 font-bold">
                  {t("superAdmin.standardFlow.status")}
                </th>
                <th className="px-4 py-3 font-bold">
                  {t("superAdmin.standardFlow.key")}
                </th>
                <th className="px-4 py-3 font-bold">
                  {t("superAdmin.standardFlow.templateText")}
                </th>
                <th className="px-4 py-3 font-bold">
                  {t("superAdmin.standardFlow.order")}
                </th>
                <th className="px-4 py-3 font-bold">
                  {t("superAdmin.standardFlow.active")}
                </th>
                <th className="px-4 py-3 font-bold">
                  {t("admin.userRegistration.action")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {flow.templates.map((template) => {
                const draft = drafts[template.id] ?? templateToForm(template);
                return (
                  <tr key={template.id}>
                    <td className="px-4 py-4 align-middle">
                      <StatusPreview name={draft.name} />
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <TemplateTextField
                        label={t("superAdmin.standardFlow.key")}
                        value={draft.name}
                        onChange={(value) =>
                          onDraftChange(template.id, "name", value)
                        }
                        hideLabel
                      />
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <TemplateTextField
                        label={t("superAdmin.standardFlow.templateText")}
                        value={draft.description}
                        onChange={(value) =>
                          onDraftChange(template.id, "description", value)
                        }
                        hideLabel
                      />
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <TemplateNumberField
                        label={t("superAdmin.standardFlow.order")}
                        value={draft.sort_order}
                        onChange={(value) =>
                          onDraftChange(template.id, "sort_order", value)
                        }
                        hideLabel
                      />
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <TemplateCheckbox
                        label={t("superAdmin.standardFlow.active")}
                        checked={draft.is_active}
                        onChange={(checked) =>
                          onDraftChange(template.id, "is_active", checked)
                        }
                        compact
                      />
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex items-center gap-2">
                        <TableActionButton
                          variant="primary"
                          icon={<Save className="h-3.5 w-3.5" />}
                          disabled={
                            savingId === template.id ||
                            deletingId === template.id
                          }
                          onClick={() => void onSave(template)}
                        >
                          {savingId === template.id
                            ? t("common.saving")
                            : t("common.save")}
                        </TableActionButton>
                        <TableActionButton
                          variant="danger"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          disabled={
                            savingId === template.id ||
                            deletingId === template.id
                          }
                          onClick={() => onDelete(template)}
                        >
                          {deletingId === template.id
                            ? t("common.saving")
                            : t("common.delete")}
                        </TableActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TemplateTextField({
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
  return (
    <label className="block">
      {!hideLabel && (
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${hideLabel ? "" : "mt-2"} w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-800`}
      />
    </label>
  );
}

function StandardFlowDeleteConfirmModal({
  template,
  deleting,
  onCancel,
  onConfirm,
}: {
  template: ShipmentTrackingEventTemplate;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          {t("superAdmin.standardFlow.confirmDeleteTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("superAdmin.standardFlow.confirmDelete")}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
          <div className="font-bold text-gray-900 dark:text-white">
            {statusLabels[template.name as ShipmentStatus] ?? template.name}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {getTemplateFlowName(template)}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {template.description}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? t("common.saving") : t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
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

function StatusPreview({ name }: { name: string }) {
  if (!isShipmentStatus(name)) {
    return null;
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusBadgeClasses[name]}`}
    >
      {statusLabels[name]}
    </span>
  );
}

function buildFlowSummaries(templates: ShipmentTrackingEventTemplate[]) {
  const templatesByFlow = templates.reduce<
    Record<string, ShipmentTrackingEventTemplate[]>
  >((groups, template) => {
    const flowName = getTemplateFlowName(template);
    groups[flowName] = [...(groups[flowName] ?? []), template];
    return groups;
  }, {});

  return Object.entries(templatesByFlow)
    .map(([flowName, flowTemplates]): FlowSummary => {
      const sortedFlowTemplates = [...flowTemplates].sort(
        (first, second) =>
          first.sort_order - second.sort_order ||
          first.created_at.localeCompare(second.created_at),
      );
      const orders = sortedFlowTemplates.map((template) => template.sort_order);

      return {
        flowName,
        templates: sortedFlowTemplates,
        activeCount: sortedFlowTemplates.filter(
          (template) => template.is_active,
        ).length,
        totalCount: sortedFlowTemplates.length,
        firstOrder: orders[0] ?? null,
        lastOrder: orders[orders.length - 1] ?? null,
      };
    })
    .sort((first, second) =>
      first.flowName.localeCompare(second.flowName, "ja"),
    );
}

function templateToForm(
  template: ShipmentTrackingEventTemplate,
): ShipmentTrackingEventTemplateForm {
  return {
    name: template.name,
    flow_name: getTemplateFlowName(template),
    description: template.description,
    sort_order: template.sort_order,
    is_active: template.is_active,
    color_hex: template.color_hex ?? "",
  };
}

function buildDrafts(templates: ShipmentTrackingEventTemplate[]) {
  return Object.fromEntries(
    templates.map((template) => [template.id, templateToForm(template)]),
  );
}

function isValidTemplateForm(
  form: ShipmentTrackingEventTemplateForm | undefined,
): form is ShipmentTrackingEventTemplateForm {
  return Boolean(
    form &&
    form.flow_name.trim() &&
    form.name.trim() &&
    form.description.trim() &&
    Number.isFinite(form.sort_order),
  );
}

function getTemplateFlowName(template: ShipmentTrackingEventTemplate) {
  return template.flow_name || defaultFlowName;
}

function isShipmentStatus(value: string): value is ShipmentStatus {
  return value in statusLabels;
}
