import * as React from "react";
import { Plus, X } from "lucide-react";
import { t } from "../lib/i18n";
import {
  defaultShipmentJobForm,
  fetchShipmentTrackingEventTemplates,
  ShipmentJob,
  ShipmentJobForm as ShipmentJobFormState,
  ShipmentTrackingEventTemplate,
  statusOptions,
  tradeModeOptions,
  transportModeOptions,
  jobToForm,
} from "../lib/shipmentJobs";
import type { CompanyUser } from "../lib/companyUsers";

interface ShipmentJobFormProps {
  job?: ShipmentJob | null;
  companyOptions?: Pick<CompanyUser, "company_name" | "admin_assignments">[];
  submitLabel: string;
  loading?: boolean;
  onCancel?: () => void;
  onSubmit: (form: ShipmentJobFormState) => Promise<void> | void;
}

export default function ShipmentJobForm({
  job,
  companyOptions = [],
  submitLabel,
  loading = false,
  onCancel,
  onSubmit,
}: ShipmentJobFormProps) {
  const [form, setForm] = useShipmentForm(job);
  const [trackingTemplates, setTrackingTemplates] = React.useState<
    ShipmentTrackingEventTemplate[]
  >([]);

  React.useEffect(() => {
    let active = true;

    fetchShipmentTrackingEventTemplates()
      .then((templates) => {
        if (active) {
          setTrackingTemplates(templates);
        }
      })
      .catch(() => {
        if (active) {
          setTrackingTemplates([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const updateField = <Key extends keyof ShipmentJobFormState>(
    key: Key,
    value: ShipmentJobFormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateCompany = (companyName: string) => {
    const selectedAdminAssignments = getCompanyAdminAssignments(
      companyName,
      companyOptions,
    );
    setForm((current) => ({
      ...current,
      company_name: companyName,
      assigned_admin_user_ids: selectedAdminAssignments.map(
        (assignment) => assignment.admin_user_id,
      ),
    }));
  };

  const availableAdminAssignments = getCompanyAdminAssignments(
    form.company_name,
    companyOptions,
  );

  const toggleAssignedAdmin = (adminUserId: string) => {
    setForm((current) => ({
      ...current,
      assigned_admin_user_ids: current.assigned_admin_user_ids.includes(
        adminUserId,
      )
        ? current.assigned_admin_user_ids.filter((id) => id !== adminUserId)
        : [...current.assigned_admin_user_ids, adminUserId],
    }));
  };

  const updateVesselFlightNumber = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      vessel_flight_numbers: current.vessel_flight_numbers.map(
        (item, itemIndex) => (itemIndex === index ? value : item),
      ),
    }));
  };

  const addVesselFlightNumber = () => {
    setForm((current) => ({
      ...current,
      vessel_flight_numbers: [...current.vessel_flight_numbers, ""],
    }));
  };

  const removeVesselFlightNumber = (index: number) => {
    setForm((current) => {
      const nextNumbers = current.vessel_flight_numbers.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return {
        ...current,
        vessel_flight_numbers: nextNumbers.length > 0 ? nextNumbers : [""],
      };
    });
  };

  const updateTrackingEvent = (
    index: number,
    field: keyof ShipmentJobFormState["tracking_events"][number],
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      tracking_events: current.tracking_events.map((event, eventIndex) =>
        eventIndex === index ? { ...event, [field]: value } : event,
      ),
    }));
  };

  const addTrackingEvent = () => {
    setForm((current) => ({
      ...current,
      tracking_events: [
        ...current.tracking_events,
        { event_date: "", location: "", description: "" },
      ],
    }));
  };

  const addDefaultTrackingFlow = () => {
    setForm((current) => ({
      ...current,
      tracking_events: [
        ...current.tracking_events,
        ...trackingTemplates.map((template) => ({
          event_date: "",
          location: "",
          description: template.description,
        })),
      ],
    }));
  };

  const removeTrackingEvent = (index: number) => {
    setForm((current) => ({
      ...current,
      tracking_events: current.tracking_events.filter(
        (_, eventIndex) => eventIndex !== index,
      ),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(form);
    if (!job) {
      setForm(defaultShipmentJobForm);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {companyOptions.length > 0 ? (
          <SelectField
            label={t("common.companyName")}
            value={form.company_name}
            disabled={Boolean(job)}
            onChange={updateCompany}
            options={[
              { value: "", label: t("form.selectCompany") },
              ...companyOptions.map((company) => ({
                value: company.company_name,
                label: company.company_name,
              })),
            ]}
          />
        ) : (
          <TextField
            label={t("common.companyName")}
            value={form.company_name}
            disabled={Boolean(job)}
            onChange={(value) => updateField("company_name", value)}
          />
        )}
        <SelectField
          label={t("form.status")}
          value={form.status}
          onChange={(value) =>
            updateField("status", value as ShipmentJobFormState["status"])
          }
          options={statusOptions}
        />
        <SelectField
          label={t("form.tradeMode")}
          value={form.trade_mode}
          onChange={(value) =>
            updateField(
              "trade_mode",
              value as ShipmentJobFormState["trade_mode"],
            )
          }
          options={tradeModeOptions}
        />
        <TextField
          label={t("form.tradeTerm")}
          value={form.trade_term}
          onChange={(value) => updateField("trade_term", value)}
          placeholder="CIF / FOB / DDP"
        />
        <SelectField
          label={t("form.transportMode")}
          value={form.transport_mode}
          onChange={(value) =>
            updateField(
              "transport_mode",
              value as ShipmentJobFormState["transport_mode"],
            )
          }
          options={transportModeOptions}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TextField
          label={t("form.invoice")}
          value={form.invoice_number}
          onChange={(value) => updateField("invoice_number", value)}
          placeholder="ABC-123"
        />
        <TextField
          label="MBL/MAWB"
          value={form.mbl_mawb}
          onChange={(value) => updateField("mbl_mawb", value)}
          placeholder="1234567890"
        />
        <TextField
          label="HBL/HAWB"
          value={form.hbl_hawb}
          onChange={(value) => updateField("hbl_hawb", value)}
          placeholder="2345678901"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label={t("form.shipper")}
          value={form.shipper_name}
          onChange={(value) => updateField("shipper_name", value)}
          placeholder="aaa Japan"
        />
        <TextField
          label={t("form.consignee")}
          value={form.consignee_name}
          onChange={(value) => updateField("consignee_name", value)}
          placeholder="bbb USA"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TextField
          label="POL/AOL"
          value={form.pol_aol}
          onChange={(value) => updateField("pol_aol", value)}
          placeholder="Narita / Shanghai"
        />
        <TextField
          label="POD/AOD"
          value={form.pod_aod}
          onChange={(value) => updateField("pod_aod", value)}
          placeholder="NewYork / Tokyo"
        />
        <TextField
          label={t("common.blAwbDate")}
          type="date"
          value={form.bl_awb_date}
          onChange={(value) => updateField("bl_awb_date", value)}
        />
      </div>

      <VesselFlightNumberFields
        values={form.vessel_flight_numbers}
        onAdd={addVesselFlightNumber}
        onRemove={removeVesselFlightNumber}
        onChange={updateVesselFlightNumber}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileUploadField
          label={t("common.documents")}
          existingFiles={splitDocumentNames(form.documents)}
          files={form.document_files}
          onChange={(files) => updateField("document_files", files)}
        />
        <FileUploadField
          label={t("common.internalDocuments")}
          existingFiles={splitDocumentNames(form.internal_documents)}
          files={form.internal_document_files}
          onChange={(files) => updateField("internal_document_files", files)}
        />
      </div>

      <TextAreaField
        label={t("common.notes")}
        value={form.notes}
        onChange={(value) => updateField("notes", value)}
        placeholder={t("form.notesPlaceholder")}
      />

      <AssignedAdminFields
        assignments={availableAdminAssignments}
        selectedAdminIds={form.assigned_admin_user_ids}
        onToggle={toggleAssignedAdmin}
      />

      <TrackingEventFields
        values={form.tracking_events}
        onAdd={addTrackingEvent}
        onAddDefaultFlow={addDefaultTrackingFlow}
        canAddDefaultFlow={trackingTemplates.length > 0}
        onRemove={removeTrackingEvent}
        onChange={updateTrackingEvent}
      />

      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {t("common.cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-slate-950 text-white font-semibold hover:bg-slate-800 disabled:opacity-60 transition-colors"
        >
          {loading ? t("common.saving") : submitLabel}
        </button>
      </div>
    </form>
  );
}

function useShipmentForm(job?: ShipmentJob | null) {
  const initial = job ? jobToForm(job) : defaultShipmentJobForm;
  const [form, setForm] = React.useState<ShipmentJobFormState>(initial);

  React.useEffect(() => {
    setForm(job ? jobToForm(job) : defaultShipmentJobForm);
  }, [job]);

  return [form, setForm] as const;
}

function AssignedAdminFields({
  assignments,
  selectedAdminIds,
  onToggle,
}: {
  assignments: NonNullable<CompanyUser["admin_assignments"]>;
  selectedAdminIds: string[];
  onToggle: (adminUserId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("admin.userRegistration.assignedAdmins")}
        </span>
      </div>
      {assignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          {t("superAdmin.operators.noOperators")}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {assignments.map((assignment) => (
            <label
              key={assignment.admin_user_id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-cyan-300 hover:bg-cyan-50/50"
            >
              <input
                type="checkbox"
                checked={selectedAdminIds.includes(assignment.admin_user_id)}
                onChange={() => onToggle(assignment.admin_user_id)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-bold text-slate-900">
                    {assignment.user_name || assignment.email}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                    {t(`superAdmin.operators.staffRole.${assignment.staff_role}`)}
                  </span>
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {assignment.email}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function getCompanyAdminAssignments(
  companyName: string | null,
  companyOptions: Pick<CompanyUser, "company_name" | "admin_assignments">[],
) {
  const assignmentsByAdminId = new Map<
    string,
    NonNullable<CompanyUser["admin_assignments"]>[number]
  >();

  companyOptions
    .filter((company) => company.company_name === companyName)
    .flatMap((company) => company.admin_assignments ?? [])
    .forEach((assignment) => {
      assignmentsByAdminId.set(assignment.admin_user_id, assignment);
    });

  return [...assignmentsByAdminId.values()];
}

function TrackingEventFields({
  values,
  onAdd,
  onAddDefaultFlow,
  canAddDefaultFlow,
  onRemove,
  onChange,
}: {
  values: ShipmentJobFormState["tracking_events"];
  onAdd: () => void;
  onAddDefaultFlow: () => void;
  canAddDefaultFlow: boolean;
  onRemove: (index: number) => void;
  onChange: (
    index: number,
    field: keyof ShipmentJobFormState["tracking_events"][number],
    value: string,
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("tracking.title")}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={!canAddDefaultFlow}
            onClick={onAddDefaultFlow}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tracking.addDefaultFlow")}
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tracking.add")}
          </button>
        </div>
      </div>
      {values.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          {t("tracking.noEvents")}
        </div>
      ) : (
        <div className="space-y-3">
          {values.map((event, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[150px_1fr_2fr_40px]"
            >
              <input
                type="date"
                value={event.event_date}
                onChange={(inputEvent) =>
                  onChange(index, "event_date", inputEvent.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
                aria-label={t("tracking.date")}
              />
              <input
                type="text"
                value={event.location}
                placeholder={t("tracking.location")}
                onChange={(inputEvent) =>
                  onChange(index, "location", inputEvent.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
              />
              <input
                type="text"
                value={event.description}
                placeholder={t("tracking.description")}
                onChange={(inputEvent) =>
                  onChange(index, "description", inputEvent.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                aria-label={t("common.delete")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VesselFlightNumberFields({
  values,
  onAdd,
  onRemove,
  onChange,
}: {
  values: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("common.vesselFlightNo")}
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("form.addVesselFlight")}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {values.map((value, index) => (
          <label key={index} className="block">
            <span className="text-xs font-semibold text-slate-500">
              {formatOrdinal(index + 1)} {t("common.vesselFlightNo")}
            </span>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={value}
                placeholder="ONE HOUSTON 001W / NH110"
                onChange={(event) => onChange(index, event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
              />
              <button
                type="button"
                disabled={values.length === 1}
                onClick={() => onRemove(index)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("common.delete")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function formatOrdinal(value: number) {
  const suffix =
    value % 10 === 1 && value % 100 !== 11
      ? "st"
      : value % 10 === 2 && value % 100 !== 12
        ? "nd"
        : value % 10 === 3 && value % 100 !== 13
          ? "rd"
          : "th";

  return `${value}${suffix}`;
}

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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

function TextAreaField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
      />
    </label>
  );
}

function FileUploadField({
  label,
  existingFiles,
  files,
  onChange,
}: {
  label: string;
  existingFiles: string[];
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputId = React.useId();

  return (
    <div className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <label
        htmlFor={inputId}
        className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-slate-500 hover:bg-white"
      >
        <span className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
          {t("form.selectFiles")}
        </span>
        <span className="mt-3 text-xs text-slate-500">
          {t("form.uploadHelp")}
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        />
      </label>

      <FileNameList title={t("form.existingFiles")} names={existingFiles} />
      <FileNameList
        title={t("form.selectedFiles")}
        names={files.map((file) => file.name)}
      />
    </div>
  );
}

function FileNameList({ title, names }: { title: string; names: string[] }) {
  if (!names.length) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {names.map((name) => (
          <span
            key={name}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function splitDocumentNames(value: string) {
  return value
    .split("・")
    .map((name) => name.trim())
    .filter(Boolean);
}
