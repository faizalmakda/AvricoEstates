import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { isOwner, can } from '../lib/permissions'

// In-app "new items" badges for Tasks and Requests.
// "Last seen" is stored per-user in this browser (localStorage); the badge shows
// how many relevant items have appeared since you last opened that section.

const Ctx = createContext({ counts: { tasks: 0, requests: 0 }, markSeen: () => {}, refresh: () => {} })

const key = (section, uid) => `avrico:seen:${section}:${uid}`
const getSeen = (section, uid) => Number(localStorage.getItem(key(section, uid)) || 0)
const setSeen = (section, uid, t) => localStorage.setItem(key(section, uid), String(t))
const ms = (d) => (d ? new Date(d).getTime() : 0)

export function NotificationsProvider({ children }) {
  const { user, profile } = useAuth()
  const [counts, setCounts] = useState({ tasks: 0, requests: 0 })

  const refresh = useCallback(async () => {
    if (!user || !profile) { setCounts({ tasks: 0, requests: 0 }); return }
    const uid = user.id

    // Tasks: open tasks assigned to me, newer than I last looked.
    const seenTasks = getSeen('tasks', uid)
    const { data: tasks } = await supabase.from('tasks').select('created_at,status,assigned_to')
    const tasksNew = (tasks ?? []).filter((t) =>
      t.assigned_to === uid &&
      !['Completed', 'Cancelled'].includes(t.status) &&
      ms(t.created_at) > seenTasks
    ).length

    // Requests: owners see new requests to approve; requesters see their actioned ones.
    let requestsNew = 0
    if (can.viewRequests(profile)) {
      const seenReq = getSeen('requests', uid)
      const { data: reqs } = await supabase
        .from('inventory_requests').select('created_at,updated_at,status,requested_by')
      if (reqs) {
        requestsNew = isOwner(profile)
          ? reqs.filter((r) => r.status === 'requested' && ms(r.created_at) > seenReq).length
          : reqs.filter((r) => r.requested_by === uid &&
              ['approved', 'rejected', 'purchased'].includes(r.status) &&
              ms(r.updated_at || r.created_at) > seenReq).length
      }
    }

    setCounts({ tasks: tasksNew, requests: requestsNew })
  }, [user, profile])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const markSeen = useCallback((section) => {
    if (!user) return
    setSeen(section, user.id, Date.now())
    setCounts((c) => ({ ...c, [section]: 0 }))
  }, [user])

  return <Ctx.Provider value={{ counts, markSeen, refresh }}>{children}</Ctx.Provider>
}

export const useNotifications = () => useContext(Ctx)
