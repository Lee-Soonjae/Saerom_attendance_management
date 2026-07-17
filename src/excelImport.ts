import * as XLSX from 'xlsx'

// 템플릿(유치원_명단_템플릿.xlsx) 구조: 1행 = 반 이름(열마다 반 하나), 2행부터 = 그 열의 원아 이름.
// 열마다 원아 수가 달라도 되고(빈 칸은 무시), 1행이 비어있는 열은 통째로 건너뛴다.
export interface ImportedClass {
  name: string
  studentNames: string[]
}

export async function parseRosterFile(file: File): Promise<ImportedClass[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  const header = rows[0] ?? []

  const classes: ImportedClass[] = []
  header.forEach((rawName, colIndex) => {
    const name = String(rawName ?? '').trim()
    if (!name) return

    const studentNames: string[] = []
    for (let r = 1; r < rows.length; r++) {
      const raw = rows[r]?.[colIndex]
      const studentName = String(raw ?? '').trim()
      if (studentName) studentNames.push(studentName)
    }
    classes.push({ name, studentNames })
  })

  return classes
}
