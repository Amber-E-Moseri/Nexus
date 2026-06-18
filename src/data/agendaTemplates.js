export const BUILT_IN_TEMPLATES = {
  sunday_service: {
    id: 'tpl-sunday-service',
    name: 'Sunday Service',
    description: 'Typical Sunday worship service agenda',
    meetingType: 'sunday_service',
    items: [
      { segment: 'Intro Music', notes: 'Instrumental worship', duration: 15, isPinned: true },
      { segment: 'Welcome & Prayer', notes: 'Greet attendees, opening prayer', duration: 10 },
      { segment: 'Worship', notes: 'Led worship songs', duration: 25 },
      { segment: 'Message', notes: 'Main sermon/teaching', duration: 40 },
      { segment: 'Altar Call', notes: 'Response time, prayer', duration: 10 },
      { segment: 'Closing Prayer', notes: 'Final prayer and dismissal', duration: 5 },
    ],
  },
  regional_meeting: {
    id: 'tpl-regional-meeting',
    name: 'Regional Meeting',
    description: 'Regional coordination and updates',
    meetingType: 'regional_meeting',
    items: [
      { segment: 'Welcome', notes: 'Brief welcome and agenda overview', duration: 5 },
      { segment: 'Regional Updates', notes: 'Leadership updates and announcements', duration: 20 },
      { segment: 'Key Topics', notes: 'Discussion of regional priorities', duration: 30 },
      { segment: 'Q&A', notes: 'Questions from attendees', duration: 15 },
      { segment: 'Action Items Review', notes: 'Confirm deliverables and owners', duration: 10 },
      { segment: 'Closing', notes: 'Prayer and closing remarks', duration: 5 },
    ],
  },
  dream_team: {
    id: 'tpl-dream-team',
    name: 'Dream Team Meeting',
    description: 'Leadership/visioning team meeting',
    meetingType: 'dream_team',
    items: [
      { segment: 'Icebreaker', notes: 'Team connection activity', duration: 10 },
      { segment: 'Vision Review', notes: 'Review goals and progress', duration: 20 },
      { segment: 'Blockers Discussion', notes: 'Address challenges and obstacles', duration: 20 },
      { segment: 'Strategic Planning', notes: 'Plan next steps and initiatives', duration: 30 },
      { segment: 'Accountability', notes: 'Set targets and commitments', duration: 15 },
      { segment: 'Prayer & Closing', notes: 'Team prayer and closing', duration: 5 },
    ],
  },
  ors_meeting: {
    id: 'tpl-ors-meeting',
    name: 'ORS Meeting',
    description: 'Operations and Reports Sync',
    meetingType: 'ors_meeting',
    items: [
      { segment: 'Opening & Welcome', notes: 'Agenda and objectives overview', duration: 5 },
      { segment: 'Department Reports', notes: 'Each team shares updates and metrics', duration: 25 },
      { segment: 'Discussion & Q&A', notes: 'Open discussion of reports', duration: 20 },
      { segment: 'Key Decisions', notes: 'Decisions requiring team input', duration: 15 },
      { segment: 'Action Items', notes: 'Confirm deliverables and timelines', duration: 10 },
      { segment: 'Closing Remarks', notes: 'Final thoughts and dismissal', duration: 5 },
    ],
  },
}

export const BLANK_TEMPLATE = {
  id: 'tpl-blank',
  name: 'Blank Agenda',
  description: 'Start from scratch',
  meetingType: 'blank',
  items: [],
}

export const ALL_TEMPLATES = [
  BUILT_IN_TEMPLATES.sunday_service,
  BUILT_IN_TEMPLATES.regional_meeting,
  BUILT_IN_TEMPLATES.dream_team,
  BUILT_IN_TEMPLATES.ors_meeting,
  BLANK_TEMPLATE,
]

export const MEETING_TYPES = [
  { value: 'sunday_service', label: 'Sunday Service', color: '#8B7355' },
  { value: 'regional_meeting', label: 'Regional Meeting', color: '#4C2A92' },
  { value: 'dream_team', label: 'Dream Team', color: '#B8860B' },
  { value: 'ors_meeting', label: 'ORS Meeting', color: '#2F4F4F' },
  { value: 'blank', label: 'Blank', color: '#666666' },
]

export const THEME_OPTIONS = [
  {
    id: 'cream_purple',
    name: 'Cream & Purple',
    primary: '#4C2A92',
    accent: '#F4F1EA',
    background: '#FCFAF6',
    preview: { bg: '#FCFAF6', text: '#4C2A92', accent: '#F4F1EA' },
  },
  {
    id: 'blue',
    name: 'Ocean Blue',
    primary: '#185FA5',
    accent: '#E3F2FD',
    background: '#F8FBFF',
    preview: { bg: '#F8FBFF', text: '#185FA5', accent: '#E3F2FD' },
  },
  {
    id: 'forest',
    name: 'Forest Green',
    primary: '#2D5016',
    accent: '#E8F5E9',
    background: '#F6FBF5',
    preview: { bg: '#F6FBF5', text: '#2D5016', accent: '#E8F5E9' },
  },
  {
    id: 'coral',
    name: 'Coral Sunset',
    primary: '#D84315',
    accent: '#FFEBEE',
    background: '#FFFBFA',
    preview: { bg: '#FFFBFA', text: '#D84315', accent: '#FFEBEE' },
  },
]
