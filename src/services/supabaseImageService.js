import { supabaseClient } from '../lib/supabase'

const IMAGE_BUCKET = 'phim'

function isDataUrl(value) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value || '')
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',')
  const contentType = header.match(/^data:(.*?);base64$/)?.[1] || 'image/jpeg'
  const bytes = atob(base64)
  const array = new Uint8Array(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) {
    array[index] = bytes.charCodeAt(index)
  }
  return new Blob([array], { type: contentType })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })
}

export async function compressImageDataUrl(dataUrl, options = {}) {
  const {
    maxSize = 1600,
    quality = 0.76,
    mimeType = 'image/jpeg',
  } = options

  const image = await loadImage(dataUrl)
  const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio))
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, width, height)

  const compressedBlob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality))
  if (!compressedBlob) return dataUrl
  return blobToDataUrl(compressedBlob)
}

async function uploadOneImage(dataUrl, { idbn, entryId, index }) {
  if (!supabaseClient) {
    throw new Error('Chưa cấu hình Supabase để upload ảnh.')
  }

  const compressedDataUrl = await compressImageDataUrl(dataUrl)
  const blob = dataUrlToBlob(compressedDataUrl)
  const safeIdbn = String(idbn || 'unknown').replace(/[^a-z0-9_-]/gi, '_')
  const safeEntryId = String(entryId || crypto.randomUUID()).replace(/[^a-z0-9_-]/gi, '_')
  const filePath = `patient-progress/${safeIdbn}/${safeEntryId}-${index + 1}.jpg`

  const { error } = await supabaseClient.storage
    .from(IMAGE_BUCKET)
    .upload(filePath, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    })

  if (error) throw error

  const { data } = supabaseClient.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(filePath)

  if (!data?.publicUrl) {
    throw new Error('Không lấy được public URL ảnh từ Supabase Storage.')
  }

  return data.publicUrl
}

export async function uploadProgressImagesToSupabase(imageUrls, context = {}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : []
  const uploadedUrls = []

  for (let index = 0; index < urls.length; index += 1) {
    const imageUrl = urls[index]
    uploadedUrls.push(isDataUrl(imageUrl)
      ? await uploadOneImage(imageUrl, { ...context, index })
      : imageUrl)
  }

  return uploadedUrls
}
