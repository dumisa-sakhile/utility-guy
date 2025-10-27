import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../../../config/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { useSimulationStore } from '../../../lib/simulationStore'

export const Route = createFileRoute('/dashboard/wallet/auto')({
  component: WalletAuto,
})

function WalletAuto() {
  const user = auth.currentUser
  const queryClient = useQueryClient()
  const { simulationActive } = useSimulationStore()

  const { data: meters } = useQuery({
    queryKey: ['user-meters', user?.uid],
    queryFn: async () => {
      if (!user) return []
      const q = query(collection(db, 'electricity_meters'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const em = snap.docs.map(d => ({ id: d.id, type: 'electricity', ...d.data() }))
      const q2 = query(collection(db, 'water_meters'), where('userId', '==', user.uid))
      const snap2 = await getDocs(q2)
      const wm = snap2.docs.map(d => ({ id: d.id, type: 'water', ...d.data() }))
      return [...em, ...wm]
    },
    enabled: !!user,
  })

  const [localMeters, setLocalMeters] = useState<any[]>([])

  useEffect(() => {
    if (!meters) return
    setLocalMeters(meters.map((m: any) => ({ ...m })))
  }, [meters])

  const saveMutation = useMutation({
    mutationFn: async ({ id, collectionName, updates }: any) => {
      await updateDoc(doc(db, collectionName, id), updates)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-meters', user?.uid] })
  })

  const toggleAuto = async (m: any) => {
    const collectionName = m.type === 'water' ? 'water_meters' : 'electricity_meters'
    const updates = { autoPurchase: !m.autoPurchase }
    saveMutation.mutate({ id: m.id, collectionName, updates })
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Auto Top-up</h1>
            <p className="text-gray-600">Configure automatic wallet top-ups per meter</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {localMeters.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle>{m.type === 'water' ? 'Water Meter' : 'Electricity Meter'}</CardTitle>
                <CardDescription className="text-sm">Meter #{m.meterNumber || m.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">Auto Top-up</div>
                    <Button variant={m.autoPurchase ? 'outline' : 'default'} size="sm" onClick={() => toggleAuto(m)}>{m.autoPurchase ? 'Enabled' : 'Disabled'}</Button>
                  </div>
                  <div>
                    <Label className="text-sm">Low Threshold</Label>
                    <Input value={m.lowThreshold ?? ''} readOnly />
                  </div>
                  <div>
                    <Label className="text-sm">Critical Threshold</Label>
                    <Input value={m.criticalThreshold ?? ''} readOnly />
                  </div>
                  <div>
                    <Label className="text-sm">Usage Limit (optional)</Label>
                    <Input value={m.usageLimit ?? ''} readOnly />
                  </div>
                  <div className="text-sm text-gray-500">Simulation: {simulationActive ? 'Running' : 'Paused'}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export default WalletAuto
