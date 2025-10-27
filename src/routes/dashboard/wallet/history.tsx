import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../../../config/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { CreditCard, Download, Filter } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/dashboard/wallet/history')({
  component: WalletHistory,
})

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

function WalletHistory() {
  const user = auth.currentUser
  const [filter, setFilter] = useState<'all' | 'credit' | 'service_fee' | 'purchase'>('all')

  // Fetch all transactions - follows security rules
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions-history', user?.uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')
      
      const q = query(collection(db, 'transactions'), where('userId', '==', user.uid))

      const snapshot = await getDocs(q)
      const transactionsData = snapshot.docs.map(doc => {
        // --- FIX START: Safely extract data with default values ---
        const data = doc.data()
        const {
          userId,
          type,
          amount = 0, // Ensure amount is a number, default to 0
          description,
          status,
          timestamp,
          serviceFee,
          netAmount,
          grossAmount,
          balanceAfter
        } = data
        // --- FIX END ---

        return {
          id: doc.id,
          userId,
          // Add a type assertion if you are 100% sure the data conforms, 
          // or add runtime validation if type could be anything.
          type: type as 'credit' | 'purchase' | 'topup' | 'service_fee',
          amount,
          description,
          status: status as 'completed' | 'pending' | 'failed', // Type assertion for status
          timestamp,
          serviceFee: serviceFee as number | undefined,
          netAmount: netAmount as number | undefined,
          grossAmount: grossAmount as number | undefined,
          balanceAfter: balanceAfter as number | undefined
        } as Transaction
      })
      
      // Sort client-side by timestamp (robust to missing/varied timestamp types)
      const getTime = (ts: any) => {
        if (!ts) return 0
        if (typeof ts.toDate === 'function') return ts.toDate().getTime()
        const parsed = new Date(ts)
        return isNaN(parsed.getTime()) ? 0 : parsed.getTime()
      }
      transactionsData.sort((a, b) => getTime(b.timestamp) - getTime(a.timestamp))
      return transactionsData
    },
    enabled: !!user,
    retry: 1
  })

  // Filter transactions
  const filteredTransactions = transactions?.filter(transaction => {
    if (filter === 'all') return true
    return transaction.type === filter
  })

  // Calculate statistics
  const stats = {
    totalTransactions: transactions?.length || 0,
    // Safely access amount, ensuring it's treated as a number
    totalAdded: transactions?.filter(t => t.type === 'credit').reduce((sum, t) => sum + (t.amount || 0), 0) || 0,
    totalFees: transactions?.filter(t => t.type === 'service_fee').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) || 0,
    netFlow: transactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0
  }

  // Export to CSV
  const exportToCSV = () => {
    if (!transactions || transactions.length === 0) return
    
    const headers = ['Date', 'Description', 'Type', 'Amount', 'Service Fee', 'Net Amount', 'Status', 'Balance After']
    const csvData = transactions.map(t => [
      t.timestamp?.toDate?.().toLocaleString('en-ZA') || 'Unknown',
      t.description,
      t.type,
      // Safely check for t.amount
      `R ${t.amount !== undefined ? t.amount.toFixed(2) : '0.00'}`,
      t.serviceFee !== undefined ? `R ${t.serviceFee.toFixed(2)}` : 'R 0.00',
      t.netAmount !== undefined ? `R ${t.netAmount.toFixed(2)}` : `R ${t.amount !== undefined ? t.amount.toFixed(2) : '0.00'}`,
      t.status,
      t.balanceAfter !== undefined ? `R ${t.balanceAfter.toFixed(2)}` : 'N/A'
    ])
    
    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `transactions-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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

  if (transactionsLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <CreditCard className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <div className="text-gray-600">Loading transaction history...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-600">Please sign in to view your transaction history.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
            <p className="text-gray-600">Complete history of all your wallet transactions</p>
          </div>
          <Button onClick={exportToCSV} disabled={!transactions || transactions.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-gray-600 mb-1">Total Transactions</div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalTransactions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-gray-600 mb-1">Total Added</div>
              <div className="text-2xl font-bold text-green-600">R {stats.totalAdded.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-gray-600 mb-1">Total Fees</div>
              <div className="text-2xl font-bold text-red-600">R {stats.totalFees.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-gray-600 mb-1">Net Flow</div>
              <div className={`text-2xl font-bold ${
                stats.netFlow >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {stats.netFlow >= 0 ? '+' : ''}R {stats.netFlow.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Transactions</CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <select 
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="border rounded-md px-3 py-1 text-sm"
                >
                  <option value="all">All Types</option>
                  <option value="credit">Credits</option>
                  <option value="service_fee">Fees</option>
                  <option value="purchase">Purchases</option>
                </select>
              </div>
            </div>
            <CardDescription>
              {filteredTransactions?.length || 0} transactions found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredTransactions && filteredTransactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 font-medium">Date & Time</th>
                      <th className="text-left py-3 px-4 font-medium">Description</th>
                      <th className="text-left py-3 px-4 font-medium">Type</th>
                      <th className="text-right py-3 px-4 font-medium">Amount</th>
                      <th className="text-right py-3 px-4 font-medium">Service Fee</th>
                      <th className="text-right py-3 px-4 font-medium">Net Amount</th>
                      <th className="text-right py-3 px-4 font-medium">Balance After</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 whitespace-nowrap">
                          {formatDate(transaction.timestamp)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{transaction.description}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            transaction.type === 'credit' ? 'bg-green-100 text-green-800' :
                            transaction.type === 'service_fee' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {transaction.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right font-medium ${
                          transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {transaction.serviceFee !== undefined ? `-${formatCurrency(transaction.serviceFee)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {transaction.netAmount !== undefined ? 
                            (transaction.netAmount > 0 ? '+' : '') + formatCurrency(transaction.netAmount) :
                            (transaction.amount > 0 ? '+' : '') + formatCurrency(transaction.amount)
                          }
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {transaction.balanceAfter !== undefined ? `R ${transaction.balanceAfter.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-3 px-4">
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
              <div className="text-center py-12 text-gray-500">
                <CreditCard className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <div className="text-lg font-medium text-gray-900 mb-2">No transactions found</div>
                <div className="text-gray-600">
                  {filter === 'all' 
                    ? "You haven't made any transactions yet."
                    : `No ${filter.replace('_', ' ')} transactions found.`
                  }
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default WalletHistory