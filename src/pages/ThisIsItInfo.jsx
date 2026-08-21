import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

function useOptionalProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user) {
          setLoading(false);
          return;
        }
        const { data: u } = await supabase
          .from('users')
          .select('id,role')
          .eq('id', data.user.id)
          .single();
        setProfile(u);
      } catch (err) {
        console.error('Profile fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  return { profile, loading };
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

function EditableText({ value, onSave, multiline = false, className = '' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tmpValue, setTmpValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (tmpValue !== value) {
      await onSave(tmpValue);
    }
    setIsEditing(false);
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
      <div style={{ display: 'inline-block', position: 'relative' }}>
        {multiline ? (
          <textarea
            ref={inputRef}
            value={tmpValue}
            onChange={(e) => setTmpValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            style={{ width: '100%', padding: '8px', minHeight: '60px', fontFamily: 'inherit', fontSize: 'inherit', border: '2px solid var(--purple)' }}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={tmpValue}
            onChange={(e) => setTmpValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            style={{ padding: '4px 8px', fontFamily: 'inherit', fontSize: 'inherit', border: '2px solid var(--purple)' }}
          />
        )}
      </div>
    );
  }

  return <span className={className} onClick={() => setIsEditing(true)} style={{ cursor: 'pointer', position: 'relative' }}>
    {value}
  </span>;
}

export default function ThisIsItInfo() {
  const { profile, loading: profileLoading } = useOptionalProfile();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState('fri');
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    console.log('ThisIsItInfo - Profile:', profile, 'CanEdit:', profile && (profile.role === 'super_admin' || profile.role === 'regional_secretary'));
  }, [profile]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [newItem, setNewItem] = useState({ day: 'fri', time: '', title: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const canEdit = profile && (profile.role === 'super_admin' || profile.role === 'regional_secretary');

  const { data: content, isLoading } = useQuery({
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

  const { data: checklistItems = [] } = useQuery({
    queryKey: ['this_is_it_checklist_items', content?.id],
    queryFn: async () => {
      if (!content?.id) return [];
      const { data } = await supabase
        .from('this_is_it_checklist_items').select('*')
        .eq('event_content_id', content.id)
        .eq('section', 'packing')
        .order('order_num');
      return data || [];
    },
    enabled: !!content?.id
  });

  const [newChecklistItem, setNewChecklistItem] = useState('');

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
    return () => obs.disconnect();
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
    console.log('Saving field:', field, 'value:', value, 'contentId:', content.id);
    try {
      const { data, error } = await supabase
        .from('this_is_it_event_content')
        .update({ [field]: value })
        .eq('id', content.id)
        .select();
      console.log('Save response:', { data, error });
      if (error) {
        console.error('Save error:', error);
        alert('Error saving: ' + error.message);
        return;
      }
      if (!data || data.length === 0) {
        alert('No rows updated - you may not have permission to edit.');
        return;
      }
      console.log('Field saved successfully');
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_event_content'] });
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
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_schedule_items'] });
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
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_checklist_items'] });
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
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_checklist_items'] });
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
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_checklist_items'] });
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
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_schedule_items'] });
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
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_schedule_items'] });
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
        .tii-ticket{max-width:var(--max);margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(22,23,23,.08);border:1px solid var(--paper-line);animation:ticketIn .6s ease .15s both;transition:box-shadow .25s,transform .25s;}
        .tii-ticket:hover{box-shadow:0 8px 24px rgba(22,23,23,.12);transform:translateY(-2px);}
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
        .tii-section{max-width:var(--max);margin:40px auto 0;padding:0 18px;scroll-margin-top:60px;}
        .tii-stop-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;opacity:0;transform:translateY(16px);transition:opacity .5s,transform .5s;}
        .tii-stop-head.in{opacity:1;transform:translateY(0);}
        .tii-dot{flex:none;width:32px;height:32px;border-radius:50%;background:var(--yellow);color:var(--ink);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:1px solid var(--paper-line);animation:pulse 3s ease-in-out infinite;}
        .tii-stop-head h2{font-family:'Anton',sans-serif;font-weight:400;font-size:clamp(20px,5vw,28px);letter-spacing:.01em;margin:0;}
        .tii-card{background:#fff;border:1px solid var(--paper-line);border-radius:10px;padding:18px;box-shadow:0 2px 8px rgba(22,23,23,.06);opacity:0;transform:translateY(16px);transition:transform .4s,box-shadow .3s,opacity .4s;}
        .tii-card.in{opacity:1;transform:translateY(0);}
        .tii-card.in:hover{transform:translateY(-3px);box-shadow:0 8px 20px rgba(22,23,23,.12);}
        .tii-card + .tii-card{margin-top:10px;}
        .tii-card p{margin:0 0 10px;line-height:1.6;font-size:15px;}
        .tii-card p:last-child{margin-bottom:0;}
        .tii-card h3{font-size:15px;font-weight:700;margin:0 0 8px;display:flex;align-items:center;gap:8px;}
        .tii-tag{display:inline-block;font-size:10px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;padding:4px 9px;border-radius:5px;border:1px solid;margin-bottom:10px;}
        .tii-tag.ready{background:rgba(126,218,195,.1);color:#3aa895;}
        .tii-checklist{list-style:none;margin:0;padding:0;}
        .tii-checklist li{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--paper-line);font-size:14px;cursor:pointer;user-select:none;transition:padding-left .15s,background .2s,transform .2s;}
        .tii-checklist li:hover{padding-left:4px;background:rgba(126,218,195,.05);border-radius:4px;transform:translateX(2px);}
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
        @media(max-width:640px){.tii-section{padding:0 14px;}.tii-card h3{font-size:14px;}.tii-card p{font-size:14px;}}
        .tii-dept-arrival{background:#f9f7f2;border:1px solid var(--paper-line);border-radius:8px;padding:14px;margin-top:12px;}
        .tii-dept-arrival ul{margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.7;}
        .edit-mode-indicator{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:var(--purple);color:#fff;padding:8px 16px;border-radius:8px;font-weight:600;z-index:99;font-size:13px;}
      `}</style>

      <div className="tii-body">
        {/* Progress airplane */}
        <div style={{ position:'fixed', top:'70px', left:0, right:0, height:'3px', background:'rgba(22,23,23,.08)', zIndex:49 }}>
          <div style={{ height:'100%', width:`${scrollProgress * 100}%`, background:'linear-gradient(90deg, var(--coral), var(--purple))', transition:'width .1s linear' }} />
          <div style={{ position:'absolute', top:'-12px', left:`${scrollProgress * 100}%`, transform:'translateX(-50%)', fontSize:'20px', transition:'left .1s linear', userSelect:'none' }}>✈️</div>
        </div>

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
          <a href="#pack" onClick={(e) => { e.preventDefault(); document.getElementById('pack')?.scrollIntoView({ behavior: 'smooth' }); }}>Before You Fly</a>
          <a href="#getting-there" onClick={(e) => { e.preventDefault(); document.getElementById('getting-there')?.scrollIntoView({ behavior: 'smooth' }); }}>Getting There</a>
          <a href="#checkin" onClick={(e) => { e.preventDefault(); document.getElementById('checkin')?.scrollIntoView({ behavior: 'smooth' }); }}>Check-In</a>
          <a href="#venue" onClick={(e) => { e.preventDefault(); document.getElementById('venue')?.scrollIntoView({ behavior: 'smooth' }); }}>Venue</a>
          <a href="#schedule" onClick={(e) => { e.preventDefault(); document.getElementById('schedule')?.scrollIntoView({ behavior: 'smooth' }); }}>Schedule</a>
          <a href="#help" onClick={(e) => { e.preventDefault(); document.getElementById('help')?.scrollIntoView({ behavior: 'smooth' }); }}>Need Help</a>
        </nav>

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
                  <div className="val">28–31 Aug 2026</div>
                </div>
                <div className="tii-tk-field">
                  <label>Venue</label>
                  <div className="val">Sandman Hotel &amp; Suites</div>
                </div>
                <div className="tii-tk-field">
                  <label>Opens</label>
                  <div className="val">Fri {editMode ? <EditableText value={c.friday_opening_time} onSave={(v) => handleSaveField('friday_opening_time', v)} /> : c.friday_opening_time}</div>
                </div>
                <div className="tii-tk-field">
                  <label>Checkout</label>
                  <div className="val">Mon Morning</div>
                </div>
              </div>
            </div>
            <div className="tii-stub">
              <span className="tii-stub-code">TII · 2026 · BLW CAN</span>
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
            <h3>📝 Flight form</h3>
            <p>{editMode ? <EditableText value={c.flight_form_text || 'Fill this out so the team knows your travel details and can arrange transfers.'} onSave={(v) => handleSaveField('flight_form_text', v)} multiline /> : (c.flight_form_text || 'Fill this out so the team knows your travel details and can arrange transfers.')}</p>
            <a className="tii-btn" href={c.flight_form_url} target="_blank" rel="noopener noreferrer">Fill out the flight form</a>
          </div>
          <div className="tii-card card" style={{ marginTop:'10px' }}>
            <h3>🧳 What to pack</h3>
            <p>{editMode ? <EditableText value={c.packing_text || 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.'} onSave={(v) => handleSaveField('packing_text', v)} multiline /> : (c.packing_text || 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.')}</p>
            <ul className="tii-checklist" id="packlist">
              {checklistItems.map((item) => (
                <li key={item.id} style={{ position: 'relative' }}>
                  {editMode ? (
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
                  ) : (
                    <CheckItem>{item.item}</CheckItem>
                  )}
                </li>
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
            <p>The schedule is filling in below. Check back as details confirm.</p>
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
