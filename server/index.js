import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Cohort settings. The page reads these from /api/stats.
 * phoneDisplay is the number people see. whatsapp is the same line without a plus or leading zero.
 * priceNote is the wording after the fee, for example "per month".
 * startsAt is the opening moment, Nairobi time (UTC+3).
 */
const SETTINGS = {
  spotsTotal: 20,
  alreadyTaken: 9,
  price: 10000,
  currency: 'KES',
  priceNote: 'per month',
  phoneDisplay: '0726 039 327',
  phoneTel: '+254726039327',
  whatsapp: '254726039327',
  startsAt: '2026-11-26T00:00:00+03:00',
}

const EXPERIENCE = new Set(['new', 'some', 'active'])
const STATUSES = new Set(['pending', 'confirmed', 'waitlist', 'released'])
const DATA_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'signups.json')
const DIST_DIR = path.join(__dirname, '..', 'client', 'dist')
let reservations = null

loadEnv()

const PORT = Number(process.env.PORT) || 8787
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '20kb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, store: reservations ? 'atlas' : 'file' })
})

const hits = new Map()
let queue = Promise.resolve()

app.get('/api/stats', async (_req, res) => {
  try {
    const rows = await readRows()
    res.json(publicStats(rows))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not load the seats.' })
  }
})

app.post('/api/reservations', async (req, res) => {
  if (limited(req.ip)) {
    return res.status(429).json({
      error: `Too many attempts. WhatsApp ${SETTINGS.phoneDisplay} and I will write you down.`,
    })
  }

  try {
    const outcome = await update((rows) => createReservation(req.body ?? {}, rows))
    res.status(outcome.status).json(outcome.body)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: `Something went wrong. Call ${SETTINGS.phoneDisplay}.` })
  }
})

app.get('/api/reservations', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const rows = await readRows()
    res.json({
      reservations: rows.slice().reverse(),
      stats: publicStats(rows),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not open the seat book.' })
  }
})

app.patch('/api/reservations/:id', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Unknown seat.' })
  }
  const status = req.body?.status
  if (!STATUSES.has(status)) return res.status(400).json({ error: 'Unknown status.' })

  try {
    const outcome = await update((rows) => {
      const row = rows.find((item) => item.id === req.params.id)
      if (!row) return { write: false, status: 404, body: { error: 'No seat with that id.' } }
      row.status = status
      row.updatedAt = new Date().toISOString()
      return {
        write: true,
        status: 200,
        body: { reservation: row, stats: publicStats(rows) },
      }
    })
    res.status(outcome.status).json(outcome.body)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update that seat.' })
  }
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Could not read that.' })
  }
  console.error(error)
  res.status(500).json({ error: 'Something went wrong.' })
})

async function start() {
  try {
    await connectDb()
  } catch (error) {
    console.error('Could not reach Atlas.', error.message)
    process.exit(1)
  }

  const server = app.listen(PORT, () => {
    const where = reservations ? 'Atlas' : 'a local file'
    console.log(`Seat book ready at http://127.0.0.1:${PORT} (${where})`)
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`)
    } else {
      console.error(error)
    }
    process.exit(1)
  })
}

start()

function createReservation(body, rows) {
  const name = clean(body.name, 80)
  const email = clean(body.email, 120).toLowerCase()
  const phone = normalizePhone(body.phone)
  const experience = clean(body.experience, 20)
  const note = clean(body.note, 400)
  const intent = body.intent === 'pay' || body.intent === 'details' ? body.intent : ''

  if (name.length < 2 || !/[a-z]/i.test(name)) {
    return fail(400, 'Enter your full name.')
  }
  if (!phone) return fail(400, 'Enter a valid Kenyan phone number.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Enter a valid email address.')
  if (!EXPERIENCE.has(experience)) return fail(400, 'Choose where you are with trading.')
  if (!intent) return fail(400, 'Choose whether to pay or just leave your details.')

  const holding = rows.find(
    (row) => row.phone === phone && (row.status === 'pending' || row.status === 'confirmed'),
  )
  if (holding) {
    return fail(409, 'This phone number already has a seat. WhatsApp me if that was not you.')
  }

  const waiting = rows.find((row) => row.phone === phone && row.status === 'waitlist')
  const stats = publicStats(rows)

  if (intent === 'pay') {
    if (stats.full) {
      return fail(409, 'The seats are all held. Save your details instead, and do not send money yet.')
    }
    const mpesaCode = extractCode(body.mpesaCode)
    if (!mpesaCode) {
      return fail(400, 'Paste the code from the M-Pesa SMS. It is about 10 letters and numbers.')
    }
    const codeTaken = rows.some(
      (row) => row.mpesaCode === mpesaCode && row.status !== 'released',
    )
    if (codeTaken) return fail(409, 'That M-Pesa code is already on a seat.')

    const now = new Date().toISOString()
    if (waiting) {
      waiting.name = name
      waiting.email = email
      waiting.experience = experience
      waiting.note = note
      waiting.mpesaCode = mpesaCode
      waiting.amount = SETTINGS.price
      waiting.status = 'pending'
      waiting.updatedAt = now
      console.log(`Hold: ${waiting.name} · ${prettyPhone(phone)} · ${mpesaCode}`)
      return ok(201, waiting, rows)
    }

    const row = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      name,
      phone,
      email,
      experience,
      note,
      mpesaCode,
      amount: SETTINGS.price,
      status: 'pending',
    }
    rows.push(row)
    console.log(`Hold: ${row.name} · ${prettyPhone(phone)} · ${mpesaCode}`)
    return ok(201, row, rows)
  }

  if (waiting) return fail(409, 'You are already on the list. I will use the details I have.')

  const now = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    name,
    phone,
    email,
    experience,
    note,
    mpesaCode: '',
    amount: null,
    status: 'waitlist',
  }
  rows.push(row)
  console.log(`Details: ${row.name} · ${prettyPhone(phone)}`)
  return ok(201, row, rows)
}

function ok(status, row, rows) {
  return {
    write: true,
    status,
    body: { reservation: publicReservation(row), spotsLeft: publicStats(rows).spotsLeft },
  }
}

function fail(status, error) {
  return { write: false, status, body: { error } }
}

function publicReservation(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    phone: prettyPhone(row.phone),
    amount: row.amount,
    mpesaCode: row.mpesaCode || null,
  }
}

function publicStats(rows) {
  const booked = rows.filter((row) => row.status === 'pending' || row.status === 'confirmed').length
  const spotsTaken = Math.min(SETTINGS.spotsTotal, SETTINGS.alreadyTaken + booked)
  return {
    ...SETTINGS,
    spotsTaken,
    spotsLeft: Math.max(0, SETTINGS.spotsTotal - SETTINGS.alreadyTaken - booked),
    full: SETTINGS.alreadyTaken + booked >= SETTINGS.spotsTotal,
  }
}

function authorized(req) {
  return keysMatch(req.get('x-admin-key'))
}

function keysMatch(given) {
  const expected = process.env.ADMIN_KEY || ''
  if (!expected || !given) return false
  const actual = Buffer.from(String(given))
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length) {
    crypto.timingSafeEqual(wanted, wanted)
    return false
  }
  return crypto.timingSafeEqual(actual, wanted)
}

function limited(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000)
  if (recent.length >= 30) return true
  recent.push(now)
  hits.set(ip, recent)
  return false
}

function readRows() {
  return update((rows) => ({ write: false, rows })).then((outcome) => outcome.rows)
}

function update(mutator) {
  const run = queue.then(async () => {
    const rows = await read()
    const outcome = mutator(rows)
    if (outcome.write) await write(rows)
    return outcome
  })
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

async function connectDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.log('No MONGODB_URI. Saving seats in a local file.')
    return
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 })
  await client.connect()
  reservations = client.db(process.env.MONGODB_DB || 'mentorship').collection('reservations')
  const count = await reservations.countDocuments()
  const existing = readFile()
  if (count === 0 && existing.length) {
    await reservations.insertMany(existing)
    console.log(`Moved ${existing.length} saved seats into Atlas.`)
  }
}

async function read() {
  if (!reservations) return readFile()
  return reservations.find({}, { projection: { _id: 0 } }).toArray()
}

async function write(rows) {
  if (!reservations) {
    writeFile(rows)
    return
  }

  const stored = rows.map((row) => {
    const copy = { ...row }
    delete copy._id
    return copy
  })
  const ids = stored.map((row) => row.id)
  if (stored.length) {
    await reservations.bulkWrite(
      stored.map((row) => ({
        replaceOne: {
          filter: { id: row.id },
          replacement: row,
          upsert: true,
        },
      })),
    )
  }
  await reservations.deleteMany(ids.length ? { id: { $nin: ids } } : {})
}

function readFile() {
  if (!fs.existsSync(DATA_FILE)) return []
  const raw = fs.readFileSync(DATA_FILE, 'utf8')
  if (!raw.trim()) return []
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error('Seat book is not a list')
  return data
}

function writeFile(rows) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(rows, null, 2)}\n`)
}

function clean(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '')
  let next = digits
  if (next.startsWith('0')) next = `254${next.slice(1)}`
  else if (/^[71]\d{8}$/.test(next)) next = `254${next}`
  if (!/^254[71]\d{8}$/.test(next)) return ''
  return next
}

function prettyPhone(stored) {
  const local = String(stored).startsWith('254') ? `0${String(stored).slice(3)}` : String(stored)
  const match = local.match(/^(\d{4})(\d{3})(\d{3})$/)
  return match ? `${match[1]} ${match[2]} ${match[3]}` : local
}

function extractCode(value) {
  const raw = String(value ?? '').toUpperCase().trim()
  if (!raw) return ''
  const word = raw.match(/\b[A-Z0-9]{10}\b/)
  if (word) return word[0]
  const compact = raw.replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z0-9]{8,12}$/.test(compact)) return compact
  return ''
}

function loadEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
