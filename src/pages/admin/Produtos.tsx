import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'
import { Plus, Upload, Edit2, Trash2, Search } from 'lucide-react'
import type { Product } from '../../types'
import { formatCurrency } from '../../lib/utils'

const CATEGORIES = ['perfumaria', 'maquiagem', 'cuidados', 'cabelo', 'outros']

const emptyProduct = (): Partial<Product> => ({
  name: '', code: '', category: 'perfumaria', catalog_price: 0,
  cost_price: 0, expiry_date: '', cycle: ''
})

export default function Produtos() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data ?? [])
    setLoading(false)
  }

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
    const matchCat = !category || p.category === category
    return matchSearch && matchCat
  })

  const openCreate = () => { setEditing(emptyProduct()); setModalOpen(true) }
  const openEdit = (p: Product) => { setEditing({ ...p }); setModalOpen(true) }

  const handleSave = async () => {
    if (!editing?.name) return
    setSaving(true)
    if (editing.id) {
      await supabase.from('products').update(editing).eq('id', editing.id)
    } else {
      await supabase.from('products').insert(editing)
    }
    setSaving(false)
    setModalOpen(false)
    setEditing(null)
    fetchProducts()
    showToast(editing.id ? 'Produto actualizado!' : 'Produto criado!')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar produto?')) return
    await supabase.from('products').delete().eq('id', id)
    fetchProducts()
    showToast('Produto eliminado!', 'error')
  }

  const handleImport = async () => {
    const lines = importText.trim().split('\n').filter(Boolean)
    if (!lines.length) return
    setImporting(true)

    const toInsert = lines.map((line) => {
      const idx = line.indexOf(' - ')
      const code = idx >= 0 ? line.substring(0, idx).trim() : ''
      const name = idx >= 0 ? line.substring(idx + 3).trim() : line.trim()
      return { code, name, category: 'perfumaria', catalog_price: 0, cost_price: 0, expiry_date: null, cycle: '' }
    })

    const { error } = await supabase.from('products').insert(toInsert)
    setImporting(false)
    if (error) {
      showToast('Erro na importação: ' + error.message, 'error')
    } else {
      showToast(`${toInsert.length} produtos importados com sucesso!`)
      setImportOpen(false)
      setImportText('')
      fetchProducts()
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {ToastComponent}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-[#1a3a2a]">Produtos</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Importar Catálogo
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} /> Novo Produto
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar produto ou código..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a]"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] bg-white"
        >
          <option value="">Todas categorias</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">P. Catálogo</th>
              <th className="px-4 py-3">P. Custo</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3"><Badge>{p.category}</Badge></td>
                <td className="px-4 py-3">{formatCurrency(p.catalog_price)}</td>
                <td className="px-4 py-3">{formatCurrency(p.cost_price)}</td>
                <td className="px-4 py-3 text-gray-500">{p.expiry_date || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-[#1a3a2a]">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhum produto encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing?.id ? 'Editar Produto' : 'Novo Produto'}>
        <div className="flex flex-col gap-4">
          <Input label="Nome" value={editing?.name ?? ''} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Código" value={editing?.code ?? ''} onChange={(e) => setEditing((p) => ({ ...p, code: e.target.value }))} />
          <Select
            label="Categoria"
            value={editing?.category ?? 'perfumaria'}
            onChange={(e) => setEditing((p) => ({ ...p, category: e.target.value }))}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
          <Input label="Preço Catálogo (€)" type="number" step="0.01" value={editing?.catalog_price ?? 0} onChange={(e) => setEditing((p) => ({ ...p, catalog_price: parseFloat(e.target.value) }))} />
          <Input label="Preço Custo (€)" type="number" step="0.01" value={editing?.cost_price ?? 0} onChange={(e) => setEditing((p) => ({ ...p, cost_price: parseFloat(e.target.value) }))} />
          <Input label="Validade" type="date" value={editing?.expiry_date ?? ''} onChange={(e) => setEditing((p) => ({ ...p, expiry_date: e.target.value }))} />
          <Input label="Ciclo" value={editing?.cycle ?? ''} onChange={(e) => setEditing((p) => ({ ...p, cycle: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'A guardar...' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importar do Catálogo">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Cole os produtos no formato: <code className="bg-gray-100 px-1 rounded">CÓDIGO - NOME</code>, um por linha.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'62541 - Creme Acetinado Lily 250g\n77524 - Lily Eau de Parfum\n47950 - Zaad Eau de Parfum'}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importing || !importText.trim()}>
              {importing ? 'A importar...' : 'Importar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
