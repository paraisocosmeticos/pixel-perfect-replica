import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { Plus, Edit2, Search } from 'lucide-react'
import type { Customer } from '../../types'

const empty = (): Partial<Customer> => ({ name: '', phone: '', email: '' })

export default function Clientes() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Customer> | null>(null)
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers(data ?? [])
    setLoading(false)
  }

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    if (editing.id) {
      await supabase.from('customers').update(editing).eq('id', editing.id)
    } else {
      await supabase.from('customers').insert(editing)
    }
    setSaving(false)
    setModalOpen(false)
    fetchData()
    showToast(editing?.id ? 'Cliente actualizado!' : 'Cliente criado!')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Clientes</h2>
        <Button onClick={() => { setEditing(empty()); setModalOpen(true) }}><Plus size={16} /> Novo Cliente</Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar cliente..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a]" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.phone || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{c.email || '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => { setEditing({ ...c }); setModalOpen(true) }} className="text-gray-400 hover:text-[#1a3a2a]">
                    <Edit2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing?.id ? 'Editar Cliente' : 'Novo Cliente'}>
        <div className="flex flex-col gap-4">
          <Input label="Nome" value={editing?.name ?? ''} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Telefone" value={editing?.phone ?? ''} onChange={(e) => setEditing((p) => ({ ...p, phone: e.target.value }))} />
          <Input label="Email" type="email" value={editing?.email ?? ''} onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'A guardar...' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
