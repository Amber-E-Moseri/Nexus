// Shared font stacks for the ClickUp UI refresh (experiment/clickup-ui-refresh).
// Same stacks as src/features/calendar/lib/fonts.js, hoisted here so Inbox,
// Notifications, and Spaces don't import from the calendar feature. Loaded
// from Google Fonts in index.html; DM Sans/Mono kept as fallbacks so modules
// degrade to the app-wide fonts if the extra families fail to load.

export const FONT_HEADING = "'Space Grotesk', 'DM Sans', sans-serif"
export const FONT_BODY = "'Inter', 'DM Sans', sans-serif"
export const FONT_MONO = "'JetBrains Mono', 'DM Mono', monospace"
