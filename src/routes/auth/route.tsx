import { createFileRoute, Outlet, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import logo from '../../logo.svg'

export const Route = createFileRoute('/auth')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="min-h-screen bg-background">
      <header className="w-full py-4 px-4 sm:px-6 lg:px-8 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/" className="flex items-center gap-2 text-sm text-black/70">
              <ArrowLeft size={18} />
              <span>Back to home</span>
            </Link>
          </div>

          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Utility Guy" className="h-9 w-9 rounded-md" />
            <div className="font-semibold text-black">Utility Guy</div>
          </Link>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
