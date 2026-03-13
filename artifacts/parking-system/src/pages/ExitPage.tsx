import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CreditCard, Clock, QrCode, ArrowRight } from "lucide-react";
import { 
  useGetParkingRecords, 
  useVehicleExit, 
  useProcessPayment 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { GateAnimation } from "@/components/GateAnimation";

export default function ExitPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [gateStatus, setGateStatus] = useState<'closed' | 'opening' | 'open'>('closed');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Search active records
  const { data: recordsData, isLoading: isSearching } = useGetParkingRecords(
    { status: "active", limit: 50 }, 
    { query: { enabled: searchTerm.length > 2 } }
  );

  const searchResults = recordsData?.records.filter(r => 
    r.plateNumber.includes(searchTerm.toUpperCase())
  ) || [];

  // Exit calculation mutation
  const exitMutation = useVehicleExit({
    mutation: {
      onSuccess: (data) => {
        setSelectedRecordId(data.record.id);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Алдаа", description: err.message });
      }
    }
  });

  // Payment mutation
  const payMutation = useProcessPayment({
    mutation: {
      onSuccess: (data) => {
        // Gate simulation sequence
        setGateStatus('opening');
        setTimeout(() => {
          setGateStatus('open');
          toast({ title: "Төлбөр амжилттай!", description: "Хаалт нээгдлээ, аюулгүй зорчоорой." });
          
          // Invalidate cache
          queryClient.invalidateQueries({ queryKey: ["/api/parking/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/parking/records"] });
          
          // Reset after delay
          setTimeout(() => {
            setSelectedRecordId(null);
            setSearchTerm("");
            setGateStatus('closed');
            exitMutation.reset();
          }, 3000);
        }, 1500);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Төлбөрийн алдаа", description: err.message });
      }
    }
  });

  const handleSelectRecord = (id: number) => {
    exitMutation.mutate({ id });
  };

  const handlePay = () => {
    if (!selectedRecordId) return;
    payMutation.mutate({ id: selectedRecordId });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      
      <header className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Гарах / Төлбөр</h1>
        <p className="text-muted-foreground">Улсын дугаараа хайж төлбөрөө төлнө үү.</p>
      </header>

      <AnimatePresence mode="wait">
        {!exitMutation.isSuccess ? (
          <motion.div 
            key="search"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="glass-panel rounded-3xl p-2 pl-6 flex items-center gap-4 relative z-20">
              <Search className="w-6 h-6 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                placeholder="Хайх дугаар... (Жшнь: 1234УБА)"
                className="flex-1 bg-transparent border-none py-4 text-xl font-display tracking-widest text-white placeholder:text-white/20 focus:outline-none focus:ring-0 uppercase"
              />
            </div>

            {searchTerm.length > 2 && (
              <div className="glass-panel rounded-3xl p-6 space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground px-2">Илэрцүүд</h3>
                {isSearching ? (
                  <div className="text-center py-8 text-white/50">Уншиж байна...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(record => (
                    <button
                      key={record.id}
                      onClick={() => handleSelectRecord(record.id)}
                      className="w-full flex items-center justify-between p-5 rounded-2xl bg-black/20 hover:bg-primary/20 border border-white/5 hover:border-primary/50 transition-all duration-300 group text-left"
                    >
                      <div>
                        <div className="text-2xl font-display font-bold text-white tracking-widest mb-1 group-hover:text-primary transition-colors">
                          {record.plateNumber}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="w-4 h-4" /> 
                          Орсон: {new Date(record.entryTime).toLocaleTimeString('mn-MN')}
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Машин олдсонгүй
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="payment"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {/* Payment Details */}
            <div className="glass-panel rounded-3xl p-8 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-blue-500"></div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">Улсын дугаар</p>
                <h2 className="text-4xl font-display font-bold text-white tracking-widest">
                  {exitMutation.data.record.plateNumber}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4" /> Зогссон хугацаа
                  </p>
                  <p className="text-2xl font-semibold text-white">
                    {exitMutation.data.durationMinutes} мин
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
                    <CreditCard className="w-4 h-4" /> Төлөх дүн
                  </p>
                  <p className="text-3xl font-bold text-primary">
                    {exitMutation.data.fee.toLocaleString()} ₮
                  </p>
                </div>
              </div>

              <button
                onClick={handlePay}
                disabled={payMutation.isPending || gateStatus === 'opening'}
                className="w-full py-5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-900 font-bold text-xl shadow-lg shadow-emerald-500/25 transition-all duration-300 transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:transform-none"
              >
                {payMutation.isPending ? "Уншиж байна..." : "Төлбөр баталгаажуулах"}
              </button>
            </div>

            {/* QR & Gate Animation */}
            <div className="space-y-6">
              <div className="glass-panel rounded-3xl p-8 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-4">
                  <QrCode className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-medium text-white mb-6">QR уншуулан төлөх</h3>
                <div className="bg-white p-4 rounded-2xl shadow-xl">
                  {exitMutation.data.qrCode ? (
                    <img src={exitMutation.data.qrCode} alt="QR Code" className="w-48 h-48 object-contain" />
                  ) : (
                    <div className="w-48 h-48 bg-slate-100 flex items-center justify-center text-slate-400">QR олдсонгүй</div>
                  )}
                </div>
              </div>

              <GateAnimation status={gateStatus} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
