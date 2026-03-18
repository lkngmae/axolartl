import AsyncStorage from '@react-native-async-storage/async-storage';

export const getPersonalizationPayload = async () => {
  const historyRaw = await AsyncStorage.getItem('search_history');
  const favoriteKeywordRaw = await AsyncStorage.getItem('favorite_keyword_counts');
  const favoritesRaw = await AsyncStorage.getItem('favorites');

  const history = historyRaw ? JSON.parse(historyRaw) : {};
  const favoriteKeywordCounts = favoriteKeywordRaw ? JSON.parse(favoriteKeywordRaw) : {};
  const favorites = favoritesRaw ? JSON.parse(favoritesRaw) : [];

  const favoriteCategories = favorites
    .flatMap(f => Array.isArray(f.categories) ? f.categories : (f.category ? [f.category] : []))
    .map(c => String(c).toLowerCase());

  return {
    history,
    favorite_keyword_counts: favoriteKeywordCounts,
    favorite_categories: favoriteCategories
  };
};

export const getFavorites = async () => {
  const favoritesRaw = await AsyncStorage.getItem('favorites');
  return favoritesRaw ? JSON.parse(favoritesRaw) : [];
};

// --- THE READER (Ranking logic) ---
export const personalizeResults = async (rawResults) => {
  const historyRaw = await AsyncStorage.getItem('search_history');
  const favoritesRaw = await AsyncStorage.getItem('favorites');
  const favoriteKeywordRaw = await AsyncStorage.getItem('favorite_keyword_counts');
  const history = historyRaw ? JSON.parse(historyRaw) : {};
  const favorites = favoritesRaw ? JSON.parse(favoritesRaw) : [];
  const favoriteKeywordCounts = favoriteKeywordRaw ? JSON.parse(favoriteKeywordRaw) : {};

  return rawResults.map(place => {
    let score = 0;
    const keywordTerms = Array.isArray(place.keyword_terms) ? place.keyword_terms : [];
    const keywordSet = new Set(keywordTerms.map(t => String(t).toLowerCase()));

    // Search History Match (legacy: history stores whole query strings).
    // If they searched "dog park" 5 times and the place name contains that
    // phrase, it gets a boost.
    let historyBoost = 0;
    Object.keys(history).forEach(keyword => {
      const key = keyword.toLowerCase();
      if (place.name?.toLowerCase().includes(key)) {
        historyBoost += (history[keyword] * 3);
      }
    });
    score += historyBoost;

    // Favorite Keyword Match
    // When the user hearts items, we accumulate their keyword_terms in storage.
    // Future results sharing those terms get a proportional boost.
    let favoriteKeywordBoost = 0;
    for (const term of keywordSet) {
      const count = Number(favoriteKeywordCounts[term] || 0);
      if (count > 0) favoriteKeywordBoost += count * 1.5;
    }
    score += favoriteKeywordBoost;

    // Favorite Category Match
    // If this place shares a category (like "cafe" or "museum") with ANY 
    // of their saved favorites, it gets a massive 20-point boost.
    const favoriteCategories = favorites.map(f => f.category);
    let favoriteCategoryBoost = 0;
    if (place.category && favoriteCategories.includes(place.category)) {
      favoriteCategoryBoost += 20;
    }
    score += favoriteCategoryBoost;

    // Distance Penalty
    // Subtract 1 point for every 500 meters away it is. 
    // This ensures that if two places tie in points, the closer one wins.
    let distancePenalty = 0;
    if (place.distance_meters) {
      distancePenalty = (place.distance_meters / 500);
      score -= distancePenalty;
    }

    return {
      ...place,
      personalScore: score,
      personal_breakdown: {
        history_boost: historyBoost,
        favorite_keyword_boost: favoriteKeywordBoost,
        favorite_category_boost: favoriteCategoryBoost,
        distance_penalty: distancePenalty,
        note: 'personalScore is used for client-side re-ranking (not blended into final_score).'
      },
      personal_weights: {
        history_multiplier: 3,
        favorite_keyword_multiplier: 1.5,
        favorite_category_bonus: 20,
        distance_penalty_per_meter: 1 / 500
      }
    };
  }).sort((a, b) => b.personalScore - a.personalScore);
};

// --- THE WRITER: History ---
export const saveSearchToHistory = async (query) => {
  if (!query) return;
  const historyRaw = await AsyncStorage.getItem('search_history');
  let history = historyRaw ? JSON.parse(historyRaw) : {};
  
  // Increment count for this keyword
  history[query.toLowerCase()] = (history[query.toLowerCase()] || 0) + 1;
  
  await AsyncStorage.setItem('search_history', JSON.stringify(history));
};

// --- THE WRITER: Favorites ---
export const toggleFavorite = async (place) => {
  const favoritesRaw = await AsyncStorage.getItem('favorites');
  let favorites = favoritesRaw ? JSON.parse(favoritesRaw) : [];
  const favoriteKeywordRaw = await AsyncStorage.getItem('favorite_keyword_counts');
  let favoriteKeywordCounts = favoriteKeywordRaw ? JSON.parse(favoriteKeywordRaw) : {};
  
  const isFav = favorites.find(f => f.id === place.id);

  const keywordTerms = Array.isArray(place.keyword_terms) ? place.keyword_terms : [];
  const normalizedTerms = keywordTerms
    .map(t => String(t).trim().toLowerCase())
    .filter(Boolean);
  
  if (isFav) {
    favorites = favorites.filter(f => f.id !== place.id); // Remove
    // Decrement saved keyword counts when un-favoriting.
    for (const term of normalizedTerms) {
      const next = (Number(favoriteKeywordCounts[term] || 0) - 1);
      if (next > 0) favoriteKeywordCounts[term] = next;
      else delete favoriteKeywordCounts[term];
    }
  } else {
    favorites.push(place); // Add
    // Increment saved keyword counts when favoriting.
    for (const term of normalizedTerms) {
      favoriteKeywordCounts[term] = (Number(favoriteKeywordCounts[term] || 0) + 1);
    }
  }
  
  await AsyncStorage.setItem('favorites', JSON.stringify(favorites));
  await AsyncStorage.setItem('favorite_keyword_counts', JSON.stringify(favoriteKeywordCounts));
  return favorites; // Return updated list to UI
};
