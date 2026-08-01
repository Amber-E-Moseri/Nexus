import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { renderBlocksOrFallback } from '../lib/minutesBlocks'

// Tiptap toolbar button — onMouseDown:preventDefault keeps editor focus so
// blur doesn't fire before the command executes (would falsely release the
// presence lock).
function ToolbarBtn({ title, isActive, disabled, onClick, children }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      style={{
        padding: '3px 7px',
        border: 'none',
        borderRadius: 4,
        background: isActive ? 'var(--color-primary, #4C2A92)' : 'transparent',
        color: isActive ? '#fff' : 'var(--text-secondary, #7A6F5E)',
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        lineHeight: 1.4,
        minWidth: 26,
      }}
    >
      {children}
    </button>
  )
}

const RichMinutesEditor = forwardRef(function RichMinutesEditor(
  { meetingId, initialBlocks, fallbackText, canEdit, onSave, injectContent, onInjectConsumed },
  ref,
) {
  const { profile } = useAuth()
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const [lockHolder, setLockHolder] = useState(null)   // { user_id, name } or null
  const [isTracking, setIsTracking] = useState(false)  // are WE broadcasting editing:true?
  const channelRef = useRef(null)
  const saveTimerRef = useRef(null)
  const hasEditedRef = useRef(false) // have we received a first focus/keystroke?

  const isReadOnly = !canEdit || (lockHolder && lockHolder.user_id !== profile?.id)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Underline,
    ],
    content: renderBlocksOrFallback(initialBlocks, fallbackText),
    editable: !isReadOnly,
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!canEdit || isReadOnly) return
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus('saving')
        const doc = e.getJSON()
        const { error } = await supabase
          .from('meetings')
          .update({ notes_blocks: doc })
          .eq('id', meetingId)
        if (error) {
          setSaveStatus('error')
          setTimeout(() => setSaveStatus('idle'), 5000)
        } else {
          setSaveStatus('saved')
          onSave?.(doc)
          setTimeout(() => setSaveStatus('idle'), 3000)
        }
      }, 2500)
    },
    onFocus: () => {
      if (!canEdit || isReadOnly || isTracking) return
      trackEditing()
    },
  })

  // Keep editable state in sync with isReadOnly (lock changes after mount)
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!isReadOnly)
  }, [editor, isReadOnly])

  // Update content when initialBlocks changes (e.g. after AI extraction apply)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const current = editor.getJSON()
    const target = renderBlocksOrFallback(initialBlocks, fallbackText)
    // Only reset if content actually differs (avoid cursor jump on every render)
    if (JSON.stringify(current) !== JSON.stringify(target)) {
      editor.commands.setContent(target, false)
    }
  }, [initialBlocks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply content injected from the AI tab (editor may not have been mounted when the button was clicked)
  useEffect(() => {
    if (!injectContent || !editor || editor.isDestroyed) return
    editor.commands.setContent(injectContent, true)
    onInjectConsumed?.()
  }, [injectContent, editor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Expose replaceContent(doc) so parent can inject AI extraction results
  useImperativeHandle(ref, () => ({
    replaceContent(doc) {
      if (!editor || editor.isDestroyed) return
      // emitUpdate=true triggers onUpdate → debounced autosave
      editor.commands.setContent(doc, true)
    },
  }), [editor])

  // ── Presence: subscribe eagerly, track only on first focus ──────────────────
  useEffect(() => {
    if (!meetingId || !profile?.id) return

    const channel = supabase.channel(`minutes-edit:${meetingId}`, {
      config: { presence: { key: profile.id } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const others = Object.entries(state)
        .filter(([key]) => key !== profile.id)
        .flatMap(([, presences]) => presences)
        .filter(p => p.editing === true)

      if (others.length > 0) {
        setLockHolder({ user_id: others[0].user_id, name: others[0].name })
      } else {
        setLockHolder(null)
      }
    })

    channel.subscribe()
    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setIsTracking(false)
    }
  }, [meetingId, profile?.id])

  function trackEditing() {
    if (!channelRef.current || isTracking) return
    channelRef.current.track({
      user_id: profile.id,
      name: profile.name || profile.full_name || 'Someone',
      editing: true,
    })
    setIsTracking(true)
    hasEditedRef.current = true
  }

  function untrackEditing() {
    if (!channelRef.current || !isTracking) return
    channelRef.current.untrack()
    setIsTracking(false)
  }

  // Release lock on blur (background-tab users don't hold the lock)
  function handleEditorBlur() {
    untrackEditing()
  }

  // Also track on first keystroke (belt-and-suspenders with onFocus)
  function handleKeyDown() {
    if (canEdit && !isReadOnly && !isTracking) {
      trackEditing()
    }
  }

  // Cleanup save timer on unmount
  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  const saveLabel =
    saveStatus === 'saving' ? '⏳ Saving…'
    : saveStatus === 'saved' ? '✓ Saved'
    : saveStatus === 'error' ? '⚠ Save failed'
    : canEdit && !isReadOnly ? '✓ Auto-saving'
    : isReadOnly && lockHolder ? `🔒 ${lockHolder.name} is editing`
    : '🔒 Read-only'

  const saveColor =
    saveStatus === 'error' ? '#F06449'
    : saveStatus === 'saved' || (canEdit && !isReadOnly) ? '#2D8653'
    : '#7A6F5E'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Lock banner */}
      {lockHolder && lockHolder.user_id !== profile?.id && (
        <div style={{
          padding: '8px 14px',
          background: '#FFF8E1',
          border: '1px solid #F0C040',
          borderRadius: '8px 8px 0 0',
          fontSize: 12,
          color: '#6B4F00',
          fontWeight: 600,
        }}>
          ✏️ {lockHolder.name} is currently editing — view only
        </div>
      )}

      {/* Toolbar */}
      {canEdit && !isReadOnly && editor && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-light, #F2EEE6)',
          background: 'var(--surface-secondary, #F9F7F3)',
          borderRadius: lockHolder ? 0 : '8px 8px 0 0',
        }}>
          <ToolbarBtn title="Bold" isActive={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarBtn>
          <ToolbarBtn title="Italic" isActive={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarBtn>
          <ToolbarBtn title="Underline" isActive={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarBtn>
          <div style={{ width: 1, background: 'var(--border, #E9E4D8)', margin: '0 4px' }} />
          <ToolbarBtn title="Heading 2" isActive={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarBtn>
          <ToolbarBtn title="Heading 3" isActive={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarBtn>
          <div style={{ width: 1, background: 'var(--border, #E9E4D8)', margin: '0 4px' }} />
          <ToolbarBtn title="Bullet list" isActive={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• —</ToolbarBtn>
          <ToolbarBtn title="Ordered list" isActive={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarBtn>
          <div style={{ width: 1, background: 'var(--border, #E9E4D8)', margin: '0 4px' }} />
          <ToolbarBtn title="Blockquote" isActive={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>"</ToolbarBtn>
          <ToolbarBtn title="Code block" isActive={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{`</>`}</ToolbarBtn>
          <ToolbarBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</ToolbarBtn>
        </div>
      )}

      {/* Editor body */}
      <div
        onBlur={handleEditorBlur}
        onKeyDown={handleKeyDown}
        style={{
          border: '1px solid var(--border, #E9E4D8)',
          borderTop: canEdit && !isReadOnly && editor ? 'none' : undefined,
          borderRadius: (canEdit && !isReadOnly && editor) ? '0 0 8px 8px' : 8,
          background: 'var(--surface, #FFFFFF)',
          minHeight: 140,
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Save status */}
      <div style={{ fontSize: 10, color: saveColor, fontWeight: 600, textAlign: 'right', marginTop: 4 }}>
        {saveLabel}
      </div>
    </div>
  )
})

export default RichMinutesEditor
