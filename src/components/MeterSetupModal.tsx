import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { db,auth } from '../config/firebase'
import { 
  collection, 
  addDoc, 
  doc, 
  writeBatch,
  Timestamp 
} from 'firebase/firestore'
import { useQueryClient } from '@tanstack/react-query'

interface MeterSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onSetupComplete: () => void
}

export function MeterSetupModal({ isOpen, onClose, onSetupComplete }: MeterSetupModalProps) {
  const [electricityMeter, setElectricityMeter] = useState('')
  const [waterMeter, setWaterMeter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [allowClose, setAllowClose] = useState(false)
  const queryClient = useQueryClient()

  // Validation rules: South African meters commonly use 11-digit numeric IDs
  const sanitize = (s: string) => s.replace(/\D/g, '')
  const electricityDigits = sanitize(electricityMeter).length
  const waterDigits = sanitize(waterMeter).length
  const isElectricityValid = electricityDigits === 11
  const isWaterValid = waterDigits === 11

  const generateRandomBalance = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const sanitizedElectricity = electricityMeter.replace(/\D/g, '').trim()
    const sanitizedWater = waterMeter.replace(/\D/g, '').trim()

    if (!sanitizedElectricity || !sanitizedWater) {
      setError('Please enter both meter numbers')
      setLoading(false)
      return
    }

    // Enforce 11 digits for both meters (common rule in SA)
    if (sanitizedElectricity.length !== 11 || sanitizedWater.length !== 11) {
      setError('Meter numbers must be 11 digits long')
      setLoading(false)
      return
    }

    const user = auth.currentUser
    if (!user) {
      setError('User not authenticated')
      setLoading(false)
      return
    }

    try {
      // Create electricity meter
      const electricityMeterRef = await addDoc(collection(db, 'electricity_meters'), {
        userId: user.uid,
        meterNumber: sanitizedElectricity,
        isActive: true,
        lowThreshold: 50,
        criticalThreshold: 10,
        autoPurchase: false,
        createdAt: Timestamp.now()
      })

      // Create initial electricity reading with random balance
      const electricityBalance = generateRandomBalance(100, 800)
      await addDoc(collection(db, 'meter_readings'), {
        userId: user.uid,
        meterType: 'electricity',
        meterId: electricityMeterRef.id,
        balance: electricityBalance,
        timestamp: Timestamp.now(),
        isSimulated: true
      })

      // Create water meter
      const waterMeterRef = await addDoc(collection(db, 'water_meters'), {
        userId: user.uid,
        meterNumber: sanitizedWater,
        isActive: true,
        lowThreshold: 20,
        criticalThreshold: 5,
        autoPurchase: false,
        createdAt: Timestamp.now()
      })

      // Create initial water reading with random balance
      const waterBalance = generateRandomBalance(100, 800)
      await addDoc(collection(db, 'meter_readings'), {
        userId: user.uid,
        meterType: 'water',
        meterId: waterMeterRef.id,
        balance: waterBalance,
        timestamp: Timestamp.now(),
        isSimulated: true
      })

      // Initialize user wallet and record transaction (batched write)
      // Ensure credited wallet amount does not exceed R250 per policy
      const userRef = doc(db, 'users', user.uid)
      const batch = writeBatch(db)

      // Set (or merge) the user's wallet balance to R250
      batch.set(userRef, {
        walletBalance: 250,
        createdAt: Timestamp.now()
      }, { merge: true })

      // Create a transactions record describing the initial credit
      const transactionRef = doc(collection(db, 'transactions'))
      batch.set(transactionRef, {
        userId: user.uid,
        type: 'credit',
        amount: 250,
        description: 'Initial wallet credit (setup)',
        timestamp: Timestamp.now(),
        meta: { source: 'meter_setup' }
      })

      // Commit both writes atomically
      await batch.commit()

      // Invalidate ALL queries to trigger refetch across the app
      queryClient.invalidateQueries()

  // Allow the dialog to be closed programmatically now that setup succeeded
  setAllowClose(true)
  onSetupComplete()
  onClose()
      
    } catch (err) {
      console.error('Error setting up meters:', err)
      setError('Failed to set up meters. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Prevent backdrop/Esc close unless setup completed (allowClose will be true)
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // only allow the parent to close if we flagged allowClose (after successful setup)
      if (allowClose) onClose()
      // otherwise ignore attempts to close so modal stays open until setup
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Up Your Utility Meters</DialogTitle>
          <DialogDescription>
            Welcome! Let's get your utility meters set up. Enter your meter numbers below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="electricity-meter">Electricity Meter Number</Label>
            <Input
              id="electricity-meter"
              inputMode="numeric"
              type="text"
              placeholder="11 digits, numbers only"
              value={electricityMeter}
              onChange={(e) => setElectricityMeter(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              required
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Found on your electricity meter or utility bill</p>
              <p className={`text-xs font-medium ${isElectricityValid ? 'text-green-600' : 'text-gray-500'}`}>
                {sanitize(electricityMeter).length} / 11
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              <li className={`${isElectricityValid ? 'text-green-600' : 'text-gray-500'}`}>
                {isElectricityValid ? '✓' : '○'} 11 numeric digits
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="water-meter">Water Meter Number</Label>
            <Input
              id="water-meter"
              inputMode="numeric"
              type="text"
              placeholder="11 digits, numbers only"
              value={waterMeter}
              onChange={(e) => setWaterMeter(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              required
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Found on your water meter or utility bill</p>
              <p className={`text-xs font-medium ${isWaterValid ? 'text-green-600' : 'text-gray-500'}`}>
                {sanitize(waterMeter).length} / 11
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              <li className={`${isWaterValid ? 'text-green-600' : 'text-gray-500'}`}>
                {isWaterValid ? '✓' : '○'} 11 numeric digits
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
            <h4 className="text-sm font-medium text-blue-800 mb-1">What happens next?</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Random initial balances will be generated (100-800 units)</li>
              <li>• Your wallet will be credited (capped at R250)</li>
              <li>• Utility consumption simulation will begin</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <div className="text-xs text-gray-500">
              Please enter valid 11-digit numeric meter numbers for both electricity and water. The dialog cannot be dismissed until setup completes.
            </div>
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={loading || !(isElectricityValid && isWaterValid)}
                className="flex-1"
              >
                {loading ? 'Setting Up...' : 'Save Meters'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}