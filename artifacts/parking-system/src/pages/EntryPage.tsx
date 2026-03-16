import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Car, Camera, AlertCircle, ArrowRight, ScanLine } from "lucide-react";
import { 
  useGetParkingStatus, 
  useVehicleEnter, 
  useGetParkingRecords 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import CameraScanner from "@/components/CameraScanner";

const MOCK_PLATES = ["1234УБА", "9988СУА", "7777ТӨВ", "4567ДАР", "0001УБҮ"];

export default function EntryPage() {
  const [plate, setPlate] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const { data: status } = useGetParkingStatus();
  const { data: records, isLoading } = useGetParkingRecords({ status: "active", limit: 5 });
  
  // Mutation
  const enterMutation = useVehicleEnter({
    mutation: {
      onSuccess: () => {
        toast({ title: "Амжилттай!", description: `${plate} дугаартай машин нэвтэрлээ.` });
        setPlate("");
        queryClient.invalidateQueries({ queryKey: ["/api/parking/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/parking/records"] });
      },
      onError: (err: any) => {
        toast({ 
          variant: "destructive", 
          title: "Алдаа гарлаа", 
          description: err.message || "Машин нэвтрүүлэхэд алдаа гарлаа." 
        });
      }
    }
  });

  const handleSimulateScan = () => {
    const random = MOCK_PLATES[Math.floor(Math.random() * MOCK_PLATES.length)];
    setPlate(random);
  };

  const handleCameraDetected = (detected: string) => {
    setPlate(detected);
    toast({ title: "Дугаар танигдлаа!", description: `Камераас: ${detected}` });
  };

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate) return;
    enterMutation.mutate({ data: { plateNumber: plate } });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <header>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Машин нэвтрэх</h1>
        <p className="text-muted-foreground">Автомашиныг зогсоол руу нэвтрүүлэх хэсэг.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-700 -translate-y-1/2 translate-x-1/2"></div>
            
            <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-6">
              <Camera className="w-5 h-5 text-primary" />
              Дугаар оруулах
            </h2>

            <form onSubmit={handleEnter} className="space-y-6 relative z-10">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Улсын дугаар</label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="text"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="0000ААА"
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-2xl font-display tracking-widest text-white placeholder:text-white/20 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all uppercase"
                  />
                </div>
              </div>

              {/* Camera buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-medium border border-primary/30 hover:border-primary/60 transition-all flex items-center justify-center gap-2"
                >
                  <ScanLine className="w-4 h-4" /> Камер нээх
                </button>
                <button
                  type="button"
                  onClick={handleSimulateScan}
                  className="px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 text-white font-medium border border-white/5 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" /> Симуляц
                </button>
              </div>

              <button
                type="submit"
                disabled={!plate || enterMutation.isPending}
                className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transition-all duration-200 flex items-center justify-center gap-2"
              >
                {enterMutation.isPending ? "Уншиж байна..." : (
                  <>Оруулах <ArrowRight className="w-5 h-5" /></>
                )}
              </button>
            </form>
          </div>

          {/* Active Records Preview */}
          <div className="glass-panel rounded-3xl p-6 md:p-8">
            <h2 className="text-xl font-semibold text-white mb-6">Сая орсон машинууд</h2>
            
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl"></div>)}
              </div>
            ) : records?.records && records.records.length > 0 ? (
              <div className="space-y-3">
                {records.records.map((record, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={record.id} 
                    className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5 hover:bg-black/40 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Car className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-white tracking-wider">{record.plateNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(record.entryTime), 'yyyy.MM.dd HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                      Идэвхтэй
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                <Car className="w-12 h-12 mb-4 opacity-20" />
                <p>Одоогоор зогсоолд машин алга байна.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Status */}
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl p-6 relative overflow-hidden h-full flex flex-col justify-center">
            <div className="text-center relative z-10">
              <h3 className="text-lg font-medium text-muted-foreground mb-8">Сул зогсоолын тоо</h3>
              
              <div className="relative inline-flex items-center justify-center">
                <svg className="w-48 h-48 transform -rotate-90">
                  <circle 
                    cx="96" cy="96" r="88" 
                    className="stroke-secondary fill-none" 
                    strokeWidth="12"
                  />
                  <motion.circle 
                    cx="96" cy="96" r="88" 
                    className="stroke-primary fill-none" 
                    strokeWidth="12"
                    strokeDasharray={2 * Math.PI * 88}
                    initial={{ strokeDashoffset: 2 * Math.PI * 88 }}
                    animate={{ 
                      strokeDashoffset: status ? (2 * Math.PI * 88) * (1 - status.availableSpaces / status.totalSpaces) : 0 
                    }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-display font-bold text-white tracking-tighter">
                    {status?.availableSpaces ?? 0}
                  </span>
                  <span className="text-sm text-muted-foreground mt-1">/ {status?.totalSpaces ?? 0}</span>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs text-muted-foreground mb-1">Дүүргэлт</p>
                  <p className="text-xl font-bold text-white">
                    {status ? Math.round((status.occupiedSpaces / status.totalSpaces) * 100) : 0}%
                  </p>
                </div>
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs text-muted-foreground mb-1">Нийт орсон</p>
                  <p className="text-xl font-bold text-white">{status?.occupiedSpaces ?? 0}</p>
                </div>
              </div>

              {status && status.availableSpaces <= 5 && (
                <div className="mt-6 flex items-center justify-center gap-2 text-yellow-500 bg-yellow-500/10 py-3 rounded-xl border border-yellow-500/20">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Зогсоол дүүрэх дөхөж байна</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Camera Scanner Modal */}
      <AnimatePresence>
        {cameraOpen && (
          <CameraScanner
            onDetected={handleCameraDetected}
            onClose={() => setCameraOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
