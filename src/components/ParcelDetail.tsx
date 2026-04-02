import { useState, useEffect, useCallback } from "react";
import {
  X,
  Package,
  FileText,
  MapPin,
  Clock,
  Upload,
  Eye,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface ParcelDetail {
  id: string;
  tracking_number: string;
  master_number: string;
  house_number: string;
  invoice_number: string;
  status: string;
  weight: number;
  gross_weight: number;
  volume: number;
  pieces: number;
  length: number;
  width: number;
  height: number;
  cargo_description: string;
  commodity: string;
  incoterm: string;
  port_of_loading: string;
  transit_port: string;
  port_of_discharge: string;
  shipper_name: string;
  consignee_name: string;
  notify_party: string;
  vessel_flight: string;
  voyage_number: string;
  etd: string;
  eta: string;
  atd: string;
  ata: string;
  carrier: { name: string; code: string };
  order: {
    order_number: string;
    customer_name: string;
    customer_email: string;
    destination_address: string;
    destination_city: string;
    destination_country: string;
    total_value: number;
    currency: string;
  };
  warehouse: { name: string; city: string; country: string } | null;
}

interface TrackingEvent {
  id: string;
  event_type: string;
  location: string;
  description: string;
  event_time: string;
}

interface ParcelDocument {
  id: string;
  document_type: string;
  document_number: string;
  file_name: string;
  status: string;
  created_at: string;
}

const docTypeLabels: Record<string, string> = {
  bill_of_lading: "船荷証券 (B/L)",
  house_bill_of_lading: "ハウスB/L",
  commercial_invoice: "商業インボイス",
  packing_list: "パッキングリスト",
  customs_declaration: "通関申告書",
  certificate_of_origin: "原産地証明書",
  other: "その他書類",
};

const docStatusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  uploaded: "bg-blue-100 text-blue-700",
  verified: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const docStatusLabels: Record<string, string> = {
  pending: "未提出",
  uploaded: "アップロード済",
  verified: "確認済",
  rejected: "却下",
};

const eventTypeLabels: Record<string, string> = {
  created: "荷物作成",
  received: "受取完了",
  sorted: "仕分け完了",
  in_transit: "輸送中",
  out_for_delivery: "配達中",
  delivered: "配達完了",
  exception: "例外発生",
};

const eventIcons: Record<string, string> = {
  created: "📦",
  received: "✅",
  sorted: "🔄",
  in_transit: "🚚",
  out_for_delivery: "🚛",
  delivered: "✨",
  exception: "⚠️",
};

const parcelStatusColors: Record<string, string> = {
  created: "bg-gray-100 text-gray-800",
  in_warehouse: "bg-blue-100 text-blue-800",
  in_transit: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  returned: "bg-red-100 text-red-800",
};

const parcelStatusLabels: Record<string, string> = {
  created: "作成済み",
  in_warehouse: "倉庫内",
  in_transit: "輸送中",
  delivered: "配達完了",
  returned: "返送",
};

type Tab = "overview" | "cargo" | "ports" | "documents" | "tracking";

interface Props {
  parcelId: string;
  onClose: () => void;
}

export default function ParcelDetail({ parcelId, onClose }: Props) {
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [documents, setDocuments] = useState<ParcelDocument[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  const loadParcelDetail = useCallback(async () => {
    try {
      const [parcelRes, eventsRes, docsRes] = await Promise.all([
        supabase
          .from("parcels")
          .select(
            `
            *,
            carrier:carriers(name, code),
            order:orders(order_number, customer_name, customer_email, destination_address, destination_city, destination_country, total_value, currency),
            warehouse:warehouses(name, city, country)
          `,
          )
          .eq("id", parcelId)
          .maybeSingle(),
        supabase
          .from("tracking_events")
          .select("*")
          .eq("parcel_id", parcelId)
          .order("event_time", { ascending: false }),
        supabase
          .from("parcel_documents")
          .select("*")
          .eq("parcel_id", parcelId)
          .order("created_at", { ascending: true }),
      ]);

      setParcel(parcelRes.data);
      setTrackingEvents(eventsRes.data || []);
      setDocuments(docsRes.data || []);
    } catch (error) {
      console.error("荷物詳細読み込みエラー:", error);
    } finally {
      setLoading(false);
    }
  }, [parcelId]);

  useEffect(() => {
    void loadParcelDetail();
  }, [loadParcelDetail]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "概要" },
    { id: "cargo", label: "貨物情報" },
    { id: "ports", label: "港情報" },
    { id: "documents", label: `書類 (${documents.length})` },
    { id: "tracking", label: `追跡履歴 (${trackingEvents.length})` },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-start justify-center px-4 py-8">
        <div
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              読み込み中...
            </div>
          ) : !parcel ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              データが見つかりません
            </div>
          ) : (
            <>
              <div className="bg-gray-900 text-white px-8 py-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-xl">
                      <Package className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-xl font-bold tracking-wide">
                          {parcel.tracking_number}
                        </h2>
                        <span
                          className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${parcelStatusColors[parcel.status]}`}
                        >
                          {parcelStatusLabels[parcel.status] || parcel.status}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm">
                        注文: {parcel.order?.order_number} &nbsp;|&nbsp; 顧客:{" "}
                        {parcel.order?.customer_name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <HeaderField
                    label="主提单号 (Master No.)"
                    value={parcel.master_number || "—"}
                  />
                  <HeaderField
                    label="副提单号 (House No.)"
                    value={parcel.house_number || "—"}
                  />
                  <HeaderField
                    label="インボイス番号"
                    value={parcel.invoice_number || "—"}
                  />
                  <HeaderField
                    label="キャリア"
                    value={parcel.carrier?.name || "—"}
                  />
                </div>
              </div>

              <div className="border-b border-gray-200 px-8">
                <div className="flex gap-1 -mb-px overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto">
                {activeTab === "overview" && <OverviewTab parcel={parcel} />}
                {activeTab === "cargo" && <CargoTab parcel={parcel} />}
                {activeTab === "ports" && <PortsTab parcel={parcel} />}
                {activeTab === "documents" && (
                  <DocumentsTab documents={documents} />
                )}
                {activeTab === "tracking" && (
                  <TrackingTab events={trackingEvents} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-white truncate">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined | null;
}) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-500 shrink-0 min-w-[140px]">
        {label}
      </span>
      <span className="text-sm font-medium text-gray-900 text-right">
        {value || "—"}
      </span>
    </div>
  );
}

function OverviewTab({ parcel }: { parcel: ParcelDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Section title="荷送人情報">
        <Field label="荷送人 (Shipper)" value={parcel.shipper_name} />
        <Field label="荷受人 (Consignee)" value={parcel.consignee_name} />
        <Field label="着荷通知先" value={parcel.notify_party} />
      </Section>

      <Section title="輸送条件">
        <Field label="インコタームズ" value={parcel.incoterm} />
        <Field label="船名/便名" value={parcel.vessel_flight} />
        <Field label="航海/便番号" value={parcel.voyage_number} />
        <Field label="キャリア" value={parcel.carrier?.name} />
      </Section>

      <Section title="スケジュール">
        <Field
          label="出発予定 (ETD)"
          value={
            parcel.etd ? new Date(parcel.etd).toLocaleString("ja-JP") : null
          }
        />
        <Field
          label="到着予定 (ETA)"
          value={
            parcel.eta ? new Date(parcel.eta).toLocaleString("ja-JP") : null
          }
        />
        <Field
          label="実際出発 (ATD)"
          value={
            parcel.atd ? new Date(parcel.atd).toLocaleString("ja-JP") : null
          }
        />
        <Field
          label="実際到着 (ATA)"
          value={
            parcel.ata ? new Date(parcel.ata).toLocaleString("ja-JP") : null
          }
        />
      </Section>

      <Section title="注文情報">
        <Field label="注文番号" value={parcel.order?.order_number} />
        <Field label="顧客名" value={parcel.order?.customer_name} />
        <Field
          label="配送先"
          value={
            parcel.order
              ? `${parcel.order.destination_city}, ${parcel.order.destination_country}`
              : null
          }
        />
        <Field
          label="注文金額"
          value={
            parcel.order
              ? `${parcel.order.currency} ${parcel.order.total_value?.toFixed(2)}`
              : null
          }
        />
      </Section>
    </div>
  );
}

function CargoTab({ parcel }: { parcel: ParcelDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Section title="貨物詳細">
        <Field label="品名" value={parcel.commodity} />
        <Field label="貨物説明" value={parcel.cargo_description} />
        <Field label="インボイス番号" value={parcel.invoice_number} />
      </Section>

      <Section title="寸法・重量">
        <Field
          label="個数 (Pieces)"
          value={parcel.pieces ? `${parcel.pieces} pcs` : null}
        />
        <Field
          label="グロス重量"
          value={parcel.gross_weight ? `${parcel.gross_weight} kg` : null}
        />
        <Field
          label="ネット重量"
          value={parcel.weight ? `${parcel.weight} kg` : null}
        />
        <Field
          label="容積 (CBM)"
          value={parcel.volume ? `${parcel.volume} m³` : null}
        />
        <Field
          label="寸法 (L×W×H)"
          value={
            parcel.length
              ? `${parcel.length} × ${parcel.width} × ${parcel.height} cm`
              : null
          }
        />
      </Section>

      <div className="md:col-span-2">
        <Section title="倉庫情報">
          <Field
            label="現在の倉庫"
            value={
              parcel.warehouse
                ? `${parcel.warehouse.name} (${parcel.warehouse.city}, ${parcel.warehouse.country})`
                : null
            }
          />
        </Section>
      </div>
    </div>
  );
}

function PortsTab({ parcel }: { parcel: ParcelDetail }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="flex-1 bg-gray-50 rounded-xl p-5 text-center border-2 border-blue-100">
          <div className="text-xs text-gray-500 mb-1">出発港 (POL)</div>
          <div className="font-bold text-gray-900 text-lg">
            {parcel.port_of_loading || "—"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ETD:{" "}
            {parcel.etd
              ? new Date(parcel.etd).toLocaleDateString("ja-JP")
              : "—"}
          </div>
        </div>

        {parcel.transit_port ? (
          <>
            <ChevronRight className="w-6 h-6 text-gray-400 shrink-0" />
            <div className="flex-1 bg-amber-50 rounded-xl p-5 text-center border-2 border-amber-100">
              <div className="text-xs text-gray-500 mb-1">中転港 (T/S)</div>
              <div className="font-bold text-gray-900 text-lg">
                {parcel.transit_port}
              </div>
              <div className="text-xs text-amber-600 mt-1">トランシップ</div>
            </div>
          </>
        ) : (
          <>
            <ChevronRight className="w-6 h-6 text-gray-400 shrink-0" />
            <div className="flex-1 bg-gray-50 rounded-xl p-5 text-center border-2 border-dashed border-gray-200">
              <div className="text-xs text-gray-400 mb-1">中転港</div>
              <div className="font-medium text-gray-400">直行便</div>
            </div>
          </>
        )}

        <ChevronRight className="w-6 h-6 text-gray-400 shrink-0" />

        <div className="flex-1 bg-gray-50 rounded-xl p-5 text-center border-2 border-green-100">
          <div className="text-xs text-gray-500 mb-1">目的港 (POD)</div>
          <div className="font-bold text-gray-900 text-lg">
            {parcel.port_of_discharge || "—"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ETA:{" "}
            {parcel.eta
              ? new Date(parcel.eta).toLocaleDateString("ja-JP")
              : "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="船舶・航空機情報">
          <Field label="船名/便名" value={parcel.vessel_flight} />
          <Field label="航海/便番号" value={parcel.voyage_number} />
          <Field label="キャリア" value={parcel.carrier?.name} />
          <Field label="インコタームズ" value={parcel.incoterm} />
        </Section>

        <Section title="スケジュール詳細">
          <Field
            label="出発予定 (ETD)"
            value={
              parcel.etd ? new Date(parcel.etd).toLocaleString("ja-JP") : null
            }
          />
          <Field
            label="到着予定 (ETA)"
            value={
              parcel.eta ? new Date(parcel.eta).toLocaleString("ja-JP") : null
            }
          />
          <Field
            label="実際出発 (ATD)"
            value={
              parcel.atd ? new Date(parcel.atd).toLocaleString("ja-JP") : null
            }
          />
          <Field
            label="実際到着 (ATA)"
            value={
              parcel.ata ? new Date(parcel.ata).toLocaleString("ja-JP") : null
            }
          />
        </Section>
      </div>
    </div>
  );
}

function DocumentsTab({ documents }: { documents: ParcelDocument[] }) {
  const docGroups = [
    "bill_of_lading",
    "house_bill_of_lading",
    "commercial_invoice",
    "packing_list",
    "customs_declaration",
    "certificate_of_origin",
    "other",
  ];

  const allDocs = docGroups.map((type) => {
    const existing = documents.find((d) => d.document_type === type);
    return (
      existing || {
        id: type,
        document_type: type,
        document_number: null,
        file_name: null,
        status: "pending",
        created_at: "",
      }
    );
  });

  const uploaded = documents.filter((d) => d.status !== "pending").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 bg-gray-50 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">
            {documents.length}
          </div>
          <div className="text-sm text-gray-500">登録書類</div>
        </div>
        <div className="flex-1 bg-green-50 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-700">{uploaded}</div>
          <div className="text-sm text-gray-500">提出済み</div>
        </div>
        <div className="flex-1 bg-amber-50 rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-700">
            {documents.length - uploaded}
          </div>
          <div className="text-sm text-gray-500">未提出</div>
        </div>
      </div>

      <div className="space-y-3">
        {allDocs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${doc.status === "pending" ? "bg-gray-200" : "bg-white border border-gray-200"}`}
              >
                <FileText
                  className={`w-5 h-5 ${doc.status === "pending" ? "text-gray-400" : "text-blue-600"}`}
                />
              </div>
              <div>
                <div className="font-medium text-gray-900 text-sm">
                  {docTypeLabels[doc.document_type] || doc.document_type}
                </div>
                {doc.document_number && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Ref: {doc.document_number}
                  </div>
                )}
                {doc.file_name && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {doc.file_name}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`px-2.5 py-1 text-xs font-medium rounded-full ${docStatusColors[doc.status] || "bg-gray-100 text-gray-700"}`}
              >
                {docStatusLabels[doc.status] || doc.status}
              </span>
              {doc.status !== "pending" ? (
                <button className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-500">
                  <Eye className="w-4 h-4" />
                </button>
              ) : (
                <button className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-400">
                  <Upload className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackingTab({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p>追跡イベントがありません</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[1.85rem] top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-1">
        {events.map((event, index) => (
          <div key={event.id} className="flex gap-5 relative">
            <div className="flex flex-col items-center shrink-0 z-10">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg bg-white border-2 ${
                  index === 0 ? "border-blue-500" : "border-gray-200"
                }`}
              >
                {eventIcons[event.event_type] || "📍"}
              </div>
            </div>
            <div
              className={`flex-1 pb-6 ${index === 0 ? "opacity-100" : "opacity-80"}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div
                    className={`font-semibold text-sm ${index === 0 ? "text-blue-700" : "text-gray-900"}`}
                  >
                    {eventTypeLabels[event.event_type] || event.event_type}
                  </div>
                  <div className="text-sm text-gray-600 mt-0.5">
                    {event.description}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {event.location}
                  </div>
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap ml-4">
                  {new Date(event.event_time).toLocaleString("ja-JP")}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
