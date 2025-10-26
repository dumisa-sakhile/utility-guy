import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/chatbot/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Chatbot page - Khaya</div>
}
