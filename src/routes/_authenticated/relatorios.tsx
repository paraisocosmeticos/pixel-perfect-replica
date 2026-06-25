import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ComposedChart, Bar, Line, BarChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Secrets VIP" }] }),
  component: RelatoriosPage,
});

// ── Palette ───────────────────────────────────────────────────────────────────
const C_BAR = "#1a3a2a";
const C_LINE = "#b8973a";
const PIE_COLORS = ["#1a3a2a", "#b8973a", "#4a7c59", "#d4a853", "#2d5a3d", "#e8c87a", "#6aaa87"];

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtPct(v: number) { return `${v.toFixed(1)}%`; }

// ── Date helpers ──────────────────────────────────────────────────────────────
function isoToday() { return new Date().toISOString().slice(0, 10); }

function periodBounds(period: string): { from: string; to: string } {
  const now = new Date();
  if (period === "este-mes") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      to: isoToday(),
    };
  }
  if (period === "ultimo-mes") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  }
  // "este-ciclo" and "personalizado" handled outside
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: isoToday() };
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function fetchRelatoriosBase() {
  const since6m = new Date();
  since6m.setMonth(since6m.getMonth() - 6);
  const since6mStr = since6m.toISOString().slice(0, 10);

  const [
    { data: salonSales },
    { data: directSales },
    { data: products },
    { data: salons },
    { data: purchases },
    { data: roles },
    { data: visits },
    { data: payments },
    { data: activeCycle },
  ] = await Promise.all([
    supabase.from("salon_sales").select("*").gte("data", since6mStr),
    supabase.from("rep_direct_sales").select("*").gte("data", since6mStr),
    supabase.from("products").select("id,nome,preco_custo,preco_venda"),
    supabase.from("salons").select("id,nome").eq("ativo", true),
    supabase.from("purchases").select("produto_id,quantidade,preco_custo_unit,data_compra").gte("data_compra", since6mStr),
    supabase.from("user_roles").select("user_id").eq("role", "representante"),
    supabase.from("salon_visit_log").select("representante_id,data").gte("data", new Date(new Date().setDate(1)).toISOString().slice(0, 10)),
    supabase.from("commission_payments").select("valor,destinatario_tipo,status,data_pagamento"),
    supabase.from("boticario_cycles").select("id,data_inicio,data_fim").eq("ativo", true).maybeSingle(),
  ]);

  const repIds = (roles ?? []).map((r: any) => r.user_id);
  const { data: profiles } = repIds.length
    ? await supabase.from("profiles").select("id,nome").in("id", repIds)
    : { data: [] };

  const prodMap = new Map((products ?? []).map((p: any) => [p.id, p]));
  const salonMap = new Map((salons ?? []).map((s: any) => [s.id, s.nome]));
  const repMap = new Map((profiles ?? []).map((p: any) => [p.id, p.nome]));

  return {
    salonSales: salonSales ?? [],
    directSales: directSales ?? [],
    products: products ?? [],
    salons: salons ?? [],
    purchases: purchases ?? [],
    profiles: profiles ?? [],
    visits: visits ?? [],
    payments: payments ?? [],
    prodMap,
    salonMap,
    repMap,
    activeCycle: activeCycle ?? null,
  };
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCsv(headers: string[], rows: string[][], filename: string) {
  const lines = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name}>
          {entry.name}: {typeof entry.value === "number" && entry.value > 100
            ? eur(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function RelatoriosPage() {
  const { data: base, isLoading } = useQuery({ queryKey: ["relatorios-base"], queryFn: fetchRelatoriosBase });
  const { data: custoMedioRows = [] } = useQuery({
    queryKey: ["custo-medio"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("produto_custo_medio").select("produto_id,custo_medio");
      return (data ?? []) as { produto_id: string; custo_medio: number }[];
    },
  });

  const [period, setPeriod] = useState("este-mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(isoToday());
  const [salonFilter, setSalonFilter] = useState("todos");
  const [repFilter, setRepFilter] = useState("todos");

  // Compute effective date bounds
  const { from, to } = useMemo(() => {
    if (period === "personalizado") return { from: customFrom, to: customTo };
    if (period === "este-ciclo" && base?.activeCycle) {
      return {
        from: base.activeCycle.data_inicio ?? new Date(new Date().setDate(1)).toISOString().slice(0, 10),
        to: base.activeCycle.data_fim ?? isoToday(),
      };
    }
    return periodBounds(period);
  }, [period, customFrom, customTo, base?.activeCycle]);

  // ── Filtered sales ────────────────────────────────────────────────────────
  const filtSalon = useMemo(() => {
    if (!base) return [];
    return base.salonSales.filter((s: any) => {
      if (s.data < from || s.data > to) return false;
      if (salonFilter !== "todos" && s.salon_id !== salonFilter) return false;
      if (repFilter !== "todos" && s.representante_id !== repFilter) return false;
      return true;
    });
  }, [base, from, to, salonFilter, repFilter]);

  const filtDirect = useMemo(() => {
    if (!base) return [];
    return base.directSales.filter((s: any) => {
      if (s.data < from || s.data > to) return false;
      if (repFilter !== "todos" && s.representante_id !== repFilter) return false;
      return true;
    });
  }, [base, from, to, repFilter]);

  const filtPurchases = useMemo(() => {
    if (!base) return [];
    return base.purchases.filter((p: any) => p.data_compra >= from && p.data_compra <= to);
  }, [base, from, to]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const faturado = useMemo(() =>
    [...filtSalon, ...filtDirect].reduce((s: number, r: any) => s + Number(r.preco_final), 0),
    [filtSalon, filtDirect]);

  // Custo real das vendas do período: quantidade_vendida × custo_médio_ponderado
  const custoMedioMap = useMemo(() =>
    new Map(custoMedioRows.map((r) => [r.produto_id, Number(r.custo_medio)])),
    [custoMedioRows]);

  const custoTotal = useMemo(() => {
    return [...filtSalon, ...filtDirect].reduce((s: number, r: any) => {
      const cm = custoMedioMap.get(r.produto_id) ?? 0;
      return s + cm * Number(r.quantidade);
    }, 0);
  }, [filtSalon, filtDirect, custoMedioMap]);

  const lucroBruto = faturado - custoTotal;
  const margemPct = faturado > 0 ? (lucroBruto / faturado) * 100 : 0;

  const comissoesPagas = useMemo(() => {
    if (!base) return 0;
    return base.payments
      .filter((p: any) => p.status === "pago" && p.data_pagamento >= from && p.data_pagamento <= to)
      .reduce((s: number, p: any) => s + Number(p.valor), 0);
  }, [base, from, to]);

  const lucroLiquido = lucroBruto - comissoesPagas;

  // ── Chart: faturado por mês (6m) ─────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!base) return [];
    const map = new Map<string, { faturado: number; custo: number }>();
    for (const s of [...base.salonSales, ...base.directSales] as any[]) {
      const m = s.data.slice(0, 7);
      const cur = map.get(m) ?? { faturado: 0, custo: 0 };
      cur.faturado += Number(s.preco_final);
      const cm = custoMedioMap.get(s.produto_id) ?? 0;
      cur.custo += cm * Number(s.quantidade);
      map.set(m, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([m, v]) => ({
        mes: new Date(m + "-01").toLocaleDateString("pt-PT", { month: "short", year: "2-digit" }),
        Faturado: Math.round(v.faturado * 100) / 100,
        Lucro: Math.round((v.faturado - v.custo) * 100) / 100,
      }));
  }, [base, custoMedioMap]);

  // ── Chart: top 5 produtos ─────────────────────────────────────────────────
  const top5Products = useMemo(() => {
    if (!base) return [];
    const map = new Map<string, { qty: number; valor: number }>();
    for (const s of [...filtSalon, ...filtDirect] as any[]) {
      const cur = map.get(s.produto_id) ?? { qty: 0, valor: 0 };
      cur.qty += Number(s.quantidade);
      cur.valor += Number(s.preco_final);
      map.set(s.produto_id, cur);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.valor - a.valor)
      .slice(0, 5)
      .map(([id, v]) => ({
        nome: (base.prodMap.get(id) as any)?.nome ?? id,
        Quantidade: v.qty,
        Valor: Math.round(v.valor * 100) / 100,
      }));
  }, [base, filtSalon, filtDirect]);

  // ── Chart: pie por salão ──────────────────────────────────────────────────
  const salePie = useMemo(() => {
    if (!base) return [];
    const map = new Map<string, number>();
    for (const s of filtSalon as any[]) {
      map.set(s.salon_id, (map.get(s.salon_id) ?? 0) + Number(s.preco_final));
    }
    const direct = filtDirect.reduce((a: number, s: any) => a + Number(s.preco_final), 0);
    if (direct > 0) map.set("__diretas", direct);
    return Array.from(map.entries()).map(([id, val]) => ({
      name: id === "__diretas" ? "Directas" : (base.salonMap.get(id) ?? id),
      value: Math.round(val * 100) / 100,
    }));
  }, [base, filtSalon, filtDirect]);

  // ── Table: representantes ─────────────────────────────────────────────────
  const repSummary = useMemo(() => {
    if (!base) return [];
    const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    return base.profiles.map((p: any) => {
      const vendSalao = filtSalon
        .filter((s: any) => s.representante_id === p.id)
        .reduce((a: number, s: any) => a + Number(s.preco_final), 0);
      const vendDireta = filtDirect
        .filter((s: any) => s.representante_id === p.id)
        .reduce((a: number, s: any) => a + Number(s.preco_final), 0);
      const commSalao = filtSalon
        .filter((s: any) => s.representante_id === p.id)
        .reduce((a: number, s: any) => a + Number(s.comissao_rep), 0);
      const commDireta = filtDirect
        .filter((s: any) => s.representante_id === p.id)
        .reduce((a: number, s: any) => a + Number(s.comissao_rep), 0);
      const visitasMes = base.visits.filter((v: any) => v.representante_id === p.id).length;
      return { id: p.id, nome: p.nome, vendSalao, vendDireta, comm: commSalao + commDireta, visitasMes };
    });
  }, [base, filtSalon, filtDirect]);

  // ── CSV export ────────────────────────────────────────────────────────────
  function handleExport() {
    const headers = ["Data", "Tipo", "Produto", "Quantidade", "Faturado", "Comissão Rep"];
    const rows: string[][] = [];
    for (const s of filtSalon as any[]) {
      rows.push([s.data, "Salão", (base?.prodMap.get(s.produto_id) as any)?.nome ?? "", String(s.quantidade), eur(Number(s.preco_final)), eur(Number(s.comissao_rep))]);
    }
    for (const s of filtDirect as any[]) {
      rows.push([s.data, "Directa", (base?.prodMap.get(s.produto_id) as any)?.nome ?? "", String(s.quantidade), eur(Number(s.preco_final)), eur(Number(s.comissao_rep))]);
    }
    exportCsv(headers, rows, `relatorio-${from}-${to}.csv`);
  }

  const kpis = [
    { label: "Faturado Total", value: eur(faturado) },
    { label: "Custo Total", value: eur(custoTotal) },
    { label: "Lucro Bruto", value: eur(lucroBruto) },
    { label: `Margem %`, value: fmtPct(margemPct) },
    { label: "Comissões Pagas", value: eur(comissoesPagas) },
    { label: "Lucro Líquido", value: eur(lucroLiquido) },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Análise</p>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Relatórios</h1>
          <p className="text-muted-foreground mt-2">Análise financeira e operacional.</p>
        </div>
        <Button variant="outline" className="shrink-0 mt-2" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </header>

      {/* ── Filters ── */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Período</p>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="este-mes">Este Mês</SelectItem>
                <SelectItem value="ultimo-mes">Último Mês</SelectItem>
                <SelectItem value="este-ciclo">Este Ciclo</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "personalizado" && (
            <>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">De</p>
                <Input type="date" className="w-36" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Até</p>
                <Input type="date" className="w-36" value={customTo} onChange={(e) => setCustomTo(e.target.value)} min={customFrom} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Salão</p>
            <Select value={salonFilter} onValueChange={setSalonFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os salões</SelectItem>
                {(base?.salons ?? []).filter((s: any) => s.id).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Representante</p>
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as representantes</SelectItem>
                {(base?.profiles ?? []).filter((p: any) => p.id).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* ── KPI Grid ── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">{k.label}</p>
            <p className="text-xl font-display font-semibold mt-2 leading-tight">
              {isLoading ? "…" : k.value}
            </p>
          </Card>
        ))}
      </section>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Faturado por mês */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Faturado vs Lucro — Últimos 6 Meses</h3>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={monthlyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Faturado" fill={C_BAR} radius={[3, 3, 0, 0]} />
              <Line dataKey="Lucro" stroke={C_LINE} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* Top 5 produtos */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Top 5 Produtos (Valor €)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              layout="vertical"
              data={top5Products}
              margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Valor" fill={C_LINE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Pie por salão */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Distribuição de Vendas por Salão</h3>
          {salePie.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Sem dados para o período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={salePie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {salePie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => eur(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Representantes summary */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Resumo por Representante</h3>
          {repSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem representantes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground text-xs">Nome</TableHead>
                  <TableHead className="text-primary-foreground text-xs text-right">Vnd. Salão</TableHead>
                  <TableHead className="text-primary-foreground text-xs text-right">Vnd. Dir.</TableHead>
                  <TableHead className="text-primary-foreground text-xs text-right">Comissão</TableHead>
                  <TableHead className="text-primary-foreground text-xs text-right">Visitas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repSummary.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium py-2">{r.nome}</TableCell>
                    <TableCell className="text-right text-sm py-2">{eur(r.vendSalao)}</TableCell>
                    <TableCell className="text-right text-sm py-2">{eur(r.vendDireta)}</TableCell>
                    <TableCell className="text-right text-sm py-2 text-accent font-semibold">{eur(r.comm)}</TableCell>
                    <TableCell className="text-right text-sm py-2">{r.visitasMes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
