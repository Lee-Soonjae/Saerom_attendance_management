import {
  collection, doc, getDocs, onSnapshot, query, where, type Query,
  setDoc, deleteDoc, deleteField, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { AttendanceRecord, ClassInfo, Student } from './types'

function requireDb() {
  if (!db) throw new Error('Firebase가 설정되지 않았습니다 (.env 확인)')
  return db
}

export function subscribeClasses(cb: (classes: ClassInfo[]) => void, onError: (err: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(requireDb(), 'classes'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClassInfo)),
    err => {
      console.error('[firestore] classes 구독 실패:', err)
      onError(err)
    }
  )
}

// setDoc(merge 없이)이라 새 반 만들기와 이름/선생님 수정에 둘 다 쓴다 — 같은 id면 그냥 덮어씀.
export async function addClassDoc(cls: ClassInfo) {
  const { id, ...rest } = cls
  await setDoc(doc(requireDb(), 'classes', id), rest)
}

export async function removeClassDoc(id: string) {
  await deleteDoc(doc(requireDb(), 'classes', id))
}

// classId로 서버에서 필터링해서 구독한다 — 규칙이 이걸 요구하는 건 아니고(완전 오픈),
// 화면이 애초에 반 하나씩만 보여주니 굳이 다른 반 데이터까지 다운로드 안 하려는 최적화.
// classId === 'all'(전체보기)일 때만 where 없이 전체를 구독한다.
function scopedQuery(collectionName: string, classId: string): Query {
  const col = collection(requireDb(), collectionName)
  return classId === 'all' ? col : query(col, where('classId', '==', classId))
}

export function subscribeStudents(classId: string, cb: (students: Student[]) => void, onError: (err: Error) => void): Unsubscribe {
  return onSnapshot(
    scopedQuery('students', classId),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Student)),
    err => {
      console.error('[firestore] students 구독 실패:', err)
      onError(err)
    }
  )
}

export function subscribeAttendance(classId: string, cb: (records: AttendanceRecord[]) => void, onError: (err: Error) => void): Unsubscribe {
  return onSnapshot(
    scopedQuery('attendance', classId),
    snap => cb(snap.docs.map(d => d.data() as AttendanceRecord)),
    err => {
      console.error('[firestore] attendance 구독 실패:', err)
      onError(err)
    }
  )
}

export async function saveAttendanceRecord(record: AttendanceRecord) {
  const docId = `${record.studentId}_${record.date}`
  // Firestore rejects `undefined` field values. absenceReason/note are optional and get
  // cleared to `undefined` locally (e.g. switching back to 출석) — with merge:true that
  // has to be deleteField(), otherwise the stale value would just stay in the document.
  const { absenceReason, note, ...rest } = record
  await setDoc(
    doc(requireDb(), 'attendance', docId),
    { ...rest, absenceReason: absenceReason ?? deleteField(), note: note ?? deleteField() },
    { merge: true }
  )
}

export async function addStudentDoc(student: Student) {
  const { id, ...rest } = student
  await setDoc(doc(requireDb(), 'students', id), rest)
}

export async function removeStudentDoc(id: string) {
  await deleteDoc(doc(requireDb(), 'students', id))
}

// 엑셀 명단 업로드용 — 새 반 여러 개 + 원아 여러 명을 한 번에 씀. Firestore 배치는 500개
// 제한이 있어서 450개씩 나눠 커밋한다(원아가 아주 많은 유치원도 안전하게).
export async function importRosterDoc(newClasses: ClassInfo[], newStudents: Student[]) {
  const database = requireDb()
  const ops: { collection: string; id: string; data: object }[] = [
    ...newClasses.map(cls => {
      const { id, ...rest } = cls
      return { collection: 'classes', id, data: rest }
    }),
    ...newStudents.map(s => {
      const { id, ...rest } = s
      return { collection: 'students', id, data: rest }
    }),
  ]

  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(database)
    ops.slice(i, i + 450).forEach(op => batch.set(doc(database, op.collection, op.id), op.data))
    await batch.commit()
  }
}

// 콘솔에서 clearFirestore() 호출용. classes/students/attendance 3개 컬렉션을 전부 비운다.
export async function clearAllData() {
  const database = requireDb()
  for (const name of ['classes', 'students', 'attendance']) {
    const snap = await getDocs(collection(database, name))
    const batch = writeBatch(database)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

if (import.meta.env.DEV) {
  ;(window as unknown as { clearFirestore: typeof clearAllData }).clearFirestore = clearAllData
}
