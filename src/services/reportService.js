import { supabaseClient } from '../lib/supabase'

const REPORTS_TABLE = 'duty_reports'
const PATIENT_DIRECTORY_TABLE = 'patients'
const PATIENTS_TABLE = 'duty_report_patients'
const PATIENT_PROGRESS_TABLE = 'patient_progress'
const USERS_TABLE = 'app_users'
const DEPARTMENT_UNITS_TABLE = 'department_units'

function mapReportFromDb(row) {
  return {
    id: row.id,
    date: row.report_date || '',
    block: row.block_name || '',
    department: row.department_name || '',
    reporter: row.reporter_name || '',
    doctor: row.doctor_name || '',
    nurse: row.nurse_name || '',
    commander: row.department_commander || '',
    census: row.patient_census || 0,
    admissions: row.admissions || 0,
    transfersIn: row.transfers_in || 0,
    transfersOut: row.transfers_out || 0,
    deaths: row.deaths || 0,
    severeDischarge: row.severe_discharge || 0,
    hospitalTransfers: row.hospital_transfers || 0,
    discharges: row.discharges || 0,
    transfers: row.transfers || 0,
    emergencySurgery: row.emergency_surgery || 0,
    emergencyProcedure: row.emergency_procedure || 0,
    ctMri: row.ct_mri || 0,
    incidents: row.incidents || '',
  }
}

function mapPatientFromDb(row) {
  return {
    idbn: row.idbn || '',
    fullName: row.full_name || '',
    birthYear: row.birth_year ? String(row.birth_year) : '',
    admissionDate: row.admission_date || '',
    departmentDate: row.department_date || '',
    transferTo: row.transfer_to || '',
    transferOutDate: row.transfer_out_date || '',
    outcome: row.outcome || 'Dang dieu tri',
    outcomeDate: row.outcome_date || '',
    diagnosis: row.diagnosis || '',
    history: row.history || '',
  }
}

function mapUserFromDb(row) {
  return {
    fullName: row.full_name || '',
    unit: row.unit || '',
    username: row.username || '',
    password: row.password || '',
    role: row.role || '',
  }
}

function mapDepartmentUnitFromDb(row) {
  return {
    id: row.id,
    unitCode: row.unit_code || '',
    unitName: row.unit_name || '',
    blockName: row.block_name || '',
    unitType: row.unit_type || 'Khoa',
    isActive: row.is_active ?? true,
    displayOrder: row.display_order || 0,
  }
}

function mapReportEntryFromDb(row) {
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls
    : row.image_url
      ? [row.image_url]
      : []

  return {
    id: row.id,
    idbn: row.idbn || '',
    category: row.category || 'Theo doi',
    progressDate: row.progress_date || '',
    clinicalProgress: row.clinical_progress || '',
    paraclinical: row.paraclinical || '',
    intervention: row.intervention || '',
    imageUrl: row.image_url || '',
    imageUrls,
    note: row.note || '',
  }
}

function mapPatientProgressFromDb(row) {
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls
    : row.image_url
      ? [row.image_url]
      : []

  return {
    id: row.id,
    idbn: row.idbn || '',
    category: row.category || 'Theo dõi',
    progressDate: row.progress_date || '',
    clinicalProgress: row.clinical_progress || '',
    paraclinical: row.paraclinical || '',
    intervention: row.intervention || '',
    imageUrl: row.image_url || '',
    imageUrls,
    note: row.note || '',
    source: 'patient-progress',
  }
}

export async function loadAppData() {
  if (!supabaseClient) {
    return { source: 'local', reports: [], patients: [], users: [], catalogUnits: [], patientProgress: [] }
  }

  const [reportsResult, patientsResult, usersResult, departmentUnitsResult, patientProgressResult] = await Promise.all([
    supabaseClient
      .from(REPORTS_TABLE)
      .select('*')
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabaseClient
      .from(PATIENT_DIRECTORY_TABLE)
      .select('*')
      .order('idbn', { ascending: true }),
    supabaseClient
      .from(USERS_TABLE)
      .select('*')
      .order('full_name', { ascending: true }),
    supabaseClient
      .from(DEPARTMENT_UNITS_TABLE)
      .select('*')
      .order('display_order', { ascending: true })
      .order('unit_name', { ascending: true }),
    supabaseClient
      .from(PATIENT_PROGRESS_TABLE)
      .select('*')
      .order('progress_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (reportsResult.error) throw reportsResult.error
  if (patientsResult.error) throw patientsResult.error
  if (usersResult.error) throw usersResult.error
  if (departmentUnitsResult.error) throw departmentUnitsResult.error
  if (patientProgressResult.error) throw patientProgressResult.error

  return {
    source: 'supabase',
    reports: reportsResult.data.map(mapReportFromDb),
    patients: patientsResult.data.map(mapPatientFromDb),
    users: usersResult.data.map(mapUserFromDb),
    catalogUnits: departmentUnitsResult.data.map(mapDepartmentUnitFromDb),
    patientProgress: patientProgressResult.data.map(mapPatientProgressFromDb),
  }
}

export async function saveDepartmentUnits(units) {
  const normalizedUnits = (units || [])
    .filter((unit) => unit.unitCode && unit.unitName)
    .map((unit, index) => ({
      unit_code: unit.unitCode,
      unit_name: unit.unitName,
      block_name: unit.blockName || '',
      unit_type: unit.unitType || 'Khoa',
      is_active: unit.isActive ?? true,
      display_order: Number(unit.displayOrder) || (index + 1) * 10,
      updated_at: new Date().toISOString(),
    }))

  if (!supabaseClient) {
    localStorage.setItem('bc-truc-department-units', JSON.stringify(units || []))
    return { source: 'local' }
  }

  const { data: existingRows, error: existingError } = await supabaseClient
    .from(DEPARTMENT_UNITS_TABLE)
    .select('unit_code')

  if (existingError) throw existingError

  const nextCodes = new Set(normalizedUnits.map((unit) => unit.unit_code))
  const removedCodes = (existingRows || [])
    .map((unit) => unit.unit_code)
    .filter((unitCode) => !nextCodes.has(unitCode))

  if (removedCodes.length) {
    const { error: deleteError } = await supabaseClient
      .from(DEPARTMENT_UNITS_TABLE)
      .delete()
      .in('unit_code', removedCodes)

    if (deleteError) throw deleteError
  }

  if (normalizedUnits.length) {
    const { error: upsertError } = await supabaseClient
      .from(DEPARTMENT_UNITS_TABLE)
      .upsert(normalizedUnits, { onConflict: 'unit_code' })

    if (upsertError) throw upsertError
  }

  return { source: 'supabase' }
}

export async function loadReportEntries(reportId) {
  if (!supabaseClient || !reportId) {
    return { source: 'local', entries: [] }
  }

  const { data, error } = await supabaseClient
    .from(PATIENTS_TABLE)
    .select('*')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return { source: 'supabase', entries: data.map(mapReportEntryFromDb) }
}

export async function upsertPatientDirectory(patient) {
  if (!supabaseClient || !patient) {
    // noop for local mode
    return { source: 'local' }
  }
  function safeIso(value) {
    if (!value) return null
    // accept already ISO yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value
    // try parse
    const d = new Date(String(value))
    if (Number.isNaN(d.getTime())) return null
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const row = {
    idbn: patient.idbn,
    full_name: patient.fullName,
    birth_year: Number(patient.birthYear) || null,
    admission_date: safeIso(patient.admissionDate) || null,
    department_date: safeIso(patient.departmentDate) || null,
    transfer_to: patient.transferTo || '',
    transfer_out_date: patient.transferOutDate || null,
    outcome: patient.outcome,
    outcome_date: patient.outcomeDate || null,
    diagnosis: patient.diagnosis || '',
    history: patient.history || '',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabaseClient
    .from(PATIENT_DIRECTORY_TABLE)
    .upsert([row], { onConflict: 'idbn' })

  if (error) throw error
  return { source: 'supabase' }
}

export async function upsertPatientProgressEntry(entry) {
  if (!supabaseClient || !entry) {
    return { source: 'local' }
  }

  const imageUrls = Array.isArray(entry.imageUrls)
    ? entry.imageUrls
    : entry.imageUrl
      ? [entry.imageUrl]
      : []

  const row = {
    id: entry.id,
    idbn: entry.idbn,
    progress_date: entry.progressDate || null,
    category: entry.category || 'Theo dõi',
    clinical_progress: entry.clinicalProgress || '',
    paraclinical: entry.paraclinical || '',
    intervention: entry.intervention || '',
    image_url: imageUrls[0] || '',
    image_urls: imageUrls,
    note: entry.note || '',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabaseClient
    .from(PATIENT_PROGRESS_TABLE)
    .upsert([row], { onConflict: 'id' })

  if (error) throw error
  return { source: 'supabase' }
}

export async function deleteDutyReport(reportId) {
  if (!supabaseClient || !reportId) {
    return { source: 'local' }
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)
  if (!isUuid) {
    return { source: 'local' }
  }

  const { error } = await supabaseClient
    .from(REPORTS_TABLE)
    .delete()
    .eq('id', reportId)

  if (error) throw error

  return { source: 'supabase' }
}

export async function saveDutyReport(payload) {
  if (!supabaseClient) {
    localStorage.setItem('bc-truc-draft', JSON.stringify(payload))
    return { data: payload, source: 'local' }
  }

  const { patient_directory: patientDirectory, patients, users, ...report } = payload
  const { data, error } = await supabaseClient
    .from(REPORTS_TABLE)
    .upsert(report, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw error

  if (patientDirectory?.length) {
    const directoryRows = patientDirectory
      .filter((patient) => patient.idbn)
      .map((patient) => ({
        idbn: patient.idbn,
        full_name: patient.fullName,
        birth_year: Number(patient.birthYear) || null,
        admission_date: patient.admissionDate || null,
        department_date: patient.departmentDate || null,
        transfer_to: patient.transferTo,
        transfer_out_date: patient.transferOutDate || null,
        outcome: patient.outcome,
        outcome_date: patient.outcomeDate || null,
        diagnosis: patient.diagnosis,
        history: patient.history,
      }))

    const { error: directoryError } = await supabaseClient
      .from(PATIENT_DIRECTORY_TABLE)
      .upsert(directoryRows, { onConflict: 'idbn' })

    if (directoryError) throw directoryError
  }

  if (users?.length) {
    const userRows = users
      .filter((user) => user.username)
      .map((user) => ({
        full_name: user.fullName,
        unit: user.unit,
        username: user.username,
        password: user.password,
        role: user.role,
      }))

    const { error: usersError } = await supabaseClient
      .from(USERS_TABLE)
      .upsert(userRows, { onConflict: 'username' })

    if (usersError) throw usersError
  }

  const nextUsernames = new Set((users || []).map((user) => user.username).filter(Boolean))
  const { data: existingUsers, error: existingUsersError } = await supabaseClient
    .from(USERS_TABLE)
    .select('username')

  if (existingUsersError) throw existingUsersError

  const removedUsernames = (existingUsers || [])
    .map((user) => user.username)
    .filter((username) => !nextUsernames.has(username))

  if (removedUsernames.length) {
    const { error: deleteUsersError } = await supabaseClient
      .from(USERS_TABLE)
      .delete()
      .in('username', removedUsernames)

    if (deleteUsersError) throw deleteUsersError
  }

  const { error: deletePatientsError } = await supabaseClient
    .from(PATIENTS_TABLE)
    .delete()
    .eq('report_id', data.id)

  if (deletePatientsError) throw deletePatientsError

  if (patients?.length) {
    const patientRows = patients
      .filter((patient) => patient.idbn)
      .map((patient) => ({
        ...patient,
        report_id: data.id,
      }))

    if (patientRows.length) {
      const { error: patientsError } = await supabaseClient
        .from(PATIENTS_TABLE)
        .insert(patientRows)

      if (patientsError) throw patientsError
    }
  }

  return { data, source: 'supabase' }
}
