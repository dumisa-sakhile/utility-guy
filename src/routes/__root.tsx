import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="inter-light">
    
      <Outlet />
      
    </div>
  ),
})
