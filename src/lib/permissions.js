// Front-end permission helpers for the 4-role model.
//
// IMPORTANT: these only control what the UI SHOWS. The real enforcement lives in
// the database (Row Level Security in supabase/schema*.sql). Even if someone
// bypassed the UI, the database would still refuse a forbidden action.

export const ROLES = {
  OWNER: 'owner',     // full access (the 3 directors)
  MANAGER: 'manager', // update trees, tasks, inventory, produce; upload photos
  WORKER: 'worker',   // complete assigned tasks, add inspections/usage, upload evidence
  VIEWER: 'viewer',   // read-only reports
}

const roleOf = (p) => p?.role
const active = (p) => p?.active !== false

export const isOwner = (p) => active(p) && roleOf(p) === ROLES.OWNER
export const isManager = (p) => active(p) && roleOf(p) === ROLES.MANAGER
export const isWorker = (p) => active(p) && roleOf(p) === ROLES.WORKER
export const isViewer = (p) => active(p) && roleOf(p) === ROLES.VIEWER

// owner or manager
export const isStaff = (p) => isOwner(p) || isManager(p)
// owner, manager or worker (can record field activity)
export const isFieldUser = (p) => isStaff(p) || isWorker(p)

export const ROLE_LABELS = {
  owner: 'Owner / Admin',
  manager: 'Farm Manager',
  worker: 'Worker',
  viewer: 'Viewer',
}

// Capability map — mirrors the blueprint's permission table.
export const can = {
  // Trees & orchard structure
  registerTree: isStaff,
  editTree: isStaff,
  archiveTree: isStaff,
  deleteTree: isOwner,
  manageZones: isStaff,

  // Tree field activity
  addInspection: isFieldUser,
  addTreatment: isStaff,
  addTreePhoto: isFieldUser,
  recordReplacement: isStaff,
  addTreeLog: isFieldUser,

  // Tasks
  createTask: isStaff,
  editTask: isStaff,
  deleteTask: isOwner,
  assignTask: isStaff,
  completeTask: isFieldUser,
  viewAllTasks: isStaff,

  // Inventory & produce
  manageInventory: isStaff,
  recordStockUsage: isFieldUser, // workers can record OUT movements
  manageProduce: isStaff,
  manageYield: isStaff,

  // Inventory purchase requests
  viewRequests: isFieldUser,     // owner/manager/worker (not viewer)
  createRequest: isFieldUser,    // managers & workers raise requests
  approveRequest: isOwner,       // owners approve / reject
  purchaseRequest: isOwner,      // owners mark purchased -> into stock

  // Admin
  manageUsers: isOwner,
  viewReports: () => true, // everyone, including viewers
  viewEvidence: isStaff,
}

// Tree status options.
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

export const TASK_STATUSES = ['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled']
