// RENAME: TemplatePage → YourFeaturePage
// Wire into App.jsx:
//   const TemplatePage = lazyRoute('/your-path', () => import('./pages/_template/TemplatePage'))
//   <Route path="/your-path" element={<TemplatePage />} />
// Add to Sidebar.jsx if it needs a nav entry.

import TemplateList from '../../features/_template/components/TemplateList'

const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#FAFAF8'
const BORDER = '#EDE8DC'

export default function TemplatePage() {
  return (
    <div style={{ minHeight: '100vh', background: BG }}>

      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '20px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 3px', color: TEXT }}>
          Feature Title
        </h1>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
          Short description of what this page does.
        </p>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 720 }}>
        <TemplateList />
      </div>

    </div>
  )
}
