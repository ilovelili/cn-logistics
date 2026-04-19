import { useMemo, useState } from "react";
import {
  CalendarDays,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  ShipWheel,
} from "lucide-react";
import ShipmentJobForm from "./ShipmentJobForm";
import { t } from "../lib/i18n";
import {
  createShipmentJob,
  getDocumentsForJob,
  ShipmentDocument,
  ShipmentJob,
  statusBadgeClasses,
  statusLabels,
  statusOptions,
  tradeModeLabels,
  tradeModeOptions,
  transportModeLabels,
  transportModeOptions,
} from "../lib/shipmentJobs";

interface ShipmentJobsProps {
  jobs: ShipmentJob[];
  documents: ShipmentDocument[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export default function ShipmentJobs({
  jobs,
  documents,
  loading,
  onRefresh,
}: ShipmentJobsProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [transportFilter, setTransportFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return jobs.filter((job) => {
      const searchable = [
        job.invoice_number,
        job.shipper_name,
        job.consignee_name,
        job.pol_aol,
        job.pod_aod,
        job.mbl_mawb,
        job.hbl_hawb,
        ...(job.documents ?? []),
        ...(job.internal_documents ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" || job.status === statusFilter;
      const matchesTrade =
        tradeFilter === "all" || job.trade_mode === tradeFilter;
      const matchesTransport =
        transportFilter === "all" || job.transport_mode === transportFilter;

      return matchesQuery && matchesStatus && matchesTrade && matchesTransport;
    });
  }, [jobs, query, statusFilter, tradeFilter, transportFilter]);

  const documentsByJob = useMemo(() => {
    return Object.fromEntries(
      jobs.map((job) => [job.id, getDocumentsForJob(documents, job.id)]),
    ) as Record<string, ShipmentDocument[]>;
  }, [documents, jobs]);

  const handleCreate = async (
    form: Parameters<typeof createShipmentJob>[0],
  ) => {
    setSaving(true);
    try {
      await createShipmentJob(form);
      await onRefresh();
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-950">
              {t("jobs.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-slate-500">
              {t("jobs.description")}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {t("jobs.new")}
          </button>
        </div>
      </div>

      {showCreate && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {t("jobs.createTitle")}
              </h2>
              <p className="text-sm text-slate-500">
                {t("jobs.createDescription")}
              </p>
            </div>
          </div>
          <ShipmentJobForm
            submitLabel={t("common.create")}
            loading={saving}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("jobs.searchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
            />
          </div>
          <FilterSelect
            icon={<Filter className="h-4 w-4" />}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: t("jobs.filter.allStatus") },
              ...statusOptions,
            ]}
          />
          <FilterSelect
            value={tradeFilter}
            onChange={setTradeFilter}
            options={[
              { value: "all", label: t("jobs.filter.allTrade") },
              ...tradeModeOptions,
            ]}
          />
          <FilterSelect
            value={transportFilter}
            onChange={setTransportFilter}
            options={[
              { value: "all", label: t("jobs.filter.allTransport") },
              ...transportModeOptions,
            ]}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <ShipWheel className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-950">{t("jobs.list")}</h2>
              <p className="text-sm text-slate-500">
                {t("jobs.count", {
                  total: jobs.length,
                  filtered: filteredJobs.length,
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[7%]" />
              <col className="w-[6%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.status")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.trade")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.invoice")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.transport")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.shipper")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.consignee")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">POL/AOL</th>
                <th className="whitespace-nowrap px-3 py-3">POD/AOD</th>
                <th className="whitespace-nowrap px-3 py-3">MBL/MAWB</th>
                <th className="whitespace-nowrap px-3 py-3">HBL/HAWB</th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.blAwbDate")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.documents")}
                </th>
                <th className="whitespace-nowrap px-3 py-3">
                  {t("common.internalDocuments")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  className="align-top transition hover:bg-slate-50/80"
                >
                  <td className="px-3 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClasses[job.status]}`}
                    >
                      {statusLabels[job.status]}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="whitespace-nowrap font-bold text-slate-900">
                      {tradeModeLabels[job.trade_mode]}
                    </div>
                    <div className="whitespace-nowrap text-xs text-slate-500">
                      {job.trade_term || "-"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-slate-900">
                    {job.invoice_number || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {job.transport_mode
                      ? transportModeLabels[job.transport_mode]
                      : "-"}
                  </td>
                  <td className="px-3 py-4 font-medium text-slate-900">
                    {job.shipper_name || "-"}
                  </td>
                  <td className="px-3 py-4 font-medium text-slate-900">
                    {job.consignee_name || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {job.pol_aol || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {job.pod_aod || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">
                    {job.mbl_mawb || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">
                    {job.hbl_hawb || "-"}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2 whitespace-nowrap text-slate-700">
                      <CalendarDays className="h-4 w-4 text-slate-400" />
                      {job.bl_awb_date || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <DocumentPills
                      documents={documentsByJob[job.id]?.filter(
                        (document) => document.scope === "customer",
                      )}
                    />
                  </td>
                  <td className="px-3 py-4">
                    <DocumentPills
                      documents={documentsByJob[job.id]?.filter(
                        (document) => document.scope === "internal",
                      )}
                      muted
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredJobs.length === 0 && (
            <div className="py-16 text-center text-slate-500">
              <MoreHorizontal className="mx-auto mb-3 h-8 w-8" />
              {t("jobs.noMatches")}
            </div>
          )}
          {loading && (
            <div className="py-16 text-center text-slate-500">
              {t("common.loadingJobs")}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  icon,
  value,
  options,
  onChange,
}: {
  icon?: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 ${icon ? "pl-10" : "pl-4"}`}
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

function DocumentPills({
  documents,
  muted = false,
}: {
  documents?: ShipmentDocument[];
  muted?: boolean;
}) {
  if (!documents?.length) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {documents.map((document) => (
        <span
          key={document.id}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            muted ? "bg-slate-100 text-slate-600" : "bg-cyan-50 text-cyan-800"
          }`}
        >
          <FileText className="h-3 w-3" />
          {document.name}
        </span>
      ))}
    </div>
  );
}
