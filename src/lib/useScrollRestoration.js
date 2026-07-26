import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Remembers the window scroll position for a given URL and restores it when you
// come back to that URL (e.g. after opening a tree from the register). Keyed by
// the URL itself — not the router's internal history key — so it works whether
// you return via the browser/swipe back or an in-app back link.
//
// Pass `ready = true` only once the list has rendered, so we scroll against the
// full-height page rather than an empty, still-loading one. (Scroll control is
// set to 'manual' globally in main.jsx so the browser doesn't fight us.)
export function useScrollRestoration(ready = true) {
  const location = useLocation()
  const key = `scroll:${location.pathname}${location.search}`

  // Remember where we are as we scroll, and capture it on the way out too.
  useEffect(() => {
    const save = () => { try { sessionStorage.setItem(key, String(window.scrollY)) } catch { /* ignore */ } }
    window.addEventListener('scroll', save, { passive: true })
    return () => { save(); window.removeEventListener('scroll', save) }
  }, [key])

  // Once the content is ready, jump back to the saved spot. Keep re-applying for
  // a few frames until it sticks — the list can still be growing to full height.
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !ready) return
    done.current = true
    const target = Number(sessionStorage.getItem(key) || 0)
    if (target <= 0) return
    let tries = 0
    const tick = () => {
      window.scrollTo(0, target)
      tries += 1
      if (Math.abs(window.scrollY - target) > 2 && tries < 40) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [ready, key])
}
