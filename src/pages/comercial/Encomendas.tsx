import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { formatDate } from '../../lib/utils'
import { Plus } from 'lucide-react'

const STATUS_COLOR: Record<string, 'yellow' | 'green' | 'red'> = {
  pendente: 'yellow',
  aprovado: 'green',
  rejeitado: 'red',
}

export default function ComercialEncomendas() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [resellers, setResellers] = useState<{ value: string; label: string }[]>([])
  const [products, setProducts] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ reseller_id: '', product_id: '', quantity: 1, notes: '' })
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { if (profile) fetchData() }, [profile])

  const fetchData = async () => {
    const [{ data: o }, { data: r }, { data: p }] = await Promise.all([
      supabase.from('orders').select('*, resellers(salon_name), products(name)').eq('comercial_id', profile!.id).order('created_at', { ascending: false }),
      supabase.from('resellers').select('id, salon_name').eq('comercial_id', profile!.id),
      supabase.from('products').select('id, name').order('name'),
    ])
    setOrders(o ?? [])
    setResellers((r ?? []).map((x: any) => ({ value: x.id, label: x.salon_name })))
    setProducts((p ?? []).map((x: any) => ({ value: x.id, label: x.name })))
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.reseller_id || !form.product_id) return
    setSaving(true)
    await supabase.from('orders').insert({
      ...form,
      comercial_id: profile!.id,
      status: 'pendente',
    })
    setSaving(false)
    setModalOpen(false)
    setForm({ reseller_id: '', product_id: '', quantity: 1, notes: '' })
    fetchData()
    showToast('Encomenda submetida!')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-[#1a3a2a]">Encomendas</h2>
        <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Nova Encomenda</Button>
      </div>

      <div className="space-y-3">
        {orders.map((o) => (
          <Card key={o.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{o.products?.name}</p>
                <p className="text-xs text-gray-500">{o.resellers?.salon_name} · {o.quantity} un. · {formatDate(o.created_at)}</p>
                {o.notes && <p className="text-xs text-gray-400 mt-1">{o.notes}</p>}
              </div>
              <Badge variant={STATUS_COLOR[o.status]}>{o.status}</Badge>
            </div>
          </Card>
        ))}
        {orders.length === 0 && (
          <p className="text-center text-gray-400 py-8">Nenhuma encomenda</p>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Encomenda">
        <div className="flex flex-col gap-4">
          <Select label="Salão" value={form.reseller_id} onChange={(e) => setForm((f) => ({ ...f, reseller_id: e.target.value }))} options={resellers} placeholder="Selecionar salão..." />
          <Select label="Produto" value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))} options={products} placeholder="Selecionar produto..." />
          <Input label="Quantidade" type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) }))} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] resize-none"
              placeholder="Observações (opcional)"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'A submeter...' : 'Submeter Encomenda'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
