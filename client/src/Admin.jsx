import { useCallback, useEffect, useState } from 'react'
import { api, experienceLabel, formatMoney, formatWhen, prettyPhone, whatsappLink } from './config.js'

const FILTERS = [
  ['all', 'All'],
  ['pending', 'To match'],
  ['confirmed', 'Confirmed'],
  ['waitlist', 'Details only'],
  ['released', 'Released'],
]

const STATUS = {
  pending: { label: 'To match', className: 'bg-gold text-ink' },
  confirmed: { label: 'Confirmed', className: 'bg-[#c6f07a] text-ink' },
  waitlist: { label: 'Details only', className: 'border border-line text-paper' },
  released: { label: 'Released', className: 'border border-line text-muted' },
}

export default function Admin() {
  const [key, setKey] = useState(() => sessionStorage.getItem('seat-book-key') || '')
  const [draft, setDraft] = useState(() => sessionStorage.getItem('seat-book-key') || '')
  const [rows, setRows] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [updatingId, setUpdatingId] = useState('')

  const load = useCallback(async (bookKey) => {
    const res = await fetch(api('/api/reservations'), {
      headers: { 'x-admin-key': bookKey },
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) {
      sessionStorage.removeItem('seat-book-key')
      setKey('')
      setRows(null)
      setError('That key is not right.')
      return
    }
    if (!res.ok) {
      setError(data.error || 'Could not open the book.')
      return
    }
    sessionStorage.setItem('seat-book-key', bookKey)
    setError('')
    setKey(bookKey)
    setRows(data.reservations)
    setStats(data.stats)
  }, [])

  useEffect(() => {
    if (!key) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- response updates state after the request returns
    void load(key)
  }, [key, load])

  async function setStatus(row, status) {
    if (status === 'released') {
      const sure = window.confirm(`Release ${row.name}'s seat?`)
      if (!sure) return
    }
    setUpdatingId(row.id)
    setError('')
    try {
      const res = await fetch(api(`/api/reservations/${row.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': key,
        },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not update that seat.')
        return
      }
      setRows((current) => current.map((item) => (item.id === row.id ? data.reservation : item)))
      if (data.stats) setStats(data.stats)
    } catch {
      setError('Could not update that seat.')
    } finally {
      setUpdatingId('')
    }
  }

  function lock() {
    sessionStorage.removeItem('seat-book-key')
    setKey('')
    setDraft('')
    setRows(null)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4">
          <a href="#top" className="text-sm text-muted hover:text-paper">
            The page
          </a>
          <p className="font-serif text-xl">Seat book</p>
          {key ? (
            <button type="button" className="cursor-pointer text-sm text-muted hover:text-paper" onClick={lock}>
              Lock
            </button>
          ) : (
            <span className="w-10" />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        {!key ? (
          <form
            className="mx-auto max-w-md rounded-[28px] bg-paper p-6 text-[#172016] sm:p-8"
            onSubmit={(event) => {
              event.preventDefault()
              setKey(draft.trim())
            }}
          >
            <h1 className="font-serif text-4xl tracking-tight">Open the book</h1>
            <p className="mt-3 text-sm leading-relaxed text-[#4d5647]">
              This is the list of people who reserved or left their details. The key is in server/.env.
            </p>
            <label htmlFor="book-key" className="mt-6 mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-[#5c564a]">
              Book key
            </label>
            <input
              id="book-key"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-[#e2dac8] bg-white px-3.5 py-3 text-base outline-none focus:border-[#172016]"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error ? (
              <p role="alert" className="mt-3 text-sm text-[#8f2d2d]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="mt-5 w-full cursor-pointer rounded-full bg-[#172016] py-3.5 font-medium text-paper"
            >
              Open
            </button>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-serif text-4xl tracking-tight">Who is in</h1>
                {stats ? (
                  <p className="mt-2 text-sm text-muted">
                    {stats.spotsLeft} open · {stats.spotsTaken} held · fee {formatMoney(stats.price, stats.currency)} {stats.priceNote}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="cursor-pointer text-sm text-paper underline decoration-gold underline-offset-4"
                onClick={() => load(key)}
              >
                Refresh
              </button>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
              Confirm a seat after the M-Pesa message matches the code. Release it if the code does not match, so the seat can be taken by someone else.
            </p>

            {error ? (
              <p role="alert" className="mt-4 text-sm text-[#ffb4b4]">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter seats">
              {FILTERS.map(([id, label]) => {
                const count = rows ? (id === 'all' ? rows.length : rows.filter((row) => row.status === id).length) : 0
                const active = filter === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-sm ${
                      active ? 'bg-paper text-ink' : 'border border-line text-muted'
                    }`}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                    {count ? ` ${count}` : ''}
                  </button>
                )
              })}
            </div>

            <div className="mt-6 space-y-3">
              {rows === null ? <p className="text-muted">Opening the book…</p> : null}
              {rows && shown(rows, filter).length === 0 ? (
                <p className="rounded-3xl border border-line px-5 py-8 text-muted">
                  {rows.length === 0 ? 'No one has reserved yet.' : 'Nothing in this filter.'}
                </p>
              ) : null}
              {rows
                ? shown(rows, filter).map((row) => (
                    <ReservationCard
                      key={row.id}
                      row={row}
                      busy={updatingId === row.id}
                      onStatus={setStatus}
                    />
                  ))
                : null}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function shown(rows, filter) {
  if (filter === 'all') return rows
  return rows.filter((row) => row.status === filter)
}

function ReservationCard({ row, busy, onStatus }) {
  const status = STATUS[row.status] || STATUS.waitlist
  const phone = prettyPhone(row.phone)

  return (
    <article className="rounded-3xl border border-line bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl tracking-tight break-words">{row.name}</h2>
          <p className="mt-1 text-sm text-muted">{formatWhen(row.createdAt)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
          {status.label}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted">Phone</dt>
          <dd className="mt-1">
            <a className="underline decoration-gold underline-offset-4" href={`tel:+${String(row.phone).replace(/\D/g, '')}`}>
              {phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted">Email</dt>
          <dd className="mt-1 break-all">
            <a className="underline decoration-gold underline-offset-4" href={`mailto:${row.email}`}>
              {row.email}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted">Trading</dt>
          <dd className="mt-1">{experienceLabel(row.experience)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted">M-Pesa code</dt>
          <dd className="mt-1 font-mono tracking-[0.12em]">{row.mpesaCode || '—'}</dd>
        </div>
      </dl>
      {row.note ? <p className="mt-4 text-sm leading-relaxed text-muted">{row.note}</p> : null}
      {row.amount ? (
        <p className="mt-3 text-sm text-muted">{formatMoney(row.amount)} claimed</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="rounded-full border border-line px-3 py-2 text-sm hover:border-paper"
          href={whatsappLink(String(row.phone).replace(/\D/g, ''), `Hi ${row.name}, this is about your seat in the trading mentorship.`)}
        >
          WhatsApp
        </a>
        {row.status === 'pending' ? (
          <button
            type="button"
            disabled={busy}
            className="cursor-pointer rounded-full bg-paper px-3 py-2 text-sm font-medium text-ink disabled:opacity-60"
            onClick={() => onStatus(row, 'confirmed')}
          >
            Confirm payment
          </button>
        ) : null}
        {row.status === 'waitlist' ? (
          <button
            type="button"
            disabled={busy}
            className="cursor-pointer rounded-full bg-paper px-3 py-2 text-sm font-medium text-ink disabled:opacity-60"
            onClick={() => onStatus(row, 'confirmed')}
          >
            Mark confirmed
          </button>
        ) : null}
        {row.status !== 'released' ? (
          <button
            type="button"
            disabled={busy}
            className="cursor-pointer rounded-full border border-line px-3 py-2 text-sm disabled:opacity-60"
            onClick={() => onStatus(row, 'released')}
          >
            Release
          </button>
        ) : null}
      </div>
    </article>
  )
}
