import { useState, useMemo } from 'react';
import { useCalendarEvents } from '../../../hooks/useCalendarEvents.js';
import { getStatusColor, getPriorityColor } from '../../../lib/calendar/api.js';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';

export function CalendarGrid({ spaceId, view = 'month', onEventClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { events, loading } = useCalendarEvents({ space_id: spaceId });

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const start = startOfWeek(monthStart);
    const end = endOfWeek(monthEnd);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(event => {
      const date = format(new Date(event.start_date), 'yyyy-MM-dd');
      if (!map[date]) map[date] = [];
      map[date].push(event);
    });
    return map;
  }, [events]);

  if (loading) return <div className="text-center py-8">Loading calendar...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{format(currentDate, 'MMMM yyyy')}</h2>
        <div className="flex gap-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md text-sm">← Previous</button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 bg-blue-200 hover:bg-blue-300 rounded-md text-sm">Today</button>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md text-sm">Next →</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center font-semibold text-gray-700 py-2">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 bg-gray-100 p-2 rounded-lg">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateStr] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());
          return (
            <div key={dateStr} className={`p-2 min-h-32 rounded border-2 ${isToday ? 'border-blue-500 bg-blue-50' : isCurrentMonth ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
              <div className={`text-sm font-semibold mb-1 ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>{format(day, 'd')}</div>
              <div className="space-y-0.5 overflow-auto max-h-20">
                {dayEvents.slice(0, 3).map(event => (
                  <div key={event.id} onClick={() => onEventClick?.(event.id)} className="p-1 bg-blue-100 border-l-4 border-blue-500 rounded cursor-pointer text-xs font-semibold truncate text-gray-900" title={event.title}>{event.title}</div>
                ))}
                {dayEvents.length > 3 && <div className="text-xs text-gray-500 px-1">+{dayEvents.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
