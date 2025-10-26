import { createFileRoute } from '@tanstack/react-router'
import React, { useState } from 'react'
import { Button } from '../../components/ui/button'
import { Link } from '@tanstack/react-router'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'
import { auth } from '../../config/firebase'
import { sendPasswordResetEmail } from 'firebase/auth'
import { useMutation } from '@tanstack/react-query'

export const Route = createFileRoute('/auth/reset')({
  component: ResetPage,
})

function ResetPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (payload: { email: string }) => {
      await sendPasswordResetEmail(auth, payload.email)
    },
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    // custom validation for email
    if (!email) {
      setMessage('Please enter your email')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage('Please enter a valid email address')
      return
    }

    try {
      await mutation.mutateAsync({ email })
      setMessage('Password reset email sent — check your inbox.')
    } catch (err: any) {
      setMessage(err?.message || 'Failed to send reset email')
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center py-12">
      <div className="w-full max-w-md p-6 bg-card/60 backdrop-blur-sm rounded-lg border border-white/10">
        <h2 className="text-2xl font-semibold mb-4">Reset password</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>

          {message ? (
            <Alert>
              <AlertTitle>Reset status</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center justify-between gap-3">
              <Button type="submit" className="flex-1" disabled={mutation.status === 'pending'}>
                {mutation.status === 'pending' ? 'Sending…' : 'Send reset email'}
            </Button>
            <Button variant="outline" asChild size="sm">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ResetPage
