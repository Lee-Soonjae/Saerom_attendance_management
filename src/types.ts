export type AttendanceStatus = 'present' | 'absent' | 'late' | 'pending'

export type AbsenceReason =
  | 'sick'
  | 'family_trip'
  | 'personal'
  | 'no_contact'
  | 'other'

export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  sick: '병결',
  family_trip: '가족여행',
  personal: '개인사정',
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
