import { createFileRoute, Outlet } from '@tanstack/react-router'


export const Route = createFileRoute('/dashboard/utilities')({
  component: UtilitiesLayout,
})

function UtilitiesLayout() {
  
  
  return (
    <div className="space-y-6">
      
      {/* Page Content */}
      <Outlet />
    </div>
  )
}