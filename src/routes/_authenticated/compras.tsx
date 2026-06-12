import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, ShoppingCart, Calendar, Sparkles, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({ meta: [{ title: "Compras — Secrets VIP" }] }),
  component: ComprasPage,
});

type Cycle = {
  id: string;
  nome: string;
  numero_ciclo: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
};

type Purchase = {
  id: string;
  data_compra: string;
  quantidade: number;
  preco_custo_unit: number;
  produto_id: string;
  cycle_id: string | null;
};

type Product = { id: string; nome: string; preco_custo: number };

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-PT");
}

async function fetchComprasData() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);

  const [{ data: cycles }, { data: purchases }, { data: products }] = await Promise.all([
    supabase.from("boticario_cycles").select("*").order("created_at", { ascending: false }),
    supabase.from("purchases").select("*").order("data_compra", { ascending: false }),
    supabase.from("products").select("id,nome,preco_custo").eq("ativo", true).order("nome"),
  ]);

  const activeCycle = (cycles ?? []).find((c: Cycle) => c.ativo) ?? null;

  const purchasesThisCycle = activeCycle
    ? (purchases ?? []).filter((p: Purchase) => p.cycle_id === activeCycle.id)
    : [];

  const purchasesThisMonth = (purchases ?? []).filter(
    (p: Purchase) => p.data_compra >= monthStart,
  );

  const totalCiclo = purchasesThisCycle.reduce(
    (s: number, p: Purchase) => s + p.quantidade * p.preco_custo_unit,
    0,
  );
  const totalMes = purchasesThisMonth.reduce(
    (s: number, p: Purchase) => s + p.quantidade * p.preco_custo_unit,
    0,
  );

  return {
    cycles: (cycles ?? []) as Cycle[],
    purchases: (purchases ?? []) as Purchase[],
    products: (products ?? []) as Product[],
    activeCycle,
    totalCiclo,
    totalMes,
    nCiclo: purchasesThisCycle.length,
  };
}

// ── Nova Compra Modal ─────────────────────────────────────────────────────────
type PurchaseLine = { produto_id: string; quantidade: string; preco_custo: string };

function NovaCompraModal({
  open,
  onClose,
  products,
  cycles,
  defaultCycleId,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  cycles: Cycle[];
  defaultCycleId: string;
}) {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState(defaultCycleId);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<PurchaseLine[]>([{ produto_id: "", quantidade: "", preco_custo: "" }]);

  useEffect(() => {
    if (open) {
      setCycleId(defaultCycleId);
      setData(new Date().toISOString().slice(0, 10));
      setLines([{ produto_id: "", quantidade: "", preco_custo: "" }]);
    }
  }, [open, defaultCycleId]);

  function setLine(i: number, k: keyof PurchaseLine, v: string) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  }

  const total = lines.reduce((s, l) => {
    return s + (parseFloat(l.quantidade) || 0) * (parseFloat(l.preco_custo) || 0);
  }, 0);

  const validLines = lines.filter(
    (l) => l.produto_id && parseInt(l.quantidade) > 0 && parseFloat(l.preco_custo) > 0,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (validLines.length === 0) throw new Error("Adicione pelo menos uma linha válida.");
      const inserts = validLines.map((l) => ({
        produto_id: l.produto_id,
        quantidade: parseInt(l.quantidade),
        preco_custo_unit: parseFloat(l.preco_custo),
        data_compra: data,
        cycle_id: cycleId || null,
      }));
      const { error } = await supabase.from("purchases").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras"] });
      toast.success("Compra registada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Compra</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ciclo</Label>
              <Select value={cycleId || "none"} onValueChange={(v) => setCycleId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ciclo…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem ciclo</SelectItem>
                  {cycles.filter((c) => c.id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Produtos</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_90px_32px] gap-2 items-center">
                <Select value={l.produto_id} onValueChange={(v) => {
                  const prod = products.find((p) => p.id === v);
                  setLine(i, "produto_id", v);
                  if (prod) setLine(i, "preco_custo", String(prod.preco_custo));
                }}>
                  <SelectTrigger><SelectValue placeholder="Produto…" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number" min="1" placeholder="Qtd"
                  value={l.quantidade}
                  onChange={(e) => setLine(i, "quantidade", e.target.value)}
                />
                <Input
                  type="number" min="0" step="0.01" placeholder="€ custo"
                  value={l.preco_custo}
                  onChange={(e) => setLine(i, "preco_custo", e.target.value)}
                />
                <Button
                  variant="ghost" size="icon"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { produto_id: "", quantidade: "", preco_custo: "" }])}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar linha
            </Button>
          </div>

          {total > 0 && (
            <p className="text-sm text-right font-semibold">Total: {eur(total)}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={validLines.length === 0 || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Novo Ciclo Modal ──────────────────────────────────────────────────────────
function NovoCicloModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  useEffect(() => {
    if (open) { setNome(""); setNumero(""); setInicio(""); setFim(""); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("boticario_cycles").insert({
        nome: nome.trim(),
        numero_ciclo: numero ? parseInt(numero) : null,
        data_inicio: inicio || null,
        data_fim: fim || null,
        ativo: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras"] });
      toast.success("Ciclo criado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo Ciclo</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Ciclo 12/2026" />
          </div>
          <div className="space-y-1">
            <Label>Número do Ciclo</Label>
            <Input type="number" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 12" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data Início</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data Fim</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!nome.trim() || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Criar Ciclo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function ComprasPage() {
  const { data, isLoading } = useQuery({ queryKey: ["compras"], queryFn: fetchComprasData });
  const qc = useQueryClient();

  const [cycleFilter, setCycleFilter] = useState("todos");
  const [monthFilter, setMonthFilter] = useState("");
  const [compraOpen, setCompraOpen] = useState(false);
  const [cicloOpen, setCicloOpen] = useState(false);

  const cycles = data?.cycles ?? [];
  const purchases = data?.purchases ?? [];
  const products = data?.products ?? [];
  const activeCycle = data?.activeCycle ?? null;

  const prodMap = new Map(products.map((p) => [p.id, p.nome]));
  const cycleMap = new Map(cycles.map((c) => [c.id, c.nome]));

  const filtered = purchases.filter((p) => {
    if (cycleFilter !== "todos" && p.cycle_id !== cycleFilter) return false;
    if (monthFilter && !p.data_compra.startsWith(monthFilter)) return false;
    return true;
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from("boticario_cycles").update({ ativo: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("boticario_cycles").update({ ativo: true }).eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras"] });
      toast.success("Ciclo activado.");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const kpis = [
    {
      label: "Total gasto este ciclo",
      value: data ? eur(data.totalCiclo) : "—",
      icon: Receipt,
    },
    {
      label: "Total gasto este mês",
      value: data ? eur(data.totalMes) : "—",
      icon: ShoppingCart,
    },
    {
      label: "Compras neste ciclo",
      value: data?.nCiclo ?? "—",
      icon: Calendar,
    },
    {
      label: "Ciclo activo",
      value: activeCycle ? activeCycle.nome : "Nenhum",
      icon: Sparkles,
    },
  ];

  // unique months from purchases for filter
  const months = Array.from(
    new Set(purchases.map((p) => p.data_compra.slice(0, 7))),
  ).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Aprovisionamento</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Compras</h1>
          <p className="text-muted-foreground mt-2">Histórico de compras por ciclo O Boticário.</p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 mt-2"
          onClick={() => setCompraOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" /> Nova Compra
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
                  <p className="text-2xl font-display font-semibold mt-2 leading-tight">
                    {isLoading ? "…" : k.value}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {/* Histórico */}
      <section className="space-y-4">
        <h2 className="text-lg font-display font-semibold">Histórico de Compras</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={cycleFilter} onValueChange={setCycleFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os ciclos</SelectItem>
              {cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={monthFilter || "todos-meses"} onValueChange={(v) => setMonthFilter(v === "todos-meses" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Todos os meses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos-meses">Todos os meses</SelectItem>
              {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground">Data</TableHead>
                <TableHead className="text-primary-foreground">Ciclo</TableHead>
                <TableHead className="text-primary-foreground">Produto</TableHead>
                <TableHead className="text-primary-foreground text-right">Quantidade</TableHead>
                <TableHead className="text-primary-foreground text-right">Preço Unit.</TableHead>
                <TableHead className="text-primary-foreground text-right">Total Linha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">A carregar…</TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">Nenhuma compra encontrada.</TableCell>
                </TableRow>
              )}
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{fmtDate(p.data_compra)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.cycle_id ? cycleMap.get(p.cycle_id) ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="font-medium">{prodMap.get(p.produto_id) ?? p.produto_id}</TableCell>
                  <TableCell className="text-right">{p.quantidade}</TableCell>
                  <TableCell className="text-right">{eur(p.preco_custo_unit)}</TableCell>
                  <TableCell className="text-right font-medium">{eur(p.quantidade * p.preco_custo_unit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* Ciclos */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold">Ciclos O Boticário</h2>
          <Button variant="outline" size="sm" onClick={() => setCicloOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> Novo Ciclo
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading && <p className="text-sm text-muted-foreground col-span-full">A carregar…</p>}
          {!isLoading && cycles.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">Nenhum ciclo criado.</p>
          )}
          {cycles.map((c) => (
            <Card key={c.id} className={`p-4 flex flex-col gap-2 ${c.ativo ? "ring-2 ring-accent" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.nome}</p>
                  {c.numero_ciclo && (
                    <p className="text-xs text-muted-foreground">Ciclo nº {c.numero_ciclo}</p>
                  )}
                </div>
                {c.ativo ? (
                  <Badge className="bg-accent text-accent-foreground hover:bg-accent shrink-0">Activo</Badge>
                ) : (
                  <Badge variant="secondary" className="shrink-0">Inactivo</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {fmtDate(c.data_inicio)} → {fmtDate(c.data_fim)}
              </p>
              {!c.ativo && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 self-start"
                  onClick={() => activateMutation.mutate(c.id)}
                  disabled={activateMutation.isPending}
                >
                  Activar
                </Button>
              )}
            </Card>
          ))}
        </div>
      </section>

      <NovaCompraModal
        open={compraOpen}
        onClose={() => setCompraOpen(false)}
        products={products}
        cycles={cycles}
        defaultCycleId={activeCycle?.id ?? ""}
      />
      <NovoCicloModal open={cicloOpen} onClose={() => setCicloOpen(false)} />
    </div>
  );
}
