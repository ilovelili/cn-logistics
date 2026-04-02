import { useState, useEffect } from "react";
import {
  FileText,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface CustomsDeclaration {
  id: string;
  declaration_number: string;
  description: string;
  value: number;
  currency: string;
  hs_code: string;
  origin_country: string;
  destination_country: string;
  status: string;
  submitted_at: string;
  cleared_at: string;
  parcel: {
    tracking_number: string;
    order: {
      order_number: string;
      customer_name: string;
    };
  };
}

const statusLabels: Record<string, string> = {
  pending: "保留中",
  submitted: "申請済み",
  approved: "承認済み",
  cleared: "通関完了",
  rejected: "却下",
};

export default function Customs() {
  const [declarations, setDeclarations] = useState<CustomsDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadDeclarations();
  }, []);

  const loadDeclarations = async () => {
    try {
      const { data, error } = await supabase
        .from("customs_declarations")
        .select(
          `
          *,
          parcel:parcels(
            tracking_number,
            order:orders(order_number, customer_name)
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDeclarations(data || []);
    } catch (error) {
      console.error("通関申告データ読み込みエラー:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDeclarations = declarations.filter((declaration) => {
    const matchesSearch =
      declaration.declaration_number
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      declaration.parcel?.tracking_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      declaration.parcel?.order?.order_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || declaration.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "cleared":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "approved":
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
      case "submitted":
        return <Clock className="w-5 h-5 text-orange-600" />;
      case "rejected":
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "cleared":
        return "bg-green-100 text-green-800";
      case "approved":
        return "bg-blue-100 text-blue-800";
      case "submitted":
        return "bg-orange-100 text-orange-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const statusCounts = {
    pending: declarations.filter((d) => d.status === "pending").length,
    submitted: declarations.filter((d) => d.status === "submitted").length,
    approved: declarations.filter((d) => d.status === "approved").length,
    cleared: declarations.filter((d) => d.status === "cleared").length,
    rejected: declarations.filter((d) => d.status === "rejected").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">読み込み中...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">通関書類管理</h1>
        <p className="text-gray-600 mt-1">国際輸送の通関申告を管理する</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {statusCounts.pending}
          </div>
          <div className="text-sm text-gray-600 mt-1">保留中</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-orange-600">
            {statusCounts.submitted}
          </div>
          <div className="text-sm text-gray-600 mt-1">申請済み</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-blue-600">
            {statusCounts.approved}
          </div>
          <div className="text-sm text-gray-600 mt-1">承認済み</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">
            {statusCounts.cleared}
          </div>
          <div className="text-sm text-gray-600 mt-1">通関完了</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-red-600">
            {statusCounts.rejected}
          </div>
          <div className="text-sm text-gray-600 mt-1">却下</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="申告番号・追跡番号・注文番号で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">すべてのステータス</option>
            <option value="pending">保留中</option>
            <option value="submitted">申請済み</option>
            <option value="approved">承認済み</option>
            <option value="cleared">通関完了</option>
            <option value="rejected">却下</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  申告書
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  荷物情報
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  輸送ルート
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  申告価額
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  HSコード
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  日付
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDeclarations.map((declaration) => (
                <tr
                  key={declaration.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">
                          {declaration.declaration_number}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {declaration.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {declaration.parcel?.tracking_number}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      注文: {declaration.parcel?.order?.order_number}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {declaration.origin_country}
                    </div>
                    <div className="text-xs text-gray-500">
                      → {declaration.destination_country}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {declaration.currency} {declaration.value.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 font-mono">
                      {declaration.hs_code || "N/A"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(declaration.status)}
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(declaration.status)}`}
                      >
                        {statusLabels[declaration.status] || declaration.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {declaration.submitted_at && (
                      <div>
                        申請:{" "}
                        {new Date(declaration.submitted_at).toLocaleDateString(
                          "ja-JP",
                        )}
                      </div>
                    )}
                    {declaration.cleared_at && (
                      <div className="text-green-600">
                        完了:{" "}
                        {new Date(declaration.cleared_at).toLocaleDateString(
                          "ja-JP",
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredDeclarations.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">通関申告が見つかりません</p>
        </div>
      )}
    </div>
  );
}
