export function isCardNumberPlausible(num: string) {
  const cleaned = (num || '').replace(/\s/g, '')
  return cleaned.length >= 13 && cleaned.length <= 19 && /^\d+$/.test(cleaned)
}

export function isCvvValid(cvv: string) {
  return /^[0-9]{3,4}$/.test(cvv || '')
}

export function validateExpiry(mm: string | number, yyyy: string | number) {
  const m = Number(mm)
  const y = Number(yyyy)
  if (!Number.isFinite(m) || !Number.isFinite(y)) return false
  if (m < 1 || m > 12) return false
  const now = new Date()
  const thisYear = now.getFullYear()
  if (y < thisYear) return false
  if (y === thisYear) {
    const thisMonth = now.getMonth() + 1
    if (m < thisMonth) return false
  }
  return true
}

export function formatExpiryMMYY(month: number, year: number) {
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}
