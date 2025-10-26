import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/settings/account')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>account settings</div>
}
