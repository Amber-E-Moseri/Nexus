import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import twemoji from 'twemoji';

// Programs team members granted edit access on this page specifically,
// without changing their app-wide role (which would affect permissions
// well beyond this page): Pastor Chi Nwokem (cedochie@gmail.com),
// Dorcas M (dorcasmuk20@gmail.com), Ella Ukpabia (emmanuellauk54@gmail.com).
const EXTRA_EDITOR_USER_IDS = [
  '4c70ca61-443b-4a64-87aa-3453c9dd5c65',
  '750e94e0-aa87-491c-8372-958225861484',
  '0a645fbf-01e2-4c49-a32a-4a13b2800b6d',
];

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
  monday_checkout_time: 'Mon Morning',
  event_dates: '28–31 Aug 2026',
  dress_code: 'Semiformal for most of the weekend. On day 2 we\'ll all be wearing our This Is It shirts.',
  all_white_for: 'Thanksgiving service',
  wifi_text: 'Free, hotel-wide',
  sessions_text: 'Conference Room',
  meals_text: 'Details to come',
  dept_arrival_note: 'Check with your department lead for your specific arrival window',
  dept_arrival_default: '4:30 PM Friday, Aug 28',
};

function EditableText({ value, onSave, multiline = false, className = '' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tmpValue, setTmpValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [isEditing]);

  const hasChanged = tmpValue !== value;

  const handleSave = async () => {
    if (!hasChanged) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(tmpValue);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTmpValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <span style={{ display: 'inline-block', position: 'relative', width: multiline ? '100%' : 'auto' }}>
        {multiline ? (
          <textarea
            ref={inputRef}
            value={tmpValue}
            onChange={(e) => setTmpValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ width: '100%', padding: '8px', minHeight: '60px', fontFamily: 'inherit', fontSize: 'inherit', border: '2px solid var(--purple)' }}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={tmpValue}
            onChange={(e) => setTmpValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ padding: '4px 8px', fontFamily: 'inherit', fontSize: 'inherit', border: '2px solid var(--purple)' }}
          />
        )}
        <span style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <button
            onClick={handleSave}
            disabled={!hasChanged || isSaving}
            style={{ padding: '4px 10px', background: hasChanged ? 'var(--teal)' : '#ccc', color: '#161717', border: 'none', borderRadius: '4px', cursor: hasChanged ? 'pointer' : 'default', fontSize: '12px', fontWeight: 700 }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            style={{ padding: '4px 10px', background: '#eee', color: '#161717', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            Cancel
          </button>
        </span>
      </span>
    );
  }

  return <span className={className} onClick={() => setIsEditing(true)} style={{ cursor: 'pointer', position: 'relative' }}>
    {value}
  </span>;
}

const NAV_ITEMS = [
  { id: 'expect',       label: 'What to Expect' },
  { id: 'pack',         label: 'Before You Fly' },
  { id: 'getting-there',label: 'Getting There'  },
  { id: 'checkin',      label: 'Check-In'       },
  { id: 'venue',        label: 'Venue'           },
  { id: 'schedule',     label: 'Schedule'        },
  { id: 'help',         label: 'Need Help'       },
];

export default function ThisIsItInfo() {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState('fri');
  const [editMode, setEditMode] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [newItem, setNewItem] = useState({ day: 'fri', time: '', title: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [activeSection, setActiveSection] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  const tiiRef = useRef(null);

  const queryClient = useQueryClient();

  const canEdit = profile && (role === 'super_admin' || role === 'regional_secretary' || EXTRA_EDITOR_USER_IDS.includes(profile.id));

  // Single query: fetch content first, then schedule + checklist in parallel.
  // Previously three separate queries with schedule/checklist waterfalled behind
  // content (enabled: !!content?.id) — that added one extra round-trip latency.
  const { data: pageData, isLoading } = useQuery({
    queryKey: ['this_is_it_page', 2026],
    queryFn: async () => {
      const { data: content } = await supabase
        .from('this_is_it_event_content').select('*').eq('event_year', 2026).single();
      if (!content?.id) return { content, scheduleItems: [], checklistItems: [] };
      const [{ data: scheduleItems }, { data: checklistItems }] = await Promise.all([
        supabase.from('this_is_it_schedule_items').select('*').eq('event_content_id', content.id).order('order_num'),
        supabase.from('this_is_it_checklist_items').select('*').eq('event_content_id', content.id).eq('section', 'packing').order('order_num'),
      ]);
      return { content, scheduleItems: scheduleItems || [], checklistItems: checklistItems || [] };
    },
    staleTime: 60_000,
  });

  const content = pageData?.content ?? null;
  const scheduleItems = pageData?.scheduleItems ?? [];
  const checklistItems = pageData?.checklistItems ?? [];
  const c = content || FALLBACK;

  const scheduleByDay = scheduleItems.reduce((acc, item) => {
    if (!acc[item.day]) acc[item.day] = [];
    acc[item.day].push(item);
    return acc;
  }, {});

  const [newChecklistItem, setNewChecklistItem] = useState('');

  useEffect(() => {
    document.title = 'This Is It 2.0 - Prep Guide';
  }, []);

  // Re-runs once isLoading flips to false: the content query shows a
  // "Loading..." placeholder on first mount (no .stop-head/.card elements
  // exist yet), so an observer set up with an empty dep array would find
  // nothing to watch and those sections would stay opacity:0 forever. This
  // only surfaced on cold loads — a warm React Query cache skips the
  // placeholder entirely, which is why it looked intermittent.
  // Staggered reveal: cards within the same section animate in sequence
  useEffect(() => {
    if (isLoading) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          if (e.target.classList.contains('card')) {
            const siblings = [...(e.target.parentElement?.children || [])].filter(el => el.classList.contains('card'));
            const i = siblings.indexOf(e.target);
            e.target.style.transitionDelay = `${i * 80}ms`;
          }
          e.target.classList.add('in');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.stop-head,.card').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [isLoading]);

  // Scroll-spy: highlight the nav link for whichever section is centred in the viewport
  useEffect(() => {
    if (isLoading) return;
    const ids = ['expect', 'pack', 'getting-there', 'checkin', 'venue', 'schedule', 'help'];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); });
    }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || !tiiRef.current) return;
    twemoji.parse(tiiRef.current, {
      folder: 'svg',
      ext: '.svg',
      base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
      attributes: () => ({ style: 'height:1.1em;width:1.1em;vertical-align:-0.15em;display:inline-block' }),
    });
  }, [isLoading]);

  useEffect(() => {
    const target = new Date('2026-08-28T09:00:00-04:00');
    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) { setCountdown({ days:0, hours:0, mins:0, secs:0 }); return; }
      setCountdown({
        days:  Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        mins:  Math.floor((diff % 3600000)  / 60000),
        secs:  Math.floor((diff % 60000)    / 1000),
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const progress = Math.min(scrollTop / (docHeight - windowHeight), 1);
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  const handleSaveField = async (field, value) => {
    if (!content?.id) {
      alert('No content ID - cannot save. Please refresh the page.');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('this_is_it_event_content')
        .update({ [field]: value })
        .eq('id', content.id)
        .select();
      if (error) {
        console.error('Save error:', error);
        alert('Error saving: ' + error.message);
        return;
      }
      if (!data || data.length === 0) {
        alert('No rows updated - you may not have permission to edit.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_page'] });
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving: ' + err.message);
    }
  };

  const handleAddScheduleItem = async () => {
    if (!content?.id || !newItem.title || !newItem.time) {
      alert('Fill in title and time');
      return;
    }
    setIsSaving(true);
    try {
      const dayItems = scheduleByDay[newItem.day] || [];
      const { error } = await supabase
        .from('this_is_it_schedule_items')
        .insert({
          event_content_id: content.id,
          day: newItem.day,
          time: newItem.time,
          title: newItem.title,
          description: newItem.description,
          order_num: dayItems.length + 1
        });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_page'] });
      setNewItem({ day: 'fri', time: '', title: '', description: '' });
      alert('Schedule item added!');
    } catch (err) {
      console.error('Add item error:', err);
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!content?.id || !newChecklistItem.trim()) {
      alert('Enter an item');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('this_is_it_checklist_items')
        .insert({
          event_content_id: content.id,
          section: 'packing',
          item: newChecklistItem,
          order_num: checklistItems.length + 1
        });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_page'] });
      setNewChecklistItem('');
      alert('Checklist item added!');
    } catch (err) {
      console.error('Add checklist error:', err);
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteChecklistItem = async (itemId) => {
    if (pendingDeleteId !== itemId) {
      setPendingDeleteId(itemId);
      return;
    }
    setPendingDeleteId(null);
    try {
      const { error } = await supabase
        .from('this_is_it_checklist_items')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_page'] });
    } catch (err) {
      console.error('Delete error:', err);
      alert('Error: ' + err.message);
    }
  };

  const handleUpdateChecklistItem = async (itemId, newText) => {
    try {
      const { error } = await supabase
        .from('this_is_it_checklist_items')
        .update({ item: newText })
        .eq('id', itemId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_page'] });
    } catch (err) {
      console.error('Update error:', err);
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteScheduleItem = async (itemId) => {
    if (pendingDeleteId !== itemId) {
      setPendingDeleteId(itemId);
      return;
    }
    setPendingDeleteId(null);
    try {
      const { error } = await supabase
        .from('this_is_it_schedule_items')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_page'] });
    } catch (err) {
      console.error('Delete error:', err);
      alert('Error: ' + err.message);
    }
  };

  const handleUpdateScheduleItem = async (itemId, field, value) => {
    try {
      const { error } = await supabase
        .from('this_is_it_schedule_items')
        .update({ [field]: value })
        .eq('id', itemId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_page'] });
    } catch (err) {
      console.error('Update error:', err);
      alert('Error: ' + err.message);
    }
  };

  if (isLoading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

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

        /* ── keyframes ─────────────────────────────────────────────────── */
        @keyframes ticketIn{
          0%{opacity:0;transform:translateY(36px) scale(.94)}
          55%{opacity:1;transform:translateY(-8px) scale(1.015)}
          75%{transform:translateY(4px) scale(.998)}
          100%{opacity:1;transform:translateY(0) scale(1)}
        }
        @keyframes logoIn{0%{opacity:0;transform:translateY(-12px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes flyAcross{0%{transform:translateX(-4px)}50%{transform:translateX(4px)}100%{transform:translateX(-4px)}}
        @keyframes popCheck{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
        @keyframes slideUp{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{0%{opacity:0}100%{opacity:1}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(234,198,61,.5)}50%{box-shadow:0 0 0 5px rgba(234,198,61,0)}}
        @keyframes dotIn{
          0%{transform:scale(0) rotate(-25deg)}
          65%{transform:scale(1.25) rotate(5deg)}
          100%{transform:scale(1) rotate(0)}
        }
        @keyframes confettiBurst{
          0%{transform:translate(-50%,-50%) translate(0,0) scale(1);opacity:1}
          80%{opacity:.7}
          100%{transform:translate(-50%,-50%) translate(var(--tx),var(--ty)) scale(0);opacity:0}
        }
        @keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes sheetBgIn{from{opacity:0}to{opacity:1}}

        /* ── base ───────────────────────────────────────────────────────── */
        @keyframes bgDrift{
          0%,100%{background-color:#F9F6EF;}
          50%{background-color:#FBF2E8;}
        }
        .tii-body{margin:0;color:var(--ink);font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:80px;
          animation:bgDrift 12s ease-in-out infinite;
        }
        @media(min-width:641px){.tii-body{padding-bottom:48px;}}

        /* ── desktop nav ────────────────────────────────────────────────── */
        .tii-nav{position:sticky;top:0;z-index:50;background:rgba(249,247,242,0.88);backdrop-filter:blur(10px);overflow-x:auto;overflow-y:visible;white-space:nowrap;padding:12px 14px 15px;scrollbar-width:none;border-bottom:1px solid rgba(22,23,23,0.06);-webkit-overflow-scrolling:touch;}
        .tii-nav-progress{position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(22,23,23,.08);pointer-events:none;}
        .tii-nav-plane{position:absolute;bottom:-1px;transform:translateX(-50%);font-size:14px;transition:left .15s linear;user-select:none;pointer-events:none;}
        .tii-nav::-webkit-scrollbar{display:none;}
        .tii-nav-links a{display:inline-block;font-size:13px;font-weight:500;letter-spacing:.02em;color:var(--ink);text-decoration:none;padding:6px 12px;margin-right:4px;border-radius:6px;transition:background .2s,color .2s,font-weight .15s;}
        .tii-nav-links a:hover{background:rgba(22,23,23,.08);}
        .tii-nav-links a.active{color:var(--purple);font-weight:700;background:rgba(107,18,188,.07);}
        @media(max-width:640px){.tii-nav-links{display:none;}}

        /* ── mobile bottom bar ──────────────────────────────────────────── */
        .tii-mobile-bar{
          display:none;position:fixed;bottom:0;left:0;right:0;z-index:80;
          background:rgba(249,247,242,0.95);backdrop-filter:blur(12px);
          border-top:1px solid var(--paper-line);
          align-items:center;justify-content:space-between;
          padding:10px 18px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));
        }
        @media(max-width:640px){.tii-mobile-bar{display:flex;}}
        .tii-mobile-bar-label{font-size:13px;font-weight:600;color:var(--ink);letter-spacing:.01em;}
        .tii-mobile-bar-btn{font-size:13px;font-weight:700;color:var(--purple);background:none;border:none;cursor:pointer;padding:6px 0;display:flex;align-items:center;gap:5px;letter-spacing:.01em;}

        /* ── bottom sheet ───────────────────────────────────────────────── */
        .tii-sheet-bg{position:fixed;inset:0;z-index:89;background:rgba(22,23,23,.5);animation:sheetBgIn .2s ease;}
        .tii-sheet{
          position:fixed;bottom:0;left:0;right:0;z-index:90;
          background:var(--paper);border-radius:20px 20px 0 0;
          padding:8px 20px calc(20px + env(safe-area-inset-bottom,0px));
          animation:sheetUp .32s cubic-bezier(.34,1.3,.64,1);
          box-shadow:0 -6px 30px rgba(22,23,23,.14);
        }
        .tii-sheet-handle{width:40px;height:4px;background:var(--paper-line);border-radius:2px;margin:8px auto 16px;}
        .tii-sheet-link{
          display:flex;align-items:center;justify-content:space-between;
          width:100%;padding:13px 0;border:none;border-bottom:1px solid var(--paper-line);
          background:none;font-family:'Inter',sans-serif;font-size:15px;font-weight:500;
          color:var(--ink);text-align:left;cursor:pointer;transition:color .15s;
        }
        .tii-sheet-link:last-child{border-bottom:none;}
        .tii-sheet-link.active{color:var(--purple);font-weight:700;}
        .tii-sheet-link.active::after{content:'●';font-size:8px;color:var(--purple);margin-left:8px;}

        /* ── hero ticket ────────────────────────────────────────────────── */
        .tii-eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#999;font-weight:600;text-align:center;margin:0 0 12px;animation:fadeIn .6s ease;}
        .tii-ticket{max-width:var(--max);margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(22,23,23,.08);border:1px solid var(--paper-line);animation:ticketIn .85s cubic-bezier(.22,.61,.36,1) .1s both;transition:box-shadow .25s,transform .25s;}
        .tii-ticket:hover{box-shadow:0 10px 28px rgba(22,23,23,.13);transform:translateY(-3px);}
        .tii-ticket-top{padding:20px 20px 16px;animation:slideUp .6s ease .2s both;}
        .tii-tk-row{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;}
        .tii-tk-city{font-family:'Anton',sans-serif;font-size:clamp(24px,6vw,36px);line-height:.95;letter-spacing:.01em;animation:slideUp .5s ease .25s both;}
        .tii-tk-sub{font-size:11px;color:#999;margin-top:3px;letter-spacing:.04em;text-transform:uppercase;animation:fadeIn .5s ease .3s both;}
        .tii-tk-arrow{font-family:'Anton',sans-serif;font-size:20px;color:var(--coral);align-self:center;padding-bottom:4px;animation:flyAcross 2.2s ease-in-out infinite;}
        .tii-tk-fields{margin-top:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px 14px;border-top:1px solid var(--paper-line);padding-top:14px;}
        .tii-tk-field label{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#999;margin-bottom:3px;font-weight:600;}
        .tii-tk-field .val{font-weight:600;font-size:14px;}
        .tii-tk-field.full{grid-column:1/-1;}
        .tii-stub{position:relative;border-top:2px dashed var(--paper-line);padding:18px 20px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;}
        .tii-stub::before,.tii-stub::after{content:'';position:absolute;top:-11px;width:22px;height:22px;border-radius:50%;background:var(--bg);border:1px solid var(--paper-line);}
        .tii-stub::before{left:-12px;}
        .tii-stub::after{right:-12px;}
        .tii-stub-code{font-size:11px;letter-spacing:.08em;color:#999;text-transform:uppercase;font-family:monospace;}
        .tii-stub-badge{display:inline-block;background:var(--coral);color:#fff;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:8px 16px;border-radius:999px;white-space:nowrap;}

        /* ── sections ───────────────────────────────────────────────────── */
        .tii-section{max-width:var(--max);margin:40px auto 0;padding:0 18px;scroll-margin-top:58px;}
        .tii-stop-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;opacity:0;transform:translateY(18px);transition:opacity .48s cubic-bezier(.22,.61,.36,1),transform .48s cubic-bezier(.22,.61,.36,1);}
        .tii-stop-head.in{opacity:1;transform:translateY(0);}
        .tii-dot{flex:none;width:32px;height:32px;border-radius:50%;background:var(--yellow);color:var(--ink);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:1px solid rgba(234,198,61,.4);}
        .tii-stop-head.in .tii-dot{animation:dotIn .42s cubic-bezier(.34,1.56,.64,1) .12s both, pulse 2.8s ease-in-out 0.6s infinite;}
        .tii-stop-head h2{font-family:'Anton',sans-serif;font-weight:400;font-size:clamp(20px,5vw,28px);letter-spacing:.01em;margin:0;text-wrap:balance;}

        /* ── cards ──────────────────────────────────────────────────────── */
        .tii-card{background:#fff;border:1px solid var(--paper-line);border-radius:10px;padding:18px;box-shadow:0 2px 8px rgba(22,23,23,.06);opacity:0;transform:translateY(20px);transition:transform .42s cubic-bezier(.22,.61,.36,1),box-shadow .3s,opacity .42s cubic-bezier(.22,.61,.36,1);}
        .tii-card.in{opacity:1;transform:translateY(0);}
        .tii-card.in:hover{transform:translateY(-4px);box-shadow:0 10px 24px rgba(22,23,23,.13);}
        .tii-card + .tii-card{margin-top:10px;}
        .tii-card p{margin:0 0 10px;line-height:1.6;font-size:15px;}
        .tii-card p:last-child{margin-bottom:0;}
        .tii-card h3{font-size:15px;font-weight:700;margin:0 0 8px;display:flex;align-items:center;gap:8px;}

        /* ── checklist ──────────────────────────────────────────────────── */
        .tii-tag{display:inline-block;font-size:10px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;padding:4px 9px;border-radius:5px;border:1px solid;margin-bottom:10px;}
        .tii-tag.ready{background:rgba(126,218,195,.1);color:#3aa895;}
        .tii-checklist{list-style:none;margin:0;padding:0;}
        .tii-checklist li{position:relative;display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--paper-line);font-size:14px;cursor:pointer;user-select:none;transition:padding-left .15s,background .2s,transform .2s;}
        .tii-checklist li:hover{padding-left:4px;background:rgba(126,218,195,.05);border-radius:4px;transform:translateX(2px);}
        .tii-checklist li:last-child{border-bottom:none;}
        .tii-box{flex:none;width:18px;height:18px;border:1.5px solid var(--ink);border-radius:4px;margin-top:2px;display:flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s,transform .15s;}
        .tii-checklist li:hover .tii-box{border-color:var(--teal);}
        .tii-box svg{width:11px;height:11px;opacity:0;}
        .tii-checklist li.done .tii-box{background:var(--teal);border-color:var(--teal);transform:scale(1.08);}
        .tii-checklist li.done .tii-box svg{opacity:1;animation:popCheck .35s cubic-bezier(.34,1.56,.64,1) both;}
        .tii-checklist li.done .tii-txt{text-decoration:line-through;color:#999;}
        .tii-confetti-dot{position:absolute;width:6px;height:6px;border-radius:50%;top:50%;left:9px;animation:confettiBurst .55s cubic-bezier(.36,.07,.19,.97) both;pointer-events:none;}

        /* ── layout helpers ─────────────────────────────────────────────── */
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
        .tii-daytab:hover{background:#f9f7f2;transform:translateY(-1px);}
        .tii-daytab.active{background:var(--ink);color:#fff;border-color:var(--ink);animation:slideUp .3s ease;}
        .tii-sched-empty{text-align:center;padding:32px 16px;color:#999;font-size:14px;}
        .tii-sched-row{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--paper-line);align-items:flex-start;transition:transform .15s ease;}
        .tii-sched-row:hover{transform:translateX(2px);}
        .tii-sched-row:last-child{border-bottom:none;}
        .tii-sched-time{flex:none;min-width:62px;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:var(--purple);padding-top:1px;}
        .tii-sched-what{font-size:14px;line-height:1.5;}
        .tii-sched-what b{display:block;font-size:14px;font-weight:700;}
        .tii-sched-what p{margin:0;font-size:13px;color:#666;line-height:1.5;}
        .tii-help-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;}
        @media(max-width:480px){.tii-help-grid{grid-template-columns:1fr;}}
        @media(max-width:640px){.tii-section{padding:0 12px;}.tii-card h3{font-size:14px;}.tii-card p{font-size:14px;}.tii-card{padding:14px;}}
        .tii-dept-arrival{background:#f9f7f2;border:1px solid var(--paper-line);border-radius:8px;padding:14px;margin-top:12px;}
        .tii-dept-arrival ul{margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.7;}
        .edit-mode-indicator{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:var(--purple);color:#fff;padding:8px 16px;border-radius:8px;font-weight:600;z-index:99;font-size:13px;}
        /* ── pulse ring (fee card) ───────────────────────────────────────── */
        @keyframes pulseRing{
          0%  {box-shadow:0 0 0 0 rgba(107,18,188,.30);}
          65% {box-shadow:0 0 0 14px rgba(107,18,188,0);}
          100%{box-shadow:0 0 0 0 rgba(107,18,188,0);}
        }
        .tii-fee-pulse{animation:pulseRing 2.6s ease-out infinite;}

        /* ── countdown ───────────────────────────────────────────────────── */
        @keyframes cdFlip{
          from{transform:translateY(-40%) scaleY(.4);opacity:0;}
          to  {transform:translateY(0)    scaleY(1);opacity:1;}
        }
        .tii-countdown{display:flex;justify-content:center;gap:14px;padding:18px 16px 6px;}
        .tii-cd-unit{display:flex;flex-direction:column;align-items:center;gap:5px;}
        .tii-cd-card{
          min-width:58px;padding:6px 10px;
          background:var(--paper);border:1px solid var(--paper-line);border-radius:10px;
          box-shadow:0 2px 8px rgba(22,23,23,.07);
          display:flex;align-items:center;justify-content:center;overflow:hidden;
        }
        .tii-cd-num{
          display:block;font-family:'Anton',sans-serif;font-size:32px;font-weight:400;
          letter-spacing:.02em;color:var(--purple);line-height:1;
          animation:cdFlip .28s cubic-bezier(.34,1.3,.64,1);
        }
        .tii-cd-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;font-weight:600;}
        .tii-cd-sep{font-family:'Anton',sans-serif;font-size:28px;color:var(--paper-line);align-self:flex-start;padding-top:8px;}
        .tii-cd-event{text-align:center;font-size:12px;color:#999;letter-spacing:.05em;text-transform:uppercase;padding-bottom:4px;}
        @media(max-width:640px){
          .tii-cd-card{min-width:46px;padding:5px 8px;}
          .tii-cd-num{font-size:26px;}
          .tii-countdown{gap:8px;}
        }

        @media(prefers-reduced-motion:reduce){
          *{animation-duration:.01ms !important;transition-duration:.01ms !important;}
        }
      `}</style>

      <div className="tii-body" ref={tiiRef}>
        {editMode && (
          <div className="edit-mode-indicator">
            ✏️ Editing — Click any text to edit (ESC to cancel)
          </div>
        )}

        {canEdit && (
          <button
            onClick={() => setEditMode(!editMode)}
            style={{ position:'fixed',top:'16px',right:'16px',zIndex:100,padding:'8px 14px',background:editMode ? '#DD6F51' : '#6B12BC',color:'#fff',border:'none',borderRadius:'8px',fontWeight:700,cursor:'pointer',fontSize:'13px' }}
          >
            {editMode ? '✕ Done' : '✏️ Edit'}
          </button>
        )}


        <nav className="tii-nav">
          <div className="tii-nav-links">
            {NAV_ITEMS.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={activeSection === item.id ? 'active' : ''}
                onClick={(e) => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' }); }}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="tii-nav-progress">
            <div style={{ height:'100%', width:`${scrollProgress * 100}%`, background:'linear-gradient(90deg, var(--coral), var(--purple))', transition:'width .15s linear' }} />
            <div className="tii-nav-plane" style={{ left:`${scrollProgress * 100}%` }}>✈️</div>
          </div>
        </nav>

        {/* Mobile bottom bar */}
        <div className="tii-mobile-bar" onClick={() => setMobileMenuOpen(true)}>
          <span className="tii-mobile-bar-label">
            {NAV_ITEMS.find(n => n.id === activeSection)?.label || 'This Is It 2026'}
          </span>
          <button className="tii-mobile-bar-btn" aria-label="Open section menu">
            Sections <span style={{ fontSize:11, marginLeft:2 }}>▲</span>
          </button>
        </div>

        {/* Mobile bottom sheet */}
        {mobileMenuOpen && (
          <>
            <div className="tii-sheet-bg" onClick={() => setMobileMenuOpen(false)} />
            <div className="tii-sheet" role="dialog" aria-modal="true" aria-label="Page sections">
              <div className="tii-sheet-handle" />
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  className={`tii-sheet-link${activeSection === item.id ? ' active' : ''}`}
                  onClick={() => {
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                    setMobileMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Hero */}
        <div style={{ padding:'28px 16px 6px', animation:'slideUp .6s ease' }}>
          <p className="tii-eyebrow">BLW Canada Sub-Region · This Is It 2026</p>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:'16px' }}>
            <img src="/this-is-it-logo.png" alt="This Is It 2.0" style={{ width:'200px', maxWidth:'70%', height:'auto', animation:'logoIn .5s ease .1s both' }} />
          </div>
          <div className="tii-ticket">
            <div className="tii-ticket-top">
              <div className="tii-tk-row">
                <div>
                  <div className="tii-tk-city">YYZ</div>
                  <div className="tii-tk-sub">Your City</div>
                </div>
                <div className="tii-tk-arrow">→</div>
                <div>
                  <div className="tii-tk-city">{editMode ? <EditableText value={c.airport_code} onSave={(v) => handleSaveField('airport_code', v)} /> : c.airport_code}</div>
                  <div className="tii-tk-sub">Winnipeg, MB</div>
                </div>
              </div>
              <div className="tii-tk-fields">
                <div className="tii-tk-field">
                  <label>Date</label>
                  <div className="val">{editMode ? <EditableText value={c.event_dates} onSave={(v) => handleSaveField('event_dates', v)} /> : c.event_dates}</div>
                </div>
                <div className="tii-tk-field">
                  <label>Venue</label>
                  <div className="val">{editMode ? <EditableText value={c.hotel_name} onSave={(v) => handleSaveField('hotel_name', v)} /> : c.hotel_name}</div>
                </div>
                <div className="tii-tk-field">
                  <label>Opens</label>
                  <div className="val">Fri {editMode ? <EditableText value={c.friday_opening_time} onSave={(v) => handleSaveField('friday_opening_time', v)} /> : c.friday_opening_time}</div>
                </div>
                <div className="tii-tk-field">
                  <label>Checkout</label>
                  <div className="val">{editMode ? <EditableText value={c.monday_checkout_time} onSave={(v) => handleSaveField('monday_checkout_time', v)} /> : c.monday_checkout_time}</div>
                </div>
              </div>
            </div>
            <div className="tii-stub">
              <span className="tii-stub-code">TII · 2026 · BLW CAN</span>
              <span className="tii-stub-badge">Bigger · Bolder · Best for God</span>
            </div>
          </div>
          <p style={{ textAlign:'center', maxWidth:'520px', margin:'18px auto 0', fontSize:'14px', color:'#666', lineHeight:1.6 }}>
            Everything you need to know before you fly. This page will keep updating as details are confirmed — check back before you travel.
          </p>
        </div>

        {/* Countdown */}
        {countdown.days >= 0 && (
          <div>
            <div className="tii-cd-event">Aug 28 · This Is It 2026</div>
            <div className="tii-countdown">
              <FlipDigit value={countdown.days}  label="Days"    />
              <span className="tii-cd-sep">:</span>
              <FlipDigit value={countdown.hours} label="Hours"   />
              <span className="tii-cd-sep">:</span>
              <FlipDigit value={countdown.mins}  label="Minutes" />
              <span className="tii-cd-sep">:</span>
              <FlipDigit value={countdown.secs}  label="Seconds" />
            </div>
          </div>
        )}

        {/* What to Expect */}
        <section className="tii-section" id="expect" style={{ marginTop:'40px' }}>
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">✨</div>
            <div>
              <span style={{ display:'block', fontSize:'10px', letterSpacing:'.08em', textTransform:'uppercase', color:'#999', fontWeight:600, marginBottom:'2px' }}>Prepare Your Heart</span>
              <h2>Don't Forget to Set Your Expectations</h2>
            </div>
          </div>
          <div className="tii-card card">
            <h3>🎯 What to Expect</h3>
            <p>
              {editMode
                ? <EditableText value={c.expect_p1 || "This Is It isn't just another program. It's tailored for you, and it requires something from you: expectation."} onSave={(v) => handleSaveField('expect_p1', v)} multiline />
                : (c.expect_p1 || "This Is It isn't just another program. It's tailored for you, and it requires something from you: expectation.")
              }
            </p>
            <p>
              {editMode
                ? <EditableText value={c.expect_p2 || 'Scripture tells us, "The earnest expectation of the righteous shall not be cut short." You must come with distinct expectations. What specific changes do you want to see? In your walk with him? In the work?'} onSave={(v) => handleSaveField('expect_p2', v)} multiline />
                : c.expect_p2
                  ? c.expect_p2
                  : <>Scripture tells us, <em>"The earnest expectation of the righteous shall not be cut short."</em> You must come with distinct expectations. What specific changes do you want to see? In your walk with him? In the work?</>
              }
            </p>
            <p>
              {editMode
                ? <EditableText value={c.expect_p3 || "Yes, you'll see friends from across the region. But remember: you're here to receive something — to lambano. \"One word from God can change your life forever.\" Are you ready to receive those words?"} onSave={(v) => handleSaveField('expect_p3', v)} multiline />
                : c.expect_p3
                  ? c.expect_p3
                  : <>Yes, you'll see friends from across the region. But remember: you're here to receive something — to <em>lambano</em>. <em>"One word from God can change your life forever."</em> Are you ready to receive those words?</>
              }
            </p>
            <p>
              {editMode
                ? <EditableText value={c.expect_p4 || 'Prepare your spirit. Join us in times of prayer and participate in the fast as you ready yourself. Come expectant. Come ready to testify that This Is It was the moment everything changed.'} onSave={(v) => handleSaveField('expect_p4', v)} multiline />
                : (c.expect_p4 || 'Prepare your spirit. Join us in times of prayer and participate in the fast as you ready yourself. Come expectant. Come ready to testify that This Is It was the moment everything changed.')
              }
            </p>
          </div>
        </section>

        {/* Before You Fly */}
        <section className="tii-section" id="pack" style={{ marginTop:'40px' }}>
          <div className="tii-stop-head stop-head">
            <div className="tii-dot">1</div>
            <div>
              <span style={{ display:'block', fontSize:'10px', letterSpacing:'.08em', textTransform:'uppercase', color:'#999', fontWeight:600, marginBottom:'2px' }}>Step 01</span>
              <h2>Before You Fly</h2>
            </div>
          </div>
          <div className="tii-card card tii-fee-pulse" style={{ marginBottom:'10px', background:'rgba(234,198,61,0.07)', border:'1px solid rgba(234,198,61,0.45)' }}>
            <h3>💳 Registration fee</h3>
            <p>
              {editMode
                ? <EditableText value={c.registration_fee_text || "Don't forget to send your registration fee of $350 to partnership@lwcanada.org."} onSave={(v) => handleSaveField('registration_fee_text', v)} multiline />
                : c.registration_fee_text
                  ? c.registration_fee_text
                  : <>Don't forget to send your registration fee of <strong>$350</strong> to <a href="mailto:partnership@lwcanada.org" style={{ color:'var(--purple)', fontWeight:600 }}>partnership@lwcanada.org</a>.</>
              }
            </p>
          </div>
          <div className="tii-card card">
            <h3>📝 Flight form</h3>
            <p>{editMode ? <EditableText value={c.flight_form_text || 'Fill this out so the team knows your travel details and can arrange transfers.'} onSave={(v) => handleSaveField('flight_form_text', v)} multiline /> : (c.flight_form_text || 'Fill this out so the team knows your travel details and can arrange transfers.')}</p>
            <a className="tii-btn" href={c.flight_form_url} target="_blank" rel="noopener noreferrer">Fill out the flight form</a>
          </div>
          <div className="tii-card card" style={{ marginTop:'10px' }}>
            <h3>🧳 What to pack</h3>
            <p>{editMode ? <EditableText value={c.packing_text || 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.'} onSave={(v) => handleSaveField('packing_text', v)} multiline /> : (c.packing_text || 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.')}</p>
            <ul className="tii-checklist" id="packlist">
              {checklistItems.map((item) => (
                editMode ? (
                  <li key={item.id} style={{ position: 'relative', listStyle: 'none' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <EditableText
                        value={item.item}
                        onSave={(v) => handleUpdateChecklistItem(item.id, v)}
                        multiline={false}
                      />
                      <button
                        onClick={() => handleDeleteChecklistItem(item.id)}
                        onBlur={() => { if (pendingDeleteId === item.id) setPendingDeleteId(null); }}
                        style={{ padding: '4px 8px', background: pendingDeleteId === item.id ? '#b93e26' : '#dd6f51', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: pendingDeleteId === item.id ? 700 : 400 }}
                      >
                        {pendingDeleteId === item.id ? 'Confirm?' : 'Delete'}
                      </button>
                    </div>
                  </li>
                ) : (
                  <CheckItem key={item.id}>{item.item}</CheckItem>
                )
              ))}
            </ul>
            {editMode && (
              <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(107, 18, 188, 0.05)', borderRadius: '6px', border: '1px dashed var(--purple)' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="New checklist item"
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: '13px', border: '1px solid var(--paper-line)', borderRadius: '4px' }}
                  />
                  <button
                    onClick={handleAddChecklistItem}
                    disabled={isSaving}
                    style={{ padding: '6px 12px', background: 'var(--teal)', color: '#161717', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                  >
                    {isSaving ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            )}
            <p style={{ fontSize:'13px', color:'#666', marginTop:'10px', paddingTop:'10px', borderTop:'1px solid var(--paper-line)' }}>
              <strong>This Is It shirt:</strong> Will be provided at check-in or after the Friday opening session — no need to pack it.
            </p>
          </div>
          <div className="tii-card card" style={{ marginTop:'10px' }}>
            <h3>✨ Dress code</h3>
            <p>{editMode ? <EditableText value={c.dress_code} onSave={(v) => handleSaveField('dress_code', v)} multiline /> : c.dress_code}</p>
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
            <h3>✈️ Airport</h3>
            <p><b>{editMode ? <EditableText value={c.airport_name} onSave={(v) => handleSaveField('airport_name', v)} /> : c.airport_name} ({editMode ? <EditableText value={c.airport_code} onSave={(v) => handleSaveField('airport_code', v)} /> : c.airport_code})</b>. This is the airport to fly into — it's only about {editMode ? <EditableText value={c.airport_distance_km?.toString()} onSave={(v) => handleSaveField('airport_distance_km', parseInt(v))} /> : c.airport_distance_km} minutes from the hotel.</p>
          </div>
          <div className="tii-card card">
            <h3>🚌 Hotel shuttle</h3>
            <span className="tii-tag ready">Included</span>
            <p>{editMode ? <EditableText value={c.shuttle_text || 'A driver from the hotel shuttle will come get you at arrivals. They\'ll already have your name on their pickup list — nothing to book or call ahead. Just head to arrivals and look for the Sandman shuttle.'} onSave={(v) => handleSaveField('shuttle_text', v)} multiline /> : (c.shuttle_text || 'A driver from the hotel shuttle will come get you at arrivals. They\'ll already have your name on their pickup list — nothing to book or call ahead. Just head to arrivals and look for the Sandman shuttle.')}</p>
          </div>
          <div className="tii-card card">
            <h3>⏰ When to arrive</h3>
            <p>{editMode ? <EditableText value={c.arrival_text || 'Your arrival time depends on your department. Check with your department lead. If you haven\'t heard otherwise, aim to arrive by 4:30 PM so you\'re settled before the opening session.'} onSave={(v) => handleSaveField('arrival_text', v)} multiline /> : (c.arrival_text || 'Your arrival time depends on your department. Check with your department lead. If you haven\'t heard otherwise, aim to arrive by 4:30 PM so you\'re settled before the opening session.')}</p>
            <div className="tii-dept-arrival">
              <b style={{ fontSize:'13px' }}>Arrival time by department</b>
              <ul>
                <li>{editMode ? <EditableText value={c.dept_arrival_note} onSave={(v) => handleSaveField('dept_arrival_note', v)} /> : c.dept_arrival_note}</li>
                <li>Default: arrive by <b>{editMode ? <EditableText value={c.dept_arrival_default} onSave={(v) => handleSaveField('dept_arrival_default', v)} /> : c.dept_arrival_default}</b></li>
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
            <h3>🛏️ {editMode ? <EditableText value={c.hotel_name} onSave={(v) => handleSaveField('hotel_name', v)} /> : c.hotel_name}</h3>
            <p style={{ margin:'0 0 6px' }}>{editMode ? <EditableText value={c.hotel_address} onSave={(v) => handleSaveField('hotel_address', v)} multiline /> : c.hotel_address}</p>
            <p style={{ margin:'0 0 10px', fontSize:'13px', color:'#666' }}>Tel: {editMode ? <EditableText value={c.hotel_phone} onSave={(v) => handleSaveField('hotel_phone', v)} /> : c.hotel_phone}</p>
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
            <h3>🎯 Check-in process</h3>
            <p>{editMode ? <EditableText value={c.checkin_text || 'When you arrive, look for the check-in stand or table in the lobby. Your room is covered — no card required. The team at the stand will get you sorted and send you to your room.'} onSave={(v) => handleSaveField('checkin_text', v)} multiline /> : (c.checkin_text || 'When you arrive, look for the check-in stand or table in the lobby. Your room is covered — no card required. The team at the stand will get you sorted and send you to your room.')}</p>
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
            <h3>🎤 Conference Room, {c.hotel_name}</h3>
            <p>{editMode ? <EditableText value={c.venue_text || 'Good news: the retreat venue is the hotel itself. All sessions run out of the conference room at the Sandman — once you\'re checked in, you\'re already there.'} onSave={(v) => handleSaveField('venue_text', v)} multiline /> : (c.venue_text || 'Good news: the retreat venue is the hotel itself. All sessions run out of the conference room at the Sandman — once you\'re checked in, you\'re already there.')}</p>
          </div>
          <div className="tii-card card">
            <div className="tii-grid2">
              <div className="tii-mini">
                <div className="lbl">Wi-Fi</div>
                <div className="big">{editMode ? <EditableText value={c.wifi_text} onSave={(v) => handleSaveField('wifi_text', v)} /> : c.wifi_text}</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Sessions</div>
                <div className="big">{editMode ? <EditableText value={c.sessions_text} onSave={(v) => handleSaveField('sessions_text', v)} /> : c.sessions_text}</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Meals</div>
                <div className="big">{editMode ? <EditableText value={c.meals_text} onSave={(v) => handleSaveField('meals_text', v)} /> : c.meals_text}</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Checkout</div>
                <div className="big">{editMode ? <EditableText value={c.monday_checkout_time} onSave={(v) => handleSaveField('monday_checkout_time', v)} /> : c.monday_checkout_time}</div>
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
            <p>{editMode ? <EditableText value={c.schedule_text || 'The schedule is filling in below. Check back as details confirm.'} onSave={(v) => handleSaveField('schedule_text', v)} multiline /> : (c.schedule_text || 'The schedule is filling in below. Check back as details confirm.')}</p>
            <div className="tii-daytabs">
              {DAYS.map(d => (
                <button
                  key={d.key}
                  className={`tii-daytab${activeDay === d.key ? ' active' : ''}`}
                  onClick={() => setActiveDay(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {dayItems.length === 0 ? (
              <div className="tii-sched-empty">
                <span style={{ fontSize:'24px', display:'block', marginBottom:'8px' }}>📋</span>
                Schedule for this day hasn't been posted yet. Check back soon.
              </div>
            ) : (
              dayItems.map((item, i) => (
                <div key={item.id} className="tii-sched-row" style={{ position: 'relative' }}>
                  <div className="tii-sched-time">
                    {editMode ? (
                      <EditableText
                        value={item.time}
                        onSave={(v) => handleUpdateScheduleItem(item.id, 'time', v)}
                      />
                    ) : (
                      item.time
                    )}
                  </div>
                  <div className="tii-sched-what">
                    <b>
                      {editMode ? (
                        <EditableText
                          value={item.title}
                          onSave={(v) => handleUpdateScheduleItem(item.id, 'title', v)}
                        />
                      ) : (
                        item.title
                      )}
                    </b>
                    {item.description && (
                      <p>
                        {editMode ? (
                          <EditableText
                            value={item.description}
                            onSave={(v) => handleUpdateScheduleItem(item.id, 'description', v)}
                            multiline
                          />
                        ) : (
                          item.description
                        )}
                      </p>
                    )}
                  </div>
                  {editMode && (
                    <button
                      onClick={() => handleDeleteScheduleItem(item.id)}
                      onBlur={() => { if (pendingDeleteId === item.id) setPendingDeleteId(null); }}
                      style={{ position: 'absolute', top: '0', right: '0', padding: '4px 8px', background: pendingDeleteId === item.id ? '#b93e26' : '#dd6f51', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: pendingDeleteId === item.id ? 700 : 400 }}
                    >
                      {pendingDeleteId === item.id ? 'Confirm?' : 'Delete'}
                    </button>
                  )}
                </div>
              ))
            )}
            {editMode && (
              <div style={{ marginTop:'20px', padding:'15px', background:'rgba(107, 18, 188, 0.05)', borderRadius:'8px', border:'1px dashed var(--purple)' }}>
                <h4 style={{ margin:'0 0 12px', fontSize:'14px' }}>➕ Add Schedule Item</h4>
                <div style={{ marginBottom:'10px' }}>
                  <label style={{ fontSize:'12px', fontWeight:600 }}>Day:</label>
                  <select value={newItem.day} onChange={(e) => setNewItem({ ...newItem, day: e.target.value })} style={{ width:'100%', padding:'8px', marginTop:'4px' }}>
                    <option value="fri">Friday</option>
                    <option value="sat">Saturday</option>
                    <option value="sun">Sunday</option>
                    <option value="mon">Monday</option>
                  </select>
                </div>
                <div style={{ marginBottom:'10px' }}>
                  <label style={{ fontSize:'12px', fontWeight:600 }}>Time:</label>
                  <input type="text" placeholder="e.g., 6:00 PM" value={newItem.time} onChange={(e) => setNewItem({ ...newItem, time: e.target.value })} style={{ width:'100%', padding:'8px', marginTop:'4px' }} />
                </div>
                <div style={{ marginBottom:'10px' }}>
                  <label style={{ fontSize:'12px', fontWeight:600 }}>Title:</label>
                  <input type="text" placeholder="e.g., Opening session" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} style={{ width:'100%', padding:'8px', marginTop:'4px' }} />
                </div>
                <div style={{ marginBottom:'10px' }}>
                  <label style={{ fontSize:'12px', fontWeight:600 }}>Description:</label>
                  <textarea placeholder="e.g., Details to come" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} style={{ width:'100%', padding:'8px', marginTop:'4px', minHeight:'50px' }} />
                </div>
                <button onClick={handleAddScheduleItem} disabled={isSaving} style={{ padding:'8px 14px', background:'var(--purple)', color:'#fff', border:'none', borderRadius:'6px', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
                  {isSaving ? 'Adding...' : 'Add Item'}
                </button>
              </div>
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
            <h3>🚗 Transport contact</h3>
            <p>For transport needs — shuttle timing, arrival delays, or airport pickup questions:</p>
            <div className="tii-help-grid">
              <div className="tii-mini">
                <div className="lbl">Name</div>
                <div className="big">{editMode ? <EditableText value={c.transport_contact_name} onSave={(v) => handleSaveField('transport_contact_name', v)} /> : c.transport_contact_name}</div>
              </div>
              <div className="tii-mini">
                <div className="lbl">Phone / WhatsApp</div>
                <div className="big"><a href={`tel:${c.transport_contact_phone}`} style={{ color:'var(--purple)' }}>{editMode ? <EditableText value={c.transport_contact_phone} onSave={(v) => handleSaveField('transport_contact_phone', v)} /> : c.transport_contact_phone}</a></div>
              </div>
              {c.transport_contact_chat && (
                <div className="tii-mini">
                  <div className="lbl">Chat</div>
                  <div className="big">{editMode ? <EditableText value={c.transport_contact_chat} onSave={(v) => handleSaveField('transport_contact_chat', v)} /> : c.transport_contact_chat}</div>
                </div>
              )}
            </div>
          </div>
          <div className="tii-card card">
            <h3>Questions?</h3>
            <p>For any other questions about the retreat:</p>
            <div style={{ marginTop:'10px' }}>
              <a href="mailto:info@lwcanada.org" style={{ color:'var(--purple)', fontWeight:600 }}>info@lwcanada.org</a>
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

/* ── Countdown flip digit ──────────────────────────────────────────── */
function FlipDigit({ value, label }) {
  const str = String(value).padStart(2, '0');
  return (
    <div className="tii-cd-unit">
      <div className="tii-cd-card">
        <span key={str} className="tii-cd-num">{str}</span>
      </div>
      <div className="tii-cd-label">{label}</div>
    </div>
  );
}

const CONFETTI_DOTS = [
  { tx: '0px',   ty: '-22px', c: '#EAC63D' },
  { tx: '15px',  ty: '-16px', c: '#DD6F51' },
  { tx: '22px',  ty: '0px',   c: '#7EDAC3' },
  { tx: '15px',  ty: '16px',  c: '#6B12BC' },
  { tx: '0px',   ty: '22px',  c: '#EAC63D' },
  { tx: '-15px', ty: '16px',  c: '#DD6F51' },
  { tx: '-22px', ty: '0px',   c: '#7EDAC3' },
  { tx: '-15px', ty: '-16px', c: '#6B12BC' },
];

function CheckConfetti() {
  return (
    <>
      {CONFETTI_DOTS.map((d, i) => (
        <span
          key={i}
          className="tii-confetti-dot"
          style={{ '--tx': d.tx, '--ty': d.ty, background: d.c, animationDelay: `${i * 22}ms` }}
        />
      ))}
    </>
  );
}

function CheckItem({ children }) {
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState(false);

  function toggle() {
    if (!done) {
      setBurst(true);
      setTimeout(() => setBurst(false), 650);
    }
    setDone(d => !d);
  }

  return (
    <li className={done ? 'done' : ''} onClick={toggle}>
      <span className="tii-box">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 12l5 5L20 6" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <span className="tii-txt">{children}</span>
      {burst && <CheckConfetti />}
    </li>
  );
}
