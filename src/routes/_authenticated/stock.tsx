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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  AlertTriangle,
  XCircle,
  Coins,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/stock")({
  head: () => ({
    meta: [
      { title: "Stock Central — Secrets VIP" },
      { name: "description", content: "Gestão de stock, compras e ajustes manuais." },
    ],
  }),
  component: StockPage,
});

type Product = Tables<"products">;
type Cycle = Tables<"boticario_cycles">;

type StockRow = {
  id: string;
  nome: string;
  categoria: string;
  preco_custo: number;
  unidade_min_stock: number;
  stock_qg: number;
  em_saloes: number;
  esgota_em: number | null;
};

const PAGE_SIZE = 20;

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchStockData(): Promise<StockRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: stockView, error: svErr },
    { data: products, error: pErr },
    { data: salonSales, error: ssErr },
    { data: directSales, error: dsErr },
    { data: transfers, error: tErr },
    { data: returns, error: rErr },
  ] = await Promise.all([
    supabase.from("stock_central").select("produto_id, stock_qg, unidade_min_stock"),
    supabase
      .from("products")
      .select("id, nome, categoria, preco_custo, unidade_min_stock, ativo")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("salon_sales")
      .select("produto_id, quantidade")
      .gte("data", thirtyDaysAgo),
    supabase
      .from("rep_direct_sales")
      .select("produto_id, quantidade")
      .gte("data", thirtyDaysAgo),
    supabase.from("transfers").select("produto_id, quantidade"),
    supabase.from("returns").select("produto_id, quantidade"),
  ]);

  if (svErr) throw svErr;
  if (pErr) throw pErr;
  if (ssErr) throw ssErr;
  if (dsErr) throw dsErr;
  if (tErr) throw tErr;
  if (rErr) throw rErr;

  const stockMap = new Map<string, number>();
  const minMap = new Map<string, number>();
  for (const s of stockView ?? []) {
    stockMap.set(s.produto_id!, Number(s.stock_qg ?? 0));
    minMap.set(s.produto_id!, Number(s.unidade_min_stock ?? 0));
  }

  const transfersMap = new Map<string, number>();
  for (const t of transfers ?? []) {
    transfersMap.set(t.produto_id, (transfersMap.get(t.produto_id) ?? 0) + t.quantidade);
  }
  const returnsMap = new Map<string, number>();
  for (const r of returns ?? []) {
    returnsMap.set(r.produto_id, (returnsMap.get(r.produto_id) ?? 0) + r.quantidade);
  }

  const salesMap = new Map<string, number>();
  for (const s of [...(salonSales ?? []), ...(directSales ?? [])]) {
    salesMap.set(s.produto_id, (salesMap.get(s.produto_id) ?? 0) + s.quantidade);
  }

  return (products ?? []).map((p) => {
    const stockQG = stockMap.get(p.id) ?? 0;
    const emSaloes = Math.max(
      0,
      (transfersMap.get(p.id) ?? 0) - (returnsMap.get(p.id) ?? 0)
    );
    const totalSales30 = salesMap.get(p.id) ?? 0;
    const avgDaily = totalSales30 / 30;
    const esgotaEm = avgDaily > 0 ? Math.round(stockQG / avgDaily) : null;

    return {
      id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      preco_custo: Number(p.preco_custo),
      unidade_min_stock: minMap.get(p.id) ?? p.unidade_min_stock,
      stock_qg: stockQG,
      em_saloes: emSaloes,
      esgota_em: esgotaEm,
    };
  });
}

async function fetchCyclesAndProducts() {
  const [{ data: cycles, error: cErr }, { data: products, error: pErr }] = await Promise.all([
    supabase
      .from("boticario_cycles")
      .select("id, nome, numero_ciclo")
      .eq("ativo", true)
      .order("numero_ciclo", { ascending: false }),
    supabase
      .from("products")
      .select("id, nome, preco_custo")
      .eq("ativo", true)
      .order("nome"),
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;
  return { cycles: cycles ?? [], products: products ?? [] };
}

function statusBadge(stock: number, min: number) {
  if (stock === 0)
    return <Badge className="bg-destructive text-destructive-foreground">Crítico</Badge>;
  if (stock < min) return <Badge className="bg-orange-500 text-white">Alerta</Badge>;
  return <Badge className="bg-emerald-600 text-white">OK</Badge>;
}

// ─── Modal: Ajuste Manual ────────────────────────────────────────────────────

type AjusteForm = {
  produto_id: string;
  tipo: "entrada" | "saida" | "quebra";
  quantidade: string;
  motivo: string;
};

const BLANK_AJUSTE: AjusteForm = {
  produto_id: "",
  tipo: "entrada",
  quantidade: "",
  motivo: "",
};

function AjusteModal({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: Pick<Product, "id" | "nome">[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AjusteForm>({ ...BLANK_AJUSTE });

  function set<K extends keyof AjusteForm>(k: K, v: AjusteForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.produto_id || !form.quantidade || !form.motivo.trim()) {
        throw new Error("Preenche todos os campos obrigatórios.");
      }
      const { error } = await supabase.from("stock_adjustments").insert({
        produto_id: form.produto_id,
        tipo: form.tipo,
        quantidade: parseInt(form.quantidade),
        motivo: form.motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Ajuste registado com sucesso.");
      setForm({ ...BLANK_AJUSTE });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registar ajuste."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) { setForm({ ...BLANK_AJUSTE }); onClose(); }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Registar Ajuste Manual</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Produto *</Label>
            <Select value={form.produto_id} onValueChange={(v) => set("produto_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar produto…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => set("tipo", v as AjusteForm["tipo"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="quebra">Quebra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ajuste-qty">Quantidade *</Label>
              <Input
                id="ajuste-qty"
                type="number"
                min="1"
                value={form.quantidade}
                onChange={(e) => set("quantidade", e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ajuste-motivo">Motivo *</Label>
            <Input
              id="ajuste-motivo"
              value={form.motivo}
              onChange={(e) => set("motivo", e.target.value)}
              placeholder="ex. Contagem física, devolução…"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setForm({ ...BLANK_AJUSTE }); onClose(); }}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {mutation.isPending ? "A guardar…" : "Registar Ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Registar Compra ──────────────────────────────────────────────────

type PurchaseLine = {
  id: number;
  produto_id: string;
  quantidade: string;
  preco_custo_unit: string;
};

let lineCounter = 0;

function newLine(): PurchaseLine {
  return { id: ++lineCounter, produto_id: "", quantidade: "", preco_custo_unit: "" };
}

function CompraModal({
  open,
  onClose,
  cycles,
  products,
}: {
  open: boolean;
  onClose: () => void;
  cycles: Pick<Cycle, "id" | "nome" | "numero_ciclo">[];
  products: Pick<Product, "id" | "nome" | "preco_custo">[];
}) {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string>("");
  const [dataCompra, setDataCompra] = useState(today());
  const [lines, setLines] = useState<PurchaseLine[]>(() => [newLine()]);

  function resetForm() {
    setCycleId("");
    setDataCompra(today());
    setLines([newLine()]);
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLine(id: number, field: keyof Omit<PurchaseLine, "id">, value: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, [field]: value };
        // auto-fill cost from product default
        if (field === "produto_id") {
          const p = products.find((p) => p.id === value);
          if (p) next.preco_custo_unit = String(p.preco_custo);
        }
        return next;
      })
    );
  }

  const total = lines.reduce((s, l) => {
    const qty = parseFloat(l.quantidade) || 0;
    const price = parseFloat(l.preco_custo_unit) || 0;
    return s + qty * price;
  }, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const validLines = lines.filter(
        (l) => l.produto_id && l.quantidade && l.preco_custo_unit
      );
      if (validLines.length === 0) throw new Error("Adiciona pelo menos uma linha válida.");

      const rows = validLines.map((l) => ({
        produto_id: l.produto_id,
        quantidade: parseInt(l.quantidade),
        preco_custo_unit: parseFloat(l.preco_custo_unit),
        data_compra: dataCompra,
        cycle_id: cycleId || null,
      }));

      const { error } = await supabase.from("purchases").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Compra registada com sucesso.");
      resetForm();
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registar compra."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) { resetForm(); onClose(); }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Registar Compra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Ciclo O Boticário</Label>
              <Select value={cycleId} onValueChange={setCycleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ciclo (opcional)…" />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numero_ciclo ? `Ciclo ${c.numero_ciclo} — ` : ""}
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="data-compra">Data da Compra *</Label>
              <Input
                id="data-compra"
                type="date"
                value={dataCompra}
                onChange={(e) => setDataCompra(e.target.value)}
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_80px_100px_32px] gap-2 px-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Produto</span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Qtd</span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Preço Custo</span>
              <span />
            </div>
            {lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                <Select
                  value={line.produto_id}
                  onValueChange={(v) => updateLine(line.id, "produto_id", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Produto…" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  className="h-9"
                  placeholder="0"
                  value={line.quantidade}
                  onChange={(e) => updateLine(line.id, "quantidade", e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-9"
                  placeholder="0.00"
                  value={line.preco_custo_unit}
                  onChange={(e) => updateLine(line.id, "preco_custo_unit", e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(line.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="mt-1"
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar linha
            </Button>
          </div>

          {total > 0 && (
            <div className="flex justify-end">
              <p className="text-sm text-muted-foreground">
                Total:{" "}
                <span className="font-semibold text-foreground text-base">{eur(total)}</span>
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { resetForm(); onClose(); }}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {mutation.isPending ? "A guardar…" : "Registar Compra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function StockPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock"],
    queryFn: fetchStockData,
  });

  const { data: meta } = useQuery({
    queryKey: ["stock-meta"],
    queryFn: fetchCyclesAndProducts,
  });

  const [search, setSearch] = useState("");
  const [soAlertas, setSoAlertas] = useState(false);
  const [page, setPage] = useState(0);

  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [compraOpen, setCompraOpen] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search && !r.nome.toLowerCase().includes(search.toLowerCase())) return false;
      if (soAlertas && r.stock_qg >= r.unidade_min_stock) return false;
      return true;
    });
  }, [rows, search, soAlertas]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const totalActivos = rows.length;
  const emAlerta = rows.filter(
    (r) => r.stock_qg > 0 && r.stock_qg < r.unidade_min_stock
  ).length;
  const criticos = rows.filter((r) => r.stock_qg === 0).length;
  const valorCusto = rows.reduce((s, r) => s + r.preco_custo * r.stock_qg, 0);

  const kpis = [
    { label: "Produtos Activos", value: isLoading ? "…" : totalActivos, icon: Package },
    { label: "Em Alerta", value: isLoading ? "…" : emAlerta, icon: AlertTriangle },
    { label: "Críticos (esgotados)", value: isLoading ? "…" : criticos, icon: XCircle },
    {
      label: "Valor em Stock (custo)",
      value: isLoading ? "…" : eur(valorCusto),
      icon: Coins,
    },
  ];

  function handleSearch(v: string) { setSearch(v); setPage(0); }
  function handleSoAlertas(v: boolean) { setSoAlertas(v); setPage(0); }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Armazém</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Stock Central</h1>
          <p className="text-muted-foreground mt-2">Inventário, compras e ajustes manuais.</p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <Button
            variant="outline"
            onClick={() => setAjusteOpen(true)}
          >
            Registar Ajuste
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => setCompraOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Registar Compra
          </Button>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {k.label}
                  </p>
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

      {/* Filters */}
      <section className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Pesquisar por nome…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-56"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Switch checked={soAlertas} onCheckedChange={handleSoAlertas} />
          Só alertas
        </label>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} produto{filtered.length !== 1 ? "s" : ""}
        </span>
      </section>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground font-semibold">Nome</TableHead>
                <TableHead className="text-primary-foreground font-semibold">Categoria</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Stock QG
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Em Salões
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Mínimo
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Esgota em
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-center">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-10 text-muted-foreground"
                  >
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && pageData.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-10 text-muted-foreground"
                  >
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              )}
              {pageData.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{r.categoria}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {r.stock_qg}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.em_saloes}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.unidade_min_stock}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.esgota_em !== null ? (
                      <span
                        className={
                          r.esgota_em <= 7
                            ? "text-destructive font-semibold"
                            : r.esgota_em <= 14
                            ? "text-orange-500 font-medium"
                            : ""
                        }
                      >
                        {r.esgota_em}d
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {statusBadge(r.stock_qg, r.unidade_min_stock)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AjusteModal
        open={ajusteOpen}
        onClose={() => setAjusteOpen(false)}
        products={meta?.products ?? []}
      />
      <CompraModal
        open={compraOpen}
        onClose={() => setCompraOpen(false)}
        cycles={meta?.cycles ?? []}
        products={meta?.products ?? []}
      />
    </div>
  );
}
