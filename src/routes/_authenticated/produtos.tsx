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
import { Package, AlertTriangle, TrendingUp, Coins, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Secrets VIP" }] }),
  component: ProdutosPage,
});

type Product = {
  id: string;
  nome: string;
  categoria: string;
  slug: string;
  preco_custo: number;
  preco_venda: number;
  unidade_min_stock: number;
  validade_meses: number;
  ativo: boolean;
};

type StockRow = {
  produto_id: string | null;
  stock_qg: number | null;
};

type ProductWithStock = Product & { stock_qg: number };

const CATEGORIAS = [
  "Perfumaria",
  "Maquilhagem",
  "Cuidado de Pele",
  "Cuidado Capilar",
  "Corpo & Banho",
  "Outros",
];

const PAGE_SIZE = 20;

function toSlug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Date.now()
  );
}

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function margem(custo: number, venda: number) {
  if (!venda) return "0.0";
  return (((venda - custo) / venda) * 100).toFixed(1);
}

function StatusBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0) return <Badge className="bg-red-600 text-white hover:bg-red-600">Crítico</Badge>;
  if (stock < min) return <Badge className="bg-orange-500 text-white hover:bg-orange-500">Alerta</Badge>;
  return <Badge className="bg-green-600 text-white hover:bg-green-600">OK</Badge>;
}

async function fetchProductsWithStock(): Promise<ProductWithStock[]> {
  const [{ data: products }, { data: stock }] = await Promise.all([
    supabase.from("products").select("*").order("nome"),
    supabase.from("stock_central").select("produto_id,stock_qg"),
  ]);
  const stockMap = new Map((stock ?? []).map((s: StockRow) => [s.produto_id, s.stock_qg ?? 0]));
  return (products ?? []).map((p: Product) => ({
    ...p,
    stock_qg: stockMap.get(p.id) ?? 0,
  }));
}

type FormState = {
  nome: string;
  categoria: string;
  preco_custo: string;
  preco_venda: string;
  unidade_min_stock: string;
  validade_meses: string;
};

const emptyForm: FormState = {
  nome: "",
  categoria: "",
  preco_custo: "",
  preco_venda: "",
  unidade_min_stock: "5",
  validade_meses: "24",
};

function ProductModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductWithStock | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (product) {
      setForm({
        nome: product.nome,
        categoria: product.categoria,
        preco_custo: String(product.preco_custo),
        preco_venda: String(product.preco_venda),
        unidade_min_stock: String(product.unidade_min_stock),
        validade_meses: String(product.validade_meses),
      });
    } else {
      setForm(emptyForm);
    }
  }, [product, open]);

  const custo = parseFloat(form.preco_custo) || 0;
  const venda = parseFloat(form.preco_venda) || 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        categoria: form.categoria,
        slug: toSlug(form.nome.trim()),
        preco_custo: parseFloat(form.preco_custo),
        preco_venda: parseFloat(form.preco_venda),
        unidade_min_stock: parseInt(form.unidade_min_stock),
        validade_meses: parseInt(form.validade_meses),
      };
      console.log("INSERT DATA:", payload);
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({ ...payload, ativo: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(product ? "Produto actualizado." : "Produto criado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("products")
        .update({ ativo: false })
        .eq("id", product!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto desactivado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.nome.trim() && form.categoria && custo > 0 && venda > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={set("nome")} placeholder="Ex: Eau de Parfum 75ml" />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Preço Custo (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.preco_custo} onChange={set("preco_custo")} />
            </div>
            <div className="space-y-1">
              <Label>Preço Venda (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.preco_venda} onChange={set("preco_venda")} />
            </div>
          </div>
          {custo > 0 && venda > 0 && (
            <p className="text-sm text-muted-foreground">
              Margem calculada:{" "}
              <span className="font-semibold text-foreground">{margem(custo, venda)}%</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Stock mínimo (un.)</Label>
              <Input type="number" min="0" value={form.unidade_min_stock} onChange={set("unidade_min_stock")} />
            </div>
            <div className="space-y-1">
              <Label>Validade (meses)</Label>
              <Input type="number" min="1" value={form.validade_meses} onChange={set("validade_meses")} />
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {product && product.ativo && (
            <Button
              variant="destructive"
              className="sm:mr-auto"
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
            >
              Desactivar
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => saveMutation.mutate()}
            disabled={!valid || saveMutation.isPending}
          >
            {saveMutation.isPending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProdutosPage() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProductsWithStock,
  });

  const { data: currentUser } = useQuery({ queryKey: ["current-user"] });
  const isAdmin = (currentUser as any)?.role === "admin";

  const { data: custoMedioRows = [] } = useQuery({
    queryKey: ["custo-medio"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("produto_custo_medio").select("produto_id,custo_medio,preco_custo");
      return (data ?? []) as { produto_id: string; custo_medio: number; preco_custo: number }[];
    },
    enabled: isAdmin,
  });

  const custoMedioMap = new Map(custoMedioRows.map((r) => [r.produto_id, Number(r.custo_medio)]));

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todas");
  const [soAlertas, setSoAlertas] = useState(false);
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<ProductWithStock | null>(null);

  const ativos = products.filter((p) => p.ativo);
  const emAlerta = ativos.filter((p) => p.stock_qg < p.unidade_min_stock);
  const valorCusto = ativos.reduce((s, p) => s + p.preco_custo * p.stock_qg, 0);

  const categorias = Array.from(new Set(products.map((p) => p.categoria))).sort();

  const filtered = products.filter((p) => {
    if (!isAdmin && !p.ativo) return false; // representantes só vêem activos
    if (catFilter !== "todas" && p.categoria !== catFilter) return false;
    if (soAlertas && p.stock_qg >= p.unidade_min_stock) return false;
    if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function openEdit(p: ProductWithStock) { setSelected(p); setModalOpen(true); }

  useEffect(() => { setPage(0); }, [search, catFilter, soAlertas]);

  // ── Vista simplificada para representantes ───────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="space-y-8">
        <header>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Catálogo</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Catálogo de Produtos</h1>
          <p className="text-muted-foreground mt-2">Produtos disponíveis para transferência.</p>
        </header>

        <section className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              className="w-56"
              placeholder="Pesquisar por nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground">Nome</TableHead>
                  <TableHead className="text-primary-foreground">Categoria</TableHead>
                  <TableHead className="text-primary-foreground text-right">Preço Venda</TableHead>
                  <TableHead className="text-primary-foreground text-center">Disponível</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-10">A carregar…</TableCell>
                  </TableRow>
                )}
                {!isLoading && paginated.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-10">Nenhum produto encontrado.</TableCell>
                  </TableRow>
                )}
                {paginated.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{p.categoria}</TableCell>
                    <TableCell className="text-right">{eur(p.preco_venda)}</TableCell>
                    <TableCell className="text-center">
                      {p.stock_qg > 0
                        ? <Badge className="bg-green-600 text-white hover:bg-green-600">Em stock</Badge>
                        : <Badge className="bg-red-600 text-white hover:bg-red-600">Sem stock</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── Vista completa para admin ────────────────────────────────────────────────
  const kpis = [
    { label: "Total Produtos", value: products.length, icon: Package },
    { label: "Activos", value: ativos.length, icon: TrendingUp },
    { label: "Em Alerta", value: emAlerta.length, icon: AlertTriangle },
    { label: "Valor Custo Total", value: eur(valorCusto), icon: Coins },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Catálogo</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Produtos</h1>
          <p className="text-muted-foreground mt-2">Gestão do catálogo e preços.</p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 mt-2"
          onClick={() => { setSelected(null); setModalOpen(true); }}
        >
          <Plus className="h-4 w-4 mr-2" /> Novo Produto
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

      <section className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            className="w-56"
            placeholder="Pesquisar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
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
                <TableHead className="text-primary-foreground text-right">Preço Custo</TableHead>
                <TableHead className="text-primary-foreground text-right">Custo Médio Real</TableHead>
                <TableHead className="text-primary-foreground text-right">Preço Venda</TableHead>
                <TableHead className="text-primary-foreground text-right">Margem %</TableHead>
                <TableHead className="text-primary-foreground text-right">Stock QG</TableHead>
                <TableHead className="text-primary-foreground text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">A carregar…</TableCell>
                </TableRow>
              )}
              {!isLoading && paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">Nenhum produto encontrado.</TableCell>
                </TableRow>
              )}
              {paginated.map((p) => {
                const cm = custoMedioMap.get(p.id);
                const cmColor = cm === undefined
                  ? "text-muted-foreground"
                  : cm < p.preco_custo
                    ? "text-green-600 font-semibold"
                    : cm > p.preco_custo
                      ? "text-red-600 font-semibold"
                      : "text-muted-foreground";
                return (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(p)}>
                    <TableCell className="font-medium">
                      {p.nome}
                      {!p.ativo && <span className="ml-2 text-xs text-muted-foreground">(inactivo)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.categoria}</TableCell>
                    <TableCell className="text-right">{eur(p.preco_custo)}</TableCell>
                    <TableCell className={`text-right ${cmColor}`}>
                      {cm !== undefined ? eur(cm) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{eur(p.preco_venda)}</TableCell>
                    <TableCell className="text-right">{margem(p.preco_custo, p.preco_venda)}%</TableCell>
                    <TableCell className="text-right">{p.stock_qg}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge stock={p.stock_qg} min={p.unidade_min_stock} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <ProductModal open={modalOpen} onClose={() => setModalOpen(false)} product={selected} />
    </div>
  );
}
