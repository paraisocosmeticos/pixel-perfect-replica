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
import { Receipt, ShoppingCart, Coins, Star, Plus, Download, Pencil, Trash2 } from "lucide-react";
import { ProductCombobox } from "@/components/ui/product-combobox";
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
  cliente_nome?: string | null;
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
type SaleLine = { produto_id: string; quantidade: string; preco_venda: string };

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-PT");
}

function emptyLine(products: Product[], id = ""): SaleLine {
  const p = products.find((x) => x.id === id);
  return { produto_id: id, quantidade: "1", preco_venda: p ? String(p.preco_venda) : "" };
}

async function fetchVendasData() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);

  const [
    { data: salonSales },
    { data: directSales },
    { data: products },
    { data: salons },
    { data: repsRaw },
  ] = await Promise.all([
    supabase.from("salon_sales").select("*").order("data", { ascending: false }),
    supabase.from("rep_direct_sales").select("*").order("data", { ascending: false }),
    supabase.from("products").select("id,nome,preco_venda").eq("ativo", true).order("nome"),
    supabase.from("salons").select("id,nome").eq("ativo", true).order("nome"),
    (supabase as any).rpc("get_representantes"),
  ]);

  const reps: Rep[] = (repsRaw ?? []).map((p: any) => ({ id: p.id, nome: p.nome }));
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

// ── Modal Venda em Salão (multi-produto) ──────────────────────────────────────
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
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<SaleLine[]>([emptyLine(products)]);

  useEffect(() => {
    if (open) {
      setSalonId("");
      setData(new Date().toISOString().slice(0, 10));
      setLines([emptyLine(products)]);
    }
  }, [open]);

  function setLine(i: number, field: keyof SaleLine, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function onProduto(i: number, id: string) {
    const p = products.find((x) => x.id === id);
    setLines((prev) => prev.map((l, idx) =>
      idx === i ? { ...l, produto_id: id, preco_venda: p ? String(p.preco_venda) : l.preco_venda } : l
    ));
  }

  const validLines = lines.filter((l) => l.produto_id && parseInt(l.quantidade) > 0 && parseFloat(l.preco_venda) > 0);
  const total = validLines.reduce((s, l) => s + parseFloat(l.preco_venda) * parseInt(l.quantidade), 0);
  const canSave = salonId && validLines.length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const rows = validLines.map((l) => ({
        salon_id: salonId,
        produto_id: l.produto_id,
        quantidade: parseInt(l.quantidade),
        preco_venda: parseFloat(l.preco_venda),
        data,
      }));
      const { error } = await supabase.from("salon_sales").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success(`${validLines.length} venda(s) registada(s).`);
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registar Venda em Salão</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_56px_88px_28px] gap-2 text-xs text-muted-foreground font-medium px-0.5">
              <span>Produto</span><span className="text-center">Qtd</span><span>P. Venda €</span><span />
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_56px_88px_28px] gap-2 items-center">
                <ProductCombobox
                  value={line.produto_id}
                  onChange={(id) => onProduto(i, id)}
                  products={products}
                  showPrice
                  placeholder="Produto…"
                />
                <Input
                  type="number" min="1"
                  value={line.quantidade}
                  onChange={(e) => setLine(i, "quantidade", e.target.value)}
                  className="text-center px-1"
                />
                <Input
                  type="number" min="0" step="0.01"
                  value={line.preco_venda}
                  onChange={(e) => setLine(i, "preco_venda", e.target.value)}
                  className="px-2"
                />
                <Button
                  size="icon" variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >✕</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full" onClick={() => setLines((p) => [...p, emptyLine(products)])}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar produto
            </Button>
          </div>

          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{eur(total)}</span>
              <span className="ml-2 text-xs">(comissões calculadas automaticamente)</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!canSave || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal Venda Directa (multi-produto) ───────────────────────────────────────
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
  const [clienteNome, setClienteNome] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<SaleLine[]>([emptyLine(products)]);

  useEffect(() => {
    if (open) {
      setRepId("");
      setClienteNome("");
      setData(new Date().toISOString().slice(0, 10));
      setLines([emptyLine(products)]);
    }
  }, [open]);

  function setLine(i: number, field: keyof SaleLine, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function onProduto(i: number, id: string) {
    const p = products.find((x) => x.id === id);
    setLines((prev) => prev.map((l, idx) =>
      idx === i ? { ...l, produto_id: id, preco_venda: p ? String(p.preco_venda) : l.preco_venda } : l
    ));
  }

  const validLines = lines.filter((l) => l.produto_id && parseInt(l.quantidade) > 0 && parseFloat(l.preco_venda) > 0);
  const total = validLines.reduce((s, l) => s + parseFloat(l.preco_venda) * parseInt(l.quantidade), 0);
  const canSave = repId && validLines.length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const rows = validLines.map((l) => ({
        representante_id: repId,
        produto_id: l.produto_id,
        quantidade: parseInt(l.quantidade),
        preco_venda: parseFloat(l.preco_venda),
        cliente_nome: clienteNome.trim() || null,
        data,
      }));
      const { error } = await supabase.from("rep_direct_sales").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success(`${validLines.length} venda(s) directa(s) registada(s).`);
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registar Venda Directa</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Representante</Label>
              <Select value={repId} onValueChange={setRepId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {reps.filter((r) => r.id).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Cliente <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_56px_88px_28px] gap-2 text-xs text-muted-foreground font-medium px-0.5">
              <span>Produto</span><span className="text-center">Qtd</span><span>P. Venda €</span><span />
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_56px_88px_28px] gap-2 items-center">
                <ProductCombobox
                  value={line.produto_id}
                  onChange={(id) => onProduto(i, id)}
                  products={products}
                  showPrice
                  placeholder="Produto…"
                />
                <Input
                  type="number" min="1"
                  value={line.quantidade}
                  onChange={(e) => setLine(i, "quantidade", e.target.value)}
                  className="text-center px-1"
                />
                <Input
                  type="number" min="0" step="0.01"
                  value={line.preco_venda}
                  onChange={(e) => setLine(i, "preco_venda", e.target.value)}
                  className="px-2"
                />
                <Button
                  size="icon" variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >✕</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full" onClick={() => setLines((p) => [...p, emptyLine(products)])}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar produto
            </Button>
          </div>

          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{eur(total)}</span>
              <span className="ml-2 text-xs">(comissão 25% calculada automaticamente)</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!canSave || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal Editar Venda em Salão ───────────────────────────────────────────────
function EditSalonSaleModal({
  sale,
  onClose,
  products,
  salons,
}: {
  sale: SalonSale | null;
  onClose: () => void;
  products: Product[];
  salons: Salon[];
}) {
  const qc = useQueryClient();
  const [salonId, setSalonId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [precoVenda, setPrecoVenda] = useState("");
  const [data, setData] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (sale) {
      setSalonId(sale.salon_id);
      setProdutoId(sale.produto_id);
      setQuantidade(String(sale.quantidade));
      setPrecoVenda(String(sale.preco_venda));
      setData(sale.data);
      setConfirmDelete(false);
    }
  }, [sale]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("salon_sales").update({
        salon_id: salonId,
        produto_id: produtoId,
        quantidade: parseInt(quantidade),
        preco_venda: parseFloat(precoVenda),
        data,
      }).eq("id", sale!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success("Venda actualizada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao actualizar", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("salon_sales").delete().eq("id", sale!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success("Venda apagada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao apagar", { description: e.message }),
  });

  const valid = salonId && produtoId && parseInt(quantidade) > 0 && parseFloat(precoVenda) > 0;

  return (
    <Dialog open={!!sale} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar Venda em Salão</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Salão</Label>
            <Select value={salonId} onValueChange={setSalonId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {salons.filter((s) => s.id).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Produto</Label>
            <ProductCombobox
              value={produtoId}
              onChange={(id) => {
                setProdutoId(id);
                const p = products.find((x) => x.id === id);
                if (p) setPrecoVenda(String(p.preco_venda));
              }}
              products={products}
              showPrice
            />
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
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {confirmDelete ? (
            <div className="flex gap-2 w-full sm:mr-auto">
              <Button variant="destructive" className="flex-1" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "A apagar…" : "Confirmar apagar"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            </div>
          ) : (
            <Button variant="destructive" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => saveMutation.mutate()}
            disabled={!valid || saveMutation.isPending}
          >
            {saveMutation.isPending ? "A guardar…" : "Guardar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal Editar Venda Directa ────────────────────────────────────────────────
function EditDirectSaleModal({
  sale,
  onClose,
  products,
  reps,
}: {
  sale: DirectSale | null;
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
  const [data, setData] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (sale) {
      setRepId(sale.representante_id);
      setProdutoId(sale.produto_id);
      setQuantidade(String(sale.quantidade));
      setPrecoVenda(String(sale.preco_venda));
      setClienteNome(sale.cliente_nome ?? "");
      setData(sale.data);
      setConfirmDelete(false);
    }
  }, [sale]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rep_direct_sales").update({
        representante_id: repId,
        produto_id: produtoId,
        quantidade: parseInt(quantidade),
        preco_venda: parseFloat(precoVenda),
        cliente_nome: clienteNome.trim() || null,
        data,
      }).eq("id", sale!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success("Venda actualizada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao actualizar", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rep_direct_sales").delete().eq("id", sale!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success("Venda apagada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao apagar", { description: e.message }),
  });

  const valid = repId && produtoId && parseInt(quantidade) > 0 && parseFloat(precoVenda) > 0;

  return (
    <Dialog open={!!sale} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar Venda Directa</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Representante</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {reps.filter((r) => r.id).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Produto</Label>
            <ProductCombobox
              value={produtoId}
              onChange={(id) => {
                setProdutoId(id);
                const p = products.find((x) => x.id === id);
                if (p) setPrecoVenda(String(p.preco_venda));
              }}
              products={products}
              showPrice
            />
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
            <Label>Cliente <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {confirmDelete ? (
            <div className="flex gap-2 w-full sm:mr-auto">
              <Button variant="destructive" className="flex-1" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "A apagar…" : "Confirmar apagar"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            </div>
          ) : (
            <Button variant="destructive" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => saveMutation.mutate()}
            disabled={!valid || saveMutation.isPending}
          >
            {saveMutation.isPending ? "A guardar…" : "Guardar alterações"}
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
  const [editSalonSale, setEditSalonSale] = useState<SalonSale | null>(null);
  const [editDirectSale, setEditDirectSale] = useState<DirectSale | null>(null);

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
                  <TableHead className="text-primary-foreground w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {!isLoading && filteredSalon.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Nenhuma venda encontrada.</TableCell></TableRow>
                )}
                {filteredSalon.map((s) => (
                  <TableRow key={s.id} className="group">
                    <TableCell>{fmtDate(s.data)}</TableCell>
                    <TableCell>{data?.salonMap.get(s.salon_id) ?? "—"}</TableCell>
                    <TableCell className="font-medium">{data?.prodMap.get(s.produto_id) ?? "—"}</TableCell>
                    <TableCell className="text-right">{s.quantidade}</TableCell>
                    <TableCell className="text-right">{eur(Number(s.preco_venda))}</TableCell>
                    <TableCell className="text-right font-medium">{eur(Number(s.preco_final))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{eur(Number(s.comissao_salao))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{eur(Number(s.comissao_rep))}</TableCell>
                    <TableCell>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setEditSalonSale(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
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
                  <TableHead className="text-primary-foreground w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {!isLoading && filteredDirect.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhuma venda encontrada.</TableCell></TableRow>
                )}
                {filteredDirect.map((s) => (
                  <TableRow key={s.id} className="group">
                    <TableCell>{fmtDate(s.data)}</TableCell>
                    <TableCell>{data?.repMap.get(s.representante_id) ?? "—"}</TableCell>
                    <TableCell className="font-medium">{data?.prodMap.get(s.produto_id) ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.cliente_nome ?? "—"}</TableCell>
                    <TableCell className="text-right">{s.quantidade}</TableCell>
                    <TableCell className="text-right font-medium">{eur(Number(s.preco_final))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{eur(Number(s.comissao_rep))}</TableCell>
                    <TableCell>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setEditDirectSale(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
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
      <EditSalonSaleModal
        sale={editSalonSale}
        onClose={() => setEditSalonSale(null)}
        products={products}
        salons={salons}
      />
      <EditDirectSaleModal
        sale={editDirectSale}
        onClose={() => setEditDirectSale(null)}
        products={products}
        reps={reps}
      />
    </div>
  );
}
