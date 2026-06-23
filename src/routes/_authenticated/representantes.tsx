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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-PT");
}

function initials(nome: string) {
  return nome.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

async function fetchRepData() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);

  const [{ data: roles }, { data: salons }, { data: salonSales }, { data: directSales }, { data: visits }] =
    await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "representante"),
      supabase.from("salons").select("id,nome,representante_id").eq("ativo", true).order("nome"),
      supabase.from("salon_sales").select("*").gte("data", monthStart),
      supabase.from("rep_direct_sales").select("*").gte("data", monthStart),
      supabase.from("salon_visit_log").select("*").gte("data", monthStart).order("data", { ascending: false }),
    ]);

  const userIds = (roles ?? []).map((r: any) => r.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id,nome,email").in("id", userIds)
    : { data: [] };
  console.log('PROFILES:', profiles);

  const reps: Rep[] = (profiles ?? []).map((p: any) => ({ id: p.id, nome: p.nome, email: p.email }));
  const prodIds = [
    ...new Set([
      ...(salonSales ?? []).map((s: any) => s.produto_id),
      ...(directSales ?? []).map((s: any) => s.produto_id),
    ]),
  ];
  const { data: products } = prodIds.length
    ? await supabase.from("products").select("id,nome").in("id", prodIds)
    : { data: [] };

  const prodMap = new Map((products ?? []).map((p: any) => [p.id, p.nome]));
  const salonMap = new Map((salons ?? []).map((s: Salon) => [s.id, s.nome]));

  // all-time visits for "last visit" per salon per rep
  const { data: allVisits } = await supabase
    .from("salon_visit_log")
    .select("representante_id,salon_id,data")
    .order("data", { ascending: false });

  const lastVisitKey = new Map<string, string>(); // `${repId}:${salonId}` → date
  for (const v of allVisits ?? []) {
    const key = `${v.representante_id}:${v.salon_id}`;
    if (!lastVisitKey.has(key)) lastVisitKey.set(key, v.data);
  }

  return {
    reps,
    salons: (salons ?? []) as Salon[],
    salonSales: (salonSales ?? []) as SalonSale[],
    directSales: (directSales ?? []) as DirectSale[],
    visits: (visits ?? []) as Visit[],
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
              {available.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
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
  onClose,
  d,
}: {
  rep: Rep | null;
  onClose: () => void;
  d: Awaited<ReturnType<typeof fetchRepData>> | undefined;
}) {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);

  if (!rep || !d) return null;

  const mySalons = d.salons.filter((s) => s.representante_id === rep.id);
  const mySalonSales = d.salonSales.filter((s) => s.representante_id === rep.id);
  const myDirectSales = d.directSales.filter((s) => s.representante_id === rep.id);
  const myVisits = d.visits.filter((v) => v.representante_id === rep.id);

  const salonRevenue = mySalonSales.reduce((s, r) => s + Number(r.preco_final), 0);
  const directRevenue = myDirectSales.reduce((s, r) => s + Number(r.preco_final), 0);
  const totalComm = [
    ...mySalonSales.map((s) => Number(s.comissao_rep)),
    ...myDirectSales.map((s) => Number(s.comissao_rep)),
  ].reduce((a, b) => a + b, 0);

  const removeSalonMutation = useMutation({
    mutationFn: async (salonId: string) => {
      const { error } = await supabase.from("salons").update({ representante_id: null }).eq("id", salonId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["representantes"] }); toast.success("Reatribuído."); },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <>
      <Sheet open={!!rep} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display font-semibold text-lg shrink-0">
                {initials(rep.nome)}
              </div>
              <div>
                <SheetTitle>{rep.nome}</SheetTitle>
                <p className="text-sm text-muted-foreground">{rep.email}</p>
              </div>
            </div>
          </SheetHeader>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Vendas salões</p>
              <p className="font-semibold mt-1 text-sm">{eur(salonRevenue)}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Vendas directas</p>
              <p className="font-semibold mt-1 text-sm">{eur(directRevenue)}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Comissão total</p>
              <p className="font-semibold mt-1 text-sm text-accent">{eur(totalComm)}</p>
            </Card>
          </div>

          <Tabs defaultValue="saloes">
            <TabsList className="w-full grid grid-cols-4 mb-4">
              <TabsTrigger value="saloes">Salões</TabsTrigger>
              <TabsTrigger value="vsaloes">Vnd. Salão</TabsTrigger>
              <TabsTrigger value="vdiretas">Vnd. Dir.</TabsTrigger>
              <TabsTrigger value="visitas">Visitas</TabsTrigger>
            </TabsList>

            <TabsContent value="saloes">
              <div className="space-y-2 mb-3">
                {mySalons.length === 0 && <p className="text-sm text-muted-foreground">Nenhum salão atribuído.</p>}
                {mySalons.map((s) => {
                  const lv = d.lastVisitKey.get(`${rep.id}:${s.id}`) ?? null;
                  const late = !lv || daysSince(lv) > 15;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.nome}</span>
                        {late
                          ? <Badge className="bg-red-600 text-white hover:bg-red-600 text-xs">Atraso</Badge>
                          : <Badge className="bg-green-600 text-white hover:bg-green-600 text-xs">Em dia</Badge>}
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => removeSalonMutation.mutate(s.id)}>
                        Remover
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar salão
              </Button>
            </TabsContent>

            <TabsContent value="vsaloes">
              {mySalonSales.length === 0
                ? <p className="text-sm text-muted-foreground">Sem vendas em salões este mês.</p>
                : <Table>
                    <TableHeader>
                      <TableRow className="bg-primary hover:bg-primary">
                        <TableHead className="text-primary-foreground">Data</TableHead>
                        <TableHead className="text-primary-foreground">Salão</TableHead>
                        <TableHead className="text-primary-foreground">Produto</TableHead>
                        <TableHead className="text-primary-foreground text-right">Valor</TableHead>
                        <TableHead className="text-primary-foreground text-right">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mySalonSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{fmtDate(s.data)}</TableCell>
                          <TableCell>{d.salonMap.get(s.salon_id) ?? "—"}</TableCell>
                          <TableCell>{d.prodMap.get(s.produto_id) ?? "—"}</TableCell>
                          <TableCell className="text-right">{eur(Number(s.preco_final))}</TableCell>
                          <TableCell className="text-right">{eur(Number(s.comissao_rep))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              }
            </TabsContent>

            <TabsContent value="vdiretas">
              {myDirectSales.length === 0
                ? <p className="text-sm text-muted-foreground">Sem vendas directas este mês.</p>
                : <Table>
                    <TableHeader>
                      <TableRow className="bg-primary hover:bg-primary">
                        <TableHead className="text-primary-foreground">Data</TableHead>
                        <TableHead className="text-primary-foreground">Produto</TableHead>
                        <TableHead className="text-primary-foreground">Cliente</TableHead>
                        <TableHead className="text-primary-foreground text-right">Valor</TableHead>
                        <TableHead className="text-primary-foreground text-right">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myDirectSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{fmtDate(s.data)}</TableCell>
                          <TableCell>{d.prodMap.get(s.produto_id) ?? "—"}</TableCell>
                          <TableCell>{s.cliente_nome ?? "—"}</TableCell>
                          <TableCell className="text-right">{eur(Number(s.preco_final))}</TableCell>
                          <TableCell className="text-right">{eur(Number(s.comissao_rep))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              }
            </TabsContent>

            <TabsContent value="visitas">
              {myVisits.length === 0
                ? <p className="text-sm text-muted-foreground">Sem visitas este mês.</p>
                : <div className="space-y-2">
                    {myVisits.map((v) => (
                      <Card key={v.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{fmtDate(v.data)}</span>
                          <span className="text-xs text-muted-foreground">{d.salonMap.get(v.salon_id) ?? "—"}</span>
                        </div>
                        {v.notas && <p className="text-xs text-muted-foreground mt-1">{v.notas}</p>}
                      </Card>
                    ))}
                  </div>
              }
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AssignSalonModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        repId={rep.id}
        salons={d.salons}
        assigned={mySalons.map((s) => s.id)}
      />
    </>
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
                  {initials(rep.nome)}
                </div>
                <div>
                  <p className="font-semibold">{rep.nome}</p>
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
                    const lv = data?.lastVisitKey.get(`${rep.id}:${s.id}`) ?? null;
                    const late = !lv || daysSince(lv) > 15;
                    return (
                      <Badge
                        key={s.id}
                        className={late
                          ? "bg-red-100 text-red-700 hover:bg-red-100 border border-red-200"
                          : "bg-green-100 text-green-700 hover:bg-green-100 border border-green-200"}
                      >
                        {s.nome}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </section>

      <RepSheet rep={selected} onClose={() => setSelected(null)} d={data} />
      <NovaRepModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
