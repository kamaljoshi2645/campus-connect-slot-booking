import { useCallback, useEffect, useState } from 'react'
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
const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'
const SESSION_KEY = 'campus-connect-session'

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

        <button
          type="button"
          className={menuOpen ? 'menu-toggle open' : 'menu-toggle'}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={menuOpen ? 'nav mobile-open' : 'nav'} aria-label="Main navigation">
          <button type="button" className={activePage === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('home')}>
            Home
          </button>
          <button type="button" className={activePage === 'about' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('about')}>
            About
          </button>
          <button type="button" className={activePage === 'venues' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('venues')}>
            Venues
          </button>
          <button type="button" className={activePage === 'schedule' ? 'nav-link active' : 'nav-link'} onClick={() => navigateTo('schedule')}>
            Schedule
          </button>
        </nav>

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
            <button type="button" className="ghost-button" onClick={() => setShowAuth(true)}>
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
          {activePage === 'home' && <main className="page-grid home-page">
            <section className="hero-panel">
              <div className="badge-row">
                <span className="status-pill">Live bookings</span>
                <span className="mini-text">{bookings.length + 89} students joined</span>
              </div>

              <h1>Book your campus meeting slot in minutes.</h1>
              <p className="lead">
                Connect with top colleges, discover mentor sessions, and reserve your
                preferred meeting time for networking and admissions guidance.
              </p>

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
                  <span>rating</span>
                </button>
              </div>
            </section>

          </main>}

          {activePage === 'about' && (
            <section className="content-page">
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
            </section>
          )}

          {activePage === 'venues' && (
            <section className="content-page">
              <div className="page-heading"><p className="eyebrow">Explore venues</p><h1>Choose the campus that fits your next step.</h1><p className="lead">Browse participating campuses and their focus areas before selecting a meeting slot.</p></div>
              <div className="venue-grid">
                {colleges.map((college) => <article className="venue-card" key={college.id}><span className="small-tag">{college.tag}</span><h3>{college.name}</h3><p>{college.seats} seats currently available</p><div className="course-tags">{college.courses.map((course) => <span key={course}>{course}</span>)}</div><button type="button" className="primary-button" onClick={() => { setSelectedCollege(college.id); navigateTo('home') }}>Book this venue</button></article>)}
              </div>
            </section>
          )}

          {activePage === 'schedule' && (
            <section className="content-page">
              <div className="page-heading"><p className="eyebrow">Available schedule</p><h1>Find a time that works for you.</h1><p className="lead">Select any available session time to continue your booking.</p></div>
              <div className="schedule-page-grid">{defaultSlots.map((slot) => <button type="button" className={selectedSlot === slot ? 'schedule-slot active' : 'schedule-slot'} key={slot} onClick={() => { setSelectedSlot(slot); navigateTo('home') }}><strong>{slot}</strong><span>30-minute mentor session</span></button>)}</div>
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
    </div>
  )
}

export default App
