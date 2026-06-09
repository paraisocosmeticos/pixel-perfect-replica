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
import { Textarea } from "@/components/ui/textarea";
import {
  Store,
  AlertTriangle,
  Coins,
  ArrowRightLeft,
  Plus,
  CalendarDays,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  Seedling,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/saloes")({
  head: () => ({
    meta: [
      { title: "Salões — Secrets VIP" },
      { name: "description", content: "Gestão de salões parceiros e visitas." },
    ],
  }),
  component: SaloesPage,
});

type Salon = Tables<"salons">;
type Profile = Tables<"profiles">;

type SalonCard = {
  id: string;
  nome: string;
  morada: string | null;
  telefone: string | null;
  contacto_nome: string | null;
  representante_id: string | null;
  representante_nome: string | null;
  data_inicio_parceria: string | null;
  ultima_visita: string | null;
  ativo: boolean;
};

type SalonDetail = {
  stock_unidades: number;
  vendas_mes: number;
  comissao_pendente: number;
  ultima_visita: string | null;
};

const VISIT_ALERT_DAYS = 15;
const SEED_SALONS = [
  { nome: "Made in Brasil" },
  { nome: "Brooklyn Barber Studio" },
  { nome: "Andrade Hair" },
  { nome: "Kesia Nails" },
];

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
  const diff = Date.now() - new Date(iso + "T00:00:00").getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchSaloes(): Promise<SalonCard[]> {
  const [
    { data: salons, error: sErr },
    { data: visits, error: vErr },
  ] = await Promise.all([
    supabase
      .from("salons")
      .select("id, nome, morada, telefone, contacto_nome, representante_id, data_inicio_parceria, ativo, profiles(nome)")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("salon_visit_log")
      .select("salon_id, data")
      .order("data", { ascending: false }),
  ]);
  if (sErr) throw sErr;
  if (vErr) throw vErr;

  // latest visit per salon
  const latestVisit = new Map<string, string>();
  for (const v of visits ?? []) {
    if (!latestVisit.has(v.salon_id)) latestVisit.set(v.salon_id, v.data);
  }

  return (salons ?? []).map((s: any) => ({
    id: s.id,
    nome: s.nome,
    morada: s.morada,
    telefone: s.telefone,
    contacto_nome: s.contacto_nome,
    representante_id: s.representante_id,
    representante_nome: s.profiles?.nome ?? null,
    data_inicio_parceria: s.data_inicio_parceria,
    ultima_visita: latestVisit.get(s.id) ?? null,
    ativo: s.ativo,
  }));
}

async function fetchKpiExtras() {
  const ms = monthStart();
  const [
    { data: transfers, error: tErr },
    { data: commissions, error: cErr },
  ] = await Promise.all([
    supabase
      .from("transfers")
      .select("quantidade, products(preco_custo)")
      .gte("data", ms),
    supabase
      .from("commission_payments")
      .select("valor")
      .eq("destinatario_tipo", "salao")
      .eq("status", "pendente"),
  ]);
  if (tErr) throw tErr;
  if (cErr) throw cErr;

  const transfersEur = (transfers ?? []).reduce((s: number, t: any) => {
    return s + t.quantidade * Number(t.products?.preco_custo ?? 0);
  }, 0);

  const comissoesPendentes = (commissions ?? []).reduce(
    (s, c) => s + Number(c.valor),
    0
  );

  return { transfersEur, comissoesPendentes };
}

async function fetchReps(): Promise<Pick<Profile, "id" | "nome">[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, profiles(id, nome)")
    .eq("role", "representante");
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.profiles)
    .filter(Boolean) as Pick<Profile, "id" | "nome">[];
}

async function fetchSalonDetail(salonId: string): Promise<SalonDetail> {
  const ms = monthStart();
  const [
    { data: trf, error: tErr },
    { data: ret, error: rErr },
    { data: sales, error: sErr },
    { data: commissions, error: cErr },
    { data: visits, error: vErr },
  ] = await Promise.all([
    supabase.from("transfers").select("quantidade").eq("salon_id", salonId),
    supabase.from("returns").select("quantidade").eq("salon_id", salonId),
    supabase
      .from("salon_sales")
      .select("preco_final")
      .eq("salon_id", salonId)
      .gte("data", ms),
    supabase
      .from("commission_payments")
      .select("valor")
      .eq("destinatario_id", salonId)
      .eq("destinatario_tipo", "salao")
      .eq("status", "pendente"),
    supabase
      .from("salon_visit_log")
      .select("data")
      .eq("salon_id", salonId)
      .order("data", { ascending: false })
      .limit(1),
  ]);
  if (tErr) throw tErr;
  if (rErr) throw rErr;
  if (sErr) throw sErr;
  if (cErr) throw cErr;
  if (vErr) throw vErr;

  const stockUnidades =
    (trf ?? []).reduce((s, t) => s + t.quantidade, 0) -
    (ret ?? []).reduce((s, r) => s + r.quantidade, 0);

  const vendasMes = (sales ?? []).reduce((s, v) => s + Number(v.preco_final), 0);
  const comissaoPendente = (commissions ?? []).reduce((s, c) => s + Number(c.valor), 0);
  const ultimaVisita = visits?.[0]?.data ?? null;

  return {
    stock_unidades: Math.max(0, stockUnidades),
    vendas_mes: vendasMes,
    comissao_pendente: comissaoPendente,
    ultima_visita: ultimaVisita,
  };
}

async function fetchSalonTabs(salonId: string) {
  const [
    { data: transfers, error: tErr },
    { data: sales, error: sErr },
    { data: returns, error: rErr },
    { data: visits, error: vErr },
  ] = await Promise.all([
    supabase
      .from("transfers")
      .select("id, data, quantidade, nota, products(nome)")
      .eq("salon_id", salonId)
      .order("data", { ascending: false }),
    supabase
      .from("salon_sales")
      .select("id, data, quantidade, preco_final, comissao_salao, cliente_nome, products(nome)")
      .eq("salon_id", salonId)
      .order("data", { ascending: false }),
    supabase
      .from("returns")
      .select("id, data, quantidade, motivo, products(nome)")
      .eq("salon_id", salonId)
      .order("data", { ascending: false }),
    supabase
      .from("salon_visit_log")
      .select("id, data, notas, profiles(nome)")
      .eq("salon_id", salonId)
      .order("data", { ascending: false }),
  ]);
  if (tErr) throw tErr;
  if (sErr) throw sErr;
  if (rErr) throw rErr;
  if (vErr) throw vErr;

  return {
    transfers: (transfers ?? []) as any[],
    sales: (sales ?? []) as any[],
    returns: (returns ?? []) as any[],
    visits: (visits ?? []) as any[],
  };
}

// ─── Visit Modal ──────────────────────────────────────────────────────────────

function VisitModal({
  open,
  onClose,
  salonId,
  salonNome,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
  salonNome: string;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState(today());
  const [notas, setNotas] = useState("");

  async function getCurrentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error("Utilizador não autenticado.");
      const { error } = await supabase.from("salon_visit_log").insert({
        salon_id: salonId,
        representante_id: userId,
        data,
        notas: notas.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      qc.invalidateQueries({ queryKey: ["salon-detail", salonId] });
      qc.invalidateQueries({ queryKey: ["salon-tabs", salonId] });
      toast.success("Visita registada.");
      setData(today());
      setNotas("");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registar visita."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Registar Visita</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4 mt-2"
        >
          <p className="text-sm text-muted-foreground">{salonNome}</p>
          <div className="space-y-1">
            <Label htmlFor="visit-data">Data *</Label>
            <Input
              id="visit-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="visit-notas">Notas</Label>
            <Textarea
              id="visit-notas"
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observações da visita…"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {mutation.isPending ? "A guardar…" : "Registar Visita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Novo Salão Modal ─────────────────────────────────────────────────────────

type SalonForm = {
  nome: string;
  morada: string;
  telefone: string;
  contacto_nome: string;
  representante_id: string;
  data_inicio_parceria: string;
};

const BLANK_SALON: SalonForm = {
  nome: "",
  morada: "",
  telefone: "",
  contacto_nome: "",
  representante_id: "",
  data_inicio_parceria: today(),
};

function SalonModal({
  open,
  onClose,
  initial,
  reps,
}: {
  open: boolean;
  onClose: () => void;
  initial: SalonCard | null;
  reps: Pick<Profile, "id" | "nome">[];
}) {
  const qc = useQueryClient();
  const isEdit = initial !== null;

  const [form, setForm] = useState<SalonForm>(() =>
    initial
      ? {
          nome: initial.nome,
          morada: initial.morada ?? "",
          telefone: initial.telefone ?? "",
          contacto_nome: initial.contacto_nome ?? "",
          representante_id: initial.representante_id ?? "",
          data_inicio_parceria: initial.data_inicio_parceria ?? today(),
        }
      : { ...BLANK_SALON }
  );

  const [lastId, setLastId] = useState<string | null>(initial?.id ?? null);
  if ((initial?.id ?? null) !== lastId) {
    setLastId(initial?.id ?? null);
    setForm(
      initial
        ? {
            nome: initial.nome,
            morada: initial.morada ?? "",
            telefone: initial.telefone ?? "",
            contacto_nome: initial.contacto_nome ?? "",
            representante_id: initial.representante_id ?? "",
            data_inicio_parceria: initial.data_inicio_parceria ?? today(),
          }
        : { ...BLANK_SALON }
    );
  }

  function set<K extends keyof SalonForm>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const mutation = useMutation({
    mutationFn: async (f: SalonForm) => {
      if (!f.nome.trim()) throw new Error("O nome do salão é obrigatório.");
      const payload = {
        nome: f.nome.trim(),
        morada: f.morada.trim() || null,
        telefone: f.telefone.trim() || null,
        contacto_nome: f.contacto_nome.trim() || null,
        representante_id: f.representante_id || null,
        data_inicio_parceria: f.data_inicio_parceria || null,
      };
      if (isEdit) {
        const { error } = await supabase.from("salons").update(payload).eq("id", initial!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("salons").insert({ ...payload, ativo: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      toast.success(isEdit ? "Salão actualizado." : "Salão criado.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao guardar salão."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Editar Salão" : "Novo Salão"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
          className="space-y-4 mt-2"
        >
          <div className="space-y-1">
            <Label htmlFor="s-nome">Nome *</Label>
            <Input id="s-nome" value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="ex. Made in Brasil" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="s-contacto">Contacto</Label>
              <Input id="s-contacto" value={form.contacto_nome} onChange={(e) => set("contacto_nome", e.target.value)} placeholder="Nome do responsável" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-tel">Telefone</Label>
              <Input id="s-tel" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="+351 9xx xxx xxx" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-morada">Morada</Label>
            <Input id="s-morada" value={form.morada} onChange={(e) => set("morada", e.target.value)} placeholder="Rua, cidade" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Representante</Label>
              <Select value={form.representante_id} onValueChange={(v) => set("representante_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-parceria">Início de Parceria</Label>
              <Input id="s-parceria" type="date" value={form.data_inicio_parceria} onChange={(e) => set("data_inicio_parceria", e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {mutation.isPending ? "A guardar…" : isEdit ? "Guardar" : "Criar Salão"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Salon Sheet ──────────────────────────────────────────────────────────────

function SalonSheet({
  salon,
  onClose,
  reps,
}: {
  salon: SalonCard | null;
  onClose: () => void;
  reps: Pick<Profile, "id" | "nome">[];
}) {
  const [visitOpen, setVisitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["salon-detail", salon?.id],
    queryFn: () => fetchSalonDetail(salon!.id),
    enabled: !!salon,
  });

  const { data: tabs } = useQuery({
    queryKey: ["salon-tabs", salon?.id],
    queryFn: () => fetchSalonTabs(salon!.id),
    enabled: !!salon,
  });

  if (!salon) return null;

  const dias = daysSince(salon.ultima_visita);

  const detailKpis = [
    { label: "Stock no Salão (un.)", value: detail?.stock_unidades ?? "…" },
    { label: "Vendas do Mês", value: detail ? eur(detail.vendas_mes) : "…" },
    { label: "Comissão Pendente", value: detail ? eur(detail.comissao_pendente) : "…" },
    {
      label: "Última Visita",
      value: detail?.ultima_visita ? fmtDate(detail.ultima_visita) : "Sem registo",
    },
  ];

  return (
    <>
      <Sheet open={!!salon} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="font-display text-2xl">{salon.nome}</SheetTitle>
                {salon.morada && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {salon.morada}
                  </p>
                )}
              </div>
              <Badge className="bg-accent text-accent-foreground shrink-0">Activo</Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
              {salon.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {salon.telefone}
                </span>
              )}
              {salon.contacto_nome && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> {salon.contacto_nome}
                </span>
              )}
              {salon.representante_nome && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Rep: {salon.representante_nome}
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button
                size="sm"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => setVisitOpen(true)}
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                Registar Visita
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                Editar Salão
              </Button>
            </div>
          </SheetHeader>

          {/* Mini KPIs */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {detailKpis.map((k) => (
              <Card key={k.label} className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className="text-xl font-display font-semibold mt-1">{k.value}</p>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="transferencias">
            <TabsList className="w-full">
              <TabsTrigger value="transferencias" className="flex-1">Transferências</TabsTrigger>
              <TabsTrigger value="vendas" className="flex-1">Vendas</TabsTrigger>
              <TabsTrigger value="devolucoes" className="flex-1">Devoluções</TabsTrigger>
              <TabsTrigger value="visitas" className="flex-1">Visitas</TabsTrigger>
            </TabsList>

            <TabsContent value="transferencias" className="mt-4">
              {!tabs && <p className="text-sm text-muted-foreground py-4">A carregar…</p>}
              {tabs && tabs.transfers.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sem transferências registadas.</p>
              )}
              {tabs && tabs.transfers.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Produto</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Qtd</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabs.transfers.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{fmtDate(t.data)}</TableCell>
                        <TableCell>{t.products?.nome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.quantidade}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{t.nota ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="vendas" className="mt-4">
              {!tabs && <p className="text-sm text-muted-foreground py-4">A carregar…</p>}
              {tabs && tabs.sales.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sem vendas registadas.</p>
              )}
              {tabs && tabs.sales.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Produto</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Qtd</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Total</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabs.sales.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{fmtDate(s.data)}</TableCell>
                        <TableCell>{s.products?.nome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.quantidade}</TableCell>
                        <TableCell className="text-right tabular-nums">{eur(Number(s.preco_final))}</TableCell>
                        <TableCell className="text-right tabular-nums">{eur(Number(s.comissao_salao))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="devolucoes" className="mt-4">
              {!tabs && <p className="text-sm text-muted-foreground py-4">A carregar…</p>}
              {tabs && tabs.returns.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sem devoluções registadas.</p>
              )}
              {tabs && tabs.returns.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Produto</TableHead>
                      <TableHead className="text-primary-foreground font-semibold text-right">Qtd</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabs.returns.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{fmtDate(r.data)}</TableCell>
                        <TableCell>{r.products?.nome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.quantidade}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.motivo ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="visitas" className="mt-4">
              {!tabs && <p className="text-sm text-muted-foreground py-4">A carregar…</p>}
              {tabs && tabs.visits.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Sem visitas registadas.</p>
              )}
              {tabs && tabs.visits.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Representante</TableHead>
                      <TableHead className="text-primary-foreground font-semibold">Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabs.visits.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{fmtDate(v.data)}</TableCell>
                        <TableCell>{v.profiles?.nome ?? "—"}</TableCell>
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

      <VisitModal
        open={visitOpen}
        onClose={() => setVisitOpen(false)}
        salonId={salon.id}
        salonNome={salon.nome}
      />
      <SalonModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={salon}
        reps={reps}
      />
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function SaloesPage() {
  const qc = useQueryClient();

  const { data: saloes = [], isLoading } = useQuery({
    queryKey: ["saloes"],
    queryFn: fetchSaloes,
  });

  const { data: kpiExtras } = useQuery({
    queryKey: ["saloes-kpi"],
    queryFn: fetchKpiExtras,
  });

  const { data: reps = [] } = useQuery({
    queryKey: ["reps"],
    queryFn: fetchReps,
  });

  const [search, setSearch] = useState("");
  const [selectedSalon, setSelectedSalon] = useState<SalonCard | null>(null);
  const [newSalonOpen, setNewSalonOpen] = useState(false);

  const filtered = useMemo(
    () =>
      saloes.filter(
        (s) =>
          !search ||
          s.nome.toLowerCase().includes(search.toLowerCase()) ||
          (s.representante_nome ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [saloes, search]
  );

  const visitasEmAtraso = useMemo(
    () =>
      saloes.filter((s) => {
        const d = daysSince(s.ultima_visita);
        return d === null || d > VISIT_ALERT_DAYS;
      }).length,
    [saloes]
  );

  const seedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("salons")
        .insert(SEED_SALONS.map((s) => ({ nome: s.nome, ativo: true })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      toast.success("Salões iniciais criados.");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar salões."),
  });

  const kpis = [
    { label: "Salões Activos", value: isLoading ? "…" : saloes.length, icon: Store },
    { label: "Visitas em Atraso", value: isLoading ? "…" : visitasEmAtraso, icon: AlertTriangle },
    {
      label: "Transferências este mês",
      value: kpiExtras ? eur(kpiExtras.transfersEur) : "…",
      icon: ArrowRightLeft,
    },
    {
      label: "Comissões Pendentes",
      value: kpiExtras ? eur(kpiExtras.comissoesPendentes) : "…",
      icon: Coins,
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Rede</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Salões</h1>
          <p className="text-muted-foreground mt-2">Gestão de salões parceiros e visitas.</p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
          onClick={() => setNewSalonOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Salão
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
          placeholder="Pesquisar salão ou representante…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} salão{filtered.length !== 1 ? "ões" : ""}
        </span>
      </div>

      {/* Seed banner */}
      {!isLoading && saloes.length === 0 && (
        <Card className="p-6 border-dashed">
          <div className="flex flex-col items-center gap-3 text-center">
            <Seedling className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum salão ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Cria os salões iniciais (Made in Brasil, Brooklyn Barber Studio, Andrade Hair, Kesia Nails)
                ou adiciona um manualmente.
              </p>
            </div>
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Seedling className="h-4 w-4 mr-2" />
              {seedMutation.isPending ? "A criar…" : "Criar salões iniciais"}
            </Button>
          </div>
        </Card>
      )}

      {/* Salon cards grid */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5 animate-pulse h-36" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s) => {
            const dias = daysSince(s.ultima_visita);
            const atrasada = dias === null || dias > VISIT_ALERT_DAYS;
            return (
              <Card
                key={s.id}
                className="p-5 shadow-card cursor-pointer hover:shadow-md transition-shadow border hover:border-accent/50"
                onClick={() => setSelectedSalon(s)}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-display font-semibold text-base leading-tight">{s.nome}</h3>
                  <Badge className="bg-accent text-accent-foreground shrink-0 text-xs">Activo</Badge>
                </div>

                {s.representante_nome && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <User className="h-3 w-3" /> {s.representante_nome}
                  </p>
                )}
                {s.morada && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" /> {s.morada}
                  </p>
                )}

                <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {s.ultima_visita
                      ? `Última visita: ${fmtDate(s.ultima_visita)}`
                      : "Sem visitas"}
                  </p>
                  {atrasada ? (
                    <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1.5">
                      Em atraso
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-600 text-white text-[10px] px-1.5">
                      Em dia
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SalonSheet
        salon={selectedSalon}
        onClose={() => setSelectedSalon(null)}
        reps={reps}
      />
      <SalonModal
        open={newSalonOpen}
        onClose={() => setNewSalonOpen(false)}
        initial={null}
        reps={reps}
      />
    </div>
  );
}
