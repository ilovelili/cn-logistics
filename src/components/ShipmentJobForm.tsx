import * as React from "react";
import { t } from "../lib/i18n";
import {
  defaultShipmentJobForm,
  ShipmentJob,
  ShipmentJobForm as ShipmentJobFormState,
  statusOptions,
  tradeModeOptions,
  transportModeOptions,
  jobToForm,
} from "../lib/shipmentJobs";

interface ShipmentJobFormProps {
  job?: ShipmentJob | null;
  submitLabel: string;
  loading?: boolean;
  onCancel?: () => void;
  onSubmit: (form: ShipmentJobFormState) => Promise<void> | void;
}

export default function ShipmentJobForm({
  job,
  submitLabel,
  loading = false,
  onCancel,
  onSubmit,
}: ShipmentJobFormProps) {
  const [form, setForm] = useShipmentForm(job);

  const updateField = <Key extends keyof ShipmentJobFormState>(
    key: Key,
    value: ShipmentJobFormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextAreaField
          label={t("common.documents")}
          value={form.documents}
          onChange={(value) => updateField("documents", value)}
          placeholder={t("form.documentsPlaceholder")}
        />
        <TextAreaField
          label={t("common.internalDocuments")}
          value={form.internal_documents}
          onChange={(value) => updateField("internal_documents", value)}
          placeholder={t("form.internalDocumentsPlaceholder")}
        />
      </div>

      <TextAreaField
        label={t("common.notes")}
        value={form.notes}
        onChange={(value) => updateField("notes", value)}
        placeholder={t("form.notesPlaceholder")}
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

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
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
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-200"
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
