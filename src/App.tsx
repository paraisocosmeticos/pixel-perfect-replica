import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { useAuth } from './hooks/useAuth'
import { LoadingSpinner } from './components/shared/LoadingSpinner'

function InnerApp() {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a3a2a]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }
  return <RouterProvider router={router} />
}

export default function App() {
  return <InnerApp />
}
