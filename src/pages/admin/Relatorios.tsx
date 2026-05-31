import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { StatCard } from '../../components/shared/StatCard'
import { TrendingUp, ShoppingCart, DollarSign, Store } from 'lucide-react'

export default function Relatorios() {
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [period])

  const getRange = () => {
    const now = new Date()
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
    }
    const start = new Date(now.getFullYear(), 0, 1)
    const end = new Date(now.getFullYear(), 11, 31)
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
  }

  const fetchData = async () => {
    setLoading(true)
    const { start, end } = getRange()
    const [{ data: sales }, { data: purchases }, { data: resSales }] = await Promise.all([
      supabase.from('sales').select('sale_price, quantity, profit, date').gte('date', start).lte('date', end),
      supabase.from('purchases').select('unit_price, quantity').gte('date', start).lte('date', end),
      supabase.from('reseller_sales').select('sale_price, quantity, comercial_id, date').gte('date', start).lte('date', end),
    ])

    const totalVendas = (sales ?? []).reduce((s: number, r: any) => s + r.sale_price * r.quantity, 0)
    const totalInvestido = (purchases ?? []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0)
    const totalLucro = (sales ?? []).reduce((s: number, r: any) => s + r.profit, 0)
    const totalResSales = (resSales ?? []).reduce((s: number, r: any) => s + r.sale_price * r.quantity, 0)

    setData({ totalVendas, totalInvestido, totalLucro, totalResSales })
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Relatórios</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] bg-white"
        >
          <option value="month">Este Mês</option>
          <option value="year">Este Ano</option>
        </select>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Vendas Totais" value={data.totalVendas} icon={TrendingUp} />
          <StatCard title="Investimento" value={data.totalInvestido} icon={ShoppingCart} />
          <StatCard title="Lucro Líquido" value={data.totalLucro} icon={DollarSign} accent />
          <StatCard title="Vendas Revendedores" value={data.totalResSales} icon={Store} />
        </div>
      )}
    </div>
  )
}
