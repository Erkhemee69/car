import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format, subDays, isValid } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  TrendingUp, Car, Clock, Settings, Save, RefreshCw
} from "lucide-react";
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

  // Queries - Хугацааг ISOString болгож илгээнэ
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useGetAdminStats({
    from: subDays(new Date(), 7).toISOString(),
    to: new Date().toISOString()
  });

  const { data: recordsData } = useGetParkingRecords({ status: "all", limit: 100 });
  const { data: tariff } = useGetTariff();
  const { data: capacity } = useGetCapacity();

  // ✅ ЗАСВАР: Дата ирэх үед Form-ын утгуудыг useEffect-ээр нэг удаа шинэчилнэ
  useEffect(() => {
    if (tariff) {
      setTariffForm(tariff);
    }
  }, [tariff]);

  useEffect(() => {
    if (capacity) {
      setCapacityForm(capacity);
    }
  }, [capacity]);

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

  const handleSaveTariff = (e: React.FormEvent) => {
    e.preventDefault();
    updateTariff.mutate({ data: tariffForm });
  };

  const handleSaveCapacity = (e: React.FormEvent) => {
    e.preventDefault();
    updateCapacity.mutate({ data: capacityForm });
  };

  const statCards = [
    { title: "Нийт орлого", value: `${(stats?.totalRevenue || 0).toLocaleString()} ₮`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { title: "Идэвхтэй машин", value: stats?.activeVehicles || 0, icon: Car, color: "text-primary", bg: "bg-primary/10" },
    { title: "Нийт үйлчлүүлсэн", value: stats?.totalVehicles || 0, icon: Car, color: "text-blue-400", bg: "bg-blue-400/10" },
    { title: "Дундаж хугацаа", value: `${stats?.averageDurationMinutes || 0} мин`, icon: Clock, color: "text-purple-400", bg: "bg-purple-400/10" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Админ удирдлага</h1>
          <p className="text-muted-foreground">Зогсоолын системийн нэгдсэн мэдээлэл болон тохиргоо.</p>
        </div>
        <div className="flex bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/10 w-max">
          {(['dashboard', 'records', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                ? "bg-white/10 text-white shadow-sm"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
                }`}
            >
              {tab === 'dashboard' && "Дашбоард"}
              {tab === 'records' && "Бүртгэл"}
              {tab === 'settings' && "Тохиргоо"}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'dashboard' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          <div className="flex justify-end">
            <button
              onClick={() => refetchStats()}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isStatsLoading ? 'animate-spin' : ''}`} /> Шинэчлэх
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((stat, i) => (
              <div key={i} className="glass-panel p-6 rounded-3xl flex items-center gap-4 border border-white/5 hover:border-white/10 transition-colors">
                <div className={`w-14 h-14 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
                  <stat.icon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-3xl p-6 border border-white/5">
            <h3 className="text-lg font-semibold text-white mb-6">Сүүлийн 7 хоногийн орлого (₮)</h3>
            <div className="h-80 w-full">
              {stats?.revenueByDay && stats.revenueByDay.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.revenueByDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => {
                        const date = new Date(val);
                        return isValid(date) ? format(date, 'MM/dd') : val;
                      }}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => val >= 1000 ? `${val / 1000}k` : val}
                    />
                    <Tooltip
                      cursor={{ fill: '#ffffff05' }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#38bdf8' }}
                    />
                    <Bar dataKey="revenue" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground bg-white/5 rounded-2xl border border-dashed border-white/10">
                  {isStatsLoading ? "Мэдээлэл уншиж байна..." : "График харуулах дата олдсонгүй."}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'records' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel rounded-3xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-black/40 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Дугаар</th>
                  <th className="px-6 py-4 font-medium">Орсон</th>
                  <th className="px-6 py-4 font-medium">Гарсан</th>
                  <th className="px-6 py-4 font-medium">Хугацаа (мин)</th>
                  <th className="px-6 py-4 font-medium">Төлбөр</th>
                  <th className="px-6 py-4 font-medium">Төлөв</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recordsData?.records.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-display tracking-widest font-bold text-white">{r.plateNumber}</td>
                    <td className="px-6 py-4 text-muted-foreground">{format(new Date(r.entryTime), 'MM.dd HH:mm')}</td>
                    <td className="px-6 py-4 text-muted-foreground">{r.exitTime ? format(new Date(r.exitTime), 'MM.dd HH:mm') : '-'}</td>
                    <td className="px-6 py-4">{r.durationMinutes || '-'}</td>
                    <td className="px-6 py-4 font-medium">{r.fee ? `${r.fee.toLocaleString()} ₮` : '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full border ${r.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        r.status === 'paid' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                        {r.status === 'active' ? 'Идэвхтэй' : r.status === 'paid' ? 'Төлсөн' : 'Дуусгасан'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {activeTab === 'settings' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="glass-panel rounded-3xl p-8 border border-white/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-primary/20 text-primary rounded-lg"><Settings className="w-5 h-5" /></div>
              <h2 className="text-xl font-semibold text-white">Тарифын тохиргоо</h2>
            </div>
            <form onSubmit={handleSaveTariff} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Цагийн тариф (₮)</label>
                <input
                  type="number"
                  value={tariffForm.ratePerHour}
                  onChange={e => setTariffForm({ ...tariffForm, ratePerHour: Number(e.target.value) })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <button type="submit" className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium flex items-center justify-center gap-2 transition-all">
                <Save className="w-4 h-4" /> Хадгалах
              </button>
            </form>
          </div>

          <div className="glass-panel rounded-3xl p-8 border border-white/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg"><Car className="w-5 h-5" /></div>
              <h2 className="text-xl font-semibold text-white">Багтаамжийн тохиргоо</h2>
            </div>
            <form onSubmit={handleSaveCapacity} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Нийт зогсоолын тоо</label>
                <input
                  type="number"
                  value={capacityForm.totalSpaces}
                  onChange={e => setCapacityForm({ ...capacityForm, totalSpaces: Number(e.target.value) })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <button type="submit" className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center justify-center gap-2 transition-all">
                <Save className="w-4 h-4" /> Хадгалах
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </div>
  );
}