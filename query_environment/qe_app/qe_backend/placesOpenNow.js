function getPlacesApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
}

const DEBUG_PLACES = process.env.DEBUG_PLACES === 'true';

function normalizePlaceId(place) {
  const id = place?.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  const name = place?.name;
  if (typeof name === 'string' && name.startsWith('places/')) return name.slice('places/'.length);
  return null;
}

async function logPlacesHttpFailure(prefix, resp) {
  try {
    const status = resp?.status;
    if (!DEBUG_PLACES) {
      console.warn(`[PLACES] ${prefix} failed (HTTP ${status}). Set DEBUG_PLACES=true for response body.`);
      return;
    }
    const text = await resp.text().catch(() => '');
    console.warn(`[PLACES] ${prefix} failed (HTTP ${status})`, text.slice(0, 600));
  } catch {
    console.warn(`[PLACES] ${prefix} failed (and response body could not be read).`);
  }
}

function parseHHMM(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':');
  const hour = Number(h);
  const minute = Number(m ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour: Math.max(0, Math.min(23, hour)), minute: Math.max(0, Math.min(59, minute)) };
}

function pointToWeekMinutes(point) {
  if (!point) return null;
  const day = Number(point.day);
  const hour = Number(point.hour ?? 0);
  const minute = Number(point.minute ?? 0);
  if (!Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return day * 1440 + hour * 60 + minute;
}

function isOpenAtWeekMinutes(periods, weekMinutes) {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  if (!Number.isFinite(weekMinutes)) return null;

  const WEEK = 7 * 24 * 60;
  const candidates = [weekMinutes, weekMinutes + WEEK];

  for (const p of periods) {
    const openMin = pointToWeekMinutes(p.open);
    if (openMin == null) continue;
    const closeMinRaw = pointToWeekMinutes(p.close);

    // 24/7 representation: close may be missing.
    if (closeMinRaw == null) return true;

    let closeMin = closeMinRaw;
    if (closeMin <= openMin) closeMin += WEEK;

    for (const t of candidates) {
      if (t >= openMin && t < closeMin) return true;
    }
  }
  return false;
}

function computeTargetWeekMinutes(utcOffsetMinutes, preferredTimeHHMM) {
  const parsed = parseHHMM(preferredTimeHHMM);
  if (!parsed) return null;

  const offset = Number(utcOffsetMinutes);
  const offsetMs = Number.isFinite(offset) ? offset * 60_000 : 0;

  const nowUtc = Date.now();
  const nowLocal = new Date(nowUtc + offsetMs);
  const targetLocal = new Date(nowUtc + offsetMs);
  targetLocal.setHours(parsed.hour, parsed.minute, 0, 0);

  // If the time already passed "today" in local time, pick the next day.
  if (targetLocal.getTime() < nowLocal.getTime()) {
    targetLocal.setDate(targetLocal.getDate() + 1);
  }

  const day = targetLocal.getDay(); // 0=Sunday..6
  const minutes = day * 1440 + parsed.hour * 60 + parsed.minute;
  return minutes;
}

async function placesGetDetails(placeId) {
  const apiKey = getPlacesApiKey();
  if (!apiKey) return null;
  if (!placeId) return null;

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const fieldMask = [
    'id',
    'displayName',
    'currentOpeningHours',
    'regularOpeningHours',
    'utcOffsetMinutes'
  ].join(',');

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      }
    });

    if (!resp.ok) {
      await logPlacesHttpFailure('placeDetails', resp);
      return null;
    }

    const place = await resp.json();
    const openNow = place?.currentOpeningHours?.openNow ?? place?.currentOpeningHours?.open_now;
    const regular = place?.regularOpeningHours;
    const utcOffsetMinutes = place?.utcOffsetMinutes ?? null;
    const currentOpeningHours = place?.currentOpeningHours ?? null;
    const nextOpenTime = place?.currentOpeningHours?.nextOpenTime ?? null;
    const nextCloseTime = place?.currentOpeningHours?.nextCloseTime ?? null;

    return {
      openNow: typeof openNow === 'boolean' ? openNow : null,
      regularOpeningHours: regular,
      utcOffsetMinutes,
      currentOpeningHours,
      placeId: normalizePlaceId(place) || placeId,
      nextOpenTime,
      nextCloseTime,
      source: 'places_details'
    };
  } catch (err) {
    console.warn('[PLACES] placeDetails failed (network/runtime error).', DEBUG_PLACES ? err?.message : 'Set DEBUG_PLACES=true for details.');
    return null;
  }
}

async function placesSearchTextOpenNow(textQuery, lat, lon) {
  const apiKey = getPlacesApiKey();
  if (!apiKey) return null;

  const query = String(textQuery || '').trim();
  if (!query || query.toLowerCase().includes('untitled')) return null;

  const url = 'https://places.googleapis.com/v1/places:searchText';

  // Minimal-but-correct: Places API v1 requires a field mask header.
  // Request the parent object to avoid field-path incompatibilities.
  const fieldMask = 'places.id,places.name,places.displayName,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes';

  const body = {
    textQuery: query,
    // Location bias improves matching when names are ambiguous.
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: 500.0
      }
    },
    maxResultCount: 1
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      await logPlacesHttpFailure('searchText', resp);
      return null;
    }
    const data = await resp.json();
    const place = Array.isArray(data.places) ? data.places[0] : null;
    const openNow = place?.currentOpeningHours?.openNow ?? place?.currentOpeningHours?.open_now;
    const regular = place?.regularOpeningHours;
    const utcOffsetMinutes = place?.utcOffsetMinutes ?? null;
    const placeId = normalizePlaceId(place);
    return {
      openNow: typeof openNow === 'boolean' ? openNow : null,
      regularOpeningHours: regular,
      utcOffsetMinutes,
      placeId,
      source: 'places_text'
    };
  } catch {
    return null;
  }
}

async function placesSearchNearbyOpenNow(lat, lon) {
  const apiKey = getPlacesApiKey();
  if (!apiKey) return null;

  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const fieldMask = 'places.id,places.name,places.displayName,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes';

  const body = {
    maxResultCount: 1,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: 250.0
      }
    }
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      await logPlacesHttpFailure('searchNearby', resp);
      return null;
    }
    const data = await resp.json();
    const place = Array.isArray(data.places) ? data.places[0] : null;
    const openNow = place?.currentOpeningHours?.openNow ?? place?.currentOpeningHours?.open_now;
    const regular = place?.regularOpeningHours;
    const utcOffsetMinutes = place?.utcOffsetMinutes ?? null;
    const placeId = normalizePlaceId(place);
    return {
      openNow: typeof openNow === 'boolean' ? openNow : null,
      regularOpeningHours: regular,
      utcOffsetMinutes,
      placeId,
      source: 'places_nearby'
    };
  } catch {
    return null;
  }
}

async function getOpenHoursForResult(result, options = {}) {
  const lat = Number(result?.latitude);
  const lon = Number(result?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const needRegularHours = options?.needRegularHours === true;

  const byText = await placesSearchTextOpenNow(result?.name, lat, lon);
  if (byText) {
    // Search endpoints often omit opening-hours. If we got a placeId, hydrate via details.
    if (
      needRegularHours &&
      (!byText?.regularOpeningHours?.periods || byText?.regularOpeningHours?.periods?.length === 0) &&
      byText.placeId
    ) {
      const details = await placesGetDetails(byText.placeId);
      if (details) return { ...byText, ...details, source: `${byText.source}+details` };
    }
    return byText;
  }

  const byNearby = await placesSearchNearbyOpenNow(lat, lon);
  if (byNearby) {
    if (
      needRegularHours &&
      (!byNearby?.regularOpeningHours?.periods || byNearby?.regularOpeningHours?.periods?.length === 0) &&
      byNearby.placeId
    ) {
      const details = await placesGetDetails(byNearby.placeId);
      if (details) return { ...byNearby, ...details, source: `${byNearby.source}+details` };
    }
    return byNearby;
  }
  return null;
}

async function getOpenStatusForResultAtTime(result, preferredTimeHHMM) {
  const info = await getOpenHoursForResult(result, { needRegularHours: true });
  if (!info) return null;

  // Prefer regular hours for future-time checks; fallback to currentOpeningHours.periods.
  const periods =
    info?.regularOpeningHours?.periods ||
    info?.currentOpeningHours?.periods ||
    null;
  const targetMinutes = computeTargetWeekMinutes(info?.utcOffsetMinutes, preferredTimeHHMM);
  const openAtTime = isOpenAtWeekMinutes(periods, targetMinutes);

  if (typeof openAtTime === 'boolean') {
    return { open: openAtTime, source: `${info.source}_regular`, utcOffsetMinutes: info.utcOffsetMinutes };
  }

  // If we couldn't compute for the preferred time, do NOT substitute "open now"
  // (it would be misleading). Let the caller apply its own heuristics.

  return null;
}

module.exports = {
  getOpenHoursForResult,
  getOpenStatusForResultAtTime
};
