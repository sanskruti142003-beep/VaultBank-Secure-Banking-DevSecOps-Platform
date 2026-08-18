import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar />
      </div>
      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="min-h-[calc(100vh-4rem)] px-4 pb-24 pt-6 sm:px-6 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav />

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onMouseDown={() => setMobileOpen(false)}
          >
            <motion.div
              animate={{ x: 0 }}
              className="h-full w-72 max-w-[86vw] bg-white shadow-xl"
              exit={{ x: "-100%" }}
              initial={{ x: "-100%" }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="absolute right-3 top-3 z-10">
                <Button
                  aria-label="Close navigation menu"
                  onClick={() => setMobileOpen(false)}
                  size="icon"
                  variant="ghost"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
