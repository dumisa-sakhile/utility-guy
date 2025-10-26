import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/utilities/water')({
  component: WaterPage,
})

function WaterPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Water Management</h1>
      {/* Single water meter content */}
    </div>
  )
}