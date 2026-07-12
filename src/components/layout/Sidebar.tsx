import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentUser } from "./AppShell";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  Store,
  Users,
  Receipt,
  ShoppingBag,
  Tag,
  Coins,
  BarChart3,
  Settings,
  LogOut,
  Sparkles,
  X,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/stock", label: "Stock Central", icon: Warehouse, adminOnly: true },
  { to: "/compras", label: "Compras", icon: ShoppingCart, adminOnly: true },
  { to: "/saloes", label: "Salões", icon: Store },
  { to: "/representantes", label: "Representantes", icon: Users, adminOnly: true },
  { to: "/vendas", label: "Vendas", icon: Receipt },
  { to: "/encomendas", label: "Encomendas", icon: ShoppingBag, adminOnly: true },
  { to: "/promocoes", label: "Promoções", icon: Tag, adminOnly: true },
  { to: "/comissoes", label: "Comissões", icon: Coins, adminOnly: true },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, adminOnly: true },
  { to: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
];

const navSalao: NavItem[] = [
  { to: "/dashboard-salao", label: "O Meu Salão", icon: LayoutDashboard },
  { to: "/vendas", label: "Vendas", icon: Receipt },
];

export function Sidebar({
  user,
  mobileOpen,
  onMobileClose,
}: {
  user: CurrentUser | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const items = user?.role === "salao"
    ? navSalao
    : nav.filter((i) => !i.adminOnly || user?.role === "admin");

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (user?.nome ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={onMobileClose} />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-[240px] flex flex-col text-sidebar-foreground transition-transform md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sidebar-primary" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-sidebar-foreground/70">
                EMC² Digital
              </span>
            </div>
            <h1 className="font-display text-xl mt-1">Secrets VIP</h1>
            <p className="text-xs text-sidebar-foreground/60">O Boticário</p>
          </div>
          <button onClick={onMobileClose} className="md:hidden text-sidebar-foreground/70 p-1" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as never}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="h-9 w-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{user?.nome ?? "—"}</p>
              <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                {user?.role ?? ""}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
    </>
  );
}