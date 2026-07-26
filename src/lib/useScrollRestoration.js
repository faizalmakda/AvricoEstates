import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Remembers the window scroll position for each history entry and restores it
// when the user navigates BACK (a POP). This keeps a long list — e.g. the tree
// register — from jumping to the top after you open a tree and return.
//
// Pass `ready = true` only once the list has actually rendered, so we scroll
// against the full-height page rather than an empty, still-loading one.
export function useScrollRestoration(ready = true) {
  const location = useLocation()
  const navType = useNavigationType()
  const key = `scroll:${location.key}`

  // Continuously remember where we are, and capture it on the way out too.
  useEffect(() => {
    const save = () => { try { sessionStorage.setItem(key, String(window.scrollY)) } catch { /* ignore */ } }
    window.addEventListener('scroll', save, { passive: true })
    return () => { save(); window.removeEventListener('scroll', save) }
  }, [key])

  // On a back-navigation, once the content is ready, jump to the saved spot.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !ready) return
    restored.current = true
    if (navType !== 'POP') return
    const y = Number(sessionStorage.getItem(key) || 0)
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y))
  }, [ready, navType, key])
}
