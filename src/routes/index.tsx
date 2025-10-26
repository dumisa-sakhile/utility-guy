import { createFileRoute } from '@tanstack/react-router'
import React, { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import logo from '../logo.svg'
import { Link } from '@tanstack/react-router'
import { Zap, Droplet, Lock, Shield, Battery,  CheckCircle, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'

export const Route = createFileRoute('/')({
  component: Landing,
})

function StatusPill({ level }: { level: 'ok' | 'medium' | 'critical' }) {
  const map: Record<string, string> = {
    ok: 'bg-green-100 text-green-800 border border-green-200',
    medium: 'bg-amber-100 text-amber-800 border border-amber-200',
    critical: 'bg-red-100 text-red-800 border border-red-200',
  }
  return <span className={`px-3 py-1 rounded-full text-xs font-semibold ${map[level]}`}>{level.toUpperCase()}</span>
}

function MeterRow({ name, value, percent }: { name: string; value: string; percent: number }) {
  const level = percent > 50 ? 'ok' : percent > 20 ? 'medium' : 'critical'
  const Icon = name.includes('Elec') ? Zap : Droplet
  
  return (
    <motion.div 
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
          level === 'ok' ? 'bg-green-50 text-green-600' : 
          level === 'medium' ? 'bg-amber-50 text-amber-600' : 
          'bg-red-50 text-red-600'
        }`}>
          <Icon size={20} />
        </div>
        <div>
          <div className="font-semibold text-gray-900">{name}</div>
          <div className="text-sm text-gray-600">{value}</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-[120px] max-w-[180px] h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-500 ${
            level === 'ok' ? 'bg-green-500' : 
            level === 'medium' ? 'bg-amber-500' : 
            'bg-red-500'
          }`} style={{ width: `${percent}%` }} />
        </div>
        <StatusPill level={level as any} />
      </div>
    </motion.div>
  )
}

function InteractiveMeter({ initial = 32 }: { initial?: number }) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)
  const [percent, setPercent] = useState<number>(initial)
  const draggingRef = useRef(false)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    function clampP(p: number) {
      return Math.max(0, Math.min(100, Math.round(p)))
    }

    function fromClientX(clientX: number) {
      const t = trackRef.current
      if (!t) return 0
      const rect = t.getBoundingClientRect()
      const x = clientX - rect.left
      const p = (x / rect.width) * 100
      return clampP(p)
    }

    function onDocPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return
      setPercent(fromClientX(e.clientX))
    }

    function onDocPointerUp(e: PointerEvent) {
      if (draggingRef.current) {
        draggingRef.current = false
        try {
          (e.target as Element)?.releasePointerCapture?.(e.pointerId)
        } catch {}
      }
      document.removeEventListener('pointermove', onDocPointerMove)
      document.removeEventListener('pointerup', onDocPointerUp)
    }

    const knob = knobRef.current
    if (!knob) return

    function onKnobPointerDown(e: PointerEvent) {
      e.preventDefault()
      draggingRef.current = true
      try {
        knob?.setPointerCapture(e.pointerId)
      } catch {}
      setPercent(fromClientX(e.clientX))
      document.addEventListener('pointermove', onDocPointerMove)
      document.addEventListener('pointerup', onDocPointerUp)
    }

    function onTrackPointerDown(e: PointerEvent) {
      setPercent(fromClientX(e.clientX))
    }

    knob.addEventListener('pointerdown', onKnobPointerDown as any)
    track.addEventListener('pointerdown', onTrackPointerDown as any)

    return () => {
      knob.removeEventListener('pointerdown', onKnobPointerDown as any)
      track.removeEventListener('pointerdown', onTrackPointerDown as any)
      document.removeEventListener('pointermove', onDocPointerMove)
      document.removeEventListener('pointerup', onDocPointerUp)
    }
  }, [])

  function onKnobKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      setPercent((p) => Math.max(0, p - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      setPercent((p) => Math.min(100, p + 1))
      e.preventDefault()
    } else if (e.key === 'Home') {
      setPercent(0)
      e.preventDefault()
    } else if (e.key === 'End') {
      setPercent(100)
      e.preventDefault()
    }
  }

  const color = percent > 50 ? '#10b981' : percent > 25 ? '#f59e0b' : percent > 10 ? '#fb923c' : '#ef4444'
  const status = percent > 50 ? 'ok' : percent > 25 ? 'medium' : percent > 10 ? 'medium' : 'critical'

  return (
    <motion.div 
      className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="text-lg font-semibold text-gray-900 mb-4">Experience Smart Monitoring</div>
      <p className="text-sm text-gray-600 mb-4">Drag to simulate real-time utility consumption and see instant status updates</p>

      <div
        ref={trackRef}
        className="relative h-4 bg-gray-100 rounded-full cursor-pointer"
        aria-hidden={false}
      >
        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-300" style={{ width: `${percent}%`, background: color }} />

        <div
          ref={knobRef}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Meter remaining"
          onKeyDown={onKnobKeyDown}
          className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-2 border-gray-300 shadow-lg flex items-center justify-center cursor-grab hover:border-blue-500 transition-colors"
          style={{ left: `${percent}%`, transform: 'translate(-50%, -50%)', borderColor: color }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Balance: <span className="font-semibold">{percent}%</span>
        </div>
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <StatusPill level={status} />
        </motion.div>
      </div>
    </motion.div>
  )
}

function FeatureCard({ icon: Icon, title, description, delay = 0 }: { icon: any, title: string, description: string, delay?: number }) {
  return (
    <motion.div 
      className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -4 }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
          <Icon className="text-blue-600" size={24} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </motion.div>
  )
}

function Landing() {
  const sampleMeters = [
    { name: 'Electricity - Unit 4B', value: '32 kWh remaining', percent: 32 },
    { name: 'Water - Unit 4B', value: '1,200 L remaining', percent: 12 },
    { name: 'Electricity - Common Area', value: '85 kWh remaining', percent: 85 },
  ]

  const features = [
    {
      icon: Battery,
      title: 'Real-time Monitoring',
      description: 'Live updates of your electricity and water balances with color-coded status alerts'
    },
    {
      icon: Shield,
      title: 'Auto Top-up',
      description: 'Never run out again. Automatic purchases trigger when balances get low'
    },
    {
      icon: Lock,
      title: 'Remote Control',
      description: 'Enable or disable utilities remotely with one click'
    }
  ]

  const LandingHeader = () => (
    <motion.header 
      className="w-full py-6 px-4 sm:px-6 lg:px-8 flex items-center justify-between max-w-7xl mx-auto"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3">
        <img src={logo} alt="Utility Guy" className="h-10 w-10 rounded-lg" />
        <div className="font-bold text-xl text-gray-900">UtilityGuy</div>
      </div>

      <div className="flex items-center gap-4">
        <Link to="/auth" className="text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors">
          Sign in
        </Link>
        <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
          <Link to="/auth/register">Get Started</Link>
        </Button>
      </div>
    </motion.header>
  )

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-green-50">
      <LandingHeader />
      
      <main className="px-4 sm:px-6 lg:px-8 py-16 max-w-7xl mx-auto space-y-20">
        {/* Hero Section */}
        <section className="grid gap-12 lg:grid-cols-2 items-center">
          <motion.div 
            className="space-y-8"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="space-y-4">
              <motion.h1 
                className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Take Control of Your
                <span className="text-blue-600 block">Utilities</span>
              </motion.h1>
              
              <motion.p 
                className="text-xl text-gray-600 leading-relaxed max-w-2xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Never worry about water or electricity outages again. UtilityGuy gives you real-time visibility, smart alerts, and automated top-ups for complete peace of mind.
              </motion.p>
            </div>

            <motion.div 
              className="flex flex-col sm:flex-row gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white text-base px-8 py-3">
                <Link to="/auth/register" className="flex items-center gap-2">
                  Start Free Trial <ArrowRight size={18} />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-base px-8 py-3 border-gray-300">
                View Live Demo
              </Button>
            </motion.div>

            <motion.div 
              className="grid grid-cols-3 gap-4 pt-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="text-center">
                <div className="font-bold text-2xl text-gray-900">24/7</div>
                <div className="text-sm text-gray-600">Monitoring</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-2xl text-gray-900">Auto</div>
                <div className="text-sm text-gray-600">Top-ups</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-2xl text-gray-900">Zero</div>
                <div className="text-sm text-gray-600">Outages</div>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="text-lg font-semibold text-gray-900 text-center lg:text-left">Live Dashboard Preview</div>
            <div className="space-y-4">
              {sampleMeters.map((meter) => (
                <MeterRow key={meter.name} {...meter} />
              ))}
            </div>
            <InteractiveMeter initial={32} />
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="space-y-12">
          <motion.div 
            className="text-center space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Smart Utility Management</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Everything you need to monitor, control, and automate your utilities in one place
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <FeatureCard 
                key={feature.title}
                {...feature}
                delay={0.7 + index * 0.1}
              />
            ))}
          </div>
        </section>

        {/* Use Case Story */}
        <motion.section 
          className="bg-white rounded-2xl border border-gray-200 p-8 lg:p-12 shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="grid gap-8 lg:grid-cols-2 items-center">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  <CheckCircle size={16} />
                  Real User Story
                </div>
                <h3 className="text-2xl lg:text-3xl font-bold text-gray-900">How Sarah Saved Her Rental Business</h3>
                <p className="text-lg text-gray-600">
                  "I used to get emergency calls from tenants at all hours. Now UtilityGuy handles everything automatically. 
                  My tenants are happy, and I finally have peace of mind."
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Reduced emergency calls by 95%</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Saves 10+ hours per week on utility management</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Zero outages since switching to UtilityGuy</span>
                </div>
              </div>
            </div>
            
            <div className="grid gap-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="font-semibold text-green-800 mb-1">Morning Check</div>
                <div className="text-sm text-green-700">Sarah reviews all properties in 2 minutes</div>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="font-semibold text-amber-800 mb-1">Smart Alert</div>
                <div className="text-sm text-amber-700">Unit 4B electricity running low - amber warning</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="font-semibold text-blue-800 mb-1">Auto Rescue</div>
                <div className="text-sm text-blue-700">System auto-purchases electricity, prevents outage</div>
              </div>
            </div>
          </div>
        </motion.section>

       

        {/* Final CTA */}
        <motion.section 
          className="text-center space-y-8 bg-linear-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-white"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
        >
          <div className="space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold">Ready to Never Worry About Utilities Again?</h2>
            <p className="text-xl text-blue-100 opacity-90">
              Join thousands of property owners and managers who trust UtilityGuy for seamless utility management
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-base px-8 py-3 font-semibold">
              <Link to="/auth/register">Start Free Trial</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-white text-blue-600 hover:bg-white hover:text-blue-600 text-base px-8 py-3">
              Schedule Demo
            </Button>
          </div>
          
          <div className="text-blue-100 text-sm">
            No credit card required • Setup in 2 minutes • Cancel anytime
          </div>
        </motion.section>
      </main>
    </div>
  )
}