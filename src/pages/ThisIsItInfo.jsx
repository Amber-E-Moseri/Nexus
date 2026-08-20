import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

// Try to get profile without requiring auth
function useOptionalProfile() {
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      supabase.from('users').select('id,role').eq('id', data.user.id).single()
        .then(({ data: u }) => setProfile(u));
    });
  }, []);
  return profile;
}

const FALLBACK = {
  airport_code: 'YWG',
  airport_name: 'Winnipeg James Armstrong Richardson International Airport',
  airport_distance_km: 10,
  hotel_name: 'Sandman Hotel & Suites Winnipeg Airport',
  hotel_address: '1750 Sargent Avenue, Winnipeg, MB R3H 0C7',
  hotel_phone: '(204) 775-7263',
  transport_contact_name: 'David Akalue',
  transport_contact_chat: '@davidakalue99',
  transport_contact_phone: '+1 (204) 396-6156',
  flight_form_url: 'https://leaders.lwcanada.org/f/rp3uahba3c3c',
  friday_opening_time: '6:00 PM',
  dress_code: 'Semiformal for most of the weekend. On day 2 we\'ll all be wearing our This Is It shirts.',
  all_white_for: 'Thanksgiving service',
};

export default function ThisIsItInfo() {
  const profile = useOptionalProfile();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState('fri');
  const observerRef = useRef(null);

  const canEdit = profile?.role === 'super_admin' || profile?.role === 'regional_secretary';

  const { data: content } = useQuery({
    queryKey: ['this_is_it_event_content', 2026],
    queryFn: async () => {
      const { data } = await supabase
        .from('this_is_it_event_content').select('*').eq('event_year', 2026).single();
      return data;
    }
  });

  const c = content || FALLBACK;

  const { data: scheduleItems = [] } = useQuery({
    queryKey: ['this_is_it_schedule_items', content?.id],
    queryFn: async () => {
      if (!content?.id) return [];
      const { data } = await supabase
        .from('this_is_it_schedule_items').select('*')
        .eq('event_content_id', content.id)
        .order('order_num');
      return data || [];
    },
    enabled: !!content?.id
  });

  const scheduleByDay = scheduleItems.reduce((acc, item) => {
    if (!acc[item.day]) acc[item.day] = [];
    acc[item.day].push(item);
    return acc;
  }, {});

  useEffect(() => {
    document.title = 'This Is It 2.0 - Prep Guide';
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.stop-head,.card').forEach(el => obs.observe(el));
    observerRef.current = obs;
    return () => obs.disconnect();
  }, []);

  const DAYS = [
    { key: 'fri', label: 'Fri, Aug 28' },
    { key: 'sat', label: 'Sat, Aug 29' },
    { key: 'sun', label: 'Sun, Aug 30' },
    { key: 'mon', label: 'Mon, Aug 31' },
  ];

  const dayItems = scheduleByDay[activeDay] || [];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap');
        :root{--yellow:#EAC63D;--coral:#DD6F51;--purple:#6B12BC;--teal:#7EDAC3;--ink:#161717;--paper:#FBF7EE;--paper-line:#E7DFCB;--bg:#F9F7F2;--max:720px;}
        @keyframes ticketIn{0%{opacity:0;transform:translateY(20px) scale(.98)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes logoIn{0%{opacity:0;transform:translateY(-12px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes flyAcross{0%{transform:translateX(-4px)}50%{transform:translateX(4px)}100%{transform:translateX(-4px)}}
        @keyframes popCheck{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes slideUp{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{0%{opacity:0}100%{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
        .tii-body{margin:0;background:var(--bg);color:var(--ink);font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:48px;}
        .tii-nav{position:sticky;top:0;z-index:50;background:rgba(249,247,242,0.85);backdrop-filter:blur(8px);overflow-x:auto;white-space:nowrap;padding:12px 14px;scrollbar-width:none;border-bottom:1px solid rgba(22,23,23,0.06);}
        .tii-nav::-webkit-scrollbar{display:none;}
        .tii-nav a{display:inline-block;font-size:13px;font-weight:500;letter-spacing:.02em;color:var(--ink);text-decoration:none;padding:6px 12px;margin-right:4px;border-radius:6px;transition:background .2s,color .2s;}
        .tii-nav a:hover{background:rgba(22,23,23,.08);}
        .tii-eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#999;font-weight:600;text-align:center;margin:0 0 12px;animation:fadeIn .6s ease;}
        .tii-ticket{max-width:var(--max);margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(22,23,23,.06);border:1px solid var(--paper-line);animation:ticketIn .6s ease .15s both;transition:box-shadow .25s,transform .25s;}
        .tii-ticket:hover{box-shadow:0 4px 12px rgba(22,23,23,.1);transform:translateY(-2px);}
        .tii-ticket-top{padding:20px 20px 16px;animation:slideUp .6s ease .2s both;}
        .tii-tk-row{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;}
        .tii-tk-city{font-family:'Anton',sans-serif;font-size:clamp(24px,6vw,36px);line-height:.95;letter-spacing:.01em;animation:slideUp .5s ease .25s both;}
        .tii-tk-sub{font-size:11px;color:#999;margin-top:3px;letter-spacing:.04em;text-transform:uppercase;animation:fadeIn .5s ease .3s both;}
        .tii-tk-arrow{font-family:'Anton',sans-serif;font-size:20px;color:var(--coral);align-self:center;padding-bottom:4px;animation:flyAcross 2.2s ease-in-out infinite;}
        .tii-tk-fields{margin-top:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px 14px;border-top:1px solid var(--paper-line);padding-top:14px;}
        .tii-tk-field label{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#999;margin-bottom:3px;font-weight:600;}
        .tii-tk-field .val{font-weight:600;font-size:14px;}
        .tii-tk-field.full{grid-column:1/-1;}
        .tii-stub{border-top:1px solid var(--paper-line);padding:14px 20px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
        .tii-stub-code{font-size:11px;letter-spacing:.08em;color:#999;text-transform:uppercase;}
        .tii-stub-badge{font-size:12px;letter-spacing:.02em;font-weight:600;background:var(--coral);color:#fff;padding:5px 10px;border-radius:6px;}
        .tii-section{max-width:var(--max);margin:40px auto 0;padding:0 18px;scroll-margin-top:60px;}
        .tii-stop-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;opacity:0;transform:translateY(16px);transition:opacity .5s,transform .5s;}
        .tii-stop-head.in{opacity:1;transform:translateY(0);}
        .tii-dot{flex:none;width:32px;height:32px;border-radius:50%;background:var(--yellow);color:var(--ink);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:1px solid var(--paper-line);animation:pulse 3s ease-in-out infinite;}
        .tii-stop-head h2{font-family:'Anton',sans-serif;font-weight:400;font-size:clamp(20px,5vw,28px);letter-spacing:.01em;margin:0;}
        .tii-card{background:#fff;border:1px solid var(--paper-line);border-radius:10px;padding:18px;box-shadow:0 1px 3px rgba(22,23,23,.04);opacity:0;transform:translateY(16px);transition:transform .4s,box-shadow .2s,opacity .4s;}
        .tii-card.in{opacity:1;transform:translateY(0);}
        .tii-card.in:hover{transform:translateY(-2px);box-shadow:0 3px 8px rgba(22,23,23,.08);}
        .tii-card + .tii-card{margin-top:10px;}
        .tii-card p{margin:0 0 10px;line-height:1.6;font-size:15px;}
        .tii-card p:last-child{margin-bottom:0;}
        .tii-card h3{font-size:15px;font-weight:700;margin:0 0 8px;display:flex;align-items:center;gap:8px;}
        .tii-tag{display:inline-block;font-size:10px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;padding:4px 9px;border-radius:5px;border:1px solid;margin-bottom:10px;}
        .tii-tag.placeholder{background:rgba(221,111,81,.1);color:var(--coral);}
        .tii-tag.ready{background:rgba(126,218,195,.1);color:#3aa895;}
        .tii-checklist{list-style:none;margin:0;padding:0;}
        .tii-checklist li{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--paper-line);font-size:14px;cursor:pointer;user-select:none;transition:padding-left .15s,background .2s;}
        .tii-checklist li:hover{padding-left:4px;background:rgba(126,218,195,.05);border-radius:4px;}
        .tii-checklist li:last-child{border-bottom:none;}
        .tii-box{flex:none;width:18px;height:18px;border:1.5px solid var(--ink);border-radius:4px;margin-top:2px;display:flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s;}
        .tii-checklist li:hover .tii-box{border-color:var(--teal);}
        .tii-box svg{width:11px;height:11px;opacity:0;}
        .tii-checklist li.done .tii-box{background:var(--teal);border-color:var(--teal);}
        .tii-checklist li.done .tii-box svg{opacity:1;animation:popCheck .3s cubic-bezier(.34,1.56,.64,1) both;}
        .tii-checklist li.done .tii-txt{text-decoration:line-through;color:#999;}
        .tii-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;}
        @media(max-width:520px){.tii-grid2{grid-template-columns:1fr;}}
        .tii-mini{background:#f9f7f2;border:1px solid var(--paper-line);border-radius:8px;padding:12px;}
        .tii-mini .lbl{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#999;font-weight:600;}
        .tii-mini .big{font-weight:600;font-size:14px;margin-top:4px;}
        .tii-btn{display:inline-block;font-weight:600;font-size:14px;background:var(--purple);color:#fff;padding:10px 16px;border-radius:7px;text-decoration:none;border:1px solid var(--purple);transition:background .2s,transform .15s;}
        .tii-btn:hover{background:#5a0fa8;transform:translateY(-1px);}
        .tii-mapwrap{border:1px solid var(--paper-line);border-radius:10px;overflow:hidden;margin-top:12px;}
        .tii-mapwrap iframe{display:block;width:100%;height:220px;border:none;}
        .tii-daytabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;}
        .tii-daytab{font-size:12px;font-weight:600;letter-spacing:.02em;padding:7px 12px;border-radius:6px;border:1px solid var(--paper-line);background:#fff;cursor:pointer;transition:background .15s,border-color .15s,transform .15s;}
        .tii-daytab:hover:not(.empty){background:#f9f7f2;transform:translateY(-1px);}
        .tii-daytab.active{background:var(--ink);color:#fff;border-color:var(--ink);}
        .tii-daytab.empty{cursor:default;opacity:.5;}
        .tii-sched-empty{text-align:center;padding:32px 16px;color:#999;font-size:14px;}
        .tii-sched-row{display:flex;gap:12px;padding:12px 0;border-bottom:1px dashed var(--paper-line);}
        .tii-sched-row:last-child{border-bottom:none;}
        .tii-sched-time{flex:none;min-width:62px;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:var(--purple);padding-top:1px;}
        .tii-sched-what b{display:block;font-size:14px;margin-bottom:2px;}
        .tii-sched-what p{margin:0;font-size:13px;color:#666;line-height:1.5;}
        .tii-help-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;}
        @media(max-width:480px){.tii-help-grid{grid-template-columns:1fr;}}
        @media(max-width:640px){.tii-section{padding:0 14px;}.tii-card h3{font-size:14px;}.tii-card p{font-size:14px;}}
        .tii-dept-arrival{background:#f9f7f2;border:1px solid var(--paper-line);border-radius:8px;padding:14px;margin-top:12px;}
        .tii-dept-arrival ul{margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.7;}
      `}</style>
      <div className="tii-body">
        {canEdit && (
          <button
            onClick={() => navigate('/thisisitinfo-admin')}
            style={{ position:'fixed',top:'16px',right:'16px',zIndex:100,padding:'8px 14px',background:'#6B12BC',color:'#fff',border:'none',borderRadius:'8px',fontWeight:700,cursor:'pointer',fontSize:'13px' }}
          >
            ✏️ Edit
          </button>
        )}

        <nav className="tii-nav">
          <a href="#pack">Before You Fly</a>
          <a href="#getting-there">Getting There</a>
          <a href="#checkin">Check-In</a>
          <a href="#venue">Venue</a>
          <a href="#schedule">Schedule</a>
          <a href="#help">Need Help</a>
        </nav>

        {/* Hero */}
        <div style={{ padding:'28px 16px 6px', animation:'slideUp .6s ease' }}>
          <p className="tii-eyebrow">BLW Canada Sub-Region · Staff Retreat 2026</p>
          <div className="tii-ticket">
            <div className="tii-ticket-top">
              <div className="tii-tk-row">
                <div>
                  <div className="tii-tk-city">YYZ</div>
                  <div className="tii-tk-sub">Your City</div>
                </div>
                <div className="tii-tk-arrow">→</div>
                <div>
                  <div className="tii-tk-city">{c.airport_code}</div>
                  <div className="tii-tk-sub">Winnipeg, MB</div>
                </div>
              </div>
              <div className="tii-tk-fields">
                <div className="tii-tk-field">
                  <label>Date</label>
                  <div className="val">28–31 Aug 2026</div>
                </div>
                <div className="tii-tk-field">
                  <label>Venue</label>
                  <div className="val">Sandman Hotel &amp; Suites</div>
                </div>
                <div className="tii-tk-field">
                  <label>Opens</label>
                  <div className="val">Fri {c.friday_opening_time}</div>
                </div>
                <div className="tii-tk-field">
                  <label>Checkout</label>
                  <div className="val">Mon Morning</div>
                </div>
              </div>
            </div>
            <div className="tii-stub">
              <span className="tii-stub-code">TII · 2026 · BLW CAN</span>
              <span className="tii-stub-badge">Staff Only</span>
            </div>
          </div>
          <p style={{ textAlign:'center', maxWidth:'520px', margin:'18px auto 0', fontSize:'14px', color:'#666', lineHeight:1.6 }}>
            Everything you need to know before you fly. This page will keep updating as details are confirmed — check back before you travel.
          </p>
        </div>

        {/* Before You Fly */}
        <section className="tii-section" id="pack" style={{ marginTop:'40px' }}>
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">1</div>
            <div>
              <span style={{ display:'block', fontSize:'10px', letterSpacing:'.08em', textTransform:'uppercase', color:'#999', fontWeight:600, marginBottom:'2px' }}>Step 01</span>
              <h2>Before You Fly</h2>
            </div>
          </div>
          <div className="tii-card card">
            <h3>✈️ Flight form</h3>
            <p>Fill this out so the team knows your travel details and can arrange transfers.</p>
            <a className="tii-btn" href={c.flight_form_url} target="_blank" rel="noopener noreferrer">Fill out the flight form</a>
          </div>
          <div className="tii-card card" style={{ marginTop:'10px' }}>
            <h3>🎒 What to pack</h3>
            <p>Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.</p>
            <ul className="tii-checklist" id="packlist">
              <CheckItem>Photo ID (for flight + hotel check-in)</CheckItem>
              <CheckItem>All white outfit for Thanksgiving service</CheckItem>
              <CheckItem>Sunday service outfit</CheckItem>
              <CheckItem>Light jacket or sweater (evenings get cool)</CheckItem>
              <CheckItem>Toiletries (hotel has basics, bring your own if you prefer)</CheckItem>
              <CheckItem>Portable charger / phone charger</CheckItem>
            </ul>
            <p style={{ fontSize:'13px', color:'#666', marginTop:'10px', paddingTop:'10px', borderTop:'1px solid var(--paper-line)' }}>
              <strong>This Is It shirt:</strong> Will be provided at check-in or after the Friday opening session — no need to pack it.
            </p>
          </div>
          <div className="tii-card card" style={{ marginTop:'10px' }}>
            <h3>👗 Dress code</h3>
            <p>{c.dress_code}</p>
          </div>
        </section>

        {/* Getting There */}
        <section className="tii-section" id="getting-there">
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">2</div>
            <div>
              <span style={{ display:'block', fontSize:'10px', letterSpacing:'.08em', textTransform:'uppercase', color:'#999', fontWeight:600, marginBottom:'2px' }}>Step 02</span>
              <h2>Getting There</h2>
            </div>
          </div>
          <div className="tii-card card">
            <h3>🛬 Airport</h3>
            <p><b>{c.airport_name} ({c.airport_code})</b>. This is the airport to fly into — it's only about {c.airport_distance_km} minutes from the hotel.</p>
          </div>
          <div className="tii-card card">
            <h3>🚐 Hotel shuttle</h3>
            <span className="tii-tag ready">Included</span>
            <p>A driver from the hotel shuttle will come get you at arrivals. They'll already have your name on their pickup list — nothing to book or call ahead. Just head to arrivals and look for the <b>Sandman shuttle</b>.</p>
          </div>
          <div className="tii-card card">
            <h3>🕐 When to arrive</h3>
            <p>Your arrival time depends on your department. Check with your department lead. If you haven't heard otherwise, aim to arrive by <b>4:30 PM</b> so you're settled before the opening session.</p>
            <div className="tii-dept-arrival">
              <b style={{ fontSize:'13px' }}>Arrival time by department</b>
              <ul>
                <li>Check with your department lead for your specific arrival window</li>
                <li>Default: arrive by <b>4:30 PM</b> Friday, Aug 28</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Hotel Check-In */}
        <section className="tii-section" id="checkin">
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">3</div>
            <div>
              <span style={{ display:'block', fontSize:'10px', letterSpacing:'.08em', textTransform:'uppercase', color:'#999', fontWeight:600, marginBottom:'2px' }}>Step 03</span>
              <h2>Hotel Check-In</h2>
            </div>
          </div>
          <div className="tii-card card">
            <h3>🏨 {c.hotel_name}</h3>
            <p style={{ margin:'0 0 6px' }}>{c.hotel_address}</p>
            <p style={{ margin:'0 0 10px', fontSize:'13px', color:'#666' }}>Tel: {c.hotel_phone}</p>
            <div className="tii-mapwrap">
              <iframe
                loading="lazy"
                title="Hotel location"
                src="https://www.google.com/maps?q=Sandman+Hotel+%26+Suites+Winnipeg+Airport,1750+Sargent+Avenue,Winnipeg,MB+R3H+0C7&output=embed"
              />
            </div>
            <div style={{ marginTop:'12px' }}>
              <a className="tii-btn" href="https://www.google.com/maps/search/?api=1&query=Sandman+Hotel+%26+Suites+Winnipeg+Airport,1750+Sargent+Avenue,Winnipeg,MB+R3H+0C7" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
            </div>
          </div>
          <div className="tii-card card">
            <h3>📋 Check-in process</h3>
            <p>When you arrive, check in at the front desk. Your room is covered — no card required. If there's any issue, connect with <b>{c.transport_contact_name}</b> directly.</p>
          </div>
        </section>

        {/* Venue */}
        <section className="tii-section" id="venue">
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">4</div>
            <div>
              <span style={{ display:'block', fontSize:'10px', letterSpacing:'.08em', textTransform:'uppercase', color:'#999', fontWeight:600, marginBottom:'2px' }}>Step 04</span>
              <h2>Venue</h2>
            </div>
          </div>
          <div className="tii-card card">
            <h3>📍 Conference Room, {c.hotel_name}</h3>
            <p>Good news: the retreat venue is the hotel itself. All sessions run out of the conference room at the Sandman — once you're checked in, you're already there.</p>
          </div>
          <div className="tii-card card">
            <div className="tii-grid2">
              <div className="tii-mini">
                <div className="lbl">Wi-Fi</div>
                <div className="big">Free, hotel-wide</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Sessions</div>
                <div className="big">Conference Room</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Meals</div>
                <div className="big">Details to come</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Checkout</div>
                <div className="big">Mon morning</div>
              </div>
            </div>
          </div>
        </section>

        {/* Schedule */}
        <section className="tii-section" id="schedule">
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">5</div>
            <div>
              <span style={{ display:'block', fontSize:'10px', letterSpacing:'.08em', textTransform:'uppercase', color:'#999', fontWeight:600, marginBottom:'2px' }}>Step 05</span>
              <h2>Schedule</h2>
            </div>
          </div>
          <div className="tii-card card">
            <p>The first session kicks off Friday at <b>{c.friday_opening_time}</b>. The full schedule will fill in as it's ready.</p>
            <div className="tii-daytabs">
              {DAYS.map(d => {
                const hasItems = (scheduleByDay[d.key] || []).length > 0;
                return (
                  <button
                    key={d.key}
                    className={`tii-daytab${activeDay === d.key ? ' active' : ''}${!hasItems ? ' empty' : ''}`}
                    onClick={() => hasItems && setActiveDay(d.key)}
                    title={!hasItems ? 'No schedule yet' : undefined}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {dayItems.length === 0 ? (
              <div className="tii-sched-empty">
                <span style={{ fontSize:'24px', display:'block', marginBottom:'8px' }}>📋</span>
                Schedule for this day hasn't been posted yet. Check back soon.
              </div>
            ) : (
              dayItems.map((item, i) => (
                <div key={i} className="tii-sched-row">
                  <div className="tii-sched-time">{item.time}</div>
                  <div className="tii-sched-what">
                    <b>{item.title}</b>
                    {item.description && <p>{item.description}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Need Help */}
        <section className="tii-section" id="help">
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">?</div>
            <div>
              <h2>Need Help?</h2>
            </div>
          </div>
          <div className="tii-card card">
            <h3>📞 On-the-ground contact</h3>
            <p>For anything travel-related — shuttle timing, room issues, or last-minute questions — reach out to:</p>
            <div className="tii-help-grid">
              <div className="tii-mini">
                <div className="lbl">Name</div>
                <div className="big">{c.transport_contact_name}</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Phone / WhatsApp</div>
                <div className="big"><a href={`tel:${c.transport_contact_phone}`} style={{ color:'var(--purple)' }}>{c.transport_contact_phone}</a></div>
              </div>
              {c.transport_contact_chat && (
                <div className="tii-mini">
                  <div className="lbl">Chat</div>
                  <div className="big">{c.transport_contact_chat}</div>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer style={{ maxWidth:'var(--max)', margin:'56px auto 0', padding:'0 18px', textAlign:'center' }}>
          <p style={{ fontSize:'11.5px', color:'rgba(22,23,23,0.45)', lineHeight:1.7 }}>
            <b>This Is It · Bigger, Bolder, Best for God</b><br/>
            Winnipeg, Manitoba · 28–31 August 2026<br/>
            This page will keep getting updated as more details are confirmed.
          </p>
        </footer>
      </div>
    </>
  );
}

function CheckItem({ children }) {
  const [done, setDone] = useState(false);
  return (
    <li className={done ? 'done' : ''} onClick={() => setDone(d => !d)}>
      <span className="tii-box">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 12l5 5L20 6" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <span className="tii-txt">{children}</span>
    </li>
  );
}
