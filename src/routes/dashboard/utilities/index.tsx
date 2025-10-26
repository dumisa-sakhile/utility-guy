import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/utilities/')({
  component: ElectricityPage,
})

function ElectricityPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Electricity Management</h1>
      {/* Single electricity meter content */}
    </div>
  )
}