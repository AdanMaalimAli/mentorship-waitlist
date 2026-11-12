import { useState } from 'react'
import {
  EXPERIENCE,
  api,
  formatAmount,
  formatMoney,
  normalizePhone,
  whatsappLink,
} from './config.js'

const inputClass =
  'w-full rounded-xl border border-[#e2dac8] bg-white px-3.5 py-3 text-base text-[#172016] outline-none placeholder:text-[#5e5a50] focus:border-[#172016]'

export default function ReserveForm({ stats, onSaved }) {
  const [values, setValues] = useState({
    name: '',
    phone: '',
    email: '',
    experience: '',
    note: '',
    mpesaCode: '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)

  function set(key, value) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setFormError('')
  }

  function reset() {
    setSuccess(null)
    setFormError('')
    setErrors({})
    setValues({
      name: '',
      phone: '',
      email: '',
      experience: '',
      note: '',
      mpesaCode: '',
    })
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (saving) return
    const nextErrors = validate(values, stats)
    setErrors(nextErrors)
    const firstInvalid = ['name', 'phone', 'email', 'experience', 'mpesaCode'].find(
      (key) => nextErrors[key],
    )
    if (firstInvalid) {
      document.getElementById(`reserve-${firstInvalid}`)?.focus()
      return
    }

    if (stats.full) {
      setFormError('Every seat is held. Do not send money until a seat opens.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch(api('/api/reservations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          phone: values.phone,
          email: values.email,
          experience: values.experience,
          note: values.note,
          intent: 'pay',
          mpesaCode: values.mpesaCode,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error || `I could not save this. Call ${stats.phoneDisplay}.`)
        onSaved?.()
        return
      }
      setSuccess(data.reservation)
      onSaved?.()
    } catch {
      setFormError(`I could not save this. Try again, or WhatsApp the M-Pesa code to ${stats.phoneDisplay}.`)
    } finally {
      setSaving(false)
    }
  }

  const money = formatMoney(stats.price, stats.currency)

  return (
    <div id="reserve" className="rounded-[28px] bg-paper p-6 text-[#172016] shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8">
      {success ? (
        <Success stats={stats} reservation={success} onReset={reset} />
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#5c564a]">Seat slip</p>
            <p className="font-serif text-2xl tracking-tight">{money}</p>
          </div>
          <p className="mt-1 text-sm text-[#4d5647]">
            {stats.priceNote}. {stats.spotsLeft} available · {stats.spotsTaken} taken.
          </p>

          <div className="mt-6 space-y-4">
            <Field id="reserve-name" label="Full name" error={errors.name}>
              <input
                id="reserve-name"
                className={inputClass}
                autoComplete="name"
                value={values.name}
                onChange={(event) => set('name', event.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'reserve-name-error' : undefined}
              />
            </Field>
            <Field id="reserve-phone" label="WhatsApp number" error={errors.phone}>
              <input
                id="reserve-phone"
                className={inputClass}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="07XX XXX XXX"
                value={values.phone}
                onChange={(event) => set('phone', event.target.value)}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? 'reserve-phone-error' : undefined}
              />
            </Field>
            <Field id="reserve-email" label="Email" error={errors.email}>
              <input
                id="reserve-email"
                className={inputClass}
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(event) => set('email', event.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'reserve-email-error' : undefined}
              />
            </Field>
            <Field id="reserve-experience" label="Where you are with trading" error={errors.experience}>
              <div className="relative">
                <select
                  id="reserve-experience"
                  className={`${inputClass} appearance-none pr-10`}
                  value={values.experience}
                  onChange={(event) => set('experience', event.target.value)}
                  aria-invalid={Boolean(errors.experience)}
                  aria-describedby={errors.experience ? 'reserve-experience-error' : undefined}
                >
                  <option value="">Select one</option>
                  {EXPERIENCE.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <Chevron />
              </div>
            </Field>
            <Field id="reserve-note" label="Anything you want help with" error="">
              <textarea
                id="reserve-note"
                className={`${inputClass} min-h-24 resize-y`}
                maxLength={400}
                placeholder="Optional. A market you trade, or a question you keep having."
                value={values.note}
                onChange={(event) => set('note', event.target.value)}
              />
            </Field>
          </div>

          <div className="mt-6 border-t border-dashed border-[#d9d0be] pt-6">
            {stats.full ? (
              <p className="rounded-2xl bg-[#172016] px-4 py-4 text-sm leading-relaxed text-paper">
                Every seat is held. Joining needs a payment, and there is no open seat. Do not send money until one is released.
              </p>
            ) : (
              <PaymentBlock
                stats={stats}
                code={values.mpesaCode}
                codeError={errors.mpesaCode}
                onCode={(code) => set('mpesaCode', code)}
              />
            )}
          </div>

          {formError ? (
            <p role="alert" className="mt-4 text-sm leading-relaxed text-[#8f2d2d]">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving || stats.full}
            className="mt-5 w-full cursor-pointer rounded-full bg-[#172016] px-4 py-3.5 text-base font-medium text-paper hover:bg-[#2a3824] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Join the waitlist'}
          </button>
          <p className="mt-3 text-center text-sm leading-relaxed text-[#4d5647]">
            Payment is required. Send {money} first, then paste the M-Pesa code.
          </p>
        </form>
      )}
    </div>
  )
}

function PaymentBlock({ stats, code, codeError, onCode }) {
  return (
    <div>
      <div className="rounded-2xl bg-[#172016] px-4 py-4 text-paper">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#efe8d6]">
          M-Pesa · Send money
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#d9d3c4]">
          Not a paybill and not a till. Send to this phone, then paste the code from the SMS.
        </p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#d4cec0]">Number</p>
            <p className="font-serif text-3xl tracking-tight">{stats.phoneDisplay}</p>
          </div>
          <CopyButton text={stats.phoneDisplay.replace(/\s/g, '')} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/10 pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#d4cec0]">Amount</p>
            <p className="font-serif text-3xl tracking-tight">{formatAmount(stats.price)}</p>
          </div>
          <CopyButton text={String(stats.price)} />
        </div>
      </div>

      <div className="mt-4">
        <Field id="reserve-mpesaCode" label="M-Pesa confirmation code" error={codeError}>
          <input
            id="reserve-mpesaCode"
            className={`${inputClass} uppercase tracking-[0.18em]`}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            placeholder="e.g. QH72KX9LMA"
            value={code}
            onChange={(event) => onCode(event.target.value)}
            aria-invalid={Boolean(codeError)}
            aria-describedby={codeError ? 'reserve-mpesaCode-error' : undefined}
          />
        </Field>
      </div>
    </div>
  )
}

function Success({ stats, reservation, onReset }) {
  const message = `Hi, I joined the waitlist. My name is ${reservation.name}. M-Pesa code ${reservation.mpesaCode}.`

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#5c564a]">
        Seat on hold
      </p>
      <h2 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight break-words">
        {reservation.name.split(' ')[0]}, your seat is held.
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-[#4d5647]">
        I have M-Pesa code <span className="font-medium tracking-[0.08em] text-[#172016]">{reservation.mpesaCode}</span>.
        I will match it to the payment on <span className="whitespace-nowrap">{stats.phoneDisplay}</span>, then WhatsApp you on <span className="whitespace-nowrap">{reservation.phone}</span>. If it does not match, I release the seat.
      </p>
      <a
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#172016] px-4 py-3.5 text-base font-medium text-paper hover:bg-[#2a3824]"
        href={whatsappLink(stats.whatsapp, message)}
      >
        WhatsApp {stats.phoneDisplay}
      </a>
      <button
        type="button"
        className="mt-3 w-full cursor-pointer py-2 text-sm font-medium text-[#172016] underline decoration-[#e4c27a] underline-offset-4"
        onClick={onReset}
      >
        Add someone else
      </button>
    </div>
  )
}

function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-[#5c564a]">
        {label}
        {id === 'reserve-note' ? <span className="ml-2 normal-case tracking-normal text-[#6d6a60]">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-[#8f2d2d]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="cursor-pointer text-xs font-medium text-paper underline decoration-gold underline-offset-4"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#5c564a]"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function validate(values, stats) {
  const errors = {}
  const name = values.name.trim()
  if (name.length < 2 || !/[a-z]/i.test(name)) errors.name = 'Enter your full name.'
  if (!normalizePhone(values.phone)) errors.phone = 'Use a Kenyan number, like 07XX XXX XXX.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (!EXPERIENCE.some((item) => item.value === values.experience)) {
    errors.experience = 'Choose the option that fits.'
  }
  if (!stats.full) {
    const raw = values.mpesaCode.toUpperCase()
    const word = raw.match(/\b[A-Z0-9]{10}\b/)
    const compact = raw.replace(/[^A-Z0-9]/g, '')
    if (!word && !/^[A-Z0-9]{8,12}$/.test(compact)) {
      errors.mpesaCode = 'Paste the code from the M-Pesa SMS. It is about 10 letters and numbers.'
    }
  }
  return errors
}
