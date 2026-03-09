const suitabilityByKeywordId = require('../../../axolartl_index/location_suitability.json');

const DEFAULT_SUITABILITY = {
    indoor_score: 0.5,
    outdoor_score: 0.5,
    rain_ok: true,
    heat_ok: true
};

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function getKeywordSuitability(keywordId) {
    return suitabilityByKeywordId[String(keywordId)] || DEFAULT_SUITABILITY;
}

function computeKeywordWeatherScore(suitability, weatherClass) {
    const indoor = Number(suitability.indoor_score ?? 0.5);
    const outdoor = Number(suitability.outdoor_score ?? 0.5);
    const rainOk = Boolean(suitability.rain_ok);
    const heatOk = Boolean(suitability.heat_ok);

    let score = 0.5;

    switch (weatherClass) {
        case 'rainy':
            score = 0.75 * indoor + 0.25 * (1 - outdoor);
            score += rainOk ? 0.15 : -0.15;
            break;
        case 'hot':
            if (heatOk) {
                score = 0.45 * indoor + 0.55 * outdoor;
            } else {
                score = 0.85 * indoor + 0.15 * (1 - outdoor);
            }
            break;
        case 'cold':
            score = 0.85 * indoor + 0.15 * (1 - outdoor);
            break;
        case 'extreme':
            score = 0.9 * indoor + 0.1 * (rainOk ? 1 : 0);
            break;
        case 'great_outdoor':
        default:
            score = 0.2 * indoor + 0.8 * outdoor;
            break;
    }

    return clamp01(score);
}

function computeLocationWeatherScore(keywordIds, weatherClass) {
    if (!keywordIds || keywordIds.length === 0) {
        return 0.5;
    }

    let scoreSum = 0;
    for (const keywordId of keywordIds) {
        const suitability = getKeywordSuitability(keywordId);
        scoreSum += computeKeywordWeatherScore(suitability, weatherClass);
    }

    return clamp01(scoreSum / keywordIds.length);
}

module.exports = {
    getKeywordSuitability,
    computeKeywordWeatherScore,
    computeLocationWeatherScore
};
