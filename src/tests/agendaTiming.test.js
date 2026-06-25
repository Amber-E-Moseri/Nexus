import { describe, it, expect } from 'vitest';
import { calculateTimings } from '../hooks/useAgendaWizard';

describe('calculateTimings', () => {
  it('excludes intro music from timing chain', () => {
    const items = [
      { id: '1', segment: 'Intro Music', duration: 0, isPinned: true },
      { id: '2', segment: 'Prayer', duration: 5, isPinned: false },
      { id: '3', segment: 'Teaching', duration: 30, isPinned: false },
    ];

    const result = calculateTimings('10:00', items);

    expect(result[0].timing).toBe('Pre-start');
    expect(result[1].timing).toBe('10:00 AM - 10:05 AM');
    expect(result[2].timing).toBe('10:05 AM - 10:35 AM');
  });

  it('chains timing correctly for multiple non-pinned items', () => {
    const items = [
      { id: '1', segment: 'Prayer', duration: 5, isPinned: false },
      { id: '2', segment: 'Teaching', duration: 30, isPinned: false },
      { id: '3', segment: 'Prayer', duration: 5, isPinned: false },
    ];

    const result = calculateTimings('10:00', items);

    expect(result[0].timing).toBe('10:00 AM - 10:05 AM');
    expect(result[1].timing).toBe('10:05 AM - 10:35 AM');
    expect(result[2].timing).toBe('10:35 AM - 10:40 AM');
  });

  it('handles missing duration as 0', () => {
    const items = [
      { id: '1', segment: 'Prayer', duration: undefined, isPinned: false },
    ];

    const result = calculateTimings('10:00', items);

    expect(result[0].timing).toBe('10:00 AM - 10:00 AM');
  });

  it('handles empty array', () => {
    const result = calculateTimings('10:00', []);
    expect(result).toEqual([]);
  });

  it('multiple intro music items all show Pre-start', () => {
    const items = [
      { id: '1', segment: 'Intro Music', duration: 15, isPinned: true },
      { id: '2', segment: 'Welcome Music', duration: 10, isPinned: true },
      { id: '3', segment: 'Prayer', duration: 5, isPinned: false },
    ];

    const result = calculateTimings('10:00', items);

    expect(result[0].timing).toBe('Pre-start');
    expect(result[1].timing).toBe('Pre-start');
    expect(result[2].timing).toBe('10:00 AM - 10:05 AM');
  });

  it('handles afternoon times correctly', () => {
    const items = [
      { id: '1', segment: 'Prayer', duration: 5, isPinned: false },
      { id: '2', segment: 'Teaching', duration: 30, isPinned: false },
    ];

    const result = calculateTimings('14:30', items);

    expect(result[0].timing).toBe('2:30 PM - 2:35 PM');
    expect(result[1].timing).toBe('2:35 PM - 3:05 PM');
  });

  it('handles long meetings crossing hour boundaries', () => {
    const items = [
      { id: '1', segment: 'Prayer', duration: 30, isPinned: false },
      { id: '2', segment: 'Teaching', duration: 45, isPinned: false },
    ];

    const result = calculateTimings('10:45', items);

    expect(result[0].timing).toBe('10:45 AM - 11:15 AM');
    expect(result[1].timing).toBe('11:15 AM - 12:00 PM');
  });
});
