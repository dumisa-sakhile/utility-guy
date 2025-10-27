import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { collection, query, where, orderBy, getDocs, doc, addDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../../../config/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../../components/ui/dialog'
import { Wallet, CreditCard, Plus, Trash2  } from 'lucide-react'

export const Route = createFileRoute('/dashboard/wallet/')({
  component: WalletDashboard,
})

interface User {
  id: string
  walletBalance: number
  email: string
  isActive?: boolean
  createdAt?: any
  updatedAt?: any
}

interface Transaction {
  id: string
  userId: string
  type: 'credit' | 'purchase' | 'topup' | 'service_fee'
  amount: number
  description: string
  status: 'completed' | 'pending' | 'failed'
  timestamp: any
  serviceFee?: number
  netAmount?: number
  grossAmount?: number
  balanceAfter?: number
}

interface PaymentMethod {
  id: string
  userId: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  cardholderName: string
  isDefault: boolean
  createdAt: any
  processorToken?: string
}

function WalletDashboard() {
  const user = auth.currentUser
  const queryClient = useQueryClient()
  const [addFundsOpen, setAddFundsOpen] = useState(false)
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [cardDetails, setCardDetails] = useState({
    number: '',
    expiry: '',
    cvv: '',
    name: '',
    processorToken: ''
  })

  const COMMISSION_RATE = 0.05

  // Fetch user data - follows security rules
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['user', user?.uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')
      
      const userDoc = await getDocs(query(
        collection(db, 'users'),
        where('__name__', '==', user.uid)
      ))
      
      if (userDoc.empty) {
        // Create user document if it doesn't exist (allowed by rules)
        
        const newUser = {
          walletBalance: 0,
          email: user.email,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
        
        // Note: We can't create here directly in queryFn, but the mutation will handle it
        return {
          id: user.uid,
          ...newUser
        } as User
      }
      
      const docData = userDoc.docs[0].data()
      return {
        id: userDoc.docs[0].id,
        walletBalance: docData.walletBalance || 0,
        email: docData.email || user.email,
        isActive: docData.isActive !== false,
        createdAt: docData.createdAt,
        updatedAt: docData.updatedAt
      } as User
    },
    enabled: !!user,
    retry: 1
  })

  // Fetch transactions - follows security rules (only user's own transactions)
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', user?.uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        orderBy('type', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[]
    },
    enabled: !!user,
    retry: 1
  })

  // Fetch payment cards - follows security rules (only user's own cards)
  const { data: paymentMethods, isLoading: paymentMethodsLoading } = useQuery({
    queryKey: ['payment-cards', user?.uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const q = query(
        collection(db, 'payment_cards'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          userId: data.userId,
          brand: data.brand,
          last4: data.last4,
          expMonth: data.expMonth,
          expYear: data.expYear,
          cardholderName: data.cardholderName,
          isDefault: data.isDefault || false,
          createdAt: data.createdAt,
          processorToken: data.processorToken
        } as PaymentMethod
      })
    },
    enabled: !!user,
    retry: 1
  })

  // Add funds mutation - creates transactions following security rules
  const addFundsMutation = useMutation({
    mutationFn: async (topupAmount: number) => {
      if (!user) throw new Error('Not authenticated')

      const serviceFee = topupAmount * COMMISSION_RATE
      const netAmount = topupAmount - serviceFee
      const currentBalance = userData?.walletBalance || 0
      const newBalance = currentBalance + netAmount

      const batch = writeBatch(db)

      // Update user wallet balance - allowed by rules
      batch.set(doc(db, 'users', user.uid), {
        walletBalance: newBalance,
        email: user.email,
        isActive: true,
        updatedAt: serverTimestamp(),
        ...(!userData && { createdAt: serverTimestamp() }) // Set createdAt only for new users
      }, { merge: true })

      // Create credit transaction - allowed by rules (userId matches auth.uid)
      const creditTransaction = {
        userId: user.uid,
        type: 'credit' as const,
        amount: netAmount,
        grossAmount: topupAmount,
        netAmount: netAmount,
        serviceFee: serviceFee,
        description: `Wallet top-up - R${topupAmount.toFixed(2)}`,
        status: 'completed' as const,
        timestamp: serverTimestamp(),
        balanceAfter: newBalance
      }

      const creditRef = doc(collection(db, 'transactions'))
      batch.set(creditRef, creditTransaction)

      // Create service fee transaction - allowed by rules (userId matches auth.uid)
      const feeTransaction = {
        userId: user.uid,
        type: 'service_fee' as const,
        amount: -serviceFee,
        description: `Service fee (${COMMISSION_RATE * 100}%) - R${topupAmount.toFixed(2)} top-up`,
        status: 'completed' as const,
        timestamp: serverTimestamp(),
        balanceAfter: newBalance,
        grossAmount: topupAmount,
        serviceFee: serviceFee
      }

      const feeRef = doc(collection(db, 'transactions'))
      batch.set(feeRef, feeTransaction)

      await batch.commit()
      return newBalance
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.uid] })
      setAddFundsOpen(false)
      setAmount('')
    },
    onError: (error) => {
      console.error('Failed to add funds:', error)
      alert('Failed to add funds. Please try again.')
    }
  })

  // Add card mutation - follows security rules (userId matches auth.uid)
  const addCardMutation = useMutation({
    mutationFn: async (cardData: typeof cardDetails) => {
      if (!user) throw new Error('Not authenticated')

      const last4 = cardData.number.slice(-4)
      const brand = getCardBrand(cardData.number)

      // Parse expiry date
      const [mm, yy] = cardData.expiry.split('/').map(s => s.trim())
      let expMonth = parseInt(mm) || 0
      let expYear = parseInt(yy) || 0
      if (expYear < 100) {
        expYear += 2000
      }

      // Check if this will be the first/default card
      const existingCards = await getDocs(query(
        collection(db, 'payment_cards'),
        where('userId', '==', user.uid)
      ))
      const isDefault = existingCards.empty

      const cardDoc = {
        userId: user.uid,
        brand,
        last4,
        expMonth,
        expYear,
        cardholderName: cardData.name,
        isDefault,
        createdAt: serverTimestamp(),
        processorToken: cardData.processorToken || null,
      }

      await addDoc(collection(db, 'payment_cards'), cardDoc)
      return cardDoc
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards', user?.uid] })
      setAddCardOpen(false)
      setCardDetails({ number: '', expiry: '', cvv: '', name: '', processorToken: '' })
    },
    onError: (error) => {
      console.error('Failed to add card:', error)
      alert('Failed to add card. Please try again.')
    }
  })

  // Delete card mutation - follows security rules (only user's own cards)
  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      if (!user) throw new Error('Not authenticated')
      await deleteDoc(doc(db, 'payment_cards', cardId))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards', user?.uid] })
    },
    onError: (error) => {
      console.error('Failed to delete card:', error)
      alert('Failed to delete card. Please try again.')
    }
  })

  // Helper functions
  const getCardBrand = (number: string) => {
    const cleaned = number.replace(/\D/g, '')
    if (/^4/.test(cleaned)) return 'Visa'
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard'
    if (/^3[47]/.test(cleaned)) return 'American Express'
    return 'Card'
  }

  const formatExpiry = (expMonth: number, expYear: number) => {
    return `${expMonth.toString().padStart(2, '0')}/${expYear.toString().slice(-2)}`
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown'
    return timestamp.toDate?.().toLocaleDateString('en-ZA') || 'Invalid date'
  }

  // Loading state
  const isLoading = userLoading || transactionsLoading || paymentMethodsLoading

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Wallet className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <div className="text-gray-600">Loading wallet data...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-600">Please sign in to access your wallet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallet</h1>
          <p className="text-gray-600">Manage your balance and payment methods</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Balance & Recent Transactions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Balance Card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Available Balance</div>
                  <div className="text-3xl font-bold text-gray-900">
                    R {userData?.walletBalance?.toFixed(2) || '0.00'}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Last updated: {userData?.updatedAt ? formatDate(userData.updatedAt) : 'Never'}
                  </div>
                </div>
                <Dialog open={addFundsOpen} onOpenChange={setAddFundsOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Funds
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Funds to Wallet</DialogTitle>
                      <DialogDescription>
                        Add money to your wallet. A {COMMISSION_RATE * 100}% service fee applies.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="amount">Amount (R)</Label>
                        <Input
                          id="amount"
                          type="number"
                          placeholder="100.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          min="1"
                          step="0.01"
                        />
                      </div>
                      {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
                        <div className="p-3 bg-gray-50 rounded-lg space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Amount:</span>
                            <span>R {parseFloat(amount).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-red-600">
                            <span>Service fee ({COMMISSION_RATE * 100}%):</span>
                            <span>-R {(parseFloat(amount) * COMMISSION_RATE).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-semibold border-t pt-2">
                            <span>Net amount added:</span>
                            <span>R {(parseFloat(amount) * (1 - COMMISSION_RATE)).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setAddFundsOpen(false)}
                        disabled={addFundsMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => addFundsMutation.mutate(parseFloat(amount))}
                        disabled={!amount || parseFloat(amount) <= 0 || addFundsMutation.isPending}
                      >
                        {addFundsMutation.isPending ? 'Processing...' : 'Add Funds'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* Recent Transactions Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions && transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">Date</th>
                        <th className="text-left py-3 px-2">Description</th>
                        <th className="text-left py-3 px-2">Type</th>
                        <th className="text-right py-3 px-2">Amount</th>
                        <th className="text-left py-3 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.slice(0, 5).map((transaction) => (
                        <tr key={transaction.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-2 whitespace-nowrap">
                            {formatDate(transaction.timestamp)}
                          </td>
                          <td className="py-3 px-2">
                            <div className="font-medium">{transaction.description}</div>
                            {transaction.serviceFee && transaction.serviceFee > 0 && (
                              <div className="text-xs text-gray-500">
                                Fee: R {transaction.serviceFee.toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.type === 'credit' ? 'bg-green-100 text-green-800' :
                              transaction.type === 'service_fee' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {transaction.type}
                            </span>
                          </td>
                          <td className={`py-3 px-2 text-right font-medium ${
                            transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {transaction.amount > 0 ? '+' : ''}R {Math.abs(transaction.amount).toFixed(2)}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.status === 'completed' ? 'bg-green-100 text-green-800' :
                              transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {transaction.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <div>No transactions yet</div>
                  <div className="text-sm mt-1">Add funds to get started</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentMethods && paymentMethods.length > 0 ? (
              paymentMethods.map((method) => (
                <div key={method.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-8 w-8 text-gray-400" />
                    <div>
                      <div className="font-medium">{method.brand} •••• {method.last4}</div>
                      <div className="text-sm text-gray-500">
                        Expires {formatExpiry(method.expMonth, method.expYear)}
                        {method.isDefault && <span className="ml-2 text-blue-600">• Default</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this card?')) {
                        deleteCardMutation.mutate(method.id)
                      }
                    }}
                    disabled={deleteCardMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500">
                <CreditCard className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <div>No payment methods added</div>
              </div>
            )}
            
            <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Card
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Payment Card</DialogTitle>
                  <DialogDescription>
                    Add a new card to your wallet for faster payments.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="card-number">Card Number</Label>
                    <Input
                      id="card-number"
                      placeholder="4242 4242 4242 4242"
                      value={cardDetails.number}
                      onChange={(e) => setCardDetails(prev => ({...prev, number: e.target.value.replace(/\s/g, '')}))}
                      maxLength={16}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="expiry">Expiry Date (MM/YY)</Label>
                      <Input
                        id="expiry"
                        placeholder="MM/YY"
                        value={cardDetails.expiry}
                        onChange={(e) => setCardDetails(prev => ({...prev, expiry: e.target.value}))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        placeholder="123"
                        value={cardDetails.cvv}
                        onChange={(e) => setCardDetails(prev => ({...prev, cvv: e.target.value.replace(/\D/g, '')}))}
                        maxLength={4}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="name">Cardholder Name</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={cardDetails.name}
                      onChange={(e) => setCardDetails(prev => ({...prev, name: e.target.value}))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="processor-token">Processor Token (Optional)</Label>
                    <Input
                      id="processor-token"
                      placeholder="tok_xxx"
                      value={cardDetails.processorToken}
                      onChange={(e) => setCardDetails(prev => ({...prev, processorToken: e.target.value}))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddCardOpen(false)}
                    disabled={addCardMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => addCardMutation.mutate(cardDetails)}
                    disabled={!cardDetails.number || cardDetails.number.length < 16 || !cardDetails.expiry || !cardDetails.cvv || !cardDetails.name || addCardMutation.isPending}
                  >
                    {addCardMutation.isPending ? 'Adding...' : 'Add Card'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}