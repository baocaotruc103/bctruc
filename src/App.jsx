import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
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
  saveDutyReport,
} from './services/reportService'

const patientTemplate = {
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
}

const reportEntryTemplate = {
  idbn: '',
  category: 'Theo dõi',
  clinicalProgress: '',
  paraclinical: '',
  intervention: '',
  note: '',
}

const userTemplate = {
  fullName: '',
  unit: '',
  username: '',
  password: '',
  role: 'Khoa báo cáo',
}

const navItems = [
  { key: 'department-report', label: 'Báo cáo khoa', icon: ClipboardCheck },
  { key: 'patient-list', label: 'Danh sách BN', icon: ListChecks },
  { key: 'users', label: 'User', icon: UserCog },
  { key: 'block-report', label: 'Báo cáo khối', icon: Layers },
  { key: 'command-report', label: 'Trực chỉ huy', icon: ShieldCheck },
  { key: 'catalog', label: 'Danh mục', icon: Database },
]

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
  canvas.width = sourceCanvas.width
  canvas.height = sourceCanvas.height

  const sourceContext = sourceCanvas.getContext('2d')
  const targetContext = canvas.getContext('2d', { willReadFrequently: true })
  const image = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const { data } = image

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128))
    const value = contrasted > 165 ? 255 : 0
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
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))

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
    const selected = selection?.width > 12 && selection?.height > 12
      ? selection
      : { x: 0, y: 0, width: frameRect.width, height: frameRect.height }

    const scaleX = image.naturalWidth / frameRect.width
    const scaleY = image.naturalHeight / frameRect.height
    canvas.width = Math.max(1, Math.round(selected.width * scaleX))
    canvas.height = Math.max(1, Math.round(selected.height * scaleY))

    const context = canvas.getContext('2d')
    context.drawImage(
      image,
      selected.x * scaleX,
      selected.y * scaleY,
      selected.width * scaleX,
      selected.height * scaleY,
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

function TopBar({ report, activeMenu, saveState, onSave }) {
  const activeLabel = navItems.find((item) => item.key === activeMenu)?.label || 'Báo cáo khoa'

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-normal text-slate-950">{activeLabel}</h1>
          <p className="text-sm text-slate-500">
            {report.department} · {report.block} · Ngày {report.date}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
            <Activity size={16} className="text-hospital-600" />
            Ca trực đang mở
          </span>
          <span className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
            <Database size={16} className={isSupabaseConfigured ? 'text-hospital-600' : 'text-amber-600'} />
            {isSupabaseConfigured ? 'Supabase đã cấu hình' : 'Lưu nháp local'}
          </span>
          <button
            onClick={onSave}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-hospital-600 px-4 text-sm font-semibold text-white hover:bg-hospital-700"
          >
            <Save size={16} />
            {saveState === 'saving' ? 'Đang lưu' : 'Lưu báo cáo'}
          </button>
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
                <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-900">{item.date}</td>
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

function PatientDirectory({ patients, setPatients }) {
  const updatePatient = (index, field, value) => {
    setPatients((current) =>
      current.map((patient, patientIndex) =>
        patientIndex === index ? { ...patient, [field]: value } : patient,
      ),
    )
  }

  const addPatient = () => setPatients((current) => [...current, patientTemplate])
  const removePatient = (index) => setPatients((current) => current.filter((_, patientIndex) => patientIndex !== index))

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Danh sách bệnh nhân</h2>
          <p className="text-sm text-slate-500">IDBN là khóa định danh dùng để chọn bệnh nhân khi lập báo cáo khoa.</p>
        </div>
        <button onClick={addPatient} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100">
          <Plus size={16} />
          Thêm bệnh nhân
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {['IDBN', 'Họ và tên', 'Năm sinh', 'Ngày vào viện', 'Ngày vào khoa', 'Khoa chuyển đến', 'Ngày chuyển đi', 'Trạng thái', 'Ngày ra', 'Chẩn đoán', 'Bệnh sử', ''].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patients.map((patient, index) => (
              <tr key={`${patient.idbn}-${index}`} className="align-top hover:bg-slate-50/70">
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9" value={patient.idbn} onChange={(event) => updatePatient(index, 'idbn', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9" value={patient.fullName} onChange={(event) => updatePatient(index, 'fullName', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9 w-24" value={patient.birthYear} onChange={(event) => updatePatient(index, 'birthYear', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9" type="date" value={patient.admissionDate} onChange={(event) => updatePatient(index, 'admissionDate', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9" type="date" value={patient.departmentDate} onChange={(event) => updatePatient(index, 'departmentDate', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9" value={patient.transferTo} onChange={(event) => updatePatient(index, 'transferTo', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9" type="date" value={patient.transferOutDate || ''} onChange={(event) => updatePatient(index, 'transferOutDate', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2">
                  <select className="field-input h-9" value={patient.outcome || 'Đang điều trị'} onChange={(event) => updatePatient(index, 'outcome', event.target.value)}>
                    <option>Đang điều trị</option>
                    <option>Xin về</option>
                    <option>Tử vong</option>
                    <option>Chuyển viện</option>
                    <option>Ra viện</option>
                  </select>
                </td>
                <td className="border-b border-slate-100 p-2"><input className="field-input h-9" type="date" value={patient.outcomeDate || ''} onChange={(event) => updatePatient(index, 'outcomeDate', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><textarea className="field-textarea min-h-[64px]" value={patient.diagnosis} onChange={(event) => updatePatient(index, 'diagnosis', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2"><textarea className="field-textarea min-h-[64px]" value={patient.history} onChange={(event) => updatePatient(index, 'history', event.target.value)} /></td>
                <td className="border-b border-slate-100 p-2">
                  <button onClick={() => removePatient(index)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Xóa bệnh nhân">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function UserDirectory({ users, setUsers }) {
  const updateUser = (index, field, value) => {
    setUsers((current) =>
      current.map((user, userIndex) =>
        userIndex === index ? { ...user, [field]: value } : user,
      ),
    )
  }

  const addUser = () => setUsers((current) => [...current, userTemplate])
  const removeUser = (index) => setUsers((current) => current.filter((_, userIndex) => userIndex !== index))

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">User</h2>
          <p className="text-sm text-slate-500">Danh sách tài khoản theo họ tên, đơn vị, user, pass và vai trò.</p>
        </div>
        <button onClick={addUser} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100">
          <Plus size={16} />
          Thêm user
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {['Họ và tên', 'Đơn vị', 'User', 'Pass', 'Vai trò', ''].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={`${user.username}-${index}`} className="align-top hover:bg-slate-50/70">
                <td className="border-b border-slate-100 p-2">
                  <input className="field-input h-9" value={user.fullName} onChange={(event) => updateUser(index, 'fullName', event.target.value)} />
                </td>
                <td className="border-b border-slate-100 p-2">
                  <input className="field-input h-9" value={user.unit} onChange={(event) => updateUser(index, 'unit', event.target.value)} />
                </td>
                <td className="border-b border-slate-100 p-2">
                  <input className="field-input h-9" value={user.username} onChange={(event) => updateUser(index, 'username', event.target.value)} />
                </td>
                <td className="border-b border-slate-100 p-2">
                  <input className="field-input h-9" type="password" value={user.password} onChange={(event) => updateUser(index, 'password', event.target.value)} />
                </td>
                <td className="border-b border-slate-100 p-2">
                  <select className="field-input h-9" value={user.role} onChange={(event) => updateUser(index, 'role', event.target.value)}>
                    <option>Khoa báo cáo</option>
                    <option>Trực khối</option>
                    <option>Trực chỉ huy</option>
                    <option>Quản trị</option>
                  </select>
                </td>
                <td className="border-b border-slate-100 p-2">
                  <button onClick={() => removeUser(index)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Xóa user">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatDateVN(dateValue) {
  if (!dateValue) return '...............'
  const [year, month, day] = dateValue.split('-')
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

    entries.forEach((entry) => {
      if (entry.category === 'Tử vong') result.deaths.push(entry)
      else if (entry.category === 'Nặng xin về') result.severeDischarge.push(entry)
      else if (entry.category === 'Phẫu thuật cấp cứu' || entry.category === 'Can thiệp cấp cứu') result.emergency.push(entry)
      else if (entry.category === 'Bất thường') result.severeProgress.push(entry)
      else result.watch.push(entry)
    })

    return result
  }, [entries])

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

function DepartmentReportEntries({ patients, entries, setEntries }) {
  const patientById = useMemo(() => new Map(patients.map((patient) => [patient.idbn, patient])), [patients])

  const updateEntry = (index, field, value) => {
    setEntries((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    )
  }

  const addEntry = () =>
    setEntries((current) => [
      ...current,
      { ...reportEntryTemplate, id: crypto.randomUUID(), idbn: patients[0]?.idbn || '' },
    ])

  const removeEntry = (index) => setEntries((current) => current.filter((_, entryIndex) => entryIndex !== index))

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Danh sách bệnh nhân báo cáo</h2>
          <p className="text-sm text-slate-500">Chọn bệnh nhân từ Danh sách BN, sau đó ghi diễn biến lâm sàng, cận lâm sàng, can thiệp và ghi chú.</p>
        </div>
        <button onClick={addEntry} className="inline-flex h-9 items-center gap-2 rounded-md border border-hospital-200 bg-hospital-50 px-3 text-sm font-semibold text-hospital-700 hover:bg-hospital-100">
          <Plus size={16} />
          Thêm bệnh nhân báo cáo
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {entries.map((entry, index) => {
          const patient = patientById.get(entry.idbn)
          return (
            <div key={entry.id || index} className="grid gap-4 p-4 xl:grid-cols-[360px_1fr]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3">
                  <Field label="Chọn bệnh nhân">
                    <select className="field-input" value={entry.idbn} onChange={(event) => updateEntry(index, 'idbn', event.target.value)}>
                      <option value="">Chọn theo IDBN - Họ tên</option>
                      {patients.map((item) => (
                        <option key={item.idbn} value={item.idbn}>
                          {item.idbn} - {item.fullName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Loại báo cáo">
                    <select className="field-input" value={entry.category} onChange={(event) => updateEntry(index, 'category', event.target.value)}>
                      <option>Theo dõi</option>
                      <option>Tử vong</option>
                      <option>Nặng xin về</option>
                      <option>Chuyển viện</option>
                      <option>Phẫu thuật cấp cứu</option>
                      <option>Can thiệp cấp cứu</option>
                      <option>Bất thường</option>
                    </select>
                  </Field>
                </div>
                {patient ? (
                  <dl className="mt-4 space-y-2 text-sm">
                    <div>
                      <dt className="font-semibold text-slate-500">Chẩn đoán</dt>
                      <dd className="text-slate-900">{patient.diagnosis}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Bệnh sử</dt>
                      <dd className="text-slate-700">{patient.history}</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-slate-600">
                      <span>Vào viện: {patient.admissionDate}</span>
                      <span>Vào khoa: {patient.departmentDate}</span>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-amber-700">Chưa chọn bệnh nhân từ Danh sách BN.</p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <CaptureTextarea
                  label="Diễn biến lâm sàng"
                  value={entry.clinicalProgress}
                  onChange={(value) => updateEntry(index, 'clinicalProgress', value)}
                />
                <CaptureTextarea
                  label="Cận lâm sàng"
                  value={entry.paraclinical}
                  onChange={(value) => updateEntry(index, 'paraclinical', value)}
                />
                <Field label="Can thiệp">
                  <textarea className="field-textarea min-h-[104px]" value={entry.intervention} onChange={(event) => updateEntry(index, 'intervention', event.target.value)} />
                </Field>
                <Field label="Ghi chú">
                  <textarea className="field-textarea min-h-[104px]" value={entry.note} onChange={(event) => updateEntry(index, 'note', event.target.value)} />
                </Field>
                <div className="md:col-span-2">
                  <button onClick={() => removeEntry(index)} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                    Xóa khỏi báo cáo
                  </button>
                </div>
              </div>
            </div>
          )
        })}
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

export default function App() {
  const [activeMenu, setActiveMenu] = useState('department-report')
  const [patients, setPatients] = useState(initialPatientDirectory)
  const [reportEntries, setReportEntries] = useState(initialReportEntries)
  const [users, setUsers] = useState(initialUsers)
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
          setMessage(data.source === 'supabase' ? 'Da ket noi Supabase.' : '')
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
    return reportEntries.map((entry) => {
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
        paraclinical: entry.paraclinical,
        intervention: entry.intervention,
        note: entry.note,
      }
    })
  }, [patients, reportEntries])

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
    setReportEntries([])
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
      <TopBar report={report} activeMenu={activeMenu} saveState={saveState} onSave={handleSave} />
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
                  <DepartmentReportEntries patients={patients} entries={reportEntries} setEntries={setReportEntries} />
                </>
              )}
            </>
          )
        )}
        {activeMenu === 'patient-list' && (
          <PatientDirectory patients={patients} setPatients={setPatients} />
        )}
        {activeMenu === 'users' && (
          <UserDirectory users={users} setUsers={setUsers} />
        )}
        {activeMenu === 'block-report' && <AggregatedPreview report={report} patients={patients} entries={reportEntries} />}
        {activeMenu === 'command-report' && <AggregatedPreview report={report} patients={patients} entries={reportEntries} />}
        {activeMenu === 'catalog' && <PlaceholderView title="Danh mục" />}
      </div>
    </AppShell>
  )
}
