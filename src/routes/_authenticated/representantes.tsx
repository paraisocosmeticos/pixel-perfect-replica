import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Coins,
  CalendarCheck,
  TrendingUp,
  Plus,
  AlertTriangle,
  Store,
  X,
  Info,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/representantes")({
  head: () => ({
    meta: [
      { title: "Representantes — Secrets VIP" },
      { name: "description", content: "Gestão de representantes, vendas e comissões." },
    ],
  }),
  component: RepresentantesPage,
});

type Profile = Tables<"profiles">;
type Salon = Tables<"salons">;

type RepSalon = { id: string; nome: string; ultima_visita: string | null };

type RepCard = {
  id: string;
  nome: string;
  email: string;
  saloes: RepSalon[];
  vendas_saloes_mes: number;
  vendas_diretas_mes: number;
  comissao_mes: number;
  visitas_mes: number;
};

type RepDetail = {
  vendas_saloes: number;
  vendas_diretas: number;
  comissao_total: number;
};

const VISIT_ALERT_DAYS = 15;
const VISITAS_POR_SALAO = 2;

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-PT");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86_400_000);
}

function initials(nome: string) {
  return nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchRepData(): Promise<{
  reps: RepCard[];
  allSalons: Pick<Salon, "id" | "nome" | "representante_id">[];
}> {
  const ms = monthStart();

  const [
    { data: roles, error: rErr },
    { data: salons, error: sErr },
    { data: salonSales, error: ssErr },
    { data: directSales, error: dsErr },
    { data: visits, error: vErr },
    { data: allVisits, error: avErr },
  ] = await Promise.all([
    supabase
      .from("user_roles")
      .select("user_id, profiles(id, nome, email)")
      .eq("role", "representante"),
    supabase
      .from("salons")
      .select("id, nome, representante_id")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("salon_sales")
      .select("representante_id, preco_final, comissao_rep")
      .gte("data", ms),
    supabase
      .from("rep_direct_sales")
      .select("representante_id, preco_final, comissao_rep")
      .gte("data", ms),
    supabase
      .from("salon_visit_log")
      .select("representante_id, salon_id, data")
      .gte("data", ms),
    supabase
      .from("salon_visit_log")
      .select("representante_id, salon_id, data")
      .order("data", { ascending: false }),
  ]);

  if (rErr) throw rErr;
  if (sErr) throw sErr;
  if (ssErr) throw ssErr;
  if (dsErr) throw dsErr;
  if (vErr) throw vErr;
  if (avErr) throw avErr;

  // latest visit per (rep, salon)
  const latestVisit = new Map<string, string>();
  for (const v of allVisits ?? []) {
    const key = `${v.representante_id}::${v.salon_id}`;
    if (!latestVisit.has(key)) latestVisit.set(key, v.data);
  }

  // aggregate by rep
  const salonSalesMap = new Map<string, { vendas: number; comissao: number }>();
  for (const s of salonSales ?? []) {
    if (!s.representante_id) continue;
    const cur = salonSalesMap.get(s.representante_id) ?? { vendas: 0, comissao: 0 };
    salonSalesMap.set(s.representante_id, {
      vendas: cur.vendas + Number(s.preco_final),
      comissao: cur.comissao + Number(s.comissao_rep),
    });
  }

  const directSalesMap = new Map<string, { vendas: number; comissao: number }>();
  for (const d of directSales ?? []) {
    const cur = directSalesMap.get(d.representante_id) ?? { vendas: 0, comissao: 0 };
    directSalesMap.set(d.representante_id, {
      vendas: cur.vendas + Number(d.preco_final),
      comissao: cur.comissao + Number(d.comissao_rep),
    });
  }

  const visitCountMap = new Map<string, number>();
  for (const v of visits ?? []) {
    visitCountMap.set(v.representante_id, (visitCountMap.get(v.representante_id) ?? 0) + 1);
  }

  // group salons by rep
  const salonsByRep = new Map<string, RepSalon[]>();
  for (const s of salons ?? []) {
    if (!s.representante_id) continue;
    const list = salonsByRep.get(s.representante_id) ?? [];
    list.push({
      id: s.id,
      nome: s.nome,
      ultima_visita: latestVisit.get(`${s.representante_id}::${s.id}`) ?? null,
    });
    salonsByRep.set(s.representante_id, list);
  }

  const reps: RepCard[] = (roles ?? [])
    .map((r: any) => r.profiles)
    .filter(Boolean)
    .map((p: any) => {
      const ss = salonSalesMap.get(p.id) ?? { vendas: 0, comissao: 0 };
      const ds = directSalesMap.get(p.id) ?? { vendas: 0, comissao: 0 };
      return {
        id: p.id,
        nome: p.nome,
        email: p.email,
        saloes: salonsByRep.get(p.id) ?? [],
        vendas_saloes_mes: ss.vendas,
        vendas_diretas_mes: ds.vendas,
        comissao_mes: ss.comissao + ds.comissao,
        visitas_mes: visitCountMap.get(p.id) ?? 0,
      };
    });

  const allSalons = (salons ?? []).map((s) => ({
    id: s.id,
    nome: s.nome,
    representante_id: s.representante_id,
  }));

  return { reps, allSalons };
}

async function fetchRepTabs(repId: string) {
  const [
    { data: saloes, error: sErr },
    { data: salonSales, error: ssErr },
    { data: directSales, error: dsErr },
    { data: visits, error: vErr },
  ] = await Promise.all([
    supabase
      .from("salons")
      .select("id, nome, morada, ativo")
      .eq("representante_id", repId)
      .order("nome"),
    supabase
      .from("salon_sales")
      .select("id, data, preco_final, comissao_rep, quantidade, salons(nome), products(nome)")
      .eq("representante_id", repId)
      .order("data", { ascending: false })
      .limit(100),
    supabase
      .from("rep_direct_sales")
      .select("id, data, preco_final, comissao_rep, quantidade, cliente_nome, products(nome)")
      .eq("representante_id", repId)
      .order("data", { ascending: false })
      .limit(100),
    supabase
      .from("salon_visit_log")
      .select("id, data, notas, salons(nome)")
      .eq("representante_id", repId)
      .order("data", { ascending: false })
      .limit(100),
  ]);

  if (sErr) throw sErr;
  if (ssErr) throw ssErr;
  if (dsErr) throw dsErr;
  if (vErr) throw vErr;

  return {
    saloes: (saloes ?? []) as any[],
    salonSales: (salonSales ?? []) as any[],
    directSales: (directSales ?? []) as any[],
    visits: (visits ?? []) as any[],
  };
}

// ─── Atribuir / Remover Salão ─────────────────────────────────────────────────

function AtribuirSalaoModal({
  open,
  onClose,
  rep,
  allSalons,
}: {
  open: boolean;
  onClose: () => void;
  rep: RepCard;
  allSalons: Pick<Salon, "id" | "nome" | "representante_id">[];
}) {
  const qc = useQueryClient();
  const [selectedSalon, setSelectedSalon] = useState("");

  const unassigned = allSalons.filter(
    (s) => !s.representante_id || s.representante_id === rep.id
  );

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSalon) throw new Error("Selecciona um salão.");
      const { error } = await supabase
        .from("salons")
        .update({ representante_id: rep.id })
        .eq("id", selectedSalon);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep-data"] });
      qc.invalidateQueries({ queryKey: ["rep-tabs", rep.id] });
      toast.success("Salão atribuído.");
      setSelectedSalon("");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atribuir salão."),
  });

  const removeMutation = useMutation({
    mutationFn: async (salonId: string) => {
      const { error } = await supabase
        .from("salons")
        .update({ representante_id: null })
        .eq("id", salonId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep-data"] });
      qc.invalidateQueries({ queryKey: ["rep-tabs", rep.id] });
      toast.success("Salão removido.");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover salão."),
  });

  const free = allSalons.filter((s) => !s.representante_id);
  const assigned = rep.saloes;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Gerir Salões — {rep.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {/* Currently assigned */}
          <div>
            <p className="text-sm font-medium mb-2">Salões atribuídos</p>
            {assigned.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum salão atribuído.</p>
            )}
            <ul className="space-y-1">
              {assigned.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                  <span className="text-sm">{s.nome}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(s.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          {/* Add salon */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Adicionar salão</p>
            <div className="flex gap-2">
              <Select value={selectedSalon} onValueChange={setSelectedSalon}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar salão disponível…" />
                </SelectTrigger>
                <SelectContent>
                  {free.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                  {free.length === 0 && (
                    <SelectItem value="__none__" disabled>Sem salões disponíveis</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={() => assignMutation.mutate()}
                disabled={!selectedSalon || assignMutation.isPending}
                className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
              >
                Atribuir
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Nova Representante Modal ─────────────────────────────────────────────────

function NovaRepModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Adicionar Representante</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground mb-1">Como criar uma nova representante</p>
              <p>
                A criação de utilizadores requer acesso ao painel Supabase ou uma Edge Function
                com a chave <code className="bg-background px-1 rounded text-xs">service_role</code>.
              </p>
              <ol className="mt-2 space-y-1 list-decimal list-inside">
                <li>Acede ao painel Supabase → Authentication → Users</li>
                <li>Clica em "Invite user" ou "Create user"</li>
                <li>Preenche o email e uma password temporária</li>
                <li>Na tabela <code className="bg-background px-1 rounded text-xs">user_roles</code>, confirma que o role é <strong>representante</strong></li>
                <li>A utilizadora aparece aqui automaticamente após login</li>
              </ol>
              <p className="mt-2 font-medium text-foreground">Representantes a criar:</p>
              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                <li>Patrícia Oliveira</li>
                <li>Cibele Arcoleze</li>
              </ul>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rep Sheet ────────────────────────────────────────────────────────────────

function RepSheet({
  rep,
  onClose,
  allSalons,
}: {
  rep: RepCard | null;
  onClose: () => void;
  allSalons: Pick<Salon, "id" | "nome" | "representante_id">[];
}) {
  const [atribuirOpen, setAtribuirOpen] = useState(false);

  const { data: tabs, isLoading: tabsLoading } = useQuery({
    queryKey: ["rep-tabs", rep?.id],
    queryFn: () => fetchRepTabs(rep!.id),
    enabled: !!rep,
  });

  if (!rep) return null;

  const vendas_total = rep.vendas_saloes_mes + rep.vendas_diretas_mes;
  const visitas_previstas = rep.saloes.length * VISITAS_POR_SALAO;
  const progresso = visitas_previstas > 0
    ? Math.min(100, Math.round((rep.visitas_mes / visitas_previstas) * 100))
    : 0;

  const detailKpis = [
    { label: "Vendas em Salões", value: eur(rep.vendas_saloes_mes) },
    { label: "Vendas Directas", value: eur(rep.vendas_diretas_mes) },
    { label: "Comissão Total", value: eur(rep.comissao_mes), highlight: true },
    { label: "Salões Atribuídos", value: String(rep.saloes.length) },
  ];

  return (
    <>
      <Sheet open={!!rep} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xl font-display font-semibold shrink-0">
                {initials(rep.nome)}
              </div>
              <div>
                <SheetTitle className="font-display text-2xl">{rep.nome}</SheetTitle>
                <p className="text-sm text-muted-foreground">{rep.email}</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">Visitas este mês</span>
                <span className="font-medium">{rep.visitas_mes} / {visitas_previstas}</span>
              </div>
              <Progress value={progresso} className="h-2" />
            </div>
          </SheetHeader>

          {/* Mini KPIs */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {detailKpis.map((k) => (
              <Card key={k.label} className={`p-4 ${k.highlight ? "border-accent/50" : ""}`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className={`text-xl font-display font-semibold mt-1 ${k.highlight ? "text-accent" : ""}`}>
                  {k.value}
                </p>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="saloes">
            <TabsList className="w-full">
              <TabsTrigger value="saloes" className="flex-1">Salões</TabsTrigger>
              <TabsTrigger value="vendas-saloes" className="flex-1">Vendas Salões</TabsTrigger>
              <TabsTrigger value="vendas-diretas" className="flex-1">Directas</TabsTrigger>
              <TabsTrigger value="visitas" className="flex-1">Visitas</TabsTrigger>
            </TabsList>

            {/* Salões atribuídos */}
            <TabsContent value="saloes" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAtribuirOpen(true)}
                >
                  <Store className="h-4 w-4 mr-1" />
                  Gerir Salões
                </Button>
              </div>
              {rep.saloes.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Nenhum salão atribuído.</p>
              )}
              {rep.saloes.map((s) => {
                const dias = daysSince(s.ultima_visita);
                const atrasada = dias === null || dias > VISIT_ALERT_DAYS;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium text-sm">{s.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.ultima_visita
                          ? `Última visita: ${fmtDate(s.ultima_visita)}`
                          : "Sem visitas registadas"}
                      </p>
                    </div>
                    {atrasada ? (
                      <Badge className="bg-destructive text-destructive-foreground text-xs">
                        Em atraso
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-600 text-white text-xs">Em dia</Badge>
                    )}
                  </div>
                );
              })}
            </TabsContent>

            {/* Vendas em salões */}
            <TabsContent value="vendas-saloes" className="mt-4">
              {tabsLoading && <p className="text-sm text-muted-foreground py-4">A carregar…</p>}
              {!tabsLoading && tabs?.salonSales.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sem vendas em salões.</p>
              )}
              {tabs && tabs.salonSales.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Salão</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Produto</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Valor</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabs.salonSales.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{fmtDate(s.data)}</TableCell>
                        <TableCell>{s.salons?.nome ?? "—"}</TableCell>
                        <TableCell>{s.products?.nome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{eur(Number(s.preco_final))}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge className="bg-accent text-accent-foreground text-xs">
                            {eur(Number(s.comissao_rep))}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Vendas directas */}
            <TabsContent value="vendas-diretas" className="mt-4">
              {tabsLoading && <p className="text-sm text-muted-foreground py-4">A carregar…</p>}
              {!tabsLoading && tabs?.directSales.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sem vendas directas.</p>
              )}
              {tabs && tabs.directSales.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Produto</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Cliente</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Valor</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabs.directSales.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{fmtDate(d.data)}</TableCell>
                        <TableCell>{d.products?.nome ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{d.cliente_nome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{eur(Number(d.preco_final))}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge className="bg-accent text-accent-foreground text-xs">
                            {eur(Number(d.comissao_rep))}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Visitas */}
            <TabsContent value="visitas" className="mt-4">
              {tabsLoading && <p className="text-sm text-muted-foreground py-4">A carregar…</p>}
              {!tabsLoading && tabs?.visits.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sem visitas registadas.</p>
              )}
              {tabs && tabs.visits.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Salão</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabs.visits.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{fmtDate(v.data)}</TableCell>
                        <TableCell>{v.salons?.nome ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.notas ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AtribuirSalaoModal
        open={atribuirOpen}
        onClose={() => setAtribuirOpen(false)}
        rep={rep}
        allSalons={allSalons}
      />
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function RepresentantesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["rep-data"],
    queryFn: fetchRepData,
  });

  const reps = data?.reps ?? [];
  const allSalons = data?.allSalons ?? [];

  const [search, setSearch] = useState("");
  const [selectedRep, setSelectedRep] = useState<RepCard | null>(null);
  const [novaRepOpen, setNovaRepOpen] = useState(false);

  const filtered = useMemo(
    () =>
      reps.filter(
        (r) =>
          !search ||
          r.nome.toLowerCase().includes(search.toLowerCase()) ||
          r.email.toLowerCase().includes(search.toLowerCase())
      ),
    [reps, search]
  );

  // Page-level KPIs
  const totalReps = reps.length;
  const totalVendas = reps.reduce(
    (s, r) => s + r.vendas_saloes_mes + r.vendas_diretas_mes,
    0
  );
  const totalComissoes = reps.reduce((s, r) => s + r.comissao_mes, 0);
  const totalVisitas = reps.reduce((s, r) => s + r.visitas_mes, 0);

  const kpis = [
    { label: "Representantes Activas", value: isLoading ? "…" : totalReps, icon: Users },
    { label: "Vendas Totais este Mês", value: isLoading ? "…" : eur(totalVendas), icon: TrendingUp },
    { label: "Comissões a Pagar", value: isLoading ? "…" : eur(totalComissoes), icon: Coins },
    { label: "Visitas Realizadas", value: isLoading ? "…" : totalVisitas, icon: CalendarCheck },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Equipa</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Representantes</h1>
          <p className="text-muted-foreground mt-2">Desempenho, comissões e gestão de visitas.</p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
          onClick={() => setNovaRepOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Representante
        </Button>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="text-2xl font-display font-semibold mt-2">{k.value}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {/* Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Pesquisar representante…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} representante{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Empty state with seed notice */}
      {!isLoading && reps.length === 0 && (
        <Card className="p-6 border-dashed">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Nenhuma representante encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                As representantes são utilizadoras com o role <strong>representante</strong>.
                Cria as utilizadoras no painel Supabase (Authentication → Users) e o perfil
                aparece aqui automaticamente após o primeiro login.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Representantes a criar: <strong>Patrícia Oliveira</strong> e <strong>Cibele Arcoleze</strong>.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setNovaRepOpen(true)}
              >
                Ver instruções
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-5 animate-pulse h-48" />
          ))}
        </div>
      )}

      {/* Rep cards */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((rep) => {
            const visitas_previstas = rep.saloes.length * VISITAS_POR_SALAO;
            const progresso =
              visitas_previstas > 0
                ? Math.min(100, Math.round((rep.visitas_mes / visitas_previstas) * 100))
                : 0;
            const vendas_total = rep.vendas_saloes_mes + rep.vendas_diretas_mes;
            const saloesEmAtraso = rep.saloes.filter((s) => {
              const d = daysSince(s.ultima_visita);
              return d === null || d > VISIT_ALERT_DAYS;
            });

            return (
              <Card
                key={rep.id}
                className="p-5 shadow-card cursor-pointer hover:shadow-md transition-shadow border hover:border-accent/50"
                onClick={() => setSelectedRep(rep)}
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-11 w-11 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-display font-semibold shrink-0">
                    {initials(rep.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold truncate">{rep.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">{rep.email}</p>
                  </div>
                  <Badge className="bg-accent text-accent-foreground shrink-0">
                    {rep.saloes.length} salão{rep.saloes.length !== 1 ? "ões" : ""}
                  </Badge>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Vendas mês</p>
                    <p className="font-display font-semibold mt-0.5">{eur(vendas_total)}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Comissão</p>
                    <p className="font-display font-semibold mt-0.5 text-accent">
                      {eur(rep.comissao_mes)}
                    </p>
                  </div>
                </div>

                {/* Visitas progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Visitas este mês</span>
                    <span>{rep.visitas_mes} / {visitas_previstas}</span>
                  </div>
                  <Progress value={progresso} className="h-1.5" />
                </div>

                {/* Salões list */}
                {rep.saloes.length > 0 && (
                  <div className="space-y-1 pt-3 border-t">
                    {rep.saloes.slice(0, 4).map((s) => {
                      const d = daysSince(s.ultima_visita);
                      const atrasada = d === null || d > VISIT_ALERT_DAYS;
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-2">
                          <p className="text-xs truncate">{s.nome}</p>
                          {atrasada ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                    {rep.saloes.length > 4 && (
                      <p className="text-xs text-muted-foreground">
                        +{rep.saloes.length - 4} mais…
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <RepSheet
        rep={selectedRep}
        onClose={() => setSelectedRep(null)}
        allSalons={allSalons}
      />
      <NovaRepModal open={novaRepOpen} onClose={() => setNovaRepOpen(false)} />
    </div>
  );
}
