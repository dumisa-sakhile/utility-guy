// src/routes/dashboard/settings/route.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/settings')({
  component: SettingsLayout,
})

function SettingsLayout() {

  return (
    <div className='md:pl-10'>
       <Outlet/>
   </div>
  )
}