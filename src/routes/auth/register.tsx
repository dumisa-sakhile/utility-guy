import { createFileRoute } from '@tanstack/react-router'
import React, { useState, useRef, useEffect } from 'react'
import { Button } from '../../components/ui/button'
import { Link, useNavigate } from '@tanstack/react-router'
import { Input } from '../../components/ui/input'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
} from '../../components/ui/select'
import { Calendar } from '../../components/ui/calendar'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'
import { auth, db } from '../../config/firebase'
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendEmailVerification } from 'firebase/auth'
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { useMutation } from '@tanstack/react-query'

export const Route = createFileRoute('/auth/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [dobDate, setDobDate] = useState<Date | undefined>(undefined)
  const [dobString, setDobString] = useState('')
  const [dobError, setDobError] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!showCalendar) return
      const target = e.target as Node
      if (calendarRef.current && !calendarRef.current.contains(target)) {
        setShowCalendar(false)
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowCalendar(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showCalendar])

  // sync dobDate -> dobString
  useEffect(() => {
    if (dobDate) {
      const y = dobDate.getFullYear()
      const m = String(dobDate.getMonth() + 1).padStart(2, '0')
      const d = String(dobDate.getDate()).padStart(2, '0')
      setDobString(`${y}-${m}-${d}`)
      setDobError(null)
    } else {
      setDobString('')
    }
  }, [dobDate])

  function parseDate(input: string): Date | undefined {
    const s = input.trim()
    if (!s) return undefined

    // YYYY-MM-DD (recommended)
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(s)
    if (iso) {
      const d = new Date(s)
      if (!isNaN(d.getTime())) return d
    }

    // try common DD/MM/YYYY or MM/DD/YYYY patterns
    const parts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (parts) {
      const a = parseInt(parts[1], 10)
      const b = parseInt(parts[2], 10)
      const yy = parseInt(parts[3], 10)
      // Heuristic: if first part > 12 interpret as DD/MM/YYYY
      if (a > 12) {
        const day = a
        const month = b
        const d = new Date(yy, month - 1, day)
        if (!isNaN(d.getTime())) return d
      } else {
        // otherwise interpret as MM/DD/YYYY
        const month = a
        const day = b
        const d = new Date(yy, month - 1, day)
        if (!isNaN(d.getTime())) return d
      }
    }

    // fallback: let Date try to parse (may be locale-dependent)
    const loose = new Date(s)
    if (!isNaN(loose.getTime())) return loose
    return undefined
  }

  // mutation to upsert user doc while preserving existing fields
  const upsertUser = useMutation({
    mutationFn: async ({ uid, data }: { uid: string; data: Record<string, any> }) => {
      const ref = doc(db, 'users', uid)
      const snap = await getDoc(ref)
      const existing = snap.exists() ? snap.data() : {}

  const keys = ['userId','isActive','name', 'surname', 'dob', 'gender', 'phoneNumber', 'email', 'isAdmin']
      const toSet: Record<string, any> = {}
      for (const k of keys) {
        if (data[k] !== undefined && data[k] !== null) {
          // only set if existing value is missing
          if (existing[k] === undefined || existing[k] === null || existing[k] === '') {
            toSet[k] = data[k]
          }
        }
      }

      // preserve createdAt if exists
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
    if (!name || !surname) {
      setError('Please provide your first and last name')
      return
    }

    if (!dobDate) {
      setError('Please select your date of birth')
      return
    }

    // custom verification: ensure reasonable age (16+)
    const now = new Date()
    const age = now.getFullYear() - dobDate.getFullYear() - (now < new Date(dobDate.getFullYear(), dobDate.getMonth(), dobDate.getDate()) ? 1 : 0)
    if (age < 16) {
      setError('You must be at least 16 years old to register')
      return
    }

    if (!gender) {
      setError('Please select a gender')
      return
    }

    if (!phoneNumber) {
      setError('Please enter a phone number')
      return
    }
    // basic phone format check (international, starts with + and digits)
    if (!/^\+?[0-9\s\-()]{7,}$/.test(phoneNumber)) {
      setError('Please enter a valid phone number (include country code)')
      return
    }

    if (!email) {
      setError('Please enter your email')
      return
    }
    // basic email check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    if (!password) {
      setError('Please choose a password')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password)
      const uid = userCred.user.uid
      // send verification email after creating account
      try {
        await sendEmailVerification(userCred.user)
      } catch (err) {
        // ignore send errors for now
      }
      // Upsert user doc using React Query mutation
      await upsertUser.mutateAsync({
        uid,
        data: {
          userId: uid,
          name,
          surname,
          dob: dobDate ? dobDate.toISOString() : null,
          gender,
          phoneNumber,
          email,
          isAdmin: false,
          isActive: true,
        },
      })

      // Navigate to landing (or dashboard) after signing up
  navigate({ to: '/dashboard' })
    } catch (err: any) {
      setError(err?.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleRegister() {
    setError(null)
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const user = result.user
      if (user) {
        // create or merge a user doc but avoid overwriting existing fields
        const displayName = user.displayName || ''
        const parts = displayName.split(' ').filter(Boolean)
        const inferredName = parts.shift() || ''
        const inferredSurname = parts.join(' ') || ''

        await upsertUser.mutateAsync({
          uid: user.uid,
          data: {
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
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md p-6 bg-card/60 backdrop-blur-sm rounded-lg border border-white/10">
        <h2 className="text-2xl font-semibold mb-4">Create an account</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>First name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} type="text" />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={surname} onChange={(e) => setSurname(e.target.value)} type="text" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Date of birth</Label>
              <div className="relative" ref={calendarRef}>
                {/* Using a controlled input that opens a popover calendar. Click-outside and Escape will close it. */}
                <div className="relative">
                  <input
                    value={dobString}
                    onFocus={() => setShowCalendar(true)}
                    onClick={() => setShowCalendar((s) => !s)}
                    onChange={(e) => setDobString(e.target.value)}
                    onBlur={() => {
                      if (!dobString) return
                      const parsed = parseDate(dobString)
                      if (parsed) {
                        setDobDate(parsed)
                        setDobError(null)
                      } else {
                        setDobError('Invalid date. Use YYYY-MM-DD or DD/MM/YYYY')
                      }
                    }}
                    placeholder="YYYY-MM-DD"
                    aria-haspopup="dialog"
                    aria-expanded={showCalendar}
                    className="w-full rounded-md border border-input px-3 py-2 pr-10 bg-input text-sm"
                  />

                  <button
                    type="button"
                    aria-label="Toggle calendar"
                    onClick={() => setShowCalendar((s) => !s)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-600 hover:text-slate-800"
                  >
                    <CalendarIcon className="size-4" />
                  </button>
                </div>

                {showCalendar ? (
                  <div className="absolute z-50 mt-2 left-0">
                    <Calendar
                      mode="single"
                      selected={dobDate}
                      onSelect={(d) => {
                        // react-day-picker returns Date | undefined
                        if (d) setDobDate(d as Date)
                        setShowCalendar(false)
                      }}
                    />
                  </div>
                ) : null}
              </div>
              {dobError ? <div className="text-xs text-destructive mt-1">{dobError}</div> : null}
            </div>

            <div>
              <Label>Gender</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Gender</SelectLabel>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
              <Label>Phone number (with country code)</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              type="tel"
              placeholder="+27123456789"
            />
          </div>

          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>

          <div>
            <Label>Password</Label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} showStrength />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Registration error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Creating…' : 'Create account'}
            </Button>
            <Button variant="outline" asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </form>

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
            onClick={handleGoogleRegister}
            disabled={loading}
          >
            <img src="https://www.svgrepo.com/show/303108/google-icon-logo.svg" alt="Google" className="w-4 h-4" />
            {loading ? 'Please wait…' : 'Continue with Google'}
          </Button>
        </div>

        <div className="mt-4 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          By creating an account you agree to our <span className="underline">terms</span>.
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
