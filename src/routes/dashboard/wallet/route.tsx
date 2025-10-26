import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/wallet')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div><Outlet /></div>
}
