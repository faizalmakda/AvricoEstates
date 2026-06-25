// Client-side image compression. Shrinks big phone photos down to a small
// JPEG (~150 KB target) BEFORE upload, so storage lasts far longer. Runs in the
// browser — no server, no cost. Falls back to the original file if anything
// goes wrong (e.g. an unsupported format).

// Defaults tuned for clarity: start at 1600px / ~300KB target, but enforce the
// size by shrinking dimensions (down to a floor) if quality alone can't get
// there. So nearly every photo lands at or under the target, still clear enough
// to zoom in on leaves/disease.
const DEFAULTS = { maxDim: 1600, minDim: 1000, targetBytes: 300 * 1024, minQuality: 0.5 }

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

const toBlob = (canvas, q) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q))

export async function compressImage(file, opts = {}) {
  const { maxDim, minDim, targetBytes, minQuality } = { ...DEFAULTS, ...opts }
  // Only try to compress real images, and skip if already tiny.
  if (!file || !file.type?.startsWith('image/')) return file
  if (file.size <= targetBytes) return file

  try {
    const img = await loadImage(file)
    const longest = Math.max(img.width, img.height)
    let dim = Math.min(maxDim, longest)
    let best = null

    // Shrink the longest edge step by step until quality alone gets us under
    // the target (or we hit the dimension floor).
    while (true) {
      const scale = dim / longest
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)

      let blob = null
      for (let q = 0.82; q >= minQuality; q -= 0.1) {
        blob = await toBlob(canvas, q)
        if (blob && blob.size <= targetBytes) break
      }
      best = blob || best
      if ((blob && blob.size <= targetBytes) || dim <= minDim) break
      dim = Math.round(dim * 0.82) // still too big — reduce dimensions and retry
    }
    if (!best) return file

    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([best], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file // unsupported format etc. — upload the original
  }
}
