import { Link, useLocation } from "wouter";
import { Car, LogOut, Settings, LayoutDashboard, Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetParkingStatus } from "@workspace/api-client-react";

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { data: status } = useGetParkingStatus({
    query: { refetchInterval: 5000 }
  });

  const links = [
    { href: "/", label: "Машин нэвтрэх", icon: Car },
    { href: "/exit", label: "Гарах / Төлбөр", icon: LogOut },
    { href: "/admin", label: "Админ", icon: LayoutDashboard },
  ];

  const occupancyPercent = status ? (status.occupiedSpaces / status.totalSpaces) * 100 : 0;

  return (
    <div className="flex min-h-screen w-full relative">
      {/* Background ambient image */}
      <img 
        src={`${import.meta.env.BASE_URL}images/bg-glow.png`}
        alt="Ambient background"
        className="fixed inset-0 w-full h-full object-cover opacity-20 pointer-events-none z-[-1]"
      />

      {/* Mobile Nav Toggle */}
      <button 
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-card rounded-lg border border-white/10 shadow-lg text-foreground"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Sidebar */}
      <AnimatePresence>
        {(isOpen || window.innerWidth >= 768) && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed md:sticky top-0 left-0 h-screen w-72 glass-panel border-r border-y-0 border-l-0 border-white/10 z-40 flex flex-col p-6"
          >
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-display font-bold text-white leading-tight">IderPark</h1>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Зогсоолын систем</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="md:hidden text-muted-foreground hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex-1 space-y-2">
              {links.map((link) => {
                const active = location === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 relative group ${
                      active ? "text-white" : "text-muted-foreground hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {active && (
                      <motion.div
                        layoutId="active-nav"
                        className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-xl"
                        initial={false}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    <Icon className={`w-5 h-5 relative z-10 transition-colors ${active ? "text-primary" : "group-hover:text-white"}`} />
                    <span className="font-medium relative z-10">{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Status Widget in Sidebar */}
            <div className="mt-auto pt-8">
              <div className="bg-black/20 rounded-2xl p-5 border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-secondary">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-primary to-blue-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${occupancyPercent}%` }}
                    transition={{ duration: 1 }}
                  />
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Зогсоолын төлөв</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-display font-bold text-white">{status?.availableSpaces ?? '-'}</span>
                  <span className="text-sm text-muted-foreground">/ {status?.totalSpaces ?? '-'} сул</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 min-h-screen md:max-w-[calc(100vw-18rem)] overflow-x-hidden relative z-10">
        <div className="p-4 md:p-8 lg:p-12 w-full max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
