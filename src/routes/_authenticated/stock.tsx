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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Package, AlertTriangle, XCircle, Coins, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProductCombobox } from "@/components/ui/product-combobox";

export const Route = createFileRoute("/_authenticated/stock")({
  head: () => ({ meta: [{ title: "Stock — Secrets VIP" }] }),
  component: StockPage,
});

type StockRow = {
  produto_id: string;
  nome: string;
  categoria: string;
  stock_qg: number;
  unidade_min_stock: number;
  validade_meses: number;
};

type Product = { id: string; nome: string; preco_custo: number };
type Cycle = { id: string; nome: string };

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function StatusBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0) return <Badge className="bg-red-600 text-white hover:bg-red-600">Crítico</Badge>;
  if (stock < min) return <Badge className="bg-orange-500 text-white hover:bg-orange-500">Alerta</Badge>;
  return <Badge className="bg-green-600 text-white hover:bg-green-600">OK</Badge>;
}

async function fetchStockData() {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { data: stockRows },
    { data: products },
    { data: salonSales },
    { data: directSales },
    { data: cycles },
  ] = await Promise.all([
    supabase.from("stock_central").select("*"),
    supabase.from("products").select("id,nome,preco_custo").eq("ativo", true).order("nome"),
    supabase.from("salon_sales").select("produto_id,quantidade,data").gte("data", since30),
    supabase.from("rep_direct_sales").select("produto_id,quantidade,data").gte("data", since30),
    supabase.from("boticario_cycles").select("id,nome").eq("ativo", true).order("nome"),
  ]);

  // build daily sales map: produto_id → total qty in 30 days
  const salesMap = new Map<string, number>();
  for (const s of [...(salonSales ?? []), ...(directSales ?? [])]) {
    salesMap.set(s.produto_id, (salesMap.get(s.produto_id) ?? 0) + Number(s.quantidade));
  }

  const rows: (StockRow & { esgota_dias: number | null; preco_custo: number })[] = (
    stockRows ?? []
  ).map((r: any) => {
    const totalQty30 = salesMap.get(r.produto_id) ?? 0;
    const avgDaily = totalQty30 / 30;
    const esgota_dias = avgDaily > 0 ? Math.round(Number(r.stock_qg) / avgDaily) : null;
    const prod = (products ?? []).find((p: Product) => p.id === r.produto_id);
    return {
      produto_id: r.produto_id,
      nome: r.nome ?? "",
      categoria: r.categoria ?? "",
      stock_qg: Number(r.stock_qg ?? 0),
      unidade_min_stock: Number(r.unidade_min_stock ?? 0),
      validade_meses: Number(r.validade_meses ?? 0),
      esgota_dias,
      preco_custo: prod?.preco_custo ?? 0,
    };
  });

  return {
    rows,
    products: products ?? [],
    cycles: cycles ?? [],
  };
}

// ── Ajuste Modal ──────────────────────────────────────────────────────────────
function AjusteModal({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
}) {
  const qc = useQueryClient();
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "saida" | "quebra">("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) { setProdutoId(""); setTipo("entrada"); setQuantidade(""); setMotivo(""); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("stock_adjustments").insert({
        produto_id: produtoId,
        tipo,
        quantidade: parseInt(quantidade),
        motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Ajuste registado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  const valid = produtoId && quantidade && parseInt(quantidade) > 0 && motivo.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registar Ajuste Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Produto</Label>
            <ProductCombobox
              value={produtoId}
              onChange={setProdutoId}
              products={products}
              placeholder="Seleccionar produto…"
            />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="quebra">Quebra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Quantidade</Label>
            <Input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Descreva o motivo…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Compra Modal ──────────────────────────────────────────────────────────────
type PurchaseLine = { produto_id: string; quantidade: string; preco_custo: string };

function CompraModal({
  open,
  onClose,
  products,
  cycles,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  cycles: Cycle[];
}) {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<PurchaseLine[]>([{ produto_id: "", quantidade: "", preco_custo: "" }]);

  useEffect(() => {
    if (open) {
      setCycleId("");
      setData(new Date().toISOString().slice(0, 10));
      setLines([{ produto_id: "", quantidade: "", preco_custo: "" }]);
    }
  }, [open]);

  function setLine(i: number, k: keyof PurchaseLine, v: string) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, { produto_id: "", quantidade: "", preco_custo: "" }]);
  }

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const total = lines.reduce((s, l) => {
    const q = parseFloat(l.quantidade) || 0;
    const p = parseFloat(l.preco_custo) || 0;
    return s + q * p;
  }, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const validLines = lines.filter(
        (l) => l.produto_id && parseInt(l.quantidade) > 0 && parseFloat(l.preco_custo) > 0,
      );
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
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Compra registada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  const validLines = lines.filter(
    (l) => l.produto_id && parseInt(l.quantidade) > 0 && parseFloat(l.preco_custo) > 0,
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registar Compra</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ciclo</Label>
              <Select value={cycleId} onValueChange={setCycleId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ciclo…" /></SelectTrigger>
                <SelectContent>
                  {cycles.map((c) => (
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
                <ProductCombobox
                  value={l.produto_id}
                  products={products}
                  onChange={(id) => {
                    const prod = products.find((p) => p.id === id);
                    setLine(i, "produto_id", id);
                    if (prod) setLine(i, "preco_custo", String(prod.preco_custo));
                  }}
                  placeholder="Produto…"
                />
                <Input
                  type="number"
                  min="1"
                  placeholder="Qtd"
                  value={l.quantidade}
                  onChange={(e) => setLine(i, "quantidade", e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="€ custo"
                  value={l.preco_custo}
                  onChange={(e) => setLine(i, "preco_custo", e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(i)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar linha
            </Button>
          </div>

          {total > 0 && (
            <p className="text-sm text-right font-semibold">
              Total: {eur(total)}
            </p>
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

// ── Page ──────────────────────────────────────────────────────────────────────
function StockPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["stock"],
    queryFn: fetchStockData,
  });

  const rows = data?.rows ?? [];
  const products = data?.products ?? [];
  const cycles = data?.cycles ?? [];

  const [search, setSearch] = useState("");
  const [soAlertas, setSoAlertas] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [compraOpen, setCompraOpen] = useState(false);

  const filtered = rows.filter((r) => {
    if (soAlertas && r.stock_qg >= r.unidade_min_stock) return false;
    if (search && !r.nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const ativos = rows.length;
  const emAlerta = rows.filter((r) => r.stock_qg > 0 && r.stock_qg < r.unidade_min_stock).length;
  const criticos = rows.filter((r) => r.stock_qg <= 0).length;
  const valorTotal = rows.reduce((s, r) => s + r.stock_qg * r.preco_custo, 0);

  const kpis = [
    { label: "Produtos com Stock", value: ativos, icon: Package },
    { label: "Em Alerta", value: emAlerta, icon: AlertTriangle },
    { label: "Críticos (stock=0)", value: criticos, icon: XCircle },
    { label: "Valor Total em Stock", value: eur(valorTotal), icon: Coins },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Armazém</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Stock Central</h1>
          <p className="text-muted-foreground mt-2">Inventário e movimentos de stock.</p>
        </div>
        <div className="flex gap-2 mt-2 shrink-0">
          <Button variant="outline" onClick={() => setAjusteOpen(true)}>
            Ajuste Manual
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => setCompraOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Registar Compra
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="text-2xl font-display font-semibold mt-2">
                    {isLoading ? "…" : k.value}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            className="w-56"
            placeholder="Pesquisar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Switch checked={soAlertas} onCheckedChange={setSoAlertas} />
            Só alertas
          </label>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground">Nome</TableHead>
                <TableHead className="text-primary-foreground">Categoria</TableHead>
                <TableHead className="text-primary-foreground text-right">Stock QG</TableHead>
                <TableHead className="text-primary-foreground text-right">Mínimo</TableHead>
                <TableHead className="text-primary-foreground text-center">Status</TableHead>
                <TableHead className="text-primary-foreground text-right">Esgota em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.produto_id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{r.categoria}</TableCell>
                  <TableCell className="text-right">{r.stock_qg}</TableCell>
                  <TableCell className="text-right">{r.unidade_min_stock}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge stock={r.stock_qg} min={r.unidade_min_stock} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {r.esgota_dias !== null ? `${r.esgota_dias} dias` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <AjusteModal open={ajusteOpen} onClose={() => setAjusteOpen(false)} products={products} />
      <CompraModal
        open={compraOpen}
        onClose={() => setCompraOpen(false)}
        products={products}
        cycles={cycles}
      />
    </div>
  );
}
