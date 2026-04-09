// API Service for Python ML backend
import { API_BASE } from '@/lib/network';

export interface PredictionInput {
  day_of_week: number;
  week_number: number;
  month: number;
  is_holiday: number;
  is_festival: number;
  festival_weight: number;
}

export interface PredictionResponse {
  predicted_absence_percentage: number;
}

// ---- New API Response Types ----
export interface DayPredictionResponse {
  date: string;
  predicted_absentees_percentage: string;
}

export interface WeekPredictionResponse {
  week_start: string;
  average_week_absentees_percentage: string;
}

export interface MonthPredictionResponse {
  year: number;
  month: number;
  average_month_absentees_percentage: string;
}

export interface RangePredictionResponse {
  date: string;
  predicted_absentees_percentage: string;
}

// ---- New API Functions ----
export const predictByDay = async (date: string): Promise<DayPredictionResponse> => {
  const res = await fetch(`${API_BASE}/predict/day?date=${date}`);
  if (!res.ok) throw new Error(`Day prediction failed: ${res.status}`);
  return res.json();
};

export const predictByWeek = async (startDate: string): Promise<WeekPredictionResponse> => {
  const res = await fetch(`${API_BASE}/predict/week?start_date=${startDate}`);
  if (!res.ok) throw new Error(`Week prediction failed: ${res.status}`);
  return res.json();
};

export const predictByMonth = async (year: number, month: number): Promise<MonthPredictionResponse> => {
  const res = await fetch(`${API_BASE}/predict/month?year=${year}&month=${month}`);
  if (!res.ok) throw new Error(`Month prediction failed: ${res.status}`);
  return res.json();
};

export const predictByRange = async (startDate: string, endDate: string): Promise<RangePredictionResponse[]> => {
  const res = await fetch(`${API_BASE}/predict/range?start_date=${startDate}&end_date=${endDate}`);
  if (!res.ok) throw new Error(`Range prediction failed: ${res.status}`);
  return res.json();
};

// ---- Batch / All-weeks / All-months ----

export interface WeekSummary {
  weekLabel: string;
  weekStart: string;
  averageAbsenteeism: number;
}

export interface MonthSummary {
  month: number;
  monthName: string;
  averageAbsenteeism: number;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Predict every day in the given month via /predict/range, then group into weeks. */
export const predictAllWeeksInMonth = async (year: number, month: number): Promise<WeekSummary[]> => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = `${year}-${pad(month)}-01`;
  const endDate   = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  const daily = await predictByRange(startDate, endDate);

  // Group into calendar weeks (Mon-Sun)
  const weeks: WeekSummary[] = [];
  let weekNum = 1;
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const avg = chunk.reduce((s, d) => s + parseFloat(d.predicted_absentees_percentage.replace('%', '')), 0) / chunk.length;
    weeks.push({
      weekLabel: `Week ${weekNum}`,
      weekStart: chunk[0].date,
      averageAbsenteeism: Math.round(avg * 100) / 100,
    });
    weekNum++;
  }
  return weeks;
};

/** Predict all 12 months of a year via /predict/month (sequential). */
export const predictAllMonthsInYear = async (year: number): Promise<MonthSummary[]> => {
  const results: MonthPredictionResponse[] = [];

  // Fetch months sequentially (one by one) to avoid cancellations
  for (let i = 1; i <= 12; i++) {
    try {
      const result = await predictByMonth(year, i);
      results.push(result);
    } catch (err) {
      console.warn(`Failed to fetch month ${i}:`, err);
      // Add empty result to maintain order
      results.push({
        year,
        month: i,
        average_month_absentees_percentage: '0%'
      });
    }
  }

  return results.map((r, i) => ({
    month: i + 1,
    monthName: MONTH_SHORT[i],
    averageAbsenteeism: parseFloat(r.average_month_absentees_percentage.replace('%', '')),
  }));
};

export interface WeatherForecast {
  date: string; // YYYY-MM-DD
  precipitationSum: number; // mm
  precipitationHours: number; // hours
}

const AHMEDABAD_COORDS = {
  latitude: 23.0225,
  longitude: 72.5714,
};

// Function to call your Python ML prediction API
export const getPrediction = async (input: PredictionInput): Promise<number> => {
  try {
    const formData = new FormData();
    formData.append('day_of_week', input.day_of_week.toString());
    formData.append('week_number', input.week_number.toString());
    formData.append('month', input.month.toString());
    formData.append('is_holiday', input.is_holiday.toString());
    formData.append('is_festival', input.is_festival.toString());
    formData.append('festival_weight', input.festival_weight.toString());

    const response = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: PredictionResponse = await response.json();
    return data.predicted_absence_percentage || 0;
  } catch (error) {
    console.error('Error calling ML prediction API:', error);
    // Return fallback prediction
    return 8.5; // Default fallback value
  }
};

const fetchAhmedabadDailyForecast = async (): Promise<WeatherForecast[]> => {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', AHMEDABAD_COORDS.latitude.toString());
  url.searchParams.set('longitude', AHMEDABAD_COORDS.longitude.toString());
  url.searchParams.set('daily', 'precipitation_sum,precipitation_hours');
  url.searchParams.set('timezone', 'Asia/Kolkata');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Weather API request failed: ${response.status}`);
  }

  const data = await response.json();
  const dates: string[] = data?.daily?.time ?? [];
  const sums: number[] = data?.daily?.precipitation_sum ?? [];
  const hours: number[] = data?.daily?.precipitation_hours ?? [];

  return dates.map((date, index) => ({
    date,
    precipitationSum: sums[index] ?? 0,
    precipitationHours: hours[index] ?? 0,
  }));
};

const toLocalDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getForecastForDate = async (date: Date): Promise<WeatherForecast | null> => {
  const target = toLocalDateStr(date);
  try {
    const forecasts = await fetchAhmedabadDailyForecast();
    return forecasts.find((item) => item.date === target) ?? null;
  } catch (error) {
    console.warn('Weather API error:', error);
    return null;
  }
};

const getWeatherImpact = (precipitationSum: number): number => {
  if (precipitationSum >= 50) return 4.0; // very heavy rain
  if (precipitationSum >= 25) return 2.5; // heavy rain
  if (precipitationSum >= 10) return 1.5; // moderate rain
  if (precipitationSum >= 1) return 0.5; // light rain
  return 0;
};

const clampPrediction = (value: number): number => Math.min(100, Math.max(0, value));

export const getPredictionWithWeather = async (
  input: PredictionInput,
  targetDate: Date
): Promise<{ prediction: number; weather: WeatherForecast | null; adjustment: number }> => {
  const basePrediction = await getPrediction(input);
  const weather = await getForecastForDate(targetDate);
  const adjustment = weather ? getWeatherImpact(weather.precipitationSum) : 0;
  const prediction = clampPrediction(basePrediction + adjustment);

  return { prediction, weather, adjustment };
};

// Helper function to get current date parameters for prediction
export const getCurrentDateParams = (): PredictionInput => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const weekNumber = getWeekNumber(today);
  const month = today.getMonth() + 1; // 1-12
  
  // You can customize these based on your requirements
  const is_holiday = 0; // Set to 1 if today is a holiday
  const is_festival = 0; // Set to 1 if today has a festival
  const festival_weight = 0; // Set festival weight if applicable

  return {
    day_of_week: dayOfWeek,
    week_number: weekNumber,
    month: month,
    is_holiday: is_holiday,
    is_festival: is_festival,
    festival_weight: festival_weight,
  };
};

// Helper function to get week number (Sunday-start weeks, 0 = Sunday)
const getWeekNumber = (date: Date): number => {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const firstDayOfWeek = startOfYear.getDay(); // 0 = Sunday
  return Math.floor((dayOfYear + firstDayOfWeek) / 7) + 1;
};

// Function to get prediction for tomorrow
export const getTomorrowPrediction = async (): Promise<number> => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const params: PredictionInput = {
    day_of_week: tomorrow.getDay(),
    week_number: getWeekNumber(tomorrow),
    month: tomorrow.getMonth() + 1,
    is_holiday: 0, // You can customize this based on your holiday calendar
    is_festival: 0,
    festival_weight: 0,
  };

  return await getPrediction(params);
};

export const getTomorrowPredictionWithWeather = async (): Promise<{
  prediction: number;
  weather: WeatherForecast | null;
  adjustment: number;
}> => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const params: PredictionInput = {
    day_of_week: tomorrow.getDay(),
    week_number: getWeekNumber(tomorrow),
    month: tomorrow.getMonth() + 1,
    is_holiday: 0,
    is_festival: 0,
    festival_weight: 0,
  };

  return await getPredictionWithWeather(params, tomorrow);
};