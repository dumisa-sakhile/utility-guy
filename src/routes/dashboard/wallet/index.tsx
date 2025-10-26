import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/wallet/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>wallet</div>
}
