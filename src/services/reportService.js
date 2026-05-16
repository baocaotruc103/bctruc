import { supabaseClient } from '../lib/supabase'

const REPORTS_TABLE = 'duty_reports'
const PATIENT_DIRECTORY_TABLE = 'patients'
const PATIENTS_TABLE = 'duty_report_patients'
const USERS_TABLE = 'app_users'

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

function mapReportEntryFromDb(row) {
  return {
    id: row.id,
    idbn: row.idbn || '',
    category: row.category || 'Theo doi',
    clinicalProgress: row.clinical_progress || '',
    paraclinical: row.paraclinical || '',
    intervention: row.intervention || '',
    note: row.note || '',
  }
}

export async function loadAppData() {
  if (!supabaseClient) {
    return { source: 'local', reports: [], patients: [], users: [] }
  }

  const [reportsResult, patientsResult, usersResult] = await Promise.all([
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
  ])

  if (reportsResult.error) throw reportsResult.error
  if (patientsResult.error) throw patientsResult.error
  if (usersResult.error) throw usersResult.error

  return {
    source: 'supabase',
    reports: reportsResult.data.map(mapReportFromDb),
    patients: patientsResult.data.map(mapPatientFromDb),
    users: usersResult.data.map(mapUserFromDb),
  }
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

export async function deleteDutyReport(reportId) {
  if (!supabaseClient || !reportId) {
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
