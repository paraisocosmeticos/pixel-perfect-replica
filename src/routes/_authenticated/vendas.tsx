import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, ShoppingCart, Coins, Star, Plus, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Secrets VIP" }] }),
  component: VendasPage,
});

type SalonSale = {
  id: string;
  data: string;
  salon_id: string;
  produto_id: string;
  representante_id: string | null;
  quantidade: number;
  preco_venda: number;
  preco_final: number;
  comissao_salao: number;
  comissao_rep: number;
};

type DirectSale = {
  id: string;
  data: string;
  representante_id: string;
  produto_id: string;
  quantidade: number;
  preco_venda: number;
  preco_final: number;
  comissao_rep: number;
  cliente_nome: string | null;
};

type Product = { id: string; nome: string; preco_venda: number };
type Salon = { id: string; nome: string };
type Rep = { id: string; nome: string };

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-PT");
}

async function fetchVendasData() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);

  const [
    { data: salonSales },
    { data: directSales },
    { data: products },
    { data: salons },
    { data: roles },
  ] = await Promise.all([
    supabase.from("salon_sales").select("*").order("data", { ascending: false }),
    supabase.from("rep_direct_sales").select("*").order("data", { ascending: false }),
    supabase.from("products").select("id,nome,preco_venda").eq("ativo", true).order("nome"),
    supabase.from("salons").select("id,nome").eq("ativo", true).order("nome"),
    supabase.from("user_roles").select("user_id").eq("role", "representante"),
  ]);

  const repIds = (roles ?? []).map((r: any) => r.user_id);
  const { data: profiles } = repIds.length
    ? await supabase.from("profiles").select("id,nome").in("id", repIds)
    : { data: [] };

  const reps: Rep[] = (profiles ?? []).map((p: any) => ({ id: p.id, nome: p.nome }));
  const prodMap = new Map((products ?? []).map((p: Product) => [p.id, p.nome]));
  const salonMap = new Map((salons ?? []).map((s: Salon) => [s.id, s.nome]));
  const repMap = new Map(reps.map((r) => [r.id, r.nome]));

  const thisMonthSalon = (salonSales ?? []).filter((s: SalonSale) => s.data >= monthStart);
  const thisMonthDirect = (directSales ?? []).filter((s: DirectSale) => s.data >= monthStart);

  const totalFaturado =
    [...thisMonthSalon, ...thisMonthDirect].reduce(
      (sum, s: any) => sum + Number(s.preco_final), 0,
    );
  const totalComissoes =
    thisMonthSalon.reduce((sum, s: SalonSale) => sum + Number(s.comissao_rep) + Number(s.comissao_salao), 0) +
    thisMonthDirect.reduce((sum, s: DirectSale) => sum + Number(s.comissao_rep), 0);
  const nVendas = thisMonthSalon.length + thisMonthDirect.length;

  // most sold product this month
  const qtyByProd = new Map<string, number>();
  for (const s of [...thisMonthSalon, ...thisMonthDirect] as any[]) {
    qtyByProd.set(s.produto_id, (qtyByProd.get(s.produto_id) ?? 0) + Number(s.quantidade));
  }
  let topProd = "—";
  let topQty = 0;
  for (const [pid, qty] of qtyByProd) {
    if (qty > topQty) { topQty = qty; topProd = prodMap.get(pid) ?? "—"; }
  }

  return {
    salonSales: (salonSales ?? []) as SalonSale[],
    directSales: (directSales ?? []) as DirectSale[],
    products: (products ?? []) as Product[],
    salons: (salons ?? []) as Salon[],
    reps,
    prodMap,
    salonMap,
    repMap,
    totalFaturado,
    totalComissoes,
    nVendas,
    topProd,
  };
}

// ── Modal Venda em Salão ──────────────────────────────────────────────────────
function VendaSalaoModal({
  open,
  onClose,
  products,
  salons,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  salons: Salon[];
}) {
  const qc = useQueryClient();
  const [salonId, setSalonId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [precoVenda, setPrecoVenda] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setSalonId(""); setProdutoId(""); setQuantidade("1"); setPrecoVenda("");
      setData(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  function onProduto(id: string) {
    setProdutoId(id);
    const p = products.find((x) => x.id === id);
    if (p) setPrecoVenda(String(p.preco_venda));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // Only send fields — trigger calculates preco_final, comissao_salao, comissao_rep
      const { error } = await supabase.from("salon_sales").insert({
        salon_id: salonId,
        produto_id: produtoId,
        quantidade: parseInt(quantidade),
        preco_venda: parseFloat(precoVenda),
        data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success("Venda registada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  const valid = salonId && produtoId && parseInt(quantidade) > 0 && parseFloat(precoVenda) > 0;
  const previewTotal = (parseFloat(precoVenda) || 0) * (parseInt(quantidade) || 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registar Venda em Salão</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Salão</Label>
            <Select value={salonId} onValueChange={setSalonId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar salão…" /></SelectTrigger>
              <SelectContent>
                {salons.filter((s) => s.id).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Produto</Label>
            <Select value={produtoId} onValueChange={onProduto}>
              <SelectTrigger><SelectValue placeholder="Seleccionar produto…" /></SelectTrigger>
              <SelectContent>
                {products.filter((p) => p.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Preço Venda (€)</Label>
              <Input type="number" min="0" step="0.01" value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          {previewTotal > 0 && (
            <p className="text-sm text-muted-foreground">
              Total estimado: <span className="font-semibold text-foreground">{eur(previewTotal)}</span>
              <span className="ml-2 text-xs">(comissões calculadas automaticamente)</span>
            </p>
          )}
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

// ── Modal Venda Directa ───────────────────────────────────────────────────────
function VendaDiretaModal({
  open,
  onClose,
  products,
  reps,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  reps: Rep[];
}) {
  const qc = useQueryClient();
  const [repId, setRepId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [precoVenda, setPrecoVenda] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setRepId(""); setProdutoId(""); setQuantidade("1"); setPrecoVenda(""); setClienteNome("");
      setData(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  function onProduto(id: string) {
    setProdutoId(id);
    const p = products.find((x) => x.id === id);
    if (p) setPrecoVenda(String(p.preco_venda));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // Only send fields — trigger calculates preco_final, comissao_rep (25%)
      const { error } = await supabase.from("rep_direct_sales").insert({
        representante_id: repId,
        produto_id: produtoId,
        quantidade: parseInt(quantidade),
        preco_venda: parseFloat(precoVenda),
        cliente_nome: clienteNome.trim() || null,
        data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success("Venda directa registada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  const valid = repId && produtoId && parseInt(quantidade) > 0 && parseFloat(precoVenda) > 0;
  const previewTotal = (parseFloat(precoVenda) || 0) * (parseInt(quantidade) || 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registar Venda Directa</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Representante</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar representante…" /></SelectTrigger>
              <SelectContent>
                {reps.filter((r) => r.id).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Produto</Label>
            <Select value={produtoId} onValueChange={onProduto}>
              <SelectTrigger><SelectValue placeholder="Seleccionar produto…" /></SelectTrigger>
              <SelectContent>
                {products.filter((p) => p.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Preço Venda (€)</Label>
              <Input type="number" min="0" step="0.01" value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Cliente (opcional)</Label>
            <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          {previewTotal > 0 && (
            <p className="text-sm text-muted-foreground">
              Total estimado: <span className="font-semibold text-foreground">{eur(previewTotal)}</span>
              <span className="ml-2 text-xs">(comissão 25% calculada automaticamente)</span>
            </p>
          )}
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

// ── CSV export helper ─────────────────────────────────────────────────────────
function exportCsv(headers: string[], rows: string[][], filename: string) {
  const lines = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────
function VendasPage() {
  const { data, isLoading } = useQuery({ queryKey: ["vendas"], queryFn: fetchVendasData });

  const [salonFilter, setSalonFilter] = useState("todos");
  const [repFilter, setRepFilter] = useState("todos");
  const [monthFilter, setMonthFilter] = useState("todos-meses");
  const [vendaSalaoOpen, setVendaSalaoOpen] = useState(false);
  const [vendaDiretaOpen, setVendaDiretaOpen] = useState(false);

  const salonSales = data?.salonSales ?? [];
  const directSales = data?.directSales ?? [];
  const products = data?.products ?? [];
  const salons = data?.salons ?? [];
  const reps = data?.reps ?? [];

  const allMonths = Array.from(
    new Set([
      ...salonSales.map((s) => s.data.slice(0, 7)),
      ...directSales.map((s) => s.data.slice(0, 7)),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  const filteredSalon = salonSales.filter((s) => {
    if (salonFilter !== "todos" && s.salon_id !== salonFilter) return false;
    if (monthFilter !== "todos-meses" && !s.data.startsWith(monthFilter)) return false;
    return true;
  });

  const filteredDirect = directSales.filter((s) => {
    if (repFilter !== "todos" && s.representante_id !== repFilter) return false;
    if (monthFilter !== "todos-meses" && !s.data.startsWith(monthFilter)) return false;
    return true;
  });

  const kpis = [
    { label: "Faturado Este Mês", value: data ? eur(data.totalFaturado) : "—", icon: Receipt },
    { label: "Nº Vendas Este Mês", value: data?.nVendas ?? "—", icon: ShoppingCart },
    { label: "Comissões Geradas", value: data ? eur(data.totalComissoes) : "—", icon: Coins },
    { label: "Produto Mais Vendido", value: data?.topProd ?? "—", icon: Star },
  ];

  function exportSalon() {
    const headers = ["Data", "Salão", "Produto", "Qtd", "Preço Unit", "Total", "Comissão Salão", "Comissão Rep"];
    const rows = filteredSalon.map((s) => [
      fmtDate(s.data),
      data?.salonMap.get(s.salon_id) ?? s.salon_id,
      data?.prodMap.get(s.produto_id) ?? s.produto_id,
      String(s.quantidade),
      eur(Number(s.preco_venda)),
      eur(Number(s.preco_final)),
      eur(Number(s.comissao_salao)),
      eur(Number(s.comissao_rep)),
    ]);
    exportCsv(headers, rows, "vendas-saloes.csv");
  }

  function exportDirect() {
    const headers = ["Data", "Representante", "Produto", "Cliente", "Qtd", "Total", "Comissão"];
    const rows = filteredDirect.map((s) => [
      fmtDate(s.data),
      data?.repMap.get(s.representante_id) ?? s.representante_id,
      data?.prodMap.get(s.produto_id) ?? s.produto_id,
      s.cliente_nome ?? "—",
      String(s.quantidade),
      eur(Number(s.preco_final)),
      eur(Number(s.comissao_rep)),
    ]);
    exportCsv(headers, rows, "vendas-diretas.csv");
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Comercial</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Vendas</h1>
        <p className="text-muted-foreground mt-2">Registo e análise de vendas em salões e directas.</p>
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

      {/* Shared month filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos-meses">Todos os meses</SelectItem>
            {allMonths.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="saloes">
        <TabsList className="mb-4">
          <TabsTrigger value="saloes">Vendas em Salões</TabsTrigger>
          <TabsTrigger value="diretas">Vendas Directas</TabsTrigger>
        </TabsList>

        {/* ── Tab Salões ── */}
        <TabsContent value="saloes" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <Select value={salonFilter} onValueChange={setSalonFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os salões</SelectItem>
                {salons.filter((s) => s.id).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportSalon}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                size="sm"
                onClick={() => setVendaSalaoOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Registar Venda
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground">Data</TableHead>
                  <TableHead className="text-primary-foreground">Salão</TableHead>
                  <TableHead className="text-primary-foreground">Produto</TableHead>
                  <TableHead className="text-primary-foreground text-right">Qtd</TableHead>
                  <TableHead className="text-primary-foreground text-right">Preço Unit</TableHead>
                  <TableHead className="text-primary-foreground text-right">Total</TableHead>
                  <TableHead className="text-primary-foreground text-right">Com. Salão</TableHead>
                  <TableHead className="text-primary-foreground text-right">Com. Rep</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {!isLoading && filteredSalon.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhuma venda encontrada.</TableCell></TableRow>
                )}
                {filteredSalon.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{fmtDate(s.data)}</TableCell>
                    <TableCell>{data?.salonMap.get(s.salon_id) ?? "—"}</TableCell>
                    <TableCell className="font-medium">{data?.prodMap.get(s.produto_id) ?? "—"}</TableCell>
                    <TableCell className="text-right">{s.quantidade}</TableCell>
                    <TableCell className="text-right">{eur(Number(s.preco_venda))}</TableCell>
                    <TableCell className="text-right font-medium">{eur(Number(s.preco_final))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{eur(Number(s.comissao_salao))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{eur(Number(s.comissao_rep))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Tab Directas ── */}
        <TabsContent value="diretas" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as representantes</SelectItem>
                {reps.filter((r) => r.id).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportDirect}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                size="sm"
                onClick={() => setVendaDiretaOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Registar Venda
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground">Data</TableHead>
                  <TableHead className="text-primary-foreground">Representante</TableHead>
                  <TableHead className="text-primary-foreground">Produto</TableHead>
                  <TableHead className="text-primary-foreground">Cliente</TableHead>
                  <TableHead className="text-primary-foreground text-right">Qtd</TableHead>
                  <TableHead className="text-primary-foreground text-right">Total</TableHead>
                  <TableHead className="text-primary-foreground text-right">Comissão 25%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {!isLoading && filteredDirect.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma venda encontrada.</TableCell></TableRow>
                )}
                {filteredDirect.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{fmtDate(s.data)}</TableCell>
                    <TableCell>{data?.repMap.get(s.representante_id) ?? "—"}</TableCell>
                    <TableCell className="font-medium">{data?.prodMap.get(s.produto_id) ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.cliente_nome ?? "—"}</TableCell>
                    <TableCell className="text-right">{s.quantidade}</TableCell>
                    <TableCell className="text-right font-medium">{eur(Number(s.preco_final))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{eur(Number(s.comissao_rep))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <VendaSalaoModal
        open={vendaSalaoOpen}
        onClose={() => setVendaSalaoOpen(false)}
        products={products}
        salons={salons}
      />
      <VendaDiretaModal
        open={vendaDiretaOpen}
        onClose={() => setVendaDiretaOpen(false)}
        products={products}
        reps={reps}
      />
    </div>
  );
}
