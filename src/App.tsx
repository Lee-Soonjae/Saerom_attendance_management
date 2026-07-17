import { useState, useRef, useEffect, Fragment } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ClipboardList,
  PenLine,
  Users,
  BarChart3,
  Search,
  Download,
  AlertTriangle,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  Sun,
  Menu,
  LayoutGrid,
  Settings,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { firebaseEnabled } from "./firebase";
import {
  subscribeClasses,
  subscribeStudents,
  subscribeAttendance,
  saveAttendanceRecord,
  addStudentDoc,
  removeStudentDoc,
  addClassDoc,
  removeClassDoc,
  importRosterDoc,
} from "./firestoreApi";
import type {
  Screen,
  AttendanceRecord,
  AttendanceStatus,
  AbsenceReason,
  Student,
  ClassInfo,
  Gender,
} from "./types";
import { ABSENCE_REASON_LABELS } from "./types";
import { parseRosterFile, type ImportedClass } from "./excelImport";

const ACTIVE_CLASS_KEY = "attendance-app:activeClassId";

const today = new Date().toISOString().split("T")[0];

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(from);
  const end = new Date(to);
  while (cursor <= end) {
    dates.push(cursor.toISOString().split("T")[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function genderLabel(gender: Gender): string {
  return gender === "M" ? "남" : gender === "F" ? "여" : "미지정";
}

// ── Sidebar nav ────────────────────────────────────────────────────────────────
const NAV_ITEMS: {
  screen: Screen;
  label: string;
  icon: LucideIcon;
  editOnly?: boolean;
}[] = [
  { screen: "dashboard", label: "오늘 현황", icon: ClipboardList },
  { screen: "attendance", label: "출석 입력", icon: PenLine, editOnly: true },
  { screen: "roster", label: "명단 관리", icon: Users, editOnly: true },
  { screen: "statistics", label: "통계", icon: BarChart3 },
  { screen: "absence-tracking", label: "결석 추적", icon: Search },
  { screen: "export", label: "내보내기", icon: Download },
];

// 실제 반이 아니라 "모든 반을 읽기 전용으로 보기" 모드를 나타내는 가짜 ClassInfo.
const ALL_CLASS: ClassInfo = {
  id: "all",
  name: "전체보기",
  teacherName: "",
  color: "#64748B",
};

// 새 반을 추가할 때 순서대로 돌려쓰는 색상 팔레트.
const CLASS_COLOR_PALETTE = [
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#10B981",
  "#3B82F6",
  "#EF4444",
  "#14B8A6",
  "#F97316",
];

// ── Login screen ───────────────────────────────────────────────────────────────
type ImportStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; classCount: number; studentCount: number }
  | { type: "error"; message: string };

function LoginScreen({
  classes,
  syncError,
  onLogin,
  onAddClass,
  onUpdateClass,
  onDeleteClass,
  onImportRoster,
}: {
  classes: ClassInfo[];
  syncError: string | null;
  onLogin: (classId: string) => void;
  onAddClass: (cls: ClassInfo) => void;
  onUpdateClass: (cls: ClassInfo) => void;
  onDeleteClass: (id: string) => void;
  onImportRoster: (imported: ImportedClass[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", teacherName: "" });
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [editForm, setEditForm] = useState({ name: "", teacherName: "" });
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    type: "idle",
  });
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 골라도 onChange가 또 뜨도록
    if (!file) return;

    setImportStatus({ type: "loading" });
    try {
      const imported = await parseRosterFile(file);
      if (imported.length === 0) {
        setImportStatus({
          type: "error",
          message:
            "반 정보를 못 찾았어요. 1행에 반 이름이 있는지 확인해주세요.",
        });
        return;
      }
      const studentCount = imported.reduce(
        (sum, c) => sum + c.studentNames.length,
        0,
      );
      await onImportRoster(imported);
      setImportStatus({
        type: "success",
        classCount: imported.length,
        studentCount,
      });
    } catch (err) {
      setImportStatus({
        type: "error",
        message: err instanceof Error ? err.message : "업로드에 실패했습니다",
      });
    }
  }

  function handleAddClass() {
    if (!form.name.trim() || !form.teacherName.trim()) return;
    const id = `c_${Date.now()}`;
    const color =
      CLASS_COLOR_PALETTE[classes.length % CLASS_COLOR_PALETTE.length];
    onAddClass({
      id,
      name: form.name.trim(),
      teacherName: form.teacherName.trim(),
      color,
    });
    setForm({ name: "", teacherName: "" });
    setShowAdd(false);
    setSelected(id);
  }

  function openEdit(cls: ClassInfo) {
    setEditingClass(cls);
    setEditForm({ name: cls.name, teacherName: cls.teacherName });
  }

  function handleSaveEdit() {
    if (
      !editingClass ||
      !editForm.name.trim() ||
      !editForm.teacherName.trim()
    )
      return;
    onUpdateClass({
      ...editingClass,
      name: editForm.name.trim(),
      teacherName: editForm.teacherName.trim(),
    });
    setEditingClass(null);
  }

  function handleDeleteClass() {
    if (!editingClass) return;
    if (
      confirm(
        `"${editingClass.name}" 반을 삭제하시겠습니까?\n원아 명단과 출석 기록은 남지만 더 이상 이 반으로 연결되지 않습니다.`,
      )
    ) {
      onDeleteClass(editingClass.id);
      if (selected === editingClass.id) setSelected(null);
      setEditingClass(null);
    }
  }

  return (
    <div className="h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="text-center mb-10 shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Sun className="w-7 h-7 text-emerald-500" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-800 text-slate-800 tracking-tight">
            새롬 유치원
          </h1>
          <p className="text-slate-500 mt-2 font-500">출석 관리 시스템</p>
        </div>

        {syncError && (
          <div className="mb-4 shrink-0 bg-red-500 text-white text-sm font-600 px-4 py-2.5 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2.5} />
            Firestore 동기화 실패 — 반 목록이 최신 상태가 아닐 수 있습니다. (
            {syncError})
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col min-h-0">
          {editingClass ? (
            <>
              <div className="flex items-center gap-2 mb-5 shrink-0">
                <button
                  onClick={() => setEditingClass(null)}
                  className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
                  aria-label="뒤로"
                >
                  <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                </button>
                <p className="text-sm font-600 text-slate-600">반 설정</p>
              </div>

              <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
                <div>
                  <label className="text-xs font-600 text-slate-500 mb-1 block">
                    반 이름
                  </label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-600 text-slate-500 mb-1 block">
                    담당 선생님
                  </label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={editForm.teacherName}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        teacherName: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <button
                onClick={handleSaveEdit}
                disabled={
                  !editForm.name.trim() || !editForm.teacherName.trim()
                }
                className="mt-4 w-full py-2.5 rounded-xl text-sm font-700 bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all shrink-0"
              >
                저장
              </button>
              <button
                onClick={handleDeleteClass}
                className="mt-2 w-full py-2.5 rounded-xl text-sm font-600 text-red-600 border border-red-200 hover:bg-red-50 transition-all flex items-center justify-center gap-1.5 shrink-0"
              >
                <Trash2 className="w-4 h-4" strokeWidth={2} /> 이 반 삭제
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 shrink-0">
                <p className="text-sm font-600 text-slate-600">
                  담당 반을 선택하세요
                </p>
                <div className="flex items-center gap-3">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                  <button
                    onClick={() => importInputRef.current?.click()}
                    disabled={importStatus.type === "loading"}
                    className="flex items-center gap-1 text-xs font-600 text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" strokeWidth={2} />
                    {importStatus.type === "loading"
                      ? "업로드 중..."
                      : "엑셀 업로드"}
                  </button>
                  <button
                    onClick={() => setShowAdd((v) => !v)}
                    className="flex items-center gap-1 text-xs font-600 text-emerald-600 hover:text-emerald-700 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> 반 추가
                  </button>
                </div>
              </div>

              {importStatus.type === "success" && (
                <div className="mb-4 shrink-0 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  {importStatus.classCount}개 반, {importStatus.studentCount}
                  명 원아 추가 완료
                </div>
              )}
              {importStatus.type === "error" && (
                <div className="mb-4 shrink-0 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {importStatus.message}
                </div>
              )}

              {showAdd && (
                <div className="mb-4 p-4 rounded-xl border border-slate-200 bg-slate-50 shrink-0 space-y-2">
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="반 이름 (예: 코스모스반)"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="담당 선생님 이름"
                    value={form.teacherName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, teacherName: e.target.value }))
                    }
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleAddClass}
                      disabled={!form.name.trim() || !form.teacherName.trim()}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-600 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all"
                    >
                      등록
                    </button>
                    <button
                      onClick={() => {
                        setShowAdd(false);
                        setForm({ name: "", teacherName: "" });
                      }}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-600 hover:bg-slate-200 transition-all"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0">
                {classes.length === 0 && (
                  <div className="text-sm text-slate-400 text-center py-6">
                    등록된 반이 없습니다. 위에서 반을 추가해주세요
                  </div>
                )}
                {classes.map((cls) => (
                  <div
                    key={cls.id}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      selected === cls.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <button
                      onClick={() => setSelected(cls.id)}
                      className="flex items-center gap-4 flex-1 min-w-0 text-left"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-700 shrink-0"
                        style={{ backgroundColor: cls.color }}
                      >
                        {cls.name[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-700 text-slate-800 truncate">
                          {cls.name}
                        </div>
                        <div className="text-sm text-slate-500 truncate">
                          {cls.teacherName} 선생님
                        </div>
                      </div>
                    </button>
                    {selected === cls.id && (
                      <div className="text-emerald-500 text-xl shrink-0">
                        ✓
                      </div>
                    )}
                    <button
                      onClick={() => openEdit(cls)}
                      aria-label={`${cls.name} 설정`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
                    >
                      <Settings className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}

                {classes.length > 0 && (
                  <button
                    onClick={() => setSelected("all")}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 border-dashed transition-all text-left ${
                      selected === "all"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 bg-slate-400">
                      <LayoutGrid className="w-5 h-5" strokeWidth={2} />
                    </div>
                    <div>
                      <div className="font-700 text-slate-800">전체보기</div>
                      <div className="text-sm text-slate-500">
                        모든 반 현황 한눈에 보기 (읽기 전용)
                      </div>
                    </div>
                    {selected === "all" && (
                      <div className="ml-auto text-emerald-500 text-xl">
                        ✓
                      </div>
                    )}
                  </button>
                )}
              </div>

              <button
                disabled={!selected}
                onClick={() => selected && onLogin(selected)}
                className={`mt-6 w-full py-3.5 rounded-xl font-700 text-sm transition-all shrink-0 ${
                  selected
                    ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                입장하기
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 shrink-0">
          이 기기에서 다음부터는 자동으로 이 반으로 들어옵니다
        </p>
      </div>
    </div>
  );
}

// ── Dashboard screen ───────────────────────────────────────────────────────────
function DashboardScreen({
  classes,
  currentClass,
  students,
  attendance,
  onNavigate,
}: {
  classes: ClassInfo[];
  currentClass: ClassInfo;
  students: Student[];
  attendance: AttendanceRecord[];
  onNavigate: (s: Screen) => void;
}) {
  const isOverview = currentClass.id === "all";
  const todayRecs = attendance.filter((r) => r.date === today);

  const totalStudents = students.length;
  const present = todayRecs.filter((r) => r.status === "present").length;
  const late = todayRecs.filter((r) => r.status === "late").length;
  const totalAbsent = todayRecs.filter((r) => r.status === "absent").length;
  const totalPresent = present + late;
  const totalPending = totalStudents - todayRecs.length;
  const overallRate =
    totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0;

  const noContactStudents = todayRecs
    .filter((r) => r.absenceReason === "no_contact")
    .map((r) => students.find((s) => s.id === r.studentId))
    .filter((s): s is Student => Boolean(s));

  // 전체보기일 때만 필요한 반별 분해 — classes를 직접 순회해서 반마다 오늘 현황을 다시 집계한다.
  const classStats = isOverview
    ? classes.map((cls) => {
        const classStudents = students.filter((s) => s.classId === cls.id);
        const recs = todayRecs.filter((r) =>
          classStudents.some((s) => s.id === r.studentId),
        );
        const p = recs.filter(
          (r) => r.status === "present" || r.status === "late",
        ).length;
        const rate =
          classStudents.length > 0
            ? Math.round((p / classStudents.length) * 100)
            : 0;
        return { cls, total: classStudents.length, present: p, rate };
      })
    : [];

  // 단일 반일 때만 — 통계 화면과 같은 오늘 상태 분포 막대그래프를 대시보드에도 보여준다.
  const statusCounts = (
    ["present", "late", "absent", "pending"] as AttendanceStatus[]
  ).map((status) => {
    const count =
      status === "pending"
        ? totalPending
        : todayRecs.filter((r) => r.status === status).length;
    const labels = {
      present: "출석",
      late: "지각",
      absent: "결석",
      pending: "미입력",
    };
    const colors = {
      present: "#10B981",
      late: "#F59E0B",
      absent: "#EF4444",
      pending: "#94A3B8",
    };
    return { name: labels[status], count, color: colors[status] };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-700 shrink-0"
          style={{ backgroundColor: currentClass.color }}
        >
          {currentClass.name[0]}
        </div>
        <div>
          <h2 className="text-2xl font-800 text-slate-800">
            {currentClass.name} · 오늘의 출석 현황
          </h2>
          <p className="text-slate-500 mt-0.5 text-sm">
            {new Date().toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-4">
        {[
          {
            label: "전체 원아",
            value: totalStudents,
            unit: "명",
            color: "text-slate-700",
            bg: "bg-slate-50",
          },
          {
            label: "출석",
            value: totalPresent,
            unit: "명",
            color: "text-emerald-600",
            bg: "bg-emerald-50",
          },
          {
            label: "결석",
            value: totalAbsent,
            unit: "명",
            color: "text-red-500",
            bg: "bg-red-50",
          },
          {
            label: "미입력",
            value: totalPending,
            unit: "명",
            color: "text-amber-500",
            bg: "bg-amber-50",
          },
        ].map((item) => (
          <div key={item.label} className={`${item.bg} rounded-2xl p-5`}>
            <div className={`text-3xl font-800 ${item.color}`}>
              {item.value}
              <span className="text-base font-600 ml-0.5">{item.unit}</span>
            </div>
            <div className="text-sm text-slate-500 mt-1 font-500">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Overall rate */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 mb-6 text-white flex items-center justify-between">
        <div>
          <div className="text-sm font-600 opacity-80 mb-1">출석률</div>
          <div className="text-5xl font-800">
            {overallRate}
            <span className="text-2xl">%</span>
          </div>
        </div>
        <div className="text-right text-sm opacity-75">
          <div>
            출석 {totalPresent}명 / 전체 {totalStudents}명
          </div>
          {totalPending > 0 && (
            <div className="mt-1 bg-white/20 rounded-lg px-3 py-1">
              미입력 {totalPending}명 있음
            </div>
          )}
        </div>
      </div>

      {!isOverview && totalPending > 0 && (
        <button
          onClick={() => onNavigate("attendance")}
          className="w-full mb-6 text-sm text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl py-3 font-600 hover:bg-amber-100 transition-all"
        >
          미입력 {totalPending}명 있음 — 출석 입력하러 가기
        </button>
      )}

      {/* No contact alert */}
      {noContactStudents.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-500" strokeWidth={2} />
            <span className="font-700 text-red-700">
              연락안됨 원아 — 즉시 확인 필요
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {noContactStudents.map((student) => {
              const cls = isOverview
                ? classes.find((c) => c.id === student.classId)
                : null;
              return (
                <span
                  key={student.id}
                  className="flex items-center gap-1.5 bg-white border border-red-200 rounded-full px-3 py-1 text-sm font-600 text-red-700"
                >
                  {cls && (
                    <span className="text-xs" style={{ color: cls.color }}>
                      {cls.name}
                    </span>
                  )}
                  {student.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Class breakdown (전체보기 전용) */}
      {isOverview && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classStats.map(({ cls, total, present: clsPresent, rate }) => (
            <div
              key={cls.id}
              className="bg-white rounded-2xl border border-slate-100 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-700"
                    style={{ backgroundColor: cls.color }}
                  >
                    {cls.name[0]}
                  </div>
                  <div>
                    <div className="font-700 text-slate-800 text-sm">
                      {cls.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {cls.teacherName} 선생님
                    </div>
                  </div>
                </div>
                <div className="text-xl font-800 text-slate-800">
                  {rate}
                  <span className="text-sm font-600">%</span>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${rate}%`, backgroundColor: cls.color }}
                />
              </div>
              <div className="text-xs text-slate-400">
                출석 {clsPresent}명 / 전체 {total}명
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 오늘 상태 분포 (단일 반 전용) */}
      {!isOverview && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-700 text-slate-700 mb-5 text-sm">
            오늘 상태 분포
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={statusCounts}
              margin={{ top: 0, right: 10, bottom: 0, left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                formatter={(v: unknown) => [`${v}명`, "인원"]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {statusCounts.map((entry, i) => (
                  <rect key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Attendance input screen ────────────────────────────────────────────────────
function AttendanceScreen({
  currentClass,
  students,
  attendance,
  onUpdate,
}: {
  currentClass: ClassInfo;
  students: Student[];
  attendance: AttendanceRecord[];
  onUpdate: (updated: AttendanceRecord) => void;
}) {
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const classStudents = students;

  function getRecord(studentId: string): AttendanceRecord {
    const existing = attendance.find(
      (r) => r.studentId === studentId && r.date === today,
    );
    return (
      existing ?? {
        studentId,
        classId: currentClass.id,
        date: today,
        status: "pending",
        updatedAt: today,
      }
    );
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    const rec = getRecord(studentId);
    onUpdate({
      ...rec,
      status,
      absenceReason: status === "absent" ? rec.absenceReason : undefined,
      updatedAt: new Date().toISOString(),
    });
    if (status !== "absent") setExpandedStudent(null);
    else setExpandedStudent(studentId);
  }

  function setReason(studentId: string, reason: AbsenceReason) {
    const rec = getRecord(studentId);
    onUpdate({
      ...rec,
      absenceReason: reason,
      updatedAt: new Date().toISOString(),
    });
    if (reason !== "no_contact") setExpandedStudent(null);
  }

  // 미입력인 원아만 출석으로 채운다 — 이미 결석/지각으로 체크해둔 원아는 안 건드림.
  // "전체 출석 누르고 예외 몇 명만 따로 체크"하는 흐름을 그대로 지원하기 위함.
  function handleMarkAllPresent() {
    classStudents.forEach((student) => {
      const rec = getRecord(student.id);
      if (rec.status === "pending") {
        onUpdate({
          ...rec,
          status: "present",
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  const totalPending = classStudents.filter(
    (s) => getRecord(s.id).status === "pending",
  ).length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-700 shrink-0"
            style={{ backgroundColor: currentClass.color }}
          >
            {currentClass.name[0]}
          </div>
          <div>
            <h2 className="text-2xl font-800 text-slate-800">
              {currentClass.name} 출석 입력
            </h2>
            <p className="text-slate-500 mt-0.5 text-sm">
              {new Date().toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
          </div>
        </div>
        {totalPending > 0 && (
          <button
            onClick={handleMarkAllPresent}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-600 bg-emerald-500 text-white hover:bg-emerald-600 transition-all shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" strokeWidth={2} /> 전체 출석
          </button>
        )}
      </div>

      {/* Status summary */}
      <div className="flex gap-3 mb-5">
        {(["present", "absent", "late", "pending"] as AttendanceStatus[]).map(
          (s) => {
            const count = classStudents.filter(
              (st) => getRecord(st.id).status === s,
            ).length;
            const map = {
              present: { label: "출석", color: "text-emerald-600" },
              absent: { label: "결석", color: "text-red-500" },
              late: { label: "지각", color: "text-amber-600" },
              pending: { label: "미입력", color: "text-slate-400" },
            };
            return (
              <div key={s} className="text-center">
                <div className={`text-xl font-800 ${map[s].color}`}>
                  {count}
                </div>
                <div className="text-xs text-slate-500">{map[s].label}</div>
              </div>
            );
          },
        )}
        {totalPending > 0 && (
          <div className="ml-auto flex items-center text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full font-500">
            {totalPending}명 미입력
          </div>
        )}
      </div>

      {/* Student list */}
      <div className="space-y-2">
        {classStudents.map((student, idx) => {
          const rec = getRecord(student.id);
          const isNoContact = rec.absenceReason === "no_contact";
          const isExpanded = expandedStudent === student.id;

          return (
            <div
              key={student.id}
              className={`bg-white rounded-xl border transition-all ${
                isNoContact
                  ? "border-red-300 shadow-sm shadow-red-100"
                  : "border-slate-100"
              }`}
            >
              <div className="flex items-center gap-3 p-4">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-700 text-slate-600 shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-700 ${isNoContact ? "text-red-700" : "text-slate-800"}`}
                    >
                      {student.name}
                    </span>
                    {isNoContact && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-600">
                        연락안됨
                      </span>
                    )}
                    {rec.absenceReason &&
                      rec.absenceReason !== "no_contact" && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          {ABSENCE_REASON_LABELS[rec.absenceReason]}
                        </span>
                      )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {genderLabel(student.gender)} · {student.parentPhone}
                  </div>
                </div>

                {/* Toggle buttons */}
                <div className="flex gap-1 shrink-0">
                  {(["present", "late", "absent"] as AttendanceStatus[]).map(
                    (s) => {
                      const labels = {
                        present: "출석",
                        late: "지각",
                        absent: "결석",
                      };
                      const active = rec.status === s;
                      const colors = {
                        present: active
                          ? "bg-emerald-500 text-white"
                          : "text-emerald-600 border-emerald-200 hover:bg-emerald-50",
                        late: active
                          ? "bg-amber-500 text-white"
                          : "text-amber-600 border-amber-200 hover:bg-amber-50",
                        absent: active
                          ? "bg-red-500 text-white"
                          : "text-red-500 border-red-200 hover:bg-red-50",
                      };
                      return (
                        <button
                          key={s}
                          onClick={() => setStatus(student.id, s)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-600 border transition-all ${colors[s as "present" | "late" | "absent"]}`}
                        >
                          {labels[s as "present" | "late" | "absent"]}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Absence reason selector */}
              {(rec.status === "absent" || isExpanded) && (
                <div className="px-4 pb-4 pt-0">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-xs font-600 text-slate-500 mb-2">
                      결석 사유
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        Object.entries(ABSENCE_REASON_LABELS) as [
                          AbsenceReason,
                          string,
                        ][]
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setReason(student.id, key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition-all ${
                            rec.absenceReason === key
                              ? key === "no_contact"
                                ? "bg-red-500 text-white border-red-500"
                                : "bg-slate-700 text-white border-slate-700"
                              : key === "no_contact"
                                ? "text-red-600 border-red-200 hover:bg-red-50"
                                : "text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Roster management screen ───────────────────────────────────────────────────
function RosterScreen({
  currentClass,
  students,
  onAddStudent,
  onUpdateStudent,
  onRemoveStudent,
}: {
  currentClass: ClassInfo;
  students: Student[];
  onAddStudent: (s: Student) => void;
  onUpdateStudent: (s: Student) => void;
  onRemoveStudent: (id: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gender: "M" as "M" | "F",
    birthDate: "",
    parentPhone: "",
  });
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    gender: "unspecified" as Gender,
    birthDate: "",
    parentPhone: "",
  });

  const classStudents = students;

  function handleAdd() {
    if (!form.name) return;
    onAddStudent({
      id: `new_${Date.now()}`,
      classId: currentClass.id,
      ...form,
    });
    setForm({ name: "", gender: "M", birthDate: "", parentPhone: "" });
    setShowAdd(false);
  }

  function openEdit(student: Student) {
    if (editingStudent?.id === student.id) {
      setEditingStudent(null);
      return;
    }
    setShowAdd(false);
    setEditingStudent(student);
    setEditForm({
      name: student.name,
      gender: student.gender,
      birthDate: student.birthDate,
      parentPhone: student.parentPhone,
    });
  }

  function handleSaveEdit() {
    if (!editingStudent || !editForm.name.trim()) return;
    onUpdateStudent({
      ...editingStudent,
      name: editForm.name.trim(),
      gender: editForm.gender,
      birthDate: editForm.birthDate,
      parentPhone: editForm.parentPhone,
    });
    setEditingStudent(null);
  }

  function handleDeleteFromEdit() {
    if (!editingStudent) return;
    if (confirm(`${editingStudent.name} 원아를 삭제하시겠습니까?`)) {
      onRemoveStudent(editingStudent.id);
      setEditingStudent(null);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-800 text-slate-800">
            {currentClass.name} 명단 관리
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {classStudents.length}명 등록됨
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingStudent(null);
              setShowAdd(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-600 bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} /> 원아 추가
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
          <div className="font-700 text-slate-800 mb-4">새 원아 등록</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-slate-500 mb-1 block">
                이름 *
              </label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="홍길동"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-600 text-slate-500 mb-1 block">
                성별
              </label>
              <div className="flex gap-2">
                {(["M", "F"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setForm((f) => ({ ...f, gender: g }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-600 border transition-all ${form.gender === g ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {g === "M" ? "남" : "여"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-600 text-slate-500 mb-1 block">
                생년월일
              </label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.birthDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, birthDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-600 text-slate-500 mb-1 block">
                보호자 연락처
              </label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="010-0000-0000"
                value={form.parentPhone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, parentPhone: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAdd}
              className="px-5 py-2 bg-emerald-500 text-white rounded-xl text-sm font-600 hover:bg-emerald-600 transition-all"
            >
              등록
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-5 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-600 hover:bg-slate-200 transition-all"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Student table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_3rem_1fr_1fr_4.5rem] gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-700 text-slate-500">
          <div>#</div>
          <div>이름</div>
          <div>성별</div>
          <div>생년월일</div>
          <div>보호자 연락처</div>
          <div />
        </div>
        {classStudents.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            등록된 원아가 없습니다
          </div>
        )}
        {classStudents.map((student, idx) => (
          <Fragment key={student.id}>
            <div className="grid grid-cols-[2rem_1fr_3rem_1fr_1fr_4.5rem] gap-3 px-4 py-3 border-b border-slate-50 last:border-0 items-center hover:bg-slate-50 transition-colors text-sm">
              <div className="text-slate-400 font-500">{idx + 1}</div>
              <div className="font-600 text-slate-800">{student.name}</div>
              <div className="text-slate-500">
                {genderLabel(student.gender)}
              </div>
              <div className="text-slate-500">{student.birthDate}</div>
              <div className="text-slate-500">{student.parentPhone}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(student)}
                  aria-label={`${student.name} 설정`}
                  className={`transition-colors ${editingStudent?.id === student.id ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"}`}
                >
                  <Settings className="w-4 h-4" strokeWidth={2} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`${student.name} 원아를 삭제하시겠습니까?`))
                      onRemoveStudent(student.id);
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            </div>

            {editingStudent?.id === student.id && (
              <div className="px-4 pb-4 border-b border-slate-50 last:border-0 bg-slate-50">
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div>
                    <label className="text-xs font-600 text-slate-500 mb-1 block">
                      이름 *
                    </label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-600 text-slate-500 mb-1 block">
                      성별
                    </label>
                    <div className="flex gap-2">
                      {(["M", "F", "unspecified"] as Gender[]).map((g) => (
                        <button
                          key={g}
                          onClick={() =>
                            setEditForm((f) => ({ ...f, gender: g }))
                          }
                          className={`flex-1 py-2 rounded-lg text-sm font-600 border transition-all ${editForm.gender === g ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                        >
                          {genderLabel(g)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-600 text-slate-500 mb-1 block">
                      생년월일
                    </label>
                    <input
                      type="date"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={editForm.birthDate}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          birthDate: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-600 text-slate-500 mb-1 block">
                      보호자 연락처
                    </label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={editForm.parentPhone}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          parentPhone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editForm.name.trim()}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-600 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingStudent(null)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-600 hover:bg-slate-100 transition-all"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteFromEdit}
                    className="ml-auto px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-600 hover:bg-red-50 transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} /> 삭제
                  </button>
                </div>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Statistics screen ──────────────────────────────────────────────────────────
function StatisticsScreen({
  classes,
  currentClass,
  students,
  attendance,
}: {
  classes: ClassInfo[];
  currentClass: ClassInfo;
  students: Student[];
  attendance: AttendanceRecord[];
}) {
  const [view, setView] = useState<"daily" | "trend">("daily");
  const isOverview = currentClass.id === "all";

  // Today's status breakdown
  const todayRecs = attendance.filter((r) => r.date === today);
  const statusCounts = (
    ["present", "late", "absent", "pending"] as AttendanceStatus[]
  ).map((status) => {
    const count =
      status === "pending"
        ? students.length - todayRecs.length
        : todayRecs.filter((r) => r.status === status).length;
    const labels = {
      present: "출석",
      late: "지각",
      absent: "결석",
      pending: "미입력",
    };
    const colors = {
      present: "#10B981",
      late: "#F59E0B",
      absent: "#EF4444",
      pending: "#94A3B8",
    };
    return { name: labels[status], count, color: colors[status] };
  });
  const todayPresent = todayRecs.filter(
    (r) => r.status === "present" || r.status === "late",
  ).length;
  const todayRate =
    students.length > 0
      ? Math.round((todayPresent / students.length) * 100)
      : 0;

  // 전체보기 전용: 오늘 반별 출석률 비교
  const todayByClass = isOverview
    ? classes.map((cls) => {
        const classStudents = students.filter((s) => s.classId === cls.id);
        const recs = todayRecs.filter((r) =>
          classStudents.some((s) => s.id === r.studentId),
        );
        const p = recs.filter(
          (r) => r.status === "present" || r.status === "late",
        ).length;
        return {
          name: cls.name,
          rate:
            classStudents.length > 0
              ? Math.round((p / classStudents.length) * 100)
              : 0,
          color: cls.color,
        };
      })
    : [];

  // Trend: last 7 days (단일 반이면 rate 하나, 전체보기면 반별로 컬럼 하나씩)
  const trendData = Array.from({ length: 7 }, (_, i) => {
    const date = pastDate(6 - i);
    const recs = attendance.filter((r) => r.date === date);
    const present = recs.filter(
      (r) => r.status === "present" || r.status === "late",
    ).length;
    const rate =
      students.length > 0 ? Math.round((present / students.length) * 100) : 0;
    if (!isOverview) return { date: formatDate(date), rate };

    const byClass: Record<string, number> = {};
    classes.forEach((cls) => {
      const classStudents = students.filter((s) => s.classId === cls.id);
      const cr = recs.filter((r) =>
        classStudents.some((s) => s.id === r.studentId),
      );
      const cp = cr.filter(
        (r) => r.status === "present" || r.status === "late",
      ).length;
      byClass[cls.name] =
        classStudents.length > 0
          ? Math.round((cp / classStudents.length) * 100)
          : 0;
    });
    return { date: formatDate(date), rate, ...byClass };
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-800 text-slate-800">
            {currentClass.name} 통계
          </h2>
          <p className="text-slate-500 text-sm mt-1">기간별 출석률 분석</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[
            { key: "daily", label: "오늘 현황" },
            { key: "trend", label: "7일 추이" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key as "daily" | "trend")}
              className={`px-4 py-2 rounded-lg text-sm font-600 transition-all ${view === tab.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === "daily" && !isOverview && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-700 text-slate-700 text-sm">오늘 출석 현황</h3>
            <span
              className="text-2xl font-800"
              style={{ color: currentClass.color }}
            >
              {todayRate}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={statusCounts}
              margin={{ top: 0, right: 10, bottom: 0, left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                formatter={(v: unknown) => [`${v}명`, "인원"]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {statusCounts.map((entry, i) => (
                  <rect key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === "daily" && isOverview && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-700 text-slate-700 mb-5 text-sm">
            오늘 반별 출석률
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={todayByClass}
              margin={{ top: 0, right: 10, bottom: 0, left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                formatter={(v: unknown) => [`${v}%`, "출석률"]}
              />
              <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
                {todayByClass.map((entry, i) => (
                  <rect key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === "trend" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-700 text-slate-700 mb-5 text-sm">
            최근 7일 {isOverview ? "반별 " : ""}출석률 추이
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={trendData}
              margin={{ top: 5, right: 20, bottom: 5, left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                formatter={(v: unknown) => [`${v}%`, "출석률"]}
              />
              {isOverview && (
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              )}
              {isOverview ? (
                classes.map((cls) => (
                  <Line
                    key={cls.id}
                    type="monotone"
                    dataKey={cls.name}
                    stroke={cls.color}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: cls.color }}
                    activeDot={{ r: 6 }}
                  />
                ))
              ) : (
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke={currentClass.color}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: currentClass.color }}
                  activeDot={{ r: 6 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Absence tracking screen ────────────────────────────────────────────────────
function AbsenceTrackingScreen({
  classes,
  currentClass,
  students,
  attendance,
}: {
  classes: ClassInfo[];
  currentClass: ClassInfo;
  students: Student[];
  attendance: AttendanceRecord[];
}) {
  function getConsecutiveAbsences(studentId: string): {
    days: number;
    lastDate: string;
    reasons: AbsenceReason[];
  } {
    let days = 0;
    let reasons: AbsenceReason[] = [];
    for (let i = 1; i <= 14; i++) {
      const date = pastDate(i);
      const rec = attendance.find(
        (r) => r.studentId === studentId && r.date === date,
      );
      if (rec && rec.status === "absent") {
        days++;
        if (rec.absenceReason) reasons.push(rec.absenceReason);
      } else break;
    }
    return { days, lastDate: pastDate(1), reasons };
  }

  const flagged = students
    .map((student) => {
      const info = getConsecutiveAbsences(student.id);
      const todayRec = attendance.find(
        (r) => r.studentId === student.id && r.date === today,
      );
      const todayAbsent = todayRec && todayRec.status === "absent";
      const totalAbsences = todayAbsent ? info.days + 1 : info.days;
      return { student, ...info, days: totalAbsences };
    })
    .filter((x) => x.days >= 3)
    .sort((a, b) => b.days - a.days);

  const noContactStudents = students.filter((student) => {
    const todayRec = attendance.find(
      (r) => r.studentId === student.id && r.date === today,
    );
    return todayRec?.absenceReason === "no_contact";
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-800 text-slate-800">
          {currentClass.name} 결석 추적
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          3일 이상 연속 결석 원아 및 연락안됨 현황
        </p>
      </div>

      {/* No contact alert section */}
      {noContactStudents.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center text-white">
              <AlertTriangle className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <span className="font-700 text-red-800">
              오늘 연락안됨 — 즉시 팔로업 필요
            </span>
          </div>
          <div className="space-y-2">
            {noContactStudents.map((student) => {
              const cls = classes.find((c) => c.id === student.classId)!;
              return (
                <div
                  key={student.id}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-red-100"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-700"
                      style={{ backgroundColor: cls.color }}
                    >
                      {cls.name[0]}
                    </div>
                    <div>
                      <div className="font-700 text-slate-800">
                        {student.name}
                      </div>
                      <div className="text-xs text-slate-500">{cls.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">
                      {student.parentPhone}
                    </span>
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-lg font-600">
                      팔로업 필요
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Consecutive absence list */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="font-700 text-slate-800">3일 이상 연속 결석</div>
          <div className="text-sm text-slate-500">{flagged.length}명</div>
        </div>

        {flagged.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle2
              className="w-9 h-9 text-emerald-500 mx-auto mb-3"
              strokeWidth={1.75}
            />
            <div className="text-slate-500 text-sm">
              3일 이상 연속 결석 원아가 없습니다
            </div>
          </div>
        )}

        {flagged.map(({ student, days, reasons }) => {
          const cls = classes.find((c) => c.id === student.classId)!;
          const hasNoContact = reasons.includes("no_contact");
          const uniqueReasons = [...new Set(reasons)];

          return (
            <div
              key={student.id}
              className={`flex items-center gap-4 px-5 py-4 border-b border-slate-50 last:border-0 ${hasNoContact ? "bg-red-50" : ""}`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-700 shrink-0"
                style={{ backgroundColor: cls.color }}
              >
                {cls.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-700 text-slate-800">
                    {student.name}
                  </span>
                  <span className="text-xs text-slate-500">{cls.name}</span>
                  {hasNoContact && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-600">
                      연락안됨
                    </span>
                  )}
                </div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {uniqueReasons.map((r) => (
                    <span
                      key={r}
                      className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded"
                    >
                      {ABSENCE_REASON_LABELS[r]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={`text-2xl font-800 ${days >= 5 ? "text-red-600" : "text-amber-600"}`}
                >
                  {days}일
                </div>
                <div className="text-xs text-slate-400">연속 결석</div>
              </div>
              <div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-600 ${
                    days >= 5
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {days >= 5 ? "긴급" : "주의"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Export screen ──────────────────────────────────────────────────────────────
function ExportScreen({
  classes,
  currentClass,
  students,
  attendance,
}: {
  classes: ClassInfo[];
  currentClass: ClassInfo;
  students: Student[];
  attendance: AttendanceRecord[];
}) {
  const [dateFrom, setDateFrom] = useState(pastDate(6));
  const [dateTo, setDateTo] = useState(today);

  const isOverview = currentClass.id === "all";

  function handleExport() {
    const statusMap = {
      present: "출석",
      absent: "결석",
      late: "지각",
      pending: "미입력",
    };
    const dates = dateRange(dateFrom, dateTo);

    // 전체보기면 반 → 이름 순, 단일 반이면 이름 순. 날짜는 열로 펼쳐서 학생 1명 = 1행.
    const exportStudents = [...students].sort((a, b) => {
      if (isOverview) {
        const clsDiff =
          classes.findIndex((c) => c.id === a.classId) -
          classes.findIndex((c) => c.id === b.classId);
        if (clsDiff !== 0) return clsDiff;
      }
      return a.name.localeCompare(b.name, "ko");
    });

    const header = [
      ...(isOverview ? ["반"] : []),
      "이름",
      ...dates.map(formatDate),
    ];
    const rows = [
      header,
      ...exportStudents.map((student) => {
        const cells = dates.map((date) => {
          const rec = attendance.find(
            (r) => r.studentId === student.id && r.date === date,
          );
          return statusMap[rec?.status ?? "pending"];
        });
        const clsName = isOverview
          ? [classes.find((c) => c.id === student.classId)!.name]
          : [];
        return [...clsName, student.name, ...cells];
      }),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentClass.name}_출석현황_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewCount = attendance.filter(
    (r) => r.date >= dateFrom && r.date <= dateTo,
  ).length;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-800 text-slate-800">
          {currentClass.name} 데이터 내보내기
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          출석 현황을 CSV 파일로 다운로드합니다
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-6">
        {/* Date range */}
        <div>
          <label className="text-sm font-700 text-slate-700 mb-3 block">
            기간 선택
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-1">시작일</div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">종료일</div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>
        </div>

        {/* Preview info */}
        <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-700 text-slate-700">내보낼 데이터</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {dateFrom} ~ {dateTo}
            </div>
          </div>
          <div className="text-2xl font-800 text-emerald-600">
            {previewCount}
            <span className="text-sm font-500 text-slate-400 ml-1">건</span>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="w-full py-3.5 rounded-xl font-700 text-sm transition-all flex items-center justify-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
        >
          <Download className="w-4 h-4" strokeWidth={2} /> CSV 다운로드
        </button>
      </div>

      {/* Quick exports */}
      <div className="mt-6">
        <div className="text-sm font-700 text-slate-600 mb-3">
          빠른 내보내기
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "오늘 전체 출석", from: today, to: today },
            { label: "이번 주 (7일)", from: pastDate(6), to: today },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setDateFrom(item.from);
                setDateTo(item.to);
              }}
              className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-600 text-slate-700 hover:bg-slate-50 transition-all text-left"
            >
              <div>{item.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {item.from === item.to
                  ? item.from
                  : `${item.from} ~ ${item.to}`}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar layout ─────────────────────────────────────────────────────────────
function AppLayout({
  currentClass,
  currentScreen,
  onNavigate,
  onSwitchClass,
  syncError,
  children,
}: {
  currentClass: ClassInfo;
  currentScreen: Screen;
  onNavigate: (s: Screen) => void;
  onSwitchClass: () => void;
  syncError: string | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-slate-100 flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Sun className="w-5 h-5 text-emerald-500" strokeWidth={2} />
            </div>
            <div>
              <div className="font-800 text-slate-800 text-sm leading-tight">
                새롬 유치원
              </div>
              <div className="text-xs text-slate-400">출석 관리</div>
            </div>
          </div>
        </div>

        {/* Current class */}
        <div
          className="px-4 py-3 mx-3 mt-3 rounded-xl"
          style={{ backgroundColor: currentClass.color + "15" }}
        >
          <div className="text-xs text-slate-500 font-500 mb-0.5">현재 반</div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-700"
              style={{ backgroundColor: currentClass.color }}
            >
              {currentClass.name[0]}
            </div>
            <span className="font-700 text-sm text-slate-800">
              {currentClass.name}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV_ITEMS.filter(
            (item) => !item.editOnly || currentClass.id !== "all",
          ).map((item) => (
            <button
              key={item.screen}
              onClick={() => {
                onNavigate(item.screen);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-600 transition-all ${
                currentScreen === item.screen
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <item.icon className="w-[18px] h-[18px]" strokeWidth={2} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-100">
          <button
            onClick={onSwitchClass}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-600 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all"
          >
            <span>↩</span> 반 선택으로
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" strokeWidth={2} />
          </button>
          <span className="font-700 text-slate-800">
            {NAV_ITEMS.find((n) => n.screen === currentScreen)?.label}
          </span>
          <div className="w-9" />
        </header>

        {syncError && (
          <div className="bg-red-500 text-white text-sm font-600 px-4 py-2.5 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2.5} />
            Firestore 동기화 실패 — 지금 화면은 실시간 데이터가 아닙니다. (
            {syncError})
          </div>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeClassId, setActiveClassId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_CLASS_KEY),
  );
  const [screen, setScreen] = useState<Screen>(
    activeClassId ? "dashboard" : "login",
  );
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  // firebase가 꺼져있으면 기다릴 게 없으니 바로 "로드됨" 취급. 켜져있으면 첫 스냅샷 올 때까지 false —
  // 이게 없으면 하드 리프레시 직후 classes가 아직 빈 배열([])인 순간에 activeClassId는 이미
  // localStorage에서 복원돼 있어서 classes.find(...)가 undefined가 되고 그대로 죽는다.
  const [classesLoaded, setClassesLoaded] = useState(!firebaseEnabled);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  // classes는 로그인 전(반 선택 화면)에도 필요해서 activeClassId와 상관없이 항상 구독.
  useEffect(() => {
    if (!firebaseEnabled) return;
    const unsub = subscribeClasses(
      (next) => {
        setClasses(next);
        setClassesLoaded(true);
      },
      (err) => setSyncError(err.message),
    );
    return unsub;
  }, []);

  // Firebase 설정(.env)이 있고 반이 정해졌을 때만 그 반으로 실시간 구독. 없으면 로컬 데모 데이터 그대로 사용.
  // 구독이 실패하면(권한/AppCheck/네트워크 등) 화면에 배너로 알리고, 그 전까지 보이던 값에 계속 머무른다 —
  // 즉 이 배너가 안 뜨면 지금 보이는 게 진짜 Firestore와 동기화된 값이라는 뜻.
  useEffect(() => {
    if (!firebaseEnabled || !activeClassId) return;
    const handleError = (err: Error) => setSyncError(err.message);
    const unsubStudents = subscribeStudents(
      activeClassId,
      setStudents,
      handleError,
    );
    const unsubAttendance = subscribeAttendance(
      activeClassId,
      setAttendance,
      handleError,
    );
    return () => {
      unsubStudents();
      unsubAttendance();
    };
  }, [activeClassId]);

  // 저장해둔 activeClassId가 classes 목록에 없으면(다른 기기에서 그 반이 삭제됐거나, 오래된
  // localStorage) 로그인 화면으로 되돌린다. classesLoaded가 true가 된 뒤에만 판단 — 로딩 중인
  // 빈 배열([])을 "반이 없다"고 착각해서 방금 로그인한 사람을 튕겨내면 안 되니까.
  useEffect(() => {
    if (!classesLoaded || !activeClassId || activeClassId === "all") return;
    const exists = classes.some((c) => c.id === activeClassId);
    if (!exists) {
      localStorage.removeItem(ACTIVE_CLASS_KEY);
      setActiveClassId(null);
      setScreen("login");
    }
  }, [classesLoaded, classes, activeClassId]);

  function handleLogin(classId: string) {
    setActiveClassId(classId);
    localStorage.setItem(ACTIVE_CLASS_KEY, classId);
    setScreen("dashboard");
  }

  function handleSwitchClass() {
    localStorage.removeItem(ACTIVE_CLASS_KEY);
    setActiveClassId(null);
    setScreen("login");
  }

  function handleUpdateAttendance(updated: AttendanceRecord) {
    setAttendance((prev) => {
      const idx = prev.findIndex(
        (r) => r.studentId === updated.studentId && r.date === updated.date,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    if (firebaseEnabled) saveAttendanceRecord(updated).catch(console.error);
  }

  function handleAddStudent(s: Student) {
    setStudents((prev) => [...prev, s]);
    if (firebaseEnabled) addStudentDoc(s).catch(console.error);
  }

  function handleUpdateStudent(s: Student) {
    // addStudentDoc은 setDoc(merge 없이)이라 같은 id로 다시 부르면 그대로 덮어써서 수정으로 쓸 수 있다.
    setStudents((prev) => prev.map((st) => (st.id === s.id ? s : st)));
    if (firebaseEnabled) addStudentDoc(s).catch(console.error);
  }

  function handleRemoveStudent(id: string) {
    setStudents((prev) => prev.filter((s) => s.id !== id));
    if (firebaseEnabled) removeStudentDoc(id).catch(console.error);
  }

  function handleAddClass(cls: ClassInfo) {
    setClasses((prev) => [...prev, cls]);
    if (firebaseEnabled) addClassDoc(cls).catch(console.error);
  }

  function handleUpdateClass(cls: ClassInfo) {
    // addClassDoc은 setDoc(merge 없이)이라 같은 id로 다시 부르면 그대로 덮어써서 수정으로 쓸 수 있다.
    setClasses((prev) => prev.map((c) => (c.id === cls.id ? cls : c)));
    if (firebaseEnabled) addClassDoc(cls).catch(console.error);
  }

  function handleRemoveClass(id: string) {
    setClasses((prev) => prev.filter((c) => c.id !== id));
    if (activeClassId === id) {
      localStorage.removeItem(ACTIVE_CLASS_KEY);
      setActiveClassId(null);
    }
    if (firebaseEnabled) removeClassDoc(id).catch(console.error);
  }

  // 엑셀 명단 업로드: 열 하나 = 반 하나, 그 열의 셀들 = 원아 이름. 같은 이름의 반이 이미
  // 있으면 새로 안 만들고 거기에 원아만 추가한다(재업로드해도 반이 중복 생성되지 않게).
  // 엑셀엔 없는 선생님 이름/성별/생년월일/연락처는 전부 "미지정"으로 채운다.
  async function handleImportRoster(imported: ImportedClass[]) {
    const newClasses: ClassInfo[] = [];
    const newStudents: Student[] = [];
    const baseTime = Date.now();
    let idCounter = 0;
    let colorIndex = classes.length;

    imported.forEach((ic) => {
      const existing =
        classes.find((c) => c.name === ic.name) ??
        newClasses.find((c) => c.name === ic.name);
      const cls: ClassInfo = existing ?? {
        id: `c_${baseTime}_${idCounter++}`,
        name: ic.name,
        teacherName: "미지정",
        color: CLASS_COLOR_PALETTE[colorIndex++ % CLASS_COLOR_PALETTE.length],
      };
      if (!existing) newClasses.push(cls);

      ic.studentNames.forEach((name) => {
        newStudents.push({
          id: `s_${baseTime}_${idCounter++}`,
          name,
          classId: cls.id,
          gender: "unspecified",
          birthDate: "미지정",
          parentPhone: "미지정",
        });
      });
    });

    setClasses((prev) => [...prev, ...newClasses]);
    if (firebaseEnabled) await importRosterDoc(newClasses, newStudents);
  }

  if (!activeClassId) {
    return (
      <LoginScreen
        classes={classes}
        syncError={syncError}
        onLogin={handleLogin}
        onAddClass={handleAddClass}
        onUpdateClass={handleUpdateClass}
        onDeleteClass={handleRemoveClass}
        onImportRoster={handleImportRoster}
      />
    );
  }

  // 하드 리프레시 직후 classes가 아직 로드되기 전(빈 배열)이거나, 저장해둔 반이 이제
  // 없는 경우(다른 기기에서 삭제됨) — 아래 useEffect가 정리하기 전까지 빈 화면으로 버틴다.
  if (activeClassId !== "all" && !classesLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        불러오는 중...
      </div>
    );
  }

  const currentClass =
    activeClassId === "all"
      ? ALL_CLASS
      : classes.find((c) => c.id === activeClassId);

  if (!currentClass) {
    return null;
  }

  const classStudents =
    activeClassId === "all"
      ? students
      : students.filter((s) => s.classId === activeClassId);
  const classAttendance = attendance.filter((r) =>
    classStudents.some((s) => s.id === r.studentId),
  );

  const screenContent = () => {
    switch (screen) {
      case "dashboard":
        return (
          <DashboardScreen
            classes={classes}
            currentClass={currentClass}
            students={classStudents}
            attendance={classAttendance}
            onNavigate={setScreen}
          />
        );
      case "attendance":
        return (
          <AttendanceScreen
            currentClass={currentClass}
            students={classStudents}
            attendance={classAttendance}
            onUpdate={handleUpdateAttendance}
          />
        );
      case "roster":
        return (
          <RosterScreen
            currentClass={currentClass}
            students={classStudents}
            onAddStudent={handleAddStudent}
            onUpdateStudent={handleUpdateStudent}
            onRemoveStudent={handleRemoveStudent}
          />
        );
      case "statistics":
        return (
          <StatisticsScreen
            classes={classes}
            currentClass={currentClass}
            students={classStudents}
            attendance={classAttendance}
          />
        );
      case "absence-tracking":
        return (
          <AbsenceTrackingScreen
            classes={classes}
            currentClass={currentClass}
            students={classStudents}
            attendance={classAttendance}
          />
        );
      case "export":
        return (
          <ExportScreen
            classes={classes}
            currentClass={currentClass}
            students={classStudents}
            attendance={classAttendance}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AppLayout
      currentClass={currentClass}
      currentScreen={screen}
      onNavigate={setScreen}
      onSwitchClass={handleSwitchClass}
      syncError={syncError}
    >
      {screenContent()}
    </AppLayout>
  );
}
