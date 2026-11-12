import { useCallback, useEffect, useState } from 'react'

/** Mirror of server/index.js SETTINGS, used until /api/stats loads. */
export const FALLBACK = {
  spotsTotal: 20,
  spotsTaken: 9,
  spotsLeft: 11,
  full: false,
  price: 10000,
  currency: 'KES',
  priceNote: 'for the whole two months',
  phoneDisplay: '0726 039 327',
  phoneTel: '+254726039327',
  whatsapp: '254726039327',
  startsAt: '2026-11-26T00:00:00+03:00',
}

export const EXPERIENCE = [
  { value: 'new', label: 'I am new to trading' },
  { value: 'some', label: 'I have placed some trades' },
  { value: 'active', label: 'I trade regularly' },
]

export function experienceLabel(value) {
  return EXPERIENCE.find((item) => item.value === value)?.label || value
}

export function formatMoney(amount, currency = 'KES') {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatAmount(amount) {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(amount)
}

export function formatStart(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(date)
}

export function formatWhen(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  }).format(date)
}

export function prettyPhone(stored) {
  const digits = String(stored ?? '').replace(/\D/g, '')
  const local = digits.startsWith('254') ? `0${digits.slice(3)}` : digits
  const match = local.match(/^(\d{4})(\d{3})(\d{3})$/)
  return match ? `${match[1]} ${match[2]} ${match[3]}` : local || String(stored ?? '')
}

export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '')
  let next = digits
  if (next.startsWith('0')) next = `254${next.slice(1)}`
  else if (/^[71]\d{8}$/.test(next)) next = `254${next}`
  if (!/^254[71]\d{8}$/.test(next)) return ''
  return next
}

export function whatsappLink(phone, text) {
  const base = `https://wa.me/${phone}`
  if (!text) return base
  return `${base}?text=${encodeURIComponent(text)}`
}

/** Empty in local dev, where Vite proxies /api. On Vercel this is the Render URL. */
export function api(path) {
  const base = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  return `${base}${path}`
}

export function usePublicConfig() {
  const [stats, setStats] = useState(FALLBACK)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(api('/api/stats'))
      if (!res.ok) return false
      const data = await res.json()
      setStats({ ...FALLBACK, ...data })
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let stopped = false
    let timer
    const attempt = async (tryNumber) => {
      const ok = await refresh()
      if (!ok && !stopped && tryNumber < 20) {
        timer = window.setTimeout(() => attempt(tryNumber + 1), tryNumber < 4 ? 400 : 3000)
      }
    }
    attempt(0)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return [stats, refresh]
}
