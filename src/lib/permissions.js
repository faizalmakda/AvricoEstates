// Front-end permission helpers.
//
// IMPORTANT: these only control what the UI SHOWS. The real enforcement lives
// in the database (Row Level Security in supabase/schema.sql). Even if someone
// bypassed the UI, the database would still refuse a forbidden action. These
// helpers just avoid showing buttons that would fail.

export const ROLES = { OWNER: 'owner', MANAGER: 'manager' }

export function isOwner(profile) {
  return profile?.role === ROLES.OWNER && profile?.active !== false
}

export function isManager(profile) {
  return profile?.role === ROLES.MANAGER
}

// The capability map — mirrors the spec.
export const can = {
  // Trees
  createTree: isOwner,
  editTree: isOwner,
  deleteTree: isOwner,
  archiveTree: isOwner,
  addTreeLog: (p) => isOwner(p) || isManager(p), // manager's main power

  // Tasks
  createTask: isOwner,
  editTask: isOwner,
  deleteTask: isOwner,
  assignTask: isOwner,
  completeTask: (p) => isOwner(p) || isManager(p), // via a submission, not an edit
  viewAllTasks: isOwner,

  // Inventory & produce
  manageInventory: isOwner,
  manageProduce: isOwner,

  // Admin
  manageUsers: isOwner,
  viewReports: isOwner,
  viewEvidence: isOwner,
}

// Tree status options the manager (and owners) can log.
export const TREE_STATUSES = [
  'Healthy',
  'Needs Inspection',
  'Weak',
  'Diseased',
  'Dead',
  'Missing',
  'Replaced',
]

export const STATUS_COLORS = {
  Healthy: '#2e7d32',
  'Needs Inspection': '#f9a825',
  Weak: '#ef6c00',
  Diseased: '#c62828',
  Dead: '#6d4c41',
  Missing: '#546e7a',
  Replaced: '#1565c0',
}
