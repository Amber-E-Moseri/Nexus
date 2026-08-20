import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function ThisIsItInfo() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Fetch event content
  const { data: content, isLoading } = useQuery({
    queryKey: ['this_is_it_event_content', 2026],
    queryFn: async () => {
      const { data } = await supabase
        .from('this_is_it_event_content')
        .select('*')
        .eq('event_year', 2026)
        .single();
      return data;
    }
  });

  // Fetch schedule items
  const { data: scheduleItems = [] } = useQuery({
    queryKey: ['this_is_it_schedule_items', content?.id],
    queryFn: async () => {
      if (!content?.id) return [];
      const { data } = await supabase
        .from('this_is_it_schedule_items')
        .select('*')
        .eq('event_content_id', content.id)
        .order('day')
        .order('order_num');
      return data || [];
    },
    enabled: !!content?.id
  });

  // Check if user can edit (super admin or programs team member)
  const canEdit = profile?.role === 'super_admin' ||
    (profile && ['chinelo', 'ella', 'dorcas'].includes(profile.id));

  useEffect(() => {
    document.title = 'This Is It 2.0 - Prep Guide';
  }, []);

  if (isLoading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  const scheduleByDay = scheduleItems.reduce((acc, item) => {
    if (!acc[item.day]) acc[item.day] = [];
    acc[item.day].push(item);
    return acc;
  }, {});

  return (
    <div style={{ background: '#FBF7EE', color: '#161717', fontFamily: 'Inter, sans-serif', minHeight: '100vh', margin: 0, padding: 0 }}>
      {canEdit && (
        <button
          onClick={() => navigate('/thisisitinfo-admin')}
          style={{
            position: 'fixed',
            top: '70px',
            right: '20px',
            zIndex: 51,
            padding: '10px 16px',
            background: '#6B12BC',
            color: '#fff',
            border: '2px solid #161717',
            borderRadius: '8px',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          ✏️ Edit
        </button>
      )}

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(251,247,238,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(22,23,23,0.08)', padding: '10px 14px', overflowX: 'auto' }}>
        <a href="#pack" style={{ marginRight: '6px' }}>Before You Fly</a>
        <a href="#getting-there" style={{ marginRight: '6px' }}>Getting There</a>
        <a href="#checkin" style={{ marginRight: '6px' }}>Check-In</a>
        <a href="#venue" style={{ marginRight: '6px' }}>Venue</a>
        <a href="#schedule" style={{ marginRight: '6px' }}>Schedule</a>
        <a href="#help">Need Help</a>
      </nav>

      <div style={{ maxWidth: '760px', margin: '52px auto 0', padding: '0 18px' }} id="schedule">
        <h2>Schedule</h2>
        <p>The first session kicks off Friday at {content?.friday_opening_time}. More details coming soon.</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {['fri', 'sat', 'sun', 'mon'].map(day => (
            <div key={day} style={{ padding: '8px 14px', border: '2px solid #161717', borderRadius: '999px', background: '#fff', fontSize: '12px', fontWeight: '700' }}>
              {getDayLabel(day)} {scheduleByDay[day]?.length === 0 && '(Not updated)'}
            </div>
          ))}
        </div>

        {['fri', 'sat', 'sun', 'mon'].map(day => (
          <div key={day} style={{ marginTop: '20px' }}>
            <h3>{getDayLabel(day)}</h3>
            {scheduleByDay[day]?.length > 0 ? (
              scheduleByDay[day].map((item, idx) => (
                <div key={idx} style={{ padding: '10px 0', borderBottom: '1px dashed #E7DFCB' }}>
                  <strong style={{ color: '#4B0F87' }}>{item.time}</strong> - {item.title}
                  {item.description && <div>{item.description}</div>}
                </div>
              ))
            ) : (
              <p style={{ color: '#999' }}>Schedule not updated yet</p>
            )}
          </div>
        ))}
      </div>

      <footer style={{ maxWidth: '760px', margin: '56px auto 0', padding: '0 18px', textAlign: 'center' }}>
        <p style={{ fontSize: '11.5px', color: 'rgba(22,23,23,0.5)', lineHeight: '1.7' }}>
          <b>This Is It · Bigger, Bolder, Best for God</b><br/>
          Winnipeg, Manitoba · 28–30 August 2026<br/>
          This page will keep getting updated as more details are confirmed.
        </p>
      </footer>
    </div>
  );
}

function getDayLabel(day) {
  const labels = { fri: 'Fri, Aug 28', sat: 'Sat, Aug 29', sun: 'Sun, Aug 30', mon: 'Mon, Aug 31' };
  return labels[day];
}
