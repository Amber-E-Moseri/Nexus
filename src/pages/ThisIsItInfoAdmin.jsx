import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function ThisIsItInfoAdmin() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});
  const [newItem, setNewItem] = useState({ day: 'fri', time: '', title: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Check permission
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'regional_secretary';

  if (!canEdit) {
    return <div style={{ padding: '20px' }}>Access denied. Only admins can edit.</div>;
  }

  // Fetch content
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

  const handleSaveContent = async () => {
    if (!content?.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('this_is_it_event_content')
        .update(formData)
        .eq('id', content.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_event_content'] });
      alert('Saved!');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddScheduleItem = async () => {
    if (!content?.id || !newItem.title || !newItem.time) {
      alert('Fill in title and time');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('this_is_it_schedule_items')
        .insert({
          event_content_id: content.id,
          day: newItem.day,
          time: newItem.time,
          title: newItem.title,
          description: newItem.description,
          order_num: scheduleItems.filter(i => i.day === newItem.day).length + 1
        });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['this_is_it_schedule_items'] });
      setNewItem({ day: 'fri', time: '', title: '', description: '' });
      alert('Added!');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div style={{ padding: '20px' }}>Loading...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <button onClick={() => navigate('/thisisitinfo')} style={{ marginBottom: '20px' }}>← Back to Public Page</button>

      <h1>Admin: Edit This Is It 2.0</h1>

      <section style={{ marginBottom: '40px', background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
        <h2>Event Content</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>Airport Code:</label>
          <input
            type="text"
            value={formData.airport_code || content?.airport_code || ''}
            onChange={(e) => setFormData({ ...formData, airport_code: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Hotel Name:</label>
          <input
            type="text"
            value={formData.hotel_name || content?.hotel_name || ''}
            onChange={(e) => setFormData({ ...formData, hotel_name: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Transport Contact Phone:</label>
          <input
            type="text"
            value={formData.transport_contact_phone || content?.transport_contact_phone || ''}
            onChange={(e) => setFormData({ ...formData, transport_contact_phone: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Friday Opening Time:</label>
          <input
            type="text"
            value={formData.friday_opening_time || content?.friday_opening_time || ''}
            onChange={(e) => setFormData({ ...formData, friday_opening_time: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <button onClick={handleSaveContent} disabled={isSaving} style={{ padding: '10px 20px', background: '#6B12BC', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {isSaving ? 'Saving...' : 'Save Content'}
        </button>
      </section>

      <section style={{ marginBottom: '40px', background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
        <h2>Add Schedule Item</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>Day:</label>
          <select value={newItem.day} onChange={(e) => setNewItem({ ...newItem, day: e.target.value })} style={{ width: '100%', padding: '8px' }}>
            <option value="fri">Friday</option>
            <option value="sat">Saturday</option>
            <option value="sun">Sunday</option>
            <option value="mon">Monday</option>
          </select>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Time:</label>
          <input
            type="text"
            placeholder="e.g., 6:00 PM"
            value={newItem.time}
            onChange={(e) => setNewItem({ ...newItem, time: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Title:</label>
          <input
            type="text"
            placeholder="e.g., Opening session"
            value={newItem.title}
            onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Description:</label>
          <textarea
            placeholder="e.g., Details to come"
            value={newItem.description}
            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            style={{ width: '100%', padding: '8px', minHeight: '60px' }}
          />
        </div>
        <button onClick={handleAddScheduleItem} disabled={isSaving} style={{ padding: '10px 20px', background: '#7EDAC3', color: '#161717', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
          {isSaving ? 'Adding...' : 'Add Item'}
        </button>
      </section>

      <section style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
        <h2>Current Schedule</h2>
        {scheduleItems.map((item) => (
          <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #ddd' }}>
            <strong>{item.day.toUpperCase()}</strong> {item.time} - {item.title}
            {item.description && <div style={{ fontSize: '12px', color: '#666' }}>{item.description}</div>}
          </div>
        ))}
      </section>
    </div>
  );
}
