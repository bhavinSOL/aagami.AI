// CSV Service - Fetches real data from attendance.csv and 2026_calander.csv

import { API_BASE } from '@/lib/network';
import { predictByMonth } from '@/lib/apiService';

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
  absenteeism: number;
  predicted: number;
  actual: number;
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

// Fetch and parse attendance.csv (historical data with actual absent_percent)
export async function fetchAttendanceCSV(): Promise<AttendanceRow[]> {
  try {
    const response = await fetch('/attendance.csv');
    if (!response.ok) throw new Error(`Failed to fetch attendance.csv: ${response.status}`);
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    // Skip header line
    return lines.slice(1).map(line => {
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
  } catch (error) {
    console.error('Error fetching attendance.csv:', error);
    return [];
  }
}

// Fetch and parse 2026_calander.csv (calendar data for future predictions)
export async function fetchCalendarCSV(): Promise<CalendarRow[]> {
  try {
    const response = await fetch('/2026_calander.csv');
    if (!response.ok) throw new Error(`Failed to fetch 2026_calander.csv: ${response.status}`);
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    return lines.slice(1).map(line => {
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
  } catch (error) {
    console.error('Error fetching 2026_calander.csv:', error);
    return [];
  }
}

// API base URL for predictions
// Fetch predicted value from your API for a specific date
export async function fetchDayPrediction(dateStr: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout (increased from 5s)
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
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout (increased)
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
async function fetchWeekPrediction(startDate: string): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/predict/week?start_date=${startDate}`);
    if (!res.ok) throw new Error(`predict/week failed: ${res.status}`);
    const data = await res.json();
    return parseFloat(data.average_week_absentees_percentage.replace('%', ''));
  } catch {
    return 0;
  }
}

// Fetch month prediction from API
async function fetchMonthPrediction(year: number, month: number): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/predict/month?year=${year}&month=${month}`);
    if (!res.ok) throw new Error(`predict/month failed: ${res.status}`);
    const data = await res.json();
    return parseFloat(data.average_month_absentees_percentage.replace('%', ''));
  } catch {
    return 0;
  }
}

// ==========================================
// MAIN FUNCTIONS: Prepare ChartData from CSVs + API
// ==========================================

// Prepare DAILY chart data from attendance.csv + API predictions
export async function getDailyChartData(viewDate: Date): Promise<ChartData[]> {
  const attendance = await fetchAttendanceCSV();
  const calendar = await fetchCalendarCSV();
  
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
  
  // Build all dates in range from calendar + attendance data
  const allDates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    allDates.push(toLocalDateStr(d));
  }
  
  // Build chart data
  const chartData: ChartData[] = allDates.map(dateStr => {
    const dateObj = new Date(dateStr);
    dateObj.setHours(0, 0, 0, 0);
    
    const actualValue = actualMap[dateStr];
    const predictedValue = predictionsMap[dateStr] || 0;
    const hasActual = actualValue !== undefined && dateObj <= today;
    
    return {
      date: dateStr,
      absenteeism: hasActual ? actualValue : 0,
      actual: hasActual ? actualValue : 0,
      predicted: predictedValue,
    };
  });
  
  return chartData;
}

// Prepare WEEKLY chart data - Show all weeks of the current month
export async function getWeeklyChartData(viewDate: Date): Promise<ChartData[]> {
  const attendance = await fetchAttendanceCSV();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all weeks in the viewed month
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);

  // Find the Sunday of the week containing the first day of month
  const firstWeekStart = new Date(monthStart);
  firstWeekStart.setDate(monthStart.getDate() - monthStart.getDay());

  // Find the Saturday of the week containing the last day of month
  const lastWeekEnd = new Date(monthEnd);
  lastWeekEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const chartData: ChartData[] = [];
  let weekNum = 1;

  // Iterate through all weeks in and around this month
  for (let current = new Date(firstWeekStart); current <= lastWeekEnd; current.setDate(current.getDate() + 7)) {
    const weekStart = new Date(current);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartStr = toLocalDateStr(weekStart);
    const weekEndStr = toLocalDateStr(weekEnd);

    // Calculate actual average from attendance.csv for this week
    const weekRows = attendance.filter(row => {
      return row.date >= weekStartStr && row.date <= weekEndStr &&
             row.absent_percent !== null && !isNaN(row.absent_percent) &&
             row.absent_percent < 50;
    });

    const hasActual = weekRows.length > 0 && weekStart <= today;
    const actualAvg = hasActual
      ? Math.round((weekRows.reduce((sum, r) => sum + (r.absent_percent || 0), 0) / weekRows.length) * 100) / 100
      : 0;

    // Get prediction for all weeks in current month (not just current week)
    let predicted = 0;
    try {
      predicted = await fetchWeekPrediction(weekStartStr);
    } catch {
      predicted = 0;
    }

    const label = `Week ${weekNum}`;

    chartData.push({
      date: label,
      absenteeism: actualAvg,
      actual: hasActual ? actualAvg : 0,
      predicted: predicted,
    });

    weekNum++;
  }

  return chartData;
}

// Prepare MONTHLY chart data - Show previous, current, and next month
export async function getMonthlyChartData(viewDate: Date): Promise<ChartData[]> {
  const attendance = await fetchAttendanceCSV();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const chartData: ChartData[] = [];

  // Show 3 months: previous, current, and next
  for (let i = -1; i <= 1; i++) {
    const monthDate = new Date(viewDate);
    monthDate.setMonth(viewDate.getMonth() + i);

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;

    // Calculate actual average from attendance.csv for this month
    const monthRows = attendance.filter(row => {
      return row.date.startsWith(monthStr) &&
             row.absent_percent !== null && !isNaN(row.absent_percent) &&
             row.absent_percent < 50; // Filter out holidays
    });

    const hasActual = monthRows.length > 0 && monthDate <= today;
    const actualAvg = hasActual
      ? Math.round((monthRows.reduce((sum, r) => sum + (r.absent_percent || 0), 0) / monthRows.length) * 100) / 100
      : 0;

    // Get prediction for all 3 months (previous, current, next)
    let predicted = 0;
    try {
      const predictions = await predictByMonth(year, month);
      predicted = parseFloat(predictions.average_month_absentees_percentage.replace('%', ''));
    } catch {
      predicted = 0;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label = `${monthNames[month - 1]} ${year}`;

    chartData.push({
      date: label,
      absenteeism: actualAvg,
      actual: hasActual ? actualAvg : 0,
      predicted: predicted,
    });
  }

  return chartData;
}
    chartData.push({
      date: label,
      absenteeism: actualAvg,
      actual: hasActual ? actualAvg : 0,
      predicted: predicted,
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

// ==========================================
// GITHUB INTEGRATION: Save CSV files to GitHub
// ==========================================

/**
 * Save CSV file to GitHub repository
 * Falls back to local download if GitHub API fails
 */
export async function saveCSVToFile(filename: string, csvContent: string, forceDownload = false): Promise<boolean> {
  if (forceDownload) {
    // Force download without trying GitHub
    downloadCSV(filename, csvContent);
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/github/update-csv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: filename,
        content: csvContent,
        message: `Update ${filename} - ${new Date().toLocaleString()}`,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`✅ ${filename} saved to GitHub`);
      return true;
    } else if (result.fallback) {
      console.warn(`⚠️ GitHub save failed, suggesting download fallback: ${result.error}`);
      downloadCSV(filename, csvContent);
      return false;
    }

    return false;
  } catch (error) {
    console.error(`Error saving to GitHub: ${error}`);
    // Fallback to download
    downloadCSV(filename, csvContent);
    return false;
  }
}

/**
 * Save calendar CSV to GitHub
 */
export async function saveCalendarCSVToFile(data: CalendarData[]): Promise<boolean> {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const toCSVDate = (isoDate: string) => {
    const [y, m, d] = isoDate.split('-');
    return `${parseInt(d)}-${monthNames[parseInt(m) - 1]}-${y.slice(2)}`;
  };

  const header = 'date,day_of_week,week_number,month,is_holiday,is_festival,festival_weight,festival_name';
  const lines = data.map(r =>
    `${toCSVDate(r.date)},${r.day_of_week},${r.week_number},${r.month},${r.is_holiday},${r.is_festival},${r.festival_weight},${r.festival_name || ''}`
  );
  const csvContent = [header, ...lines].join('\n');

  return await saveCSVToFile('2026_calander.csv', csvContent);
}

/**
 * Helper function to download CSV as fallback
 */
function downloadCSV(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Invalidate calendar cache (if using cache)
 */
export function invalidateCalendarCache(): void {
  // Optional: Clear any caches if implemented
  console.log('Calendar cache invalidated');
}

/**
 * Invalidate attendance cache (if using cache)
 */
export function invalidateAttendanceCache(): void {
  // Optional: Clear any caches if implemented
  console.log('Attendance cache invalidated');
}