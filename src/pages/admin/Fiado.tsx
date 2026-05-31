import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge } from '../../components/ui/Badge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { formatCurrency, formatDate } from '../../lib/utils'
import { CheckCircle } from 'lucide-react'

export default function Fiado() {
  const [credits, setCredits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data } = await supabase
      .from('credit_sales')
      .select('*, sales(date, sale_price, quantity, customers(name), products(name))')
      .order('due_date')
    setCredits(data ?? [])
    setLoading(false)
  }

  const markPaid = async (id: string) => {
    await supabase.from('credit_sales').update({ status: 'pago' }).eq('id', id)
    fetchData()
    showToast('Fiado marcado como pago!')
  }

  const total = credits.filter((c) => c.status === 'pendente').reduce((s, c) => s + c.amount, 0)

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Fiado</h2>
        <div className="bg-white rounded-xl px-4 py-2 border border-gray-100 shadow-sm">
          <span className="text-sm text-gray-500">Total Pendente:</span>
          <span className="ml-2 font-bold text-red-600">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {credits.map((c) => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.sales?.customers?.name ?? '-'}</td>
                <td className="px-4 py-3 text-gray-600">{c.sales?.products?.name ?? '-'}</td>
                <td className="px-4 py-3 font-medium text-red-600">{formatCurrency(c.amount)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(c.due_date)}</td>
                <td className="px-4 py-3">
                  <Badge variant={c.status === 'pago' ? 'green' : 'red'}>
                    {c.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {c.status === 'pendente' && (
                    <button onClick={() => markPaid(c.id)} className="text-gray-400 hover:text-green-600 flex items-center gap-1 text-xs">
                      <CheckCircle size={15} /> Marcar pago
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
