import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { formatCurrency, formatDate } from '../../lib/utils'
import { Plus } from 'lucide-react'

export default function ComercialVendas() {
  const { profile } = useAuth()
  const [products, setProducts] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ product_id: '', quantity: 1, sale_price: 0, customer_name: '', date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { if (profile) fetchData() }, [profile])

  const fetchData = async () => {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('products').select('id, name, catalog_price').order('name'),
      supabase.from('comercial_direct_sales').select('*, products(name)').eq('comercial_id', profile!.id).order('date', { ascending: false }).limit(30),
    ])
    setProducts(p ?? [])
    setSales(s ?? [])
    setLoading(false)
  }

  const handleProductChange = (id: string) => {
    const p = products.find((x) => x.id === id)
    setForm((f) => ({ ...f, product_id: id, sale_price: p?.catalog_price ?? 0 }))
  }

  const handleSave = async () => {
    if (!form.product_id) return
    setSaving(true)
    const commission_25 = form.sale_price * form.quantity * 0.25
    await supabase.from('comercial_direct_sales').insert({
      ...form,
      comercial_id: profile!.id,
      commission_25,
    })
    setSaving(false)
    setShowForm(false)
    setForm({ product_id: '', quantity: 1, sale_price: 0, customer_name: '', date: new Date().toISOString().split('T')[0] })
    fetchData()
    showToast('Venda directa registada!')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-[#1a3a2a]">Vendas Directas</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Nova Venda
        </Button>
      </div>

      {showForm && (
        <Card>
          <div className="flex flex-col gap-4">
            <Select
              label="Produto"
              value={form.product_id}
              onChange={(e) => handleProductChange(e.target.value)}
              options={products.map((p) => ({ value: p.id, label: `${p.name} (${formatCurrency(p.catalog_price)})` }))}
              placeholder="Selecionar produto..."
            />
            <Input label="Quantidade" type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) }))} />
            <Input label="Preço de Venda (€)" type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm((f) => ({ ...f, sale_price: parseFloat(e.target.value) }))} />
            <Input label="Nome do Cliente (opcional)" value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
            <Input label="Data" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            {form.sale_price > 0 && (
              <div className="bg-[#b8973a]/10 rounded-lg p-3 text-sm">
                <p className="font-medium text-[#b8973a]">
                  Comissão (25%): {formatCurrency(form.sale_price * form.quantity * 0.25)}
                </p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'A guardar...' : 'Registar Venda'}</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Comissão (25%)</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{formatDate(s.date)}</td>
                <td className="px-4 py-3 font-medium">{s.products?.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.customer_name || '-'}</td>
                <td className="px-4 py-3">{formatCurrency(s.sale_price * s.quantity)}</td>
                <td className="px-4 py-3 font-medium text-[#b8973a]">{formatCurrency(s.commission_25)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
