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
  ShoppingCart,
  Receipt,
  CalendarDays,
  Sparkles,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Pencil,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({
    meta: [
      { title: "Compras — Secrets VIP" },
      { name: "description", content: "Histórico de compras e gestão de ciclos O Boticário." },
    ],
  }),
  component: ComprasPage,
});

type Cycle = Tables<"boticario_cycles">;
type Product = Tables<"products">;

type PurchaseRow = {
  id: string;
  data_compra: string;
  cycle_id: string | null;
  cycle_nome: string | null;
  cycle_numero: number | null;
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  preco_custo_unit: number;
  total: number;
};

const PAGE_SIZE = 20;

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

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchCompras(): Promise<PurchaseRow[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, data_compra, cycle_id, produto_id, quantidade, preco_custo_unit, boticario_cycles(nome, numero_ciclo), products(nome)"
    )
    .order("data_compra", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    data_compra: r.data_compra,
    cycle_id: r.cycle_id,
    cycle_nome: r.boticario_cycles?.nome ?? null,
    cycle_numero: r.boticario_cycles?.numero_ciclo ?? null,
    produto_id: r.produto_id,
    produto_nome: r.products?.nome ?? "—",
    quantidade: r.quantidade,
    preco_custo_unit: Number(r.preco_custo_unit),
    total: r.quantidade * Number(r.preco_custo_unit),
  }));
}

async function fetchCycles(): Promise<Cycle[]> {
  const { data, error } = await supabase
    .from("boticario_cycles")
    .select("*")
    .order("numero_ciclo", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchActiveProducts(): Promise<Pick<Product, "id" | "nome" | "preco_custo">[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, nome, preco_custo")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

// ─── Modal: Nova Compra ───────────────────────────────────────────────────────

type PurchaseLine = { id: number; produto_id: string; quantidade: string; preco_custo_unit: string };

let _lineId = 0;
function newLine(): PurchaseLine {
  return { id: ++_lineId, produto_id: "", quantidade: "", preco_custo_unit: "" };
}

function NovaCompraModal({
  open,
  onClose,
  cycles,
  products,
  defaultCycleId,
}: {
  open: boolean;
  onClose: () => void;
  cycles: Cycle[];
  products: Pick<Product, "id" | "nome" | "preco_custo">[];
  defaultCycleId: string;
}) {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState(defaultCycleId);
  const [dataCompra, setDataCompra] = useState(today());
  const [lines, setLines] = useState<PurchaseLine[]>(() => [newLine()]);

  // sync default cycle when it resolves after mount
  const [syncedDefault, setSyncedDefault] = useState(defaultCycleId);
  if (defaultCycleId !== syncedDefault) {
    setSyncedDefault(defaultCycleId);
    setCycleId(defaultCycleId);
  }

  function reset() {
    setCycleId(defaultCycleId);
    setDataCompra(today());
    setLines([newLine()]);
  }

  function addLine() { setLines((p) => [...p, newLine()]); }
  function removeLine(id: number) { setLines((p) => p.filter((l) => l.id !== id)); }

  function updateLine(id: number, field: keyof Omit<PurchaseLine, "id">, val: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, [field]: val };
        if (field === "produto_id") {
          const p = products.find((p) => p.id === val);
          if (p) next.preco_custo_unit = String(p.preco_custo);
        }
        return next;
      })
    );
  }

  const total = lines.reduce((s, l) => {
    return s + (parseFloat(l.quantidade) || 0) * (parseFloat(l.preco_custo_unit) || 0);
  }, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const valid = lines.filter((l) => l.produto_id && l.quantidade && l.preco_custo_unit);
      if (valid.length === 0) throw new Error("Adiciona pelo menos uma linha válida.");
      const rows = valid.map((l) => ({
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
      qc.invalidateQueries({ queryKey: ["compras"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Compra registada com sucesso.");
      reset();
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registar compra."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Nova Compra</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-5 mt-2"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Ciclo O Boticário</Label>
              <Select value={cycleId} onValueChange={setCycleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem ciclo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem ciclo</SelectItem>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numero_ciclo ? `Ciclo ${c.numero_ciclo} — ` : ""}
                      {c.nome}
                      {c.ativo ? " ✦" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-data">Data da Compra *</Label>
              <Input
                id="nc-data"
                type="date"
                value={dataCompra}
                onChange={(e) => setDataCompra(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_80px_100px_32px] gap-2 px-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Produto</span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Qtd</span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Preço Unit.</span>
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
            <Button type="button" variant="outline" size="sm" onClick={addLine} className="mt-1">
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
              disabled={mutation.isPending}
              onClick={() => { reset(); onClose(); }}
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

// ─── Modal: Ciclo ─────────────────────────────────────────────────────────────

type CycleForm = {
  nome: string;
  numero_ciclo: string;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
};

const BLANK_CYCLE: CycleForm = {
  nome: "",
  numero_ciclo: "",
  data_inicio: "",
  data_fim: "",
  ativo: false,
};

function CycleModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: Cycle | null;
}) {
  const qc = useQueryClient();
  const isEdit = initial !== null;

  const [form, setForm] = useState<CycleForm>(() =>
    initial
      ? {
          nome: initial.nome,
          numero_ciclo: initial.numero_ciclo != null ? String(initial.numero_ciclo) : "",
          data_inicio: initial.data_inicio ?? "",
          data_fim: initial.data_fim ?? "",
          ativo: initial.ativo,
        }
      : { ...BLANK_CYCLE }
  );

  const [lastId, setLastId] = useState<string | null>(initial?.id ?? null);
  if ((initial?.id ?? null) !== lastId) {
    setLastId(initial?.id ?? null);
    setForm(
      initial
        ? {
            nome: initial.nome,
            numero_ciclo: initial.numero_ciclo != null ? String(initial.numero_ciclo) : "",
            data_inicio: initial.data_inicio ?? "",
            data_fim: initial.data_fim ?? "",
            ativo: initial.ativo,
          }
        : { ...BLANK_CYCLE }
    );
  }

  function set<K extends keyof CycleForm>(k: K, v: CycleForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: async (f: CycleForm) => {
      if (!f.nome.trim()) throw new Error("O nome do ciclo é obrigatório.");

      const payload = {
        nome: f.nome.trim(),
        numero_ciclo: f.numero_ciclo ? parseInt(f.numero_ciclo) : null,
        data_inicio: f.data_inicio || null,
        data_fim: f.data_fim || null,
        ativo: f.ativo,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("boticario_cycles")
          .update(payload)
          .eq("id", initial!.id);
        if (error) throw error;
        // desactivar os outros se este ficou activo
        if (f.ativo) {
          const { error: e2 } = await supabase
            .from("boticario_cycles")
            .update({ ativo: false })
            .neq("id", initial!.id);
          if (e2) throw e2;
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("boticario_cycles")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (f.ativo && inserted) {
          const { error: e2 } = await supabase
            .from("boticario_cycles")
            .update({ ativo: false })
            .neq("id", inserted.id);
          if (e2) throw e2;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycles"] });
      qc.invalidateQueries({ queryKey: ["compras"] });
      toast.success(isEdit ? "Ciclo actualizado." : "Ciclo criado.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao guardar ciclo."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEdit ? "Editar Ciclo" : "Novo Ciclo"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
          className="space-y-4 mt-2"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="cycle-nome">Nome *</Label>
              <Input
                id="cycle-nome"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="ex. Ciclo 18 Inverno"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cycle-num">Nº Ciclo</Label>
              <Input
                id="cycle-num"
                type="number"
                min="1"
                value={form.numero_ciclo}
                onChange={(e) => set("numero_ciclo", e.target.value)}
                placeholder="18"
              />
            </div>
            <div className="space-y-1">
              {/* spacer */}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cycle-inicio">Data de Início</Label>
              <Input
                id="cycle-inicio"
                type="date"
                value={form.data_inicio}
                onChange={(e) => set("data_inicio", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cycle-fim">Data de Fim</Label>
              <Input
                id="cycle-fim"
                type="date"
                value={form.data_fim}
                onChange={(e) => set("data_fim", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="cycle-ativo"
              checked={form.ativo}
              onCheckedChange={(v) => set("ativo", v)}
            />
            <Label htmlFor="cycle-ativo">
              Ciclo activo
              {form.ativo && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (desactiva os restantes ao guardar)
                </span>
              )}
            </Label>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {saveMutation.isPending ? "A guardar…" : isEdit ? "Guardar" : "Criar Ciclo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ComprasPage() {
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["compras"],
    queryFn: fetchCompras,
  });

  const { data: cycles = [], isLoading: loadingCycles } = useQuery({
    queryKey: ["cycles"],
    queryFn: fetchCycles,
  });

  const { data: activeProducts = [] } = useQuery({
    queryKey: ["active-products"],
    queryFn: fetchActiveProducts,
  });

  const activeCycle = cycles.find((c) => c.ativo) ?? null;

  const [cycleFilter, setCycleFilter] = useState<string>("__all__");
  const [monthFilter, setMonthFilter] = useState<string>("__all__");
  const [page, setPage] = useState(0);

  const [compraOpen, setCompraOpen] = useState(false);
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [editCycle, setEditCycle] = useState<Cycle | null>(null);

  // available months derived from data
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const p of purchases) set.add(p.data_compra.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [purchases]);

  const filtered = useMemo(() => {
    return purchases.filter((p) => {
      if (cycleFilter !== "__all__") {
        if (cycleFilter === "__none__") {
          if (p.cycle_id !== null) return false;
        } else {
          if (p.cycle_id !== cycleFilter) return false;
        }
      }
      if (monthFilter !== "__all__" && !p.data_compra.startsWith(monthFilter)) return false;
      return true;
    });
  }, [purchases, cycleFilter, monthFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const ms = monthStart();
  const gastoCiclo = useMemo(() => {
    if (!activeCycle) return 0;
    return purchases
      .filter((p) => p.cycle_id === activeCycle.id)
      .reduce((s, p) => s + p.total, 0);
  }, [purchases, activeCycle]);

  const gastoMes = useMemo(
    () => purchases.filter((p) => p.data_compra >= ms).reduce((s, p) => s + p.total, 0),
    [purchases, ms]
  );

  const nCiclo = useMemo(
    () => (activeCycle ? purchases.filter((p) => p.cycle_id === activeCycle.id).length : 0),
    [purchases, activeCycle]
  );

  function handleCycleFilter(v: string) { setCycleFilter(v); setPage(0); }
  function handleMonthFilter(v: string) { setMonthFilter(v); setPage(0); }

  function openNewCycle() { setEditCycle(null); setCycleModalOpen(true); }
  function openEditCycle(c: Cycle) { setEditCycle(c); setCycleModalOpen(true); }

  const qc = useQueryClient();
  const toggleActiveMutation = useMutation({
    mutationFn: async (cycle: Cycle) => {
      const newAtivo = !cycle.ativo;
      if (newAtivo) {
        // desactivar todos primeiro
        const { error: e1 } = await supabase
          .from("boticario_cycles")
          .update({ ativo: false })
          .neq("id", cycle.id);
        if (e1) throw e1;
      }
      const { error } = await supabase
        .from("boticario_cycles")
        .update({ ativo: newAtivo })
        .eq("id", cycle.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Estado do ciclo actualizado.");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao actualizar ciclo."),
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Aprovisionamento</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Compras</h1>
          <p className="text-muted-foreground mt-2">Histórico de compras e ciclos O Boticário.</p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
          onClick={() => setCompraOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nova Compra
        </Button>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Gasto neste ciclo</p>
              <p className="text-2xl font-display font-semibold mt-2">
                {loadingPurchases ? "…" : eur(gastoCiclo)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Gasto este mês</p>
              <p className="text-2xl font-display font-semibold mt-2">
                {loadingPurchases ? "…" : eur(gastoMes)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Compras neste ciclo</p>
              <p className="text-2xl font-display font-semibold mt-2">
                {loadingPurchases ? "…" : nCiclo}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
              <Receipt className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Ciclo activo</p>
              {loadingCycles ? (
                <p className="text-2xl font-display font-semibold mt-2">…</p>
              ) : activeCycle ? (
                <>
                  <p className="text-lg font-display font-semibold mt-2 leading-tight">
                    {activeCycle.numero_ciclo ? `Ciclo ${activeCycle.numero_ciclo}` : activeCycle.nome}
                  </p>
                  {(activeCycle.data_inicio || activeCycle.data_fim) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeCycle.data_inicio ? fmtDate(activeCycle.data_inicio) : "—"}
                      {" → "}
                      {activeCycle.data_fim ? fmtDate(activeCycle.data_fim) : "—"}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">Sem ciclo activo</p>
              )}
            </div>
            <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </section>

      {/* Purchase history */}
      <section className="space-y-4">
        <h2 className="text-lg font-display font-semibold">Histórico de Compras</h2>

        <div className="flex flex-wrap gap-3 items-center">
          <Select value={cycleFilter} onValueChange={handleCycleFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todos os ciclos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os ciclos</SelectItem>
              <SelectItem value="__none__">Sem ciclo</SelectItem>
              {cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.numero_ciclo ? `Ciclo ${c.numero_ciclo} — ` : ""}
                  {c.nome}
                  {c.ativo ? " ✦" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={monthFilter} onValueChange={handleMonthFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos os meses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os meses</SelectItem>
              {availableMonths.map((m) => {
                const [year, month] = m.split("-");
                const label = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString(
                  "pt-PT",
                  { month: "long", year: "numeric" }
                );
                return (
                  <SelectItem key={m} value={m}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground ml-auto">
            {filtered.length} registo{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground font-semibold">Data</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Ciclo</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Produto</TableHead>
                  <TableHead className="text-primary-foreground font-semibold text-right">Qtd</TableHead>
                  <TableHead className="text-primary-foreground font-semibold text-right">Preço Unit.</TableHead>
                  <TableHead className="text-primary-foreground font-semibold text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPurchases && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      A carregar…
                    </TableCell>
                  </TableRow>
                )}
                {!loadingPurchases && pageData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Nenhuma compra encontrada.
                    </TableCell>
                  </TableRow>
                )}
                {pageData.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="text-muted-foreground tabular-nums">
                      {fmtDate(p.data_compra)}
                    </TableCell>
                    <TableCell>
                      {p.cycle_nome ? (
                        <span className="text-sm">
                          {p.cycle_numero ? `Ciclo ${p.cycle_numero}` : p.cycle_nome}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.produto_nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.quantidade}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(p.preco_custo_unit)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {eur(p.total)}
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
      </section>

      {/* Cycles management */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-display font-semibold">Ciclos O Boticário</h2>
          <Button variant="outline" size="sm" onClick={openNewCycle}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Ciclo
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground font-semibold">Ciclo</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Nome</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Início</TableHead>
                  <TableHead className="text-primary-foreground font-semibold">Fim</TableHead>
                  <TableHead className="text-primary-foreground font-semibold text-center">Activo</TableHead>
                  <TableHead className="text-primary-foreground font-semibold text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCycles && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      A carregar…
                    </TableCell>
                  </TableRow>
                )}
                {!loadingCycles && cycles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum ciclo criado ainda.
                    </TableCell>
                  </TableRow>
                )}
                {cycles.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="tabular-nums font-medium">
                      {c.numero_ciclo ?? "—"}
                    </TableCell>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {c.data_inicio ? fmtDate(c.data_inicio) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {c.data_fim ? fmtDate(c.data_fim) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={c.ativo}
                        onCheckedChange={() => toggleActiveMutation.mutate(c)}
                        disabled={toggleActiveMutation.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditCycle(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>

      <NovaCompraModal
        open={compraOpen}
        onClose={() => setCompraOpen(false)}
        cycles={cycles}
        products={activeProducts}
        defaultCycleId={activeCycle?.id ?? ""}
      />
      <CycleModal
        open={cycleModalOpen}
        onClose={() => { setCycleModalOpen(false); setEditCycle(null); }}
        initial={editCycle}
      />
    </div>
  );
}
