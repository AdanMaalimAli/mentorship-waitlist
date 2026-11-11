import { useEffect, useState } from 'react'
import Admin from './Admin.jsx'
import ReserveForm from './ReserveForm.jsx'
import { formatAmount, formatMoney, formatStart, usePublicConfig, whatsappLink } from './config.js'

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return hash
}

function useCountdown(iso) {
  const target = new Date(iso).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const diff = Number.isNaN(target) ? 0 : Math.max(0, target - now)
  return {
    done: diff === 0,
    days: Math.floor(diff / 86400000),
    hours: Math.floor(diff / 3600000) % 24,
    minutes: Math.floor(diff / 60000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
  }
}

export default function App() {
  const hash = useHash()
  const [stats, refresh] = usePublicConfig()

  useEffect(() => {
    document.title = hash === '#book' ? 'Seat book · Trading mentorship' : 'Trading mentorship · Secure a seat'
    if (hash === '#book' || hash === '#top' || hash === '') window.scrollTo(0, 0)
  }, [hash])

  if (hash === '#book') return <Admin />
  return <Site stats={stats} refresh={refresh} />
}

function Site({ stats, refresh }) {
  const countdown = useCountdown(stats.startsAt)
  const money = formatMoney(stats.price, stats.currency)
  const date = formatStart(stats.startsAt)
  const phoneHref = `tel:${stats.phoneTel}`
  const introWhatsapp = whatsappLink(
    stats.whatsapp,
    'Hi, I want a seat in the trading mentorship. My name is ',
  )

  const facts = [
    {
      title: 'One period, one fee',
      body: `The fee is ${money} ${stats.priceNote}, starting ${date}. When that period ends, staying on is another ${money}.`,
    },
    {
      title: 'Your trades stay yours',
      body: 'Bring the trades and the questions. You still place every trade yourself. This is teaching and review, not a promise of profit.',
    },
    {
      title: 'A direct line',
      body: `Call or WhatsApp ${stats.phoneDisplay}. That number is how we talk. There is no other desk.`,
    },
  ]

  const questions = [
    {
      q: 'When does it start?',
      a: `It starts on ${date}. The countdown is Nairobi time.`,
    },
    {
      q: 'How do I pay?',
      a: `M-Pesa, Send money, to ${stats.phoneDisplay}. The amount is ${money}. Then paste the confirmation code from the SMS into the seat slip. It is not a paybill and not a till.`,
    },
    {
      q: 'Is the seat mine as soon as I submit?',
      a: 'Submitting a code holds the seat while I match it to the M-Pesa message. I WhatsApp you when it matches. If it does not match, I release the seat.',
    },
    {
      q: 'Can I just leave my details?',
      a: 'Yes. Leave the payment box unchecked and save your details. That does not hold a seat. I will contact you on WhatsApp.',
    },
    {
      q: 'What if every seat is held?',
      a: 'The form switches to details only. Do not send money until I tell you a seat is open.',
    },
    {
      q: 'What does the fee cover?',
      a: `The mentorship from ${date}. The fee is ${money} ${stats.priceNote}. The next period is the same fee if you stay.`,
    },
    {
      q: 'Do you guarantee profits?',
      a: 'No. You place your own trades. The mentorship is teaching and review, not a promise that you will make money.',
    },
  ]

  return (
    <div id="top" className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
          <a href="#top" className="font-serif text-lg tracking-tight">
            Mentorship
          </a>
          <div className="flex items-center gap-3 sm:gap-4">
            <a className="text-sm tabular-nums hover:text-gold" href={phoneHref}>
              {stats.phoneDisplay}
            </a>
            <a
              href="#reserve"
              className="rounded-full bg-paper px-3.5 py-2 text-sm font-medium text-ink hover:bg-gold"
            >
              <span className="sm:hidden">Secure</span>
              <span className="hidden sm:inline">Secure a seat</span>
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-12 pb-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-12 lg:pt-16 lg:pb-24">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">Opens {date}</p>
            <div className="mt-4 h-px w-12 bg-gold" />
            <h1 className="mt-5 font-serif text-[3.15rem] leading-[0.92] tracking-[-0.035em] sm:text-7xl">
              Take a seat
              <span className="mt-1 block italic text-gold">in the room.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              I&apos;m opening a trading mentorship on {date}. {stats.spotsLeft} of the {stats.spotsTotal} seats are still open. The fee is{' '}
              {money} {stats.priceNote}. Pay it with M-Pesa to{' '}
              <a className="text-paper underline decoration-gold underline-offset-4" href={phoneHref}>
                {stats.phoneDisplay}
              </a>
              , or leave your details and I will reach you on WhatsApp.
            </p>

            <div className="mt-8">
              <p className="sr-only">Mentorship starts {date}.</p>
              {countdown.done ? (
                <p className="text-lg">The mentorship has started. Seats that are still open can still be taken.</p>
              ) : (
                <Countdown countdown={countdown} />
              )}
            </div>

            <div className="mt-8">
              <SeatDetails stats={stats} money={money} />
            </div>
          </div>

          <div className="lg:sticky lg:top-24">
            <ReserveForm stats={stats} onSaved={refresh} />
          </div>
        </section>

        <section className="border-t border-line" aria-labelledby="about-heading">
          <h2 id="about-heading" className="sr-only">
            What the month is
          </h2>
          <div className="mx-auto max-w-6xl sm:grid sm:grid-cols-3">
            {facts.map((fact) => (
              <article key={fact.title} className="border-b border-line px-5 py-8 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
                <h3 className="font-serif text-2xl tracking-tight">{fact.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{fact.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-line" aria-labelledby="fee-heading">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-2 lg:items-end lg:py-24">
            <div>
              <h2 id="fee-heading" className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                The fee
              </h2>
              <p className="mt-3 font-serif text-7xl tracking-[-0.04em] sm:text-8xl">
                <span className="mr-2 align-top font-sans text-lg font-medium tracking-normal text-muted">Ksh</span>
                {formatAmount(stats.price)}
              </p>
              <p className="mt-2 text-muted">{stats.priceNote}, paid to {stats.phoneDisplay}</p>
            </div>
            <div className="max-w-md">
              <p className="text-lg leading-relaxed text-muted">
                Send the first payment with M-Pesa Send Money to hold your seat. I match the message before the seat is final.
              </p>
              <a
                href="#reserve"
                className="mt-6 inline-flex rounded-full bg-paper px-5 py-3 text-base font-medium text-ink hover:bg-gold"
              >
                Secure a seat
              </a>
            </div>
          </div>
        </section>

        <section className="border-t border-line" aria-labelledby="questions-heading">
          <div className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
            <h2 id="questions-heading" className="font-serif text-4xl tracking-tight">
              Questions
            </h2>
            <div className="mt-6 border-t border-line">
              {questions.map((item) => (
                <details key={item.q} className="group border-b border-line py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span className="font-serif text-2xl tracking-tight">{item.q}</span>
                    <span className="text-xl text-gold transition group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pt-3 leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line" aria-labelledby="call-heading">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <h2 id="call-heading" className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Call or WhatsApp
            </h2>
            <a href={phoneHref} className="mt-4 block font-serif text-5xl tracking-tight sm:text-7xl">
              {stats.phoneDisplay}
            </a>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={introWhatsapp}
                className="inline-flex rounded-full bg-paper px-5 py-3 text-base font-medium text-ink hover:bg-gold"
              >
                Message me
              </a>
              <a
                href={phoneHref}
                className="inline-flex rounded-full border border-line px-5 py-3 text-base font-medium hover:border-paper"
              >
                Call
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
          <p className="max-w-xl leading-relaxed">
            You make your own trading decisions. This mentorship is teaching and review, not a guarantee of profit.
          </p>
          <a href="#book" className="underline decoration-line underline-offset-4 hover:text-paper">
            Seat book
          </a>
        </div>
      </footer>
    </div>
  )
}

function SeatDetails({ stats, money }) {
  const steps = [
    'Leave your name, phone, and email.',
    `Send ${money} to ${stats.phoneDisplay} with M-Pesa Send Money.`,
    'Paste the confirmation code. I match it, then WhatsApp you.',
  ]
  return (
    <>
      <div className="grid max-w-md grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[#d7d1c3] px-4 py-4">
          <p className="font-serif text-5xl tabular-nums leading-none">{stats.spotsLeft}</p>
          <p className="mt-2 text-sm font-medium">Available</p>
        </div>
        <div className="rounded-2xl bg-gold px-4 py-4 text-ink">
          <p className="font-serif text-5xl tabular-nums leading-none">{stats.spotsTaken}</p>
          <p className="mt-2 text-sm font-medium">Taken</p>
        </div>
      </div>
      <div className="mt-4 flex gap-5 text-sm">
        <p className="flex items-center gap-2">
          <span className="size-3.5 rounded-sm border border-[#d7d1c3]" aria-hidden="true" />
          Available
        </p>
        <p className="flex items-center gap-2">
          <span className="size-3.5 rounded-sm bg-gold" aria-hidden="true" />
          Taken
        </p>
      </div>
      <SeatMap total={stats.spotsTotal} taken={stats.spotsTaken} />
      <ol className="mt-8 max-w-md space-y-3 text-sm leading-relaxed">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="font-serif tabular-nums text-paper">0{index + 1}</span>
            <span className="text-muted">{step}</span>
          </li>
        ))}
      </ol>
    </>
  )
}

function Countdown({ countdown }) {
  const cells = [
    ['Days', countdown.days],
    ['Hours', countdown.hours],
    ['Min', countdown.minutes],
    ['Sec', countdown.seconds],
  ]
  return (
    <div aria-hidden="true" className="grid max-w-md grid-cols-4 gap-2">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-line bg-white/[0.03] px-2 py-3 text-center">
          <div className="font-serif text-3xl tabular-nums">{String(value).padStart(2, '0')}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted">{label}</div>
        </div>
      ))}
    </div>
  )
}

function SeatMap({ total, taken }) {
  if (total <= 0 || total > 20) return null
  return (
    <ol
      aria-label={`${taken} of ${total} seats held`}
      className="mt-3 grid max-w-xs grid-cols-5 gap-1.5"
    >
      {Array.from({ length: total }, (_, index) => {
        const held = index < taken
        return (
          <li
            key={index}
            aria-hidden="true"
            className={`flex h-9 items-center justify-center rounded-md text-[11px] tabular-nums ${
              held ? 'bg-gold text-ink' : 'border border-[#d7d1c3] text-paper'
            }`}
          >
            {String(index + 1).padStart(2, '0')}
          </li>
        )
      })}
    </ol>
  )
}
