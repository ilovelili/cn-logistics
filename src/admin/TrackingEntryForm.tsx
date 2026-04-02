import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  CheckCircle,
  AlertCircle,
  Package,
  MapPin,
  Clock,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface Parcel {
  id: string;
  tracking_number: string;
  status: string;
  order: { order_number: string; customer_name: string } | null;
  carrier: { name: string } | null;
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

const statusColors: Record<string, string> = {
  created: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  in_warehouse: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_transit:
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  delivered:
    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  returned: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const eventTypeOptions = [
  { value: "created", label: "荷物作成" },
  { value: "received", label: "受取完了" },
  { value: "sorted", label: "仕分け完了" },
  { value: "in_transit", label: "輸送中" },
  { value: "out_for_delivery", label: "配達中" },
  { value: "delivered", label: "配達完了" },
  { value: "exception", label: "例外発生" },
];

const parcelStatusOptions = [
  { value: "created", label: "作成済み" },
  { value: "in_warehouse", label: "倉庫内" },
  { value: "in_transit", label: "輸送中" },
  { value: "delivered", label: "配達完了" },
  { value: "returned", label: "返送" },
];

export default function TrackingEntryForm() {
  const [searchTerm, setSearchTerm] = useState("");
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [form, setForm] = useState({
    event_type: "in_transit",
    location: "",
    description: "",
    event_time: new Date().toISOString().slice(0, 16),
  });
  const [newStatus, setNewStatus] = useState("");

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const searchParcels = async () => {
    if (!searchTerm.trim()) return;
    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from("parcels")
        .select(
          "id, tracking_number, status, order:orders(order_number, customer_name), carrier:carriers(name)",
        )
        .or(`tracking_number.ilike.%${searchTerm}%`)
        .limit(10);
      if (error) throw error;
      setParcels(data || []);
    } catch {
      showToast("error", "検索に失敗しました");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") searchParcels();
  };

  const selectParcel = async (parcel: Parcel) => {
    setSelectedParcel(parcel);
    setNewStatus(parcel.status);
    setParcels([]);
    setSearchTerm(parcel.tracking_number);
    await loadEvents(parcel.id);
  };

  const loadEvents = async (parcelId: string) => {
    const { data } = await supabase
      .from("tracking_events")
      .select("*")
      .eq("parcel_id", parcelId)
      .order("event_time", { ascending: false })
      .limit(10);
    setEvents(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParcel) return;
    setSubmitLoading(true);
    try {
      const { error: eventError } = await supabase
        .from("tracking_events")
        .insert({
          parcel_id: selectedParcel.id,
          event_type: form.event_type,
          location: form.location,
          description: form.description,
          event_time: new Date(form.event_time).toISOString(),
        });
      if (eventError) throw eventError;

      if (newStatus && newStatus !== selectedParcel.status) {
        const { error: statusError } = await supabase
          .from("parcels")
          .update({ status: newStatus })
          .eq("id", selectedParcel.id);
        if (statusError) throw statusError;
        setSelectedParcel({ ...selectedParcel, status: newStatus });
      }

      showToast("success", "追跡情報を登録しました");
      setForm({
        event_type: "in_transit",
        location: "",
        description: "",
        event_time: new Date().toISOString().slice(0, 16),
      });
      await loadEvents(selectedParcel.id);
    } catch {
      showToast("error", "登録に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) setParcels([]);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          追跡情報入力
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          荷物を検索し、追跡イベントを手動で登録します
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
          荷物を検索
        </h3>
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="追跡番号を入力..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={searchParcels}
              disabled={searchLoading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {searchLoading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              検索
            </button>
          </div>

          {parcels.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
              {parcels.map((parcel) => (
                <button
                  key={parcel.id}
                  onClick={() => selectParcel(parcel)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {parcel.tracking_number}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {parcel.order?.customer_name} · {parcel.carrier?.name}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[parcel.status]}`}
                  >
                    {statusLabels[parcel.status] || parcel.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedParcel && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">
                  {selectedParcel.tracking_number}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedParcel.order?.customer_name} ·{" "}
                  {selectedParcel.carrier?.name}
                </div>
              </div>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[selectedParcel.status]}`}
            >
              {statusLabels[selectedParcel.status] || selectedParcel.status}
            </span>
          </div>
        )}
      </div>

      {selectedParcel && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
              新規追跡イベント登録
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    イベント種別
                  </label>
                  <div className="relative">
                    <select
                      value={form.event_type}
                      onChange={(e) =>
                        setForm({ ...form, event_type: e.target.value })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {eventTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    ステータス更新
                  </label>
                  <div className="relative">
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {parcelStatusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    場所
                  </span>
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="例: 東京配送センター"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  説明
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="イベントの詳細説明..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    イベント日時
                  </span>
                </label>
                <input
                  type="datetime-local"
                  value={form.event_time}
                  onChange={(e) =>
                    setForm({ ...form, event_time: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {submitLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {submitLoading ? "登録中..." : "追跡イベントを登録"}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
              最新の追跡履歴
            </h3>
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
                <Clock className="w-10 h-10 mb-2" />
                <p className="text-sm">追跡履歴がありません</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {events.map((event, index) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      {index < events.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />
                      )}
                    </div>
                    <div className="pb-4 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {eventTypeOptions.find(
                          (o) => o.value === event.event_type,
                        )?.label || event.event_type}
                      </div>
                      {event.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {event.description}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {event.location}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date(event.event_time).toLocaleString("ja-JP")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
