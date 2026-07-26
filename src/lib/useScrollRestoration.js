import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Remembers the window scroll position for a URL and restores it when you return
// to that URL (e.g. after opening a tree from the register).
//
// The tricky part: when you tap a tree while scrolled far down a long list, the
// detail page that replaces it is much shorter, so the browser instantly clamps
// the scroll to that short page (≈ the top). Saving "on the way out" therefore
// captured ≈0, not where you were. So we expose `saveNow()` to call the instant
// a row is tapped — before the page collapses — and freeze that value.
//
// Pass `ready = true` only once the list has rendered, so we scroll against the
// full-height page. (Scroll control is 'manual' globally, set in main.jsx.)
export function useScrollRestoration(ready = true) {
  const location = useLocation()
  const key = `scroll:${location.pathname}${location.search}`
  const frozen = useRef(false)

  // Keep the saved position current as the user scrolls — but once frozen (a row
  // was tapped) ignore further events, so the navigation's clamp can't overwrite it.
  useEffect(() => {
    frozen.current = false
    const onScroll = () => {
      if (frozen.current) return
      try { sessionStorage.setItem(key, String(window.scrollY)) } catch { /* ignore */ }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])

  // Capture the exact position right now and stop tracking (call on row tap).
  const saveNow = useCallback(() => {
    try { sessionStorage.setItem(key, String(window.scrollY)) } catch { /* ignore */ }
    frozen.current = true
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

  return saveNow
}
