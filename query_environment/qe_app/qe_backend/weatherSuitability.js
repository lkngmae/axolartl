const suitabilityByTerm = require('../../../axolartl_index/location_suitability.json');

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getIndoorScoreForTerm(term) {
  const score = suitabilityByTerm[String(term)];
  if (score == null) return null;
  const num = Number(score);
  return Number.isFinite(num) ? clamp01(num) : null;
}

function computeLocationIndoorScore(terms) {
  if (!terms || terms.length === 0) return 0.5;

  let sum = 0;
  let count = 0;
  for (const term of terms) {
    const score = getIndoorScoreForTerm(term);
    if (score == null) continue;
    sum += score;
    count += 1;
  }

  return count === 0 ? 0.5 : clamp01(sum / count);
}

function indoorBucket(indoorScore) {
  if (indoorScore >= 0.67) return 'likely_inside';
  if (indoorScore <= 0.33) return 'likely_outside';
  return 'mixed';
}

function outdoorIndicatorText(indoorScore) {
  const bucket = indoorBucket(indoorScore);
  switch (bucket) {
    case 'likely_inside':
      return 'Likely indoors';
    case 'likely_outside':
      return 'Likely outdoors';
    default:
      return 'May be indoors or outdoors';
  }
}

function buildWeatherWarning(weatherClass, indoorScore) {
  const bucket = indoorBucket(indoorScore);
  if (bucket === 'likely_inside') {
    return null;
  }

  // Only warn for adverse conditions.
  switch (weatherClass) {
    case 'rainy':
      return bucket === 'likely_outside'
        ? 'Warning: This place is likely outside. Rain may affect visibility and comfort.'
        : 'Warning: This place may be outside. Rain may affect visibility and comfort.';
    case 'hot':
      return bucket === 'likely_outside'
        ? 'Warning: This place is likely outside. It may be safer to stay inside during extreme heat.'
        : 'Warning: This place may be outside. It may be safer to stay inside during extreme heat.';
    case 'cold':
      return bucket === 'likely_outside'
        ? 'Warning: This place is likely outside. Cold weather may affect comfort and dexterity.'
        : 'Warning: This place may be outside. Cold weather may affect comfort and dexterity.';
    case 'extreme':
      return bucket === 'likely_outside'
        ? 'Warning: This place is likely outside. Extreme conditions may affect safety and comfort.'
        : 'Warning: This place may be outside. Extreme conditions may affect safety and comfort.';
    case 'great_outdoor':
    default:
      return null;
  }
}

module.exports = {
  getIndoorScoreForTerm,
  computeLocationIndoorScore,
  outdoorIndicatorText,
  buildWeatherWarning
};

