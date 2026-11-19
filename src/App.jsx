import { useCallback, useEffect, useRef, useState } from 'react'
import CampusChatbot from './Chatbot'
import './App.css'
import './mobile.css'

const defaultColleges = [
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
const collegeImages = [
  'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85',
]
const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'
const SESSION_KEY = 'campus-connect-session'

function handleImageError(event) {
  const image = event.currentTarget
  if (image.dataset.fallbackApplied) return
  image.dataset.fallbackApplied = 'true'
  image.src = '/campus-fallback.svg'
}

function RevealOnScroll({ children, className = '' }) {
  const sectionRef = useRef(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return undefined

    if (typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.unobserve(section)
      }
    }, { threshold: 0.12 })

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={sectionRef} className={`about-reveal ${visible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  )
}

function AnimatedCounter({ value, suffix = '', label }) {
  const counterRef = useRef(null)
  const [count, setCount] = useState(() => typeof IntersectionObserver === 'undefined' ? value : 0)

  useEffect(() => {
    const element = counterRef.current
    if (!element) return undefined

    if (typeof IntersectionObserver === 'undefined') return undefined

    let frameId
    let started = false
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started) return
      started = true
      observer.unobserve(element)
      const startTime = performance.now()
      const duration = 1100

      const updateCount = (now) => {
        const progress = Math.min((now - startTime) / duration, 1)
        setCount(Math.round(value * progress))
        if (progress < 1) frameId = requestAnimationFrame(updateCount)
      }

      frameId = requestAnimationFrame(updateCount)
    }, { threshold: 0.4 })

    observer.observe(element)
    return () => {
      observer.disconnect()
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [value])

  return (
    <article ref={counterRef} className="about-number-card">
      <strong>{count}{suffix}</strong>
      <span>{label}</span>
    </article>
  )
}

const getSavedSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function App() {
  const [savedSession] = useState(getSavedSession)
  const [colleges, setColleges] = useState(defaultColleges)
  const [selectedCollege, setSelectedCollege] = useState(defaultColleges[0].id)
  const [selectedSlot, setSelectedSlot] = useState(defaultSlots[1])
  const [studentName, setStudentName] = useState('Aarav Sharma')
  const [bookings, setBookings] = useState([])
  const [users, setUsers] = useState([])
  const [status, setStatus] = useState({ type: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(savedSession?.user?.role === 'admin')
  const [showAuth, setShowAuth] = useState(false)
  const [authForm, setAuthForm] = useState({ email: 'admin@campus.com', password: 'admin123' })
  const [editingUserId, setEditingUserId] = useState(null)
  const [userForm, setUserForm] = useState({ name: '', password: '' })
  const [currentUser, setCurrentUser] = useState(savedSession?.user || null)
  const [sessionToken, setSessionToken] = useState(savedSession?.token || '')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activePage, setActivePage] = useState(() => {
    const page = window.location.pathname.replace('/', '')
    return ['about', 'venues', 'schedule'].includes(page) ? page : 'home'
  })

  const activeCollege = colleges.find((college) => college.id === selectedCollege) || defaultColleges[0]

  const navigateTo = (page) => {
    const path = page === 'home' ? '/' : `/${page}`
    window.history.pushState({}, '', path)
    setActivePage(page)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadColleges = async () => {
    try {
      const response = await fetch(`${API_URL}/colleges`)
      if (!response.ok) throw new Error('Failed to load colleges')
      const data = await response.json()
      if (data.length > 0) {
        setColleges(data)
        setSelectedCollege(data[0].id)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const loadBookings = useCallback(async () => {
    try {
      const headers = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
      const response = await fetch(`${API_URL}/bookings`, {
        headers,
      })
      if (!response.ok) throw new Error('Failed to load bookings')
      const data = await response.json()
      setBookings(data)
    } catch (error) {
      if (error.message === 'Failed to load bookings' && sessionToken) {
        setStatus({ type: 'error', message: 'Your session has expired. Please log in again.' })
        setCurrentUser(null)
        setSessionToken('')
        localStorage.removeItem(SESSION_KEY)
      }
    }
  }, [sessionToken])

  const loadUsers = useCallback(async () => {
    if (!sessionToken || !isAdmin) return

    const response = await fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })

    if (!response.ok) throw new Error('Failed to load users')
    setUsers(await response.json())
  }, [isAdmin, sessionToken])

  useEffect(() => {
    const handlePopState = () => {
      const page = window.location.pathname.replace('/', '')
      setActivePage(['about', 'venues', 'schedule'].includes(page) ? page : 'home')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  useEffect(() => {
    loadUsers().catch((error) => console.error(error))
  }, [loadUsers])

  const handleAuth = async (event) => {
    event.preventDefault()
    setLoading(true)

    try {
      const payload = { email: authForm.email, password: authForm.password }

      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Authentication failed')

      setCurrentUser(result.user)
      setSessionToken(result.token)
      setIsAdmin(result.user.role === 'admin')
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: result.token, user: result.user }))
      setStatus({ type: 'success', message: `Welcome ${result.user.name}!` })
      setShowAuth(false)
      setAuthForm({ email: '', password: '' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Authentication failed.' })
    } finally {
      setLoading(false)
    }
  }

  const handleBooking = async () => {
    const trimmedName = studentName.trim() || 'Student'
    setStudentName(trimmedName)
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({
          studentName: trimmedName,
          collegeId: selectedCollege,
          slot: selectedSlot,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Booking failed')

      setStatus({
        type: 'success',
        message: `Booked successfully for ${activeCollege.name} at ${selectedSlot}.`,
      })
      await loadBookings()
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Booking failed.' })
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = (user) => {
    setEditingUserId(user.id)
    setUserForm({ name: user.name, password: '' })
  }

  const handleUpdateUser = async (id) => {
    try {
      const response = await fetch(`${API_URL}/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify(userForm),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'User update failed')

      setEditingUserId(null)
      setUserForm({ name: '', password: '' })
      setStatus({ type: 'success', message: result.message })
      await loadUsers()
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'User update failed.' })
    }
  }

  const handleDeleteUser = async (id) => {
    try {
      const response = await fetch(`${API_URL}/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'User deletion failed')

      setStatus({ type: 'success', message: result.message })
      await Promise.all([loadUsers(), loadBookings()])
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'User deletion failed.' })
    }
  }

  const handleDeleteBooking = async (id) => {
    try {
      const response = await fetch(`${API_URL}/bookings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      })

      if (!response.ok) {
        throw new Error('Delete request failed')
      }

      await loadBookings()
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Delete request failed.' })
    }
  }

  return (
    <div className="app-shell">
      {showAuth && !currentUser && (
        <div className="auth-overlay">
          <div className="auth-card">
            <button type="button" className="modal-close" onClick={() => setShowAuth(false)}>
              Close
            </button>
            <p className="eyebrow">Admin access</p>
            <h2>Admin login</h2>
            <p className="auth-note">Only admins can change user details or delete records.</p>

            <form onSubmit={handleAuth} className="auth-form">
              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                  placeholder="admin@campus.com"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                  placeholder="Enter admin password"
                  required
                />
              </label>

              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? 'Please wait...' : 'Login as admin'}
              </button>
            </form>

            {status.message && (
              <div className={status.type === 'success' ? 'success-box' : 'error-box'}>
                {status.message}
              </div>
            )}

            <div className="demo-credentials">
              <strong>Demo admin:</strong>
              <span>admin@campus.com / admin123</span>
            </div>
          </div>
        </div>
      )}

      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">C</div>
          <div>
            <p className="eyebrow">Campus Connect</p>
            <h2>Slot Booking</h2>
          </div>
        </div>

        <div className="header-actions">
          {currentUser?.role === 'admin' ? (
            <button
              type="button"
              className={isAdmin ? 'ghost-button active' : 'ghost-button'}
              onClick={() => setIsAdmin((value) => !value)}
            >
              {isAdmin ? 'User view' : 'Admin view'}
            </button>
          ) : !currentUser ? (
            <button type="button" className="ghost-button admin-login-button" onClick={() => setShowAuth(true)}>
              Admin login
            </button>
          ) : null}
          {currentUser && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setCurrentUser(null)
                setSessionToken('')
                setIsAdmin(false)
                setUsers([])
                localStorage.removeItem(SESSION_KEY)
                setStatus({ type: 'success', message: 'Logged out successfully.' })
              }}
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {!isAdmin ? (
        <>
          {activePage === 'home' && (
            <>
              <main className="page-grid home-page">
                <section className="hero-panel">
                  <div className="badge-row">
                    <span className="status-pill">Campus meetings, made easy</span>
                    <span className="mini-text">{bookings.length + 89} students joined</span>
                  </div>

                  <h1>Meet the right people at the right campus.</h1>
                  <p className="lead">
                    Find a campus, pick a time, and book a conversation with someone who can help
                    with your next step.
                  </p>

                  <div className="hero-actions">
                    <button type="button" className="primary-button hero-primary" onClick={() => navigateTo('schedule')}>
                      Find a slot
                    </button>
                    <button type="button" className="hero-secondary" onClick={() => navigateTo('venues')}>
                      Explore venues
                    </button>
                  </div>

                  <div className="stats-row">
                    <button type="button" onClick={() => navigateTo('venues')}>
                      <strong>24+</strong>
                      <span>universities</span>
                    </button>
                    <button type="button" onClick={() => navigateTo('schedule')}>
                      <strong>{bookings.length + 140}</strong>
                      <span>student slots</span>
                    </button>
                    <button type="button" onClick={() => navigateTo('about')}>
                      <strong>4.9/5</strong>
                      <span>average rating</span>
                    </button>
                  </div>

                  <div className="home-hero-photo">
                    <img
                      src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=85"
                      alt="Students sharing ideas together on campus"
                      loading="lazy"
                      onError={handleImageError}
                    />
                    <div className="home-hero-photo-caption">
                      <span>Campus Connect</span>
                      <strong>Good questions. Better next steps.</strong>
                    </div>
                  </div>
                </section>

                <aside className="booking-card">
                  <div className="card-head">
                    <div>
                      <p className="eyebrow">Quick booking</p>
                      <h3>{activeCollege.name}</h3>
                    </div>
                    <span className="small-tag">{activeCollege.seats} seats</span>
                  </div>

                  <label className="field-label">Student name</label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    placeholder="Enter your name"
                  />

                  <label className="field-label">Choose campus</label>
                  <div className="slot-list">
                    {colleges.map((college) => (
                      <button
                        key={college.id}
                        type="button"
                        className={selectedCollege === college.id ? 'slot-option active' : 'slot-option'}
                        onClick={() => setSelectedCollege(college.id)}
                      >
                        <div>
                          <strong>{college.name}</strong>
                          <small>{college.tag}</small>
                        </div>
                        <span>{college.seats} seats</span>
                      </button>
                    ))}
                  </div>

                  <label className="field-label">Select time</label>
                  <div className="time-grid">
                    {defaultSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={selectedSlot === slot ? 'time-btn active' : 'time-btn'}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>

                  <button type="button" className="primary-button" onClick={handleBooking} disabled={loading}>
                    {loading ? 'Booking...' : 'Book your slot'}
                  </button>

                  {status.message && (
                    <div className={status.type === 'success' ? 'success-box' : 'error-box'}>
                      {status.message}
                    </div>
                  )}
                </aside>
              </main>

              <section className="showcase-section">
                <div className="section-heading">
                  <p className="eyebrow">Who it’s for</p>
                  <h2>A better way to plan a campus visit.</h2>
                </div>
                <div className="role-grid">
                  <article className="role-card">
                    <div className="role-icon">S</div>
                    <h3>For students</h3>
                    <p>Browse campuses, find a useful session and choose a time that works for you.</p>
                    <button type="button" onClick={() => navigateTo('venues')}>Explore campus →</button>
                  </article>
                  <article className="role-card campus-team-card">
                    <div className="role-icon">A</div>
                    <h3>For campus teams</h3>
                    <p>Keep track of student bookings and make it easier to organise each session.</p>
                    <button type="button" onClick={() => setShowAuth(true)}>Admin login →</button>
                  </article>
                </div>
              </section>

              <section className="showcase-section campus-showcase">
                <div className="section-heading">
                  <p className="eyebrow">Find your campus</p>
                  <h2>Start with a place that feels right.</h2>
                  <p className="section-description">A few of the campuses where you can meet, ask questions and plan what comes next.</p>
                </div>
                <div className="home-venue-grid">
                  {colleges.map((college, index) => (
                    <article className="home-venue-card" key={college.id}>
                      <img
                        className="venue-card-image"
                        src={collegeImages[index % collegeImages.length]}
                        alt={`${college.name} campus`}
                        loading="lazy"
                        onError={handleImageError}
                      />
                      <span className="small-tag">{college.tag}</span>
                      <h3>{college.name}</h3>
                      <p>{college.seats} seats available</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCollege(college.id)
                          navigateTo('home')
                        }}
                      >
                        Choose campus <span aria-hidden="true">→</span>
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="how-it-works">
                <div className="section-heading">
                  <p className="eyebrow">A few easy steps</p>
                  <h2>From browsing to booked.</h2>
                </div>
                <div className="steps-grid">
                  <article className="step-card">
                    <span>01</span>
                    <h3>Choose a campus</h3>
                    <p>Browse the venues and pick the one you want to learn more about.</p>
                  </article>
                  <article className="step-card">
                    <span>02</span>
                    <h3>Pick a time</h3>
                    <p>Choose an available slot that fits your day.</p>
                  </article>
                  <article className="step-card">
                    <span>03</span>
                    <h3>Book your visit</h3>
                    <p>Enter your name and confirm your meeting in a moment.</p>
                  </article>
                </div>
                <button type="button" className="how-it-works-cta" onClick={() => navigateTo('schedule')}>
                  View available times
                </button>
              </section>

              <section className="home-about">
                <div className="section-heading">
                  <p className="eyebrow">About Campus Connect</p>
                  <h2>Good conversations can shape what comes next.</h2>
                  <p className="section-description">
                    We make it easier for students to meet campus teams, ask thoughtful questions
                    and make confident decisions about their future.
                  </p>
                </div>
                <div className="home-about-grid">
                  <article>
                    <span>01</span>
                    <h3>Find your fit</h3>
                    <p>Explore campuses and the sessions they offer before you decide where to go.</p>
                  </article>
                  <article>
                    <span>02</span>
                    <h3>Talk to real people</h3>
                    <p>Use your time to get practical answers from the people who know the campus.</p>
                  </article>
                  <article>
                    <span>03</span>
                    <h3>Plan with confidence</h3>
                    <p>Pick a time that works and keep your visit organised from the start.</p>
                  </article>
                </div>
                <div className="campus-connections">
                  <div className="campus-connections-copy">
                    <p className="eyebrow">Campus Connect</p>
                    <h2>Your Campus, Your Connections</h2>
                    <p>
                      A campus visit is a chance to meet people who have been where you are.
                      Book time with mentors, ask what matters to you, and leave with a clearer
                      picture of what comes next.
                    </p>
                  </div>
                  <div className="campus-art" role="img" aria-label="Illustration of a welcoming campus building">
                    <svg viewBox="0 0 480 300" aria-hidden="true">
                      <defs>
                        <linearGradient id="campus-sky" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#e5f3ed" />
                          <stop offset="100%" stopColor="#f8f7f2" />
                        </linearGradient>
                        <linearGradient id="campus-building" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fff" />
                          <stop offset="100%" stopColor="#e5f3ed" />
                        </linearGradient>
                      </defs>
                      <rect width="480" height="300" rx="22" fill="url(#campus-sky)" />
                      <circle cx="378" cy="68" r="30" fill="#fff" opacity=".8" />
                      <path d="M0 235c64-28 116-30 177-8 71 26 132 28 303-14v87H0z" fill="#cfe4d5" />
                      <path d="M101 137 240 72l139 65v13H101z" fill="#247a65" />
                      <path d="M120 146h240v104H120z" fill="url(#campus-building)" />
                      <path d="M209 185h62v65h-62z" fill="#123c35" />
                      <path d="M137 166h38v39h-38zm168 0h38v39h-38z" fill="#b8d9c8" />
                      <path d="M143 174h26m-26 8h26m142-8h26m-26 8h26" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                      <path d="M187 144v106m106-106v106" stroke="#c7ddce" strokeWidth="5" />
                      <path d="M191 250h98" stroke="#247a65" strokeWidth="6" strokeLinecap="round" />
                      <path d="M60 244v-37m0 12c-20-18-29 1 0 10 18-21 31-4 0 8m360 7v-42m0 15c-20-20-30 1 0 10 18-22 31-4 0 9" fill="#7e9a77" stroke="#7e9a77" strokeWidth="6" strokeLinecap="round" />
                      <path d="M45 246h32m326 0h32" stroke="#698362" strokeWidth="7" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                <div className="home-about-stats">
                  <article className="home-stat-card">
                    <span className="home-stat-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01" /></svg>
                    </span>
                    <strong>3</strong>
                    <span>Available Campuses</span>
                    <p>Explore places to meet and learn.</p>
                  </article>
                  <article className="home-stat-card">
                    <span className="home-stat-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    </span>
                    <strong>5</strong>
                    <span>Session Times</span>
                    <p>Choose a time that works for you.</p>
                  </article>
                  <article className="home-stat-card">
                    <span className="home-stat-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5M8 17h3" /></svg>
                    </span>
                    <strong>One</strong>
                    <span>Simple Place to Book</span>
                    <p>Keep your campus plans in one place.</p>
                  </article>
                </div>
              </section>
            </>
          )}

          {activePage === 'about' && (
            <section className="content-page about-page">
              <div className="page-heading">
                <p className="eyebrow">About Campus Connect</p>
                <h1>Make every campus conversation count.</h1>
                <p className="lead">Campus Connect brings students and college mentors together through simple, reliable meeting slots.</p>
              </div>
              <div className="info-row page-cards">
                <article className="info-card highlight"><p className="eyebrow">Our promise</p><h3>Less waiting. More meaningful conversations.</h3></article>
                <article className="info-card"><p className="eyebrow">For students</p><ul><li>Find the right campus</li><li>Choose a convenient time</li><li>Meet expert advisors</li></ul></article>
                <article className="info-card"><p className="eyebrow">For colleges</p><ul><li>Organize mentor sessions</li><li>Manage active bookings</li><li>Build stronger connections</li></ul></article>
              </div>

              <RevealOnScroll className="about-story about-section">
                <div className="about-story-copy">
                  <p className="eyebrow">Our story</p>
                  <h2>Making it easier to find the right conversation.</h2>
                  <p>
                    Campus Connect began with a simple idea: getting guidance should not feel
                    complicated. We bring students and faculty together with a clear way to find
                    the right person, choose a time and keep every meeting organized.
                  </p>
                  <p>
                    Whether a student is choosing a course or exploring a career, a thoughtful
                    conversation can make the next step easier to see.
                  </p>
                </div>
                <div className="about-image-frame">
                  <img
                    className="about-image"
                    src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1400&q=85"
                    alt="University campus building surrounded by green lawns"
                    loading="lazy"
                    onError={handleImageError}
                  />
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="about-section about-mission-section">
                <div className="about-section-heading">
                  <p className="eyebrow">What guides us</p>
                  <h2>Our mission &amp; vision</h2>
                </div>
                <div className="about-mission-grid">
                  <article className="about-mission-card">
                    <span className="about-line-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M12 3v3m0 12v3M3 12h3m12 0h3m-2.6-6.4-2.1 2.1M7.7 16.3l-2.1 2.1m0-12.8 2.1 2.1m8.6 8.6 2.1 2.1" /><circle cx="12" cy="12" r="5" /></svg>
                    </span>
                    <p className="eyebrow">Our mission</p>
                    <h3>Guidance that is within reach.</h3>
                    <p>Making academic guidance and mentoring accessible to every student through a simple and organized appointment system.</p>
                  </article>
                  <article className="about-mission-card vision">
                    <span className="about-line-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></svg>
                    </span>
                    <p className="eyebrow">Our vision</p>
                    <h3>A campus that grows together.</h3>
                    <p>Building a connected campus where students and mentors can communicate, collaborate, and grow together.</p>
                  </article>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="about-section about-values-section">
                <div className="about-section-heading">
                  <p className="eyebrow">The way we work</p>
                  <h2>Our core values</h2>
                  <p>Simple principles that shape every connection on Campus Connect.</p>
                </div>
                <div className="about-values-grid">
                  <article className="about-value-card">
                    <span className="about-line-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20v-1.6a6.5 6.5 0 0 1 13 0V20M4 5.5l1.2 1.2m13.6-1.2-1.2 1.2M12 2v1.5" /></svg></span>
                    <h3>Accessibility</h3>
                    <p>Make it straightforward for every student to find support and book time.</p>
                  </article>
                  <article className="about-value-card">
                    <span className="about-line-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.7-3 8-7 10-4-2-7-5.3-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg></span>
                    <h3>Transparency</h3>
                    <p>Keep meeting details clear, from available times to confirmed bookings.</p>
                  </article>
                  <article className="about-value-card">
                    <span className="about-line-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.3" /><path d="M3.5 20v-1.7a5.5 5.5 0 0 1 11 0V20m.5-5a4.2 4.2 0 0 1 5.5 4v1" /></svg></span>
                    <h3>Collaboration</h3>
                    <p>Bring students and faculty together for open, useful conversations.</p>
                  </article>
                  <article className="about-value-card">
                    <span className="about-line-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v18m6-14H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H5" /></svg></span>
                    <h3>Student growth</h3>
                    <p>Help students make informed choices about study, skills and careers.</p>
                  </article>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="about-section about-help-section">
                <div className="about-section-heading">
                  <p className="eyebrow">How Campus Connect helps</p>
                  <h2>Make every campus conversation count.</h2>
                </div>
                <div className="about-help-list">
                  <div><span>01</span><p><strong>Find the right mentor</strong>Connect with faculty and advisors who understand your goals.</p></div>
                  <div><span>02</span><p><strong>Save time</strong>Choose an available appointment without the back-and-forth.</p></div>
                  <div><span>03</span><p><strong>Get academic guidance</strong>Talk through courses, study plans and campus life.</p></div>
                  <div><span>04</span><p><strong>Explore career opportunities</strong>Get perspective on possible paths and next steps.</p></div>
                  <div><span>05</span><p><strong>Build meaningful connections</strong>Start conversations that can continue beyond one meeting.</p></div>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="about-audience-section about-section">
                <article className="about-audience-card">
                  <div className="about-audience-copy">
                    <p className="eyebrow">For students</p>
                    <h2>Find support for the questions that matter to you.</h2>
                    <p>Book time with someone who can help you understand your options, feel more prepared and make your next decision with confidence.</p>
                    <button type="button" className="about-text-link" onClick={() => navigateTo('venues')}>Explore venues <span aria-hidden="true">→</span></button>
                  </div>
                  <div className="about-image-frame">
                    <img
                      className="about-image"
                      src="https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=85"
                      alt="Students spending time together on a university campus"
                      loading="lazy"
                      onError={handleImageError}
                    />
                  </div>
                </article>
                <article className="about-audience-card faculty">
                  <div className="about-audience-copy">
                    <p className="eyebrow">For faculty</p>
                    <h2>Make it easier for students to reach you.</h2>
                    <p>Keep mentoring sessions organized, make your availability clear and give students a welcoming way to start a conversation.</p>
                    <button type="button" className="about-text-link" onClick={() => setShowAuth(true)}>Admin login <span aria-hidden="true">→</span></button>
                  </div>
                  <div className="about-image-frame">
                    <img
                      className="about-image"
                      src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85"
                      alt="Colleagues collaborating around a table"
                      loading="lazy"
                      onError={handleImageError}
                    />
                  </div>
                </article>
              </RevealOnScroll>

              <RevealOnScroll className="about-section about-numbers-section">
                <div className="about-section-heading">
                  <p className="eyebrow">Campus Connect in numbers</p>
                  <h2>Small steps can make a big difference.</h2>
                  <p>Demonstration statistics — sample numbers for illustration.</p>
                </div>
                <div className="about-numbers-grid">
                  <AnimatedCounter value={12} suffix="+" label="Campus Locations" />
                  <AnimatedCounter value={5} label="Available Session Times" />
                  <AnimatedCounter value={48} suffix="+" label="Mentoring Opportunities" />
                  <AnimatedCounter value={320} suffix="+" label="Student Connections" />
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="about-experience about-section">
                <div className="about-experience-image about-image-frame">
                  <img
                    className="about-image"
                    src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1800&q=85"
                    alt="University students studying and sharing ideas together"
                    loading="lazy"
                    onError={handleImageError}
                  />
                </div>
                <div className="about-experience-copy">
                  <p className="eyebrow">A Campus Connect experience</p>
                  <h2>Learning grows when we share ideas.</h2>
                  <p>From a quick question about a course to a bigger conversation about the future, Campus Connect helps make space for the people and perspectives that move you forward.</p>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="about-final-cta">
                <p className="eyebrow">Start a conversation</p>
                <h2>Your Next Conversation Could Change Your Future.</h2>
                <p>Find a campus and choose a time to take your next step.</p>
                <div className="about-cta-actions">
                  <button type="button" className="primary-button" onClick={() => navigateTo('venues')}>Explore Venues</button>
                  <button type="button" className="about-cta-secondary" onClick={() => navigateTo('schedule')}>View Schedule</button>
                </div>
              </RevealOnScroll>
            </section>
          )}

          {activePage === 'venues' && (
            <section className="content-page">
              <div className="page-heading"><p className="eyebrow">Explore venues</p><h1>Choose the campus that fits your next step.</h1><p className="lead">Browse participating campuses and their focus areas before selecting a meeting slot.</p></div>
              <div className="venue-grid">
                {colleges.map((college, index) => (
                  <article className="venue-card" key={college.id}>
                    <img
                      className="venue-card-image"
                      src={collegeImages[index % collegeImages.length]}
                      alt={`${college.name} campus`}
                      loading="lazy"
                      onError={handleImageError}
                    />
                    <span className="small-tag">{college.tag}</span>
                    <h3>{college.name}</h3>
                    <p>{college.seats} seats currently available</p>
                    <div className="course-tags">{college.courses.map((course) => <span key={course}>{course}</span>)}</div>
                    <button type="button" className="primary-button" onClick={() => { setSelectedCollege(college.id); navigateTo('home') }}>Book this venue</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activePage === 'schedule' && (
            <section className="content-page schedule-page">
              <div className="schedule-hero">
                <div className="schedule-hero-copy">
                  <p className="eyebrow">Available schedule</p>
                  <h1>Find a time that works for you.</h1>
                  <p className="lead">
                    Choose an open mentoring session, then continue to booking to select your
                    campus and confirm your appointment.
                  </p>
                  <span className="schedule-hero-note"><span aria-hidden="true">✓</span> Sessions are 30 minutes</span>
                </div>
                <div className="schedule-hero-image about-image-frame">
                  <img
                    className="about-image"
                    src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1200&q=85"
                    alt="A university campus ready to welcome students"
                    loading="lazy"
                    onError={handleImageError}
                  />
                </div>
              </div>

              <RevealOnScroll className="schedule-section schedule-process-section">
                <div className="schedule-section-heading">
                  <p className="eyebrow">A simple process</p>
                  <h2>How booking works</h2>
                  <p>Four clear steps take you from choosing a time to meeting your mentor.</p>
                </div>
                <div className="schedule-process-grid">
                  <article className="schedule-process-card">
                    <span className="schedule-process-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5M8 11h6m-3-3v6" /></svg></span>
                    <span className="schedule-step-number">01</span>
                    <h3>Browse available times</h3>
                    <p>See the mentoring sessions currently offered.</p>
                  </article>
                  <article className="schedule-process-card">
                    <span className="schedule-process-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
                    <span className="schedule-step-number">02</span>
                    <h3>Select your preferred slot</h3>
                    <p>Choose the time that best fits your day.</p>
                  </article>
                  <article className="schedule-process-card">
                    <span className="schedule-process-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8m-8 4h8m-8 4h5" /></svg></span>
                    <span className="schedule-step-number">03</span>
                    <h3>Confirm your appointment</h3>
                    <p>Add your details and finish the booking.</p>
                  </article>
                  <article className="schedule-process-card">
                    <span className="schedule-process-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 20h18M5 20V9l7-5 7 5v11m-9 0v-6h4v6" /></svg></span>
                    <span className="schedule-step-number">04</span>
                    <h3>Attend your session</h3>
                    <p>Meet your mentor and make the most of your time.</p>
                  </article>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="schedule-section schedule-times-section">
                <div className="schedule-section-heading">
                  <p className="eyebrow">Choose your time</p>
                  <h2>Available session times</h2>
                  <p>Select any open time to continue to the booking form.</p>
                </div>
                <div className="schedule-page-grid">
                  {defaultSlots.map((slot) => (
                    <button
                      type="button"
                      className={selectedSlot === slot ? 'schedule-slot active' : 'schedule-slot'}
                      aria-pressed={selectedSlot === slot}
                      key={slot}
                      onClick={() => {
                        setSelectedSlot(slot)
                        navigateTo('home')
                      }}
                    >
                      <span className="schedule-slot-status"><span aria-hidden="true">●</span> Available</span>
                      <strong>{slot}</strong>
                      <span className="schedule-duration">30-minute mentoring session</span>
                      <span className="schedule-slot-action">{selectedSlot === slot ? 'Selected' : 'Choose this time'} <span aria-hidden="true">→</span></span>
                    </button>
                  ))}
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="schedule-section schedule-expect-section">
                <div className="schedule-section-heading">
                  <p className="eyebrow">Your session</p>
                  <h2>What to expect</h2>
                  <p>A focused conversation shaped around what you need right now.</p>
                </div>
                <div className="schedule-expect-grid">
                  <article><span aria-hidden="true">01</span><h3>Academic guidance</h3><p>Talk through courses, study plans and campus resources.</p></article>
                  <article><span aria-hidden="true">02</span><h3>Career discussions</h3><p>Explore interests, options and possible next steps.</p></article>
                  <article><span aria-hidden="true">03</span><h3>Project assistance</h3><p>Get another perspective on a project or area of study.</p></article>
                  <article><span aria-hidden="true">04</span><h3>Personal development</h3><p>Build confidence and reflect on your goals.</p></article>
                  <article><span aria-hidden="true">05</span><h3>Questions and answers</h3><p>Bring your questions and leave with clearer direction.</p></article>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="schedule-section schedule-prepare-section">
                <div className="schedule-section-heading">
                  <p className="eyebrow">A little preparation goes a long way</p>
                  <h2>Prepare for your session</h2>
                </div>
                <div className="schedule-tips-grid">
                  <div><span>01</span><p>Prepare your questions in advance.</p></div>
                  <div><span>02</span><p>Arrive on time so you can use the full session.</p></div>
                  <div><span>03</span><p>Bring relevant documents or project materials.</p></div>
                  <div><span>04</span><p>Choose the appropriate meeting venue.</p></div>
                  <div><span>05</span><p>Make the most of your allotted session time.</p></div>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="schedule-section schedule-guidelines-section">
                <div className="schedule-section-heading">
                  <p className="eyebrow">A few courtesies</p>
                  <h2>Session guidelines</h2>
                  <p>Help make each appointment useful and respectful for everyone.</p>
                </div>
                <ul className="schedule-guidelines-list">
                  <li>Book sessions in advance.</li>
                  <li>Respect your mentor’s schedule.</li>
                  <li>Cancel or reschedule in advance when necessary.</li>
                  <li>Avoid booking multiple unnecessary sessions.</li>
                  <li>Be punctual and ready to begin at your scheduled time.</li>
                </ul>
              </RevealOnScroll>

              <RevealOnScroll className="schedule-section schedule-faq-section">
                <div className="schedule-section-heading">
                  <p className="eyebrow">Need a little more detail?</p>
                  <h2>Frequently asked questions</h2>
                </div>
                <div className="schedule-faq-list">
                  <details><summary>How long is each session?</summary><p>Each mentoring session is 30 minutes.</p></details>
                  <details><summary>Can I change my booked time?</summary><p>Choose a different available time before confirming. For a confirmed appointment, contact your campus team to ask about changing it.</p></details>
                  <details><summary>What happens if I miss my appointment?</summary><p>Contact your mentor or campus team, then choose another available time if you still need a session.</p></details>
                  <details><summary>How can I cancel a booking?</summary><p>Contact your campus team or administrator in advance to request a cancellation. Student self-service cancellation is not currently available.</p></details>
                  <details><summary>Where will the meeting take place?</summary><p>Your selected campus is the meeting venue. Check with the campus team for the specific room or meeting point.</p></details>
                </div>
              </RevealOnScroll>

              <RevealOnScroll className="schedule-final-cta">
                <p className="eyebrow">Your next step starts here</p>
                <h2>Make Time for Your Growth.</h2>
                <p>Choose a session and connect with a campus mentor who can help you move forward.</p>
                <button type="button" className="primary-button" onClick={() => navigateTo('home')}>Choose a session time</button>
              </RevealOnScroll>
            </section>
          )}
        </>
      ) : (
        <section className="admin-panel">
          <div className="admin-header">
            <div>
              <p className="eyebrow">Admin portal</p>
              <h2>Manage student bookings</h2>
            </div>
            <span className="status-pill">{bookings.length} active</span>
          </div>

          <div className="admin-table">
            {bookings.length === 0 ? (
              <div className="empty-state admin-empty">No bookings available.</div>
            ) : (
              bookings.map((booking) => (
                <div key={booking.id} className="admin-row">
                  <div>
                    <strong>{booking.studentName}</strong>
                    <p>{booking.collegeName}</p>
                  </div>
                  <span>{booking.slot}</span>
                  <button type="button" onClick={() => handleDeleteBooking(booking.id)}>
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="user-management">
            <div className="list-header">
              <h3>Manage users</h3>
              <span>{users.length} accounts</span>
            </div>

            <div className="admin-table">
              {users.map((user) => (
                <div key={user.id} className="admin-row user-row">
                  {editingUserId === user.id ? (
                    <>
                      <input
                        type="text"
                        value={userForm.name}
                        onChange={(event) => setUserForm({ ...userForm, name: event.target.value })}
                        placeholder="Full name"
                      />
                      <input
                        type="password"
                        value={userForm.password}
                        onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                        placeholder="New password (optional)"
                      />
                      <div className="row-actions">
                        <button type="button" onClick={() => handleUpdateUser(user.id)}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingUserId(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <strong>{user.name}</strong>
                        <p>{user.email} · {user.role}</p>
                      </div>
                      <div className="row-actions">
                        <button type="button" onClick={() => handleEditUser(user)}>
                          Edit
                        </button>
                        {user.id !== currentUser.id && (
                          <button type="button" onClick={() => handleDeleteUser(user.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Main navigation">
        <button type="button" aria-current={activePage === 'home' ? 'page' : undefined} className={activePage === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('home')}>
          Home
        </button>
        <button type="button" aria-current={activePage === 'about' ? 'page' : undefined} className={activePage === 'about' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('about')}>
          About
        </button>
        <button type="button" aria-current={activePage === 'venues' ? 'page' : undefined} className={activePage === 'venues' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('venues')}>
          Venues
        </button>
        <button type="button" aria-current={activePage === 'schedule' ? 'page' : undefined} className={activePage === 'schedule' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('schedule')}>
          Schedule
        </button>
      </nav>
      <CampusChatbot />
    </div>
  )
}

export default App
