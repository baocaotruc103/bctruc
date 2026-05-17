export const departments = [
  'A01 Nội tim mạch',
  'A02 Hồi sức cấp cứu',
  'B01 Ngoại tổng hợp',
  'B03 Chấn thương chỉnh hình',
  'C01 Truyền nhiễm',
]

export const initialPatientDirectory = [
  {
    idbn: '240515001',
    fullName: 'Nguyễn Văn Minh',
    birthYear: '1958',
    admissionDate: '2026-05-12',
    departmentDate: '2026-05-13',
    transferTo: 'A02 Hồi sức cấp cứu',
    transferOutDate: '',
    outcome: 'Đang điều trị',
    outcomeDate: '',
    diagnosis: 'Viêm phổi nặng, suy hô hấp',
    history: 'Sốt 3 ngày, khó thở tăng, nền đái tháo đường type 2.',
  },
  {
    idbn: '240515014',
    fullName: 'Trần Thị Hoa',
    birthYear: '1971',
    admissionDate: '2026-05-14',
    departmentDate: '2026-05-14',
    transferTo: 'B01 Ngoại tổng hợp',
    transferOutDate: '',
    outcome: 'Ra viện',
    outcomeDate: '2026-05-15',
    diagnosis: 'Viêm ruột thừa cấp',
    history: 'Đau hố chậu phải 12 giờ, đã phẫu thuật cấp cứu trong đêm.',
  },
  {
    idbn: '240515022',
    fullName: 'Lê Quốc Hưng',
    birthYear: '1964',
    admissionDate: '2026-05-15',
    departmentDate: '2026-05-15',
    transferTo: 'A01 Nội tim mạch',
    transferOutDate: '2026-05-15',
    outcome: 'Chuyển viện',
    outcomeDate: '2026-05-15',
    diagnosis: 'Suy tim mất bù',
    history: 'Khó thở khi nằm, phù hai chân, tiền sử tăng huyết áp.',
  },
]

export const initialReportEntries = [
  {
    id: 'entry-001',
    idbn: '240515001',
    progressDate: '2026-05-15',
    category: 'Theo dõi',
    clinicalProgress: 'SpO2 dao động 92-94% với oxy gọng kính 3 lít/phút.',
    paraclinical: 'BC 15 G/L, CRP tăng, X-quang phổi mờ đáy phải.',
    intervention: 'Kháng sinh theo phác đồ, khí dung, theo dõi SpO2 mỗi 2 giờ.',
    note: 'Báo trực khối nếu tăng nhu cầu oxy.',
  },
]

export const initialUsers = [
  {
    fullName: 'Nguyễn An',
    unit: 'A01 Nội tim mạch',
    username: 'nguyenan',
    password: '123456',
    role: 'Khoa báo cáo',
  },
  {
    fullName: 'Phạm Quang',
    unit: 'Phòng Kế hoạch tổng hợp',
    username: 'phamquang',
    password: '123456',
    role: 'Trực chỉ huy',
  },
  {
    fullName: 'Phạm Đức Thắng',
    unit: 'A01 Nội tim mạch',
    username: 'pdthang',
    password: '123456',
    role: 'Khoa báo cáo',
  },
]

export const defaultReportMeta = {
  date: new Date().toISOString().slice(0, 10),
  block: 'Khối Nội',
  department: 'A01 Nội tim mạch',
  reporter: 'Nguyễn An',
  doctor: 'BS Nguyễn An',
  nurse: 'ĐD Lê Bình',
  commander: 'BSCKII Phạm Quang',
  census: 42,
  admissions: 0,
  transfersIn: 0,
  transfersOut: 0,
  deaths: 0,
  severeDischarge: 1,
  hospitalTransfers: 0,
  discharges: 0,
  transfers: 2,
  emergencySurgery: 1,
  emergencyProcedure: 3,
  ctMri: 5,
  incidents: 'Thiếu 02 lọ thuốc vận mạch, đã báo dược trực.',
}
