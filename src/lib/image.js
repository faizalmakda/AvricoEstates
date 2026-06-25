// Client-side image compression. Shrinks big phone photos down to a small
// JPEG (~150 KB target) BEFORE upload, so storage lasts far longer. Runs in the
// browser — no server, no cost. Falls back to the original file if anything
// goes wrong (e.g. an unsupported format).

// Defaults tuned for clarity: 1600px max edge, ~300KB target. Clear enough to
// zoom in and inspect leaves/disease, while still ~10x smaller than a raw photo.
const DEFAULTS = { maxDim: 1600, targetBytes: 300 * 1024, minQuality: 0.5 }

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
  const { maxDim, targetBytes, minQuality } = { ...DEFAULTS, ...opts }
  // Only try to compress real images, and skip if already tiny.
  if (!file || !file.type?.startsWith('image/')) return file
  if (file.size <= targetBytes) return file

  try {
    const img = await loadImage(file)
    let { width, height } = img
    const scale = Math.min(1, maxDim / Math.max(width, height))
    width = Math.round(width * scale)
    height = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(img, 0, 0, width, height)

    // Step the quality down until we're under the target size.
    let blob = null
    for (let q = 0.8; q >= minQuality; q -= 0.1) {
      blob = await toBlob(canvas, q)
      if (blob && blob.size <= targetBytes) break
    }
    if (!blob) return file

    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file // unsupported format etc. — upload the original
  }
}
