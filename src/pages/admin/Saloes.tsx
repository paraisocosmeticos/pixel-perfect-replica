import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { Plus, Edit2, Search } from 'lucide-react'
import { daysSince } from '../../lib/utils'
import type { Reseller } from '../../types'

const empty = (): Partial<Reseller> => ({
  salon_name: '', contact_name: '', address: '', phone: '',
  commission_rate: 25, active: true,
})

export default function Saloes() {
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Reseller> | null>(null)
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data } = await supabase.from('resellers').select('*').order('salon_name')
    setResellers(data ?? [])
    setLoading(false)
  }

  const filtered = resellers.filter((r) =>
    r.salon_name.toLowerCase().includes(search.toLowerCase()) ||
    r.contact_name.toLowerCase().includes(search.toLowerCase())
  )

  const openEdit = (r: Reseller) => { setEditing({ ...r }); setModalOpen(true) }
  const openCreate = () => { setEditing(empty()); setModalOpen(true) }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    if (editing.id) {
      await supabase.from('resellers').update(editing).eq('id', editing.id)
    } else {
      await supabase.from('resellers').insert(editing)
    }
    setSaving(false)
    setModalOpen(false)
    fetchData()
    showToast(editing?.id ? 'Salão actualizado!' : 'Salão criado!')
  }

  const visitColor = (date: string) => {
    const d = daysSince(date)
    if (d <= 10) return 'green'
    if (d <= 15) return 'yellow'
    return 'red'
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Salões</h2>
        <Button onClick={openCreate}><Plus size={16} /> Novo Salão</Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar salão..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a]"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Salão</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Última Visita</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{r.salon_name}</td>
                <td className="px-4 py-3 text-gray-600">{r.contact_name}</td>
                <td className="px-4 py-3 text-gray-600">{r.phone}</td>
                <td className="px-4 py-3">
                  {r.last_visit_date ? (
                    <Badge variant={visitColor(r.last_visit_date) as any}>
                      há {daysSince(r.last_visit_date)}d
                    </Badge>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={r.active ? 'green' : 'gray'}>{r.active ? 'Activo' : 'Inactivo'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-[#1a3a2a]">
                    <Edit2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing?.id ? 'Editar Salão' : 'Novo Salão'}>
        <div className="flex flex-col gap-4">
          <Input label="Nome do Salão" value={editing?.salon_name ?? ''} onChange={(e) => setEditing((p) => ({ ...p, salon_name: e.target.value }))} />
          <Input label="Nome do Contacto" value={editing?.contact_name ?? ''} onChange={(e) => setEditing((p) => ({ ...p, contact_name: e.target.value }))} />
          <Input label="Morada" value={editing?.address ?? ''} onChange={(e) => setEditing((p) => ({ ...p, address: e.target.value }))} />
          <Input label="Telefone" value={editing?.phone ?? ''} onChange={(e) => setEditing((p) => ({ ...p, phone: e.target.value }))} />
          <Input label="Comissão (%)" type="number" value={editing?.commission_rate ?? 25} onChange={(e) => setEditing((p) => ({ ...p, commission_rate: parseFloat(e.target.value) }))} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'A guardar...' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
