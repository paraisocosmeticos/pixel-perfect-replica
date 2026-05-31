import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { Plus } from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'

const PAYMENT_METHODS = ['dinheiro', 'transferência', 'mbway', 'multibanco', 'fiado']

export default function Vendas() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<{ value: string; label: string; catalog_price: number; cost_price: number }[]>([])
  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ product_id: '', customer_id: '', quantity: 1, sale_price: 0, payment_method: 'dinheiro', date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: s }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('sales').select('*, products(name), customers(name)').order('date', { ascending: false }).limit(50),
      supabase.from('products').select('id, name, catalog_price, cost_price').order('name'),
      supabase.from('customers').select('id, name').order('name'),
    ])
    setSales(s ?? [])
    setProducts((p ?? []).map((x: any) => ({ value: x.id, label: x.name, catalog_price: x.catalog_price, cost_price: x.cost_price })))
    setCustomers((c ?? []).map((x: any) => ({ value: x.id, label: x.name })))
    setLoading(false)
  }

  const selectedProduct = products.find((p) => p.value === form.product_id)

  const handleProductChange = (id: string) => {
    const p = products.find((x) => x.value === id)
    setForm((f) => ({ ...f, product_id: id, sale_price: p?.catalog_price ?? 0 }))
  }

  const handleSave = async () => {
    if (!form.product_id) return
    setSaving(true)
    const profit = (form.sale_price - (selectedProduct?.cost_price ?? 0)) * form.quantity
    await supabase.from('sales').insert({ ...form, profit })
    setSaving(false)
    setModalOpen(false)
    setForm({ product_id: '', customer_id: '', quantity: 1, sale_price: 0, payment_method: 'dinheiro', date: new Date().toISOString().split('T')[0] })
    fetchData()
    showToast('Venda registada!')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Vendas</h2>
        <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Nova Venda</Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Qtd</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Lucro</th>
              <th className="px-4 py-3">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{formatDate(s.date)}</td>
                <td className="px-4 py-3 font-medium">{s.products?.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.customers?.name ?? '-'}</td>
                <td className="px-4 py-3">{s.quantity}</td>
                <td className="px-4 py-3">{formatCurrency(s.sale_price * s.quantity)}</td>
                <td className="px-4 py-3 text-green-600">{formatCurrency(s.profit)}</td>
                <td className="px-4 py-3 capitalize text-gray-500">{s.payment_method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Venda">
        <div className="flex flex-col gap-4">
          <Select label="Produto" value={form.product_id} onChange={(e) => handleProductChange(e.target.value)} options={products} placeholder="Selecionar produto..." />
          <Select label="Cliente" value={form.customer_id} onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))} options={customers} placeholder="Selecionar cliente (opcional)" />
          <Input label="Quantidade" type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) }))} />
          <Input label="Preço de Venda (€)" type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm((f) => ({ ...f, sale_price: parseFloat(e.target.value) }))} />
          <Select label="Método de Pagamento" value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
          <Input label="Data" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'A guardar...' : 'Registar Venda'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
