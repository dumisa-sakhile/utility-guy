import { useEffect, useState } from 'react'
import { createFileRoute, Outlet, Link, useNavigate, useLocation } from '@tanstack/react-router'
import { 
  LogOut, 
  Zap, 
  Droplet, 
  CreditCard, 
  RefreshCw, 
  Wallet, 
  Settings, 
  Shield, 
  User,
  BarChart3,
  Wrench,
  Users,
  
  ChevronLeft,
  ChevronRight,
  Mail,
  AlertCircle,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
// Use simple buttons for mobile sub-navigation to avoid deformation
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog'
import { auth } from '../../config/firebase'
import { signOut, sendEmailVerification, type User as FirebaseUser } from 'firebase/auth'
import { db } from '../../config/firebase'
import { doc, getDoc } from 'firebase/firestore'
import logo from '../../logo.svg'

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname

  interface Profile {
    name?: string
    surname?: string
    isActive?: boolean
    isAdmin?: boolean
    role?: string
    [key: string]: any
  }

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [sendingVerification, setSendingVerification] = useState(false)

  const isAdmin = profile?.isAdmin || profile?.role === 'admin'

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

          if (data?.isActive === false) {
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

  const isAccountDisabled = profile?.isActive === false
  const isEmailVerified = user?.emailVerified

  // Account disabled screen
  if (authChecked && isAccountDisabled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-sm border">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Account Disabled</h2>
            <p className="text-gray-600 mb-6">Your account has been disabled. Please contact support.</p>
            <Button onClick={handleLogout} variant="destructive" className="w-full">Sign Out</Button>
          </div>
        </div>
      </div>
    )
  }

  // Email verification screen
  if (authChecked && user && !isEmailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-sm border">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <Mail className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verify Your Email</h2>
            <p className="text-gray-600 mb-4">Please verify your email address to continue.</p>
            <div className="space-y-3">
              <Button
                onClick={sendVerificationEmail}
                disabled={sendingVerification}
                className="w-full"
              >
                <Mail className="h-4 w-4 mr-2" />
                {sendingVerification ? 'Sending...' : 'Resend Verification Email'}
              </Button>
              <Button onClick={handleLogout} variant="outline" className="w-full">Sign Out</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4">
            <img src={logo} alt="UtilityGuy" className="h-8 w-8" />
          </div>
          <div className="text-gray-600">Loading dashboard...</div>
        </div>
      </div>
    )
  }

  async function sendVerificationEmail() {
    if (!user) return
    setSendingVerification(true)
    try {
      await sendEmailVerification(user)
      alert('Verification email sent! Please check your inbox.')
    } catch (error) {
      alert('Failed to send verification email. Please try again.')
    } finally {
      setSendingVerification(false)
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth)
      navigate({ to: '/' })
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const displayName = profile?.name && profile?.surname 
    ? `${profile.name} ${profile.surname}`
    : user?.displayName || user?.email || 'User'

  const userInitials = profile?.name && profile?.surname 
    ? `${profile.name[0]}${profile.surname[0]}`.toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase()

  // Navigation structure exactly as specified, with admin under dashboard
  const navigationSections = [
    {
      name: 'Metrics',
      icon: BarChart3,
      items: [
        {
          name: 'Electricity Metrics',
          href: '/dashboard',
          icon: Zap,
          active: path === '/dashboard',
          description: 'Charts & analytics'
        },
        {
          name: 'Water Metrics',
          href: '/dashboard/water',
          icon: Droplet,
          active: path === '/dashboard/water',
          description: 'Charts & analytics'
        }
      ]
    },
    {
      name: 'Utilities',
      icon: Wrench,
      items: [
        {
          name: 'Electricity Management',
          href: '/dashboard/utilities',
          icon: Zap,
          active: path === '/dashboard/utilities',
          description: 'Purchase & settings'
        },
        {
          name: 'Water Management',
          href: '/dashboard/utilities/water',
          icon: Droplet,
          active: path === '/dashboard/utilities/water',
          description: 'Purchase & settings'
        }
      ]
    },
    {
      name: 'Wallet',
      icon: Wallet,
      items: [
        {
          name: 'Balance',
          href: '/dashboard/wallet',
          icon: Wallet,
          active: path === '/dashboard/wallet',
          description: 'Balance & payments'
        },
        {
          name: 'History',
          href: '/dashboard/wallet/history',
          icon: CreditCard,
          active: path === '/dashboard/wallet/history',
          description: 'Transaction history'
        },
        {
          name: 'Auto Top-up',
          href: '/dashboard/wallet/auto',
          icon: RefreshCw,
          active: path === '/dashboard/wallet/auto',
          description: 'Automated top-up'
        }
      ]
    },
    {
      name: 'Settings',
      icon: Settings,
      items: [
        {
          name: 'Profile',
          href: '/dashboard/settings',
          icon: User,
          active: path === '/dashboard/settings',
          description: 'Personal information'
        }
      ]
    }
  ]

  const adminSection = {
    name: 'Admin',
    icon: Shield,
    items: [
      {
        name: 'Admin Metrics',
        href: '/dashboard/admin',
        icon: BarChart3,
        active: path === '/dashboard/admin',
        description: 'Platform overview'
      },
      {
        name: 'User Management',
        href: '/dashboard/admin/users',
        icon: Users,
        active: path === '/dashboard/admin/users',
        description: 'Manage users'
      }
    ]
  }

  const NavigationItem = ({ item, compact = false }: { item: any, compact?: boolean }) => (
    <Link
      to={item.href}
      className={`flex items-center ${
        compact ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3'
      } rounded-lg text-sm font-medium transition-colors ${
        item.active 
          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
          : 'text-gray-700 hover:bg-gray-100'
      }`}
      title={compact ? item.name : undefined}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!compact && <span className="truncate">{item.name}</span>}
    </Link>
  )

  // Mobile section active states
  const isMetricsActive = path === '/dashboard' || path === '/dashboard/water'
  const isUtilitiesActive = path.startsWith('/dashboard/utilities')
  const isWalletActive = path.startsWith('/dashboard/wallet')
  const isSettingsActive = path.startsWith('/dashboard/settings')
  const isAdminActive = path.startsWith('/dashboard/admin')

  // Determine current section for mobile top heading
  const getCurrentSection = () => {
    if (isAdminActive) return 'Admin'
    if (isSettingsActive) return 'Settings'
    if (isWalletActive) return 'Wallet'
    if (isUtilitiesActive) return 'Utilities'
    if (isMetricsActive) return 'Metrics'
    return 'Dashboard'
  }

  const currentSection = getCurrentSection()

  // Mobile header now shows a compact nested nav for the active section (no title/back button)

  // Note: mobile submenu is handled via the compact popover instead of per-section handlers.

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Desktop Sidebar */}
      <div className={`
        hidden md:flex flex-col bg-white border-r border-gray-200 transition-all duration-300
        ${isCollapsed ? 'w-16' : 'w-64'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isCollapsed ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img src={logo} alt="UtilityGuy" className="h-5 w-5" />
                </div>
                <span className="font-bold text-gray-900">UtilityGuy</span>
              </div>
            ) : null}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-500"
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {navigationSections.map((section) => (
            <div key={section.name} className="space-y-2">
              {!isCollapsed && (
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2">
                  {section.name}
                </div>
              )}
              {section.items.map((item) => (
                <NavigationItem key={item.name} item={item} compact={isCollapsed} />
              ))}
            </div>
          ))}
          
          {/* Admin Section */}
          {isAdmin && (
            <div className="space-y-2 pt-4 border-t border-gray-200">
              {!isCollapsed && (
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2">
                  {adminSection.name}
                </div>
              )}
              {adminSection.items.map((item) => (
                <NavigationItem key={item.name} item={item} compact={isCollapsed} />
              ))}
            </div>
          )}
        </nav>

        {/* User & Sign Out */}
        <div className="p-4 border-t border-gray-200 space-y-3">
          {!isCollapsed && (
            <Link
              to="/dashboard/settings"
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {userInitials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
                <div className="text-xs text-gray-500 truncate">{user?.email}</div>
              </div>
            </Link>
          )}
          <Button 
            onClick={handleLogout} 
            variant="outline" 
            className={`w-full justify-start ${isCollapsed ? 'justify-center px-2' : ''}`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:p-4">
        {/* Mobile: inline compact nested nav (no title/back icon). Hidden on Settings to avoid duplicate top menu */}
        {currentSection !== 'Settings' && (
          <div className="md:hidden bg-white border-b border-gray-200">
            <div className="flex items-center justify-center gap-2 px-2 py-2 overflow-x-auto">
            {currentSection === 'Metrics' && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path === '/dashboard' ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Electricity
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/water' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path === '/dashboard/water' ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Water
                </Button>
              </>
            )}
            {currentSection === 'Utilities' && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/utilities' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path === '/dashboard/utilities' ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Electricity
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/utilities/water' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path === '/dashboard/utilities/water' ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Water
                </Button>
              </>
            )}
            {currentSection === 'Wallet' && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/wallet' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path === '/dashboard/wallet' ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Balance
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/wallet/history' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path.includes('history') ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  History
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/wallet/auto' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path.includes('auto') ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Auto
                </Button>
              </>
            )}
            {/* Settings top nested nav is intentionally omitted on mobile to avoid duplicate controls */}
            {currentSection === 'Admin' && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/admin' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${!path.includes('users') ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Metrics
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => (navigate as any)({ to: '/dashboard/admin/users' })}
                  className={`shrink-0 text-sm px-3 rounded-md border transition-colors ${path.includes('users') ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:border-gray-200'}`}
                >
                  Users
                </Button>
              </>
            )}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto p-2 pb-36 md:pb-0 md:p-0">
          <Outlet />
          
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 shadow-lg">
        <div className="flex items-center justify-around px-2 py-2">
          {/* Metrics */}
          <Link to="/dashboard" className={`flex flex-col items-center space-y-1 p-3 transition-colors ${isMetricsActive ? 'text-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:rounded-md'}`}>
            <BarChart3 strokeWidth={1.5} className={`h-7 w-7 ${isMetricsActive ? 'text-blue-600' : 'text-gray-600'}`} />
            <span className={`text-xs font-light ${isMetricsActive ? 'text-blue-600' : 'text-gray-600'}`}>Metrics</span>
          </Link>

          {/* Utilities */}
          <Link to="/dashboard/utilities" className={`flex flex-col items-center space-y-1 p-3 transition-colors ${isUtilitiesActive ? 'text-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:rounded-md'}`}>
            <Wrench strokeWidth={1.5} className={`h-7 w-7 ${isUtilitiesActive ? 'text-blue-600' : 'text-gray-600'}`} />
            <span className={`text-xs font-light ${isUtilitiesActive ? 'text-blue-600' : 'text-gray-600'}`}>Utilities</span>
          </Link>

          {/* Wallet */}
          <Link to="/dashboard/wallet" className={`flex flex-col items-center space-y-1 p-3 transition-colors ${isWalletActive ? 'text-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:rounded-md'}`}>
            <Wallet strokeWidth={1.5} className={`h-7 w-7 ${isWalletActive ? 'text-blue-600' : 'text-gray-600'}`} />
            <span className={`text-xs font-light ${isWalletActive ? 'text-blue-600' : 'text-gray-600'}`}>Wallet</span>
          </Link>

          {/* Settings */}
          <Link to="/dashboard/settings" className={`flex flex-col items-center space-y-1 p-3 transition-colors ${isSettingsActive ? 'text-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:rounded-md'}`}>
            <Settings strokeWidth={1.5} className={`h-7 w-7 ${isSettingsActive ? 'text-blue-600' : 'text-gray-600'}`} />
            <span className={`text-xs font-light ${isSettingsActive ? 'text-blue-600' : 'text-gray-600'}`}>Settings</span>
          </Link>

          {/* Sign Out (mobile) - opens confirm dialog */}
          <div className="flex flex-col items-center space-y-1 p-2">
            <button onClick={() => setSignOutOpen(true)} className={`flex flex-col items-center space-y-1 p-3 transition-colors hover:bg-gray-50 hover:rounded-md text-gray-600`}>
              <LogOut strokeWidth={1.5} className="h-7 w-7" />
              <span className={`text-xs font-light text-gray-600`}>Sign Out</span>
            </button>

            <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Sign Out</DialogTitle>
                </DialogHeader>
                <DialogDescription>Are you sure you want to sign out? You will be returned to the home page.</DialogDescription>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSignOutOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={() => { setSignOutOpen(false); handleLogout(); }}>Sign Out</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  )
}