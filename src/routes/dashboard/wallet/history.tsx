import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/wallet/history')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>history</div>
}
