import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { formatCurrency, daysSince, currentMonthRange } from '../../lib/utils'
import { AlertTriangle, CheckCircle } from 'lucide-react'

export default function ComercialHome() {
  const { profile } = useAuth()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { showToast, ToastComponent } = useToast()
  const { start, end } = currentMonthRange()

  useEffect(() => {
    if (profile) fetchData()
  }, [profile])

  const fetchData = async () => {
    const [{ data: resSales }, { data: dirSales }, { data: myResellers }] = await Promise.all([
      supabase.from('reseller_sales').select('sale_price, quantity').eq('comercial_id', profile!.id).gte('date', start).lte('date', end),
      supabase.from('comercial_direct_sales').select('commission_25').eq('comercial_id', profile!.id).gte('date', start).lte('date', end),
      supabase.from('resellers').select('*, reseller_stock(product_id, quantity)').eq('comercial_id', profile!.id),
    ])

    const fromRes = (resSales ?? []).reduce((s: number, r: any) => s + r.sale_price * r.quantity * 0.1, 0)
    const fromDirect = (dirSales ?? []).reduce((s: number, r: any) => s + r.commission_25, 0)

    const atrasados = (myResellers ?? []).filter((r: any) => r.last_visit_date && daysSince(r.last_visit_date) > 15)
    const stockBaixo = (myResellers ?? []).filter((r: any) => {
      const total = (r.reseller_stock ?? []).reduce((s: number, x: any) => s + x.quantity, 0)
      return total < 5
    })

    setData({ fromRes, fromDirect, total: fromRes + fromDirect, atrasados, stockBaixo })
    setLoading(false)
  }

  const registerVisit = async (resellerId: string) => {
    await supabase.from('resellers').update({ last_visit_date: new Date().toISOString().split('T')[0] }).eq('id', resellerId)
    fetchData()
    showToast('Visita registada!')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {ToastComponent}
      <h2 className="text-xl font-bold text-[#1a3a2a]">Olá, {profile?.name?.split(' ')[0]}!</h2>

      {/* Earnings Card */}
      <Card className="bg-[#1a3a2a] text-white">
        <p className="text-white/60 text-sm mb-2">Ganhos do Mês</p>
        <p className="text-3xl font-bold text-[#b8973a]">{formatCurrency(data.total)}</p>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-white/70">Salões: <span className="text-white">{formatCurrency(data.fromRes)}</span></span>
          <span className="text-white/70">Diretas: <span className="text-white">{formatCurrency(data.fromDirect)}</span></span>
        </div>
      </Card>

      {/* Late visits */}
      {data.atrasados.length > 0 && (
        <div>
          <h3 className="font-semibold text-red-600 flex items-center gap-2 mb-3">
            <AlertTriangle size={16} /> Salões em atraso ({data.atrasados.length})
          </h3>
          <div className="space-y-2">
            {data.atrasados.map((r: any) => (
              <Card key={r.id} className="border-l-4 border-l-red-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{r.salon_name}</p>
                    <p className="text-xs text-red-500">há {daysSince(r.last_visit_date)} dias sem visita</p>
                  </div>
                  <Button size="sm" onClick={() => registerVisit(r.id)}>
                    <CheckCircle size={14} /> Registar visita
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Low stock */}
      {data.stockBaixo.length > 0 && (
        <div>
          <h3 className="font-semibold text-yellow-600 flex items-center gap-2 mb-3">
            <AlertTriangle size={16} /> Stock baixo
          </h3>
          <div className="space-y-2">
            {data.stockBaixo.map((r: any) => (
              <Card key={r.id} className="border-l-4 border-l-yellow-400">
                <p className="font-medium">{r.salon_name}</p>
                <p className="text-xs text-yellow-600">Stock reduzido</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
