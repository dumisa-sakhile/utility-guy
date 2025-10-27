import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { auth, db } from '../../../config/firebase'
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import toast from 'react-hot-toast'
import { Check } from 'lucide-react'

export const Route = createFileRoute('/dashboard/utilities/water')({
  component: WaterPage,
})

const PRICE_PER_LITER = 0.02 // ZAR per liter (example)
const COMMISSION_RATE = 0.05

function WaterPage() {
  const user = auth.currentUser
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')

  const { data: userData } = useQuery({
    queryKey: ['user-wallet', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(collection(db, 'users'), where('__name__', '==', user.uid))
      const s = await getDocs(q)
      if (s.empty) return null
      return { id: s.docs[0].id, ...(s.docs[0].data() as any) } as any
    },
    enabled: !!user,
  })

  const { data: reading } = useQuery({
    queryKey: ['water-reading', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(collection(db, 'meter_readings'), where('userId', '==', user.uid), where('meterType', '==', 'water'))
      const s = await getDocs(q)
      if (s.empty) return null
      return { id: s.docs[0].id, ...(s.docs[0].data() as any) } as any
    },
    enabled: !!user,
  })

  const { data: meter } = useQuery({
    queryKey: ['water-meter', user?.uid],
    queryFn: async () => {
      if (!user) return null
      const q = query(collection(db, 'water_meters'), where('userId', '==', user.uid))
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
      const liters = parseFloat((netAmount / PRICE_PER_LITER).toFixed(3))

      if ((userData.walletBalance || 0) < grossAmount) {
        throw new Error('Insufficient wallet balance')
      }

  const newBalance = parseFloat(((userData.walletBalance || 0) - grossAmount).toFixed(2))

      const batch = writeBatch(db)

      batch.set(doc(collection(db, 'transactions')), {
        userId: user.uid,
        type: 'credit', // wallet top-up would be credit; here we record a purchase as 'purchase'
        amount: -netAmount,
        grossAmount,
        netAmount,
        serviceFee,
        description: `Purchase ${liters} L of water`,
        status: 'completed',
        timestamp: serverTimestamp(),
        meterType: 'water',
        units: liters,
        balanceAfter: newBalance
      })

      batch.set(doc(collection(db, 'transactions')), {
        userId: user.uid,
        type: 'service_fee',
        amount: -serviceFee,
        description: `Service fee (${COMMISSION_RATE * 100}%)`,
        status: 'completed',
        timestamp: serverTimestamp(),
        balanceAfter: newBalance
      })

      batch.update(doc(db, 'users', user.uid), { walletBalance: newBalance, updatedAt: serverTimestamp() })
      batch.update(doc(db, 'meter_readings', reading.id), {
        balance: parseFloat((reading.balance + liters).toFixed(3)),
        timestamp: serverTimestamp(),
        lastTopUp: { liters, grossAmount, serviceFee }
      })

      await batch.commit()
      return { newBalance, liters }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-wallet', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['water-reading', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', user?.uid] })
      setAmount('')
      toast.success('Purchase completed')
    }
  })

  const computed = (() => {
    const a = parseFloat(amount || '0')
    const serviceFee = parseFloat((a * COMMISSION_RATE).toFixed(2))
    const net = parseFloat((a - serviceFee).toFixed(2))
    const liters = a > 0 ? parseFloat((net / PRICE_PER_LITER).toFixed(3)) : 0
    return { gross: a, serviceFee, net, liters }
  })()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Water Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Buy Water (Liters)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="amount">Amount (R)</Label>
                  <Input id="amount" type="number" placeholder="50.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>

                <div className="p-3 bg-gray-50 rounded">
                  <div className="flex justify-between text-sm"><span>Gross</span><span>R {computed.gross.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span>Service fee ({COMMISSION_RATE * 100}%)</span><span>-R {computed.serviceFee.toFixed(2)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-2"><span>Net for liters</span><span>R {computed.net.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm mt-2"><span>Estimated liters</span><span>{computed.liters} L</span></div>
                </div>

                <div className="flex gap-3 items-center">
                  <Button onClick={() => purchaseMutation.mutate(parsedFloatSafe(amount))} disabled={purchaseMutation.isPending || !amount || !userData}>
                    {purchaseMutation.isPending ? 'Processing...' : 'Purchase from Wallet'}
                  </Button>
                  {purchaseMutation.isSuccess && (
                    <div className="inline-flex items-center text-green-600 text-sm">
                      <Check className="h-4 w-4 mr-1" />
                      Success
                    </div>
                  )}
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
                <div className="font-medium">Current balance: <span className="text-lg">{reading?.balance ?? 'N/A'} L</span></div>
                <div>Last updated: {reading?.timestamp?.toDate ? reading.timestamp.toDate().toLocaleString() : 'N/A'}</div>
                {meter?.usageLimit != null && (
                  <div className="text-xs text-gray-500 mt-2">Current limit: {meter.usageLimit} L</div>
                )}
                {meter?.isPaused != null && (
                  <div className="text-xs text-gray-500 mt-1">Meter is currently: {meter.isPaused ? 'Paused' : 'Active'}</div>
                )}
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
