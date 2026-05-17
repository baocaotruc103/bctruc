import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Check,
  ClipboardCheck,
  Database,
  Eye,
  FileText,
  Hospital,
  Layers,
  ListChecks,
  Mic,
  Pencil,
  Plus,
  Printer,
  Save,
  ScanText,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react'
import {
  departments,
  defaultReportMeta,
  initialPatientDirectory,
  initialReportEntries,
  initialUsers,
} from './data/sampleData'
import { isSupabaseConfigured } from './lib/supabase'
import {
  deleteDutyReport,
  loadAppData,
  loadReportEntries,
  saveDepartmentUnits,
  saveDutyReport,
} from './services/reportService'

const reportEntryTemplate = {
  idbn: '',
  category: 'Theo dõi',
  progressDate: todayISO(),
  clinicalProgress: '',
  paraclinical: '',
  intervention: '',
  note: '',
}

const navItems = [
  { key: 'patient-list', label: 'Danh sách BN', icon: ListChecks },
  { key: 'department-report', label: 'Báo cáo khoa', icon: ClipboardCheck },
  { key: 'block-report', label: 'Báo cáo khối', icon: Layers },
  { key: 'command-report', label: 'Trực chỉ huy', icon: ShieldCheck },
  { key: 'users', label: 'User', icon: UserCog },
  { key: 'catalog', label: 'Danh mục', icon: Database },
]

function buildInitialCatalogUnits(users = initialUsers) {
  const unitNames = Array.from(new Set([
    ...departments,
    ...users.map((user) => user.unit).filter(Boolean),
  ]))

  return unitNames.map((unitName, index) => {
    const codeMatch = unitName.match(/^[A-Z]+\d*/)
    const unitCode = codeMatch?.[0] || unitName.replace(/\s+/g, '-').toUpperCase()
    const isDepartment = /^[A-Z]\d+/.test(unitCode)
    return {
      id: crypto.randomUUID(),
      unitCode,
      unitName,
      blockName: '',
      unitType: isDepartment ? 'Khoa' : 'Phòng',
      isActive: true,
      displayOrder: (index + 1) * 10,
    }
  })
}

function todayISO() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function computeDailyStats(patients, reportDate) {
  return {
    admissions: patients.filter((patient) => patient.admissionDate === reportDate).length,
    transfersIn: patients.filter((patient) => patient.departmentDate === reportDate).length,
    transfersOut: patients.filter((patient) => patient.transferOutDate === reportDate).length,
    severeDischarge: patients.filter((patient) => patient.outcome === 'Xin về' && patient.outcomeDate === reportDate).length,
    deaths: patients.filter((patient) => patient.outcome === 'Tử vong' && patient.outcomeDate === reportDate).length,
    hospitalTransfers: patients.filter((patient) => patient.outcome === 'Chuyển viện' && patient.outcomeDate === reportDate).length,
    discharges: patients.filter((patient) => patient.outcome === 'Ra viện' && patient.outcomeDate === reportDate).length,
  }
}

function daysBetweenISO(fromDate, toDate) {
  if (!fromDate || !toDate) return Number.POSITIVE_INFINITY
  const from = new Date(`${fromDate}T00:00:00`)
  const to = new Date(`${toDate}T00:00:00`)
  return Math.floor((to - from) / 86400000)
}

function isPatientEligibleForDepartmentReport(patient, reportDate) {
  if (!patient) return false
  if (!patient.outcome || patient.outcome === 'Đang điều trị') return true

  const endDate = patient.outcomeDate || patient.transferOutDate
  const diff = daysBetweenISO(endDate, reportDate)
  return diff >= 0 && diff <= 3
}

function buildReportDraft(baseReport, patients, loggedInUser) {
  const reportDate = todayISO()
  return {
    ...baseReport,
    id: crypto.randomUUID(),
    date: reportDate,
    reporter: loggedInUser?.fullName || '',
    department: loggedInUser?.unit || baseReport.department,
    doctor: loggedInUser?.role === 'Khoa báo cáo' ? baseReport.doctor : loggedInUser?.fullName || baseReport.doctor,
    ...computeDailyStats(patients, reportDate),
  }
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function appendText(currentValue, nextText) {
  const cleaned = nextText.trim()
  if (!cleaned) return currentValue
  return [currentValue.trim(), cleaned].filter(Boolean).join('\n')
}

function countVietnameseMojibakeMarkers(text) {
  const matches = text.match(/[ÃÄÂÁá][\u0080-\u00ff]|[\u0080-\u009f]/g)
  return matches?.length || 0
}

function countVietnameseCharacters(text) {
  const matches = text.match(/[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯàáâãèéêìíòóôõùúăđĩũơưẠ-ỹ]/g)
  return matches?.length || 0
}

function repairVietnameseMojibake(text) {
  if (!countVietnameseMojibakeMarkers(text)) return text

  try {
    const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff))
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    const originalScore = countVietnameseCharacters(text) - countVietnameseMojibakeMarkers(text) * 3
    const decodedScore = countVietnameseCharacters(decoded) - countVietnameseMojibakeMarkers(decoded) * 3

    return decodedScore > originalScore ? decoded : text
  } catch {
    return text
  }
}

function normalizeVietnameseOcrText(text) {
  return repairVietnameseMojibake(text)
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getVideoDisplayRect(video, frame) {
  const frameRect = frame.getBoundingClientRect()
  const videoWidth = video.videoWidth || frameRect.width
  const videoHeight = video.videoHeight || frameRect.height
  const frameRatio = frameRect.width / frameRect.height
  const videoRatio = videoWidth / videoHeight

  if (videoRatio > frameRatio) {
    const height = frameRect.width / videoRatio
    return {
      left: 0,
      top: (frameRect.height - height) / 2,
      width: frameRect.width,
      height,
    }
  }

  const width = frameRect.height * videoRatio
  return {
    left: (frameRect.width - width) / 2,
    top: 0,
    width,
    height: frameRect.height,
  }
}

function preprocessOcrImage(sourceCanvas) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(3, Math.max(1.5, 1400 / Math.max(sourceCanvas.width, 1)))
  canvas.width = Math.round(sourceCanvas.width * scale)
  canvas.height = Math.round(sourceCanvas.height * scale)

  const targetContext = canvas.getContext('2d', { willReadFrequently: true })
  targetContext.imageSmoothingEnabled = true
  targetContext.imageSmoothingQuality = 'high'
  targetContext.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)

  const image = targetContext.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const value = Math.max(0, Math.min(255, (gray - 128) * 1.28 + 136))
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }

  targetContext.putImageData(image, 0, 0)
  return canvas
}

async function readTextWithOcrSpace(sourceCanvas) {
  const imageDataUrl = preprocessOcrImage(sourceCanvas).toDataURL('image/png')
  const formData = new FormData()
  formData.append('base64Image', imageDataUrl)
  formData.append('language', 'vnm')
  formData.append('isOverlayRequired', 'false')
  formData.append('scale', 'true')
  formData.append('detectOrientation', 'true')
  formData.append('filetype', 'PNG')
  formData.append('OCREngine', '2')

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_OCR_SPACE_API_KEY?.trim() || 'helloworld',
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`OCR.space HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.IsErroredOnProcessing) {
    const message = Array.isArray(result.ErrorMessage)
      ? result.ErrorMessage.join(' ')
      : result.ErrorMessage || result.ErrorDetails || 'OCR.space không xử lý được ảnh.'
    throw new Error(message)
  }

  return result.ParsedResults
    ?.map((item) => item.ParsedText || '')
    .join('\n')
    .trim() || ''
}

function CaptureTextarea({ label, value, onChange }) {
  const [isListening, setIsListening] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [status, setStatus] = useState('')
  const recognitionRef = useRef(null)

  const startSpeechToText = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setStatus('Trình duyệt chưa hỗ trợ nhập giọng nói.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'vi-VN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onstart = () => {
      setIsListening(true)
      setStatus('Đang nghe...')
    }
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
      onChange(appendText(value, transcript))
    }
    recognition.onerror = (event) => {
      setStatus(`Không nhận được giọng nói: ${event.error}`)
    }
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  const stopSpeechToText = () => {
    recognitionRef.current?.stop()
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="field-label mb-0">{label}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={isListening ? stopSpeechToText : startSpeechToText}
            className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-semibold ${
              isListening
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Mic size={14} />
            {isListening ? 'Dừng' : 'Voice'}
          </button>
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Camera size={14} />
            Quét
          </button>
        </div>
      </div>
      <textarea className="field-textarea min-h-[104px]" value={value} onChange={(event) => onChange(event.target.value)} />
      {status && <p className="mt-1 text-xs text-slate-500">{status}</p>}
      {captureOpen && (
        <CameraTextScanner
          onClose={() => setCaptureOpen(false)}
          onConfirm={(text) => {
            onChange(appendText(value, text))
            setCaptureOpen(false)
          }}
        />
      )}
    </div>
  )
}

function CameraTextScanner({ onClose, onConfirm }) {
  const videoRef = useRef(null)
  const imageRef = useRef(null)
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const dragStartRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [capturedImage, setCapturedImage] = useState('')
  const [selection, setSelection] = useState(null)
  const [ocrText, setOcrText] = useState('')
  const [status, setStatus] = useState('Đang mở camera...')

  useEffect(() => {
    let activeStream

    async function openCamera() {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        setStream(activeStream)
        if (videoRef.current) {
          videoRef.current.srcObject = activeStream
        }
        setStatus('Đưa vùng chữ vào khung rồi bấm Chụp ảnh.')
      } catch (error) {
        setStatus(`Không mở được camera: ${error.message}`)
      }
    }

    openCamera()

    return () => {
      activeStream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const pointFromEvent = (event) => {
    const frame = frameRef.current
    if (!frame) return null

    const rect = frame.getBoundingClientRect()
    const cropRect = capturedImage && imageRef.current
      ? imageRef.current.getBoundingClientRect()
      : rect
    const left = cropRect.left - rect.left
    const top = cropRect.top - rect.top
    const x = Math.max(left, Math.min(event.clientX - rect.left, left + cropRect.width))
    const y = Math.max(top, Math.min(event.clientY - rect.top, top + cropRect.height))

    return {
      x,
      y,
    }
  }

  const handlePointerDown = (event) => {
    if (!capturedImage) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = pointFromEvent(event)
    if (!point) return
    dragStartRef.current = point
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const handlePointerMove = (event) => {
    if (!capturedImage || !dragStartRef.current) return
    event.preventDefault()
    const point = pointFromEvent(event)
    if (!point) return
    const dragStart = dragStartRef.current
    setSelection({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    })
  }

  const handlePointerUp = (event) => {
    dragStartRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const captureFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    if (!video.videoWidth || !video.videoHeight) {
      setStatus('Camera chưa sẵn sàng, vui lòng thử lại sau vài giây.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCapturedImage(canvas.toDataURL('image/png'))
    setSelection(null)
    setOcrText('')
    setStatus('Đã chụp ảnh. Chạm và kéo trên ảnh để crop vùng chữ cần OCR.')
  }

  const retakePhoto = () => {
    setCapturedImage('')
    setSelection(null)
    setOcrText('')
    setStatus('Đưa vùng chữ vào khung rồi bấm Chụp ảnh.')
  }

  const scanCroppedImage = async () => {
    const image = imageRef.current
    const canvas = canvasRef.current
    const frame = frameRef.current
    if (!image || !canvas || !frame || !capturedImage) return

    if (!image.naturalWidth || !image.naturalHeight) {
      setStatus('Ảnh chưa sẵn sàng, vui lòng thử lại sau vài giây.')
      return
    }

    setStatus('Đang OCR vùng crop...')
    const frameRect = frame.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    const imageBounds = {
      x: imageRect.left - frameRect.left,
      y: imageRect.top - frameRect.top,
      width: imageRect.width,
      height: imageRect.height,
    }
    const selected = selection?.width > 12 && selection?.height > 12
      ? selection
      : imageBounds

    const sourceX = Math.max(0, selected.x - imageBounds.x)
    const sourceY = Math.max(0, selected.y - imageBounds.y)
    const sourceWidth = Math.min(selected.width, imageBounds.width - sourceX)
    const sourceHeight = Math.min(selected.height, imageBounds.height - sourceY)
    const scaleX = image.naturalWidth / imageBounds.width
    const scaleY = image.naturalHeight / imageBounds.height
    canvas.width = Math.max(1, Math.round(sourceWidth * scaleX))
    canvas.height = Math.max(1, Math.round(sourceHeight * scaleY))

    const context = canvas.getContext('2d')
    context.drawImage(
      image,
      sourceX * scaleX,
      sourceY * scaleY,
      sourceWidth * scaleX,
      sourceHeight * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    try {
      const text = normalizeVietnameseOcrText(await readTextWithOcrSpace(canvas))
      setOcrText(text)
      setStatus(text ? 'Đã quét xong. Kiểm tra nội dung rồi xác nhận.' : 'Không nhận được chữ trong vùng đã chọn.')
    } catch (error) {
      setStatus(`OCR lỗi: ${error.message}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Quét chữ bằng camera</h3>
            <p className="text-sm text-slate-500">Chụp ảnh, crop vùng chứa chữ, sau đó OCR để điền vào ô dữ liệu.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
          <div
            ref={frameRef}
            className="relative touch-none select-none overflow-hidden rounded-lg bg-slate-900"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {capturedImage ? (
              <img
                ref={imageRef}
                src={capturedImage}
                alt="Ảnh đã chụp để crop OCR"
                className="pointer-events-none max-h-[62vh] min-h-[320px] w-full object-contain"
              />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="pointer-events-none max-h-[62vh] min-h-[320px] w-full object-contain" />
            )}
            {selection && (
              <div
                className="pointer-events-none absolute border-2 border-hospital-500 bg-hospital-500/10"
                style={{
                  left: selection.x,
                  top: selection.y,
                  width: selection.width,
                  height: selection.height,
                }}
              />
            )}
          </div>
          <div className="flex flex-col gap-3">
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{status}</p>
            {capturedImage ? (
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={scanCroppedImage}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700"
                >
                  <ScanText size={16} />
                  OCR vùng crop
                </button>
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Camera size={16} />
                  Chụp lại
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={captureFrame}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700"
              >
                <Camera size={16} />
                Chụp ảnh
              </button>
            )}
            <textarea
              className="field-textarea min-h-[180px]"
              value={ocrText}
              onChange={(event) => setOcrText(normalizeVietnameseOcrText(event.target.value))}
              placeholder="Kết quả OCR sẽ hiển thị tại đây"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Hủy
              </button>
              <button
                type="button"
                onClick={() => onConfirm(ocrText)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-hospital-600 px-3 text-sm font-semibold text-white hover:bg-hospital-700"
              >
                <Check size={16} />
                Xác nhận điền
              </button>
            </div>
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}

function AppShell({ activeMenu, onMenuChange, children }) {
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hospital-600 text-white">
            <Hospital size={21} />
          </div>
          <div>
            <p className="text-sm font-bold">Báo cáo trực</p>
            <p className="text-xs text-slate-500">Hệ thống bệnh viện</p>
          </div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeMenu === item.key
            return (
              <button
                key={item.key}
                onClick={() => onMenuChange(item.key)}
                className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium ${
                  active
                    ? 'bg-hospital-50 text-hospital-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>
      <main className="lg:pl-64">
        <div className="border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = activeMenu === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => onMenuChange(item.key)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${
                    active
                      ? 'bg-hospital-50 text-hospital-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}

function TopBar({ report, activeMenu }) {
  const activeLabel = navItems.find((item) => item.key === activeMenu)?.label || 'Báo cáo khoa'

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 flex-col gap-1 px-4 py-3 lg:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-normal text-slate-950">{activeLabel}</h1>
          <p className="text-sm text-slate-500">
            {report.department} · {report.block} · Ngày {formatDateVN(report.date)}
          </p>
        </div>
      </div>
    </header>
  )
}

function DepartmentReportList({ reports, onCreate, onView, onEdit, onDelete }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Danh sách báo cáo</h2>
          <p className="text-sm text-slate-500">Quản lý báo cáo trực khoa theo ngày, kíp trực bác sĩ và điều dưỡng.</p>
        </div>
        <button onClick={onCreate} className="inline-flex h-9 items-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700">
          <Plus size={16} />
          Tạo mới báo cáo
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[820px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {['Ngày báo cáo', 'Kíp trực bác sĩ', 'Điều dưỡng', 'Xem/Sửa/Xóa báo cáo'].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/70">
                <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{formatDateVN(item.date)}</td>
                <td className="border-b border-slate-100 px-3 py-3">{item.doctor}</td>
                <td className="border-b border-slate-100 px-3 py-3">{item.nurse}</td>
                <td className="border-b border-slate-100 px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => onView(item.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Eye size={14} />
                      Xem
                    </button>
                    <button onClick={() => onEdit(item.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-hospital-200 px-2 text-xs font-semibold text-hospital-700 hover:bg-hospital-50">
                      <Pencil size={14} />
                      Sửa
                    </button>
                    <button onClick={() => onDelete(item.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                      <Trash2 size={14} />
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReportMetaForm({ report, setReport, patients }) {
  const update = (field, value) => {
    setReport((current) => {
      const next = { ...current, [field]: value }
      return field === 'date' ? { ...next, ...computeDailyStats(patients, value) } : next
    })
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Thông tin ca trực</h2>
          <p className="text-sm text-slate-500">Thông tin chung để tổng hợp báo cáo trực khoa, khối và chỉ huy.</p>
        </div>
        <FileText className="text-hospital-600" size={20} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Thời gian trực">
          <input className="field-input" type="date" value={report.date} onChange={(event) => update('date', event.target.value)} />
        </Field>
        <Field label="Người báo cáo">
          <input className="field-input bg-slate-50" value={report.reporter || ''} readOnly />
        </Field>
        <Field label="Khối">
          <input className="field-input" value={report.block} onChange={(event) => update('block', event.target.value)} />
        </Field>
        <Field label="Khoa">
          <select className="field-input" value={report.department} onChange={(event) => update('department', event.target.value)}>
            {departments.map((department) => (
              <option key={department}>{department}</option>
            ))}
          </select>
        </Field>
        <Field label="Bác sĩ trực">
          <input className="field-input" value={report.doctor} onChange={(event) => update('doctor', event.target.value)} />
        </Field>
        <Field label="Điều dưỡng">
          <input className="field-input" value={report.nurse} onChange={(event) => update('nurse', event.target.value)} />
        </Field>
        <Field label="Trực chỉ huy khoa">
          <input className="field-input" value={report.commander} onChange={(event) => update('commander', event.target.value)} />
        </Field>
      </div>
    </section>
  )
}

function SummaryPanel({ report, setReport }) {
  const updateNumber = (field, value) =>
    setReport((current) => ({ ...current, [field]: Number(value) || 0 }))

  const summaryFields = [
    ['admissions', 'Vào viện'],
    ['transfersIn', 'Chuyển đến'],
    ['transfersOut', 'Chuyển đi'],
    ['severeDischarge', 'Xin về'],
    ['deaths', 'Tử vong'],
    ['hospitalTransfers', 'Chuyển viện'],
    ['discharges', 'Ra viện'],
    ['census', 'Số BN đang điều trị'],
  ]

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">Số liệu trong ngày</h2>
        <p className="text-sm text-slate-500">
          Số liệu tự điền từ Danh sách BN theo ngày báo cáo; mục Chuyển đến tính theo Ngày vào khoa trùng ngày báo cáo.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {summaryFields.map(([field, label]) => (
          <div key={field}>
            <Field label={label}>
              <input className="field-input" type="number" min="0" value={report[field] || 0} onChange={(event) => updateNumber(field, event.target.value)} />
            </Field>
          </div>
        ))}
        <Field label="Bất thường khác">
          <input className="field-input" value={report.incidents} onChange={(event) => setReport((current) => ({ ...current, incidents: event.target.value }))} />
        </Field>
      </div>
    </section>
  )
}

function PatientDirectory({ patients, setPatients, reportEntries, setReportEntries }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [viewPatient, setViewPatient] = useState(null)
  const [progressPatient, setProgressPatient] = useState(null)
  const [progressDraft, setProgressDraft] = useState({
    category: 'Theo dõi',
    progressDate: todayISO(),
    clinicalProgress: '',
    paraclinical: '',
    intervention: '',
    note: '',
  })
  const [patientDraft, setPatientDraft] = useState({
    idbn: '',
    fullName: '',
    birthYear: '',
    admissionDate: '',
    departmentDate: '',
    transferTo: '',
    transferOutDate: '',
    outcome: 'Đang điều trị',
    outcomeDate: '',
    diagnosis: '',
    history: '',
  })
  const [editPatientIndex, setEditPatientIndex] = useState(null)
  const [editPatientDraft, setEditPatientDraft] = useState(null)
  const statusOptions = useMemo(() => {
    const statuses = patients
      .map((patient) => patient.outcome)
      .filter(Boolean)
    return Array.from(new Set(statuses)).sort((a, b) => a.localeCompare(b, 'vi'))
  }, [patients])
  const filteredPatients = useMemo(() => {
    if (statusFilter === 'all') return patients
    return patients.filter((patient) => patient.outcome === statusFilter)
  }, [patients, statusFilter])
  const viewPatientJournal = useMemo(() => {
    if (!viewPatient) return []
    return [...(reportEntries || [])]
      .filter((entry) => entry.idbn === viewPatient.idbn)
      .sort((first, second) => (second.progressDate || '').localeCompare(first.progressDate || ''))
  }, [reportEntries, viewPatient])

  const openProgressModal = (patient) => {
    setProgressPatient(patient)
    setProgressDraft({
      category: 'Theo dõi',
      progressDate: todayISO(),
      clinicalProgress: '',
      paraclinical: '',
      intervention: '',
      note: '',
    })
  }
  const updateProgressDraft = (field, value) => {
    setProgressDraft((current) => ({ ...current, [field]: value }))
  }
  const saveProgress = () => {
    if (!progressPatient) return
    setReportEntries((current) => [
      ...current,
      {
        ...reportEntryTemplate,
        ...progressDraft,
        id: crypto.randomUUID(),
        idbn: progressPatient.idbn || '',
        source: 'patient-progress',
      },
    ])
    setProgressPatient(null)
  }
  const updatePatientDraft = (field, value) => {
    setPatientDraft((current) => ({ ...current, [field]: value }))
  }
  const resetPatientDraft = () => {
    setPatientDraft({
      idbn: '',
      fullName: '',
      birthYear: '',
      admissionDate: '',
      departmentDate: '',
      transferTo: '',
      transferOutDate: '',
      outcome: 'Đang điều trị',
      outcomeDate: '',
      diagnosis: '',
      history: '',
    })
  }
  const savePatient = () => {
    if (!patientDraft.idbn || !patientDraft.fullName) return
    setPatients((current) => [...current, patientDraft])
    resetPatientDraft()
    setShowAddForm(false)
  }
  const openPatientModal = (patient) => {
    const patientIndex = patients.indexOf(patient)
    setEditPatientIndex(patientIndex)
    setEditPatientDraft({ ...patient })
  }
  const updateEditPatientDraft = (field, value) => {
    setEditPatientDraft((current) => ({ ...current, [field]: value }))
  }
  const saveEditedPatient = () => {
    if (editPatientIndex === null || !editPatientDraft) return
    setPatients((current) =>
      current.map((patient, index) =>
        index === editPatientIndex ? editPatientDraft : patient,
      ),
    )
    setEditPatientIndex(null)
    setEditPatientDraft(null)
  }
  const displayValue = (value) => value || '-'
  const displayDate = (value) => (value ? formatDateVN(value) : '-')

  if (viewPatient) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Thông tin bệnh nhân</h2>
            <p className="text-sm text-slate-500">{viewPatient.idbn} - {viewPatient.fullName}</p>
          </div>
          <button onClick={() => setViewPatient(null)} className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Quay lại danh sách
          </button>
        </div>
        <dl className="grid gap-4 p-4 text-sm md:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-semibold text-slate-500">IDBN</dt>
            <dd className="text-slate-900">{displayValue(viewPatient.idbn)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Họ và tên</dt>
            <dd className="text-slate-900">{displayValue(viewPatient.fullName)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Năm sinh</dt>
            <dd className="text-slate-900">{displayValue(viewPatient.birthYear)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Ngày vào viện</dt>
            <dd className="text-slate-900">{displayDate(viewPatient.admissionDate)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Ngày vào khoa</dt>
            <dd className="text-slate-900">{displayDate(viewPatient.departmentDate)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Khoa chuyển đến</dt>
            <dd className="text-slate-900">{displayValue(viewPatient.transferTo)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Ngày chuyển đi</dt>
            <dd className="text-slate-900">{displayDate(viewPatient.transferOutDate)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Trạng thái</dt>
            <dd className="text-slate-900">{displayValue(viewPatient.outcome)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Ngày ra</dt>
            <dd className="text-slate-900">{displayDate(viewPatient.outcomeDate)}</dd>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <dt className="font-semibold text-slate-500">Chẩn đoán</dt>
            <dd className="text-slate-900">{displayValue(viewPatient.diagnosis)}</dd>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <dt className="font-semibold text-slate-500">Bệnh sử</dt>
            <dd className="text-slate-900">{displayValue(viewPatient.history)}</dd>
          </div>
        </dl>
        <div className="border-t border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Nhật ký diễn biến bệnh nhân</h3>
          <div className="mt-3 space-y-3">
            {viewPatientJournal.map((entry) => (
              <div key={entry.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <p className="font-semibold text-slate-900">{entry.category || 'Theo dõi'}</p>
                  <p className="text-slate-500">{displayDate(entry.progressDate)}</p>
                </div>
                <dl className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-slate-500">Diễn biến lâm sàng</dt>
                    <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.clinicalProgress)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Cận lâm sàng</dt>
                    <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.paraclinical)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Can thiệp</dt>
                    <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.intervention)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Ghi chú</dt>
                    <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.note)}</dd>
                  </div>
                </dl>
              </div>
            ))}
            {!viewPatientJournal.length && (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
                Chưa có diễn biến.
              </p>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Danh sách bệnh nhân</h2>
          <p className="text-sm text-slate-500">Bảng chỉ xem thông tin bệnh nhân; chọn thêm diễn biến để đưa bệnh nhân vào báo cáo khoa.</p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="w-full md:w-64">
            <span className="field-label">Lọc theo trạng thái</span>
            <select className="field-input h-9" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <button onClick={() => setShowAddForm((current) => !current)} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100">
            <Plus size={16} />
            Thêm bệnh nhân
          </button>
        </div>
      </div>
      {showAddForm && (
        <div className="border-b border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-950">Nhập thông tin bệnh nhân</h3>
            <button onClick={() => setShowAddForm(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Đóng form thêm bệnh nhân">
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="IDBN">
              <input className="field-input" value={patientDraft.idbn} onChange={(event) => updatePatientDraft('idbn', event.target.value)} />
            </Field>
            <Field label="Họ và tên">
              <input className="field-input" value={patientDraft.fullName} onChange={(event) => updatePatientDraft('fullName', event.target.value)} />
            </Field>
            <Field label="Năm sinh">
              <input className="field-input" value={patientDraft.birthYear} onChange={(event) => updatePatientDraft('birthYear', event.target.value)} />
            </Field>
            <Field label="Ngày vào viện">
              <input className="field-input" type="date" value={patientDraft.admissionDate} onChange={(event) => updatePatientDraft('admissionDate', event.target.value)} />
            </Field>
            <Field label="Ngày vào khoa">
              <input className="field-input" type="date" value={patientDraft.departmentDate} onChange={(event) => updatePatientDraft('departmentDate', event.target.value)} />
            </Field>
            <Field label="Khoa chuyển đến">
              <input className="field-input" value={patientDraft.transferTo} onChange={(event) => updatePatientDraft('transferTo', event.target.value)} />
            </Field>
            <Field label="Ngày chuyển đi">
              <input className="field-input" type="date" value={patientDraft.transferOutDate} onChange={(event) => updatePatientDraft('transferOutDate', event.target.value)} />
            </Field>
            <Field label="Trạng thái">
              <select className="field-input" value={patientDraft.outcome} onChange={(event) => updatePatientDraft('outcome', event.target.value)}>
                <option>Đang điều trị</option>
                <option>Xin về</option>
                <option>Tử vong</option>
                <option>Chuyển viện</option>
                <option>Ra viện</option>
              </select>
            </Field>
            <Field label="Ngày ra">
              <input className="field-input" type="date" value={patientDraft.outcomeDate} onChange={(event) => updatePatientDraft('outcomeDate', event.target.value)} />
            </Field>
            <div className="md:col-span-2 xl:col-span-2">
              <Field label="Chẩn đoán">
                <textarea className="field-textarea min-h-[84px]" value={patientDraft.diagnosis} onChange={(event) => updatePatientDraft('diagnosis', event.target.value)} />
              </Field>
            </div>
            <div className="md:col-span-2 xl:col-span-2">
              <Field label="Bệnh sử">
                <textarea className="field-textarea min-h-[84px]" value={patientDraft.history} onChange={(event) => updatePatientDraft('history', event.target.value)} />
              </Field>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={savePatient} className="inline-flex h-9 items-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700">
              <Save size={16} />
              Lưu bệnh nhân
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse border border-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {['IDBN', 'Họ và tên', 'Năm sinh', 'Ngày vào viện', 'Ngày vào khoa', 'Trạng thái', ''].map((heading) => (
                <th key={heading} className="border border-slate-200 px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((patient, index) => (
              <tr key={`${patient.idbn}-${index}`} className="align-top hover:bg-slate-50/70">
                <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">{displayValue(patient.idbn)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-900">{displayValue(patient.fullName)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{displayValue(patient.birthYear)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{displayDate(patient.admissionDate)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{displayDate(patient.departmentDate)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{displayValue(patient.outcome)}</td>
                <td className="border border-slate-200 p-2">
                  <div className="flex min-w-[330px] items-center gap-2">
                    <button onClick={() => openProgressModal(patient)} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100">
                      <Plus size={16} />
                      Thêm diễn biến
                    </button>
                    <button onClick={() => setViewPatient(patient)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Eye size={16} />
                      Xem
                    </button>
                    <button onClick={() => openPatientModal(patient)} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-white px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-50">
                      <Pencil size={16} />
                      Sửa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filteredPatients.length && (
              <tr>
                <td colSpan={7} className="border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  Không có bệnh nhân phù hợp với trạng thái đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {viewPatient && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Thông tin bệnh nhân</h3>
                <p className="text-sm text-slate-500">{viewPatient.idbn} - {viewPatient.fullName}</p>
              </div>
              <button onClick={() => setViewPatient(null)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Đóng modal xem bệnh nhân">
                <X size={16} />
              </button>
            </div>
            <dl className="grid gap-4 p-4 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="font-semibold text-slate-500">IDBN</dt>
                <dd className="text-slate-900">{displayValue(viewPatient.idbn)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Họ và tên</dt>
                <dd className="text-slate-900">{displayValue(viewPatient.fullName)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Năm sinh</dt>
                <dd className="text-slate-900">{displayValue(viewPatient.birthYear)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Ngày vào viện</dt>
                <dd className="text-slate-900">{displayDate(viewPatient.admissionDate)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Ngày vào khoa</dt>
                <dd className="text-slate-900">{displayDate(viewPatient.departmentDate)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Khoa chuyển đến</dt>
                <dd className="text-slate-900">{displayValue(viewPatient.transferTo)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Ngày chuyển đi</dt>
                <dd className="text-slate-900">{displayDate(viewPatient.transferOutDate)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Trạng thái</dt>
                <dd className="text-slate-900">{displayValue(viewPatient.outcome)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Ngày ra</dt>
                <dd className="text-slate-900">{displayDate(viewPatient.outcomeDate)}</dd>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <dt className="font-semibold text-slate-500">Chẩn đoán</dt>
                <dd className="text-slate-900">{displayValue(viewPatient.diagnosis)}</dd>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <dt className="font-semibold text-slate-500">Bệnh sử</dt>
                <dd className="text-slate-900">{displayValue(viewPatient.history)}</dd>
              </div>
            </dl>
            <div className="border-t border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-950">Nhật ký diễn biến bệnh nhân</h4>
              <div className="mt-3 space-y-3">
                {viewPatientJournal.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <p className="font-semibold text-slate-900">{entry.category || 'Theo dõi'}</p>
                      <p className="text-slate-500">{displayDate(entry.progressDate)}</p>
                    </div>
                    <dl className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <dt className="font-semibold text-slate-500">Diễn biến lâm sàng</dt>
                        <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.clinicalProgress)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Cận lâm sàng</dt>
                        <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.paraclinical)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Can thiệp</dt>
                        <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.intervention)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Ghi chú</dt>
                        <dd className="whitespace-pre-wrap text-slate-900">{displayValue(entry.note)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
                {!viewPatientJournal.length && (
                  <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
                    Chưa có diễn biến.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {progressPatient && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Thêm diễn biến</h3>
                <p className="text-sm text-slate-500">{progressPatient.idbn} - {progressPatient.fullName}</p>
              </div>
              <button onClick={() => setProgressPatient(null)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Đóng modal thêm diễn biến">
                <X size={16} />
              </button>
            </div>
            <div className="grid max-h-[65vh] gap-4 overflow-y-auto p-4 md:grid-cols-2">
              <Field label="Ngày diễn biến">
                <input className="field-input" type="date" value={progressDraft.progressDate} onChange={(event) => updateProgressDraft('progressDate', event.target.value)} />
              </Field>
              <Field label="Loại báo cáo">
                <select className="field-input" value={progressDraft.category} onChange={(event) => updateProgressDraft('category', event.target.value)}>
                  <option>Theo dõi</option>
                  <option>Tử vong</option>
                  <option>Nặng xin về</option>
                  <option>Chuyển viện</option>
                  <option>Phẫu thuật cấp cứu</option>
                  <option>Can thiệp cấp cứu</option>
                  <option>Bất thường</option>
                </select>
              </Field>
              <Field label="Diễn biến lâm sàng">
                <textarea className="field-textarea min-h-[120px]" value={progressDraft.clinicalProgress} onChange={(event) => updateProgressDraft('clinicalProgress', event.target.value)} />
              </Field>
              <Field label="Cận lâm sàng">
                <textarea className="field-textarea min-h-[120px]" value={progressDraft.paraclinical} onChange={(event) => updateProgressDraft('paraclinical', event.target.value)} />
              </Field>
              <Field label="Can thiệp">
                <textarea className="field-textarea min-h-[120px]" value={progressDraft.intervention} onChange={(event) => updateProgressDraft('intervention', event.target.value)} />
              </Field>
              <Field label="Ghi chú">
                <textarea className="field-textarea min-h-[120px]" value={progressDraft.note} onChange={(event) => updateProgressDraft('note', event.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
              <button onClick={() => setProgressPatient(null)} className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Hủy
              </button>
              <button onClick={saveProgress} className="inline-flex h-9 items-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700">
                <Save size={16} />
                Lưu diễn biến
              </button>
            </div>
          </div>
        </div>
      )}
      {editPatientIndex !== null && editPatientDraft && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Sửa thông tin bệnh nhân</h3>
                <p className="text-sm text-slate-500">{patients[editPatientIndex]?.idbn} - {patients[editPatientIndex]?.fullName}</p>
              </div>
              <button onClick={() => {
                setEditPatientIndex(null)
                setEditPatientDraft(null)
              }} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Đóng modal sửa bệnh nhân">
                <X size={16} />
              </button>
            </div>
            <div className="grid max-h-[65vh] gap-4 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="IDBN">
                <input className="field-input" value={editPatientDraft.idbn} onChange={(event) => updateEditPatientDraft('idbn', event.target.value)} />
              </Field>
              <Field label="Họ và tên">
                <input className="field-input" value={editPatientDraft.fullName} onChange={(event) => updateEditPatientDraft('fullName', event.target.value)} />
              </Field>
              <Field label="Năm sinh">
                <input className="field-input" value={editPatientDraft.birthYear} onChange={(event) => updateEditPatientDraft('birthYear', event.target.value)} />
              </Field>
              <Field label="Ngày vào viện">
                <input className="field-input" type="date" value={editPatientDraft.admissionDate} onChange={(event) => updateEditPatientDraft('admissionDate', event.target.value)} />
              </Field>
              <Field label="Ngày vào khoa">
                <input className="field-input" type="date" value={editPatientDraft.departmentDate} onChange={(event) => updateEditPatientDraft('departmentDate', event.target.value)} />
              </Field>
              <Field label="Khoa chuyển đến">
                <input className="field-input" value={editPatientDraft.transferTo} onChange={(event) => updateEditPatientDraft('transferTo', event.target.value)} />
              </Field>
              <Field label="Ngày chuyển đi">
                <input className="field-input" type="date" value={editPatientDraft.transferOutDate || ''} onChange={(event) => updateEditPatientDraft('transferOutDate', event.target.value)} />
              </Field>
              <Field label="Trạng thái">
                <select className="field-input" value={editPatientDraft.outcome || 'Đang điều trị'} onChange={(event) => updateEditPatientDraft('outcome', event.target.value)}>
                  <option>Đang điều trị</option>
                  <option>Xin về</option>
                  <option>Tử vong</option>
                  <option>Chuyển viện</option>
                  <option>Ra viện</option>
                </select>
              </Field>
              <Field label="Ngày ra">
                <input className="field-input" type="date" value={editPatientDraft.outcomeDate || ''} onChange={(event) => updateEditPatientDraft('outcomeDate', event.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Chẩn đoán">
                  <textarea className="field-textarea min-h-[96px]" value={editPatientDraft.diagnosis || ''} onChange={(event) => updateEditPatientDraft('diagnosis', event.target.value)} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Bệnh sử">
                  <textarea className="field-textarea min-h-[96px]" value={editPatientDraft.history || ''} onChange={(event) => updateEditPatientDraft('history', event.target.value)} />
                </Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
              <button onClick={() => {
                setEditPatientIndex(null)
                setEditPatientDraft(null)
              }} className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Hủy
              </button>
              <button onClick={saveEditedPatient} className="inline-flex h-9 items-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700">
                <Save size={16} />
                Lưu bệnh nhân
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function UserDirectory({ users, setUsers, onSave, saveState }) {
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [panelMode, setPanelMode] = useState('view')
  const displayValue = (value) => value || '-'
  const displayPassword = (value) => (value ? '••••••' : '-')
  const selectedUser = selectedIndex === null ? null : users[selectedIndex]

  const openUser = (index, mode) => {
    setSelectedIndex(index)
    setPanelMode(mode)
  }

  const addUser = () => {
    setUsers((current) => {
      setSelectedIndex(current.length)
      setPanelMode('edit')
      return [
        ...current,
        {
          fullName: '',
          unit: '',
          username: '',
          password: '',
          role: 'Khoa báo cáo',
        },
      ]
    })
  }

  const updateUser = (field, value) => {
    if (selectedIndex === null) return
    setUsers((current) =>
      current.map((user, index) =>
        index === selectedIndex ? { ...user, [field]: value } : user,
      ),
    )
  }

  const removeUser = (index) => {
    setUsers((current) => current.filter((_, userIndex) => userIndex !== index))
    setSelectedIndex((current) => {
      if (current === null) return null
      if (current === index) return null
      return current > index ? current - 1 : current
    })
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">User</h2>
          <p className="text-sm text-slate-500">Bảng chỉ xem danh sách tài khoản theo họ tên, đơn vị, user, pass và vai trò.</p>
        </div>
        <button onClick={addUser} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100">
          <Plus size={16} />
          Thêm user
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse border border-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {['Họ và tên', 'Đơn vị', 'User', 'Pass', 'Vai trò', ''].map((heading) => (
                <th key={heading} className="border border-slate-200 px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={`${user.username}-${index}`} className="align-top hover:bg-slate-50/70">
                <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">{displayValue(user.fullName)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{displayValue(user.unit)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-900">{displayValue(user.username)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{displayPassword(user.password)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{displayValue(user.role)}</td>
                <td className="border border-slate-200 p-2">
                  <div className="flex min-w-[230px] items-center gap-2">
                    <button onClick={() => openUser(index, 'view')} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Eye size={16} />
                      Xem
                    </button>
                    <button onClick={() => openUser(index, 'edit')} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-white px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-50">
                      <Pencil size={16} />
                      Sửa
                    </button>
                    <button onClick={() => removeUser(index)} className="inline-flex h-9 items-center gap-2 rounded-md border border-red-100 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50">
                      <Trash2 size={16} />
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={6} className="border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  Chưa có user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedUser && (
        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-950">
              {panelMode === 'edit' ? 'Sửa user' : 'Thông tin user'}
            </h3>
            <button onClick={() => setSelectedIndex(null)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Đóng">
              <X size={16} />
            </button>
          </div>
          {panelMode === 'view' ? (
            <dl className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="font-semibold text-slate-500">Họ và tên</dt>
                <dd className="text-slate-900">{displayValue(selectedUser.fullName)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Đơn vị</dt>
                <dd className="text-slate-900">{displayValue(selectedUser.unit)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">User</dt>
                <dd className="text-slate-900">{displayValue(selectedUser.username)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Pass</dt>
                <dd className="text-slate-900">{displayValue(selectedUser.password)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Vai trò</dt>
                <dd className="text-slate-900">{displayValue(selectedUser.role)}</dd>
              </div>
            </dl>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Họ và tên">
                  <input className="field-input" value={selectedUser.fullName} onChange={(event) => updateUser('fullName', event.target.value)} />
                </Field>
                <Field label="Đơn vị">
                  <input className="field-input" value={selectedUser.unit} onChange={(event) => updateUser('unit', event.target.value)} />
                </Field>
                <Field label="User">
                  <input className="field-input" value={selectedUser.username} onChange={(event) => updateUser('username', event.target.value)} />
                </Field>
                <Field label="Pass">
                  <input className="field-input" type="password" value={selectedUser.password} onChange={(event) => updateUser('password', event.target.value)} />
                </Field>
                <Field label="Vai trò">
                  <select className="field-input" value={selectedUser.role} onChange={(event) => updateUser('role', event.target.value)}>
                    <option>Khoa báo cáo</option>
                    <option>Trực khối</option>
                    <option>Trực chỉ huy</option>
                    <option>Quản trị</option>
                  </select>
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={onSave} className="inline-flex h-9 items-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700">
                  <Save size={16} />
                  {saveState === 'saving' ? 'Đang lưu' : 'Lưu user'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function formatDateVN(dateValue) {
  if (!dateValue) return '...............'
  const [year, month, day] = String(dateValue).slice(0, 10).split('-')
  if (!year || !month || !day) return dateValue
  return `${day}/${month}/${year}`
}

function sanitizePdfFileName(value) {
  return value
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function patientAge(patient) {
  const year = Number(patient?.birthYear)
  if (!year) return '........'
  return String(new Date().getFullYear() - year)
}

function DottedLine({ label, value }) {
  return (
    <p>
      - {label}: <span className="font-normal">{value || '................................................................................................'}</span>
    </p>
  )
}

function PatientDetailLines({ rows, patientById, diagnosisLabel = 'Chẩn đoán hiện tại' }) {
  if (!rows.length) {
    return <p className="font-normal">....................................................................................................................</p>
  }

  return rows.map((entry) => {
    const patient = patientById.get(entry.idbn)
    return (
      <div key={entry.id || entry.idbn} className="mb-3 font-normal">
        <p>
          - Họ tên: <span className="font-bold uppercase text-slate-950">{patient?.fullName || '................................................'}</span>;
          tuổi: <span>{patientAge(patient)}</span>; giới: <span>............</span>
        </p>
        <DottedLine label="Ngày vào viện" value={formatDateVN(patient?.admissionDate)} />
        <DottedLine label={diagnosisLabel} value={patient?.diagnosis} />
        <DottedLine label="Diễn biến lâm sàng" value={entry.clinicalProgress} />
        <DottedLine label="Cận lâm sàng" value={entry.paraclinical} />
        <DottedLine label="Can thiệp" value={entry.intervention} />
        <DottedLine label="Tóm tắt bệnh án" value={entry.note || patient?.history} />
      </div>
    )
  })
}

function DepartmentReportDetail({ report, patients, entries }) {
  const patientById = useMemo(() => new Map(patients.map((patient) => [patient.idbn, patient])), [patients])
  const groups = useMemo(() => {
    const result = {
      deaths: [],
      severeDischarge: [],
      emergency: [],
      severeProgress: [],
      watch: [],
    }

    entries
      .filter((entry) => (!report.date || entry.progressDate === report.date) && entry.source !== 'patient-progress')
      .forEach((entry) => {
      if (entry.category === 'Tử vong') result.deaths.push(entry)
      else if (entry.category === 'Nặng xin về') result.severeDischarge.push(entry)
      else if (entry.category === 'Phẫu thuật cấp cứu' || entry.category === 'Can thiệp cấp cứu') result.emergency.push(entry)
      else if (entry.category === 'Bất thường') result.severeProgress.push(entry)
      else result.watch.push(entry)
      })

    return result
  }, [entries, report.date])

  const reportDate = report.date ? new Date(`${report.date}T00:00:00`) : null

  return (
    <section className="report-a4 mx-auto bg-white text-[15px] leading-6 text-black shadow-panel print:shadow-none">
      <div className="text-center font-bold">
        BÁO CÁO TRỰC KHOA {report.department ? report.department.toUpperCase() : '........................'}
      </div>
      <div className="mt-5 font-semibold">
        <p>
          Thời gian trực: ngày {reportDate?.getDate() || '....'} tháng {(reportDate?.getMonth() ?? -1) + 1 || '....'} năm {reportDate?.getFullYear() || '......'}
        </p>
        <p>Kíp trực: - Bác sỹ {report.doctor || '................................'}</p>
        <p className="pl-[70px]">- Điều dưỡng {report.nurse || '................................'}</p>
        <p>Trực Chỉ huy khoa: {report.commander || '........................................................................'}</p>
        <p>Quân số khoa: {report.census || 0} bệnh nhân</p>

        <p>1. Bệnh nhân tử vong <i className="font-normal">(cả giờ hành chính và ngoài giờ)</i>: {groups.deaths.length}</p>
        <PatientDetailLines rows={groups.deaths} patientById={patientById} diagnosisLabel="Chẩn đoán tử vong" />

        <p>2. Bệnh nhân nặng xin về <i className="font-normal">(cả giờ hành chính và ngoài giờ)</i>: {groups.severeDischarge.length}</p>
        <PatientDetailLines rows={groups.severeDischarge} patientById={patientById} diagnosisLabel="Chẩn đoán ra viện" />

        <p>3. Bệnh nhân cấp cứu trong ngày (đối với khoa nội)/Bệnh nhân và phẫu thuật/thủ thuật cấp cứu (đối với khoa ngoại): {groups.emergency.length}</p>
        <p>PT Đặc biệt: ........ ; PTL1: ........; PTL2: ........; PTL3: ........</p>
        <p>Hoặc (TT Đặc biệt: ........ ; TT L1: ....; TT L2: ....; TT L3: ....)</p>
        <p>* Các trường hợp báo cáo chi tiết</p>
        <PatientDetailLines rows={groups.emergency} patientById={patientById} />

        <p>4. Bệnh nhân diễn biến nặng <i className="font-normal">(cả giờ hành chính và ngoài giờ)</i>: {groups.severeProgress.length}</p>
        <PatientDetailLines rows={groups.severeProgress} patientById={patientById} />

        <p>5. Bệnh nhân theo dõi</p>
        <p>* Tổng số bệnh nhân theo dõi báo cáo trực khối: {groups.watch.length}</p>
        <PatientDetailLines rows={groups.watch} patientById={patientById} />

        <p>6. Các nội dung khác <i className="font-normal">(sự cố phần mềm, thiếu thuốc, vật tư, trốn viện ...)</i></p>
        <p className="font-normal">{report.incidents || '....................................................................................................................'}</p>
      </div>
      <div className="mt-8 ml-auto w-56 border border-dashed border-slate-400 py-3 text-center font-bold">
        Bác sĩ trực
        <br />
        <i className="font-normal">(Ký, ghi rõ họ tên)</i>
      </div>
    </section>
  )
}

function DepartmentReportEntries({ patients, entries, setEntries, reportDate }) {
  const patientById = useMemo(() => new Map(patients.map((patient) => [patient.idbn, patient])), [patients])
  const eligiblePatients = useMemo(
    () => patients.filter((patient) => isPatientEligibleForDepartmentReport(patient, reportDate || todayISO())),
    [patients, reportDate],
  )
  const progressByPatientId = useMemo(() => {
    const targetDate = reportDate || todayISO()
    return entries.reduce((result, entry) => {
      if (entry.idbn && entry.progressDate === targetDate && !entry.isReportSelection && !result.has(entry.idbn)) {
        result.set(entry.idbn, entry)
      }
      return result
    }, new Map())
  }, [entries, reportDate])
  const selectablePatients = useMemo(
    () => eligiblePatients.filter((patient) => progressByPatientId.has(patient.idbn)),
    [eligiblePatients, progressByPatientId],
  )
  const reportRows = useMemo(
    () => entries.filter((entry) =>
      entry.progressDate === (reportDate || todayISO())
      && (entry.isReportSelection || (entry.idbn && entry.source !== 'patient-progress')),
    ),
    [entries, reportDate],
  )
  const unselectedPatients = useMemo(() => {
    const selectedIds = new Set(reportRows.map((entry) => entry.idbn))
    return selectablePatients.filter((patient) => !selectedIds.has(patient.idbn))
  }, [reportRows, selectablePatients])

  const updateEntry = (index, field, value) => {
    setEntries((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    )
  }

  const addEntry = () => {
    setEntries((current) => [
      ...current,
      {
        ...reportEntryTemplate,
        id: crypto.randomUUID(),
        idbn: '',
        progressDate: reportDate || todayISO(),
        isReportSelection: true,
      },
    ])
  }

  const selectPatient = (index, idbn) => {
    const selectedProgress = progressByPatientId.get(idbn)
    if (!selectedProgress) {
      updateEntry(index, 'idbn', idbn)
      return
    }
    setEntries((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...selectedProgress,
              id: entry.id || crypto.randomUUID(),
              idbn,
              progressDate: reportDate || todayISO(),
              isReportSelection: true,
              source: 'department-report',
            }
          : entry,
      ),
    )
  }

  const removeEntry = (index) => setEntries((current) => current.filter((_, entryIndex) => entryIndex !== index))

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Danh sách bệnh nhân báo cáo</h2>
          <p className="text-sm text-slate-500">Chọn bệnh nhân đã có diễn biến trong Danh sách BN. Báo cáo tự lấy diễn biến có ngày trùng ngày báo cáo.</p>
        </div>
        <button onClick={addEntry} disabled={!unselectedPatients.length} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400">
          <Plus size={16} />
          Thêm bệnh nhân báo cáo
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {reportRows.map((entry, index) => {
          const patient = patientById.get(entry.idbn)
          const entryIndex = entries.indexOf(entry)
          const selectPatients = patient && !selectablePatients.some((item) => item.idbn === patient.idbn)
            ? [patient, ...selectablePatients]
            : selectablePatients
          return (
            <div key={entry.id || index} className="grid gap-4 p-4 xl:grid-cols-[360px_1fr]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3">
                  <Field label="Chọn bệnh nhân">
                    <select className="field-input" value={entry.idbn} onChange={(event) => selectPatient(entryIndex, event.target.value)}>
                      <option value="">Chọn theo IDBN - Họ tên</option>
                      {selectPatients.map((item) => (
                        <option key={item.idbn} value={item.idbn}>
                          {item.idbn} - {item.fullName}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {patient ? (
                  <dl className="mt-4 space-y-2 text-sm">
                    <div>
                      <dt className="font-semibold text-slate-500">Ngày diễn biến</dt>
                      <dd className="text-slate-900">{formatDateVN(entry.progressDate)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Loại báo cáo</dt>
                      <dd className="text-slate-900">{entry.category || 'Theo dõi'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Chẩn đoán</dt>
                      <dd className="text-slate-900">{patient.diagnosis}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Bệnh sử</dt>
                      <dd className="text-slate-700">{patient.history}</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-slate-600">
                      <span>Vào viện: {formatDateVN(patient.admissionDate)}</span>
                      <span>Vào khoa: {formatDateVN(patient.departmentDate)}</span>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-amber-700">Chưa chọn bệnh nhân từ Danh sách BN.</p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="field-label">Diễn biến lâm sàng</p>
                  <p className="min-h-[104px] rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900">{entry.clinicalProgress || '-'}</p>
                </div>
                <div>
                  <p className="field-label">Cận lâm sàng</p>
                  <p className="min-h-[104px] rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900">{entry.paraclinical || '-'}</p>
                </div>
                <div>
                  <p className="field-label">Can thiệp</p>
                  <p className="min-h-[104px] rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900">{entry.intervention || '-'}</p>
                </div>
                <div>
                  <p className="field-label">Ghi chú</p>
                  <p className="min-h-[104px] rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900">{entry.note || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <button onClick={() => removeEntry(entryIndex)} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                    Xóa khỏi báo cáo
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {!reportRows.length && (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Bấm Thêm bệnh nhân báo cáo để chọn bệnh nhân có diễn biến trùng ngày báo cáo.
          </p>
        )}
      </div>
    </section>
  )
}

function AggregatedPreview({ report, patients, entries }) {
  const patientById = useMemo(() => new Map(patients.map((patient) => [patient.idbn, patient])), [patients])
  const grouped = useMemo(() => {
    return entries.reduce((result, entry) => {
      const key = entry.category || 'Theo dõi'
      result[key] = [...(result[key] || []), entry]
      return result
    }, {})
  }, [entries])

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <h2 className="text-base font-semibold text-slate-950">Bản tổng hợp trực khối và trực chỉ huy</h2>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Báo cáo trực khối {report.block}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Quân số khối ghi nhận từ khoa: <b>{report.census}</b>. Tử vong: <b>{report.deaths}</b>;
            nặng xin về: <b>{report.severeDischarge}</b>; chuyển viện: <b>{report.transfers}</b>.
            Phẫu thuật cấp cứu: <b>{report.emergencySurgery}</b>; can thiệp cấp cứu: <b>{report.emergencyProcedure}</b>.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Báo cáo trực chỉ huy</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            CT/MRI: <b>{report.ctMri}</b>. Bất thường khác: <b>{report.incidents || 'Không ghi nhận'}</b>.
            Dữ liệu bệnh nhân được gom theo IDBN để tổng hợp toàn viện.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grouped).map(([category, rows]) => (
          <div key={category} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900">{category}</p>
            <p className="mt-1 text-sm text-slate-600">{rows.length} bệnh nhân</p>
            <p className="mt-2 text-xs text-slate-500">
              {rows.map((row) => patientById.get(row.idbn)?.fullName || row.idbn).join(', ')}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function PlaceholderView({ title }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">Màn hình này sẽ dùng dữ liệu đã nhập từ báo cáo khoa và danh sách bệnh nhân.</p>
    </section>
  )
}

function CatalogView({ catalogUnits, setCatalogUnits }) {
  const updateUnit = (index, field, value) => {
    setCatalogUnits((current) =>
      current.map((unit, unitIndex) =>
        unitIndex === index ? { ...unit, [field]: value } : unit,
      ),
    )
  }

  const addUnit = () => {
    setCatalogUnits((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        unitCode: '',
        unitName: '',
        blockName: '',
        unitType: 'Khoa',
        isActive: true,
        displayOrder: (current.length + 1) * 10,
      },
    ])
  }

  const removeUnit = (index) => {
    setCatalogUnits((current) => current.filter((_, unitIndex) => unitIndex !== index))
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Danh mục đơn vị</h2>
          <p className="text-sm text-slate-500">Thêm, sửa hoặc xóa đơn vị rồi bấm Lưu để cập nhật Supabase.</p>
        </div>
        <button onClick={addUnit} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100">
          <Plus size={16} />
          Thêm đơn vị
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full border-collapse border border-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {['Mã đơn vị', 'Tên đơn vị', 'Khối', 'Loại', 'Hoạt động', 'Thứ tự', ''].map((heading) => (
                <th key={heading} className="border border-slate-200 px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalogUnits.map((unit, index) => (
              <tr key={unit.id || `${unit.unitCode}-${index}`} className="hover:bg-slate-50/70">
                <td className="border border-slate-200 p-2">
                  <input className="field-input h-9 w-28" value={unit.unitCode} onChange={(event) => updateUnit(index, 'unitCode', event.target.value.toUpperCase())} />
                </td>
                <td className="border border-slate-200 p-2">
                  <input className="field-input h-9 min-w-64" value={unit.unitName} onChange={(event) => updateUnit(index, 'unitName', event.target.value)} />
                </td>
                <td className="border border-slate-200 p-2">
                  <input className="field-input h-9 min-w-40" value={unit.blockName || ''} onChange={(event) => updateUnit(index, 'blockName', event.target.value)} />
                </td>
                <td className="border border-slate-200 p-2">
                  <select className="field-input h-9 min-w-28" value={unit.unitType || 'Khoa'} onChange={(event) => updateUnit(index, 'unitType', event.target.value)}>
                    <option>Khoa</option>
                    <option>Phòng</option>
                    <option>Khối</option>
                    <option>Khác</option>
                  </select>
                </td>
                <td className="border border-slate-200 p-2">
                  <label className="flex h-9 items-center justify-center">
                    <input type="checkbox" checked={unit.isActive ?? true} onChange={(event) => updateUnit(index, 'isActive', event.target.checked)} />
                  </label>
                </td>
                <td className="border border-slate-200 p-2">
                  <input className="field-input h-9 w-24" type="number" value={unit.displayOrder || 0} onChange={(event) => updateUnit(index, 'displayOrder', event.target.value)} />
                </td>
                <td className="border border-slate-200 p-2">
                  <button onClick={() => removeUnit(index)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Xóa đơn vị">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {!catalogUnits.length && (
              <tr>
                <td colSpan={7} className="border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  Chưa có đơn vị trong danh mục.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState('patient-list')
  const [patients, setPatients] = useState(initialPatientDirectory)
  const [reportEntries, setReportEntries] = useState(initialReportEntries)
  const [users, setUsers] = useState(initialUsers)
  const [catalogUnits, setCatalogUnits] = useState(() => buildInitialCatalogUnits())
  const loggedInUser = users[0]
  const initialReport = useMemo(
    () => ({
      ...defaultReportMeta,
      id: 'report-001',
      reporter: loggedInUser?.fullName || defaultReportMeta.reporter,
      ...computeDailyStats(initialPatientDirectory, defaultReportMeta.date),
    }),
    [],
  )
  const [reports, setReports] = useState([initialReport])
  const [report, setReport] = useState(initialReport)
  const [reportMode, setReportMode] = useState('list')
  const [saveState, setSaveState] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadInitialData() {
      if (!isSupabaseConfigured) return

      setMessage('Dang tai du lieu tu Supabase...')

      try {
        const data = await loadAppData()
        if (ignore) return

        if (data.patients.length) {
          setPatients(data.patients)
        }

        if (data.users.length) {
          setUsers(data.users)
        }

        if (data.catalogUnits.length) {
          setCatalogUnits(data.catalogUnits)
        }

        if (data.reports.length) {
          const firstReport = data.reports[0]
          setReports(data.reports)
          setReport(firstReport)

          const entriesResult = await loadReportEntries(firstReport.id)
          if (!ignore) {
            setReportEntries(entriesResult.entries)
          }
        }

        if (!ignore) {
          setMessage('')
        }
      } catch (error) {
        if (!ignore) {
          setMessage(`Loi tai du lieu Supabase: ${error.message}`)
        }
      }
    }

    loadInitialData()

    return () => {
      ignore = true
    }
  }, [])

  const reportEntryPayload = useMemo(() => {
    const patientById = new Map(patients.map((patient) => [patient.idbn, patient]))
    return reportEntries
      .filter((entry) => (!report.date || entry.progressDate === report.date) && entry.source !== 'patient-progress')
      .map((entry) => {
      const patient = patientById.get(entry.idbn) || {}
      return {
        idbn: entry.idbn,
        full_name: patient.fullName || '',
        birth_year: Number(patient.birthYear) || null,
        admission_date: patient.admissionDate || null,
        department_date: patient.departmentDate || null,
        transfer_to: patient.transferTo || '',
        diagnosis: patient.diagnosis || '',
        history: patient.history || '',
        category: entry.category,
        clinical_progress: entry.clinicalProgress,
        progress_date: entry.progressDate || report.date || todayISO(),
        paraclinical: entry.paraclinical,
        intervention: entry.intervention,
        note: entry.note,
      }
      })
  }, [patients, reportEntries, report.date])

  const handleSave = async () => {
    setSaveState('saving')
    setMessage('')
    try {
      const payload = {
        id: isUuid(report.id) ? report.id : crypto.randomUUID(),
        report_date: report.date,
        block_name: report.block,
        department_name: report.department,
        reporter_name: report.reporter,
        doctor_name: report.doctor,
        nurse_name: report.nurse,
        department_commander: report.commander,
        patient_census: report.census,
        admissions: report.admissions || 0,
        transfers_in: report.transfersIn || 0,
        transfers_out: report.transfersOut || 0,
        deaths: report.deaths,
        severe_discharge: report.severeDischarge,
        hospital_transfers: report.hospitalTransfers || 0,
        discharges: report.discharges || 0,
        transfers: report.transfers,
        emergency_surgery: report.emergencySurgery,
        emergency_procedure: report.emergencyProcedure,
        ct_mri: report.ctMri,
        incidents: report.incidents,
        patient_directory: patients,
        users,
        patients: reportEntryPayload,
      }
      const result = await saveDutyReport(payload)
      await saveDepartmentUnits(catalogUnits)
      setReports((current) => {
        const savedReport = { ...report, id: payload.id }
        return current.some((item) => item.id === savedReport.id)
          ? current.map((item) => (item.id === savedReport.id ? savedReport : item))
          : [savedReport, ...current]
      })
      setReport((current) => ({ ...current, id: payload.id }))
      setMessage(result.source === 'supabase' ? 'Đã lưu lên Supabase.' : 'Chưa cấu hình Supabase, đã lưu nháp trong trình duyệt.')
    } catch (error) {
      setMessage(`Lỗi lưu báo cáo: ${error.message}`)
    } finally {
      setSaveState('idle')
    }
  }

  const createReport = () => {
    setReport(buildReportDraft(defaultReportMeta, patients, loggedInUser))
    setReportMode('form')
    setMessage('')
  }

  const openReport = async (reportId, mode = 'form') => {
    const selectedReport = reports.find((item) => item.id === reportId)
    if (!selectedReport) return
    setReport(selectedReport)
    setReportMode(mode)
    setMessage('')

    try {
      const result = await loadReportEntries(reportId)
      if (result.source === 'supabase') {
        setReportEntries(result.entries)
      }
    } catch (error) {
      setMessage(`Loi tai chi tiet bao cao: ${error.message}`)
    }
  }

  const deleteReport = async (reportId) => {
    setMessage('')

    try {
      await deleteDutyReport(reportId)
      setReports((current) => current.filter((item) => item.id !== reportId))
      if (report.id === reportId) {
        setReportMode('list')
      }
      setMessage(isSupabaseConfigured ? 'Da xoa bao cao tren Supabase.' : '')
    } catch (error) {
      setMessage(`Loi xoa bao cao: ${error.message}`)
    }
  }

  const exportReportPdf = () => {
    const previousTitle = document.title
    const fileName = sanitizePdfFileName(`Bao cao truc ${report.date || 'chua co ngay'} - ${report.department || 'chua co khoa'}`)

    document.title = fileName

    const restoreTitle = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restoreTitle)
    }

    window.addEventListener('afterprint', restoreTitle)
    window.print()
  }

  return (
    <AppShell activeMenu={activeMenu} onMenuChange={setActiveMenu}>
      <TopBar report={report} activeMenu={activeMenu} />
      <div className="space-y-5 px-4 py-5 lg:px-8">
        {message && (
          <div className="rounded-md border border-hospital-100 bg-hospital-50 px-4 py-3 text-sm font-medium text-hospital-700">
            {message}
          </div>
        )}
        {activeMenu === 'department-report' && (
          reportMode === 'list' ? (
            <DepartmentReportList
              reports={reports}
              onCreate={createReport}
              onView={(reportId) => openReport(reportId, 'view')}
              onEdit={(reportId) => openReport(reportId, 'form')}
              onDelete={deleteReport}
            />
          ) : (
            <>
              <div className="flex justify-between">
                <button onClick={() => setReportMode('list')} className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Quay lại danh sách
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{reportMode === 'view' ? 'Đang xem báo cáo' : 'Đang sửa báo cáo'}</span>
                  {reportMode === 'view' && (
                    <>
                      <button onClick={exportReportPdf} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <Printer size={16} />
                        Xuất PDF
                      </button>
                      <button onClick={() => setReportMode('form')} className="inline-flex h-9 items-center rounded-md border border-hospital-200 bg-white px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-50">
                        Sửa báo cáo
                      </button>
                    </>
                  )}
                </div>
              </div>
              {reportMode === 'view' ? (
                <div className="print-area">
                  <DepartmentReportDetail report={report} patients={patients} entries={reportEntries} />
                </div>
              ) : (
                <>
                  <ReportMetaForm report={report} setReport={setReport} patients={patients} />
                  <SummaryPanel report={report} setReport={setReport} />
                  <DepartmentReportEntries patients={patients} entries={reportEntries} setEntries={setReportEntries} reportDate={report.date} />
                </>
              )}
            </>
          )
        )}
        {activeMenu === 'patient-list' && (
          <PatientDirectory
            patients={patients}
            setPatients={setPatients}
            reportEntries={reportEntries}
            setReportEntries={setReportEntries}
          />
        )}
        {activeMenu === 'users' && (
          <UserDirectory users={users} setUsers={setUsers} onSave={handleSave} saveState={saveState} />
        )}
        {activeMenu === 'block-report' && <AggregatedPreview report={report} patients={patients} entries={reportEntries} />}
        {activeMenu === 'command-report' && <AggregatedPreview report={report} patients={patients} entries={reportEntries} />}
        {activeMenu === 'catalog' && <CatalogView catalogUnits={catalogUnits} setCatalogUnits={setCatalogUnits} />}
      </div>
    </AppShell>
  )
}
