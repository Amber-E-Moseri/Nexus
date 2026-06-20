import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { applyTemplateVariables, createEmailTemplate, updateEmailTemplate } from '../../lib/communications'
import { X, Palette, Maximize2, Minimize2, Check } from 'lucide-react'

const PRIMARY = '#4C2A92'
const ACCENT = '#E8A020'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const SURFACE = '#FFFFFF'

const MERGE_TAGS = [
  '{{first_name}}',
  '{{last_name}}',
  '{{email}}',
  '{{department}}',
  '{{role}}',
  '{{org_name}}',
]

export default function TemplateEditor({ template, onClose, onSaved }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [headerBg, setHeaderBg] = useState(template.variables?.headerBg ?? '#4C2A92')
  const [accentColor, setAccentColor] = useState(template.variables?.accentColor ?? '#E8A020')
  const [footerText, setFooterText] = useState(template.variables?.footerText ?? 'BLW CAN NEXUS')
  const [previewMode, setPreviewMode] = useState('desktop') // desktop | mobile
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [customName, setCustomName] = useState('')
  const [showSaveAs, setShowSaveAs] = useState(false)
  const [error, setError] = useState(null)
  const [bodyContent, setBodyContent] = useState(template.html_content || '')
  const [subjectLine, setSubjectLine] = useState(template.subject || '')
  const [bodyTextareaRef, setBodyTextareaRef] = useState(null)

  const previewHtml = applyTemplateVariables(bodyContent, {
    headerBg,
    accentColor,
    footerText,
  })

  function insertMergeTag(tag) {
    if (!bodyTextareaRef) return
    const textarea = bodyTextareaRef
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = bodyContent.substring(0, start)
    const after = bodyContent.substring(end)
    setBodyContent(before + tag + after)
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + tag.length
      textarea.focus()
    }, 0)
  }

  async function handleSaveAsCustom() {
    if (!customName.trim()) {
      setError('Template name is required')
      return
    }
    setSaving(true)
    setError(null)

    try {
      await createEmailTemplate(supabase, {
        name: customName.trim(),
        category: template.category,
        html_content: bodyContent,
        subject: subjectLine,
        is_system: false,
        variables: { headerBg, accentColor, footerText },
        created_by: profile?.id ?? null,
      })
      setSaved(true)
      setTimeout(() => {
        onSaved?.()
        onClose()
      }, 800)
    } catch (err) {
      setError(err.message ?? 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  async function handleUseInCampaign() {
    const customTemplate = {
      id: template.id,
      name: customName || template.name,
      category: template.category,
      html_content: bodyContent,
      subject: subjectLine,
      variables: { headerBg, accentColor, footerText },
    }
    sessionStorage.setItem('selected_email_template', JSON.stringify(customTemplate))
    navigate('/communications/compose?step=template')
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', background: 'rgba(14,14,30,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>
        {/* Header */}
        <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: '16px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT }}>{template.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>Customize colors and footer text</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 8 }}>
            <X size={20} color={MUTED} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
          {/* Subject + Body Editor */}
          <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '40%', overflow: 'auto' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Subject Line
              </label>
              <input
                type="text"
                value={subjectLine}
                onChange={(e) => setSubjectLine(e.target.value)}
                style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                placeholder="Email subject"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Body Content
              </label>

              {/* Merge Tags Bar */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, paddingBottom: 8 }}>
                {MERGE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertMergeTag(tag)}
                    title="Replaced with real value when sent"
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      border: `1px solid ${PRIMARY}`,
                      background: '#EDE8F8',
                      color: PRIMARY,
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = PRIMARY
                      e.currentTarget.style.color = SURFACE
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#EDE8F8'
                      e.currentTarget.style.color = PRIMARY
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <textarea
                ref={setBodyTextareaRef}
                value={bodyContent}
                onChange={(e) => setBodyContent(e.target.value)}
                style={{
                  flex: 1,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 12,
                  outline: 'none',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  minHeight: 120,
                  boxSizing: 'border-box',
                }}
                placeholder="Email body HTML..."
              />
            </div>
          </div>

          {/* Settings Panel and Preview */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Settings Panel */}
            <div style={{ width: 300, borderRight: `1px solid ${BORDER}`, background: SURFACE, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Background Color */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Header Color
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={headerBg}
                  onChange={(e) => setHeaderBg(e.target.value)}
                  style={{ width: 50, height: 40, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={headerBg}
                  onChange={(e) => setHeaderBg(e.target.value)}
                  style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
                  placeholder="#4C2A92"
                />
              </div>
            </div>

            {/* Accent Color */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Accent Color (Buttons)
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ width: 50, height: 40, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
                  placeholder="#E8A020"
                />
              </div>
            </div>

            {/* Footer Text */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Footer Text
              </label>
              <input
                type="text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                placeholder="BLW CAN NEXUS"
              />
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: BORDER, margin: '8px 0' }} />

            {/* Preview Mode Toggle */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Preview
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['desktop', 'mobile'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreviewMode(mode)}
                    style={{
                      flex: 1,
                      border: `1px solid ${previewMode === mode ? PRIMARY : BORDER}`,
                      background: previewMode === mode ? '#EDE8F8' : SURFACE,
                      color: previewMode === mode ? PRIMARY : MUTED,
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {mode === 'desktop' ? 'Desktop' : 'Mobile'}
                  </button>
                ))}
              </div>
            </div>

            {/* Spacing */}
            <div style={{ flex: 1 }} />

            {/* Error */}
            {error ? (
              <div style={{ background: '#FEF0ED', border: `1px solid #F5C4B8`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#C94830' }}>
                {error}
              </div>
            ) : null}

            {/* Saved Indicator */}
            {saved ? (
              <div style={{ background: '#EBF7F1', border: `1px solid #A5D6D3`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#2D8653', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} /> Saved!
              </div>
            ) : null}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!showSaveAs && template.is_system ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSaveAs(true)}
                    style={{ border: 'none', background: PRIMARY, color: SURFACE, borderRadius: 6, padding: '10px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Save as Custom
                  </button>
                  <button
                    type="button"
                    onClick={handleUseInCampaign}
                    style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: PRIMARY, borderRadius: 6, padding: '10px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Use in Campaign
                  </button>
                </>
              ) : showSaveAs ? (
                <>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="My Custom Template"
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveAsCustom}
                    disabled={saving}
                    style={{ border: 'none', background: PRIMARY, color: SURFACE, borderRadius: 6, padding: '10px 12px', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? 'Saving...' : 'Save Template'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveAs(false)}
                    style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, borderRadius: 6, padding: '10px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* Preview Pane */}
          <div style={{ flex: 1, background: BG, padding: 20, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {previewMode === 'desktop' ? (
              <div
                style={{
                  background: SURFACE,
                  borderRadius: 8,
                  width: '100%',
                  maxWidth: 600,
                  boxShadow: '0 2px 8px rgba(14,14,30,0.1)',
                  overflow: 'hidden',
                  marginTop: 20,
                }}
              >
                {/* eslint-disable-next-line react/no-danger */}
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                <div
                  style={{
                    width: 375,
                    border: '8px solid #2D2A22',
                    borderRadius: 40,
                    padding: 12,
                    background: SURFACE,
                    boxShadow: '0 8px 24px rgba(14,14,30,0.2)',
                    overflow: 'hidden',
                  }}
                >
                  {/* eslint-disable-next-line react/no-danger */}
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
