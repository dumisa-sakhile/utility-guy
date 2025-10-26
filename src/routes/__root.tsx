import { useEffect } from 'react'
import { Outlet, createRootRoute, useNavigate } from '@tanstack/react-router'
import { auth } from '../config/firebase'

export const Route = createRootRoute({
  component: () => {
    const navigate = useNavigate()

    useEffect(() => {
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      // If already on the dashboard, don't redirect
      if (path.startsWith('/dashboard')) return

      const current = auth.currentUser
      if (current) {
        navigate({ to: '/dashboard' })
        return
      }

      const unsub = auth.onAuthStateChanged((u) => {
        if (u) navigate({ to: '/dashboard' })
      })

      return () => unsub()
    }, [navigate])

    return (
      <div className="inter-light">
        <Outlet />
      </div>
    )
  },
})
