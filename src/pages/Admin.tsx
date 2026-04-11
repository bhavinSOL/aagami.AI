import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Image, FileSpreadsheet, Save, Eye, Pencil, Search, CalendarCheck, ClipboardCheck, Rocket, Github, Cloud } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fetchAttendanceCSV, fetchCalendarCSV, invalidateAttendanceCache, invalidateCalendarCache, toLocalDateStr, saveCSVToFile, type AttendanceRow, type CalendarRow } from '@/lib/csvService';
import { AttendanceChart } from '@/components/dashboard/AttendanceChart';
import html2canvas from 'html2canvas';

// =========================================
// CSV Table Viewer/Editor
// =========================================
interface AttendanceEditorProps {
  rows: AttendanceRow[];
  onSave: (rows: AttendanceRow[]) => void;
}

const AttendanceEditor = ({ rows, onSave }: AttendanceEditorProps) => {
  const [data, setData] = useState<AttendanceRow[]>(rows);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  useEffect(() => { setData(rows); }, [rows]);

  const filteredData = data.filter(r =>
    r.date.includes(searchQuery) || r.festival_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const pagedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateRow = (idx: number, field: keyof AttendanceRow, value: string) => {
    const globalIdx = data.indexOf(filteredData[(currentPage - 1) * pageSize + idx]);
    if (globalIdx === -1) return;
    const updated = [...data];
    const row = { ...updated[globalIdx] };
    if (field === 'absent_percent') {
      row.absent_percent = value === '' ? null : parseFloat(value);
    } else if (field === 'is_holiday' || field === 'is_festival') {
      (row as any)[field] = parseInt(value) || 0;
    } else if (field === 'festival_weight') {
      row.festival_weight = parseFloat(value) || 0;
    } else if (field === 'festival_name') {
      row.festival_name = value;
    }
    updated[globalIdx] = row;
    setData(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by date or festival..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="pl-10"
          />
        </div>
        <Button className="w-full sm:w-auto" onClick={() => { onSave(data); }}>
          <Save className="mr-2 h-4 w-4" />Save Changes
        </Button>
      </div>

      <div className="rounded-lg border overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky top-0 bg-muted">Date</TableHead>
              <TableHead className="sticky top-0 bg-muted">Day</TableHead>
              <TableHead className="sticky top-0 bg-muted">Week</TableHead>
              <TableHead className="sticky top-0 bg-muted">Month</TableHead>
              <TableHead className="sticky top-0 bg-muted">Holiday</TableHead>
              <TableHead className="sticky top-0 bg-muted">Festival</TableHead>
              <TableHead className="sticky top-0 bg-muted">Weight</TableHead>
              <TableHead className="sticky top-0 bg-muted">Festival Name</TableHead>
              <TableHead className="sticky top-0 bg-muted">Absent %</TableHead>
              <TableHead className="sticky top-0 bg-muted w-16">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedData.map((row, idx) => {
              const isEditing = editingIdx === (currentPage - 1) * pageSize + idx;
              return (
                <TableRow key={row.date}>
                  <TableCell className="font-mono text-xs">{row.date}</TableCell>
                  <TableCell>{row.day_of_week}</TableCell>
                  <TableCell>{row.week_number}</TableCell>
                  <TableCell>{row.month}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min={0} max={1} className="w-14 h-7 text-xs" value={row.is_holiday}
                        onChange={(e) => updateRow(idx, 'is_holiday', e.target.value)} />
                    ) : row.is_holiday}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min={0} max={1} className="w-14 h-7 text-xs" value={row.is_festival}
                        onChange={(e) => updateRow(idx, 'is_festival', e.target.value)} />
                    ) : row.is_festival}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min={0} max={1} step={0.1} className="w-16 h-7 text-xs" value={row.festival_weight}
                        onChange={(e) => updateRow(idx, 'festival_weight', e.target.value)} />
                    ) : row.festival_weight}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input className="w-28 h-7 text-xs" value={row.festival_name}
                        onChange={(e) => updateRow(idx, 'festival_name', e.target.value)} />
                    ) : <span className="text-xs">{row.festival_name || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" step={0.01} className="w-20 h-7 text-xs" value={row.absent_percent ?? ''}
                        onChange={(e) => updateRow(idx, 'absent_percent', e.target.value)} />
                    ) : (
                      <span className={`font-semibold text-xs ${row.absent_percent !== null && row.absent_percent > 15 ? 'text-red-500' : ''}`}>
                        {row.absent_percent !== null ? `${row.absent_percent}%` : '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setEditingIdx(isEditing ? null : (currentPage - 1) * pageSize + idx)}>
                      {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
        <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</Button>
          <span className="flex items-center px-2">Page {currentPage}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
};

// =========================================
// Calendar CSV Editor
// =========================================
interface CalendarEditorProps {
  rows: CalendarRow[];
  onSave: (rows: CalendarRow[]) => void;
}

const CalendarEditor = ({ rows, onSave }: CalendarEditorProps) => {
  const [data, setData] = useState<CalendarRow[]>(rows);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  useEffect(() => { setData(rows); }, [rows]);

  const filteredData = data.filter(r =>
    r.date.includes(searchQuery) || r.festival_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const pagedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateRow = (idx: number, field: keyof CalendarRow, value: string) => {
    const globalIdx = data.indexOf(filteredData[(currentPage - 1) * pageSize + idx]);
    if (globalIdx === -1) return;
    const updated = [...data];
    const row = { ...updated[globalIdx] };
    if (field === 'is_holiday' || field === 'is_festival') {
      (row as any)[field] = parseInt(value) || 0;
    } else if (field === 'festival_weight') {
      row.festival_weight = parseFloat(value) || 0;
    } else if (field === 'festival_name') {
      row.festival_name = value;
    }
    updated[globalIdx] = row;
    setData(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by date or festival..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="pl-10"
          />
        </div>
        <Button className="w-full sm:w-auto" onClick={() => { onSave(data); }}>
          <Save className="mr-2 h-4 w-4" />Save Changes
        </Button>
      </div>

      <div className="rounded-lg border overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky top-0 bg-muted">Date</TableHead>
              <TableHead className="sticky top-0 bg-muted">Day</TableHead>
              <TableHead className="sticky top-0 bg-muted">Week</TableHead>
              <TableHead className="sticky top-0 bg-muted">Month</TableHead>
              <TableHead className="sticky top-0 bg-muted">Holiday</TableHead>
              <TableHead className="sticky top-0 bg-muted">Festival</TableHead>
              <TableHead className="sticky top-0 bg-muted">Weight</TableHead>
              <TableHead className="sticky top-0 bg-muted">Festival Name</TableHead>
              <TableHead className="sticky top-0 bg-muted w-16">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedData.map((row, idx) => {
              const isEditing = editingIdx === (currentPage - 1) * pageSize + idx;
              return (
                <TableRow key={row.date}>
                  <TableCell className="font-mono text-xs">{row.date}</TableCell>
                  <TableCell>{row.day_of_week}</TableCell>
                  <TableCell>{row.week_number}</TableCell>
                  <TableCell>{row.month}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min={0} max={1} className="w-14 h-7 text-xs" value={row.is_holiday}
                        onChange={(e) => updateRow(idx, 'is_holiday', e.target.value)} />
                    ) : row.is_holiday}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min={0} max={1} className="w-14 h-7 text-xs" value={row.is_festival}
                        onChange={(e) => updateRow(idx, 'is_festival', e.target.value)} />
                    ) : row.is_festival}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input type="number" min={0} max={1} step={0.1} className="w-16 h-7 text-xs" value={row.festival_weight}
                        onChange={(e) => updateRow(idx, 'festival_weight', e.target.value)} />
                    ) : row.festival_weight}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input className="w-28 h-7 text-xs" value={row.festival_name}
                        onChange={(e) => updateRow(idx, 'festival_name', e.target.value)} />
                    ) : <span className="text-xs">{row.festival_name || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setEditingIdx(isEditing ? null : (currentPage - 1) * pageSize + idx)}>
                      {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
        <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</Button>
          <span className="flex items-center px-2">Page {currentPage}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
};

// =========================================
// Helper: Convert parsed rows to CSV string
// =========================================
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toCSVDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-');
  return `${parseInt(d)}-${monthNames[parseInt(m) - 1]}-${y.slice(2)}`;
};

function buildAttendanceCSV(rows: AttendanceRow[]): string {
  const header = 'date,day_of_week,week_number,month,is_holiday,is_festival,festival_weight,festival_name,absent_percent';
  const lines = rows.map(r =>
    `${toCSVDate(r.date)},${r.day_of_week},${r.week_number},${r.month},${r.is_holiday},${r.is_festival},${r.festival_weight},${r.festival_name || ''},${r.absent_percent ?? ''}`
  );
  return [header, ...lines].join('\n');
}

function buildCalendarCSV(rows: CalendarRow[]): string {
  const header = 'date,day_of_week,week_number,month,is_holiday,is_festival,festival_weight,festival_name';
  const lines = rows.map(r =>
    `${toCSVDate(r.date)},${r.day_of_week},${r.week_number},${r.month},${r.is_holiday},${r.is_festival},${r.festival_weight},${r.festival_name || ''}`
  );
  return [header, ...lines].join('\n');
}

// Optional: download as a backup
function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========================================
// Today's Attendance Quick Entry
// =========================================
interface TodayAttendanceProps {
  attendanceRows: AttendanceRow[];
  calendarRows: CalendarRow[];
  onSave: (updatedRows: AttendanceRow[]) => Promise<void>;
}

const TodayAttendance = ({ attendanceRows, calendarRows, onSave }: TodayAttendanceProps) => {
  const todayStr = toLocalDateStr(new Date());
  const existingRow = attendanceRows.find(r => r.date === todayStr);
  const calendarRow = calendarRows.find(r => r.date === todayStr);

  const [absentPercent, setAbsentPercent] = useState<string>(
    existingRow?.absent_percent !== null && existingRow?.absent_percent !== undefined
      ? String(existingRow.absent_percent)
      : ''
  );
  const [saving, setSaving] = useState(false);

  // Sync if attendanceRows changes externally
  useEffect(() => {
    const row = attendanceRows.find(r => r.date === todayStr);
    if (row?.absent_percent !== null && row?.absent_percent !== undefined) {
      setAbsentPercent(String(row.absent_percent));
    }
  }, [attendanceRows, todayStr]);

  const todayDate = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNamesLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayOfWeek = todayDate.getDay(); // 0=Sun
  const weekNumber = calendarRow?.week_number ?? Math.ceil((todayDate.getDate() + new Date(todayDate.getFullYear(), todayDate.getMonth(), 1).getDay()) / 7);

  const handleSave = async () => {
    const val = absentPercent.trim();
    if (val === '' || isNaN(parseFloat(val))) {
      toast({ title: 'Invalid', description: 'Please enter a valid absent percentage', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const updated = [...attendanceRows];
      const idx = updated.findIndex(r => r.date === todayStr);
      if (idx !== -1) {
        // Update existing row
        updated[idx] = { ...updated[idx], absent_percent: parseFloat(val) };
      } else {
        // Add new row for today
        const newRow: AttendanceRow = {
          date: todayStr,
          day_of_week: dayOfWeek,
          week_number: weekNumber,
          month: todayDate.getMonth() + 1,
          is_holiday: calendarRow?.is_holiday ?? 0,
          is_festival: calendarRow?.is_festival ?? 0,
          festival_weight: calendarRow?.festival_weight ?? 0,
          festival_name: calendarRow?.festival_name ?? '',
          absent_percent: parseFloat(val),
        };
        // Insert in date-sorted order
        const insertIdx = updated.findIndex(r => r.date > todayStr);
        if (insertIdx === -1) updated.push(newRow);
        else updated.splice(insertIdx, 0, newRow);
      }
      await onSave(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/30 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 section-title">
          <CalendarCheck className="h-5 w-5 text-primary" /> Today's Attendance
        </CardTitle>
        <CardDescription>
          {dayNames[dayOfWeek]}, {todayDate.getDate()} {monthNamesLong[todayDate.getMonth()]} {todayDate.getFullYear()}
          {calendarRow?.is_holiday ? ' · Holiday' : ''}
          {calendarRow?.is_festival ? ` · Festival: ${calendarRow.festival_name}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="space-y-2 w-full sm:flex-1 sm:max-w-xs">
            <Label htmlFor="today-absent">Absent Percentage (%)</Label>
            <Input
              id="today-absent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="e.g. 12.5"
              value={absentPercent}
              onChange={(e) => setAbsentPercent(e.target.value)}
              className="text-lg font-semibold"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="h-10 w-full sm:w-auto">
            {saving ? (
              <span className="flex items-center gap-2">Saving...</span>
            ) : (
              <><ClipboardCheck className="mr-2 h-4 w-4" />Save Today's Data</>
            )}
          </Button>
        </div>
        {existingRow?.absent_percent !== null && existingRow?.absent_percent !== undefined && (
          <p className="text-sm text-muted-foreground mt-3">
            Current value: <span className="font-semibold text-foreground">{existingRow.absent_percent}%</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// =========================================
// Main Admin Page
// =========================================
const Admin = () => {
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [calendarRows, setCalendarRows] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAttendanceCSV(), fetchCalendarCSV()])
      .then(([att, cal]) => {
        setAttendanceRows(att);
        setCalendarRows(cal);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDownloadChart = async () => {
    if (!chartRef.current) return;
    try {
      const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'attendance_chart.png';
      a.click();
      toast({ title: 'Downloaded', description: 'Chart image saved!' });
    } catch {
      toast({ title: 'Error', description: 'Failed to capture chart image', variant: 'destructive' });
    }
  };

  return (
    <Layout>
      <Header
        title="Admin Panel"
        subtitle="Download CSVs, export chart, view & edit data"
      />

      <div className="p-4 md:p-8 space-y-8">
        {/* ========== SECTION 0: Today's Attendance ========== */}
        {!loading && (
          <TodayAttendance
            attendanceRows={attendanceRows}
            calendarRows={calendarRows}
            onSave={async (updated) => {
              setAttendanceRows(updated);
              const csv = buildAttendanceCSV(updated);
              const ok = await saveCSVToFile('attendance.csv', csv);
              invalidateAttendanceCache();
              if (ok) {
                toast({ title: 'Saved', description: `Today's attendance updated in attendance.csv!` });
              } else {
                toast({ title: 'Error', description: 'Failed to save file. Downloading instead...', variant: 'destructive' });
                downloadBlob(csv, 'attendance.csv');
              }
            }}
          />
        )}

        {/* ========== SECTION 1: Downloads ========== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 section-title">
              <Download className="h-5 w-5" /> Downloads
            </CardTitle>
            <CardDescription>Download CSV files & attendance chart image</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Button className="w-full justify-start" variant="outline" onClick={() => downloadBlob(buildAttendanceCSV(attendanceRows), 'attendance.csv')} disabled={loading}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Download attendance.csv
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => downloadBlob(buildCalendarCSV(calendarRows), '2026_calander.csv')} disabled={loading}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Download 2026_calander.csv
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={handleDownloadChart}>
                <Image className="mr-2 h-4 w-4" />
                Download Chart as Image
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ========== SECTION 1.5: Deployment Tutorial ========== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 section-title">
              <Rocket className="h-5 w-5" /> Deployment Steps (Render, Vercel, GitHub)
            </CardTitle>
            <CardDescription>
              Admin reference guide for publishing this portal online.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border p-4 bg-muted/20">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <Cloud className="h-4 w-4 text-primary" /> Vercel Deploy
                </h3>
                <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                  <li>Push your code to a GitHub repository.</li>
                  <li>In the Vercel dashboard, choose New Project.</li>
                  <li>Import the GitHub repository and let Vercel detect Vite automatically.</li>
                  <li>Set the build command to npm run build and output directory to dist.</li>
                  <li>Click Deploy and verify the generated URL.</li>
                </ol>
              </div>

              <div className="rounded-xl border p-4 bg-muted/20">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <Rocket className="h-4 w-4 text-primary" /> Render Deploy
                </h3>
                <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                  <li>In Render, use New + to create a Static Site.</li>
                  <li>Connect your GitHub repository.</li>
                  <li>Use npm install ; npm run build as the build command.</li>
                  <li>Set the publish directory to dist.</li>
                  <li>Enable Auto Deploy and test the production URL.</li>
                </ol>
              </div>

              <div className="rounded-xl border p-4 bg-muted/20">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <Github className="h-4 w-4 text-primary" /> GitHub Workflow
                </h3>
                <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                  <li>Create a feature branch and commit your changes.</li>
                  <li>Open a Pull Request and collect review approvals.</li>
                  <li>After merging the PR, check that deployment is triggered.</li>
                  <li>Confirm build success in GitHub Actions logs.</li>
                  <li>Document the latest portal updates in release notes.</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ========== SECTION 2: Chart Preview ========== */}
        <div ref={chartRef}>
          <AttendanceChart />
        </div>

        {/* ========== SECTION 3: CSV Editors ========== */}
        <Tabs defaultValue="attendance" className="w-full">
          <TabsList className="mb-4 w-full grid grid-cols-1 sm:grid-cols-2 h-auto gap-2 bg-transparent p-0">
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              attendance.csv
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              2026_calander.csv
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <CardTitle className="section-title">Attendance Data — View & Edit</CardTitle>
                <CardDescription>{attendanceRows.length} rows · Click pencil icon to edit a row, then Save</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <p className="text-muted-foreground">Loading...</p> : (
                  <AttendanceEditor
                    rows={attendanceRows}
                    onSave={async (updated) => {
                      setAttendanceRows(updated);
                      const csv = buildAttendanceCSV(updated);
                      const ok = await saveCSVToFile('attendance.csv', csv);
                      invalidateAttendanceCache();
                      if (ok) {
                        toast({ title: 'Saved', description: 'attendance.csv updated successfully!' });
                      } else {
                        toast({ title: 'Error', description: 'Failed to save file. Downloading instead...', variant: 'destructive' });
                        downloadBlob(csv, 'attendance.csv');
                      }
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar">
            <Card>
              <CardHeader>
                <CardTitle className="section-title">Calendar Data — View & Edit</CardTitle>
                <CardDescription>{calendarRows.length} rows · Click pencil icon to edit a row, then Save</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <p className="text-muted-foreground">Loading...</p> : (
                  <CalendarEditor
                    rows={calendarRows}
                    onSave={async (updated) => {
                      setCalendarRows(updated);
                      const csv = buildCalendarCSV(updated);
                      const ok = await saveCSVToFile('2026_calander.csv', csv);
                      invalidateCalendarCache();
                      if (ok) {
                        toast({ title: 'Saved', description: '2026_calander.csv updated successfully!' });
                      } else {
                        toast({ title: 'Error', description: 'Failed to save file. Downloading instead...', variant: 'destructive' });
                        downloadBlob(csv, '2026_calander.csv');
                      }
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
