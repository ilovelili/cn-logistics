import { useState, useEffect } from "react";
import { Package, Search, ChevronRight, Clock, MapPin } from "lucide-react";
import { supabase } from "../lib/supabase";
import ParcelDetail from "./ParcelDetail";

interface Parcel {
  id: string;
  tracking_number: string;
  status: string;
  weight: number;
  carrier: {
    name: string;
    code: string;
  };
  order: {
    order_number: string;
    customer_name: string;
  };
}

interface TrackingEvent {
  id: string;
  event_type: string;
  location: string;
  description: string;
  event_time: string;
}

const statusLabels: Record<string, string> = {
  created: "作成済み",
  in_warehouse: "倉庫内",
  in_transit: "輸送中",
  delivered: "配達完了",
  returned: "返送",
};

const eventLabels: Record<string, string> = {
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

export default function Tracking() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [detailParcelId, setDetailParcelId] = useState<string | null>(null);

  useEffect(() => {
    loadParcels();
  }, []);

  const loadParcels = async () => {
    try {
      const { data, error } = await supabase
        .from("parcels")
        .select(
          `
          *,
          carrier:carriers(name, code),
          order:orders(order_number, customer_name)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setParcels(data || []);
    } catch (error) {
      console.error("荷物データ読み込みエラー:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrackingEvents = async (parcelId: string) => {
    try {
      const { data, error } = await supabase
        .from("tracking_events")
        .select("*")
        .eq("parcel_id", parcelId)
        .order("event_time", { ascending: false });

      if (error) throw error;
      setTrackingEvents(data || []);
    } catch (error) {
      console.error("追跡イベント読み込みエラー:", error);
    }
  };

  const handleParcelSelect = (parcel: Parcel) => {
    setSelectedParcel(parcel);
    loadTrackingEvents(parcel.id);
  };

  const handleOpenDetail = (e: React.MouseEvent, parcelId: string) => {
    e.stopPropagation();
    setDetailParcelId(parcelId);
  };

  const filteredParcels = parcels.filter(
    (parcel) =>
      parcel.tracking_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parcel.order?.order_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      parcel.order?.customer_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "created":
        return "bg-gray-100 text-gray-800";
      case "in_warehouse":
        return "bg-blue-100 text-blue-800";
      case "in_transit":
        return "bg-orange-100 text-orange-800";
      case "delivered":
        return "bg-green-100 text-green-800";
      case "returned":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">読み込み中...</div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">荷物追跡</h1>
          <p className="text-gray-600 mt-1">全キャリアのリアルタイム荷物追跡</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="追跡番号・注文番号・顧客名で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                全荷物 ({filteredParcels.length}件)
              </h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {filteredParcels.map((parcel) => (
                <div
                  key={parcel.id}
                  onClick={() => handleParcelSelect(parcel)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedParcel?.id === parcel.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <Package className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {parcel.tracking_number}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          注文: {parcel.order?.order_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          顧客: {parcel.order?.customer_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          キャリア: {parcel.carrier?.name}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(parcel.status)}`}
                      >
                        {statusLabels[parcel.status] || parcel.status}
                      </span>
                      <button
                        onClick={(e) => handleOpenDetail(e, parcel.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        詳細 <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {selectedParcel ? (
              <>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      追跡詳細
                    </h2>
                    <button
                      onClick={() => setDetailParcelId(selectedParcel.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      全詳細を見る <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-500">追跡番号</span>
                      <div className="font-medium text-gray-900">
                        {selectedParcel.tracking_number}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">ステータス</span>
                      <div>
                        <span
                          className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedParcel.status)}`}
                        >
                          {statusLabels[selectedParcel.status] ||
                            selectedParcel.status}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-gray-500">キャリア</span>
                        <div className="font-medium text-gray-900">
                          {selectedParcel.carrier?.name}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">重量</span>
                        <div className="font-medium text-gray-900">
                          {selectedParcel.weight} kg
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    追跡履歴
                  </h3>
                  <div className="space-y-4">
                    {trackingEvents.map((event, index) => (
                      <div key={event.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="text-2xl">
                            {eventIcons[event.event_type] || "📍"}
                          </div>
                          {index < trackingEvents.length - 1 && (
                            <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="font-medium text-gray-900">
                            {eventLabels[event.event_type] || event.event_type}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {event.description}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                            <MapPin className="w-4 h-4" />
                            {event.location}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(event.event_time).toLocaleString("ja-JP")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-gray-500">
                  荷物を選択して追跡詳細を表示してください
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {detailParcelId && (
        <ParcelDetail
          parcelId={detailParcelId}
          onClose={() => setDetailParcelId(null)}
        />
      )}
    </>
  );
}
