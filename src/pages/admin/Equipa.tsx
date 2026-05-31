import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { Plus, Store, UserX } from 'lucide-react'
import { formatCurrency, currentMonthRange } from '../../lib/utils'
import type { Profile, Reseller } from '../../types'

export default function Equipa() {
  const [comerciais, setComerciais] = useState<Profile[]>([])
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [earnings, setEarnings] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saloesModal, setSaloesModal] = useState<Profile | null>(null)
  const [form, setForm] = useState({ name: '', username: '', password: '', zone: '' })
  const [saving, setSaving] = useState(false)
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const { showToast, ToastComponent } = useToast()
  const { start, end } = currentMonthRange()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: profs }, { data: res }, { data: resSales }, { data: dirSales }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'comercial').eq('active', true),
      supabase.from('resellers').select('*'),
      supabase.from('reseller_sales').select('sale_price, quantity, comercial_id').gte('date', start).lte('date', end),
      supabase.from('comercial_direct_sales').select('commission_25, comercial_id').gte('date', start).lte('date', end),
    ])

    setComerciais(profs ?? [])
    setResellers(res ?? [])

    // Calculate earnings per comercial
    const e: Record<string, number> = {}
    ;(profs ?? []).forEach((p: Profile) => {
      const fromRes = (resSales ?? [])
        .filter((s: any) => s.comercial_id === p.id)
        .reduce((sum: number, s: any) => sum + s.sale_price * s.quantity * 0.1, 0)
      const fromDirect = (dirSales ?? [])
        .filter((s: any) => s.comercial_id === p.id)
        .reduce((sum: number, s: any) => sum + s.commission_25, 0)
      e[p.id] = fromRes + fromDirect
    })
    setEarnings(e)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!form.name || !form.username || !form.password) return
    setSaving(true)
    const email = `${form.username.replace(/\s/g, '')}@boticario.internal`

    const { data: authData, error } = await supabase.auth.admin.createUser({
      email,
      password: form.password,
      email_confirm: true,
    })

    if (error || !authData.user) {
      showToast('Erro ao criar utilizador: ' + (error?.message ?? ''), 'error')
      setSaving(false)
      return
    }

    await supabase.from('profiles').insert({
      id: authData.user.id,
      role: 'comercial',
      name: form.name,
      zone: form.zone,
      commission_direct: 25,
      commission_reseller: 10,
      active: true,
    })

    setSaving(false)
    setModalOpen(false)
    setForm({ name: '', username: '', password: '', zone: '' })
    fetchData()
    showToast(`Comercial criada! Email: ${email} | Senha: ${form.password}`)
  }

  const openSaloes = (comercial: Profile) => {
    const ids = resellers.filter((r) => r.comercial_id === comercial.id).map((r) => r.id)
    setAssignedIds(new Set(ids))
    setSaloesModal(comercial)
  }

  const toggleSalon = (id: string) => {
    setAssignedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveSaloes = async () => {
    if (!saloesModal) return
    setSaving(true)
    // Remove all assignments for this comercial
    await supabase.from('resellers').update({ comercial_id: null }).eq('comercial_id', saloesModal.id)
    // Assign selected
    if (assignedIds.size > 0) {
      await supabase.from('resellers').update({ comercial_id: saloesModal.id }).in('id', [...assignedIds])
    }
    setSaving(false)
    setSaloesModal(null)
    fetchData()
    showToast('Salões actualizados!')
  }

  const deactivate = async (id: string) => {
    if (!confirm('Desactivar esta comercial?')) return
    await supabase.from('profiles').update({ active: false }).eq('id', id)
    fetchData()
    showToast('Comercial desactivada.', 'error')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Equipa</h2>
        <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Nova Comercial</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {comerciais.map((c) => {
          const nSaloes = resellers.filter((r) => r.comercial_id === c.id).length
          return (
            <Card key={c.id}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-[#1a3a2a]">{c.name}</h3>
                  <p className="text-xs text-gray-500">{c.zone || 'Sem zona'}</p>
                </div>
                <Badge variant="green">Activa</Badge>
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="text-gray-500">{nSaloes} salão{nSaloes !== 1 ? 'ões' : ''}</span>
                <span className="font-medium text-[#b8973a]">{formatCurrency(earnings[c.id] ?? 0)}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => openSaloes(c)}>
                  <Store size={14} /> Salões
                </Button>
                <Button size="sm" variant="danger" onClick={() => deactivate(c.id)}>
                  <UserX size={14} /> Desactivar
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Comercial">
        <div className="flex flex-col gap-4">
          <Input label="Nome Completo" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Username (sem espaços)" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.replace(/\s/g, '') }))} placeholder="ex: maria.silva" />
          <Input label="Senha (mínimo 6 caracteres)" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <Input label="Zona" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
            Login: <code>{form.username || 'username'}@boticario.internal</code>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || form.password.length < 6}>{saving ? 'A criar...' : 'Criar Comercial'}</Button>
          </div>
        </div>
      </Modal>

      {/* Salões Modal */}
      <Modal open={!!saloesModal} onClose={() => setSaloesModal(null)} title={`Salões de ${saloesModal?.name}`}>
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-4">
          {resellers.map((r) => (
            <label key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={assignedIds.has(r.id)}
                onChange={() => toggleSalon(r.id)}
                className="accent-[#1a3a2a]"
              />
              <span className="text-sm">{r.salon_name}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setSaloesModal(null)}>Cancelar</Button>
          <Button onClick={saveSaloes} disabled={saving}>{saving ? 'A guardar...' : 'Guardar'}</Button>
        </div>
      </Modal>
    </div>
  )
}
