import { useState, useEffect } from "react";
import { Package, ClipboardList, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Stats {
  totalParcels: number;
  totalEvents: number;
  deliveredToday: number;
  pendingParcels: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalParcels: 0,
    totalEvents: 0,
    deliveredToday: 0,
    pendingParcels: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [parcelsRes, eventsRes, deliveredRes, pendingRes] =
          await Promise.all([
            supabase
              .from("parcels")
              .select("id", { count: "exact", head: true }),
            supabase
              .from("tracking_events")
              .select("id", { count: "exact", head: true }),
            supabase
              .from("parcels")
              .select("id", { count: "exact", head: true })
              .eq("status", "delivered")
              .gte("updated_at", todayStart.toISOString()),
            supabase
              .from("parcels")
              .select("id", { count: "exact", head: true })
              .in("status", ["created", "in_warehouse"]),
          ]);

        setStats({
          totalParcels: parcelsRes.count || 0,
          totalEvents: eventsRes.count || 0,
          deliveredToday: deliveredRes.count || 0,
          pendingParcels: pendingRes.count || 0,
        });
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = [
    {
      label: "総荷物数",
      value: stats.totalParcels,
      icon: Package,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      label: "追跡イベント数",
      value: stats.totalEvents,
      icon: ClipboardList,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950",
    },
    {
      label: "本日配達完了",
      value: stats.deliveredToday,
      icon: CheckCircle,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-950",
    },
    {
      label: "保留中の荷物",
      value: stats.pendingParcels,
      icon: AlertCircle,
      color: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-50 dark:bg-yellow-950",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          管理ダッシュボード
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          システム全体の概況
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse"
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4" />
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6"
              >
                <div
                  className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-4`}
                >
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {card.value.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {card.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
          クイックアクション
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          左メニューの「追跡情報入力」から、荷物の追跡イベントを手動で登録できます。追跡番号で荷物を検索し、イベント種別・場所・説明を入力して登録してください。
        </p>
      </div>
    </div>
  );
}
