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

  // Take scroll control away from the browser so its own restoration doesn't
  // fight ours and snap the page back to the top.
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const prev = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => { window.history.scrollRestoration = prev }
  }, [])

  // Continuously remember where we are, and capture it on the way out too.
  useEffect(() => {
    const save = () => { try { sessionStorage.setItem(key, String(window.scrollY)) } catch { /* ignore */ } }
    window.addEventListener('scroll', save, { passive: true })
    return () => { save(); window.removeEventListener('scroll', save) }
  }, [key])

  // Once the content is ready: on a back-navigation jump to the saved spot,
  // on a fresh visit start at the top. Keep re-applying for a few frames until
  // the position sticks — the list can still be growing to full height.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !ready) return
    restored.current = true
    const target = navType === 'POP' ? Number(sessionStorage.getItem(key) || 0) : 0
    if (target <= 0) return
    let tries = 0
    const tick = () => {
      window.scrollTo(0, target)
      tries += 1
      if (Math.abs(window.scrollY - target) > 2 && tries < 30) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [ready, navType, key])
}
