import { motion } from "framer-motion";
import { ShieldCheck, Lock } from "lucide-react";

interface GateAnimationProps {
  status: 'closed' | 'opening' | 'open';
}

export function GateAnimation({ status }: GateAnimationProps) {
  return (
    <div className="w-full h-48 bg-black/40 rounded-2xl border border-white/5 relative overflow-hidden flex items-center justify-center">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      {/* Base post */}
      <div className="absolute bottom-4 left-1/4 w-8 h-24 bg-gradient-to-b from-slate-700 to-slate-900 rounded-sm border border-slate-600 z-20">
        <div className="w-full h-4 bg-yellow-500/20 mt-4"></div>
      </div>

      {/* Animated Barrier Arm */}
      <motion.div 
        className="absolute bottom-[5.5rem] left-[calc(25%+16px)] w-64 h-4 bg-gradient-to-r from-red-500 via-white to-red-500 origin-left rounded-r-full shadow-lg z-10"
        initial={{ rotate: 0 }}
        animate={{ 
          rotate: status === 'open' ? -85 : status === 'opening' ? -45 : 0 
        }}
        transition={{ duration: status === 'opening' ? 1 : 2, ease: "easeInOut" }}
        style={{
          backgroundSize: '200% 100%',
          backgroundImage: 'repeating-linear-gradient(45deg, #ef4444, #ef4444 20px, #ffffff 20px, #ffffff 40px)'
        }}
      />

      {/* Status Indicator overlay */}
      <div className="absolute top-4 right-4 z-30">
        <motion.div 
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm backdrop-blur-md ${
            status === 'open' 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : status === 'opening'
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {status === 'open' && <><ShieldCheck className="w-4 h-4" /> Нээлттэй</>}
          {status === 'opening' && <><Lock className="w-4 h-4" /> Нээгдэж байна...</>}
          {status === 'closed' && <><Lock className="w-4 h-4" /> Хаалттай</>}
        </motion.div>
      </div>
    </div>
  );
}
