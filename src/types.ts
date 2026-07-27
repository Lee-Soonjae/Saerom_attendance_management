export type AttendanceStatus = 'present' | 'absent' | 'late' | 'pending'

export type AbsenceReason =
  | 'home_care'
  | 'sick'
  | 'overseas_trip'
  | 'jeju_trip'
  | 'no_contact'
  | 'other'

export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  home_care: '가정돌봄',
  sick: '병결',
  overseas_trip: '해외여행',
  jeju_trip: '제주여행',
  no_contact: '연락안됨',
  other: '기타',
}

export type Gender = 'M' | 'F' | 'unspecified'

export interface Student {
  id: string
  name: string
  classId: string
  gender: Gender
  birthDate: string
  parentPhone: string
}

export interface AttendanceRecord {
  studentId: string
  classId: string
  date: string
  status: AttendanceStatus
  absenceReason?: AbsenceReason
  note?: string
  updatedAt: string
}

export interface ClassInfo {
  id: string
  name: string
  teacherName: string
  color: string
}

export type Screen =
  | 'login'
  | 'dashboard'
  | 'attendance'
  | 'roster'
  | 'statistics'
  | 'absence-tracking'
  | 'export'
