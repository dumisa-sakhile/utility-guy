import { useEffect, useState } from 'react'
import { createFileRoute, Outlet, Link, useNavigate } from '@tanstack/react-router'
import { 
  LogOut, 
  Zap, 
  Droplet, 
  CreditCard, 
  RefreshCw, 
  Wallet, 
  Settings, 
  Shield, 
  Battery, 
  User,
  LayoutDashboard,
  Menu,
  ChevronLeft,
  ChevronRight,
  Mail,
  CheckCircle,
  AlertCircle,
  Home,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover'
import { Avatar, AvatarFallback } from '../../components/ui/avatar'
import { auth } from '../../config/firebase'
import { signOut, sendEmailVerification, type User as FirebaseUser } from 'firebase/auth'
import { db } from '../../config/firebase'
import { doc, getDoc } from 'firebase/firestore'
import logo from '../../logo.svg'


export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})


function RouteComponent() {
  const navigate = useNavigate()
  interface Profile {
    name?: string
    surname?: string
    isActive?: boolean
    isAdmin?: boolean
    role?: string
    // allow additional fields from Firestore without errors
    [key: string]: any
  }

  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [sendingVerification, setSendingVerification] = useState(false)
  // NOTE: portal tooltip removed — compact sidebar items use the native title attribute instead

  const supportTeam = [
    {
      full: 'Sakhile Dumisa',
      url: 'https://github.com/dumisa-sakhile',
      // primary/secondary used to generate a small SVG background image
      primary: '#22c55e',
      secondary: '#16a34a',
      icon: Shield,
      iconColor: 'text-green-600'
    },
    {
      full: 'Khayalethu Dube',
      url: 'https://github.com/Khaya-ux',
      primary: '#3b82f6',
      secondary: '#1e40af',
      icon: Battery,
      iconColor: 'text-blue-600'
    },
    {
      full: 'Njabulo Matshika',
      url: 'https://github.com/DrStormXXX',
      primary: '#f59e0b',
      secondary: '#d97706',
      icon: CheckCircle,
      iconColor: 'text-amber-600'
    },
  ]

  function makeBgDataUrl(primary: string, secondary: string) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${primary}'/><stop offset='1' stop-color='${secondary}'/></linearGradient></defs>` +
      `<rect width='100%' height='100%' fill='url(%23g)'/>` +
      `<g fill='rgba(255,255,255,0.06)'><circle cx='48' cy='16' r='10'/></g>` +
      `</svg>`

    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
  }

  useEffect(() => {
    let mounted = true

    async function handleUser(u: any) {
      if (!mounted) return

      if (!u) {
        setUser(null)
        setProfile(null)
        setAuthChecked(true)
        navigate({ to: '/auth' })
        return
      }

      setUser(u)

      try {
        const ref = doc(db, 'users', u.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          const data = snap.data()
          setProfile(data)

          // Check if account is disabled
          if (data?.isActive === false) {
            // mark auth checked and return; UI will show the disabled state
            setAuthChecked(true)
            return
          }
        } else {
          setProfile(null)
        }
        setAuthChecked(true)
      } catch (err) {
        console.error('Error fetching user profile:', err)
        setProfile(null)
        setAuthChecked(true)
      }
    }

    const initial = auth.currentUser
    if (initial) handleUser(initial)

    const unsub = auth.onAuthStateChanged((u) => handleUser(u))
    return () => {
      mounted = false
      unsub()
    }
  }, [navigate])

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileOpen(false)
  }, [location.pathname])

  // FIX: Check if account is disabled or email not verified
  const isAccountDisabled = profile?.isActive === false
  const isEmailVerified = user?.emailVerified

  // Prevent access if account is disabled (professional UI)
  if (authChecked && isAccountDisabled) {
    return (
      <>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md p-6 rounded-lg">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Account disabled</h2>
            <p className="text-sm text-gray-600 mb-6 max-w-xl">
              Your account has been disabled. If you believe this is an error, contact one of our support staff below and we'll help restore access.
            </p>

            <div className="hidden  items-center gap-5 mb-6">
              {supportTeam.map((s) => {
                const parts = (s.full || '').split(' ').filter(Boolean)
                const first = (parts[0] || '').trim()
                const last = (parts[1] || '').trim()
                const initials = ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || (first?.[0] || 'U')
                return (
                  <a
                    key={s.full}
                    href={s.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center text-center"
                  >
                    <Avatar
                      className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white font-semibold`}
                      style={{
                        backgroundImage: makeBgDataUrl(s.primary, s.secondary),
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    >
                        <AvatarFallback style={{ backgroundColor: '#3b82f6' }} className="text-white text-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-700 mt-2">{first || s.full}</span>
                  </a>
                )
              })}
            </div>

            <div className="flex flex-col items-center gap-3 pb-5">
              
              <Button onClick={handleLogout} variant="destructive" className="w-40">Sign out</Button>
            </div>
          </div>
        </div>
      </div>

      {/* portal tooltip removed */}

      </>
    )
  }

  // Prevent access if email not verified (professional UI)
  if (authChecked && user && !isEmailVerified) {
    return (
          <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md p-6 rounded-lg">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
              <Mail className="h-10 w-10 text-amber-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verify your email</h2>
            <p className="text-sm text-gray-600 mb-4">
              A verification link was sent to <span className="font-medium text-gray-900">{user?.email}</span>. Please open that email and click the link to continue.
            </p>

            <div className="w-full space-y-3">
              <Button
                onClick={sendVerificationEmail}
                disabled={sendingVerification}
                className="w-full py-3 bg-linear-to-r from-blue-600 to-blue-700 text-white"
              >
                <Mail className="h-5 w-5 mr-2" />
                {sendingVerification ? 'Sending...' : 'Resend verification email'}
              </Button>

              <div className="flex items-center justify-center">
                <Button onClick={handleLogout} variant="outline" className="py-2 px-5">Sign out</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!authChecked) {
    return (
      <div className="h-screen w-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16  rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <img src={logo} alt="UtilityGuy" className="h-8 w-8" />
          </div>
          <div className="text-gray-600 font-medium">Loading your dashboard...</div>
        </div>
      </div>
    )
  }

  async function sendVerificationEmail() {
    if (!user) return
    
    setSendingVerification(true)
    try {
      await sendEmailVerification(user)
      alert('✅ Verification email sent! Please check your inbox.')
    } catch (error) {
      console.error('Error sending verification:', error)
      alert('❌ Failed to send verification email. Please try again.')
    } finally {
      setSendingVerification(false)
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth)
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      navigate({ to: '/' })
    }
  }

  const path = typeof window !== 'undefined' ? window.location.pathname : ''

  const displayName = (
    (profile && ((profile.name ? profile.name : '') + (profile.surname ? ` ${profile.surname}` : '')).trim()) ||
    user?.displayName ||
    user?.email ||
    'User'
  )

  const displayInitials = (() => {
    if (profile && (profile.name || profile.surname)) {
      const a = (profile.name || '').trim().slice(0, 1)
      const b = (profile.surname || '').trim().slice(0, 1)
      return (a + b).toUpperCase()
    }
    if (user?.displayName) {
      const parts = user.displayName.split(' ').filter(Boolean)
      return parts.map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
    }
    return (user?.email?.charAt(0) || 'U').toUpperCase()
  })()

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: path === '/dashboard',
      description: 'Overview'
    },
    {
      name: 'Electricity',
      href: '/dashboard/electricity',
      icon: Zap,
      active: path.startsWith('/dashboard/electricity'),
      description: 'Power management'
    },
    {
      name: 'Water',
      href: '/dashboard/water',
      icon: Droplet,
      active: path.startsWith('/dashboard/water'),
      description: 'Water management'
    },
    {
      name: 'Purchases',
      href: '/dashboard/purchases',
      icon: CreditCard,
      active: path.startsWith('/dashboard/purchases'),
      description: 'Transaction history'
    },
    {
      name: 'Auto-Buy',
      href: '/dashboard/auto-buy',
      icon: RefreshCw,
      active: path.startsWith('/dashboard/auto-buy'),
      description: 'Automatic top-ups'
    },
    {
      name: 'Wallet',
      href: '/dashboard/wallet',
      icon: Wallet,
      active: path === '/dashboard/wallet',
      description: 'Balance & payments'
    },
  ]

  const settingsItems = [
    {
      name: 'Profile',
      href: '/dashboard/profile',
      icon: User,
      active: path === '/dashboard/profile',
      description: 'Personal information'
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      active: path === '/dashboard/settings',
      description: 'Preferences'
    }
  ]

  const adminItems = [
    {
      name: 'Admin Panel',
      href: '/dashboard/admin',
      icon: Shield,
      active: path.startsWith('/dashboard/admin'),
      description: 'System administration'
    }
  ]


  const NavigationItem = ({ item, compact = false }: { item: any, compact?: boolean }) => {
    return (
      <Link
        to={item.href as string}
        title={compact ? item.name : undefined}
        className={`group relative flex items-center ${
          compact ? 'justify-center px-3 py-3' : 'px-4 py-3 gap-4'
        } rounded-xl transition-all duration-200 ${
          item.active ? 'text-blue-600' : 'text-gray-700 hover:text-blue-600'
        }`}
      >
        <div className={`p-2 rounded-lg ${
          item.active ? 'bg-transparent' : 'bg-gray-100 group-hover:bg-gray-200'
        }`}>
          <item.icon className={`h-4 w-4 ${item.active ? 'text-blue-600' : 'text-gray-600 group-hover:text-blue-600'}`} />
        </div>
        {!compact && (
          <div className="flex-1 min-w-0">
            <div className={`font-semibold text-sm ${item.active ? 'text-blue-600' : 'text-gray-900'}`}>{item.name}</div>
            <div className={`text-xs ${item.active ? 'text-blue-600' : 'text-gray-500'}`}>
              {item.description}
            </div>
          </div>
        )}
      </Link>
    )
  }

  return (
  <div className="h-screen w-screen bg-linear-to-br from-gray-50 to-blue-50/30 flex overflow-visible">
      {/* MODERN Desktop Sidebar */}
      <div className={`
        hidden md:flex flex-col bg-white/80 backdrop-blur-sm border-r border-gray-200/50 transition-all duration-300 overflow-visible
        ${isCollapsed ? 'w-20' : 'w-80'} shadow-xl
      `}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200/50 shrink-0">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isCollapsed && (
              <div className="flex items-center gap-3">
                <Link to="/dashboard/profile" className="flex items-center gap-3">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      {displayInitials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div title={displayName} className="font-semibold text-gray-900 text-sm truncate">{displayName}</div>
                    <div title={user?.email || ''} className="text-xs text-gray-500 truncate">{user?.email || ''}</div>
                  </div>
                </Link>
              </div>
            )}
            {isCollapsed && (
              <div className="w-12 h-12 bg-linear-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <img src={logo} alt="UtilityGuy" className="h-6 w-6" />
                </div>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all hover:scale-105 text-gray-500"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>

       

        {/* Navigation Menu */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {/* Main Navigation */}
          <div className="space-y-2">
            {navigationItems.map((item) => (
              <NavigationItem key={item.name} item={item} compact={isCollapsed} />
            ))}
          </div>

          {/* Settings Section */}
          <div className="pt-4 space-y-2">
            {settingsItems.map((item) => (
              <NavigationItem key={item.name} item={item} compact={isCollapsed} />
            ))}
          </div>

          {/* Admin Section */}
          {(profile?.isAdmin || profile?.role === 'admin') && (
            <div className="pt-6 space-y-2 border-t border-gray-200/50">
              {adminItems.map((item) => (
                <NavigationItem key={item.name} item={item} compact={isCollapsed} />
              ))}
            </div>
          )}
        </nav>

        {/* Sign Out Button */}
        <div className="p-4 border-t border-gray-200/50 shrink-0">
          <Button 
            onClick={handleLogout} 
            variant="destructive" 
            className={`w-full justify-start text-black hover:border-red-200 hover:scale-105 transition-all ${
              isCollapsed ? 'justify-center px-3 py-3' : 'py-3'
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="ml-3 font-light">Sign Out</span>}
          </Button>
        </div>
      </div>

      {/* Mobile Menu (Same as before - Bottom Sheet) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div 
            className="absolute inset-0 bg-black/20" 
            onClick={() => setIsMobileOpen(false)} 
            aria-hidden 
          />
          
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl border-t border-gray-200 max-h-[85vh] overflow-hidden divide-y divide-gray-100">
            <div className="flex justify-center p-3">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
            </div>

            <div className="px-6 py-4">
              <div className="flex items-center gap-3">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="w-12 h-12 rounded-2xl object-cover border border-gray-200"
                  />
                ) : (
                    <div title={displayName} className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-lg truncate">
                      {displayInitials}
                    </div>
                )}
                  <div className="flex-1 min-w-0">
                    <p title={displayName} className="text-lg font-light text-gray-900 truncate">{displayName}</p>
                    <p title={user?.email || ''} className="text-sm font-light text-gray-500 truncate">{user?.email || ''}</p>
                  </div>
              </div>
            </div>

            <div className="p-4 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                {[...navigationItems, ...settingsItems].map((item) => (
                  <Link
                    key={item.name}
                    to={item.href as any}
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all ${
                      item.active 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'border-gray-100 text-gray-600 hover:bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    <item.icon className="h-6 w-6 mb-2" strokeWidth={1} />
                    <span className="text-xs font-light text-center">{item.name}</span>
                  </Link>
                ))}

                {(profile?.isAdmin || profile?.role === 'admin') && adminItems.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href as any}
                    onClick={() => setIsMobileOpen(false)}
                    className="flex flex-col items-center p-4 rounded-xl border-2 border-purple-100 text-purple-700 hover:bg-purple-50 hover:border-purple-200 transition-all"
                  >
                    <item.icon className="h-6 w-6 mb-2" strokeWidth={1} />
                    <span className="text-xs font-light text-center">{item.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="px-4 pb-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to="/"
                  className="flex items-center justify-center gap-2 p-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <Home className="h-4 w-4" strokeWidth={1} />
                  <span className="text-sm font-light">Home</span>
                </Link>
                <Button 
                  onClick={handleLogout} 
                  variant="outline" 
                  className="flex items-center justify-center gap-2 p-3 h-auto text-red-600 hover:text-red-700 hover:border-red-200"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1} />
                  <span className="text-sm font-light">Sign Out</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header - only hamburger, no shadow */}
        <header className="md:hidden  p-3 shrink-0 sticky top-0 z-40">
          <div className="flex items-center">
            <button
              onClick={() => setIsMobileOpen(true)}
              className="p-2 rounded-md bg-white text-gray-600"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 md:p-6 min-h-full pb-24 md:pb-0">
            <Outlet />
          </div>
        </main>
      </div>
      {/* Mobile fixed bottom nav (uses shadcn Popover for "More") */}
      <div className="fixed bottom-4 left-0 right-0 md:hidden px-4 z-40">
        <div className="max-w-3xl mx-auto bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/60 flex items-center justify-between px-2 py-2 gap-1">
          <Link to="/dashboard" className="flex-1 text-center p-1">
            <div className="flex flex-col items-center">
              <Home className="h-6 w-6 text-gray-700" strokeWidth={1} />
              <span className="text-xs font-light text-gray-700">Home</span>
            </div>
          </Link>

          <Link to={'/dashboard/electricity' as any} className="flex-1 text-center p-1">
            <div className="flex flex-col items-center">
              <Zap className="h-6 w-6 text-gray-700" strokeWidth={1} />
              <span className="text-xs font-light text-gray-700">Electricity</span>
            </div>
          </Link>

          <Link to={'/dashboard/water' as any} className="flex-1 text-center p-1">
            <div className="flex flex-col items-center">
              <Droplet className="h-6 w-6 text-gray-700" strokeWidth={1} />
              <span className="text-xs font-light text-gray-700">Water</span>
            </div>
          </Link>

          <Link to={'/dashboard/purchases' as any} className="flex-1 text-center p-1">
            <div className="flex flex-col items-center">
              <CreditCard className="h-6 w-6 text-gray-700" strokeWidth={1} />
              <span className="text-xs font-light text-gray-700">Purchases</span>
            </div>
          </Link>

          <div className="pl-1">
            <Popover open={moreOpen} onOpenChange={(open) => setMoreOpen(open)}>
              <PopoverTrigger asChild>
                <button className="p-2 rounded-md hover:bg-gray-100" aria-label="More">
                  <Menu className="h-6 w-6 text-gray-700" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" side="top" className="w-56 p-2">
                <div className="flex flex-col space-y-1">
                  {[...navigationItems, ...settingsItems].map((item) => {
                    if (['Dashboard', 'Electricity', 'Water', 'Purchases'].includes(item.name)) return null
                    return (
                      <Link key={item.name} to={item.href as any} className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50">
                        <item.icon className="h-4 w-4 text-gray-600" />
                        <span className="text-sm">{item.name}</span>
                      </Link>
                    )
                  })}

                  {(profile?.isAdmin || profile?.role === 'admin') && adminItems.map((item) => (
                    <Link key={item.name} to={item.href as any} className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50">
                      <item.icon className="h-4 w-4 text-gray-600" />
                      <span className="text-sm">{item.name}</span>
                    </Link>
                  ))}

                  <div className="border-t pt-2 mt-2">
                    <button
                      onClick={() => { setMoreOpen(false); handleLogout(); }}
                      className="w-full text-left p-2 rounded-md hover:bg-gray-50 flex items-center gap-2 text-sm text-red-600"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  )
}