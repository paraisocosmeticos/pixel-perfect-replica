import { createFileRoute, Navigate } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Plus, Clock, AlertTriangle, CheckCircle, Euro } from "lucide-react";
import { toast } from "sonner";
import { ProductCombobox } from "@/components/ui/product-combobox";

export const Route = createFileRoute("/_authenticated/encomendas")({
  head: () => ({ meta: [{ title: "Encomendas — Secrets VIP" }] }),
  component: EncomendasPage,
});

type Status =
  | "pendente"
  | "encomendado_boticario"
  | "stock_recebido"
  | "transferido_entregue"
  | "pagamento_recebido"
  | "cancelado";

type Encomenda = {
  id: string;
  numero: number;
  origem_tipo: "salao" | "representante";
  origem_id: string;
  status: Status;
  notas: string | null;
  data_pedido: string;
  data_encomenda_boticario: string | null;
  data_stock_recebido: string | null;
  data_entrega: string | null;
  data_pagamento: string | null;
  created_at: string;
};

type EncomendaItem = {
  id: string;
  encomenda_id: string;
  produto_id: string;
  quantidade: number;
  preco_venda: number | null;
};

type Product = { id: string; nome: string; preco_venda: number; preco_custo: number };
type Salon = { id: string; nome: string };
type Rep = { id: string; nome: string };

const PIPELINE: { key: Status; label: string; color: string; bg: string; border: string }[] = [
  { key: "pendente",              label: "Pendente",         color: "text-orange-700",  bg: "bg-orange-50 dark:bg-orange-950/30",   border: "border-orange-200 dark:border-orange-800" },
  { key: "encomendado_boticario", label: "Encomendado",      color: "text-blue-700",    bg: "bg-blue-50 dark:bg-blue-950/30",       border: "border-blue-200 dark:border-blue-800" },
  { key: "stock_recebido",        label: "Stock Recebido",   color: "text-teal-700",    bg: "bg-teal-50 dark:bg-teal-950/30",       border: "border-teal-200 dark:border-teal-800" },
  { key: "transferido_entregue",  label: "Entregue",         color: "text-green-700",   bg: "bg-green-50 dark:bg-green-950/30",     border: "border-green-200 dark:border-green-800" },
  { key: "pagamento_recebido",    label: "Pago",             color: "text-[#b8973a]",   bg: "bg-yellow-50 dark:bg-yellow-950/30",   border: "border-yellow-200 dark:border-yellow-800" },
  { key: "cancelado",             label: "Cancelado",        color: "text-gray-500",    bg: "bg-gray-50 dark:bg-gray-900/30",       border: "border-gray-200 dark:border-gray-700" },
];

const STATUS_ORDER: Status[] = [
  "pendente",
  "encomendado_boticario",
  "stock_recebido",
  "transferido_entregue",
  "pagamento_recebido",
];

function nextStatus(s: Status): Status | null {
  const idx = STATUS_ORDER.indexOf(s);
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

function nextLabel(s: Status): string {
  switch (s) {
    case "pendente":              return "✓ Encomendado ao Boticário";
    case "encomendado_boticario": return "✓ Stock Recebido";
    case "stock_recebido":        return "✓ Transferido / Entregue";
    case "transferido_entregue":  return "✓ Pagamento Recebido";
    default:                      return "";
  }
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function statusDate(e: Encomenda): string {
  switch (e.status) {
    case "pendente":              return e.data_pedido;
    case "encomendado_boticario": return e.data_encomenda_boticario ?? e.data_pedido;
    case "stock_recebido":        return e.data_stock_recebido ?? e.data_pedido;
    case "transferido_entregue":  return e.data_entrega ?? e.data_pedido;
    case "pagamento_recebido":    return e.data_pagamento ?? e.data_pedido;
    default:                      return e.data_pedido;
  }
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-PT");
}

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

async function fetchEncomendas() {
  const [
    { data: encomendas },
    { data: itens },
    { data: products },
    { data: salons },
    { data: repsRaw },
  ] = await Promise.all([
    (supabase as any).from("encomendas").select("*").order("numero", { ascending: false }),
    (supabase as any).from("encomenda_itens").select("*"),
    supabase.from("products").select("id,nome,preco_venda,preco_custo").eq("ativo", true).order("nome"),
    supabase.from("salons").select("id,nome").eq("ativo", true).order("nome"),
    (supabase as any).rpc("get_representantes"),
  ]);

  const prodMap = new Map((products ?? []).map((p: Product) => [p.id, p]));
  const salonMap = new Map((salons ?? []).map((s: Salon) => [s.id, s.nome]));
  const reps: Rep[] = (repsRaw ?? []).map((r: any) => ({ id: r.id, nome: r.nome }));
  const repMap = new Map(reps.map((r) => [r.id, r.nome]));

  const itensByEncomenda = new Map<string, EncomendaItem[]>();
  for (const item of itens ?? []) {
    const arr = itensByEncomenda.get(item.encomenda_id) ?? [];
    arr.push(item);
    itensByEncomenda.set(item.encomenda_id, arr);
  }

  return {
    encomendas: (encomendas ?? []) as Encomenda[],
    itens: (itens ?? []) as EncomendaItem[],
    itensByEncomenda,
    prodMap,
    salonMap,
    repMap,
    products: (products ?? []) as Product[],
    salons: (salons ?? []) as Salon[],
    reps,
  };
}

// ── Confirm Stock Recebido Dialog ─────────────────────────────────────────────
function ConfirmStockModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (criarCompra: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Stock Recebido</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Pretende criar automaticamente um registo de compra para cada produto desta encomenda?
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onConfirm(false)}>Não, só avançar</Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => onConfirm(true)}>
            Sim, criar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Encomenda Card ────────────────────────────────────────────────────────────
function EncomendaCard({
  encomenda,
  itens,
  prodMap,
  salonMap,
  repMap,
  products,
}: {
  encomenda: Encomenda;
  itens: EncomendaItem[];
  prodMap: Map<string, Product>;
  salonMap: Map<string, string>;
  repMap: Map<string, string>;
  products: Product[];
}) {
  const qc = useQueryClient();
  const [confirmStockOpen, setConfirmStockOpen] = useState(false);

  const origemNome =
    encomenda.origem_tipo === "salao"
      ? (salonMap.get(encomenda.origem_id) ?? "—")
      : (repMap.get(encomenda.origem_id) ?? "—");

  const days = daysSince(statusDate(encomenda));
  const isLate = days > 7 && encomenda.status !== "cancelado" && encomenda.status !== "pagamento_recebido";

  const next = nextStatus(encomenda.status);
  const today = new Date().toISOString().slice(0, 10);

  const advance = useMutation({
    mutationFn: async (opts: { criarCompra?: boolean } = {}) => {
      if (!next) return;
      const patch: Record<string, string> = { status: next };
      if (next === "encomendado_boticario") patch.data_encomenda_boticario = today;
      if (next === "stock_recebido") patch.data_stock_recebido = today;
      if (next === "transferido_entregue") patch.data_entrega = today;
      if (next === "pagamento_recebido") patch.data_pagamento = today;

      const { error } = await (supabase as any).from("encomendas").update(patch).eq("id", encomenda.id);
      if (error) throw error;

      // Se avançar para stock_recebido E criar compra
      if (next === "stock_recebido" && opts.criarCompra) {
        for (const item of itens) {
          const prod = products.find((p) => p.id === item.produto_id);
          await (supabase as any).from("purchases").insert({
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            preco_custo_unit: prod?.preco_custo ?? 0,
            data: today,
            nota: `Encomenda #${String(encomenda.numero).padStart(3, "0")}`,
          });
        }
      }

      // Se avançar para transferido_entregue → criar transfer ou venda
      if (next === "transferido_entregue") {
        const { data: { session } } = await supabase.auth.getSession();
        for (const item of itens) {
          const prod = products.find((p) => p.id === item.produto_id);
          if (encomenda.origem_tipo === "salao") {
            await supabase.from("transfers").insert({
              salon_id: encomenda.origem_id,
              produto_id: item.produto_id,
              quantidade: item.quantidade,
              data: today,
              nota: `Encomenda #${String(encomenda.numero).padStart(3, "0")}`,
              representante_id: session?.user?.id ?? null,
            });
          } else {
            await supabase.from("rep_direct_sales").insert({
              representante_id: encomenda.origem_id,
              produto_id: item.produto_id,
              quantidade: item.quantidade,
              preco_venda: item.preco_venda ?? prod?.preco_venda ?? 0,
              data: today,
              cliente_nome: `Encomenda #${String(encomenda.numero).padStart(3, "0")}`,
            });
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encomendas"] });
      qc.invalidateQueries({ queryKey: ["saloes"] });
      qc.invalidateQueries({ queryKey: ["stock-central"] });
      toast.success(`Encomenda #${String(encomenda.numero).padStart(3, "0")} avançada.`);
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("encomendas").update({ status: "cancelado" }).eq("id", encomenda.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encomendas"] });
      toast.success(`Encomenda #${String(encomenda.numero).padStart(3, "0")} cancelada.`);
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  function handleAdvance() {
    if (encomenda.status === "encomendado_boticario") {
      setConfirmStockOpen(true);
    } else {
      advance.mutate({});
    }
  }

  const valorTotal = itens.reduce((s, i) => {
    const pv = i.preco_venda ?? prodMap.get(i.produto_id)?.preco_venda ?? 0;
    return s + pv * i.quantidade;
  }, 0);

  return (
    <>
      <Card className="p-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-xs tracking-wide text-muted-foreground">
            #{String(encomenda.numero).padStart(3, "0")}
          </span>
          <div className="flex items-center gap-1">
            {isLate && (
              <Badge className="bg-red-600 text-white hover:bg-red-600 text-[10px] px-1.5">
                {days}d
              </Badge>
            )}
            {encomenda.origem_tipo === "salao"
              ? <Badge variant="outline" className="text-[10px]">Salão</Badge>
              : <Badge variant="outline" className="text-[10px]">Rep</Badge>
            }
          </div>
        </div>

        <p className="font-medium leading-tight">{origemNome}</p>

        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {itens.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span className="truncate">{prodMap.get(item.produto_id)?.nome ?? item.produto_id}</span>
              <span className="shrink-0 font-medium text-foreground">×{item.quantidade}</span>
            </li>
          ))}
        </ul>

        {valorTotal > 0 && (
          <p className="text-xs text-muted-foreground">{eur(valorTotal)}</p>
        )}

        <p className="text-[10px] text-muted-foreground">{fmtDate(encomenda.data_pedido)}</p>

        {encomenda.notas && (
          <p className="text-[10px] text-muted-foreground italic line-clamp-2">{encomenda.notas}</p>
        )}

        {encomenda.status !== "cancelado" && encomenda.status !== "pagamento_recebido" && (
          <div className="flex flex-col gap-1 pt-1">
            {next && (
              <Button
                size="sm"
                className="h-7 text-[11px] bg-accent text-accent-foreground hover:bg-accent/90 w-full"
                onClick={handleAdvance}
                disabled={advance.isPending}
              >
                {advance.isPending ? "…" : nextLabel(encomenda.status)}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50 w-full"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              ✗ Cancelar
            </Button>
          </div>
        )}
      </Card>

      <ConfirmStockModal
        open={confirmStockOpen}
        onClose={() => setConfirmStockOpen(false)}
        onConfirm={(criarCompra) => { setConfirmStockOpen(false); advance.mutate({ criarCompra }); }}
      />
    </>
  );
}

// ── Nova Encomenda Modal ──────────────────────────────────────────────────────
type LineItem = { produto_id: string; quantidade: string; preco_venda: string };

function NovaEncomendaModal({
  open,
  onClose,
  products,
  salons,
  reps,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  salons: Salon[];
  reps: Rep[];
}) {
  const qc = useQueryClient();
  const [origemTipo, setOrigemTipo] = useState<"salao" | "representante">("salao");
  const [origemId, setOrigemId] = useState("");
  const [notas, setNotas] = useState("");
  const [dataPedido, setDataPedido] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineItem[]>([{ produto_id: "", quantidade: "1", preco_venda: "" }]);

  useEffect(() => {
    if (open) {
      setOrigemTipo("salao");
      setOrigemId("");
      setNotas("");
      setDataPedido(new Date().toISOString().slice(0, 10));
      setLines([{ produto_id: "", quantidade: "1", preco_venda: "" }]);
    }
  }, [open]);

  function setLine(i: number, field: keyof LineItem, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, { produto_id: "", quantidade: "1", preco_venda: "" }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const validLines = lines.filter((l) => l.produto_id && parseInt(l.quantidade) > 0);
  const canSave = origemId && validLines.length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: enc, error: encErr } = await (supabase as any).from("encomendas").insert({
        origem_tipo: origemTipo,
        origem_id: origemId,
        notas: notas.trim() || null,
        data_pedido: dataPedido,
        created_by: session?.user?.id ?? null,
      }).select("id,numero").single();
      if (encErr) throw encErr;

      const itemsPayload = validLines.map((l) => ({
        encomenda_id: enc.id,
        produto_id: l.produto_id,
        quantidade: parseInt(l.quantidade),
        preco_venda: parseFloat(l.preco_venda) || null,
      }));
      const { error: itemErr } = await (supabase as any).from("encomenda_itens").insert(itemsPayload);
      if (itemErr) throw itemErr;

      return enc.numero as number;
    },
    onSuccess: (num) => {
      qc.invalidateQueries({ queryKey: ["encomendas"] });
      toast.success(`Encomenda #${String(num).padStart(3, "0")} criada.`);
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao criar encomenda", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Encomenda</DialogTitle></DialogHeader>

        <div className="space-y-4 py-2">
          {/* Origem tipo toggle */}
          <div className="space-y-1">
            <Label>Origem</Label>
            <div className="flex rounded-lg border overflow-hidden">
              {(["salao", "representante"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setOrigemTipo(t); setOrigemId(""); }}
                  className={`flex-1 py-1.5 text-sm transition-colors ${origemTipo === t ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
                >
                  {t === "salao" ? "Salão" : "Representante"}
                </button>
              ))}
            </div>
          </div>

          {/* Origem dropdown */}
          <div className="space-y-1">
            <Label>{origemTipo === "salao" ? "Salão" : "Representante"}</Label>
            <Select value={origemId} onValueChange={setOrigemId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>
                {(origemTipo === "salao" ? salons : reps).map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Produtos */}
          <div className="space-y-2">
            <Label>Produtos</Label>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <ProductCombobox
                    value={line.produto_id}
                    onChange={(id) => {
                      const prod = products.find((p) => p.id === id);
                      setLine(i, "produto_id", id);
                      if (prod && !line.preco_venda) setLine(i, "preco_venda", String(prod.preco_venda));
                    }}
                    products={products.map((p) => ({ id: p.id, nome: p.nome }))}
                    placeholder="Produto…"
                  />
                </div>
                <Input
                  type="number"
                  min={1}
                  value={line.quantidade}
                  onChange={(e) => setLine(i, "quantidade", e.target.value)}
                  className="w-16 text-center"
                  placeholder="Qtd"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.preco_venda}
                  onChange={(e) => setLine(i, "preco_venda", e.target.value)}
                  className="w-24"
                  placeholder="P.V. €"
                />
                {lines.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-red-400" onClick={() => removeLine(i)}>✕</Button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addLine} className="w-full">
              <Plus className="h-3 w-3 mr-1" /> Adicionar produto
            </Button>
          </div>

          {/* Data */}
          <div className="space-y-1">
            <Label>Data do pedido</Label>
            <Input type="date" value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} />
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <Label>Notas <span className="text-muted-foreground">(colar do WhatsApp)</span></Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Ex: Quero 2 Águas de Cheiro + 1 Desodorizante…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!canSave || mutation.isPending}
          >
            {mutation.isPending ? "A criar…" : "Criar Encomenda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function EncomendasPage() {
  const { data: currentUser } = useQuery({ queryKey: ["current-user"] });
  const isAdmin = (currentUser as any)?.role === "admin";

  if (currentUser && !isAdmin) {
    return <Navigate to="/dashboard" />;
  }

  const { data, isLoading } = useQuery({ queryKey: ["encomendas"], queryFn: fetchEncomendas });
  const [newOpen, setNewOpen] = useState(false);

  const encomendas = data?.encomendas ?? [];

  const pendentes = encomendas.filter((e) => e.status === "pendente").length;
  const emCurso = encomendas.filter((e) =>
    ["encomendado_boticario", "stock_recebido", "transferido_entregue"].includes(e.status)
  ).length;

  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);
  const concluidasMes = encomendas.filter(
    (e) => e.status === "pagamento_recebido" && (e.data_pagamento ?? "") >= monthStart
  ).length;

  const valorEmCurso = encomendas
    .filter((e) => ["encomendado_boticario", "stock_recebido", "transferido_entregue"].includes(e.status))
    .reduce((sum, e) => {
      const items = data?.itensByEncomenda.get(e.id) ?? [];
      return sum + items.reduce((s, i) => {
        const pv = i.preco_venda ?? data?.prodMap.get(i.produto_id)?.preco_venda ?? 0;
        return s + pv * i.quantidade;
      }, 0);
    }, 0);

  const kpis = [
    { label: "Pendentes",           value: isLoading ? "…" : pendentes, icon: Clock,         color: "text-orange-500" },
    { label: "Em Curso",            value: isLoading ? "…" : emCurso,   icon: AlertTriangle,  color: "text-blue-500" },
    { label: "Concluídas este mês", value: isLoading ? "…" : concluidasMes, icon: CheckCircle, color: "text-green-500" },
    { label: "Valor em Curso",      value: isLoading ? "…" : eur(valorEmCurso), icon: Euro,   color: "text-[#b8973a]" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Gestão</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Encomendas</h1>
          <p className="text-muted-foreground mt-2">Pipeline de encomendas de salões e representantes.</p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 mt-2"
          onClick={() => setNewOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" /> Nova Encomenda
        </Button>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="text-2xl font-display font-semibold mt-1">{k.value}</p>
                </div>
                <Icon className={`h-5 w-5 mt-1 ${k.color}`} />
              </div>
            </Card>
          );
        })}
      </section>

      {/* Kanban pipeline */}
      <section className="overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-2">
          {PIPELINE.map((col) => {
            const colEncomendas = encomendas.filter((e) => e.status === col.key);
            return (
              <div key={col.key} className={`w-64 shrink-0 rounded-xl border ${col.border} ${col.bg} flex flex-col`}>
                {/* Column header */}
                <div className={`px-3 py-2.5 flex items-center justify-between border-b ${col.border}`}>
                  <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
                  <Badge variant="secondary" className="text-xs">{colEncomendas.length}</Badge>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 min-h-[200px]">
                  {isLoading && (
                    <p className="text-xs text-muted-foreground text-center pt-4">A carregar…</p>
                  )}
                  {!isLoading && colEncomendas.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center pt-4">Sem encomendas</p>
                  )}
                  {colEncomendas.map((e) => (
                    <EncomendaCard
                      key={e.id}
                      encomenda={e}
                      itens={data?.itensByEncomenda.get(e.id) ?? []}
                      prodMap={data?.prodMap ?? new Map()}
                      salonMap={data?.salonMap ?? new Map()}
                      repMap={data?.repMap ?? new Map()}
                      products={data?.products ?? []}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <NovaEncomendaModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        products={data?.products ?? []}
        salons={data?.salons ?? []}
        reps={data?.reps ?? []}
      />
    </div>
  );
}
