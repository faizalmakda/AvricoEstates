// Tree identification helpers.
//
// Canonical format:  ZONE-Rrr-Tttt   e.g.  B2-R01-T003
//   - Row number padded to 2 digits (R01..R99)
//   - Tree number padded to 3 digits (T001..T999)

export function pad(num, width) {
  const n = Math.max(0, parseInt(num, 10) || 0)
  return String(n).padStart(width, '0')
}

// Build the human ID from parts.
export function buildTreeCode(zoneCode, rowNumber, treeNumber) {
  if (!zoneCode || !rowNumber || !treeNumber) return ''
  return `${zoneCode}-R${pad(rowNumber, 2)}-T${pad(treeNumber, 3)}`
}

// Parse "B2-R01-T003" back into parts (best-effort).
export function parseTreeCode(code) {
  const m = /^([A-Za-z]\d+)-R(\d+)-T(\d+)$/.exec((code || '').trim())
  if (!m) return null
  return { zoneCode: m[1].toUpperCase(), rowNumber: Number(m[2]), treeNumber: Number(m[3]) }
}

export function isValidPositions(rowNumber, treeNumber) {
  const r = parseInt(rowNumber, 10)
  const t = parseInt(treeNumber, 10)
  return Number.isInteger(r) && r >= 1 && Number.isInteger(t) && t >= 1
}
