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
import { Store, AlertTriangle, Banknote, Coins, Plus, MapPin, Phone, User, Calendar, CreditCard, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProductCombobox } from "@/components/ui/product-combobox";

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
type StockCentral = { produto_id: string; stock_qg: number };

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
    { data: returns },
  ] = await Promise.all([
    supabase.from("salons").select("*").order("nome"),
    supabase.rpc("get_representantes"),
    supabase.from("salon_visit_log").select("*").order("data", { ascending: false }),
    supabase.from("transfers").select("*").order("data", { ascending: false }),
    supabase.from("salon_sales").select("*").order("data", { ascending: false }),
    supabase.from("products").select("id,nome,preco_venda"),
    supabase.from("returns").select("*").order("data", { ascending: false }),
  ]);

  console.log('PROFILES:', reps);
  const repList: Rep[] = (reps ?? []).map((p: any) => ({ id: p.id, nome: p.nome }));
  const repMap = new Map(repList.map((r) => [r.id, r.nome]));
  const prodMap = new Map((products ?? []).map((p: any) => [p.id, p.nome]));
  const prodPrecoMap = new Map((products ?? []).map((p: any) => [p.id, Number(p.preco_venda ?? 0)]));

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
    prodPrecoMap,
    visits: (visits ?? []) as (Visit & { salon_id: string })[],
    transfers: (transfers ?? []) as (Transfer & { salon_id: string })[],
    sales: (sales ?? []) as (SalonSale & { salon_id: string })[],
    returns: (returns ?? []) as (Return & { salon_id: string })[],
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

// ── Transfer Modal ────────────────────────────────────────────────────────────
function TransferModal({
  open,
  onClose,
  salonId,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
}) {
  const qc = useQueryClient();
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");

  const { data: products } = useQuery({
    queryKey: ["active-products"],
    queryFn: () => supabase.from("products").select("id,nome").eq("ativo", true).order("nome").then((r) => r.data ?? []),
  });
  const { data: stock } = useQuery({
    queryKey: ["stock-central"],
    queryFn: () => supabase.from("stock_central").select("produto_id,stock_qg").then((r) => r.data ?? []),
  });

  useEffect(() => {
    if (open) { setProdutoId(""); setQuantidade(1); setData(new Date().toISOString().slice(0, 10)); setNota(""); }
  }, [open]);

  const stockMap = new Map((stock ?? []).map((s: StockCentral) => [s.produto_id, s.stock_qg]));
  const stockQg = produtoId ? (stockMap.get(produtoId) ?? 0) : null;
  const qtdInvalid = stockQg !== null && quantidade > stockQg;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from("transfers").insert({
        salon_id: salonId,
        produto_id: produtoId,
        quantidade,
        data,
        nota: nota.trim() || null,
        representante_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      qc.invalidateQueries({ queryKey: ["stock-central"] });
      toast.success("Transferência registada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Transferência</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Produto</Label>
            <ProductCombobox
              value={produtoId}
              onChange={setProdutoId}
              products={(products ?? []).map((p: any) => ({
                id: p.id,
                nome: p.nome,
                stock: stockMap.get(p.id) ?? 0,
              }))}
              showStock
              placeholder="Seleccionar produto…"
            />
          </div>
          <div className="space-y-1">
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              max={stockQg ?? undefined}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
            />
            {qtdInvalid && (
              <p className="text-xs text-red-500">Stock no QG insuficiente ({stockQg} disponível).</p>
            )}
            {stockQg !== null && !qtdInvalid && produtoId && (
              <p className="text-xs text-muted-foreground">Stock QG disponível: {stockQg}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nota <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Observações…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!produtoId || qtdInvalid || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Devolução Modal ───────────────────────────────────────────────────────────
function DevolucaoModal({
  open,
  onClose,
  salonId,
  salonStock,
  prodMap,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
  salonStock: { produto_id: string; qty: number }[];
  prodMap: Map<string, string>;
}) {
  const qc = useQueryClient();
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  // Só produtos com stock > 0 no salão
  const availableProducts = salonStock.filter((s) => s.qty > 0);
  const selectedStock = salonStock.find((s) => s.produto_id === produtoId)?.qty ?? 0;
  const qtdInvalid = quantidade > selectedStock;

  useEffect(() => {
    if (open) { setProdutoId(""); setQuantidade(1); setMotivo(""); setData(new Date().toISOString().slice(0, 10)); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("returns").insert({
        salon_id: salonId,
        produto_id: produtoId,
        quantidade,
        motivo: motivo.trim(),
        data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      toast.success("Devolução registada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Devolução</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Produto</Label>
            {availableProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Sem stock disponível neste salão.</p>
            ) : (
              <ProductCombobox
                value={produtoId}
                onChange={(id) => { setProdutoId(id); setQuantidade(1); }}
                products={availableProducts.map((s) => ({
                  id: s.produto_id,
                  nome: prodMap.get(s.produto_id) ?? s.produto_id,
                  stock: s.qty,
                }))}
                showStock
                placeholder="Seleccionar produto…"
              />
            )}
          </div>
          <div className="space-y-1">
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              max={selectedStock || undefined}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
            />
            {produtoId && qtdInvalid && (
              <p className="text-xs text-red-500">Quantidade superior ao stock disponível ({selectedStock}).</p>
            )}
            {produtoId && !qtdInvalid && (
              <p className="text-xs text-muted-foreground">Stock disponível neste salão: {selectedStock}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo da devolução…" />
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!produtoId || !motivo.trim() || qtdInvalid || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Confirmar"}
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

type Fiado = {
  id: string;
  salon_id: string;
  produto_id: string | null;
  cliente_nome: string;
  descricao: string | null;
  valor: number;
  data: string;
  status: "pendente" | "recebido";
  data_recebido: string | null;
};

// ── Fiado Modal ───────────────────────────────────────────────────────────────
function FiadoModal({
  open,
  onClose,
  salonId,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
}) {
  const qc = useQueryClient();
  const [clienteNome, setClienteNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [produtoId, setProdutoId] = useState("");

  const { data: products } = useQuery({
    queryKey: ["active-products"],
    queryFn: () =>
      supabase.from("products").select("id,nome").eq("ativo", true).order("nome").then((r) => r.data ?? []),
  });

  useEffect(() => {
    if (open) {
      setClienteNome(""); setDescricao(""); setValor("");
      setData(new Date().toISOString().slice(0, 10)); setProdutoId("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("fiado").insert({
        salon_id: salonId,
        cliente_nome: clienteNome.trim(),
        descricao: descricao.trim() || null,
        valor: parseFloat(valor),
        data,
        produto_id: produtoId === "none" || !produtoId ? null : produtoId,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiado", salonId] });
      toast.success("Fiado registado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const valorNum = parseFloat(valor);
  const valorInvalid = isNaN(valorNum) || valorNum <= 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo Fiado</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Cliente <span className="text-red-500">*</span></Label>
            <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
          </div>
          <div className="space-y-1">
            <Label>Descrição <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: corte + coloração" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor (€) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Produto <span className="text-muted-foreground">(opcional)</span></Label>
            <ProductCombobox
              value={produtoId}
              onChange={setProdutoId}
              products={(products ?? []).filter((p: any) => p.id).map((p: any) => ({
                id: p.id,
                nome: String(p.nome ?? "—"),
              }))}
              placeholder="Sem produto específico"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!clienteNome.trim() || valorInvalid || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Registar Fiado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Salon Inventário Modal ────────────────────────────────────────────────────
const MOTIVOS_INV = [
  "Venda não registada",
  "Produto danificado",
  "Produto perdido",
  "Correcção de contagem",
  "Outro",
];

type InvRow = {
  produto_id: string;
  nome: string;
  stockApp: number;
  stockReal: string;
  motivo: string;
};

function SalonInventarioModal({
  open,
  onClose,
  salonId,
  salonNome,
  salonStock,
  prodMap,
  prodPrecoMap,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
  salonNome: string;
  salonStock: { produto_id: string; qty: number }[];
  prodMap: Map<string, string>;
  prodPrecoMap: Map<string, number>;
}) {
  const qc = useQueryClient();
  const [dataInv, setDataInv] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<InvRow[]>([]);
  const [search, setSearch] = useState("");
  const [soDiferencas, setSoDiferencas] = useState(false);

  useEffect(() => {
    if (open) {
      setDataInv(new Date().toISOString().slice(0, 10));
      setSearch("");
      setSoDiferencas(false);
      setRows(
        salonStock
          .filter((s) => s.qty > 0)
          .map((s) => ({
            produto_id: s.produto_id,
            nome: prodMap.get(s.produto_id) ?? s.produto_id,
            stockApp: s.qty,
            stockReal: String(s.qty),
            motivo: "",
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
      );
    }
  }, [open, salonStock, prodMap]);

  function setRow(idx: number, field: keyof InvRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  const visible = rows
    .map((r, idx) => ({ ...r, idx }))
    .filter((r) => {
      if (search && !r.nome.toLowerCase().includes(search.toLowerCase())) return false;
      const real = parseInt(r.stockReal) || 0;
      if (soDiferencas && real === r.stockApp) return false;
      return true;
    });

  const comDiferenca = rows.filter((r) => {
    const real = parseInt(r.stockReal);
    return !isNaN(real) && real !== r.stockApp;
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const today = new Date().toISOString().slice(0, 10);

      const transferInserts: any[] = [];
      const saleInserts: any[] = [];

      for (const r of comDiferenca) {
        const real = parseInt(r.stockReal);
        const diff = real - r.stockApp;
        if (diff > 0) {
          transferInserts.push({
            salon_id: salonId,
            produto_id: r.produto_id,
            quantidade: diff,
            data: dataInv,
            nota: `Ajuste inventário — ${r.motivo || "Correcção de contagem"}`,
            representante_id: session?.user?.id ?? null,
          });
        } else {
          saleInserts.push({
            salon_id: salonId,
            produto_id: r.produto_id,
            quantidade: Math.abs(diff),
            preco_venda: prodPrecoMap.get(r.produto_id) ?? 0,
            data: dataInv,
            cliente_nome: `Inventário — ${r.motivo || "Correcção de contagem"}`,
          });
        }
      }

      if (transferInserts.length > 0) {
        const { error } = await supabase.from("transfers").insert(transferInserts);
        if (error) throw error;
      }
      if (saleInserts.length > 0) {
        const { error } = await supabase.from("salon_sales").insert(saleInserts);
        if (error) throw error;
      }

      // Log da visita — só se não houver visita hoje para este salão
      const { data: existingVisit } = await supabase
        .from("salon_visit_log")
        .select("id")
        .eq("salon_id", salonId)
        .eq("data", today)
        .maybeSingle();
      if (!existingVisit) {
        await supabase.from("salon_visit_log").insert({
          salon_id: salonId,
          representante_id: session?.user?.id ?? null,
          data: today,
          notas: "Inventário realizado",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saloes"] });
      toast.success(`Inventário concluído! ${comDiferenca.length} ajuste(s) criado(s).`);
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao confirmar inventário", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Inventário — {salonNome}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-3 items-end py-2">
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={dataInv} onChange={(e) => setDataInv(e.target.value)} className="w-40" />
          </div>
          <div className="flex-1 space-y-1 min-w-[160px]">
            <Label>Pesquisar produto</Label>
            <Input placeholder="Filtrar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-1">
            <input
              type="checkbox"
              checked={soDiferencas}
              onChange={(e) => setSoDiferencas(e.target.checked)}
              className="rounded"
            />
            Só com diferenças
          </label>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground">Produto</TableHead>
                <TableHead className="text-primary-foreground text-right">Stock App</TableHead>
                <TableHead className="text-primary-foreground text-right">Stock Real</TableHead>
                <TableHead className="text-primary-foreground text-right">Diferença</TableHead>
                <TableHead className="text-primary-foreground">Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    {rows.length === 0 ? "Sem stock no salão para inventariar." : "Nenhum produto corresponde ao filtro."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((r) => {
                const real = parseInt(r.stockReal);
                const diff = isNaN(real) ? null : real - r.stockApp;
                return (
                  <TableRow key={r.produto_id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.stockApp}</TableCell>
                    <TableCell className="text-right w-24">
                      <Input
                        type="number"
                        min={0}
                        value={r.stockReal}
                        onChange={(e) => setRow(r.idx, "stockReal", e.target.value)}
                        className="w-20 text-right h-8 focus-visible:ring-[#b8973a]"
                      />
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-semibold",
                      diff === null || diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-green-600" : "text-red-600",
                    )}>
                      {diff === null ? "—" : diff === 0 ? "=" : diff > 0 ? `+${diff}` : String(diff)}
                    </TableCell>
                    <TableCell>
                      {diff !== null && diff !== 0 ? (
                        <Select value={r.motivo} onValueChange={(v) => setRow(r.idx, "motivo", v)}>
                          <SelectTrigger className="h-8 text-xs w-48">
                            <SelectValue placeholder="Motivo…" />
                          </SelectTrigger>
                          <SelectContent>
                            {MOTIVOS_INV.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Sticky footer */}
        <div className="border-t pt-3 mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Produtos contados: <strong className="text-foreground">{rows.filter((r) => parseInt(r.stockReal) !== r.stockApp || !isNaN(parseInt(r.stockReal))).length} / {rows.length}</strong></span>
            <span>Com diferença: <strong className={comDiferenca.length > 0 ? "text-orange-600" : "text-foreground"}>{comDiferenca.length}</strong></span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              className="bg-[#b8973a] text-white hover:bg-[#a07d2e]"
              onClick={() => mutation.mutate()}
              disabled={comDiferenca.length === 0 || mutation.isPending}
            >
              {mutation.isPending ? "A guardar…" : `Confirmar Inventário (${comDiferenca.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Salon Sheet ───────────────────────────────────────────────────────────────
function SalonSheet({
  salon,
  onClose,
  data: d,
  isAdmin,
}: {
  salon: Salon | null;
  onClose: () => void;
  data: Awaited<ReturnType<typeof fetchSaloesData>> | undefined;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [visitOpen, setVisitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [devolucaoOpen, setDevolucaoOpen] = useState(false);
  const [fiadoOpen, setFiadoOpen] = useState(false);
  const [inventarioOpen, setInventarioOpen] = useState(false);

  // Fiado query — só corre para admin
  const { data: fiadoRows } = useQuery({
    queryKey: ["fiado", salon?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fiado")
        .select("id,salon_id,produto_id,cliente_nome,descricao,valor,data,status,data_recebido")
        .eq("salon_id", salon!.id)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fiado[];
    },
    enabled: isAdmin && !!salon,
  });

  const receberFiado = useMutation({
    mutationFn: async (fiadoId: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await (supabase as any)
        .from("fiado")
        .update({ status: "recebido", data_recebido: today })
        .eq("id", fiadoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiado", salon?.id] });
      toast.success("Fiado marcado como recebido.");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  if (!salon || !d) return null;

  const salonVisits = d.visits.filter((v) => v.salon_id === salon.id);
  const salonTransfers = d.transfers.filter((t) => t.salon_id === salon.id);
  const salonSales = d.sales.filter((s) => s.salon_id === salon.id);
  const salonReturns = d.returns.filter((r) => r.salon_id === salon.id);

  // Stock no salão = transferências - vendas - devoluções, por produto
  const stockMap = new Map<string, number>();
  for (const t of salonTransfers) {
    stockMap.set(t.produto_id, (stockMap.get(t.produto_id) ?? 0) + t.quantidade);
  }
  for (const s of salonSales) {
    stockMap.set(s.produto_id, (stockMap.get(s.produto_id) ?? 0) - s.quantidade);
  }
  for (const r of salonReturns) {
    stockMap.set(r.produto_id, (stockMap.get(r.produto_id) ?? 0) - r.quantidade);
  }
  const salonStock = Array.from(stockMap.entries())
    .map(([produto_id, qty]) => ({ produto_id, qty }))
    .filter((s) => s.qty !== 0)
    .sort((a, b) => b.qty - a.qty);

  const monthSales = salonSales.filter((s) => s.data >= d.monthStart);
  const monthRevenue = monthSales.reduce((sum, s) => sum + Number(s.preco_final), 0);
  const pendingComm = salonSales.reduce((sum, s) => sum + Number(s.comissao_salao ?? 0), 0);
  const lastVisit = salonVisits[0]?.data ?? null;
  const stockCount = salonTransfers.length; // rough proxy

  const fiadoPendente = (fiadoRows ?? [])
    .filter((f) => f.status === "pendente")
    .reduce((sum, f) => sum + Number(f.valor), 0);

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

          <div className="grid grid-cols-2 gap-3 mb-3">
            {miniStats.map((s) => (
              <Card key={s.label} className="p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-semibold mt-1">{s.value}</p>
              </Card>
            ))}
          </div>

          {isAdmin && (
            <Card className="p-3 mb-5 flex items-center gap-3 border-orange-200 bg-orange-50">
              <CreditCard className="h-5 w-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-xs text-orange-700">Fiado Pendente</p>
                <p className="font-semibold text-orange-700">{eur(fiadoPendente)}</p>
              </div>
            </Card>
          )}

          <Tabs defaultValue="stock">
            <TabsList className={`w-full grid mb-4 ${isAdmin ? "grid-cols-6" : "grid-cols-5"}`}>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="transferencias">Transf.</TabsTrigger>
              <TabsTrigger value="vendas">Vendas</TabsTrigger>
              <TabsTrigger value="devolucoes">Devol.</TabsTrigger>
              <TabsTrigger value="visitas">Visitas</TabsTrigger>
              {isAdmin && <TabsTrigger value="fiado">Fiado</TabsTrigger>}
            </TabsList>

            <TabsContent value="stock">
              <div className="flex justify-end mb-3">
                <Button size="sm" variant="outline" onClick={() => setInventarioOpen(true)}>
                  <ClipboardList className="h-3 w-3 mr-1" /> Fazer Inventário
                </Button>
              </div>
              {salonStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem stock registado neste salão.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground">Produto</TableHead>
                      <TableHead className="text-primary-foreground text-right">Qtd em Salão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salonStock.map(({ produto_id, qty }) => (
                      <TableRow key={produto_id}>
                        <TableCell className="font-medium">{d.prodMap.get(produto_id) ?? produto_id}</TableCell>
                        <TableCell className={`text-right font-semibold ${qty < 0 ? "text-red-500" : ""}`}>
                          {qty}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="transferencias">
              <div className="flex justify-end mb-3">
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setTransferOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Nova Transferência
                </Button>
              </div>
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
              <div className="flex justify-end mb-3">
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setDevolucaoOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Nova Devolução
                </Button>
              </div>
              {salonReturns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem devoluções registadas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground">Data</TableHead>
                      <TableHead className="text-primary-foreground">Produto</TableHead>
                      <TableHead className="text-primary-foreground text-right">Qtd</TableHead>
                      <TableHead className="text-primary-foreground">Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salonReturns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{fmtDate(r.data)}</TableCell>
                        <TableCell>{d.prodMap.get(r.produto_id) ?? r.produto_id}</TableCell>
                        <TableCell className="text-right">{r.quantidade}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.motivo ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
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
            {isAdmin && (
              <TabsContent value="fiado">
                <div className="flex justify-end mb-3">
                  <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setFiadoOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Novo Fiado
                  </Button>
                </div>
                {(fiadoRows ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem registos de fiado neste salão.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary hover:bg-primary">
                        <TableHead className="text-primary-foreground">Cliente</TableHead>
                        <TableHead className="text-primary-foreground">Descrição</TableHead>
                        <TableHead className="text-primary-foreground text-right">Valor</TableHead>
                        <TableHead className="text-primary-foreground">Data</TableHead>
                        <TableHead className="text-primary-foreground">Estado</TableHead>
                        <TableHead className="text-primary-foreground"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fiadoRows ?? []).map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{String(f.cliente_nome ?? "—")}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{String(f.descricao ?? "—")}</TableCell>
                          <TableCell className="text-right font-semibold">{eur(Number(f.valor) || 0)}</TableCell>
                          <TableCell>{fmtDate(f.data)}</TableCell>
                          <TableCell>
                            {f.status === "pendente" ? (
                              <Badge className="bg-orange-500 text-white hover:bg-orange-500">Pendente</Badge>
                            ) : (
                              <Badge className="bg-green-600 text-white hover:bg-green-600">Recebido</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {f.status === "pendente" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                disabled={receberFiado.isPending}
                                onClick={() => receberFiado.mutate(f.id)}
                              >
                                ✓ OK — Recebido
                              </Button>
                            )}
                            {f.status === "recebido" && f.data_recebido && (
                              <span className="text-xs text-muted-foreground">{fmtDate(f.data_recebido)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            )}
          </Tabs>
        </SheetContent>
      </Sheet>

      <VisitModal open={visitOpen} onClose={() => setVisitOpen(false)} salonId={salon.id} />
      <SalonModal open={editOpen} onClose={() => setEditOpen(false)} salon={salon} reps={d.repList} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} salonId={salon.id} />
      <DevolucaoModal open={devolucaoOpen} onClose={() => setDevolucaoOpen(false)} salonId={salon.id} salonStock={salonStock} prodMap={d.prodMap} />
      {isAdmin && <FiadoModal open={fiadoOpen} onClose={() => setFiadoOpen(false)} salonId={salon.id} />}
      <SalonInventarioModal
        open={inventarioOpen}
        onClose={() => setInventarioOpen(false)}
        salonId={salon.id}
        salonNome={salon.nome}
        salonStock={salonStock}
        prodMap={d.prodMap}
        prodPrecoMap={d.prodPrecoMap}
      />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const SEED_SALONS = ["Made in Brasil", "Brooklyn Barber Studio", "Andrade Hair", "Kesia Nails"];

function SaloesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["saloes"], queryFn: fetchSaloesData });

  const { data: myRole } = useQuery({
    queryKey: ["my-role"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();
      return data?.role ?? null;
    },
    staleTime: 60_000,
  });
  const isAdmin = myRole === "admin";

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
        {isAdmin && (
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 mt-2" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo Salão
          </Button>
        )}
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

      {!isLoading && salons.length === 0 && isAdmin && (
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

      <SalonSheet salon={selected} onClose={() => setSelected(null)} data={data} isAdmin={isAdmin} />
      <SalonModal open={newOpen} onClose={() => setNewOpen(false)} salon={null} reps={data?.repList ?? []} />
    </div>
  );
}
