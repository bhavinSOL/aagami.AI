// CSV Service - Fetches real data from attendance.csv and 2026_calander.csv
import { API_BASE } from '@/lib/network';

// Helper: format Date to YYYY-MM-DD using local time (avoids UTC shift from toISOString)
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface AttendanceRow {
  date: string;        // YYYY-MM-DD format
  day_of_week: number;
  week_number: number;
  month: number;
  is_holiday: number;
  is_festival: number;
  festival_weight: number;
  festival_name: string;
  absent_percent: number | null; // null if no data (future dates)
}

export interface CalendarRow {
  date: string;        // YYYY-MM-DD format
  day_of_week: number;
  week_number: number;
  month: number;
  is_holiday: number;
  is_festival: number;
  festival_weight: number;
  festival_name: string;
}

export interface ChartData {
  date: string;
  absenteeism: number | null;
  predicted: number | null;
  actual: number | null;
}

// Parse "1-Jan-26" -> "2026-01-01" (YYYY-MM-DD)
function parseDateStr(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const day = parts[0].padStart(2, '0');
  const monthStr = parts[1];
  const yearShort = parts[2];
  
  const monthMap: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  const month = monthMap[monthStr] || '01';
  const year = '20' + yearShort;
  
  return `${year}-${month}-${day}`;
}

// Simple in-memory CSV caches (avoids redundant network fetches)
let _attendanceCache: AttendanceRow[] | null = null;
let _calendarCache: CalendarRow[] | null = null;

// Invalidate caches so next fetch re-reads from disk
export function invalidateAttendanceCache() { _attendanceCache = null; }
export function invalidateCalendarCache() { _calendarCache = null; }

// Fetch and parse attendance.csv (historical data with actual absent_percent)
export async function fetchAttendanceCSV(): Promise<AttendanceRow[]> {
  if (_attendanceCache) return _attendanceCache;
  try {
    const response = await fetch('https://raw.githubusercontent.com/bhavinSOL/TATA-Attendance/refs/heads/main/public/attendance.csv');
    if (!response.ok) throw new Error(`Failed to fetch attendance.csv: ${response.status}`);
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    // Skip header line
    const result = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const absentStr = values[8];
      const absentPercent = absentStr && absentStr !== '' ? parseFloat(absentStr) : null;
      
      return {
        date: parseDateStr(values[0]),
        day_of_week: parseInt(values[1]) || 0,
        week_number: parseInt(values[2]) || 0,
        month: parseInt(values[3]) || 1,
        is_holiday: parseInt(values[4]) || 0,
        is_festival: parseInt(values[5]) || 0,
        festival_weight: parseFloat(values[6]) || 0,
        festival_name: values[7] || '',
        absent_percent: absentPercent,
      };
    });
    _attendanceCache = result;
    return result;
  } catch (error) {
    console.error('Error fetching attendance.csv:', error);
    return [];
  }
}

// Fetch and parse 2026_calander.csv (calendar data for future predictions)
export async function fetchCalendarCSV(): Promise<CalendarRow[]> {
  if (_calendarCache) return _calendarCache;
  try {
    const response = await fetch('https://raw.githubusercontent.com/bhavinSOL/TATA-Attendance/refs/heads/main/public/2026_calander.csv');
    if (!response.ok) throw new Error(`Failed to fetch 2026_calander.csv: ${response.status}`);
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    const result = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return {
        date: parseDateStr(values[0]),
        day_of_week: parseInt(values[1]) || 0,
        week_number: parseInt(values[2]) || 0,
        month: parseInt(values[3]) || 1,
        is_holiday: parseInt(values[4]) || 0,
        is_festival: parseInt(values[5]) || 0,
        festival_weight: parseFloat(values[6]) || 0,
        festival_name: values[7] || '',
      };
    });
    _calendarCache = result;
    return result;
  } catch (error) {
    console.error('Error fetching 2026_calander.csv:', error);
    return [];
  }
}

// Fetch predicted value from your API for a specific date
export async function fetchDayPrediction(dateStr: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_BASE}/predict/day?date=${dateStr}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`predict/day failed: ${res.status}`);
    const data = await res.json();
    return parseFloat(data.predicted_absentees_percentage.replace('%', ''));
  } catch (err) {
    console.error('Day prediction API error:', err);
    return null;
  }
}

// Fetch predicted values for a date range from your API
async function fetchRangePrediction(startDate: string, endDate: string): Promise<Record<string, number>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s for large ranges
    const res = await fetch(`${API_BASE}/predict/range?start_date=${startDate}&end_date=${endDate}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`predict/range failed: ${res.status}`);
    const data: Array<{ date: string; predicted_absentees_percentage: string }> = await res.json();
    
    const map: Record<string, number> = {};
    data.forEach(item => {
      map[item.date] = parseFloat(item.predicted_absentees_percentage.replace('%', ''));
    });
    return map;
  } catch {
    return {};
  }
}

// Fetch week prediction from API
async function fetchWeekPrediction(startDate: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_BASE}/predict/week?start_date=${startDate}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`predict/week failed: ${res.status}`);
    const data = await res.json();
    return parseFloat(data.average_week_absentees_percentage.replace('%', ''));
  } catch {
    return null;
  }
}

// Fetch month prediction from API
async function fetchMonthPrediction(year: number, month: number): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_BASE}/predict/month?year=${year}&month=${month}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`predict/month failed: ${res.status}`);
    const data = await res.json();
    return parseFloat(data.average_month_absentees_percentage.replace('%', ''));
  } catch {
    return null;
  }
}

// ==========================================
// MAIN FUNCTIONS: Prepare ChartData from CSVs + API
// ==========================================

// Prepare DAILY chart data from attendance.csv + API predictions
export async function getDailyChartData(viewDate: Date): Promise<ChartData[]> {
  const attendance = await fetchAttendanceCSV();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Build start/end range: 15 days before viewDate, 15 days after
  const startDate = new Date(viewDate);
  startDate.setDate(viewDate.getDate() - 15);
  const endDate = new Date(viewDate);
  endDate.setDate(viewDate.getDate() + 15);
  
  const startStr = toLocalDateStr(startDate);
  const endStr = toLocalDateStr(endDate);
  
  // Build a map of actual attendance data
  const actualMap: Record<string, number> = {};
  attendance.forEach(row => {
    if (row.absent_percent !== null && !isNaN(row.absent_percent)) {
      actualMap[row.date] = row.absent_percent;
    }
  });
  
  // Fetch predictions from your API for the date range
  const predictionsMap = await fetchRangePrediction(startStr, endStr);
  
  // Build all dates in range
  const allDates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    allDates.push(toLocalDateStr(d));
  }
  
  // Build chart data
  const chartData: ChartData[] = allDates.map(dateStr => {
    const dateObj = new Date(dateStr);
    dateObj.setHours(0, 0, 0, 0);
    
    const actualValue = actualMap[dateStr];
    const predictedValue = predictionsMap[dateStr] ?? null;
    const hasActual = actualValue !== undefined && dateObj <= today;
    
    return {
      date: dateStr,
      absenteeism: hasActual ? actualValue : null,
      actual: hasActual ? actualValue : null,
      predicted: predictedValue,
    };
  });
  
  return chartData;
}

// Prepare WEEKLY chart data
export async function getWeeklyChartData(viewDate: Date): Promise<ChartData[]> {
  const attendance = await fetchAttendanceCSV();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-based
  
  // First and last day of the current month
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0);
  
  // Collect all weeks from current month's first week to last week
  const weeks: { weekStart: Date; weekEnd: Date; weekStartStr: string; weekEndStr: string }[] = [];
  const firstSunday = new Date(monthStart);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());
  
  for (let d = new Date(firstSunday); d <= monthEnd; d.setDate(d.getDate() + 7)) {
    const weekStart = new Date(d);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weeks.push({
      weekStart, weekEnd,
      weekStartStr: toLocalDateStr(weekStart),
      weekEndStr: toLocalDateStr(weekEnd),
    });
  }
  
  // Use /predict/range for the entire span (single API call, proven endpoint)
  const rangeStart = weeks[0].weekStartStr;
  const rangeEnd = weeks[weeks.length - 1].weekEndStr;
  const predictionsMap = await fetchRangePrediction(rangeStart, rangeEnd);
  
  const chartData: ChartData[] = [];
  
  for (let idx = 0; idx < weeks.length; idx++) {
    const { weekStart, weekStartStr, weekEndStr } = weeks[idx];
    const weekRows = attendance.filter(row =>
      row.date >= weekStartStr && row.date <= weekEndStr &&
      row.absent_percent !== null && !isNaN(row.absent_percent)
    );
    const hasActual = weekRows.length > 0 && weekStart <= today;
    const actualAvg = hasActual
      ? Math.round((weekRows.reduce((sum, r) => sum + (r.absent_percent || 0), 0) / weekRows.length) * 100) / 100
      : null;
    
    // Average daily predictions for this week from range data
    const weekPredictions: number[] = [];
    for (let wd = new Date(weekStart); wd <= weeks[idx].weekEnd; wd.setDate(wd.getDate() + 1)) {
      const ds = toLocalDateStr(wd);
      if (predictionsMap[ds] !== undefined) weekPredictions.push(predictionsMap[ds]);
    }
    const predictedAvg = weekPredictions.length > 0
      ? Math.round((weekPredictions.reduce((s, v) => s + v, 0) / weekPredictions.length) * 100) / 100
      : null;
    
    chartData.push({
      date: `Week ${weekStartStr}`,
      absenteeism: actualAvg,
      actual: actualAvg,
      predicted: predictedAvg,
    });
  }
  
  return chartData;
}

// Prepare MONTHLY chart data
export async function getMonthlyChartData(viewDate: Date): Promise<ChartData[]> {
  const attendance = await fetchAttendanceCSV();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const chartData: ChartData[] = [];
  
  // Previous month, current month, next month (3 total)
  const months: { monthDate: Date; year: number; month: number; monthStr: string }[] = [];
  for (let i = -1; i <= 1; i++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    months.push({ monthDate, year, month, monthStr });
  }

  // Use /predict/range for the entire 3-month span (single API call, proven endpoint)
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const rangeStart = `${firstMonth.monthStr}-01`;
  const lastDay = new Date(lastMonth.year, lastMonth.month, 0).getDate();
  const rangeEnd = `${lastMonth.monthStr}-${String(lastDay).padStart(2, '0')}`;
  const predictionsMap = await fetchRangePrediction(rangeStart, rangeEnd);
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let idx = 0; idx < months.length; idx++) {
    const { monthDate, month, monthStr, year } = months[idx];
    const monthRows = attendance.filter(row =>
      row.date.startsWith(monthStr) &&
      row.absent_percent !== null && !isNaN(row.absent_percent)
    );
    const hasActual = monthRows.length > 0 && monthDate <= today;
    const actualAvg = hasActual
      ? Math.round((monthRows.reduce((sum, r) => sum + (r.absent_percent || 0), 0) / monthRows.length) * 100) / 100
      : null;
    
    // Average daily predictions for this month from range data
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthPredictions: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${monthStr}-${String(d).padStart(2, '0')}`;
      if (predictionsMap[ds] !== undefined) monthPredictions.push(predictionsMap[ds]);
    }
    const predictedAvg = monthPredictions.length > 0
      ? Math.round((monthPredictions.reduce((s, v) => s + v, 0) / monthPredictions.length) * 100) / 100
      : null;
    
    chartData.push({
      date: `${monthNames[month - 1]} ${year}`,
      absenteeism: actualAvg,
      actual: actualAvg,
      predicted: predictedAvg,
    });
  }
  
  return chartData;
}

// ==========================================
// BACKWARD COMPATIBLE: CalendarData type + CSVService class
// Used by Calendar.tsx page
// ==========================================

export interface CalendarData {
  date: string;
  day_of_week: number;
  week_number: number;
  month: number;
  is_holiday: number;
  is_festival: number;
  festival_weight: number;
  festival_name: string;
}

// Save CSV content to public/ folder via Vite dev server middleware
export async function saveCSVToFile(filename: string, content: string): Promise<boolean> {
  try {
    const res = await fetch('/api/save-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const CALENDAR_EDITS_KEY = 'calendar_edits';

// Convert YYYY-MM-DD back to CSV format like "1-Jan-26"
function toCSVDateStr(isoDate: string): string {
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = parseInt(dayStr);
  const month = parseInt(monthStr) - 1;
  const yearShort = yearStr.slice(2);
  return `${day}-${monthNames[month]}-${yearShort}`;
}

export class CSVService {
  // Load calendar data from CSV and merge with any localStorage edits
  static async loadCalendarData(): Promise<CalendarData[]> {
    try {
      const rows = await fetchCalendarCSV();
      const baseData: CalendarData[] = rows.map(r => ({
        date: r.date,
        day_of_week: r.day_of_week,
        week_number: r.week_number,
        month: r.month,
        is_holiday: r.is_holiday,
        is_festival: r.is_festival,
        festival_weight: r.festival_weight,
        festival_name: r.festival_name,
      }));

      // Merge localStorage edits on top of CSV data
      const edits = CSVService.getLocalEdits();
      if (Object.keys(edits).length > 0) {
        for (let i = 0; i < baseData.length; i++) {
          const edit = edits[baseData[i].date];
          if (edit) {
            baseData[i] = { ...baseData[i], ...edit };
          }
        }
        // Add any new dates that weren't in the original CSV
        for (const dateStr of Object.keys(edits)) {
          if (!baseData.find(d => d.date === dateStr)) {
            baseData.push(edits[dateStr]);
          }
        }
        // Sort by date
        baseData.sort((a, b) => a.date.localeCompare(b.date));
      }

      return baseData;
    } catch (error) {
      console.error('Error loading calendar data:', error);
      return [];
    }
  }

  // Save a single date edit to localStorage
  static saveEdit(entry: CalendarData): void {
    const edits = CSVService.getLocalEdits();
    edits[entry.date] = entry;
    localStorage.setItem(CALENDAR_EDITS_KEY, JSON.stringify(edits));
  }

  // Get all localStorage edits
  static getLocalEdits(): Record<string, CalendarData> {
    try {
      const raw = localStorage.getItem(CALENDAR_EDITS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  // Save entire calendar data - persists edits + downloads updated CSV
  static async saveCalendarData(data: CalendarData[]): Promise<void> {
    // Save all changes to localStorage
    const edits = CSVService.getLocalEdits();
    data.forEach(entry => {
      edits[entry.date] = entry;
    });
    localStorage.setItem(CALENDAR_EDITS_KEY, JSON.stringify(edits));
  }

  // Export updated calendar as CSV file download
  static exportAsCSV(data: CalendarData[]): void {
    const header = 'date,day_of_week,week_number,month,is_holiday,is_festival,festival_weight,festival_name';
    const rows = data.map(d => {
      const csvDate = toCSVDateStr(d.date);
      return `${csvDate},${d.day_of_week},${d.week_number},${d.month},${d.is_holiday},${d.is_festival},${d.festival_weight},${d.festival_name || ''}`;
    });
    const csvContent = [header, ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '2026_calander.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Clear all local edits
  static clearEdits(): void {
    localStorage.removeItem(CALENDAR_EDITS_KEY);
  }
}
