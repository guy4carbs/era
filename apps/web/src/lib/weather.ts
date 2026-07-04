/**
 * Server-only weather lookup for Ovi's daily styling. Uses Open-Meteo, which is
 * free and needs no API key. Coordinates come in already coarsened by the client
 * and are used only for this one request — never stored, never logged.
 *
 * Any failure (network, timeout, unexpected shape) resolves to null so styling
 * proceeds weatherless rather than failing. Import only from server code.
 */
import type { Weather } from '@era/core/ovi';

/** Open-Meteo current-conditions endpoint. */
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Hard ceiling on the lookup so a slow upstream never stalls a styling turn. */
const WEATHER_TIMEOUT_MS = 5_000;

/** Open-Meteo `current` block we consume — validated before use. */
interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
}

/** A coarse condition bucket plus the human line Ovi styles around. */
interface CodeMapping {
  condition: string;
  description: string;
}

/**
 * Map a WMO weather code to a coarse condition + description. Ranges follow the
 * Open-Meteo / WMO 4677 table. Unknown codes fall back to a neutral "cloudy".
 */
function mapWeatherCode(code: number): CodeMapping {
  if (code === 0) return { condition: 'clear', description: 'clear sky' };
  if (code === 1) return { condition: 'clear', description: 'mainly clear' };
  if (code === 2) return { condition: 'cloudy', description: 'partly cloudy' };
  if (code === 3) return { condition: 'cloudy', description: 'overcast' };
  if (code === 45 || code === 48) return { condition: 'fog', description: 'fog' };
  if (code >= 51 && code <= 55) return { condition: 'rain', description: 'drizzle' };
  if (code === 56 || code === 57) return { condition: 'sleet', description: 'freezing drizzle' };
  if (code >= 61 && code <= 65) return { condition: 'rain', description: 'rain' };
  if (code === 66 || code === 67) return { condition: 'sleet', description: 'freezing rain' };
  if (code >= 71 && code <= 75) return { condition: 'snow', description: 'snow' };
  if (code === 77) return { condition: 'snow', description: 'snow grains' };
  if (code >= 80 && code <= 82) return { condition: 'rain', description: 'rain showers' };
  if (code === 85 || code === 86) return { condition: 'snow', description: 'snow showers' };
  if (code === 95) return { condition: 'thunderstorm', description: 'thunderstorm' };
  if (code === 96 || code === 99) return { condition: 'thunderstorm', description: 'thunderstorm with hail' };
  return { condition: 'cloudy', description: 'cloudy' };
}

/**
 * Fetch current conditions for a coordinate. Returns null on any failure or
 * malformed response — the caller styles weatherless in that case. The
 * coordinate is used only for this request and never persisted.
 */
export async function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as OpenMeteoResponse;
    const current = data.current;
    if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
      return null;
    }
    const { condition, description } = mapWeatherCode(current.weather_code);
    return { tempC: current.temperature_2m, condition, description };
  } catch {
    // Timeout, network error, or bad JSON — style without weather.
    return null;
  }
}
