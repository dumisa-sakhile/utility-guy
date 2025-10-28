import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { collection, query, where, orderBy, getDocs, doc, addDoc, deleteDoc, writeBatch, serverTimestamp, limit } from 'firebase/firestore'
import { auth, db } from '../../../config/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../../components/ui/dialog'
import { Wallet, CreditCard, Plus, Trash2, Check } from 'lucide-react'
import { isCardNumberPlausible, isCvvValid, validateExpiry } from '../../../lib/cardUtils'
import toast from 'react-hot-toast'

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
  type: 'credit' | 'purchase' | 'topup' | 'service_fee' | 'withdraw'
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
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [cardDetails, setCardDetails] = useState({
    number: '',
    expMonth: '',
    expYear: '',
    cvv: '',
    name: '',
    processorToken: ''
  })
  const [withdrawAmount, setWithdrawAmount] = useState('')

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

  // Fetch transactions - use same approach as history.tsx for speed and consistency
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', user?.uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const q = query(collection(db, 'transactions'), where('userId', '==', user.uid))
      const snapshot = await getDocs(q)

      const items = snapshot.docs.map(doc => {
        const data = doc.data()
        const {
          userId,
          type,
          amount = 0,
          description,
          status,
          timestamp,
          serviceFee,
          netAmount,
          grossAmount,
          balanceAfter
        } = data

        return {
          id: doc.id,
          userId,
          type: type as Transaction['type'],
          amount,
          description,
          status: status as Transaction['status'],
          timestamp,
          serviceFee: serviceFee as number | undefined,
          netAmount: netAmount as number | undefined,
          grossAmount: grossAmount as number | undefined,
          balanceAfter: balanceAfter as number | undefined
        } as Transaction
      })

      const getTime = (ts: any) => {
        if (!ts) return 0
        if (typeof ts.toDate === 'function') return ts.toDate().getTime()
        const parsed = new Date(ts)
        return isNaN(parsed.getTime()) ? 0 : parsed.getTime()
      }

      items.sort((a, b) => getTime(b.timestamp) - getTime(a.timestamp))
      return items
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
        orderBy('createdAt', 'desc'),
        limit(10)
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
      const newBalance = parseFloat((currentBalance + netAmount).toFixed(2))

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
        description: !userData ? 'Initial wallet credit (setup)' : `Wallet top-up - R${topupAmount.toFixed(2)}`,
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
      toast.success('Funds added to wallet')
    },
    onError: (error) => {
      console.error('Failed to add funds:', error)
      toast.error(error?.message || 'Failed to add funds. Please try again.')
    }
  })

  // Add card mutation - follows security rules (userId matches auth.uid)
  const addCardMutation = useMutation({
    mutationFn: async (cardData: typeof cardDetails) => {
      if (!user) throw new Error('Not authenticated')

      const last4 = cardData.number.slice(-4)
      const brand = getCardBrand(cardData.number)

      // Parse expiry date from separate fields
      let expMonth = parseInt(cardData.expMonth as any) || 0
      let expYear = parseInt(cardData.expYear as any) || 0
      if (expYear < 100) {
        expYear += 2000
      }

      // Check if this will be the first/default card
      const existingCards = await getDocs(query(
        collection(db, 'payment_cards'),
        where('userId', '==', user.uid)
      ))
      const isDefault = existingCards.empty

      const cardDoc: any = {
        userId: user.uid,
        brand,
        last4,
        expMonth,
        expYear,
        cardholderName: cardData.name,
        isDefault,
        createdAt: serverTimestamp(),
      }
      if ((cardData as any).processorToken) cardDoc.processorToken = (cardData as any).processorToken

      const ref = await addDoc(collection(db, 'payment_cards'), cardDoc)
      return { id: ref.id, ...cardDoc }
    },
    onSuccess: (data) => {
      // Add the saved card into cache so it shows immediately
      try {
        if (data) {
          queryClient.setQueryData(['payment-cards', user?.uid], (old: any[] | undefined) => {
            if (!old) return [data]
            return [data, ...old]
          })
          // ensure authoritative refetch so server-side fields (createdAt) are accurate
          queryClient.invalidateQueries({ queryKey: ['payment-cards', user?.uid] })
        } else {
          queryClient.invalidateQueries({ queryKey: ['payment-cards', user?.uid] })
        }
      } finally {
        setAddCardOpen(false)
        setCardDetails({ number: '', expMonth: '', expYear: '', cvv: '', name: '', processorToken: '' })
        toast.success('Payment card added')
      }
    },
    onError: (error) => {
      console.error('Failed to add card:', error)
      toast.error(error?.message || 'Failed to add card. Please try again.')
    }
  })

  // Delete card mutation - follows security rules (only user's own cards)
  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      if (!user) throw new Error('Not authenticated')
      await deleteDoc(doc(db, 'payment_cards', cardId))
    },
    onSuccess: (_data, cardId) => {
      // remove from cache immediately
      queryClient.setQueryData(['payment-cards', user?.uid], (old: any[] | undefined) => {
        if (!old) return []
        return old.filter(c => c.id !== cardId)
      })
      // ensure server state and any derived queries refresh
      queryClient.invalidateQueries({ queryKey: ['payment-cards', user?.uid] })
      toast.success('Payment card removed')
    },
    onError: (error) => {
      console.error('Failed to delete card:', error)
      toast.error(error?.message || 'Failed to delete card. Please try again.')
    }
  })

  // Withdraw mutation — debits user's wallet
  const withdrawMutation = useMutation({
    mutationFn: async (withdrawAmt: number) => {
      if (!user) throw new Error('Not authenticated')
      const currentBalance = userData?.walletBalance || 0
      if (withdrawAmt <= 0) throw new Error('Enter a valid amount')
      if (withdrawAmt > currentBalance) throw new Error('Insufficient wallet balance')
      const serviceFee = parseFloat((withdrawAmt * COMMISSION_RATE).toFixed(2))
      const gross = parseFloat(withdrawAmt.toFixed(2))
      const net = parseFloat((gross - serviceFee).toFixed(2))

      const newBalance = parseFloat((currentBalance - gross).toFixed(2))
      const batch = writeBatch(db)

      // update wallet
      batch.update(doc(db, 'users', user.uid), { walletBalance: newBalance, updatedAt: serverTimestamp() })

      // withdraw transaction (gross amount debited)
      const withdrawTx = {
        userId: user.uid,
        type: 'withdraw' as const,
        amount: -gross,
        description: `Withdrawal - R${gross.toFixed(2)}`,
        status: 'completed' as const,
        timestamp: serverTimestamp(),
        balanceAfter: newBalance,
        grossAmount: gross,
        netAmount: net,
      }
      const wRef = doc(collection(db, 'transactions'))
      batch.set(wRef, withdrawTx)

      // service fee transaction
      if (serviceFee > 0) {
        const feeTx = {
          userId: user.uid,
          type: 'service_fee' as const,
          amount: -serviceFee,
          description: `Service fee (${COMMISSION_RATE * 100}%) - Withdrawal`,
          status: 'completed' as const,
          timestamp: serverTimestamp(),
          balanceAfter: newBalance,
          serviceFee: serviceFee,
          grossAmount: gross
        }
        const fRef = doc(collection(db, 'transactions'))
        batch.set(fRef, feeTx)
      }

      await batch.commit()
      return newBalance
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.uid] })
      setWithdrawOpen(false)
      setWithdrawAmount('')
      toast.success('Withdrawal completed')
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to withdraw')
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
    const date = timestamp.toDate?.()
    if (!date) return 'Invalid date'
    return date.toLocaleString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatCurrency = (amount: number) => {
    return `R ${Math.abs(amount).toFixed(2)}`
  }

  // rendering of type badges uses inline classes now (keeps code simple and consistent with history.tsx)

  // Metrics aggregation
  const totals = (transactions || []).reduce((acc, t) => {
    if (t.type === 'credit') acc.credits += Math.abs(t.amount || 0)
    if (t.type === 'purchase' || t.type === 'topup') acc.purchases += Math.abs(t.amount || 0)
    if (t.type === 'service_fee') acc.fees += Math.abs(t.amount || 0)
    if (t.type === 'withdraw') acc.withdrawals += Math.abs(t.amount || 0)
    return acc
  }, { credits: 0, purchases: 0, fees: 0, withdrawals: 0 })

  // Pagination / show more state
  const [txDisplayCount, setTxDisplayCount] = useState(5)
  const [pmDisplayCount, setPmDisplayCount] = useState(5)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null)
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [activeTransaction, setActiveTransaction] = useState<Transaction | null>(null)


  // Simple live validation for card entry
  const cardIsValid = (() => {
    const num = (cardDetails.number || '')
    const cvv = (cardDetails.cvv || '')
    const mm = (cardDetails.expMonth || '')
    const yyyy = (cardDetails.expYear || '')
    const name = (cardDetails.name || '').trim()
    return isCardNumberPlausible(num) && isCvvValid(cvv) && validateExpiry(mm, yyyy) && name.length > 0
  })()

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
        {/* Metrics Row (spans left columns) */}
        <div className="lg:col-span-2 grid grid-cols-4 gap-4">
          <Card>
            <CardContent>
              <div className="text-sm text-gray-500">Deposits</div>
              <div className="text-lg font-semibold text-green-700">R {totals.credits.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-sm text-gray-500">Purchases</div>
              <div className="text-lg font-semibold text-blue-700">R {totals.purchases.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-sm text-gray-500">Fees</div>
              <div className="text-lg font-semibold text-red-600">R {totals.fees.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-sm text-gray-500">Withdrawals</div>
              <div className="text-lg font-semibold text-red-700">R {totals.withdrawals.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

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
                <div className="flex items-center gap-3">
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

                  <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive">Withdraw</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Withdraw from Wallet</DialogTitle>
                        <DialogDescription>
                          Withdraw funds from your wallet. Amount will be debited immediately.
                        </DialogDescription>
                      </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="withdraw-amount">Amount (R)</Label>
                              <Input
                                id="withdraw-amount"
                                type="number"
                                placeholder="50.00"
                                value={withdrawAmount}
                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                min="1"
                                step="0.01"
                              />
                              <div className="text-xs text-gray-500 mt-2">Available: R {userData?.walletBalance?.toFixed(2) || '0.00'}</div>
                            </div>

                            {withdrawAmount && !isNaN(parseFloat(withdrawAmount)) && parseFloat(withdrawAmount) > 0 && (
                              (() => {
                                const gross = parseFloat(withdrawAmount)
                                const fee = parseFloat((gross * COMMISSION_RATE).toFixed(2))
                                const net = parseFloat((gross - fee).toFixed(2))
                                return (
                                  <div className="p-3 bg-gray-50 rounded-lg space-y-2 text-sm">
                                    <div className="flex justify-between"><span>Gross</span><span>R {gross.toFixed(2)}</span></div>
                                    <div className="flex justify-between text-red-600"><span>Service fee ({COMMISSION_RATE * 100}%)</span><span>-R {fee.toFixed(2)}</span></div>
                                    <div className="flex justify-between font-semibold border-t pt-2"><span>Net to receive</span><span>R {net.toFixed(2)}</span></div>
                                  </div>
                                )
                              })()
                            )}
                          </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setWithdrawOpen(false)} disabled={withdrawMutation.isPending}>Cancel</Button>
                        <Button onClick={() => withdrawMutation.mutate(parseFloat(withdrawAmount))} disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > (userData?.walletBalance || 0) || withdrawMutation.isPending}>
                          {withdrawMutation.isPending ? 'Processing...' : 'Withdraw'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {addFundsMutation.isSuccess && (
                  <div className="inline-flex items-center text-green-600 text-sm ml-4">
                    <Check className="h-4 w-4 mr-1" />
                    Added
                  </div>
                )}
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
                <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">Date</th>
                        <th className="text-left py-3 px-2">Type</th>
                        <th className="text-left py-3 px-2">Description</th>
                        <th className="text-right py-3 px-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.slice(0, txDisplayCount).map((transaction) => (
                        <tr
                          key={transaction.id}
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => { setActiveTransaction(transaction); setTransactionDialogOpen(true); }}
                          role="button"
                        >
                          <td className="py-3 px-2 whitespace-nowrap">{formatDate(transaction.timestamp)}</td>
                          <td className="py-3 px-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.type === 'credit' ? 'bg-green-100 text-green-800' :
                              transaction.type === 'service_fee' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {transaction.type?.replace('_', ' ') || 'Unknown'}
                            </span>
                          </td>
                          <td className="py-3 px-2 truncate">{transaction.description}</td>
                          <td className={`py-3 px-2 text-right font-medium ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>{transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {transactions && transactions.length > txDisplayCount && (
                  <div className="mt-3 text-right">
                    <Button variant="link" onClick={() => setTxDisplayCount((c) => Math.min((transactions || []).length, c + 10))}>Show more</Button>
                  </div>
                )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <div>No transactions yet</div>
                  <div className="text-sm mt-1">Add funds to get started</div>
                </div>
              )}
            </CardContent>
          </Card>

            {/* Transaction detail modal */}
            <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transaction Details</DialogTitle>
                  <DialogDescription>
                    {activeTransaction ? activeTransaction.description : 'Transaction information'}
                  </DialogDescription>
                </DialogHeader>
                {activeTransaction ? (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between text-sm text-gray-600"><span>Date</span><span>{formatDate(activeTransaction.timestamp)}</span></div>
                    <div className="flex justify-between text-sm text-gray-600"><span>Type</span><span>{activeTransaction.type}</span></div>
                    <div className="flex justify-between text-sm text-gray-600"><span>Gross</span><span>{activeTransaction.grossAmount !== undefined ? formatCurrency(activeTransaction.grossAmount) : '-'}</span></div>
                    <div className="flex justify-between text-sm text-gray-600"><span>Service fee</span><span>{activeTransaction.serviceFee !== undefined ? (activeTransaction.serviceFee > 0 ? `-${formatCurrency(activeTransaction.serviceFee)}` : formatCurrency(activeTransaction.serviceFee)) : '-'}</span></div>
                    <div className="flex justify-between text-sm text-gray-600"><span>Net amount</span><span>{activeTransaction.netAmount !== undefined ? (activeTransaction.netAmount > 0 ? '+' : '') + formatCurrency(activeTransaction.netAmount) : (activeTransaction.amount > 0 ? '+' : '') + formatCurrency(activeTransaction.amount)}</span></div>
                    <div className="flex justify-between text-sm text-gray-600"><span>Balance after</span><span>{activeTransaction.balanceAfter !== undefined ? `R ${activeTransaction.balanceAfter.toFixed(2)}` : '-'}</span></div>
                    <div className="flex justify-between text-sm"><span>Status</span><span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      activeTransaction.status === 'completed' ? 'bg-green-100 text-green-800' :
                      activeTransaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                    }`}>{activeTransaction.status}</span></div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">No transaction selected</div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setTransactionDialogOpen(false); setActiveTransaction(null); }}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        </div>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentMethods && paymentMethods.length > 0 ? (
              paymentMethods.slice(0, pmDisplayCount).map((method) => (
                <div key={method.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const b = (method.brand || '').toLowerCase()
                      const bg = b.includes('visa') ? 'bg-blue-100 text-blue-700' : b.includes('master') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      return <div className={`h-8 w-8 rounded-full flex items-center justify-center ${bg} text-xs font-semibold`}>{(method.brand || '').slice(0,3)}</div>
                    })()}
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
                      setDeletingCardId(method.id)
                      setDeleteDialogOpen(true)
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
            {paymentMethods && paymentMethods.length > pmDisplayCount && (
              <div className="mt-2 text-right">
                <Button variant="link" onClick={() => setPmDisplayCount((c) => Math.min((paymentMethods || []).length, c + 5))}>Show more</Button>
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
                <div className="flex flex-col gap-4 mt-4">
                  <div>
                    <Label htmlFor="card-number" className='pb-3'>Card Number</Label>
                    <Input
                      id="card-number"
                      placeholder="4242 4242 4242 4242"
                      value={cardDetails.number}
                      onChange={(e) => setCardDetails(prev => ({...prev, number: e.target.value.replace(/\s/g, '')}))}
                      maxLength={16}
                    />
                    {cardDetails.number && cardDetails.number.replace(/\s/g, '').length >= 13 && (
                      <div className="text-xs text-green-600 mt-1">Card number looks valid</div>
                    )}
                  </div>
                    <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <Label htmlFor="exp-month" className='pb-3'>Expiry Month (MM)</Label>
                      <Input
                        id="exp-month"
                        placeholder="MM"
                        value={cardDetails.expMonth}
                        onChange={(e) => setCardDetails(prev => ({...prev, expMonth: e.target.value.replace(/\D/g, '').slice(0,2)}))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="exp-year" className='pb-3'>Expiry Year (YYYY)</Label>
                      <Input
                        id="exp-year"
                        placeholder="YYYY"
                        value={cardDetails.expYear}
                        onChange={(e) => setCardDetails(prev => ({...prev, expYear: e.target.value.replace(/\D/g, '').slice(0,4)}))}
                      />
                      {/* inline validation messages */}
                      {cardDetails.expMonth && (Number(cardDetails.expMonth) < 1 || Number(cardDetails.expMonth) > 12) && (
                        <div className="text-xs text-red-600 mt-1">Enter a valid month (1–12)</div>
                      )}
                      {cardDetails.expYear && Number(cardDetails.expYear) < new Date().getFullYear() && (
                        <div className="text-xs text-red-600 mt-1">Year must be this year or later</div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="cvv" className='pb-3'>CVV</Label>
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
                    <Label htmlFor="name" className='pb-3'>Cardholder Name</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={cardDetails.name}
                      onChange={(e) => setCardDetails(prev => ({...prev, name: e.target.value}))}
                    />
                  </div>
                  {/* processorToken removed: we don't store raw processor tokens in the client */}
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
                    disabled={!cardIsValid || addCardMutation.isPending}
                  >
                    {addCardMutation.isPending ? 'Adding...' : 'Add Card'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Delete confirmation dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove payment method</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove this payment method?
                    {deletingCardId && paymentMethods && (
                      <div className="mt-2 text-sm text-gray-600">This will remove card ending in {paymentMethods.find(m => m.id === deletingCardId)?.last4}</div>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingCardId(null); }} disabled={deleteCardMutation.isPending}>Cancel</Button>
                  <Button variant="destructive" onClick={() => { if (deletingCardId) { deleteCardMutation.mutate(deletingCardId); setDeleteDialogOpen(false); setDeletingCardId(null); } }} disabled={!deletingCardId || deleteCardMutation.isPending}>Remove</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
              {addCardMutation.isSuccess && (
                <div className="inline-flex items-center text-green-600 text-sm mt-3">
                  <Check className="h-4 w-4 mr-1" />
                  Card saved
                </div>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}