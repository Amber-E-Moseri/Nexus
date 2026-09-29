import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Public marketing page for ICPLC 2026 (no auth).
const STATUS_URL = '/icplc'

// Fallback values (used if database not yet populated)
const FALLBACK_DATES = 'Thursday, November 19, 2026 – Sunday, November 22, 2026'
const FALLBACK_LOCATION = 'Loveworld City, Asese, Nigeria'
const FALLBACK_REGISTER_URL = 'https://icplcwithpastorchris.org/register'

const ORANGE = '#f5821f'
const BLUE = '#0a4fd6'
const INK = '#151412'

const FAQS = [
  { q: 'Who can attend ICPLC?', a: 'Campus pastors, youth leaders, student ministers, and campus fellowship leaders in the Believers\' Loveworld Nation.' },
  { q: 'What does ICPLC stand for?', a: 'International Campus Pastors\' and Leaders\' Conference.' },
  { q: 'Is there a registration fee?', a: 'Details on registration fees will be shared through official channels. Use the Status Tracker to follow your registration.' },
  { q: 'Will transportation be provided?', a: 'Transportation arrangements will be communicated to registered participants ahead of the conference.' },
  { q: 'Will there be meals provided?', a: 'Meal arrangements will be communicated to registered participants ahead of the conference.' },
  { q: 'How can I volunteer or serve?', a: 'Reach out to your campus ministry coordinator or sub-region team to be added to the service teams.' },
  { q: 'Is there a dress code or themed outfits for each day?', a: 'Dress guidelines for each day will be shared with registered participants before the conference.' },
]

const dotsBg = {
  backgroundColor: INK,
  backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1.5px, transparent 1.6px)',
  backgroundSize: '48px 48px',
  backgroundPosition: '18px 24px',
}

const pill = {
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 999,
  background: 'rgba(21,20,18,0.92)',
  color: '#fff',
}

function Wordmark({ color = '#fff', size = 34 }) {
  return (
    <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 800, fontSize: size, letterSpacing: '-0.06em', color, lineHeight: 1 }}>
      icplc
    </span>
  )
}

function CalendarIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><circle cx="12" cy="15" r="0.8" fill="#fff" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="6" r="3" /><path d="M12 9v6" /><path d="M6 17c-1.5.6-2.5 1.4-2.5 2.3C3.5 21 7.3 22 12 22s8.5-1 8.5-2.7c0-.9-1-1.7-2.5-2.3" />
    </svg>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '30px 20px', background: 'none', border: 'none', color: '#fff', font: '600 15px Inter, sans-serif', textAlign: 'left', cursor: 'pointer' }}
      >
        <span>{q}</span>
        <span aria-hidden="true" style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.5)', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}>+</span>
      </button>
      {open && <p style={{ margin: 0, padding: '0 20px 24px', fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>{a}</p>}
    </div>
  )
}

export default function ICPLC26Page() {
  // Fetch editable content from database
  const { data: content } = useQuery({
    queryKey: ['icplc26_content'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc26_content')
        .select('*')
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data || null
    }
  })

  const eventDates = content?.event_dates || FALLBACK_DATES
  const eventLocation = content?.event_location || FALLBACK_LOCATION
  const registerUrl = content?.register_url || FALLBACK_REGISTER_URL

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Barlow:wght@700;800;900&family=Barlow+Condensed:wght@700;800&family=Inter:wght@400;500;600&display=swap'
    document.head.appendChild(link)
    const prevTitle = document.title
    document.title = 'ICPLC 2026'
    return () => { document.head.removeChild(link); document.title = prevTitle }
  }, [])

  return (
    <div className="icplc26" style={{ background: INK, color: '#fff', fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
      <style>{`
        .icplc26 .i26-nav { position: fixed; top: 24px; left: 24px; right: 24px; z-index: 20; display: flex; align-items: center; justify-content: space-between; padding: 12px 30px; }
        .icplc26 .i26-foot { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; align-items: center; gap: 22px; padding: 18px 44px; font-size: 20px; white-space: nowrap; }
        .icplc26 .i26-section { min-height: 100vh; position: relative; display: flex; align-items: center; justify-content: center; padding: 140px 24px 140px; box-sizing: border-box; }
        .icplc26 .i26-faq { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; width: 100%; max-width: 1400px; align-items: center; }
        @media (max-width: 900px) {
          .icplc26 .i26-nav { top: 12px; left: 12px; right: 12px; padding: 8px 16px; }
          .icplc26 .i26-foot { flex-direction: column; gap: 6px; padding: 12px 20px; font-size: 13px; white-space: normal; text-align: center; width: calc(100% - 24px); box-sizing: border-box; bottom: 12px; }
          .icplc26 .i26-foot .i26-sep { display: none; }
          .icplc26 .i26-faq { grid-template-columns: 1fr; }
          .icplc26 .i26-section { padding: 110px 16px 150px; }
        }
      `}</style>

      <nav className="i26-nav" style={{ ...pill, background: 'transparent', mixBlendMode: 'normal' }}>
        <Link to="/icplc26" aria-label="ICPLC home" style={{ textDecoration: 'none' }}><Wordmark /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 17, fontWeight: 500 }}>
          <Link to={STATUS_URL} style={{ color: '#fff', textDecoration: 'none' }}>Status Tracker</Link>
          <a href={registerUrl} target="_blank" rel="noopener noreferrer" style={{ ...pill, padding: '12px 24px', textDecoration: 'none', fontWeight: 500, color: '#fff' }}>Register Now</a>
        </div>
      </nav>

      {/* Hero */}
      <section
        className="i26-section"
        style={{
          background: `radial-gradient(circle at 8% 15%, ${ORANGE} 0, transparent 42%), radial-gradient(circle at 96% 88%, ${ORANGE} 0, transparent 35%), ${BLUE}`,
          padding: '80px 24px',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(0,0,0,0.32) 1.5px, transparent 1.7px)', backgroundSize: '6px 6px', opacity: 0.6, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: '100%', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 'clamp(180px, 35vw, 520px)', letterSpacing: '-0.08em', lineHeight: 0.75, color: '#f5f5f3', marginBottom: '-20px' }}>
            icplc
          </div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 'clamp(16px, 2.8vw, 32px)', lineHeight: 1.1, textTransform: 'uppercase', color: '#f5f5f3', letterSpacing: '0.02em' }}>
            International Campus Pastors&apos;<br />and Leaders&apos; Conference
          </div>
        </div>
      </section>

      {/* What is ICPLC */}
      <section className="i26-section" style={dotsBg}>
        <div style={{ textAlign: 'center', maxWidth: 900 }}>
          <div style={{ ...pill, display: 'inline-block', padding: '16px 40px', fontSize: 28, marginBottom: 36 }}>What is ICPLC?</div>
          <p style={{ margin: 0, fontSize: 'clamp(20px, 2.4vw, 30px)', lineHeight: 1.35 }}>
            ICPLC <span style={{ color: ORANGE }}>(International Campus Pastors&apos; and Leaders&apos; Conference)</span> is a global gathering of passionate, purpose-driven youth leaders, student ministers, and campus fellowship pastors in the Believers&apos; Loveworld Nation.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="i26-section">
        <div className="i26-faq">
          <div style={{ paddingLeft: 'clamp(0px, 8vw, 150px)' }}>
            <div style={{ ...pill, display: 'inline-block', padding: '16px 40px', fontSize: 28, marginBottom: 28 }}>FAQ?</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 500, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              Got Questions?<br /><span style={{ color: 'rgba(255,255,255,0.75)' }}>We&apos;ve Got Answers</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 705 }}>
            {FAQS.map(f => <FaqItem key={f.q} {...f} />)}
          </div>
        </div>
      </section>

      <div className="i26-foot" style={pill}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}><CalendarIcon />{eventDates}</span>
        <span className="i26-sep" aria-hidden="true">•</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}><PinIcon />{eventLocation}</span>
      </div>
    </div>
  )
}
