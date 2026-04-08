import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { format, isValid, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Car, Clock, Settings, Save, RefreshCw } from "lucide-react";
import {
  useGetAdminStats,
  useGetParkingRecords,
  useGetTariff,
  useUpdateTariff,
  useGetCapacity,
  useUpdateCapacity
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'records' | 'settings'>('dashboard');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Settings State
  const [tariffForm, setTariffForm] = useState({ ratePerHour: 0, minimumFee: 0, freeMinutes: 0 });
  const [capacityForm, setCapacityForm] = useState({ totalSpaces: 0 });

  // 1. Queries - Параметр дамжуулахгүйгээр туршиж үзэх (Backend бүх датаг өгнө)
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats, isError } = useGetAdminStats({});

  const { data: recordsData } = useGetParkingRecords({ status: "all", limit: 100 });
  const { data: tariff } = useGetTariff();
  const { data: capacity } = useGetCapacity();

  useEffect(() => { if (tariff) setTariffForm(tariff); }, [tariff]);
  useEffect(() => { if (capacity) setCapacityForm(capacity); }, [capacity]);

  // 2. Графикийн датаг бэлдэх (Гацалтаас сэргийлэх хамгаалалт)
  const chartData = useMemo(() => {
    if (!stats?.revenueByDay) return [];
    return stats.revenueByDay.map(item => {
      const dateObj = parseISO(item.date);
      return {
        ...item,
        displayDate: isValid(dateObj) ? format(dateObj, 'MM/dd') : item.date
      };
    });
  }, [stats]);

  // Mutations
  const updateTariff = useUpdateTariff({
    mutation: {
      onSuccess: () => {
        toast({ title: "Тариф шинэчлэгдлээ" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tariff"] });
      }
    }
  });

  const updateCapacity = useUpdateCapacity({
    mutation: {
      onSuccess: () => {
        toast({ title: "Багтаамж шинэчлэгдлээ" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/capacity"] });
        queryClient.invalidateQueries({ queryKey: ["/api/parking/status"] });
      }
    }
  });

  const statCards = [
    { title: "Нийт орлого", value: `${(stats?.totalRevenue ?? 0).toLocaleString()} ₮`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { title: "Идэвхтэй машин", value: stats?.activeVehicles ?? 0, icon: Car, color: "text-primary", bg: "bg-primary/10" },
    { title: "Нийт үйлчлүүлсэн", value: stats?.totalVehicles ?? 0, icon: Car, color: "text-blue-400", bg: "bg-blue-400/10" },
    { title: "Дундаж хугацаа", value: `${stats?.averageDurationMinutes ?? 0} мин`, icon: Clock, color: "text-purple-400", bg: "bg-purple-400/10" },
  ];

  if (isError) return <div className="text-white p-10 text-center">Статистик ачаалахад алдаа гарлаа.</div>;

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white">Админ удирдлага</h1>
        <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/10 w-max">
          {(['dashboard', 'records', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg text-sm transition-all ${activeTab === tab ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}
            >
              {tab === 'dashboard' ? "Дашборд" : tab === 'records' ? "Бүртгэл" : "Тохиргоо"}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          <div className="flex justify-end">
            <button onClick={() => refetchStats()} className="flex items-center gap-2 text-primary">
              <RefreshCw className={`w-4 h-4 ${isStatsLoading ? 'animate-spin' : ''}`} /> Шинэчлэх
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((stat, i) => (
              <div key={i} className="glass-panel p-6 rounded-3xl flex items-center gap-4 border border-white/5">
                <div className={`w-14 h-14 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-3xl p-6 border border-white/5">
            <h3 className="text-lg font-semibold text-white mb-6">Орлогын график (₮)</h3>
            <div className="h-80 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="displayDate" stroke="#888888" fontSize={12} tickLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
                    <Bar dataKey="revenue" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  {isStatsLoading ? "Мэдээлэл уншиж байна..." : "График харуулах дата олдсонгүй."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Records болон Settings хэсэг хэвээрээ байна... */}
    </div>
  );
}