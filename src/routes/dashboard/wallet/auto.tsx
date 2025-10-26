import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/wallet/auto')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>auto</div>
}
