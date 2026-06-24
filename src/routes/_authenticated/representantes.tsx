import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Receipt, Coins, Calendar, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/representantes")({
  head: () => ({ meta: [{ title: "Representantes — Secrets VIP" }] }),
  component: RepresentantesPage,
});

type Rep = { id: string; nome: string; email: string };
type Salon = { id: string; nome: string; representante_id: string | null };
type SalonSale = {
  id: string; data: string; preco_final: number; comissao_rep: number;
  produto_id: string; salon_id: string; representante_id: string | null;
};
type DirectSale = {
  id: string; data: string; preco_final: number; comissao_rep: number;
  produto_id: string; representante_id: string; cliente_nome: string | null;
};
type Visit = { id: string; data: string; notas: string | null; salon_id: string; representante_id: string };

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v) || 0);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("pt-PT"); } catch { return "—"; }
}

function initials(nome: string | null | undefined) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}

function daysSince(d: string | null | undefined) {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// Plain-object maps (serialization-safe — React Query can cache without losing .get())
type StrMap = Record<string, string>;


function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // object/array sneaking in — log it and return empty string
  console.error("[#310 source] toStr received object:", JSON.stringify(v));
  return "";
}

async function fetchRepData() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);

  const [{ data: repsRaw }, { data: salonsRaw }, { data: salonSalesRaw }, { data: directSalesRaw }, { data: visitsRaw }] =
    await Promise.all([
      supabase.rpc("get_representantes"),
      supabase.from("salons").select("id,nome,representante_id").eq("ativo", true).order("nome"),
      supabase.from("salon_sales").select("id,data,preco_final,comissao_rep,produto_id,salon_id,representante_id").gte("data", monthStart),
      supabase.from("rep_direct_sales").select("id,data,preco_final,comissao_rep,produto_id,representante_id,cliente_nome").gte("data", monthStart),
      supabase.from("salon_visit_log").select("id,data,notas,salon_id,representante_id").gte("data", monthStart).order("data", { ascending: false }),
    ]);

  console.log('PROFILES RPC result:', JSON.stringify(repsRaw));

  // Explicit field-by-field coercion — never pass raw Supabase objects to JSX
  const repList: Rep[] = (repsRaw ?? []).map((p: any) => ({
    id: toStr(p.id),
    nome: toStr(p.nome),
    email: toStr(p.email),
  }));

  const salons: Salon[] = (salonsRaw ?? []).map((s: any) => ({
    id: toStr(s.id),
    nome: toStr(s.nome),
    representante_id: s.representante_id != null ? toStr(s.representante_id) : null,
  }));

  const salonSales: SalonSale[] = (salonSalesRaw ?? []).map((s: any) => ({
    id: toStr(s.id),
    data: toStr(s.data),
    preco_final: Number(s.preco_final) || 0,
    comissao_rep: Number(s.comissao_rep) || 0,
    produto_id: toStr(s.produto_id),
    salon_id: toStr(s.salon_id),
    representante_id: s.representante_id != null ? toStr(s.representante_id) : null,
  }));

  const directSales: DirectSale[] = (directSalesRaw ?? []).map((s: any) => ({
    id: toStr(s.id),
    data: toStr(s.data),
    preco_final: Number(s.preco_final) || 0,
    comissao_rep: Number(s.comissao_rep) || 0,
    produto_id: toStr(s.produto_id),
    representante_id: toStr(s.representante_id),
    cliente_nome: s.cliente_nome != null ? toStr(s.cliente_nome) : null,
  }));

  const visits: Visit[] = (visitsRaw ?? []).map((v: any) => ({
    id: toStr(v.id),
    data: toStr(v.data),
    notas: v.notas != null ? toStr(v.notas) : null,
    salon_id: toStr(v.salon_id),
    representante_id: toStr(v.representante_id),
  }));

  console.log('COERCED salons[0]:', JSON.stringify(salons[0]));
  console.log('COERCED salonSales[0]:', JSON.stringify(salonSales[0]));
  console.log('COERCED visits[0]:', JSON.stringify(visits[0]));

  const prodIds = [
    ...new Set([
      ...salonSales.map((s) => s.produto_id),
      ...directSales.map((s) => s.produto_id),
    ]),
  ].filter(Boolean);

  const { data: productsRaw } = prodIds.length
    ? await supabase.from("products").select("id,nome").in("id", prodIds)
    : { data: [] };

  const prodMap: StrMap = Object.fromEntries(
    (productsRaw ?? []).map((p: any) => [toStr(p.id), toStr(p.nome)])
  );
  const salonMap: StrMap = Object.fromEntries(
    salons.map((s) => [s.id, s.nome])
  );

  // all-time visits for "last visit" per salon per rep
  const { data: allVisitsRaw } = await supabase
    .from("salon_visit_log")
    .select("representante_id,salon_id,data")
    .order("data", { ascending: false });

  const lastVisitKey: StrMap = {};
  for (const v of allVisitsRaw ?? []) {
    const key = `${v.representante_id}:${v.salon_id}`;
    if (!lastVisitKey[key]) lastVisitKey[key] = toStr(v.data);
  }

  return {
    reps: repList,
    salons,
    salonSales,
    directSales,
    visits,
    prodMap,
    salonMap,
    lastVisitKey,
    monthStart,
  };
}

// ── Rep Sheet ─────────────────────────────────────────────────────────────────
function AssignSalonModal({
  open,
  onClose,
  repId,
  salons,
  assigned,
}: {
  open: boolean;
  onClose: () => void;
  repId: string;
  salons: Salon[];
  assigned: string[];
}) {
  const qc = useQueryClient();
  const [salonId, setSalonId] = useState("");
  const available = salons.filter((s) => !assigned.includes(s.id));

  useEffect(() => { if (open) setSalonId(""); }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("salons").update({ representante_id: repId }).eq("id", salonId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["representantes"] });
      toast.success("Salão atribuído.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Atribuir Salão</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Select value={salonId} onValueChange={setSalonId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar salão…" /></SelectTrigger>
            <SelectContent>
              {available.map((s) => <SelectItem key={s.id} value={s.id}>{String(s.nome || "—")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => mutation.mutate()} disabled={!salonId || mutation.isPending}>
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepSheet({
  rep,
  open,
  onClose,
}: {
  rep: Rep | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: saloes } = useQuery({
    queryKey: ["rep-saloes", rep?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("salons")
        .select("id,nome,ativo")
        .eq("representante_id", rep!.id);
      return data ?? [];
    },
    enabled: !!rep,
  });

  if (!rep) return null;
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle>{String(rep.nome ?? "—")}</SheetTitle>
        </SheetHeader>
        <div className="p-4 space-y-4">
          <p className="text-sm">Email: {String(rep.email ?? "—")}</p>
          <div>
            <p className="font-medium text-sm">Salões atribuídos:</p>
            {(saloes ?? []).map((s) => (
              <p key={String(s.id)} className="text-sm">{String(s.nome ?? "—")}</p>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Nova Rep Modal ────────────────────────────────────────────────────────────
function NovaRepModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setNome(""); setEmail(""); setPassword(""); }
  }, [open]);

  async function handleCreate() {
    if (!nome.trim() || !email.trim() || password.length < 6) return;
    setLoading(true);
    try {
      // Save current admin session before signUp (which may replace it if auto-confirm is on)
      const { data: { session: adminSession } } = await supabase.auth.getSession();

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { nome: nome.trim() } },
      });
      if (signUpError) throw signUpError;

      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error("Conta criada mas ID não devolvido.");

      // Restore admin session in case signUp replaced it
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      // Upsert profile and role (in case handle_new_user trigger didn't run)
      await supabase.from("profiles").upsert({ id: newUserId, nome: nome.trim(), email: email.trim() }, { onConflict: "id" });
      const { error: roleError } = await supabase.from("user_roles").upsert({ user_id: newUserId, role: "representante" }, { onConflict: "user_id" });
      if (roleError) throw roleError;

      qc.invalidateQueries({ queryKey: ["representantes"] });
      toast.success("Conta criada.", {
        description: "A representante deve fazer login e alterar a password.",
      });
      onClose();
    } catch (e: any) {
      toast.error("Erro ao criar conta", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Representante</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome completo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-1">
            <Label>Password temporária</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            {password.length > 0 && password.length < 6 && (
              <p className="text-xs text-red-500">Password deve ter pelo menos 6 caracteres.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleCreate}
            disabled={!nome.trim() || !email.trim() || password.length < 6 || loading}
          >
            {loading ? "A criar…" : "Criar Conta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function RepresentantesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["representantes"], queryFn: fetchRepData });

  const [selected, setSelected] = useState<Rep | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const reps = data?.reps ?? [];
  const salons = data?.salons ?? [];
  const salonSales = data?.salonSales ?? [];
  const directSales = data?.directSales ?? [];
  const visits = data?.visits ?? [];

  const totalRevenue = [...salonSales, ...directSales].reduce(
    (s, r) => s + Number(r.preco_final), 0,
  );
  const totalComm = [...salonSales, ...directSales].reduce(
    (s, r) => s + Number(r.comissao_rep), 0,
  );

  const kpis = [
    { label: "Total Representantes", value: reps.length, icon: Users },
    { label: "Vendas Totais Este Mês", value: data ? eur(totalRevenue) : "—", icon: Receipt },
    { label: "Comissões a Pagar", value: data ? eur(totalComm) : "—", icon: Coins },
    { label: "Visitas Este Mês", value: visits.length, icon: Calendar },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Equipa</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Representantes</h1>
          <p className="text-muted-foreground mt-2">Gestão da equipa de vendas.</p>
        </div>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 mt-2" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Representante
        </Button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="text-2xl font-display font-semibold mt-2">{isLoading ? "…" : k.value}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {!isLoading && reps.length === 0 && (
        <Card className="p-8 flex flex-col items-center gap-3 text-center">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold">Nenhuma representante encontrada</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Para adicionar Patrícia Oliveira, Cibele Arcoleze ou outras representantes, cria a conta
            no Supabase Authentication e atribui o role <span className="font-mono">representante</span>.
            Clica em "Nova Representante" para ver as instruções.
          </p>
        </Card>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reps.map((rep) => {
          const mySalons = salons.filter((s) => s.representante_id === rep.id);
          const myRevenue = [...salonSales, ...directSales]
            .filter((s) => s.representante_id === rep.id)
            .reduce((a, b) => a + Number(b.preco_final), 0);
          const myComm = [...salonSales, ...directSales]
            .filter((s) => s.representante_id === rep.id)
            .reduce((a, b) => a + Number(b.comissao_rep), 0);
          const myVisits = visits.filter((v) => v.representante_id === rep.id).length;
          const targetVisits = mySalons.length * 2;
          const progressPct = targetVisits > 0 ? Math.min(100, Math.round((myVisits / targetVisits) * 100)) : 0;

          return (
            <Card
              key={rep.id}
              className="p-5 cursor-pointer hover:shadow-md transition-shadow space-y-4"
              onClick={() => setSelected(rep)}
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display font-semibold text-base shrink-0">
                  {initials(rep.nome ?? "")}
                </div>
                <div>
                  <p className="font-semibold">{String(rep.nome || "—")}</p>
                  <p className="text-xs text-muted-foreground">{mySalons.length} salão{mySalons.length !== 1 ? "ões" : ""} atribuído{mySalons.length !== 1 ? "s" : ""}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Vendas do mês</p>
                  <p className="font-medium">{eur(myRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Comissão</p>
                  <p className="font-medium text-accent">{eur(myComm)}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Visitas este mês</span>
                  <span>{myVisits} / {targetVisits}</span>
                </div>
                <Progress value={progressPct} className="h-1.5" />
              </div>

              {mySalons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {mySalons.map((s) => {
                    const lv = data?.lastVisitKey[`${rep.id}:${s.id}`] ?? null;
                    const late = !lv || daysSince(lv) > 15;
                    return (
                      <Badge
                        key={s.id}
                        className={late
                          ? "bg-red-100 text-red-700 hover:bg-red-100 border border-red-200"
                          : "bg-green-100 text-green-700 hover:bg-green-100 border border-green-200"}
                      >
                        {String(s.nome || "—")}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </section>

      <RepSheet rep={selected} open={!!selected} onClose={() => setSelected(null)} />
      <NovaRepModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
