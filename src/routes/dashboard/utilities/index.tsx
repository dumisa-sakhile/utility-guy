import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { auth, db } from '../../../config/firebase'
import { collection, query, where, getDocs, limit, doc, writeBatch, Timestamp, updateDoc } from 'firebase/firestore'
import { Button } from '../../../components/ui/button'
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
  const [limitValue, setLimitValue] = useState('')

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
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', user?.uid] })
      setAmount('')
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['electricity-meter', user?.uid] })
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

  const computed = (() => {
    const a = parseFloat(amount || '0')
    const serviceFee = parseFloat((a * COMMISSION_RATE).toFixed(2))
    const net = parseFloat((a - serviceFee).toFixed(2))
    const units = a > 0 ? parseFloat((net / PRICE_PER_KWH).toFixed(3)) : 0
    return { gross: a, serviceFee, net, units }
  })()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Electricity Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Buy Electricity Units</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="amount">Amount (R)</Label>
                  <Input id="amount" type="number" placeholder="100.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>

                <div className="p-3 bg-gray-50 rounded">
                  <div className="flex justify-between text-sm"><span>Gross</span><span>R {computed.gross.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span>Service fee ({COMMISSION_RATE * 100}%)</span><span>-R {computed.serviceFee.toFixed(2)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-2"><span>Net for units</span><span>R {computed.net.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm mt-2"><span>Estimated units</span><span>{computed.units} kWh</span></div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => purchaseMutation.mutate(parsedFloatSafe(amount))} disabled={purchaseMutation.isPending || !amount || !userData}>
                    {purchaseMutation.isPending ? 'Processing...' : 'Purchase from Wallet'}
                  </Button>
                  <div className="text-sm text-gray-600">Available: R {userData?.walletBalance?.toFixed(2) || '0.00'}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Meter Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>Current balance: {reading?.balance ?? 'N/A'} kWh</div>
                <div>Last updated: {reading?.timestamp?.toDate ? reading.timestamp.toDate().toLocaleString() : 'N/A'}</div>

                <div className="pt-4">
                  <Label htmlFor="usage-limit">Usage Limit (kWh)</Label>
                  <Input id="usage-limit" type="number" placeholder="e.g. 500" value={limitValue} onChange={(e) => setLimitValue(e.target.value)} />
                  <div className="flex gap-2 mt-2">
                    <Button onClick={() => setLimitMutation.mutate(parsedFloatSafe(limitValue))} disabled={setLimitMutation.isPending || !meter}>
                      {setLimitMutation.isPending ? 'Saving...' : 'Set Limit'}
                    </Button>
                    <Button variant="outline" onClick={() => togglePauseMutation.mutate(!(meter?.isPaused))} disabled={togglePauseMutation.isPending || !meter}>
                      {meter?.isPaused ? 'Resume Meter' : 'Pause Meter'}
                    </Button>
                  </div>
                  {meter?.usageLimit != null && (
                    <div className="text-xs text-gray-500 mt-2">Current limit: {meter.usageLimit} kWh</div>
                  )}
                  {meter?.isPaused != null && (
                    <div className="text-xs text-gray-500 mt-1">Meter is currently: {meter.isPaused ? 'Paused' : 'Active'}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function parsedFloatSafe(v: string) {
  const n = parseFloat(v || '0')
  return Number.isFinite(n) ? n : 0
}
