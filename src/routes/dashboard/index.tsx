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
import { 
  Zap,  
  Play, 
  Pause, 
  
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  Settings,
  
} from 'lucide-react'
import { useSimulationStore } from '../../lib/simulationStore'

export const Route = createFileRoute('/dashboard/')({
  component: ElectricityDashboard,
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

interface ElectricityMeter {
  id: string
  meterNumber: string
  lowThreshold: number
  criticalThreshold: number
  isActive: boolean
  autoPurchase: boolean
  usageLimit?: number
  isPaused?: boolean
}

function ElectricityDashboard() {
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

  // Fetch latest electricity reading
  const { data: electricityReading, isPending: readingLoading, refetch: refetchReading } = useQuery({
    queryKey: ['electricity-reading', user?.uid],
    queryFn: async () => {
      if (!user) return null
      
      const q = query(
        collection(db, 'meter_readings'),
        where('userId', '==', user.uid),
        where('meterType', '==', 'electricity'),
        orderBy('timestamp', 'desc'),
        limit(1)
      )
      
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      
      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      } as MeterReading
    },
    enabled: !!user,
  })

  // Fetch electricity meter configuration
  const { data: electricityMeter, isPending: meterLoading } = useQuery({
    queryKey: ['electricity-meter', user?.uid],
    queryFn: async () => {
      if (!user) return null
      
      const q = query(
        collection(db, 'electricity_meters'),
        where('userId', '==', user.uid),
        limit(1)
      )
      
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      
      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      } as ElectricityMeter
    },
    enabled: !!user,
  })

  // Fetch recent electricity transactions
  const { data: recentTransactions } = useQuery({
    queryKey: ['electricity-transactions', user?.uid],
    queryFn: async () => {
      if (!user) return []
      
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', user.uid),
        where('meterType', '==', 'electricity'),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[]
    },
    enabled: !!user,
  })

  // Build estimated timeseries for the last N minutes using latest reading + purchases
  const chartWindowMinutes = 60 // show last 60 minutes
  const stepSeconds = 30

  const chartData = useMemo(() => {
    if (!electricityReading) return []

    const now = new Date()
    const windowStart = new Date(now.getTime() - chartWindowMinutes * 60 * 1000)

    const readingTime = electricityReading.timestamp?.toDate ? electricityReading.timestamp.toDate() : new Date()

    // consumption per second estimated from lastDecrement (kWh per 30s) or fallback
    const lastDec = electricityReading.lastDecrement ?? 0.2
    const consumptionPerSec = lastDec / stepSeconds

    // Collect purchases (units) within window
    const purchases = (recentTransactions || [])
      .filter((t: any) => t.type === 'purchase' && t.units)
      .map((t: any) => ({
        time: t.timestamp?.toDate ? t.timestamp.toDate() : new Date(),
        units: t.units,
        id: t.id,
        amount: t.amount,
      }))

    // Sum purchases between two times helper
    const sumPurchasesBetween = (from: Date, to: Date) => {
      return purchases
        .filter((p) => p.time > from && p.time <= to)
        .reduce((s, p) => s + (p.units || 0), 0)
    }

    // Calculate starting balance at windowStart by rolling backward from readingTime
    const secsBetween = Math.max(0, (readingTime.getTime() - windowStart.getTime()) / 1000)
    const consumptionSinceWindowStart = consumptionPerSec * secsBetween
    const purchasesSinceWindowStart = sumPurchasesBetween(windowStart, readingTime)

    let balanceAtWindowStart = parseFloat(
      (electricityReading.balance + consumptionSinceWindowStart - purchasesSinceWindowStart).toFixed(3)
    )

    const points: Array<any> = []
    const markers: Array<any> = []

    // iterate forward from windowStart to now in stepSeconds
    const steps = Math.ceil((now.getTime() - windowStart.getTime()) / (stepSeconds * 1000))
    let currentTime = new Date(windowStart)
    let currentBalance = balanceAtWindowStart

    // Track net usage (consumption minus purchases) starting at 0
    let usageNet = 0

    for (let i = 0; i <= steps; i++) {
      // apply any purchases that occurred at this time (<= currentTime)
      const purchasesNow = purchases.filter((p) => Math.abs(p.time.getTime() - currentTime.getTime()) < stepSeconds * 1000)
      if (purchasesNow.length) {
        purchasesNow.forEach((p) => {
          // purchases increase balance and reduce net usage
          currentBalance = parseFloat((currentBalance + p.units).toFixed(3))
          usageNet = Math.max(0, parseFloat((usageNet - p.units).toFixed(3)))
          // add marker for this purchase
          markers.push({ time: currentTime.toISOString(), balance: currentBalance, id: p.id, units: p.units })
        })
      }

      // push point with both balance and net usage (usage increases as balance drops)
      points.push({ time: currentTime.toISOString(), balance: parseFloat(currentBalance.toFixed(3)), usage: parseFloat(usageNet.toFixed(3)) })

      // advance time: consumption increases net usage and reduces balance
      currentTime = new Date(currentTime.getTime() + stepSeconds * 1000)
      usageNet = parseFloat((usageNet + consumptionPerSec * stepSeconds).toFixed(3))
      currentBalance = parseFloat((currentBalance - consumptionPerSec * stepSeconds).toFixed(3))
    }

    // compute special markers: start, 25%, mid, 75%, end — include horizontal offsets to avoid label overlap
    const special: Array<any> = []
    if (points.length) {
      const lastIndex = points.length - 1
      const idx = (n: number) => Math.min(lastIndex, Math.max(0, Math.round(n)))
      const indices = [0, Math.floor(lastIndex * 0.25), Math.floor(lastIndex * 0.5), Math.floor(lastIndex * 0.75), lastIndex]
      const labels = ['Start', '25%', 'Mid', '75%', 'End']
      // offsets: move 25% left, 75% right to reduce overlap
      const dxs = [0, -24, 0, 24, 0]
      indices.forEach((i, j) => {
        const p = points[idx(i)]
        special.push({ time: p.time, balance: p.balance, label: labels[j], dx: dxs[j] })
      })
    }

    return points
  }, [electricityReading, recentTransactions])

  const chartConfig = {
    balance: { label: 'Balance (kWh)', color: 'var(--color-balance, #2563eb)' },
    usage: { label: 'Usage (kWh)', color: 'var(--color-usage, #ef4444)' },
  }

  // Configuration modal state
  const [showConfigOpen, setShowConfigOpen] = useState(false)
  const [cfgLowThreshold, setCfgLowThreshold] = useState<number | ''>('')
  const [cfgCriticalThreshold, setCfgCriticalThreshold] = useState<number | ''>('')
  const [cfgAutoPurchase, setCfgAutoPurchase] = useState<boolean>(false)
  const [cfgUsageLimit, setCfgUsageLimit] = useState<number | ''>('')
  const [formErrors, setFormErrors] = useState<{ lowThreshold?: string; criticalThreshold?: string; usageLimit?: string }>({})

  useEffect(() => {
    if (!electricityMeter) return
    setCfgLowThreshold(electricityMeter.lowThreshold ?? '')
    setCfgCriticalThreshold(electricityMeter.criticalThreshold ?? '')
    setCfgAutoPurchase(!!electricityMeter.autoPurchase)
    setCfgUsageLimit(electricityMeter.usageLimit ?? '')
  }, [electricityMeter])

  // Auto-decrement simulation
  useEffect(() => {
    if (!user || !electricityReading || !electricityMeter || !simulationActive || electricityMeter.isPaused || !electricityReading.id) return

    const interval = setInterval(async () => {
      try {
        const decrement = Math.random() * 0.4 + 0.1
        const newBalance = Math.max(0, electricityReading.balance - decrement)
        
        await updateDoc(doc(db, 'meter_readings', electricityReading.id), {
          balance: parseFloat(newBalance.toFixed(3)),
          timestamp: Timestamp.now(),
          lastDecrement: parseFloat(decrement.toFixed(3))
        })

        setLastDecrement(new Date())
        setNextUpdate(30)
        
        queryClient.invalidateQueries({ queryKey: ['electricity-reading', user.uid] })
        queryClient.invalidateQueries({ queryKey: ['electricity-transactions', user.uid] })

      } catch (error) {
        console.error('Error in simulation:', error)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [user, electricityReading, electricityMeter, simulationActive, queryClient])

  // Real-time updates
  useEffect(() => {
    if (!user) return

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'meter_readings'),
        where('userId', '==', user.uid),
        where('meterType', '==', 'electricity'),
        orderBy('timestamp', 'desc'),
        limit(1)
      ),
      () => {
        queryClient.invalidateQueries({ queryKey: ['electricity-reading', user.uid] })
      }
    )

    return () => unsubscribe()
  }, [user, queryClient])

  // Calculate status and color
  const getElectricityStatus = () => {
    if (!electricityReading || !electricityMeter) return { status: 'unknown', color: 'gray' as const }
    
    const balance = electricityReading.balance
    
    if (balance <= electricityMeter.criticalThreshold) {
      return { status: 'Critical', color: 'red' as const }
    } else if (balance <= electricityMeter.lowThreshold) {
      return { status: 'Low', color: 'amber' as const }
    } else {
      return { status: 'Good', color: 'green' as const }
    }
  }

  // Estimate time remaining
  const getEstimatedTimeRemaining = () => {
    if (!electricityReading?.balance) return 'N/A'
    
    const avgDailyConsumption = 12
    const hoursRemaining = (electricityReading.balance / avgDailyConsumption) * 24
    
    if (hoursRemaining < 24) {
      return `${Math.round(hoursRemaining)} hours`
    } else {
      return `${Math.round(hoursRemaining / 24)} days`
    }
  }

  // usageMetrics removed — not needed for the reordered dashboard cards

  const { status, color } = getElectricityStatus()
  const isPending = readingLoading || meterLoading

  // (special marker label renderer removed — markers are not used in the bar chart)

  if (isPending) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600">Loading electricity metrics...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen ">
      {/* Header */}
      <div className="">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Electricity Analytics</h1>
              <p className="text-gray-600 mt-1">Real-time monitoring and consumption insights</p>
            </div>
            <div className="flex items-center gap-3">
              
              <Button
                variant={simulationActive ? "destructive" : "default"}
                size="sm"
                onClick={() => setSimulationActive(!simulationActive)}
                className="flex items-center gap-2"
              >
                {simulationActive ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Resume
                  </>
                )}
              </Button>
              <Button
                
                size="sm"
                onClick={() => refetchReading()}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
       

         {/* Bottom Metrics Grid - Clean and Organized */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {/* Next Update (30s count) */}
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

          {/* Time Remaining Card */}
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

          {/* Current Balance Card */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Zap className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Current Balance</div>
                    <div className="text-2xl font-bold text-gray-900">{electricityReading?.balance.toFixed(1)} kWh</div>
                  </div>
                </div>
                <Badge className={
                  color === 'red' ? 'bg-red-100 text-red-800' :
                  color === 'amber' ? 'bg-amber-100 text-amber-800' :
                  'bg-green-100 text-green-800'
                }>
                  {status}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Meter Configuration (opens modal) */}
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
            <CardDescription>Line shows balance (blue) vs usage (red). Dots are purchases and special markers.</CardDescription>
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
            {/* Legend */}
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
                          <div className="font-medium">{last.balance.toFixed(3)} kWh</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 border rounded text-sm bg-white">
                        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-usage, #fb7185)' }} />
                        <div>
                          <div className="text-xs text-gray-600">Usage</div>
                          <div className="font-medium">{(last.usage ?? 0).toFixed(3)} kWh</div>
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

       
        {/* Top Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Quick Top-up */}
          <Link to="/dashboard/wallet" className="block">
            <Card className="bg-linear-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-200 cursor-pointer border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-blue-100 text-sm font-medium mb-1">Quick Top-up</div>
                    <div className="text-2xl font-bold">Add Electricity</div>
                    <div className="text-blue-100 text-sm mt-2">Instant recharge • 2% service fees</div>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <Plus className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* A single standalone dialog (triggered from the Meter Configuration card above) */}
          <Dialog open={showConfigOpen} onOpenChange={setShowConfigOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Meter Configuration</DialogTitle>
                <DialogDescription>
                  Adjust the meter settings below. Validation ensures values are sensible:
                  - Critical threshold must be lower than Low threshold.
                  - Values must be non-negative numbers.
                  - Usage limit, if set, must be positive.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={async (e) => {
                e.preventDefault()
                if (!electricityMeter || !user) return

                // validation
                const errors: any = {}
                const low = Number(cfgLowThreshold || 0)
                const crit = Number(cfgCriticalThreshold || 0)
                const usage = cfgUsageLimit === '' ? null : Number(cfgUsageLimit)

                if (isNaN(low) || low < 0) errors.lowThreshold = 'Low threshold must be a non-negative number.'
                if (isNaN(crit) || crit < 0) errors.criticalThreshold = 'Critical threshold must be a non-negative number.'
                if (!errors.lowThreshold && !errors.criticalThreshold && crit >= low) errors.criticalThreshold = 'Critical threshold must be less than Low threshold.'
                if (usage !== null && (isNaN(usage) || usage <= 0)) errors.usageLimit = 'Usage limit must be a positive number.'

                if (Object.keys(errors).length) {
                  // attach to local state so UI can show errors
                  setFormErrors(errors)
                  return
                }

                try {
                  const updates: any = {
                    lowThreshold: low,
                    criticalThreshold: crit,
                    autoPurchase: Boolean(cfgAutoPurchase),
                  }
                  if (usage !== null) updates.usageLimit = usage
                  await updateDoc(doc(db, 'electricity_meters', electricityMeter.id), updates)
                  queryClient.invalidateQueries({ queryKey: ['electricity-meter', user.uid] })
                  setShowConfigOpen(false)
                } catch (err) {
                  console.error('Failed to save config', err)
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1">Low Threshold (kWh)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={cfgLowThreshold} 
                      onChange={(e) => { setCfgLowThreshold(e.target.value === '' ? '' : Number(e.target.value)); setFormErrors((s) => ({ ...s, lowThreshold: undefined })) }} 
                      className={`w-full p-2 border rounded ${formErrors.lowThreshold ? 'border-red-400' : ''}`} 
                    />
                    {formErrors.lowThreshold && <div className="text-xs text-red-600 mt-1">{formErrors.lowThreshold}</div>}
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1">Critical Threshold (kWh)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={cfgCriticalThreshold} 
                      onChange={(e) => { setCfgCriticalThreshold(e.target.value === '' ? '' : Number(e.target.value)); setFormErrors((s) => ({ ...s, criticalThreshold: undefined })) }} 
                      className={`w-full p-2 border rounded ${formErrors.criticalThreshold ? 'border-red-400' : ''}`} 
                    />
                    {formErrors.criticalThreshold && <div className="text-xs text-red-600 mt-1">{formErrors.criticalThreshold}</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      id="autoPurchase" 
                      type="checkbox" 
                      checked={cfgAutoPurchase} 
                      onChange={(e) => setCfgAutoPurchase(e.target.checked)} 
                      className="rounded"
                    />
                    <label htmlFor="autoPurchase" className="text-sm text-gray-700">Enable Auto Top-up</label>
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1">Usage Limit (optional)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={cfgUsageLimit} 
                      onChange={(e) => { setCfgUsageLimit(e.target.value === '' ? '' : Number(e.target.value)); setFormErrors((s) => ({ ...s, usageLimit: undefined })) }} 
                      className={`w-full p-2 border rounded ${formErrors.usageLimit ? 'border-red-400' : ''}`} 
                    />
                    {formErrors.usageLimit && <div className="text-xs text-red-600 mt-1">{formErrors.usageLimit}</div>}
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit">Save Changes</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Bottom Action Cards */}
        <div className="">
        

          {/* Meter Thresholds Card */}
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
                      <div className="text-lg font-bold text-gray-900">{electricityMeter?.lowThreshold ?? 50} kWh</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-white">Warning</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 bg-red-500 rounded" />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Critical Threshold</div>
                      <div className="text-lg font-bold text-gray-900">{electricityMeter?.criticalThreshold ?? 10} kWh</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-white text-red-700">Alert</Badge>
                </div>

                {electricityMeter?.usageLimit && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-8 bg-gray-500 rounded" />
                      <div>
                        <div className="text-sm font-medium text-gray-700">Usage Limit</div>
                        <div className="text-lg font-bold text-gray-900">{electricityMeter.usageLimit} kWh</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-white">Limit</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Critical Alert */}
        {color === 'red' && (
          <Card className="border-red-200 bg-red-50 border-l-4 border-l-red-500 mt-6">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-red-800 text-lg">Critical Balance Alert</div>
                  <div className="text-red-700">
                    Your electricity balance is critically low at {electricityReading?.balance.toFixed(1)} kWh. 
                    Top up immediately to avoid service interruption.
                  </div>
                </div>
                <Link to="/dashboard/wallet">
                  <Button className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap">
                    <Zap className="h-4 w-4 mr-2" />
                    Emergency Top-up
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}