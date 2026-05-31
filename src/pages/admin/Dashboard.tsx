import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { currentMonthRange } from '../../lib/utils'
import { StatCard } from '../../components/shared/StatCard'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { TrendingUp, ShoppingCart, DollarSign, CreditCard, Store, Package, AlertTriangle } from 'lucide-react'

interface DashboardData {
  vendasMes: number
  investidoMes: number
  lucroLiquido: number
  fiadoPendente: number
  vendasRevendedores: number
  comodato: number
  aReceber: number
  stockBaixo: { id: string; name: string; stock: number }[]
  validadeProxima: { id: string; name: string; expiry_date: string }[]
  encomendas: number
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const { start, end } = currentMonthRange()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const [
      { data: sales },
      { data: purchases },
      { data: creditSales },
      { data: resellerSales },
      { data: resellerStock },
      { data: products },
      { data: orders },
    ] = await Promise.all([
      supabase.from('sales').select('sale_price, quantity, profit').gte('date', start).lte('date', end),
      supabase.from('purchases').select('unit_price, quantity').gte('date', start).lte('date', end),
      supabase.from('credit_sales').select('amount').eq('status', 'pendente'),
      supabase.from('reseller_sales').select('sale_price, quantity').gte('date', start).lte('date', end),
      supabase.from('reseller_stock').select('quantity'),
      supabase.from('products').select('id, name, expiry_date'),
      supabase.from('orders').select('id').eq('status', 'pendente'),
    ])

    const vendasMes = (sales ?? []).reduce((s, r) => s + r.sale_price * r.quantity, 0)
    const investidoMes = (purchases ?? []).reduce((s, r) => s + r.unit_price * r.quantity, 0)
    const lucroLiquido = (sales ?? []).reduce((s, r) => s + r.profit, 0)
    const fiadoPendente = (creditSales ?? []).reduce((s, r) => s + r.amount, 0)
    const vendasRevendedores = (resellerSales ?? []).reduce((s, r) => s + r.sale_price * r.quantity, 0)
    const comodato = (resellerStock ?? []).reduce((s, r) => s + r.quantity, 0)
    const aReceber = vendasRevendedores * 0.65

    // Stock baixo: buscar stock calculado
    const { data: stockData } = await supabase.from('stock_view').select('product_id, name, total_stock').lt('total_stock', 3)
    const stockBaixo = (stockData ?? []).map((r: any) => ({ id: r.product_id, name: r.name, stock: r.total_stock }))

    const today = new Date()
    const in30 = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0]
    const validadeProxima = (products ?? [])
      .filter((p) => p.expiry_date && p.expiry_date <= in30)
      .map((p) => ({ id: p.id, name: p.name, expiry_date: p.expiry_date }))

    setData({
      vendasMes, investidoMes, lucroLiquido, fiadoPendente,
      vendasRevendedores, comodato, aReceber,
      stockBaixo, validadeProxima,
      encomendas: orders?.length ?? 0,
    })
    setLoading(false)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#1a3a2a]">Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Vendas do Mês" value={data!.vendasMes} icon={TrendingUp} />
        <StatCard title="Investido" value={data!.investidoMes} icon={ShoppingCart} />
        <StatCard title="Lucro Líquido" value={data!.lucroLiquido} icon={DollarSign} accent />
        <StatCard title="Fiado Pendente" value={data!.fiadoPendente} icon={CreditCard} />
        <StatCard title="Vendas Revendedores" value={data!.vendasRevendedores} icon={Store} />
        <StatCard title="Produtos Comodato" value={data!.comodato} isCurrency={false} icon={Package} />
        <StatCard title="A Receber (65%)" value={data!.aReceber} icon={DollarSign} accent />
      </div>

      {/* Alertas */}
      <div className="grid md:grid-cols-3 gap-4">
        {data!.encomendas > 0 && (
          <Card className="border-l-4 border-l-[#b8973a]">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-[#b8973a]" />
              <span className="font-medium text-sm">Encomendas Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-[#b8973a]">{data!.encomendas}</p>
          </Card>
        )}

        {data!.stockBaixo.length > 0 && (
          <Card className="border-l-4 border-l-red-500">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-red-500" />
              <span className="font-medium text-sm">Stock Baixo</span>
            </div>
            <ul className="space-y-1">
              {data!.stockBaixo.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate">{p.name}</span>
                  <Badge variant="red">{p.stock} un.</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data!.validadeProxima.length > 0 && (
          <Card className="border-l-4 border-l-yellow-500">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-yellow-500" />
              <span className="font-medium text-sm">Validade Próxima</span>
            </div>
            <ul className="space-y-1">
              {data!.validadeProxima.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate">{p.name}</span>
                  <Badge variant="yellow">{p.expiry_date}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
