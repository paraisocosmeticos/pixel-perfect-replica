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

export default function Compras() {
  const [purchases, setPurchases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<{ value: string; label: string }[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ product_id: '', quantity: 1, unit_price: 0, date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: p }, { data: prods }] = await Promise.all([
      supabase.from('purchases').select('*, products(name)').order('date', { ascending: false }).limit(50),
      supabase.from('products').select('id, name').order('name'),
    ])
    setPurchases(p ?? [])
    setProducts((prods ?? []).map((x: any) => ({ value: x.id, label: x.name })))
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.product_id) return
    setSaving(true)
    await supabase.from('purchases').insert(form)
    setSaving(false)
    setModalOpen(false)
    setForm({ product_id: '', quantity: 1, unit_price: 0, date: new Date().toISOString().split('T')[0] })
    fetchData()
    showToast('Compra registada!')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Compras</h2>
        <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Nova Compra</Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Qtd</th>
              <th className="px-4 py-3">Preço Unit.</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{formatDate(p.date)}</td>
                <td className="px-4 py-3 font-medium">{p.products?.name}</td>
                <td className="px-4 py-3">{p.quantity}</td>
                <td className="px-4 py-3">{formatCurrency(p.unit_price)}</td>
                <td className="px-4 py-3 font-medium">{formatCurrency(p.unit_price * p.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Compra">
        <div className="flex flex-col gap-4">
          <Select label="Produto" value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))} options={products} placeholder="Selecionar produto..." />
          <Input label="Quantidade" type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) }))} />
          <Input label="Preço Unitário (€)" type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm((f) => ({ ...f, unit_price: parseFloat(e.target.value) }))} />
          <Input label="Data" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'A guardar...' : 'Registar Compra'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
