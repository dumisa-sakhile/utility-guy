import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/water')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>water</div>
}
