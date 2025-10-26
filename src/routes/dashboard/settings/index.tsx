// src/routes/dashboard/settings/index.tsx
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { Loader2, Save, CheckCircle, AlertCircle, Eye, EyeOff, Mail, Lock, User, Shield, Clock } from 'lucide-react'
import { auth, db } from '../../../config/firebase'
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { reauthenticateWithCredential, updatePassword, EmailAuthProvider, verifyBeforeUpdateEmail, sendPasswordResetEmail } from 'firebase/auth'

export const Route = createFileRoute('/dashboard/settings/')({
  component: SettingsPage,
})

function SettingsPage() {
  const queryClient = useQueryClient()
  const user = auth.currentUser
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    phoneNumber: '',
    dob: '',
    gender: '',
  })
  const [initialData, setInitialData] = useState({
    name: '',
    surname: '',
    phoneNumber: '',
    dob: '',
    gender: '',
  })
  const [message, setMessage] = useState({ type: '', text: '' })

  const { data: profile, isPending } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: async () => {
      if (!user?.uid) throw new Error('No user')
      const ref = doc(db, 'users', user.uid)
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('Profile not found')
      return snap.data()
    },
    enabled: !!user?.uid,
  })

  useEffect(() => {
    if (profile) {
      const newData = {
        name: profile.name || '',
        surname: profile.surname || '',
        phoneNumber: profile.phoneNumber || '',
        dob: profile.dob || '',
        gender: profile.gender || '',
      }
      setFormData(newData)
      setInitialData(newData)
    }
  }, [profile])

  const hasChanges = 
    formData.name !== initialData.name ||
    formData.surname !== initialData.surname ||
    formData.phoneNumber !== initialData.phoneNumber ||
    formData.dob !== initialData.dob ||
    formData.gender !== initialData.gender

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user?.uid) throw new Error('No user')
      await updateDoc(doc(db, 'users', user.uid), {
        name: formData.name,
        surname: formData.surname,
        phoneNumber: formData.phoneNumber,
        dob: formData.dob,
        gender: formData.gender,
        updatedAt: Timestamp.now(),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      setInitialData(formData)
      setMessage({ type: 'success', text: 'Profile updated successfully' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    },
    onError: (err) => setMessage({ type: 'error', text: err.message }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })
    
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Name is required' })
      return
    }

    updateProfileMutation.mutate()
  }

  if (isPending) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-600 text-sm">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="text-center py-16 space-y-3">
        <User className="h-12 w-12 text-gray-400 mx-auto" />
        <p className="text-gray-500">Please log in to view your profile.</p>
      </div>
    )
  }

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString()
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <div className="max-w-4xl space-y-8 px-4 sm:px-6 lg:px-0">
    

      {/* Global Message */}
      {message.text && (
        <div className={`p-4 rounded-md flex items-center gap-3 border-l-4 ${
          message.type === 'error' 
            ? 'bg-red-50 text-red-800 border-red-400' 
            : 'bg-green-50 text-green-800 border-green-400'
        }`}>
          {message.type === 'error' ? 
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" /> : 
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
          }
          <span className="font-medium text-sm">{message.text}</span>
        </div>
      )}

      {/* Personal Information Row */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Personal Information</h2>
            <p className="text-gray-600 text-sm">Update your basic profile details</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700">First Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Blanditiis"
                className="w-full border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-md transition-all duration-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="surname" className="text-sm font-medium text-gray-700">Last Name</Label>
              <Input
                id="surname"
                value={formData.surname}
                onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                placeholder="Elaida"
                className="w-full border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-md transition-all duration-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                placeholder="+27 472-1913"
                className="w-full border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-md transition-all duration-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob" className="text-sm font-medium text-gray-700">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                className="w-full border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-md transition-all duration-200"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="gender" className="text-sm font-medium text-gray-700">Gender</Label>
              <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
                <SelectTrigger className="w-full border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-md transition-all duration-200">
                  <SelectValue placeholder="Select your gender" />
                </SelectTrigger>
                <SelectContent className="rounded-md border-2 border-gray-200">
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasChanges && (
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
              <Button 
                type="submit" 
                disabled={updateProfileMutation.isPending}
                className="bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-md shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all duration-200 font-medium"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button 
                type="button"
                variant="outline"
                onClick={() => setFormData(initialData)}
                disabled={updateProfileMutation.isPending}
                className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium transition-all duration-200"
              >
                Cancel
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Security Settings Row */}
      <div className="space-y-6 pt-8 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
            <Shield className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Security Settings</h2>
            <p className="text-gray-600 text-sm">Manage your account security</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Email Section */}
          <div className="p-4 sm:p-6 bg-linear-to-br from-white to-gray-50 rounded-xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-md flex items-center justify-center">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Email Address</h3>
                <p className="text-gray-600 text-sm">Update your login email</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                <p className="text-sm text-blue-800 font-medium truncate">{user.email}</p>
              </div>
              <EmailUpdate />
            </div>
          </div>

          {/* Password Section */}
          <div className="p-4 sm:p-6 bg-linear-to-br from-white to-gray-50 rounded-xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-md flex items-center justify-center">
                <Lock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Password</h3>
                <p className="text-gray-600 text-sm">Manage your password security</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-3 bg-gray-100 rounded-md border border-gray-200">
                <p className="text-sm text-gray-600 font-mono">••••••••</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <PasswordUpdate />
                <PasswordReset />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Information Row */}
      <div className="space-y-6 pt-8 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
            <Clock className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Account Information</h2>
            <p className="text-gray-600 text-sm">Your account details and status</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-white rounded-xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${
                profile.isActive ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</Label>
            </div>
            <p className={`text-sm font-semibold ${
              profile.isActive ? 'text-green-600' : 'text-red-600'
            }`}>
              {profile.isActive ? 'Active' : 'Inactive'}
            </p>
          </div>

          {profile.isAdmin && (
            <div className="p-4 bg-white rounded-xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</Label>
              </div>
              <p className="text-sm font-semibold text-blue-600">Administrator</p>
            </div>
          )}

          <div className="p-4 bg-white rounded-xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Member Since</Label>
            </div>
            <p className="text-xs font-medium text-gray-900">{formatTimestamp(profile.createdAt)}</p>
          </div>

          <div className="p-4 bg-white rounded-xl border-2 border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Updated</Label>
            </div>
            <p className="text-xs font-medium text-gray-900">{formatTimestamp(profile.updatedAt)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Email Update Component
function EmailUpdate() {
  const user = auth.currentUser
  const [isOpen, setIsOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [step, setStep] = useState<'email' | 'verify'>('email')

  const reauthMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('Email required')
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
    },
    onSuccess: () => {
      verifyEmailMutation.mutate()
    },
    onError: (err) => setMessage({ type: 'error', text: err.message }),
  })

  const verifyEmailMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('No user')
      await verifyBeforeUpdateEmail(user, newEmail)
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Verification email sent! Check your new inbox to confirm.' })
      setTimeout(() => {
        setIsOpen(false)
        setNewEmail('')
        setCurrentPassword('')
        setStep('email')
      }, 3000)
    },
    onError: (err) => setMessage({ type: 'error', text: err.message }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (step === 'email') {
      if (!newEmail || newEmail === user?.email) {
        setMessage({ type: 'error', text: 'Please enter a new email address' })
        return
      }
      setStep('verify')
    } else {
      reauthMutation.mutate()
    }
  }

  const reset = () => {
    setIsOpen(false)
    setNewEmail('')
    setCurrentPassword('')
    setStep('email')
    setMessage({ type: '', text: '' })
  }

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        className="bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-md shadow-lg shadow-blue-500/25 hover:shadow-md transition-all duration-200 w-full sm:w-auto"
      >
        Update Email
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {step === 'email' ? 'Update Email' : 'Verify Identity'}
              </h3>
            </div>

            {message.text && (
              <div className={`p-3 rounded-md mb-4 flex items-center gap-3 border-l-4 ${
                message.type === 'error' 
                  ? 'bg-red-50 text-red-800 border-red-400' 
                  : 'bg-green-50 text-green-800 border-green-400'
              }`}>
                {message.type === 'error' ? 
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" /> : 
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                }
                <span className="font-medium text-sm">{message.text}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {step === 'email' ? (
                <div className="space-y-2">
                  <Label htmlFor="newEmail" className="text-sm font-medium text-gray-700">New Email Address</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="new@example.com"
                    required
                    className="border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-md transition-all duration-200"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-sm font-medium text-gray-700">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-md transition-all duration-200"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium transition-all duration-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={reauthMutation.isPending || verifyEmailMutation.isPending}
                  className="bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-md shadow-lg shadow-blue-500/25 hover:shadow-md transition-all duration-200 font-medium"
                >
                  {reauthMutation.isPending || verifyEmailMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : step === 'email' ? (
                    'Continue'
                  ) : (
                    'Send Verification'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// Password Update Component
function PasswordUpdate() {
  const user = auth.currentUser
  const [isOpen, setIsOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const hasPasswordProvider = user?.providerData.some(p => p.providerId === 'password')
  const isGoogleUser = user?.providerData.some(p => p.providerId === 'google.com')

  const reauthMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('Email required')
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
    },
    onSuccess: () => {
      updatePasswordMutation.mutate()
    },
    onError: (err) => setMessage({ type: 'error', text: err.message }),
  })

  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match')
      if (!user) throw new Error('No user')
      await updatePassword(user, newPassword)
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Password updated successfully!' })
      setTimeout(() => {
        setIsOpen(false)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }, 2000)
    },
    onError: (err) => setMessage({ type: 'error', text: err.message }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (!newPassword) {
      setMessage({ type: 'error', text: 'Please enter a new password' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }

    reauthMutation.mutate()
  }

  const reset = () => {
    setIsOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMessage({ type: '', text: '' })
  }

  if (isGoogleUser) {
    return (
      <Button variant="outline" disabled className="text-gray-400 border-gray-300 w-full sm:w-auto">
        Google Managed
      </Button>
    )
  }

  if (!hasPasswordProvider) {
    return (
      <Button variant="outline" disabled className="text-gray-400 border-gray-300 w-full sm:w-auto">
        No Password Set
      </Button>
    )
  }

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        className="bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-md shadow-lg shadow-purple-500/25 hover:shadow-md transition-all duration-200 font-medium w-full sm:w-auto"
      >
        Update Password
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                <Lock className="h-4 w-4 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Update Password</h3>
            </div>

            {message.text && (
              <div className={`p-3 rounded-md mb-4 flex items-center gap-3 border-l-4 ${
                message.type === 'error' 
                  ? 'bg-red-50 text-red-800 border-red-400' 
                  : 'bg-green-50 text-green-800 border-green-400'
              }`}>
                {message.type === 'error' ? 
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" /> : 
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                }
                <span className="font-medium text-sm">{message.text}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-sm font-medium text-gray-700">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-md transition-all duration-200 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium text-gray-700">New Password</Label>
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  className="border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-md transition-all duration-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  className="border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-md transition-all duration-200"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium transition-all duration-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={reauthMutation.isPending || updatePasswordMutation.isPending}
                  className="bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-md shadow-lg shadow-purple-500/25 hover:shadow-md transition-all duration-200 font-medium"
                >
                  {reauthMutation.isPending || updatePasswordMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// Password Reset Component
function PasswordReset() {
  const user = auth.currentUser
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('Email required')
      await sendPasswordResetEmail(auth, user.email)
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Password reset email sent! Check your inbox.' })
      setTimeout(() => {
        setIsOpen(false)
      }, 2000)
    },
    onError: (err) => setMessage({ type: 'error', text: err.message }),
  })

  const handleReset = () => {
    setMessage({ type: '', text: '' })
    resetMutation.mutate()
  }

  return (
    <>
      <Button 
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-md font-medium transition-all duration-200 w-full sm:w-auto"
      >
        Reset Password
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                <Lock className="h-4 w-4 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Reset Password</h3>
            </div>

            {message.text && (
              <div className={`p-3 rounded-md mb-4 flex items-center gap-3 border-l-4 ${
                message.type === 'error' 
                  ? 'bg-red-50 text-red-800 border-red-400' 
                  : 'bg-green-50 text-green-800 border-green-400'
              }`}>
                {message.type === 'error' ? 
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" /> : 
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                }
                <span className="font-medium text-sm">{message.text}</span>
              </div>
            )}

            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                We'll send a password reset link to your email address:
              </p>
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="font-medium text-gray-900 text-center truncate">{user?.email}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium transition-all duration-200"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReset}
                  disabled={resetMutation.isPending}
                  className="bg-linear-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-md shadow-lg shadow-orange-500/25 hover:shadow-md transition-all duration-200 font-medium"
                >
                  {resetMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}