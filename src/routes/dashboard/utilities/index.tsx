import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { auth, db } from '../../../config/firebase'
import { collection, query, where, getDocs, limit, doc, writeBatch, Timestamp, updateDoc } from 'firebase/firestore'
import { Button } from '../../../components/ui/button'
import toast from 'react-hot-toast'
import { Check } from 'lucide-react'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'

export const Route = createFileRoute('/dashboard/utilities/')({
  component: ElectricityPage,
})

const PRICE_PER_KWH = 1.5 // ZAR per kWh
const COMMISSION_RATE = 0.05

function ElectricityPage() {
  const user = auth.currentUser
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  // Config UI state
  const [showConfig, setShowConfig] = useState(false)
  const [cfgLimitValue, setCfgLimitValue] = useState('')
  const [cfgAutoPause, setCfgAutoPause] = useState(false)

  // Fetch user wallet
  const { data: userData } = useQuery<any>({
    queryKey: ['user-wallet', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(collection(db, 'users'), where('__name__', '==', user.uid), limit(1))
      const s = await getDocs(q)
      if (s.empty) return null
      return { id: s.docs[0].id, ...(s.docs[0].data() as any) } as any
    },
    enabled: !!user,
  })

  // Fetch electricity meter reading
  const { data: reading } = useQuery<any>({
    queryKey: ['electricity-reading', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(collection(db, 'meter_readings'), where('userId', '==', user.uid), where('meterType', '==', 'electricity'), limit(1))
      const s = await getDocs(q)
      if (s.empty) return null
      return { id: s.docs[0].id, ...(s.docs[0].data() as any) } as any
    },
    enabled: !!user,
  })

  // Fetch electricity meter document (for settings like usageLimit and isPaused)
  const { data: meter } = useQuery<any>({
    queryKey: ['electricity-meter', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(collection(db, 'electricity_meters'), where('userId', '==', user.uid), limit(1))
      const s = await getDocs(q)
      if (s.empty) return null
      return { id: s.docs[0].id, ...(s.docs[0].data() as any) } as any
    },
    enabled: !!user,
  })

  const purchaseMutation = useMutation({
    mutationFn: async (grossAmount: number) => {
      if (!user || !userData) throw new Error('User not found')
      if (!reading) throw new Error('Meter reading not found')

      const serviceFee = parseFloat((grossAmount * COMMISSION_RATE).toFixed(2))
      const netAmount = parseFloat((grossAmount - serviceFee).toFixed(2))
      const units = parseFloat((netAmount / PRICE_PER_KWH).toFixed(3))

      if ((userData.walletBalance || 0) < grossAmount) {
        throw new Error('Insufficient wallet balance')
      }

      const userRef = doc(db, 'users', user.uid)
      const newBalance = parseFloat(((userData.walletBalance || 0) - grossAmount).toFixed(2))

      const batch = writeBatch(db)

      // Update user wallet
      batch.update(userRef, { walletBalance: newBalance, updatedAt: Timestamp.now() })

      // Record purchase (net amount) — negative because it's a debit
      const purchaseRef = doc(collection(db, 'transactions'))
      batch.set(purchaseRef, {
        userId: user.uid,
        type: 'purchase',
        amount: -netAmount,
        description: `Purchase ${units} kWh`,
        status: 'completed',
        timestamp: Timestamp.now(),
        meterType: 'electricity',
        units,
        serviceFee,
        grossAmount,
        netAmount,
        balanceAfter: newBalance
      })

      // Record service fee
      const feeRef = doc(collection(db, 'transactions'))
      batch.set(feeRef, {
        userId: user.uid,
        type: 'service_fee',
        amount: -serviceFee,
        description: `Service fee (${COMMISSION_RATE * 100}%)`,
        status: 'completed',
        timestamp: Timestamp.now(),
        balanceAfter: newBalance
      })

      // Update meter_readings (increment balance by units)
      const readingRef = doc(db, 'meter_readings', reading.id)
      batch.update(readingRef, {
        balance: parseFloat((reading.balance + units).toFixed(3)),
        timestamp: Timestamp.now(),
        lastTopUp: { units, grossAmount, serviceFee }
      })

      await batch.commit()
      return { newBalance, units }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-wallet', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['electricity-reading', user?.uid] })
      // transactions may be queried under different keys in various pages; invalidate common ones
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['transactions-history', user?.uid] })
      setAmount('')
      toast.success('Purchase completed')
    }
  })

  // Mutations to set usage limit and toggle pause state on the meter
  const setLimitMutation = useMutation({
    mutationFn: async (limitValue: number) => {
      if (!meter) throw new Error('Meter not found')
      await updateDoc(doc(db, 'electricity_meters', meter.id), {
        usageLimit: limitValue,
        updatedAt: Timestamp.now()
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['electricity-meter', user?.uid] })
      toast.success('Usage limit saved')
      setShowConfig(false)
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save limit')
    }
  })

  const togglePauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      if (!meter) throw new Error('Meter not found')
      await updateDoc(doc(db, 'electricity_meters', meter.id), {
        isPaused: paused,
        updatedAt: Timestamp.now()
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['electricity-meter', user?.uid] })
  })

  // Auto-pause when limit reached
  useEffect(() => {
    if (!meter || !reading) return
    const limit = meter.usageLimit
    if (limit == null) return
    const current = Number(reading.balance || 0)
    if (current >= limit && !meter.isPaused) {
      togglePauseMutation.mutate(true)
      toast.success('Meter paused — usage limit reached')
    }
  }, [meter, reading])

  const computed = (() => {
    const a = parseFloat(amount || '0')
    const serviceFee = parseFloat((a * COMMISSION_RATE).toFixed(2))
    const net = parseFloat((a - serviceFee).toFixed(2))
    const units = a > 0 ? parseFloat((net / PRICE_PER_KWH).toFixed(3)) : 0
    return { gross: a, serviceFee, net, units }
  })()

  const MAX_LIMIT = 1000000

  const handleSaveConfig = () => {
    const v = parseFloat(cfgLimitValue || '')
    if (!reading) return toast.error('No meter reading available')
    const current = Number(reading.balance || 0)
    if (isNaN(v) || v <= 0) return toast.error('Enter a valid limit')
    if (v < current) return toast.error('Limit cannot be less than current meter balance')
    if (v > MAX_LIMIT) return toast.error(`Limit cannot exceed ${MAX_LIMIT}`)
    setLimitMutation.mutate(v)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Electricity Management</h1>
            <p className="text-gray-600 mt-1">Buy units and manage your meter limits</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Purchase card */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Buy Electricity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="amount">Amount (R)</Label>
                  <Input id="amount" type="number" placeholder="100.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded">
                  <div>
                    <div className="text-sm text-gray-600">Gross</div>
                    <div className="font-semibold">R {computed.gross.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 mt-1">Service fee ({COMMISSION_RATE * 100}%)</div>
                    <div className="text-sm">-R {computed.serviceFee.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Net (for units)</div>
                    <div className="font-semibold">R {computed.net.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 mt-1">Estimated units</div>
                    <div className="text-sm">{computed.units} kWh</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Button
                    onClick={() => purchaseMutation.mutate(parsedFloatSafe(amount))}
                    disabled={
                      purchaseMutation.isPending ||
                      !amount ||
                      !userData ||
                      computed.gross <= 0 ||
                      (userData?.walletBalance || 0) < computed.gross
                    }
                  >
                    {purchaseMutation.isPending ? 'Processing...' : 'Purchase from Wallet'}
                  </Button>

                  {purchaseMutation.isSuccess && (
                    <div className="inline-flex items-center text-green-600 text-sm">
                      <Check className="h-4 w-4 mr-1" />
                      Success
                    </div>
                  )}

                  {(userData?.walletBalance || 0) < computed.gross && (
                    <div className="text-sm text-red-600">Insufficient wallet balance</div>
                  )}

                  <div className="ml-auto text-sm text-gray-600">Available: R {userData?.walletBalance?.toFixed(2) || '0.00'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Meter Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="font-medium">Current balance</div>
                  <div className="text-2xl">{reading?.balance ?? 'N/A'} kWh</div>
                  <div className="text-xs text-gray-500">Last updated: {reading?.timestamp?.toDate ? reading.timestamp.toDate().toLocaleString() : 'N/A'}</div>

                  <div className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">Usage Limit</div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>Configure</Button>
                        <Button variant="ghost" size="sm" onClick={() => togglePauseMutation.mutate(!(meter?.isPaused))} disabled={togglePauseMutation.isPending || !meter}>
                          {meter?.isPaused ? 'Resume' : 'Pause'}
                        </Button>
                      </div>
                    </div>

                    <div className="text-sm text-gray-700 mt-2">{meter?.usageLimit != null ? `${meter.usageLimit} kWh` : 'Not set'}</div>
                    {meter?.isPaused != null && (
                      <div className="text-xs text-gray-500">Meter: {meter.isPaused ? 'Paused' : 'Active'}</div>
                    )}

                    {showConfig && (
                      <div className="mt-3 space-y-2">
                        <Input id="usage-limit" type="number" placeholder="e.g. 500" value={cfgLimitValue} onChange={(e) => setCfgLimitValue(e.target.value)} />
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input id="autoPause" type="checkbox" checked={cfgAutoPause} onChange={(e) => setCfgAutoPause(e.target.checked)} />
                            Auto-pause when reached
                          </label>
                          <div className="ml-auto flex gap-2">
                            <Button onClick={handleSaveConfig} disabled={setLimitMutation.isPending}>Save</Button>
                            <Button variant="outline" onClick={() => setShowConfig(false)}>Cancel</Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Progress */}
                    {meter?.usageLimit != null && reading && (
                      <div className="mt-4 space-y-2">
                        <div className="text-xs text-gray-500">Progress to limit</div>
                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div className="bg-blue-500 h-3" style={{ width: `${Math.min(100, (Number(reading.balance || 0) / meter.usageLimit) * 100)}%` }} />
                        </div>
                        <div className="text-xs text-gray-500">Needed vs Available</div>
                        {(() => {
                          const need = Math.max(0, (meter.usageLimit || 0) - (reading.balance || 0))
                          const cost = need * PRICE_PER_KWH
                          const have = (userData?.walletBalance || 0)
                          const pct = cost <= 0 ? 100 : Math.min(100, (have / cost) * 100)
                          return (
                            <div>
                              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div className={`h-3 ${have >= cost ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <div className="text-xs text-gray-500">Needed: R {cost.toFixed(2)} — Available: R {have.toFixed(2)}</div>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['electricity-reading', user?.uid] })} variant="outline">Refresh Reading</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function parsedFloatSafe(v: string) {
  const n = parseFloat(v || '0')
  return Number.isFinite(n) ? n : 0
}
