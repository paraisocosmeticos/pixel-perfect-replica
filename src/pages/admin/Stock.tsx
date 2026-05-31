import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { Plus, Search } from 'lucide-react'

interface StockItem {
  product_id: string
  name: string
  code: string
  total_stock: number
  in_resellers: number
}

export default function Stock() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [products, setProducts] = useState<{ value: string; label: string }[]>([])
  const [form, setForm] = useState({ product_id: '', type: 'entrada', reason: '', quantity: 1, notes: '' })
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: sv }, { data: prods }] = await Promise.all([
      supabase.from('stock_view').select('*').order('name'),
      supabase.from('products').select('id, name, code').order('name'),
    ])
    setItems(sv ?? [])
    setProducts((prods ?? []).map((p: any) => ({ value: p.id, label: `${p.code} - ${p.name}` })))
    setLoading(false)
  }

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.code.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async () => {
    if (!form.product_id || !form.quantity) return
    setSaving(true)
    await supabase.from('stock_adjustments').insert({
      ...form,
      date: new Date().toISOString().split('T')[0],
    })
    setSaving(false)
    setModalOpen(false)
    fetchData()
    showToast('Ajuste de stock registado!')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Stock</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Ajuste de Stock
        </Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar produto..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a]"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Stock Total</th>
              <th className="px-4 py-3">Em Revendedores</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.product_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{item.code}</td>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{item.total_stock}</td>
                <td className="px-4 py-3 text-gray-500">{item.in_resellers}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.total_stock < 3 ? 'red' : item.total_stock < 10 ? 'yellow' : 'green'}>
                    {item.total_stock < 3 ? 'Baixo' : item.total_stock < 10 ? 'Médio' : 'OK'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Ajuste de Stock">
        <div className="flex flex-col gap-4">
          <Select
            label="Produto"
            value={form.product_id}
            onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
            options={products}
            placeholder="Selecionar produto..."
          />
          <Select
            label="Tipo"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            options={[{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }]}
          />
          <Input label="Quantidade" type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) }))} />
          <Input label="Motivo" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          <Input label="Notas" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'A guardar...' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
