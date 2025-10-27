import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore'
import { auth, db } from '../../config/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent  } from '../../components/ui/chart'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader, DialogClose } from '../../components/ui/dialog'
import { BarChart, Bar, CartesianGrid, XAxis } from 'recharts'
import {  Play, Pause, Clock, RefreshCw, Plus, Settings, AlertTriangle, Droplet } from 'lucide-react'
import { useSimulationStore } from '../../lib/simulationStore'

export const Route = createFileRoute('/dashboard/water')({
  component: WaterDashboard,
})

interface MeterReading {
  id: string
  balance: number
  timestamp: any
  meterType: 'electricity' | 'water'
  isSimulated?: boolean
  meterId: string
  lastDecrement?: number
}

interface WaterMeter {
  id: string
  meterNumber: string
  lowThreshold: number
  criticalThreshold: number
  isActive: boolean
  autoPurchase: boolean
  usageLimit?: number
  isPaused?: boolean
}

function WaterDashboard() {
  const queryClient = useQueryClient()
  const user = auth.currentUser
  const { simulationActive, setSimulationActive, nextUpdate, setNextUpdate, setLastDecrement } = useSimulationStore()

  // Live countdown for next update
  useEffect(() => {
    if (!simulationActive) return
    const timer = setInterval(() => {
      setNextUpdate(nextUpdate <= 1 ? 30 : nextUpdate - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [simulationActive, nextUpdate, setNextUpdate])

  // Fetch latest water reading
  const { data: waterReading, isPending: readingLoading, refetch: refetchReading } = useQuery({
    queryKey: ['water-reading', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(
        collection(db, 'meter_readings'),
        where('userId', '==', user.uid),
        where('meterType', '==', 'water'),
        orderBy('timestamp', 'desc'),
        limit(1)
      )
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MeterReading
    },
    enabled: !!user,
  })

  // Fetch water meter configuration
  const { data: waterMeter, isPending: meterLoading } = useQuery({
    queryKey: ['water-meter', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(
        collection(db, 'water_meters'),
        where('userId', '==', user.uid),
        limit(1)
      )
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as WaterMeter
    },
    enabled: !!user,
  })

  // Fetch recent water transactions
  const { data: recentTransactions } = useQuery({
    queryKey: ['water-transactions', user?.uid],
    queryFn: async () => {
      if (!user) return []
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', user.uid),
        where('meterType', '==', 'water'),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]
    },
    enabled: !!user,
  })

  // Chart window
  const chartWindowMinutes = 60
  const stepSeconds = 30

  const chartData = useMemo(() => {
    if (!waterReading) return []
    const now = new Date()
    const windowStart = new Date(now.getTime() - chartWindowMinutes * 60 * 1000)
    const readingTime = waterReading.timestamp?.toDate ? waterReading.timestamp.toDate() : new Date()
    const lastDec = waterReading.lastDecrement ?? 0.2
    const consumptionPerSec = lastDec / stepSeconds

    const purchases = (recentTransactions || [])
      .filter((t: any) => t.type === 'purchase' && t.units)
      .map((t: any) => ({ time: t.timestamp?.toDate ? t.timestamp.toDate() : new Date(), units: t.units, id: t.id }))

    const sumPurchasesBetween = (from: Date, to: Date) => purchases.filter(p => p.time > from && p.time <= to).reduce((s, p) => s + (p.units || 0), 0)

    const secsBetween = Math.max(0, (readingTime.getTime() - windowStart.getTime()) / 1000)
    const consumptionSinceWindowStart = consumptionPerSec * secsBetween
    const purchasesSinceWindowStart = sumPurchasesBetween(windowStart, readingTime)

    let balanceAtWindowStart = parseFloat((waterReading.balance + consumptionSinceWindowStart - purchasesSinceWindowStart).toFixed(3))

    const points: Array<any> = []
    const steps = Math.ceil((now.getTime() - windowStart.getTime()) / (stepSeconds * 1000))
    let currentTime = new Date(windowStart)
    let currentBalance = balanceAtWindowStart
    let usageNet = 0

    for (let i = 0; i <= steps; i++) {
      const purchasesNow = purchases.filter((p) => Math.abs(p.time.getTime() - currentTime.getTime()) < stepSeconds * 1000)
      if (purchasesNow.length) {
        purchasesNow.forEach((p) => {
          currentBalance = parseFloat((currentBalance + p.units).toFixed(3))
          usageNet = Math.max(0, parseFloat((usageNet - p.units).toFixed(3)))
        })
      }
      points.push({ time: currentTime.toISOString(), balance: parseFloat(currentBalance.toFixed(3)), usage: parseFloat(usageNet.toFixed(3)) })
      currentTime = new Date(currentTime.getTime() + stepSeconds * 1000)
      usageNet = parseFloat((usageNet + consumptionPerSec * stepSeconds).toFixed(3))
      currentBalance = parseFloat((currentBalance - consumptionPerSec * stepSeconds).toFixed(3))
    }

    return points
  }, [waterReading, recentTransactions])

  const chartConfig = { balance: { label: 'Balance (L)', color: 'var(--color-balance, #2563eb)' }, usage: { label: 'Usage (L)', color: 'var(--color-usage, #ef4444)' } }

  // Configuration modal state
  const [showConfigOpen, setShowConfigOpen] = useState(false)
  const [cfgLowThreshold, setCfgLowThreshold] = useState<number | ''>('')
  const [cfgCriticalThreshold, setCfgCriticalThreshold] = useState<number | ''>('')
  const [cfgAutoPurchase, setCfgAutoPurchase] = useState<boolean>(false)
  const [cfgUsageLimit, setCfgUsageLimit] = useState<number | ''>('')
  const [formErrors, setFormErrors] = useState<{ lowThreshold?: string; criticalThreshold?: string; usageLimit?: string }>({})

  useEffect(() => {
    if (!waterMeter) return
    setCfgLowThreshold(waterMeter.lowThreshold ?? '')
    setCfgCriticalThreshold(waterMeter.criticalThreshold ?? '')
    setCfgAutoPurchase(!!waterMeter.autoPurchase)
    setCfgUsageLimit(waterMeter.usageLimit ?? '')
  }, [waterMeter])

  // Smart water decrement: vary by time of day and randomness
  const getSmartDecrement = () => {
    // produce a random decrement between 0.5 L (500 ml) and 10 L per 30s
    // keep some time-of-day variation and occasional spikes but clamp to requested range
    const min = 0.5
    const max = 10
    // base in range [0.5, 10]
    const base = Math.random() * (max - min) + min
    const hour = new Date().getHours()
    // modest peak multiplier in morning/evening
    const multiplier = (hour >= 6 && hour <= 9) || (hour >= 18 && hour <= 21) ? 1.2 : 1.0
    // occasional spike events (small chance) that briefly increase usage
    const spike = Math.random() < 0.05 ? (Math.random() * 2 + 1) : 1
    let val = base * multiplier * spike
    // clamp to requested range to ensure 0.5 <= val <= 10
    val = Math.min(max, Math.max(min, val))
    return parseFloat(val.toFixed(3))
  }

  // Auto-decrement simulation for water
  useEffect(() => {
    if (!user || !waterReading || !waterMeter || !simulationActive || waterMeter.isPaused || !waterReading.id) return

    const interval = setInterval(async () => {
      try {
        // generate smart decrement
        const decrement = getSmartDecrement()
        const newBalance = Math.max(0, waterReading.balance - decrement)

        await updateDoc(doc(db, 'meter_readings', waterReading.id), {
          balance: parseFloat(newBalance.toFixed(3)),
          timestamp: Timestamp.now(),
          lastDecrement: parseFloat(decrement.toFixed(3))
        })

        setLastDecrement(new Date())
        setNextUpdate(30)
        queryClient.invalidateQueries({ queryKey: ['water-reading', user.uid] })
        queryClient.invalidateQueries({ queryKey: ['water-transactions', user.uid] })
      } catch (error) {
        console.error('Error in water simulation:', error)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [user, waterReading, waterMeter, simulationActive, queryClient])

  // Real-time updates
  useEffect(() => {
    if (!user) return
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'meter_readings'),
        where('userId', '==', user.uid),
        where('meterType', '==', 'water'),
        orderBy('timestamp', 'desc'),
        limit(1)
      ),
      () => queryClient.invalidateQueries({ queryKey: ['water-reading', user.uid] })
    )
    return () => unsubscribe()
  }, [user, queryClient])

  const getWaterStatus = () => {
    if (!waterReading || !waterMeter) return { status: 'unknown', color: 'gray' as const }
    const balance = waterReading.balance
    if (balance <= waterMeter.criticalThreshold) return { status: 'Critical', color: 'red' as const }
    if (balance <= waterMeter.lowThreshold) return { status: 'Low', color: 'amber' as const }
    return { status: 'Good', color: 'green' as const }
  }

  const getEstimatedTimeRemaining = () => {
    if (!waterReading?.balance) return 'N/A'
    // assume avgDailyConsumption in liters (example value)
    const avgDailyConsumption = 500 // liters/day
    const hoursRemaining = (waterReading.balance / avgDailyConsumption) * 24
    if (hoursRemaining < 24) return `${Math.round(hoursRemaining)} hours`
    return `${Math.round(hoursRemaining / 24)} days`
  }

  const { status, color } = getWaterStatus()
  const isPending = readingLoading || meterLoading

  if (isPending) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600">Loading water metrics...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen ">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Water Analytics</h1>
            <p className="text-gray-600 mt-1">Real-time monitoring and consumption insights</p>
          </div>
          <div className="flex items-center gap-3">
         
            <Button variant={simulationActive ? "destructive" : "default"} size="sm" onClick={() => setSimulationActive(!simulationActive)} className="flex items-center gap-2">
              {simulationActive ? (<><Pause className="h-4 w-4" />Pause</>) : (<><Play className="h-4 w-4" />Resume</>)}
            </Button>
            <Button  size="sm" onClick={() => refetchReading()} className="flex items-center gap-2"><RefreshCw className="h-4 w-4" />Refresh</Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Bottom Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {/* Next Update */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${simulationActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <RefreshCw className={`h-5 w-5 ${simulationActive ? 'text-green-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Next Update</div>
                    <div className="text-2xl font-bold text-gray-900">{simulationActive ? `${nextUpdate}s` : 'Paused'}</div>
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-600">Auto-decrement runs every 30s when live</div>
            </CardContent>
          </Card>

          {/* Time Remaining */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Clock className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Time Remaining</div>
                    <div className="text-2xl font-bold text-gray-900">{getEstimatedTimeRemaining()}</div>
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-600">Estimated at current usage</div>
            </CardContent>
          </Card>

          {/* Current Balance */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Droplet className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Current Balance</div>
                    <div className="text-2xl font-bold text-gray-900">{waterReading?.balance.toFixed(1)} L</div>
                  </div>
                </div>
                <Badge className={color === 'red' ? 'bg-red-100 text-red-800' : color === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}>{status}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Meter Configuration */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <Settings className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Meter Configuration</div>
                    <div className="text-2xl font-bold text-gray-900">Configure</div>
                  </div>
                </div>
                <div>
                  <Button onClick={() => setShowConfigOpen(true)} variant="outline" size="sm">Open</Button>
                </div>
              </div>
              <div className="text-sm text-gray-600 mt-3">Manage thresholds, auto top-up and usage limits.</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Chart */}
        <Card className="rounded-md mb-8 border-none bg-none">
          <CardHeader>
            <CardTitle>Estimated Consumption (last 60 minutes)</CardTitle>
            <CardDescription>Line shows balance vs usage. Dots are purchases.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-lg overflow-hidden">
              <ChartContainer config={chartConfig} className="h-64 sm:h-96 w-full">
                {(() => {
                  const MAX_BARS = 12
                  const data = chartData && chartData.length ? chartData : []
                  const step = Math.max(1, Math.floor(data.length / MAX_BARS))
                  const barData = data.filter((_: any, i: number) => i % step === 0).map((d: any) => ({
                    time: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    usage: +(d.usage || 0),
                    balance: +(d.balance || 0),
                  }))

                  return (
                    <BarChart data={barData} margin={{ left: 8, right: 8 }} barCategoryGap="24%">
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} />
                      <ChartTooltip content={<ChartTooltipContent className="w-[220px]" />} />
                      <Bar dataKey="balance" fill="#10B981" barSize={24} radius={6} />
                      <Bar dataKey="usage" fill="#EF4444" barSize={24} radius={6} />
                    </BarChart>
                  )
                })()}
              </ChartContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 p-3">
              {chartData && chartData.length > 0 ? (
                (() => {
                  const last = chartData[chartData.length - 1]
                  return (
                    <>
                      <div className="flex items-center gap-2 px-3 py-1 border rounded text-sm bg-white">
                        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-balance, #60a5fa)' }} />
                        <div>
                          <div className="text-xs text-gray-600">Balance</div>
                          <div className="font-medium">{last.balance.toFixed(3)} L</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 border rounded text-sm bg-white">
                        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-usage, #fb7185)' }} />
                        <div>
                          <div className="text-xs text-gray-600">Usage</div>
                          <div className="font-medium">{(last.usage ?? 0).toFixed(3)} L</div>
                        </div>
                      </div>
                    </>
                  )
                })()
              ) : (
                <div className="text-sm text-gray-400">No chart data</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Link to="/dashboard/wallet" className="block">
            <Card className="bg-linear-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-200 cursor-pointer border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-blue-100 text-sm font-medium mb-1">Quick Top-up</div>
                    <div className="text-2xl font-bold">Add Water</div>
                    <div className="text-blue-100 text-sm mt-2">Instant recharge • 2% service fees</div>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full"><Plus className="h-6 w-6" /></div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Current Balance card (duplicate purposely shown here for layout parity) */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><Droplet className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Current Balance</div>
                    <div className="text-2xl font-bold text-gray-900">{waterReading?.balance.toFixed(1)} L</div>
                  </div>
                </div>
                <Badge className={color === 'red' ? 'bg-red-100 text-red-800' : color === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}>{status}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Meter Settings - opens same dialog as above */}
          <Card className="bg-linear-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700 transition-all duration-200 cursor-pointer border-0">
            <CardContent className="p-6" onClick={() => setShowConfigOpen(true)}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-purple-100 text-sm font-medium mb-1">Meter Settings</div>
                  <div className="text-2xl font-bold">Configure</div>
                  <div className="text-purple-100 text-sm mt-2">Thresholds • Auto-top-up • Limits</div>
                </div>
                <div className="bg-white/20 p-3 rounded-full"><Settings className="h-6 w-6" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Meter Thresholds */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Meter Thresholds</CardTitle>
            <CardDescription>Current configuration settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center flex-wrap gap-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 bg-blue-500 rounded" />
                  <div>
                    <div className="text-sm font-medium text-gray-700">Low Threshold</div>
                    <div className="text-lg font-bold text-gray-900">{waterMeter?.lowThreshold ?? 50} L</div>
                  </div>
                </div>
                <Badge variant="outline" className="bg-white">Warning</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 bg-red-500 rounded" />
                  <div>
                    <div className="text-sm font-medium text-gray-700">Critical Threshold</div>
                    <div className="text-lg font-bold text-gray-900">{waterMeter?.criticalThreshold ?? 10} L</div>
                  </div>
                </div>
                <Badge variant="outline" className="bg-white text-red-700">Alert</Badge>
              </div>

              {waterMeter?.usageLimit && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 bg-gray-500 rounded" />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Usage Limit</div>
                      <div className="text-lg font-bold text-gray-900">{waterMeter.usageLimit} L</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-white">Limit</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Critical Alert */}
        {color === 'red' && (
          <Card className="border-red-200 bg-red-50 border-l-4 border-l-red-500 mt-6">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-red-800 text-lg">Critical Balance Alert</div>
                  <div className="text-red-700">Your water balance is critically low at {waterReading?.balance.toFixed(1)} L. Top up immediately to avoid service interruption.</div>
                </div>
                <Link to="/dashboard/wallet"><Button className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"><Droplet className="h-4 w-4 mr-2" />Emergency Top-up</Button></Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Configuration dialog */}
        <Dialog open={showConfigOpen} onOpenChange={setShowConfigOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Water Meter Configuration</DialogTitle>
              <DialogDescription>Adjust low/critical thresholds, auto top-up and usage limits for this meter.</DialogDescription>
            </DialogHeader>

            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!waterMeter || !user) return
              const errors: any = {}
              const low = Number(cfgLowThreshold || 0)
              const crit = Number(cfgCriticalThreshold || 0)
              const usage = cfgUsageLimit === '' ? null : Number(cfgUsageLimit)
              if (isNaN(low) || low < 0) errors.lowThreshold = 'Low threshold must be a non-negative number.'
              if (isNaN(crit) || crit < 0) errors.criticalThreshold = 'Critical threshold must be a non-negative number.'
              if (!errors.lowThreshold && !errors.criticalThreshold && crit >= low) errors.criticalThreshold = 'Critical threshold must be less than Low threshold.'
              if (usage !== null && (isNaN(usage) || usage <= 0)) errors.usageLimit = 'Usage limit must be a positive number.'
              if (Object.keys(errors).length) { setFormErrors(errors); return }
              try {
                const updates: any = { lowThreshold: low, criticalThreshold: crit, autoPurchase: Boolean(cfgAutoPurchase) }
                if (usage !== null) updates.usageLimit = usage
                await updateDoc(doc(db, 'water_meters', waterMeter.id), updates)
                queryClient.invalidateQueries({ queryKey: ['water-meter', user.uid] })
                setShowConfigOpen(false)
              } catch (err) { console.error('Failed to save config', err) }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Low Threshold (L)</label>
                  <input type="number" step="0.1" value={cfgLowThreshold} onChange={(e) => { setCfgLowThreshold(e.target.value === '' ? '' : Number(e.target.value)); setFormErrors((s) => ({ ...s, lowThreshold: undefined })) }} className={`w-full p-2 border rounded ${formErrors.lowThreshold ? 'border-red-400' : ''}`} />
                  {formErrors.lowThreshold && <div className="text-xs text-red-600 mt-1">{formErrors.lowThreshold}</div>}
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Critical Threshold (L)</label>
                  <input type="number" step="0.1" value={cfgCriticalThreshold} onChange={(e) => { setCfgCriticalThreshold(e.target.value === '' ? '' : Number(e.target.value)); setFormErrors((s) => ({ ...s, criticalThreshold: undefined })) }} className={`w-full p-2 border rounded ${formErrors.criticalThreshold ? 'border-red-400' : ''}`} />
                  {formErrors.criticalThreshold && <div className="text-xs text-red-600 mt-1">{formErrors.criticalThreshold}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <input id="autoPurchaseWater" type="checkbox" checked={cfgAutoPurchase} onChange={(e) => setCfgAutoPurchase(e.target.checked)} className="rounded" />
                  <label htmlFor="autoPurchaseWater" className="text-sm text-gray-700">Enable Auto Top-up</label>
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Usage Limit (optional)</label>
                  <input type="number" step="0.1" value={cfgUsageLimit} onChange={(e) => { setCfgUsageLimit(e.target.value === '' ? '' : Number(e.target.value)); setFormErrors((s) => ({ ...s, usageLimit: undefined })) }} className={`w-full p-2 border rounded ${formErrors.usageLimit ? 'border-red-400' : ''}`} />
                  {formErrors.usageLimit && <div className="text-xs text-red-600 mt-1">{formErrors.usageLimit}</div>}
                </div>
              </div>

              <DialogFooter className="mt-6">
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default WaterDashboard
