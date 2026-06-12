import { type ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type CurrentUser = {
  id: string;
  email: string;
  nome: string;
  role: "admin" | "representante";
};

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const [{ data: profile }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("nome,email").eq("id", session.user.id).maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id),
  ]);
  console.log('USER ID:', session.user.id);
  console.log('ROLES DATA:', JSON.stringify(roles));
  console.log('ROLE ERROR:', rolesError);

  if (!roles || roles.length === 0) {
    await supabase.auth.signOut();
    window.location.href = '/auth';
    return null;
  }

  const role = (roles.some((r) => r.role === "admin") ? "admin" : "representante") as "admin" | "representante";
  return {
    id: session.user.id,
    email: profile?.email ?? session.user.email ?? "",
    nome: profile?.nome ?? session.user.email?.split("@")[0] ?? "Utilizador",
    role,
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useQuery({ queryKey: ["current-user"], queryFn: fetchCurrentUser });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setMobileOpen(false);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={user ?? null} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="md:pl-[240px]">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b bg-card">
          <button onClick={() => setMobileOpen(true)} className="text-foreground p-2 -ml-2" aria-label="Abrir menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <span className="font-display text-lg">Secrets VIP</span>
          <div className="w-8" />
        </header>
        <main className="p-4 md:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}