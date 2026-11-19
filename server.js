import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'

const app = express()
const PORT = Number(process.env.PORT || 5000)
const JWT_SECRET = process.env.JWT_SECRET || 'local-development-secret-change-me'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d'
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && (!process.env.MONGO_URI || !process.env.JWT_SECRET)) {
  throw new Error('MONGO_URI and JWT_SECRET are required in production.')
}

app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }))
app.use(express.json())

const colleges = [
  {
    id: 'mit',
    name: 'MIT College of Engineering',
    tag: 'Innovation Hub',
    courses: ['AI & Data Science', 'UX Design'],
    seats: 12,
  },
  {
    id: 'ivy',
    name: 'Ivy League Institute',
    tag: 'Career Launch',
    courses: ['Business Tech', 'Product Mgmt'],
    seats: 8,
  },
  {
    id: 'north',
    name: 'North Valley Campus',
    tag: 'Networking Day',
    courses: ['Cloud Security', 'Marketing'],
    seats: 15,
  },
]
const defaultSlots = ['9:00 AM', '10:30 AM', '12:00 PM', '2:30 PM', '4:00 PM']

let mongoClient
let database
let memoryServer

const ensureDemoUsers = async () => {
  const usersCollection = database.collection('users')
  const adminPassword = await bcrypt.hash('admin123', 12)
  const studentPassword = await bcrypt.hash('student123', 12)

  const existingAdmin = await usersCollection.findOne({ email: 'admin@campus.com' })
  if (!existingAdmin) {
    await usersCollection.insertOne({
      id: 1,
      name: 'Admin User',
      email: 'admin@campus.com',
      passwordHash: adminPassword,
      role: 'admin',
    })
  }

  const existingStudent = await usersCollection.findOne({ email: 'student@campus.com' })
  if (!existingStudent) {
    await usersCollection.insertOne({
      id: 2,
      name: 'Student Demo',
      email: 'student@campus.com',
      passwordHash: studentPassword,
      role: 'student',
    })
  }
}

const startDatabase = async () => {
  const mongoUri = process.env.MONGO_URI

  if (mongoUri) {
    mongoClient = new MongoClient(mongoUri)
  } else {
    memoryServer = await MongoMemoryServer.create()
    mongoClient = new MongoClient(memoryServer.getUri())
  }

  await mongoClient.connect()
  database = mongoClient.db(process.env.MONGO_DB_NAME || 'slot_booking')

  const usersCollection = database.collection('users')
  const bookingsCollection = database.collection('bookings')

  await usersCollection.createIndex({ email: 1 }, { unique: true })
  await bookingsCollection.createIndex({ id: 1 }, { unique: true })

  await ensureDemoUsers()
}

const createToken = (user) =>
  jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )

const authenticate = (req, res, next) => {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' })
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ message: 'Session expired. Please log in again.' })
  }
}

const authenticateOptional = (req, res, next) => {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) return next()

  try {
    req.user = jwt.verify(token, JWT_SECRET)
  } catch {
    return res.status(401).json({ message: 'Session expired. Please log in again.' })
  }

  return next()
}

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }

  return next()
}

app.get('/api/health', async (req, res) => {
  const bookingsCollection = database.collection('bookings')
  const count = await bookingsCollection.countDocuments()
  res.json({ status: 'ok', bookings: count })
})

app.get('/api/colleges', (req, res) => {
  res.json(colleges)
})

const getChatFacts = () => [
  'Campus Connect is a platform for students to explore campus venues and book a 30-minute mentoring session.',
  `Campuses: ${colleges.map((college) => `${college.name} (${college.tag}; focus areas: ${college.courses.join(', ')}; listing shows ${college.seats} seats)`).join('; ')}.`,
  `Listed session times: ${defaultSlots.join(', ')}.`,
  'Booking: on Home, enter a student name, choose a campus and a listed time, then select “Book your slot”. The assistant cannot make bookings.',
  'Cancellation: student self-service cancellation is not available in the website. Contact the campus team or an administrator in advance to request a cancellation or reschedule.',
  'Guidelines: book in advance, respect the mentor schedule, request changes in advance, avoid unnecessary duplicate bookings, and arrive on time.',
  'The listed seat counts and session times come from the project data and are not a live availability check. Do not claim that a booking or cancellation has been completed.',
].join('\n')

const getDemoChatResponse = (message) => {
  const question = message.toLowerCase()

  if (/\b(cancel|cancellation|reschedule|change my (time|booking)|miss my appointment)\b/.test(question)) {
    return 'Student self-service cancellation is not available on the site. Please contact your campus team or an administrator in advance to request a cancellation or reschedule. I can’t change or cancel a booking for you.'
  }

  const matchedCollege = colleges.find((college) => {
    const searchableDetails = [college.name, college.id, college.tag, ...college.courses]
    const courseKeywords = college.courses
      .flatMap((course) => course.toLowerCase().split(/[^a-z0-9]+/))
      .filter((keyword) => keyword.length > 3)
    return searchableDetails.some((detail) => question.includes(detail.toLowerCase()))
      || courseKeywords.some((keyword) => question.includes(keyword))
  })

  if (matchedCollege) {
    return `${matchedCollege.name} focuses on ${matchedCollege.courses.join(' and ')}. Its venue tag is “${matchedCollege.tag}”, and the listing shows ${matchedCollege.seats} seats. Those counts aren’t a live availability check.`
  }

  if (/\b(time|times|slot|slots|schedule|availability|available session)\b/.test(question)) {
    return `The listed session times are ${defaultSlots.join(', ')}. Each session is 30 minutes. The assistant doesn’t reserve a time, so use the booking form to confirm your appointment.`
  }

  if (/\b(book|booking|reserve|appointment|session)\b/.test(question)) {
    return 'To book, go to Home, enter your name, choose a campus and a listed time, then select “Book your slot”. Check the on-page confirmation before considering it booked. I can guide you, but I can’t submit or confirm a booking.'
  }

  if (/\b(campus|campuses|venue|venues|college|colleges|explore)\b/.test(question)) {
    return `Here are the listed venues:\n${colleges.map((college) => `• ${college.name} — ${college.tag}; ${college.courses.join(', ')}; ${college.seats} seats listed`).join('\n')}\n\nThe seat counts are listing data, not a live availability check.`
  }

  if (/\b(what is|about|platform|campus connect)\b/.test(question)) {
    return 'Campus Connect helps students explore campus venues, choose a mentoring session time, and book a conversation with campus mentors. Use About to learn about the platform, Venues to compare campuses, and Schedule to review the listed session times.'
  }

  if (/\b(guideline|guidelines|rule|rules|prepare|expect|duration|long)\b/.test(question)) {
    return 'Sessions are 30 minutes. Prepare questions and any relevant materials, arrive on time, and respect your mentor’s schedule. If you need to cancel or reschedule, contact your campus team or an administrator in advance.'
  }

  if (/\b(academic|study|course|career|project|mentor|advice|guidance|campus life)\b/.test(question)) {
    return 'I can help you prepare for a campus conversation. Write down your questions, bring any relevant course or project details, and use a 30-minute session to discuss academic guidance, career options, or campus resources with a mentor.'
  }

  return 'I can help with campus venues, their focus areas, the listed session times, booking steps, and scheduling guidelines. What would you like to explore?'
}

const chatRequestTimes = new Map()
const limitCampusChat = (req, res, next) => {
  const now = Date.now()
  const clientIp = req.ip || 'unknown'
  const recentRequests = (chatRequestTimes.get(clientIp) || [])
    .filter((timestamp) => now - timestamp < 60000)

  if (recentRequests.length >= 20) {
    chatRequestTimes.set(clientIp, recentRequests)
    return res.status(429).json({ message: 'Please wait a moment before sending another message.' })
  }

  recentRequests.push(now)
  chatRequestTimes.set(clientIp, recentRequests)

  if (chatRequestTimes.size > 1000) {
    for (const [ip, timestamps] of chatRequestTimes) {
      if (timestamps.every((timestamp) => now - timestamp >= 60000)) chatRequestTimes.delete(ip)
    }
  }

  return next()
}

app.get('/api/chat/status', (req, res) => {
  res.json({ mode: process.env.OPENAI_API_KEY ? 'ai' : 'demo' })
})

app.post('/api/chat', limitCampusChat, async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message || message.length > 1000) {
    return res.status(400).json({ message: 'Enter a message of 1,000 characters or fewer.' })
  }

  const history = Array.isArray(req.body?.messages)
    ? req.body.messages
      .filter((entry) => (
        entry
        && (entry.role === 'user' || entry.role === 'assistant')
        && typeof entry.content === 'string'
        && entry.content.trim()
      ))
      .slice(-12)
      .map((entry) => ({ role: entry.role, content: entry.content.trim().slice(0, 1000) }))
    : []
  const lastMessage = history[history.length - 1]
  const conversation = lastMessage?.role === 'user' && lastMessage.content === message
    ? history
    : [...history, { role: 'user', content: message }]

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ mode: 'demo', response: getDemoChatResponse(message) })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are Campus AI Assistant, a friendly and concise guide to Campus Connect. Answer general academic and campus questions helpfully, but do not present guesses as campus policy. Use only these current website facts for platform-specific answers:\n${getChatFacts()}\nNever claim to have created, confirmed, cancelled, or changed a booking; you have no booking tools. Describe seat counts and times as listed project data, not live availability. For cancellations and rescheduling, direct students to their campus team or an administrator. Keep replies brief and practical.`,
          },
          ...conversation,
        ],
        temperature: 0.4,
        max_tokens: 350,
      }),
      signal: controller.signal,
    })

    if (!openAIResponse.ok) {
      console.error(`Campus AI API returned HTTP ${openAIResponse.status}.`)
      return res.status(502).json({ message: 'The AI assistant is temporarily unavailable. Please try again shortly.' })
    }

    const result = await openAIResponse.json()
    const answer = result.choices?.[0]?.message?.content?.trim()
    if (!answer) {
      console.error('Campus AI API returned an empty response.')
      return res.status(502).json({ message: 'The AI assistant could not create a response. Please try again.' })
    }

    return res.json({ mode: 'ai', response: answer })
  } catch (error) {
    console.error('Campus AI request failed:', error.name === 'AbortError' ? 'request timed out' : error.message)
    return res.status(502).json({ message: 'The AI assistant is temporarily unavailable. Please try again shortly.' })
  } finally {
    clearTimeout(timeout)
  }
})

app.get('/api/bookings', authenticateOptional, async (req, res) => {
  const bookingsCollection = database.collection('bookings')
  const filter = !req.user || req.user.role === 'admin' ? {} : { userId: req.user.id }
  const query = bookingsCollection.find(filter).sort({ id: -1 })
  const bookings = await (req.user ? query.toArray() : query.limit(20).toArray())
  res.json(bookings)
})

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const user = await database.collection('users').findOne({ email: String(email).trim().toLowerCase() })

  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  return res.json({
    message: 'Login successful.',
    token: createToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  })
})

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' })
  }

  const usersCollection = database.collection('users')
  const trimmedEmail = String(email).trim().toLowerCase()
  const existingUser = await usersCollection.findOne({ email: trimmedEmail })

  if (existingUser) {
    return res.status(409).json({ message: 'User already exists.' })
  }

  const newUser = {
    id: Date.now(),
    name: String(name).trim(),
    email: trimmedEmail,
    passwordHash: await bcrypt.hash(String(password), 12),
    role: 'student',
  }

  await usersCollection.insertOne(newUser)

  return res.status(201).json({
    message: 'Signup successful.',
    token: createToken(newUser),
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    },
  })
})

app.post('/api/bookings', authenticateOptional, async (req, res) => {
  const { studentName, collegeId, slot } = req.body

  if (!studentName || !collegeId || !slot) {
    return res.status(400).json({ message: 'Student name, college and slot are required.' })
  }

  const selectedCollege = colleges.find((college) => college.id === collegeId)

  if (!selectedCollege) {
    return res.status(404).json({ message: 'Selected college not found.' })
  }

  const newBooking = {
    id: Date.now(),
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    studentName: String(studentName).trim(),
    collegeId,
    collegeName: selectedCollege.name,
    slot,
  }

  await database.collection('bookings').insertOne(newBooking)

  return res.status(201).json({ message: 'Booking created successfully.', booking: newBooking })
})

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  const users = await database
    .collection('users')
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ id: 1 })
    .toArray()

  return res.json(users)
})

app.patch('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''

  if (!name && !password) {
    return res.status(400).json({ message: 'Enter a name or a new password.' })
  }

  const update = {}
  if (name) update.name = name
  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' })
    }
    update.passwordHash = await bcrypt.hash(password, 12)
  }

  const result = await database.collection('users').findOneAndUpdate(
    { id: userId },
    { $set: update },
    { returnDocument: 'after', projection: { passwordHash: 0 } },
  )

  if (!result) return res.status(404).json({ message: 'User not found.' })
  return res.json({ message: 'User updated successfully.', user: result })
})

app.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)

  if (userId === req.user.id) {
    return res.status(400).json({ message: 'The active admin account cannot be deleted.' })
  }

  const result = await database.collection('users').deleteOne({ id: userId })
  if (result.deletedCount === 0) return res.status(404).json({ message: 'User not found.' })

  await database.collection('bookings').deleteMany({ userId })
  return res.json({ message: 'User and their bookings deleted successfully.' })
})

app.delete('/api/bookings/:id', authenticate, requireAdmin, async (req, res) => {
  const bookingId = Number(req.params.id)
  const result = await database.collection('bookings').deleteOne({ id: bookingId })

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: 'Booking not found.' })
  }

  return res.json({ message: 'Booking deleted successfully.' })
})

const shutdown = async () => {
  try {
    if (mongoClient) {
      await mongoClient.close()
    }
    if (memoryServer) {
      await memoryServer.stop()
    }
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const startServer = async () => {
  await startDatabase()

  if (isProduction) {
    app.use(express.static('dist'))
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      return res.sendFile('index.html', { root: 'dist' })
    })
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
