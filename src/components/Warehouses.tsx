import { useState, useEffect } from "react";
import { Warehouse, MapPin, Package } from "lucide-react";
import { supabase } from "../lib/supabase";

interface WarehouseData {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  country: string;
  capacity: number;
  current_occupancy: number;
  created_at: string;
}

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .order("name");

      if (error) throw error;
      setWarehouses(data || []);
    } catch (error) {
      console.error("倉庫データ読み込みエラー:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOccupancyColor = (percentage: number) => {
    if (percentage >= 80) return "text-red-600";
    if (percentage >= 60) return "text-orange-600";
    return "text-green-600";
  };

  const getOccupancyBgColor = (percentage: number) => {
    if (percentage >= 80) return "bg-red-500";
    if (percentage >= 60) return "bg-orange-500";
    return "bg-green-500";
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
          <h1 className="text-3xl font-bold text-gray-900">倉庫管理</h1>
          <p className="text-gray-600 mt-1">倉庫キャパシティと運用状況の監視</p>
        </div>
        <div className="flex items-center gap-2">
          <Warehouse className="w-6 h-6 text-gray-700" />
          <span className="text-sm font-medium text-gray-700">
            {warehouses.length} 拠点
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {warehouses.map((warehouse) => {
          const occupancyPercentage = Math.round(
            (warehouse.current_occupancy / warehouse.capacity) * 100,
          );

          return (
            <div
              key={warehouse.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {warehouse.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    コード: {warehouse.code}
                  </p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <Warehouse className="w-6 h-6 text-blue-600" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div className="text-sm text-gray-700">
                    <div>{warehouse.address}</div>
                    <div>
                      {warehouse.city}, {warehouse.country}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        使用率
                      </span>
                    </div>
                    <span
                      className={`text-lg font-bold ${getOccupancyColor(occupancyPercentage)}`}
                    >
                      {occupancyPercentage}%
                    </span>
                  </div>

                  <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 ${getOccupancyBgColor(occupancyPercentage)} transition-all duration-300`}
                      style={{ width: `${occupancyPercentage}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>
                      使用中:{" "}
                      {warehouse.current_occupancy.toLocaleString("ja-JP")} 個
                    </span>
                    <span>
                      総容量: {warehouse.capacity.toLocaleString("ja-JP")} 個
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">空き容量</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {(
                        warehouse.capacity - warehouse.current_occupancy
                      ).toLocaleString("ja-JP")}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">状態</div>
                    <div className="text-lg font-semibold">
                      {occupancyPercentage >= 90 ? (
                        <span className="text-red-600">危険</span>
                      ) : occupancyPercentage >= 75 ? (
                        <span className="text-orange-600">高負荷</span>
                      ) : (
                        <span className="text-green-600">正常</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {warehouses.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Warehouse className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">倉庫が見つかりません</p>
        </div>
      )}
    </div>
  );
}
