import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'

export default function Config() {
  const { profile } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const { showToast, ToastComponent } = useToast()

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) showToast('Erro: ' + error.message, 'error')
    else { showToast('Senha actualizada!'); setNewPassword('') }
  }

  return (
    <div className="space-y-6">
      {ToastComponent}
      <h2 className="text-2xl font-bold text-[#1a3a2a]">Configurações</h2>

      <Card className="max-w-md">
        <h3 className="font-semibold text-[#1a3a2a] mb-4">Alterar Senha</h3>
        <div className="flex flex-col gap-4">
          <Input
            label="Nova Senha"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
          <Button onClick={handlePasswordChange} disabled={saving || newPassword.length < 6}>
            {saving ? 'A guardar...' : 'Actualizar Senha'}
          </Button>
        </div>
      </Card>

      <Card className="max-w-md">
        <h3 className="font-semibold text-[#1a3a2a] mb-2">Informações da Conta</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p><span className="font-medium">Nome:</span> {profile?.name}</p>
          <p><span className="font-medium">Função:</span> {profile?.role}</p>
          <p><span className="font-medium">Zona:</span> {profile?.zone || '-'}</p>
        </div>
      </Card>
    </div>
  )
}
