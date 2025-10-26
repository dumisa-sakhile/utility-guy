import * as React from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, Check, X } from 'lucide-react'


function evaluatePassword(pw: string) {
  const res = {
    length: pw.length >= 8,
    number: /[0-9]/.test(pw),
    upper: /[A-Z]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
  const passed = Object.values(res).filter(Boolean).length
  const label = pw.length === 0 ? 'empty' : passed <= 1 ? 'weak' : passed === 2 || passed === 3 ? 'medium' : 'strong'
  return { criteria: res, passed, label }
}

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  showStrength?: boolean
}

const PasswordInput = ({ value, onChange, className, showStrength = true, ...props }: Props) => {
  const [visible, setVisible] = React.useState(false)
  const s = evaluatePassword(value)

  const color = s.label === 'weak' ? 'bg-red-500' : s.label === 'medium' ? 'bg-amber-400' : 'bg-green-500'

  return (
    <div>
      <div className="relative">
        <Input
          {...props}
          value={value}
          onChange={onChange}
          type={visible ? 'text' : 'password'}
          className={cn('pr-10', className)}
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center p-1 text-black/70"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {showStrength && (
        <div className="mt-2">
          <div className="h-2 w-full bg-black/10 rounded-full overflow-hidden">
            <div className={`h-full ${color}`} style={{ width: `${(s.passed / 4) * 100}%` }} />
          </div>
          <div className="text-xs mt-1 text-black flex items-center gap-3">
            <div>Password strength: <span className="font-semibold">{s.label}</span></div>
          </div>

          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex items-center gap-2">
              {s.criteria.length ? <Check size={14} className="text-green-600" /> : <X size={14} className="text-red-500" />}
              <span className="text-black">At least 8 characters</span>
            </li>
            <li className="flex items-center gap-2">
              {s.criteria.number ? <Check size={14} className="text-green-600" /> : <X size={14} className="text-red-500" />}
              <span className="text-black">A number (0-9)</span>
            </li>
            <li className="flex items-center gap-2">
              {s.criteria.upper ? <Check size={14} className="text-green-600" /> : <X size={14} className="text-red-500" />}
              <span className="text-black">An uppercase letter</span>
            </li>
            <li className="flex items-center gap-2">
              {s.criteria.special ? <Check size={14} className="text-green-600" /> : <X size={14} className="text-red-500" />}
              <span className="text-black">A special character (e.g., !@#$%)</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

export { PasswordInput }
