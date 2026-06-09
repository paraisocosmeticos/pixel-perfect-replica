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
import { Package, AlertTriangle, TrendingUp, Coins, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos — Secrets VIP" },
      { name: "description", content: "Catálogo de produtos, stock e margens." },
    ],
  }),
  component: ProdutosPage,
});

type Product = Tables<"products">;
type StockRow = Tables<"stock_central">;

type ProductWithStock = Product & { stock_qg: number };

const PAGE_SIZE = 20;

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function margem(custo: number, venda: number): string {
  if (venda <= 0) return "—";
  return ((venda - custo) / venda * 100).toFixed(1) + "%";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchProdutos(): Promise<ProductWithStock[]> {
  const [{ data: products, error: pErr }, { data: stock, error: sErr }] = await Promise.all([
    supabase.from("products").select("*").order("nome"),
    supabase.from("stock_central").select("produto_id, stock_qg"),
  ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;

  const stockMap = new Map<string, number>();
  for (const s of stock ?? []) {
    stockMap.set(s.produto_id!, Number(s.stock_qg ?? 0));
  }

  return (products ?? []).map((p) => ({
    ...p,
    stock_qg: stockMap.get(p.id) ?? 0,
  }));
}

const BLANK_FORM = {
  nome: "",
  categoria: "",
  preco_custo: "",
  preco_venda: "",
  slug: "",
  unidade_min_stock: "5",
  validade_meses: "24",
  ativo: true,
};

type FormState = typeof BLANK_FORM;

function statusBadge(stock: number, min: number) {
  if (stock === 0) return <Badge className="bg-destructive text-destructive-foreground">Crítico</Badge>;
  if (stock < min) return <Badge className="bg-orange-500 text-white">Alerta</Badge>;
  return <Badge className="bg-emerald-600 text-white">OK</Badge>;
}

function ProductModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: (Product & { stock_qg: number }) | null;
}) {
  const qc = useQueryClient();
  const isEdit = initial !== null;

  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          nome: initial.nome,
          categoria: initial.categoria,
          preco_custo: String(initial.preco_custo),
          preco_venda: String(initial.preco_venda),
          slug: initial.slug,
          unidade_min_stock: String(initial.unidade_min_stock),
          validade_meses: String(initial.validade_meses),
          ativo: initial.ativo,
        }
      : { ...BLANK_FORM }
  );

  // reset when dialog opens with new data
  const [lastId, setLastId] = useState<string | null>(initial?.id ?? null);
  if ((initial?.id ?? null) !== lastId) {
    setLastId(initial?.id ?? null);
    setForm(
      initial
        ? {
            nome: initial.nome,
            categoria: initial.categoria,
            preco_custo: String(initial.preco_custo),
            preco_venda: String(initial.preco_venda),
            slug: initial.slug,
            unidade_min_stock: String(initial.unidade_min_stock),
            validade_meses: String(initial.validade_meses),
            ativo: initial.ativo,
          }
        : { ...BLANK_FORM }
    );
  }

  const custo = parseFloat(form.preco_custo) || 0;
  const venda = parseFloat(form.preco_venda) || 0;
  const margemLive = margem(custo, venda);

  function set(field: keyof FormState, value: string | boolean) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "nome" && !isEdit) {
        next.slug = slugify(String(value));
      }
      return next;
    });
  }

  const insertMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const slug = f.slug.trim() || slugify(f.nome);
      const { error } = await supabase.from("products").insert({
        nome: f.nome.trim(),
        categoria: f.categoria.trim(),
        preco_custo: parseFloat(f.preco_custo),
        preco_venda: parseFloat(f.preco_venda),
        slug,
        unidade_min_stock: parseInt(f.unidade_min_stock) || 5,
        validade_meses: parseInt(f.validade_meses) || 24,
        ativo: f.ativo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success("Produto criado com sucesso.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar produto."),
  });

  const updateMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const { error } = await supabase
        .from("products")
        .update({
          nome: f.nome.trim(),
          categoria: f.categoria.trim(),
          preco_custo: parseFloat(f.preco_custo),
          preco_venda: parseFloat(f.preco_venda),
          slug: f.slug.trim() || slugify(f.nome),
          unidade_min_stock: parseInt(f.unidade_min_stock) || 5,
          validade_meses: parseInt(f.validade_meses) || 24,
          ativo: f.ativo,
        })
        .eq("id", initial!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success("Produto actualizado.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao actualizar produto."),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("products")
        .update({ ativo: false })
        .eq("id", initial!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success("Produto desactivado.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao desactivar produto."),
  });

  const isPending =
    insertMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.categoria.trim() || !form.preco_custo || !form.preco_venda) {
      toast.error("Preenche os campos obrigatórios: nome, categoria, preços.");
      return;
    }
    if (isEdit) updateMutation.mutate(form);
    else insertMutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEdit ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="ex. Shampoo Hidratante 250ml"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="categoria">Categoria *</Label>
              <Input
                id="categoria"
                value={form.categoria}
                onChange={(e) => set("categoria", e.target.value)}
                placeholder="ex. Capilares"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="auto-gerado"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="preco_custo">Preço Custo (€) *</Label>
              <Input
                id="preco_custo"
                type="number"
                min="0"
                step="0.01"
                value={form.preco_custo}
                onChange={(e) => set("preco_custo", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="preco_venda">Preço Venda (€) *</Label>
              <Input
                id="preco_venda"
                type="number"
                min="0"
                step="0.01"
                value={form.preco_venda}
                onChange={(e) => set("preco_venda", e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {custo > 0 && venda > 0 && (
            <p className="text-sm text-muted-foreground">
              Margem calculada:{" "}
              <span className="font-semibold text-foreground">{margemLive}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="unidade_min_stock">Stock mínimo (un.)</Label>
              <Input
                id="unidade_min_stock"
                type="number"
                min="0"
                value={form.unidade_min_stock}
                onChange={(e) => set("unidade_min_stock", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="validade_meses">Validade (meses)</Label>
              <Input
                id="validade_meses"
                type="number"
                min="0"
                value={form.validade_meses}
                onChange={(e) => set("validade_meses", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="ativo"
              checked={form.ativo}
              onCheckedChange={(v) => set("ativo", v)}
            />
            <Label htmlFor="ativo">Produto activo</Label>
          </div>

          <DialogFooter className="gap-2 pt-2">
            {isEdit && initial?.ativo && (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => deactivateMutation.mutate()}
              >
                Desactivar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isPending ? "A guardar…" : isEdit ? "Guardar" : "Criar Produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProdutosPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["produtos"],
    queryFn: fetchProdutos,
  });

  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("__all__");
  const [soAlertas, setSoAlertas] = useState(false);
  const [page, setPage] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductWithStock | null>(null);

  const categorias = useMemo(
    () => Array.from(new Set(data.map((p) => p.categoria))).sort(),
    [data]
  );

  const filtered = useMemo(() => {
    return data.filter((p) => {
      if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoriaFilter !== "__all__" && p.categoria !== categoriaFilter) return false;
      if (soAlertas && p.stock_qg >= p.unidade_min_stock) return false;
      return true;
    });
  }, [data, search, categoriaFilter, soAlertas]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const totalProdutos = data.length;
  const activos = data.filter((p) => p.ativo).length;
  const emAlerta = data.filter((p) => p.stock_qg < p.unidade_min_stock).length;
  const valorCusto = data.reduce((s, p) => s + Number(p.preco_custo) * p.stock_qg, 0);

  const kpis = [
    { label: "Total Produtos", value: isLoading ? "…" : totalProdutos, icon: Package },
    { label: "Activos", value: isLoading ? "…" : activos, icon: TrendingUp },
    { label: "Em Alerta", value: isLoading ? "…" : emAlerta, icon: AlertTriangle },
    { label: "Valor de Custo Total", value: isLoading ? "…" : eur(valorCusto), icon: Coins },
  ];

  function openNew() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(p: ProductWithStock) {
    setEditTarget(p);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
  }

  // reset page when filters change
  function handleSearch(v: string) { setSearch(v); setPage(0); }
  function handleCategoria(v: string) { setCategoriaFilter(v); setPage(0); }
  function handleSoAlertas(v: boolean) { setSoAlertas(v); setPage(0); }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Catálogo</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Produtos</h1>
          <p className="text-muted-foreground mt-2">Gestão de produtos, preços e margens.</p>
        </div>
        <Button
          onClick={openNew}
          className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
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

      {/* Filters */}
      <section className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Pesquisar por nome…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-56"
        />
        <Select value={categoriaFilter} onValueChange={handleCategoria}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <TableHead className="text-primary-foreground font-semibold text-right">Preço Custo</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">Preço Venda</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">Margem %</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">Stock QG</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && pageData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              )}
              {pageData.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => openEdit(p)}
                >
                  <TableCell className="font-medium">
                    <span className={!p.ativo ? "opacity-50 line-through" : ""}>{p.nome}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.categoria}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(Number(p.preco_custo))}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(Number(p.preco_venda))}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {margem(Number(p.preco_custo), Number(p.preco_venda))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.stock_qg}</TableCell>
                  <TableCell className="text-center">
                    {statusBadge(p.stock_qg, p.unidade_min_stock)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
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

      <ProductModal open={modalOpen} onClose={closeModal} initial={editTarget} />
    </div>
  );
}
