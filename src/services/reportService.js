import { supabase } from '../lib/supabase'

const REPORTS_TABLE = 'duty_reports'
const PATIENT_DIRECTORY_TABLE = 'patients'
const PATIENTS_TABLE = 'duty_report_patients'
const USERS_TABLE = 'app_users'

export async function saveDutyReport(payload) {
  if (!supabase) {
    localStorage.setItem('bc-truc-draft', JSON.stringify(payload))
    return { data: payload, source: 'local' }
  }

  const { patient_directory: patientDirectory, patients, users, ...report } = payload
  const { data, error } = await supabase
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

    const { error: directoryError } = await supabase
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

    const { error: usersError } = await supabase
      .from(USERS_TABLE)
      .upsert(userRows, { onConflict: 'username' })

    if (usersError) throw usersError
  }

  if (patients?.length) {
    const patientRows = patients.map((patient) => ({
      ...patient,
      report_id: data.id,
    }))

    const { error: patientsError } = await supabase
      .from(PATIENTS_TABLE)
      .upsert(patientRows, { onConflict: 'report_id,idbn' })

    if (patientsError) throw patientsError
  }

  return { data, source: 'supabase' }
}
