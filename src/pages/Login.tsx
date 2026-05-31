import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export default function Login() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error: err } = await signIn(username, password)
    if (err) {
      setError('Credenciais inválidas. Tente novamente.')
    }
    setSubmitting(false)
  }

  // Redirect after login handled by App.tsx via profile
  return (
    <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#b8973a]">Secrets VIP</h1>
          <p className="text-white/60 mt-1 text-sm">O Boticário</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-[#1a3a2a] mb-6">Entrar</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Username ou Email"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username ou email"
              required
              autoComplete="username"
            />
            <Input
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full mt-2" size="lg">
              {submitting ? 'A entrar...' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
