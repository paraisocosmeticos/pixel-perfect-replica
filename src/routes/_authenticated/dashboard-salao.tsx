import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, TrendingUp, Coins, Calendar, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard-salao")({
  head: () => ({ meta: [{ title: "O Meu Salão — Secrets VIP" }] }),
  component: DashboardSalaoPage,
});

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-PT");
}
function periodoLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

async function fetchSalaoData(salonId: string) {
  const [
    { data: transfers },
    { data: sales },
    { data: returns },
    { data: products },
    { data: visits },
    { data: payments },
  ] = await Promise.all([
    supabase.from("transfers").select("produto_id,quantidade,data").eq("salon_id", salonId),
    supabase.from("salon_sales").select("id,produto_id,quantidade,preco_final,comissao_salao,data").eq("salon_id", salonId).order("data", { ascending: false }),
    supabase.from("returns").select("produto_id,quantidade,data").eq("salon_id", salonId),
    supabase.from("products").select("id,nome"),
    supabase.from("salon_visit_log").select("data,notas,representante_id").eq("salon_id", salonId).order("data", { ascending: false }).limit(10),
    supabase.from("commission_payments").select("*").eq("destinatario_id", salonId).eq("status", "pago").order("data_pagamento", { ascending: false }),
  ]);

  const prodMap = new Map((products ?? []).map((p: any) => [p.id, p.nome]));

  // Stock: transfers - sales - returns per product
  const stockMap = new Map<string, number>();
  for (const t of transfers ?? []) {
    stockMap.set(t.produto_id, (stockMap.get(t.produto_id) ?? 0) + t.quantidade);
  }
  for (const s of sales ?? []) {
    stockMap.set(s.produto_id, (stockMap.get(s.produto_id) ?? 0) - s.quantidade);
  }
  for (const r of returns ?? []) {
    stockMap.set(r.produto_id, (stockMap.get(r.produto_id) ?? 0) - r.quantidade);
  }
  const stock = Array.from(stockMap.entries())
    .filter(([, qty]) => qty > 0)
    .map(([produto_id, qty]) => ({ produto_id, nome: prodMap.get(produto_id) ?? produto_id, qty }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

  // Month periods for filter
  const periods = Array.from(
    new Set((sales ?? []).map((s: any) => s.data.slice(0, 7))),
  ).sort((a, b) => b.localeCompare(a));

  // Commission totals
  const totalComissao = (sales ?? []).reduce((s: number, r: any) => s + Number(r.comissao_salao ?? 0), 0);
  const totalPago = (payments ?? []).reduce((s: number, r: any) => s + Number(r.valor ?? 0), 0);
  const comissaoPendente = Math.max(0, totalComissao - totalPago);

  return {
    stock,
    sales: (sales ?? []) as any[],
    visits: (visits ?? []) as any[],
    payments: (payments ?? []) as any[],
    prodMap,
    periods,
    totalComissao,
    comissaoPendente,
  };
}

function DashboardSalaoPage() {
  const { data: currentUser } = useQuery({ queryKey: ["current-user"] });
  const user = currentUser as any;

  // Only allow salao role
  if (user && user.role !== "salao") {
    return <Navigate to="/dashboard" />;
  }

  const salonId: string | undefined = user?.salonId;
  const salonNome: string = user?.salonNome ?? user?.nome ?? "O Meu Salão";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-salao", salonId],
    queryFn: () => fetchSalaoData(salonId!),
    enabled: !!salonId,
  });

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedPeriod, setSelectedPeriod] = useState(monthStart);

  const monthlySales = (data?.sales ?? []).filter((s: any) => s.data.startsWith(selectedPeriod));
  const monthRevenue = monthlySales.reduce((s: number, r: any) => s + Number(r.preco_final ?? 0), 0);
  const monthComissao = monthlySales.reduce((s: number, r: any) => s + Number(r.comissao_salao ?? 0), 0);
  const lastVisit = data?.visits[0] ?? null;

  const kpis = [
    { label: "Produtos em stock", value: isLoading ? "…" : String(data?.stock.length ?? 0), icon: Package },
    { label: "Vendas do mês", value: isLoading ? "…" : eur(monthRevenue), icon: TrendingUp },
    { label: "Comissão pendente", value: isLoading ? "…" : eur(data?.comissaoPendente ?? 0), icon: Coins },
    { label: "Última visita", value: isLoading ? "…" : fmtDate(lastVisit?.data ?? null), icon: Calendar },
  ];

  if (!salonId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Conta não associada a nenhum salão. Contacta a administradora.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">O Boticário</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">
          Olá, {salonNome}! 👋
        </h1>
        <p className="text-muted-foreground mt-2">Aqui podes consultar o teu stock, vendas e comissões.</p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">{k.label}</p>
                  <p className="text-2xl font-display font-semibold mt-2 leading-tight">{k.value}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-secondary text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {/* Stock actual */}
      <section>
        <h2 className="text-lg font-display font-semibold mb-3">Stock actual</h2>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground">Produto</TableHead>
                <TableHead className="text-primary-foreground text-right">Quantidade</TableHead>
                <TableHead className="text-primary-foreground text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>
              )}
              {!isLoading && (data?.stock ?? []).length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Sem stock registado.</TableCell></TableRow>
              )}
              {(data?.stock ?? []).map((s: any) => (
                <TableRow key={s.produto_id}>
                  <TableCell className="font-medium">{s.nome}</TableCell>
                  <TableCell className={`text-right font-semibold ${s.qty <= 2 ? "text-red-600" : ""}`}>{s.qty}</TableCell>
                  <TableCell className="text-center">
                    {s.qty <= 2
                      ? <Badge className="bg-red-600 text-white hover:bg-red-600 flex items-center gap-1 w-fit mx-auto"><AlertTriangle className="h-3 w-3" /> Stock baixo</Badge>
                      : <Badge className="bg-green-600 text-white hover:bg-green-600">OK</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* Vendas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold">Vendas</h2>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(data?.periods ?? [monthStart]).map((p: string) => (
                <SelectItem key={p} value={p}>{periodoLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground">Data</TableHead>
                <TableHead className="text-primary-foreground">Produto</TableHead>
                <TableHead className="text-primary-foreground text-right">Qtd</TableHead>
                <TableHead className="text-primary-foreground text-right">Total</TableHead>
                <TableHead className="text-primary-foreground text-right">Comissão (25%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>
              )}
              {!isLoading && monthlySales.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem vendas neste período.</TableCell></TableRow>
              )}
              {monthlySales.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>{fmtDate(s.data)}</TableCell>
                  <TableCell>{data?.prodMap.get(s.produto_id) ?? s.produto_id}</TableCell>
                  <TableCell className="text-right">{s.quantidade}</TableCell>
                  <TableCell className="text-right font-semibold">{eur(Number(s.preco_final))}</TableCell>
                  <TableCell className="text-right text-amber-600 font-semibold">{eur(Number(s.comissao_salao ?? 0))}</TableCell>
                </TableRow>
              ))}
              {monthlySales.length > 0 && (
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={3} className="text-right text-muted-foreground text-sm">Total do mês</TableCell>
                  <TableCell className="text-right">{eur(monthRevenue)}</TableCell>
                  <TableCell className="text-right text-amber-600">{eur(monthComissao)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* Comissões */}
      <section>
        <h2 className="text-lg font-display font-semibold mb-3">Comissões</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Card className="p-4 border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <p className="text-xs uppercase tracking-wider text-orange-700 dark:text-orange-400">Pendente a receber</p>
            <p className="text-2xl font-display font-semibold mt-1 text-orange-700 dark:text-orange-400">
              {isLoading ? "…" : eur(data?.comissaoPendente ?? 0)}
            </p>
          </Card>
          <Card className="p-4 border-green-200 bg-green-50 dark:bg-green-950/20">
            <p className="text-xs uppercase tracking-wider text-green-700 dark:text-green-400">Total já recebido</p>
            <p className="text-2xl font-display font-semibold mt-1 text-green-700 dark:text-green-400">
              {isLoading ? "…" : eur((data?.payments ?? []).reduce((s: number, p: any) => s + Number(p.valor), 0))}
            </p>
          </Card>
        </div>
        {(data?.payments ?? []).length > 0 && (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground">Data</TableHead>
                  <TableHead className="text-primary-foreground">Período</TableHead>
                  <TableHead className="text-primary-foreground text-right">Valor recebido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.payments ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtDate(p.data_pagamento)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.periodo ? periodoLabel(p.periodo) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">{eur(Number(p.valor))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {/* Visitas */}
      <section>
        <h2 className="text-lg font-display font-semibold mb-3">Visitas da representante</h2>
        {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
        {!isLoading && (data?.visits ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Sem visitas registadas.</p>
        )}
        <div className="space-y-2">
          {(data?.visits ?? []).map((v: any, i: number) => (
            <Card key={i} className={`p-4 ${i === 0 ? "border-accent/40 bg-accent/5" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">{fmtDate(v.data)}</p>
                  {v.notas && <p className="text-xs text-muted-foreground mt-1">{v.notas}</p>}
                </div>
                {i === 0 && <Badge className="bg-accent text-accent-foreground hover:bg-accent shrink-0">Última visita</Badge>}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
