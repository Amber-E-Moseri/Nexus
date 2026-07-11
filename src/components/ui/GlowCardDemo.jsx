import GlowCard from './GlowCard';

export default function GlowCardDemo() {
  return (
    <div style={{ padding: '40px', background: '#F7F5F0', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '40px', color: '#1C1610' }}>GlowCard Variants</h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '30px',
      }}>
        {/* Primary - Purple */}
        <GlowCard variant="primary">
          <div style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#4C2A92' }}>Primary Variant</h3>
            <p style={{ margin: 0, color: '#7A6F5E', fontSize: '13px', lineHeight: 1.5 }}>
              Navy purple glow — perfect for primary actions, featured cards, and main content areas.
            </p>
          </div>
        </GlowCard>

        {/* Accent - Amber */}
        <GlowCard variant="accent">
          <div style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#E8A020' }}>Accent Variant</h3>
            <p style={{ margin: 0, color: '#7A6F5E', fontSize: '13px', lineHeight: 1.5 }}>
              Warm amber glow — use for CTAs, important announcements, and emphasis.
            </p>
          </div>
        </GlowCard>

        {/* Success - Sage */}
        <GlowCard variant="success">
          <div style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#2D8653' }}>Success Variant</h3>
            <p style={{ margin: 0, color: '#7A6F5E', fontSize: '13px', lineHeight: 1.5 }}>
              Sage green glow — ideal for positive status, confirmations, and healthy states.
            </p>
          </div>
        </GlowCard>

        {/* Danger - Coral */}
        <GlowCard variant="danger">
          <div style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#F06449' }}>Danger Variant</h3>
            <p style={{ margin: 0, color: '#7A6F5E', fontSize: '13px', lineHeight: 1.5 }}>
              Coral red glow — perfect for alerts, errors, and destructive actions.
            </p>
          </div>
        </GlowCard>

        {/* Info - Blue */}
        <GlowCard variant="info">
          <div style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#2563EB' }}>Info Variant</h3>
            <p style={{ margin: 0, color: '#7A6F5E', fontSize: '13px', lineHeight: 1.5 }}>
              Blue glow — great for informational content and secondary actions.
            </p>
          </div>
        </GlowCard>

        {/* Custom Example - Meeting Card Style */}
        <GlowCard variant="primary" borderRadius={14}>
          <div style={{ padding: '16px' }}>
            <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: '#EDE8F8',
                color: '#4C2A92',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                General
              </span>
              <span style={{
                padding: '4px 8px',
                borderRadius: '999px',
                background: '#DBEAFE',
                color: '#1E40AF',
                fontSize: '10.5px',
                fontWeight: 700,
              }}>
                Scheduled
              </span>
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 700, color: '#1C1610' }}>
              Team Meeting
            </h3>
            <p style={{ margin: 0, color: '#7A6F5E', fontSize: '13px' }}>
              📅 Thu, Jan 15 • 2:30 PM
            </p>
          </div>
        </GlowCard>
      </div>

      <div style={{ marginTop: '60px', padding: '24px', background: 'white', borderRadius: '12px', border: '1px solid #E9E4D8' }}>
        <h2 style={{ marginTop: 0, color: '#1C1610' }}>Usage</h2>
        <pre style={{
          background: '#F9F7F3',
          padding: '16px',
          borderRadius: '8px',
          overflow: 'auto',
          fontSize: '12px',
          color: '#7A6F5E',
          fontFamily: "'DM Mono', monospace",
        }}>
{`import GlowCard from '@/components/ui/GlowCard';

// Basic usage
<GlowCard variant="primary">
  <div style={{ padding: '24px' }}>
    <h3>Your Content</h3>
    <p>Hover near the edges to see the glow effect.</p>
  </div>
</GlowCard>

// Variants: 'primary' | 'accent' | 'success' | 'danger' | 'info'
// Props:
// - variant: 'primary' (default)
// - edgeSensitivity: 35 (0-100, how close to edge)
// - borderRadius: 14 (px)
// - glowRadius: 35 (px)
// - glowIntensity: 0.8 (0.1-3.0)
// - animated: false (intro animation)`}
        </pre>
      </div>
    </div>
  );
}
