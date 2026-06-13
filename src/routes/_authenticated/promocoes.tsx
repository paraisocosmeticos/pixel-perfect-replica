import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tag, Percent, AlertTriangle, Clock, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/promocoes")({
  head: () => ({ meta: [{ title: "Promoções — Secrets VIP" }] }),
  component: PromocoesPage,
});

type Promotion = {
  id: string;
  produto_id: string;
  tipo: "percentual" | "preco_fixo";
  desconto_percentual: number | null;
  preco_fixo: number | null;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
};

type Product = { id: string; nome: string; preco_venda: number };

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-PT");
}

const today = () => new Date().toISOString().slice(0, 10);

type PromoStatus = "activa" | "agendada" | "expirada" | "desactivada";

function getStatus(p: Promotion): PromoStatus {
  if (!p.ativo) return "desactivada";
  const t = today();
  if (p.data_fim < t) return "expirada";
  if (p.data_inicio > t) return "agendada";
  return "activa";
}

function StatusBadge({ status }: { status: PromoStatus }) {
  if (status === "activa") return <Badge className="bg-accent text-accent-foreground hover:bg-accent">Activa</Badge>;
  if (status === "agendada") return <Badge className="bg-blue-600 text-white hover:bg-blue-600">Agendada</Badge>;
  if (status === "expirada") return <Badge variant="secondary">Expirada</Badge>;
  return <Badge className="bg-red-600 text-white hover:bg-red-600">Desactivada</Badge>;
}

function daysUntilExpiry(fim: string): number {
  return Math.ceil((new Date(fim).getTime() - Date.now()) / 86400000);
}

async function fetchPromoData() {
  const [{ data: promos }, { data: products }] = await Promise.all([
    supabase.from("promotions").select("*").order("data_inicio", { ascending: false }),
    supabase.from("products").select("id,nome,preco_venda").eq("ativo", true).order("nome"),
  ]);

  const t = today();
  const promoList = (promos ?? []) as Promotion[];
  const prodList = (products ?? []) as Product[];
  const prodMap = new Map(prodList.map((p) => [p.id, p]));

  const active = promoList.filter((p) => getStatus(p) === "activa");
  const expiringIn3 = active.filter((p) => {
    const d = daysUntilExpiry(p.data_fim);
    return d >= 0 && d <= 3;
  });

  const produtosEmPromo = new Set(active.map((p) => p.produto_id)).size;
  const maiorDesconto = active.reduce((max, p) => {
    if (p.tipo === "percentual" && p.desconto_percentual) {
      return Math.max(max, Number(p.desconto_percentual));
    }
    if (p.tipo === "preco_fixo" && p.preco_fixo) {
      const prod = prodMap.get(p.produto_id);
      if (prod) {
        const pct = ((prod.preco_venda - Number(p.preco_fixo)) / prod.preco_venda) * 100;
        return Math.max(max, pct);
      }
    }
    return max;
  }, 0);

  return { promos: promoList, prodList, prodMap, activeCount: active.length, produtosEmPromo, maiorDesconto, expiringIn3 };
}

// ── Modal Nova Promoção ───────────────────────────────────────────────────────
function NovaPromoModal({
  open,
  onClose,
  prodList,
  prodMap,
}: {
  open: boolean;
  onClose: () => void;
  prodList: Product[];
  prodMap: Map<string, Product>;
}) {
  const qc = useQueryClient();
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState<"percentual" | "preco_fixo">("percentual");
  const [descPct, setDescPct] = useState("");
  const [precoFixo, setPrecoFixo] = useState("");
  const [dataInicio, setDataInicio] = useState(today());
  const [dataFim, setDataFim] = useState("");

  useEffect(() => {
    if (open) {
      setProdutoId(""); setTipo("percentual"); setDescPct(""); setPrecoFixo("");
      setDataInicio(today()); setDataFim("");
    }
  }, [open]);

  const prod = prodMap.get(produtoId) ?? null;

  // preview
  let precoFinal: number | null = null;
  let descontoEquiv: number | null = null;
  if (prod) {
    if (tipo === "percentual" && descPct) {
      const pct = parseFloat(descPct);
      precoFinal = Math.round(prod.preco_venda * (1 - pct / 100) * 100) / 100;
      descontoEquiv = pct;
    } else if (tipo === "preco_fixo" && precoFixo) {
      precoFinal = parseFloat(precoFixo);
      descontoEquiv = ((prod.preco_venda - precoFinal) / prod.preco_venda) * 100;
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("promotions").insert({
        produto_id: produtoId,
        tipo,
        desconto_percentual: tipo === "percentual" ? parseFloat(descPct) : null,
        preco_fixo: tipo === "preco_fixo" ? parseFloat(precoFixo) : null,
        data_inicio: dataInicio,
        data_fim: dataFim,
        ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promocoes"] });
      toast.success("Promoção criada.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao guardar", { description: e.message }),
  });

  const valid =
    produtoId && dataInicio && dataFim && dataFim >= dataInicio &&
    (tipo === "percentual"
      ? parseFloat(descPct) > 0 && parseFloat(descPct) <= 100
      : parseFloat(precoFixo) > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nova Promoção</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Produto</Label>
            <Select value={produtoId} onValueChange={setProdutoId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar produto…" /></SelectTrigger>
              <SelectContent>
                {prodList.filter((p) => p.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} — {eur(p.preco_venda)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de promoção</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTipo("percentual")}
                className={`flex-1 rounded-md border py-2 px-3 text-sm font-medium transition-colors ${tipo === "percentual" ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted"}`}
              >
                Desconto %
              </button>
              <button
                type="button"
                onClick={() => setTipo("preco_fixo")}
                className={`flex-1 rounded-md border py-2 px-3 text-sm font-medium transition-colors ${tipo === "preco_fixo" ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted"}`}
              >
                Preço Fixo
              </button>
            </div>
          </div>

          {tipo === "percentual" ? (
            <div className="space-y-1">
              <Label>Desconto (%)</Label>
              <Input
                type="number" min="0" max="100" step="0.1"
                value={descPct}
                onChange={(e) => setDescPct(e.target.value)}
                placeholder="Ex: 20"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Preço Fixo (€)</Label>
              <Input
                type="number" min="0" step="0.01"
                value={precoFixo}
                onChange={(e) => setPrecoFixo(e.target.value)}
                placeholder="Ex: 27.90"
              />
            </div>
          )}

          {prod && precoFinal !== null && descontoEquiv !== null && (
            <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm">
              <p className="font-semibold text-green-800 dark:text-green-200">
                {eur(prod.preco_venda)} → {eur(precoFinal)}{" "}
                <span className="text-green-600 dark:text-green-400">
                  ({descontoEquiv.toFixed(1)}% off)
                </span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data Início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data Fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} min={dataInicio} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending ? "A guardar…" : "Criar Promoção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function PromocoesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["promocoes"], queryFn: fetchPromoData });
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("todas");
  const [modalOpen, setModalOpen] = useState(false);

  const promos = data?.promos ?? [];
  const prodMap = data?.prodMap ?? new Map();

  const filtered = promos.filter((p) => {
    if (statusFilter === "todas") return true;
    return getStatus(p) === statusFilter;
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("promotions").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promocoes"] }); },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const kpis = [
    { label: "Promoções Activas", value: data?.activeCount ?? "—", icon: Tag },
    { label: "Produtos em Promoção", value: data?.produtosEmPromo ?? "—", icon: Percent },
    { label: "Maior Desconto Activo", value: data ? `${data.maiorDesconto.toFixed(1)}%` : "—", icon: Tag },
    { label: "A Expirar em 3 dias", value: data?.expiringIn3.length ?? "—", icon: Clock },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Marketing</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Promoções</h1>
          <p className="text-muted-foreground mt-2">Gestão de promoções e descontos sazonais.</p>
        </div>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 mt-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Promoção
        </Button>
      </header>

      {/* Expiry alert */}
      {!isLoading && (data?.expiringIn3.length ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950 dark:border-orange-800 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-800 dark:text-orange-200">
              {data!.expiringIn3.length} promoção{data!.expiringIn3.length > 1 ? "ões" : ""} a expirar nos próximos 3 dias
            </p>
            <p className="text-orange-700 dark:text-orange-300 mt-0.5">
              {data!.expiringIn3.map((p) => prodMap.get(p.produto_id)?.nome ?? "—").join(", ")}
            </p>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="activa">Activas</SelectItem>
              <SelectItem value="agendada">Agendadas</SelectItem>
              <SelectItem value="expirada">Expiradas</SelectItem>
              <SelectItem value="desactivada">Desactivadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground">Produto</TableHead>
                <TableHead className="text-primary-foreground">Tipo</TableHead>
                <TableHead className="text-primary-foreground">Desconto / Preço</TableHead>
                <TableHead className="text-primary-foreground">De</TableHead>
                <TableHead className="text-primary-foreground">Até</TableHead>
                <TableHead className="text-primary-foreground text-center">Status</TableHead>
                <TableHead className="text-primary-foreground text-center">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma promoção encontrada.</TableCell></TableRow>
              )}
              {filtered.map((p) => {
                const prod = prodMap.get(p.produto_id);
                const status = getStatus(p);
                let descontoText = "—";
                if (p.tipo === "percentual" && p.desconto_percentual != null) {
                  descontoText = `${p.desconto_percentual}%`;
                } else if (p.tipo === "preco_fixo" && p.preco_fixo != null) {
                  descontoText = eur(Number(p.preco_fixo));
                  if (prod) {
                    const equiv = ((prod.preco_venda - Number(p.preco_fixo)) / prod.preco_venda * 100).toFixed(1);
                    descontoText += ` (${equiv}% off)`;
                  }
                }
                const expiring = status === "activa" && daysUntilExpiry(p.data_fim) <= 3 && daysUntilExpiry(p.data_fim) >= 0;
                return (
                  <TableRow key={p.id} className={expiring ? "bg-orange-50 dark:bg-orange-950/30" : ""}>
                    <TableCell className="font-medium">{prod?.nome ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {p.tipo === "percentual" ? "Desconto %" : "Preço Fixo"}
                    </TableCell>
                    <TableCell>{descontoText}</TableCell>
                    <TableCell>{fmtDate(p.data_inicio)}</TableCell>
                    <TableCell>
                      {fmtDate(p.data_fim)}
                      {expiring && <span className="ml-1 text-xs text-orange-600">⚠</span>}
                    </TableCell>
                    <TableCell className="text-center"><StatusBadge status={status} /></TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={p.ativo}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: p.id, ativo: v })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </section>

      <NovaPromoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        prodList={data?.prodList ?? []}
        prodMap={data?.prodMap ?? new Map()}
      />
    </div>
  );
}
