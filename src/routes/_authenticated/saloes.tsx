import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Store, AlertTriangle, Banknote, Coins, Plus, MapPin, Phone, User, Calendar } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saloes")({
  head: () => ({ meta: [{ title: "Salões — Secrets VIP" }] }),
  component: SaloesPage,
});

type Salon = {
  id: string;
  nome: string;
  ativo: boolean;
  morada: string | null;
  telefone: string | null;
  contacto_nome: string | null;
  representante_id: string | null;
  data_inicio_parceria: string | null;
  nota_interna: string | null;
};

type Rep = { id: string; nome: string };
type Visit = { id: string; data: string; notas: string | null; representante_id: string };
type Transfer = { id: string; data: string; quantidade: number; nota: string | null; produto_id: string };
type SalonSale = { id: string; data: string; preco_final: number; quantidade: number; comissao_salao: number; produto_id: string };
type Return = { id: string; data: string; quantidade: number; motivo: string | null; produto_id: string };

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-PT");
}

function daysSince(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function VisitBadge({ lastVisit }: { lastVisit: string | null }) {
  const days = daysSince(lastVisit);
  if (days === null) return <Badge variant="secondary">Sem visita</Badge>;
  if (days > 15) return <Badge className="bg-red-600 text-white hover:bg-red-600">Visita em atraso</Badge>;
  return <Badge className="bg-green-600 text-white hover:bg-green-600">Em dia</Badge>;
}

async function fetchSaloesData() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);
  const alert15 = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);

  const [
    { data: salons },
    { data: reps },
    { data: visits },
    { data: transfers },
    { data: sales },
    { data: products },
  ] = await Promise.all([
    supabase.from("salons").select("*").order("nome"),
    supabase.from("user_roles").select("user_id,role").eq("role", "representante"),
    supabase.from("salon_visit_log").select("*").order("data", { ascending: false }),
    supabase.from("transfers").select("*").gte("data", monthStart),
    supabase.from("salon_sales").select("*").order("data", { ascending: false }),
    supabase.from("products").select("id,nome"),
  ]);

  // fetch profiles for reps
  const repIds = (reps ?? []).map((r: any) => r.user_id);
  const { data: profiles } = repIds.length
    ? await supabase.from("profiles").select("id,nome").in("id", repIds)
    : { data: [] };

  const repList: Rep[] = (profiles ?? []).map((p: any) => ({ id: p.id, nome: p.nome }));
  const repMap = new Map(repList.map((r) => [r.id, r.nome]));
  const prodMap = new Map((products ?? []).map((p: any) => [p.id, p.nome]));

  // last visit per salon
  const lastVisitMap = new Map<string, string>();
  for (const v of visits ?? []) {
    if (!lastVisitMap.has(v.salon_id)) lastVisitMap.set(v.salon_id, v.data);
  }

  const activeSalons = (salons ?? []).filter((s: Salon) => s.ativo);
  const lateCount = activeSalons.filter((s: Salon) => {
    const lv = lastVisitMap.get(s.id) ?? null;
    return !lv || lv < alert15;
  }).length;

  const totalTransfers = (transfers ?? []).reduce((sum: number, t: any) => sum + 0, 0); // EUR unknown without price
  const transfersEur = 0; // transfers don't have price; show count instead

  const pendingCommissions = (sales ?? [])
    .filter((s: any) => !s.comissao_paga)
    .reduce((sum: number, s: any) => sum + Number(s.comissao_salao ?? 0), 0);

  return {
    salons: (salons ?? []) as Salon[],
    repList,
    repMap,
    prodMap,
    visits: (visits ?? []) as (Visit & { salon_id: string })[],
    transfers: (transfers ?? []) as (Transfer & { salon_id: string })[],
    sales: (sales ?? []) as (SalonSale & { salon_id: string })[],
    lastVisitMap,
    lateCount,
    pendingCommissions,
    monthStart,
  };
}

// ── Visit Modal ───────────────────────────────────────────────────────────────
function VisitModal({
  open,
  onClose,
  salonId,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");
  const [repId, setRepId] = useState("");
  const { data: saloesData } = useQuery({ queryKey: ["saloes"], queryFn: fetchSaloesData });

  useEffect(() => {
    if (open) { setData(new Date().toISOString().slice(0, 10)); setNotas(""); setRepId(""); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from("salon_visit_log").insert({
        salon_id: salonId,
        representante_id: repId || session?.user?.id,
        data,
        notas: notas.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      toast.success("Visita registada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const reps = saloesData?.repList ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registar Visita</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Representante</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>
                {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Observações da visita…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Salon Modal (create/edit) ─────────────────────────────────────────────────
function SalonModal({
  open,
  onClose,
  salon,
  reps,
}: {
  open: boolean;
  onClose: () => void;
  salon: Salon | null;
  reps: Rep[];
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [morada, setMorada] = useState("");
  const [telefone, setTelefone] = useState("");
  const [contacto, setContacto] = useState("");
  const [repId, setRepId] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (salon) {
      setNome(salon.nome);
      setMorada(salon.morada ?? "");
      setTelefone(salon.telefone ?? "");
      setContacto(salon.contacto_nome ?? "");
      setRepId(salon.representante_id ?? "");
      setDataInicio(salon.data_inicio_parceria ?? new Date().toISOString().slice(0, 10));
    } else {
      setNome(""); setMorada(""); setTelefone(""); setContacto(""); setRepId("");
      setDataInicio(new Date().toISOString().slice(0, 10));
    }
  }, [salon, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: nome.trim(),
        morada: morada.trim() || null,
        telefone: telefone.trim() || null,
        contacto_nome: contacto.trim() || null,
        representante_id: repId || null,
        data_inicio_parceria: dataInicio || null,
      };
      if (salon) {
        const { error } = await supabase.from("salons").update(payload).eq("id", salon.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("salons").insert({ ...payload, ativo: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      toast.success(salon ? "Salão actualizado." : "Salão criado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{salon ? "Editar Salão" : "Novo Salão"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do salão" />
          </div>
          <div className="space-y-1">
            <Label>Morada</Label>
            <Input value={morada} onChange={(e) => setMorada(e.target.value)} placeholder="Rua, nº, cidade" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+351 9XX XXX XXX" />
            </div>
            <div className="space-y-1">
              <Label>Contacto</Label>
              <Input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nome do responsável" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Representante</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger><SelectValue placeholder="Atribuir representante…" /></SelectTrigger>
              <SelectContent>
                {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Data início parceria</Label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => mutation.mutate()} disabled={!nome.trim() || mutation.isPending}>
            {mutation.isPending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Salon Sheet ───────────────────────────────────────────────────────────────
function SalonSheet({
  salon,
  onClose,
  data: d,
}: {
  salon: Salon | null;
  onClose: () => void;
  data: Awaited<ReturnType<typeof fetchSaloesData>> | undefined;
}) {
  const [visitOpen, setVisitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (!salon || !d) return null;

  const salonVisits = d.visits.filter((v) => v.salon_id === salon.id);
  const salonTransfers = d.transfers.filter((t) => t.salon_id === salon.id);
  const salonSales = d.sales.filter((s) => s.salon_id === salon.id);

  const monthSales = salonSales.filter((s) => s.data >= d.monthStart);
  const monthRevenue = monthSales.reduce((sum, s) => sum + Number(s.preco_final), 0);
  const pendingComm = salonSales.reduce((sum, s) => sum + Number(s.comissao_salao ?? 0), 0);
  const lastVisit = salonVisits[0]?.data ?? null;
  const stockCount = salonTransfers.length; // rough proxy

  const miniStats = [
    { label: "Transferências este mês", value: salonTransfers.length + " linhas" },
    { label: "Vendas do Mês", value: eur(monthRevenue) },
    { label: "Comissão Pendente", value: eur(pendingComm) },
    { label: "Última Visita", value: fmtDate(lastVisit) },
  ];

  return (
    <>
      <Sheet open={!!salon} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="text-xl">{salon.nome}</SheetTitle>
                <div className="flex flex-col gap-1 mt-2 text-sm text-muted-foreground">
                  {salon.morada && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {salon.morada}</span>}
                  {salon.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {salon.telefone}</span>}
                  {salon.contacto_nome && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {salon.contacto_nome}</span>}
                  {salon.representante_id && <span className="flex items-center gap-1"><User className="h-3 w-3" /> Rep: {d.repMap.get(salon.representante_id) ?? "—"}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 mt-1">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Editar</Button>
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setVisitOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Visita
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {miniStats.map((s) => (
              <Card key={s.label} className="p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-semibold mt-1">{s.value}</p>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="visitas">
            <TabsList className="w-full grid grid-cols-4 mb-4">
              <TabsTrigger value="transferencias">Transfer.</TabsTrigger>
              <TabsTrigger value="vendas">Vendas</TabsTrigger>
              <TabsTrigger value="devolucoes">Devol.</TabsTrigger>
              <TabsTrigger value="visitas">Visitas</TabsTrigger>
            </TabsList>

            <TabsContent value="transferencias">
              {salonTransfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem transferências este mês.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground">Data</TableHead>
                      <TableHead className="text-primary-foreground">Produto</TableHead>
                      <TableHead className="text-primary-foreground text-right">Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salonTransfers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{fmtDate(t.data)}</TableCell>
                        <TableCell>{d.prodMap.get(t.produto_id) ?? t.produto_id}</TableCell>
                        <TableCell className="text-right">{t.quantidade}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="vendas">
              {salonSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem vendas registadas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground">Data</TableHead>
                      <TableHead className="text-primary-foreground">Produto</TableHead>
                      <TableHead className="text-primary-foreground text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salonSales.slice(0, 30).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{fmtDate(s.data)}</TableCell>
                        <TableCell>{d.prodMap.get(s.produto_id) ?? s.produto_id}</TableCell>
                        <TableCell className="text-right">{eur(Number(s.preco_final))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="devolucoes">
              <p className="text-sm text-muted-foreground">Sem devoluções registadas.</p>
            </TabsContent>

            <TabsContent value="visitas">
              {salonVisits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem visitas registadas.</p>
              ) : (
                <div className="space-y-2">
                  {salonVisits.map((v) => (
                    <Card key={v.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{fmtDate(v.data)}</span>
                        <span className="text-xs text-muted-foreground">{d.repMap.get(v.representante_id) ?? "—"}</span>
                      </div>
                      {v.notas && <p className="text-xs text-muted-foreground mt-1">{v.notas}</p>}
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <VisitModal open={visitOpen} onClose={() => setVisitOpen(false)} salonId={salon.id} />
      <SalonModal open={editOpen} onClose={() => setEditOpen(false)} salon={salon} reps={d.repList} />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const SEED_SALONS = ["Made in Brasil", "Brooklyn Barber Studio", "Andrade Hair", "Kesia Nails"];

function SaloesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["saloes"], queryFn: fetchSaloesData });

  const [selected, setSelected] = useState<Salon | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const salons = data?.salons ?? [];
  const activeSalons = salons.filter((s) => s.ativo);

  const seedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("salons").insert(
        SEED_SALONS.map((nome) => ({ nome, ativo: true })),
      );
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saloes"] }); toast.success("Salões criados."); },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const kpis = [
    { label: "Salões Activos", value: activeSalons.length, icon: Store },
    { label: "Visitas em Atraso", value: data?.lateCount ?? "—", icon: AlertTriangle },
    { label: "Transf. este mês", value: data ? data.transfers.length + " linhas" : "—", icon: Banknote },
    { label: "Comissões Pendentes", value: data ? eur(data.pendingCommissions) : "—", icon: Coins },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Parceiros</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Salões</h1>
          <p className="text-muted-foreground mt-2">Gestão de salões parceiros e visitas.</p>
        </div>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 mt-2" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Salão
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

      {!isLoading && salons.length === 0 && (
        <Card className="p-8 flex flex-col items-center gap-3 text-center">
          <Store className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold">Nenhum salão encontrado</p>
          <p className="text-sm text-muted-foreground">Crie os salões iniciais ou adicione um novo.</p>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90 mt-2"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? "A criar…" : "Criar salões iniciais"}
          </Button>
        </Card>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {salons.map((salon) => {
          const lastVisit = data?.lastVisitMap.get(salon.id) ?? null;
          const repName = salon.representante_id ? data?.repMap.get(salon.representante_id) : null;
          return (
            <Card
              key={salon.id}
              className="p-5 cursor-pointer hover:shadow-md transition-shadow space-y-3"
              onClick={() => setSelected(salon)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-base leading-tight">{salon.nome}</p>
                <VisitBadge lastVisit={lastVisit} />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                {salon.morada && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> {salon.morada}
                  </p>
                )}
                {repName && (
                  <p className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 shrink-0" /> {repName}
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  Última visita: {fmtDate(lastVisit)}
                </p>
              </div>
            </Card>
          );
        })}
      </section>

      <SalonSheet salon={selected} onClose={() => setSelected(null)} data={data} />
      <SalonModal open={newOpen} onClose={() => setNewOpen(false)} salon={null} reps={data?.repList ?? []} />
    </div>
  );
}
