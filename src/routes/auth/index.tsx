import { createFileRoute } from '@tanstack/react-router'
import React, { useState } from 'react'
import { Button } from '../../components/ui/button'
import { Link, useNavigate } from '@tanstack/react-router'
import { Input } from '../../components/ui/input'
import { PasswordInput } from '../../components/ui/password'
import { Label } from '../../components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'
import { auth, db } from '../../config/firebase'
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { useMutation } from '@tanstack/react-query'

export const Route = createFileRoute('/auth/')({
  component: AuthPage,
})

function AuthPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upsertUser = useMutation({
    mutationFn: async ({ uid, data }: { uid: string; data: Record<string, any> }) => {
      const ref = doc(db, 'users', uid)
      const snap = await getDoc(ref)
      const existing = snap.exists() ? snap.data() : {}

      const keys = ['userId','isActive','name', 'surname', 'dob', 'gender', 'phoneNumber', 'email', 'isAdmin']
      const toSet: Record<string, any> = {}
      for (const k of keys) {
        if (data[k] !== undefined && data[k] !== null) {
          if (existing[k] === undefined || existing[k] === null || existing[k] === '') {
            toSet[k] = data[k]
          }
        }
      }

      if (!existing || !existing.createdAt) toSet.createdAt = serverTimestamp()
      toSet.updatedAt = serverTimestamp()

      await setDoc(ref, toSet, { merge: true })
      return true
    }
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // custom validation
    if (!email) {
      setError('Please enter your email')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    if (!password) {
      setError('Please enter your password')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
  // on success navigate to dashboard
  navigate({ to: '/dashboard' })
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const user = result.user
      if (user) {
        const displayName = user.displayName || ''
        const parts = displayName.split(' ').filter(Boolean)
        const inferredName = parts.shift() || ''
        const inferredSurname = parts.join(' ') || ''

        await upsertUser.mutateAsync({
          uid: user.uid,
          data: {
            userId: user.uid,
            isActive: true,
            name: inferredName || null,
            surname: inferredSurname || null,
            email: user.email || null,
            isAdmin: false,
          },
        })
      }

  navigate({ to: '/dashboard' })
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh]  flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md p-6 bg-card/60 backdrop-blur-sm rounded-lg border border-white/10">
        <h2 className="text-2xl font-semibold mb-4">Sign in to Utility Guy</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>

          <div>
            <Label>Password</Label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} showStrength={false} />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <Button variant="outline" asChild size="sm">
              <Link to="/auth/register">Create account</Link>
            </Button>
          </div>

          <div className="mt-2 text-sm">
            <Link to="/auth/reset" className="underline text-black/80">Forgot password?</Link>
          </div>

          <div className="my-4">
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card/60 px-2 text-black/60">or</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <img src="https://www.svgrepo.com/show/303108/google-icon-logo.svg" alt="Google" className="w-4 h-4" />
              {loading ? 'Please wait…' : 'Continue with Google'}
            </Button>
          </div>
        </form>

        <div className="mt-4 text-sm" style={{ color: "var(--color-muted-foreground)" }}>
          Need a quick demo? <Link to="/" className="underline">Return to landing</Link>
        </div>
      </div>
    </div>
  )
}

export default AuthPage

