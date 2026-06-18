import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

const SidebarCtx = createContext({
  collapsed: false,
  peeking: false,
  isOpen: true,
  toggle: () => {},
  close: () => {},
  open: () => {},
  setPeeking: () => {},
})

// Content-heavy "working" surfaces where the panel should step aside so the
// board/list gets the full width. Top-level nav pages stay expanded.
function isWorkPage(pathname) {
  return /^\/spaces\/[^/]+/.test(pathname) || /^\/sprints\/[^/]+/.test(pathname)
}

export function SidebarProvider({ children }) {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.innerWidth >= 768 ? isWorkPage(window.location.pathname) : true } catch { return false }
  })
  const [peeking, setPeeking] = useState(false)
  const lastPathRef = useRef(pathname)

  // Re-evaluate the auto preference only when the route actually changes, so a
  // manual toggle sticks while you stay on the same page. On desktop the panel
  // compresses on work pages; on mobile it just closes the overlay after a jump.
  useEffect(() => {
    if (lastPathRef.current === pathname) return
    lastPathRef.current = pathname
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
    setCollapsed(isDesktop ? isWorkPage(pathname) : true)
    setPeeking(false)
  }, [pathname])

  const toggle = useCallback(() => setCollapsed((value) => !value), [])
  const close = useCallback(() => setCollapsed(true), [])
  const open = useCallback(() => setCollapsed(false), [])

  return (
    <SidebarCtx.Provider value={{ collapsed, peeking, setPeeking, isOpen: !collapsed, toggle, close, open }}>
      {children}
    </SidebarCtx.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarCtx)
}
