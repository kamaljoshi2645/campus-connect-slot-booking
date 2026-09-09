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
    { expiresIn: '7d' },
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
