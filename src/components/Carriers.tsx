import { useState, useEffect } from "react";
import { Truck, Globe, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Carrier {
  id: string;
  name: string;
  code: string;
  api_endpoint: string;
  is_active: boolean;
  created_at: string;
}

interface CarrierStats {
  carrier_id: string;
  total_parcels: number;
  in_transit: number;
  delivered: number;
}

export default function Carriers() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrierStats, setCarrierStats] = useState<Map<string, CarrierStats>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCarriers();
  }, []);

  const loadCarriers = async () => {
    try {
      const { data: carriersData, error: carriersError } = await supabase
        .from("carriers")
        .select("*")
        .order("name");

      if (carriersError) throw carriersError;

      const { data: parcelsData } = await supabase
        .from("parcels")
        .select("carrier_id, status");

      const statsMap = new Map<string, CarrierStats>();
      carriersData?.forEach((carrier) => {
        const parcels =
          parcelsData?.filter((p) => p.carrier_id === carrier.id) || [];
        statsMap.set(carrier.id, {
          carrier_id: carrier.id,
          total_parcels: parcels.length,
          in_transit: parcels.filter((p) => p.status === "in_transit").length,
          delivered: parcels.filter((p) => p.status === "delivered").length,
        });
      });

      setCarriers(carriersData || []);
      setCarrierStats(statsMap);
    } catch (error) {
      console.error("キャリアデータ読み込みエラー:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">読み込み中...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">キャリア管理</h1>
          <p className="text-gray-600 mt-1">配送キャリアと連携の管理</p>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6 text-gray-700" />
          <span className="text-sm font-medium text-gray-700">
            稼働中: {carriers.filter((c) => c.is_active).length} 社
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {carriers.map((carrier) => {
          const stats = carrierStats.get(carrier.id);

          return (
            <div
              key={carrier.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {carrier.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    コード: {carrier.code}
                  </p>
                </div>
                <div
                  className={`p-2 rounded-lg ${carrier.is_active ? "bg-green-50" : "bg-gray-50"}`}
                >
                  {carrier.is_active ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <Globe className="w-4 h-4" />
                    <span className="font-medium">APIエンドポイント</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate bg-gray-50 px-2 py-1 rounded">
                    {carrier.api_endpoint || "未設定"}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    パフォーマンス指標
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-blue-50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-blue-600">
                        {stats?.total_parcels || 0}
                      </div>
                      <div className="text-xs text-blue-600">合計</div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-orange-600">
                        {stats?.in_transit || 0}
                      </div>
                      <div className="text-xs text-orange-600">輸送中</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-green-600">
                        {stats?.delivered || 0}
                      </div>
                      <div className="text-xs text-green-600">配達済み</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">ステータス</span>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        carrier.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {carrier.is_active ? "稼働中" : "停止中"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {carriers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">キャリアが見つかりません</p>
        </div>
      )}
    </div>
  );
}
