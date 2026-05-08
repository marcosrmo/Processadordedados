import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Upload,
  FileSpreadsheet,
  Database,
  LogOut,
  ShieldCheck,
  Crown,
  ClipboardList,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useAuth, logout } from "@/hooks/useAuth";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard",        href: "/" },
    { icon: Upload,          label: "Importar Arquivos", href: "/import" },
    { icon: Database,        label: "Consolidação",      href: "/consolidation" },
    { icon: FileSpreadsheet, label: "Exportar Dados",    href: "/export" },
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <Sidebar className="border-r border-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
            <ShieldCheck size={20} />
          </div>
          <span className="text-sidebar-foreground">DataForge</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href} className="mb-1">
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={location === item.href}
                  tooltip={item.label}
                  className={`w-full justify-start gap-3 px-3 py-5 rounded-md transition-all duration-200 ${
                    location === item.href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <item.icon size={20} className={location === item.href ? "text-primary" : ""} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}

          {/* Admin e Auditoria — só para admin */}
          {user?.role === "admin" && (
            <>
              <SidebarMenuItem className="mb-1">
                <Link href="/admin">
                  <SidebarMenuButton
                    isActive={location === "/admin"}
                    tooltip="Administração"
                    className={`w-full justify-start gap-3 px-3 py-5 rounded-md transition-all duration-200 ${
                      location === "/admin"
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}
                  >
                    <Crown size={20} className={location === "/admin" ? "text-primary" : ""} />
                    <span>Administração</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem className="mb-1">
                <Link href="/audit">
                  <SidebarMenuButton
                    isActive={location === "/audit"}
                    tooltip="Log de Auditoria"
                    className={`w-full justify-start gap-3 px-3 py-5 rounded-md transition-all duration-200 ${
                      location === "/audit"
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}
                  >
                    <ClipboardList size={20} className={location === "/audit" ? "text-primary" : ""} />
                    <span>Log de Auditoria</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {/* Info do usuário logado */}
        {user && (
          <div className="flex items-center gap-2 px-1 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {user.username[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user.username}</p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">
                {user.role === "admin" ? "👑 Administrador" : "Usuário"}
              </p>
            </div>
          </div>
        )}

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="gap-3 text-destructive hover:text-destructive/80 hover:bg-destructive/10 w-full justify-start"
            >
              <LogOut size={18} />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
