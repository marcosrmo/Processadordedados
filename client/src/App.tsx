import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";

import { AppSidebar } from "./components/layout/AppSidebar";
import NotFound from "./pages/not-found";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Consolidation from "./pages/Consolidation";
import Export from "./pages/Export";
import Admin from "./pages/Admin";
import AuditLog from "./pages/AuditLog";
import Login from "./pages/Login";

import { useAuth, checkAuth } from "./hooks/useAuth";
import { ConsolidatedDataProvider } from "./contexts/ConsolidatedDataContext";

function ProtectedApp() {
  const { loading, authenticated, blocked } = useAuth();

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center animate-pulse">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <p className="text-slate-500 text-sm">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Login onAuth={() => checkAuth()} blocked={blocked} />;
  }

  return (
    <ConsolidatedDataProvider>
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/import" component={Import} />
              <Route path="/consolidation" component={Consolidation} />
              <Route path="/export" component={Export} />
              <Route path="/admin" component={Admin} />
              <Route path="/audit" component={AuditLog} />
              <Route component={NotFound} />
            </Switch>
          </SidebarInset>
        </div>
        <Toaster />
      </SidebarProvider>
    </ConsolidatedDataProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProtectedApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
