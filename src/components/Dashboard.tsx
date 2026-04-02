import { useState, useEffect } from "react";
import {
  Package,
  TrendingUp,
  Warehouse,
  Truck,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface Stats {
  totalOrders: number;
  totalParcels: number;
  activeShipments: number;
  warehouseOccupancy: number;
  pendingCustoms: number;
}

interface StatusCount {
  status: string;
  count: number;
}

const statusLabels: Record<string, string> = {
  pending: "保留中",
  processing: "処理中",
  shipped: "発送済み",
  delivered: "配達完了",
  cancelled: "キャンセル",
  in_transit: "輸送中",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    totalParcels: 0,
    activeShipments: 0,
    warehouseOccupancy: 0,
    pendingCustoms: 0,
  });
  const [ordersByStatus, setOrdersByStatus] = useState<StatusCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [
        ordersResult,
        parcelsResult,
        shipmentsResult,
        warehousesResult,
        customsResult,
      ] = await Promise.all([
        supabase.from("orders").select("*", { count: "exact" }),
        supabase.from("parcels").select("*", { count: "exact" }),
        supabase
          .from("shipments")
          .select("*")
          .in("status", ["pending", "picked_up", "in_transit"]),
        supabase.from("warehouses").select("capacity, current_occupancy"),
        supabase
          .from("customs_declarations")
          .select("*", { count: "exact" })
          .in("status", ["pending", "submitted"]),
      ]);

      const orderStatusCounts = await supabase
        .from("orders")
        .select("status")
        .then(({ data }) => {
          const counts: Record<string, number> = {};
          data?.forEach((order) => {
            counts[order.status] = (counts[order.status] || 0) + 1;
          });
          return Object.entries(counts).map(([status, count]) => ({
            status,
            count,
          }));
        });

      const totalCapacity =
        warehousesResult.data?.reduce((sum, w) => sum + w.capacity, 0) || 1;
      const totalOccupancy =
        warehousesResult.data?.reduce(
          (sum, w) => sum + w.current_occupancy,
          0,
        ) || 0;

      setStats({
        totalOrders: ordersResult.count || 0,
        totalParcels: parcelsResult.count || 0,
        activeShipments: shipmentsResult.data?.length || 0,
        warehouseOccupancy: Math.round((totalOccupancy / totalCapacity) * 100),
        pendingCustoms: customsResult.count || 0,
      });

      setOrdersByStatus(orderStatusCounts);
    } catch (error) {
      console.error("ダッシュボードデータ読み込みエラー:", error);
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-600 mt-1">物流オペレーションの概要</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="総注文数"
          value={stats.totalOrders}
          icon={<Package className="w-6 h-6 text-blue-600" />}
          bgColor="bg-blue-50"
        />
        <StatCard
          title="総荷物数"
          value={stats.totalParcels}
          icon={<Package className="w-6 h-6 text-green-600" />}
          bgColor="bg-green-50"
        />
        <StatCard
          title="稼働中の配送"
          value={stats.activeShipments}
          icon={<Truck className="w-6 h-6 text-orange-600" />}
          bgColor="bg-orange-50"
        />
        <StatCard
          title="倉庫使用率"
          value={`${stats.warehouseOccupancy}%`}
          icon={<Warehouse className="w-6 h-6 text-teal-600" />}
          bgColor="bg-teal-50"
        />
      </div>

      {stats.pendingCustoms > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900">通関保留中</h3>
            <p className="text-amber-700 text-sm">
              {stats.pendingCustoms}件の通関申告が審査待ちです
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-gray-700" />
          <h2 className="text-xl font-semibold text-gray-900">
            ステータス別注文数
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {ordersByStatus.map(({ status, count }) => (
            <div key={status} className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{count}</div>
              <div className="text-sm text-gray-600 mt-1">
                {statusLabels[status] || status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  bgColor,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  bgColor: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`${bgColor} p-3 rounded-lg`}>{icon}</div>
      </div>
    </div>
  );
}
