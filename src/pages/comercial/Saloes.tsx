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
import { daysSince, formatCurrency } from '../../lib/utils'
import { CheckCircle, ChevronLeft, Search, X } from 'lucide-react'

export default function ComercialSaloes() {
  const { profile } = useAuth()
  const [resellers, setResellers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [stockItems, setStockItems] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [saleForm, setSaleForm] = useState({ product_id: '', quantity: 1, sale_price: 0 })
  const [saleModal, setSaleModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stockSearch, setStockSearch] = useState('')
  const { showToast, ToastComponent } = useToast()

  useEffect(() => {
    if (profile) fetchResellers()
  }, [profile])

  const fetchResellers = async () => {
    const { data } = await supabase
      .from('resellers')
      .select('*')
      .eq('comercial_id', profile!.id)
      .eq('active', true)
      .order('salon_name')
    setResellers(data ?? [])
    setLoading(false)
  }

  const openDetail = async (r: any) => {
    setSelected(r)
    setStockSearch('')
    const [{ data: stock }, { data: hist }] = await Promise.all([
      supabase.from('reseller_stock').select('*, products(name)').eq('reseller_id', r.id).gt('quantity', 0),
      supabase.from('reseller_sales').select('*, products(name)').eq('reseller_id', r.id).order('date', { ascending: false }).limit(10),
    ])
    setStockItems(stock ?? [])
    setHistory(hist ?? [])
  }

  const registerVisit = async () => {
    await supabase.from('resellers').update({ last_visit_date: new Date().toISOString().split('T')[0] }).eq('id', selected.id)
    const updated = { ...selected, last_visit_date: new Date().toISOString().split('T')[0] }
    setSelected(updated)
    setResellers((prev) => prev.map((r) => r.id === selected.id ? updated : r))
    showToast('Visita registada!')
  }

  const handleSale = async () => {
    if (!saleForm.product_id) return
    setSaving(true)
    await supabase.from('reseller_sales').insert({
      reseller_id: selected.id,
      comercial_id: profile!.id,
      product_id: saleForm.product_id,
      quantity: saleForm.quantity,
      sale_price: saleForm.sale_price,
      date: new Date().toISOString().split('T')[0],
    })
    // Deduct from reseller stock
    const stockItem = stockItems.find((s) => s.product_id === saleForm.product_id)
    if (stockItem) {
      await supabase.from('reseller_stock')
        .update({ quantity: stockItem.quantity - saleForm.quantity })
        .eq('id', stockItem.id)
    }
    setSaving(false)
    setSaleModal(false)
    setSaleForm({ product_id: '', quantity: 1, sale_price: 0 })
    openDetail(selected)
    showToast('Venda registada!')
  }

  const visitColor = (date: string) => {
    if (!date) return 'red'
    const d = daysSince(date)
    if (d <= 10) return 'green'
    if (d <= 15) return 'yellow'
    return 'red'
  }

  if (loading) return <LoadingSpinner />

  if (selected) {
    return (
      <div className="space-y-4">
        {ToastComponent}
        <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} /> Voltar
        </button>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-[#1a3a2a]">{selected.salon_name}</h2>
            <p className="text-sm text-gray-500">{selected.contact_name}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={registerVisit}>
              <CheckCircle size={16} /> Registar Visita de Hoje
            </Button>
            <Button onClick={() => setSaleModal(true)}>
              Registar Venda
            </Button>
          </div>
        </div>

        {/* Stock */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#1a3a2a]">Stock no Salão</h3>
            {stockItems.length > 0 && (
              <span className="text-xs text-gray-400">
                {stockSearch
                  ? `${stockItems.filter(s => s.products?.name?.toLowerCase().includes(stockSearch.toLowerCase())).length} de ${stockItems.length} produtos`
                  : `${stockItems.length} produto${stockItems.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>

          {stockItems.length > 0 && (
            <div className="relative mb-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Pesquisar produto..."
                className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8973a] focus:border-transparent"
              />
              {stockSearch && (
                <button
                  onClick={() => setStockSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {stockItems.length === 0 ? (
            <p className="text-sm text-gray-400">Sem stock registado</p>
          ) : (() => {
            const stockFiltrado = stockItems.filter(s =>
              s.products?.name?.toLowerCase().includes(stockSearch.toLowerCase())
            )
            if (stockFiltrado.length === 0) {
              return (
                <p className="text-sm text-gray-400 py-2">
                  Nenhum produto encontrado para &ldquo;{stockSearch}&rdquo;
                </p>
              )
            }
            return (
              <ul className="space-y-2">
                {stockFiltrado.map((s) => (
                  <li key={s.id} className="flex justify-between text-sm">
                    <span>{s.products?.name}</span>
                    <Badge variant={s.quantity < 3 ? 'red' : 'green'}>{s.quantity} un.</Badge>
                  </li>
                ))}
              </ul>
            )
          })()}
        </Card>

        {/* History */}
        <Card>
          <h3 className="font-semibold text-[#1a3a2a] mb-3">Últimas Vendas</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">Sem vendas registadas</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{h.products?.name} × {h.quantity}</span>
                  <span className="font-medium">{formatCurrency(h.sale_price * h.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Modal open={saleModal} onClose={() => setSaleModal(false)} title="Registar Venda">
          <div className="flex flex-col gap-4">
            <Select
              label="Produto (em stock)"
              value={saleForm.product_id}
              onChange={(e) => {
                setSaleForm((f) => ({ ...f, product_id: e.target.value }))
              }}
              options={stockItems.map((s) => ({ value: s.product_id, label: `${s.products?.name} (${s.quantity} un.)` }))}
              placeholder="Selecionar produto..."
            />
            <Input label="Quantidade" type="number" min={1} value={saleForm.quantity} onChange={(e) => setSaleForm((f) => ({ ...f, quantity: parseInt(e.target.value) }))} />
            <Input label="Preço de Venda (€)" type="number" step="0.01" value={saleForm.sale_price} onChange={(e) => setSaleForm((f) => ({ ...f, sale_price: parseFloat(e.target.value) }))} />
            {saleForm.sale_price > 0 && saleForm.quantity > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                <p>Salão (25%): <strong>{formatCurrency(saleForm.sale_price * saleForm.quantity * 0.25)}</strong></p>
                <p>Comissão (10%): <strong>{formatCurrency(saleForm.sale_price * saleForm.quantity * 0.1)}</strong></p>
                <p>Admin (65%): <strong>{formatCurrency(saleForm.sale_price * saleForm.quantity * 0.65)}</strong></p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setSaleModal(false)}>Cancelar</Button>
              <Button onClick={handleSale} disabled={saving}>{saving ? 'A guardar...' : 'Registar'}</Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {ToastComponent}
      <h2 className="text-xl font-bold text-[#1a3a2a]">Os Meus Salões</h2>
      <div className="space-y-3">
        {resellers.map((r) => (
          <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(r)}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#1a3a2a]">{r.salon_name}</p>
                <p className="text-xs text-gray-500">{r.contact_name}</p>
              </div>
              <Badge variant={visitColor(r.last_visit_date) as any}>
                {r.last_visit_date ? `há ${daysSince(r.last_visit_date)}d` : 'Nunca visitado'}
              </Badge>
            </div>
          </Card>
        ))}
        {resellers.length === 0 && (
          <p className="text-center text-gray-400 py-8">Nenhum salão atribuído</p>
        )}
      </div>
    </div>
  )
}
