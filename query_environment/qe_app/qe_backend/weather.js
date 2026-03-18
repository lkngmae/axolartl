require('dotenv').config();

const GOOGLE_WEATHER_ENDPOINT =
    'https://weather.googleapis.com/v1/currentConditions:lookup';
const GOOGLE_HOURLY_FORECAST_ENDPOINT =
    'https://weather.googleapis.com/v1/forecast/hours:lookup';

function normalizePrecipProbability(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num > 1) return Math.min(1, Math.max(0, num / 100));
    return Math.min(1, Math.max(0, num));
}

function parseTempField(tempField) {
    if (tempField == null) return { value: null, unit: null };

    if (typeof tempField === 'number') {
        return { value: tempField, unit: null };
    }

    const value = Number(
        tempField.degrees ?? tempField.value ?? tempField.temperature
    );
    const unit = String(
        tempField.unit ?? tempField.unitType ?? tempField.unitCode ?? ''
    ).toUpperCase();

    return {
        value: Number.isFinite(value) ? value : null,
        unit: unit || null
    };
}

function toFahrenheit(tempField) {
    const { value, unit } = parseTempField(tempField);
    if (value == null) return null;
    if (!unit) return value;

    if (unit.includes('CELSIUS') || unit === 'C' || unit === 'CELSIUS') {
        return (value * 9) / 5 + 32;
    }
    return value;
}

async function getCurrentWeather(lat, lon) {
    const apiKey = process.env.GOOGLE_WEATHER_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_WEATHER_API_KEY is not set');
    }

    const url = new URL(GOOGLE_WEATHER_ENDPOINT);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lon));

    try {
        const response = await fetch(url.toString());
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`HTTP ${response.status}: ${body}`);
        }

        const data = await response.json();

        return {
            temperature: toFahrenheit(data.temperature),
            feelsLike: toFahrenheit(data.feelsLikeTemperature),
            precipitationProbability: normalizePrecipProbability(
                data.precipitationProbability
            ),
            uvIndex: Number.isFinite(Number(data.uvIndex))
                ? Number(data.uvIndex)
                : null,
            condition:
                data.weatherCondition?.description?.text ??
                data.weatherCondition?.type ??
                data.weatherCondition ??
                null
        };
    } catch (error) {
        throw new Error(`Failed to fetch current weather: ${error.message}`);
    }
}

function getHourFromTimeString(hhmm) {
    if (!hhmm) return null;
    const parts = String(hhmm).split(':');
    if (parts.length < 1) return null;
    const hour = Number(parts[0]);
    return Number.isFinite(hour) ? hour : null;
}

function extractForecastHours(data) {
    if (!data) return [];
    // Be defensive: different API surfaces sometimes name this differently.
    return (
        data.forecastHours ||
        data.hours ||
        data.hourlyForecasts ||
        data.hourly ||
        []
    );
}

function pickForecastHour(forecastHours, preferredHour) {
    if (!Array.isArray(forecastHours) || forecastHours.length === 0) return null;
    if (preferredHour == null) return forecastHours[0] || null;

    // Prefer exact local-hour match if available.
    for (const hour of forecastHours) {
        const display = hour.displayDateTime || hour.displayTime || hour.dateTime;
        const h = display?.hours;
        if (Number.isFinite(Number(h)) && Number(h) === preferredHour) {
            return hour;
        }
    }

    // Fallback: closest hour by absolute difference.
    let best = null;
    let bestDelta = Infinity;
    for (const hour of forecastHours) {
        const display = hour.displayDateTime || hour.displayTime || hour.dateTime;
        const h = Number(display?.hours);
        if (!Number.isFinite(h)) continue;
        const delta = Math.abs(h - preferredHour);
        if (delta < bestDelta) {
            best = hour;
            bestDelta = delta;
        }
    }
    return best || forecastHours[0] || null;
}

function normalizeForecastHourToWeather(hourData) {
    if (!hourData) return null;

    return {
        temperature: toFahrenheit(hourData.temperature ?? hourData.airTemperature),
        feelsLike: toFahrenheit(
            hourData.feelsLikeTemperature ?? hourData.apparentTemperature
        ),
        precipitationProbability: normalizePrecipProbability(
            hourData.precipitationProbability ??
            hourData.precipProbability ??
            hourData.precipitation?.probability
        ),
        uvIndex: Number.isFinite(Number(hourData.uvIndex))
            ? Number(hourData.uvIndex)
            : null,
        condition:
            hourData.weatherCondition?.description?.text ??
            hourData.weatherCondition?.type ??
            hourData.weatherCondition ??
            null
    };
}

async function getHourlyForecastWeather(lat, lon, preferredTime) {
    const apiKey = process.env.GOOGLE_WEATHER_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_WEATHER_API_KEY is not set');
    }

    const url = new URL(GOOGLE_HOURLY_FORECAST_ENDPOINT);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lon));

    const preferredHour = getHourFromTimeString(preferredTime);

    try {
        const response = await fetch(url.toString());
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`HTTP ${response.status}: ${body}`);
        }

        const data = await response.json();
        const forecastHours = extractForecastHours(data);
        const picked = pickForecastHour(forecastHours, preferredHour);
        const weather = normalizeForecastHourToWeather(picked);
        if (!weather) return null;
        return weather;
    } catch (error) {
        throw new Error(`Failed to fetch hourly forecast: ${error.message}`);
    }
}

function classifyWeather(weather) {
    if (!weather) return 'great_outdoor';

    if ((weather.uvIndex ?? 0) > 9) return 'extreme';
    if ((weather.precipitationProbability ?? 0) > 0.5) return 'rainy';
    if ((weather.feelsLike ?? weather.temperature ?? 70) > 80) return 'hot';
    if ((weather.feelsLike ?? weather.temperature ?? 70) < 45) return 'cold';

    return 'great_outdoor';
}

module.exports = {
    getCurrentWeather,
    getHourlyForecastWeather,
    classifyWeather
};
