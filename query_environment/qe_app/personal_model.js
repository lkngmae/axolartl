import AsyncStorage from '@react-native-async-storage/async-storage';

// --- THE READER (Ranking logic) ---
export const personalizeResults = async (rawResults) => {
  const historyRaw = await AsyncStorage.getItem('search_history');
  const favoritesRaw = await AsyncStorage.getItem('favorites');
  const history = historyRaw ? JSON.parse(historyRaw) : {};
  const favorites = favoritesRaw ? JSON.parse(favoritesRaw) : [];

  return rawResults.map(place => {
    let score = 0;
    // Keyword History Match
    // If they searched "park" 5 times, and this place has "park" in the name, 
    // it gets 15 points (5 * 3).
    Object.keys(history).forEach(keyword => {
      if (place.name?.toLowerCase().includes(keyword.toLowerCase())) {
        score += (history[keyword] * 3); 
      }
    });

    // Favorite Category Match
    // If this place shares a category (like "cafe" or "museum") with ANY 
    // of their saved favorites, it gets a massive 20-point boost.
    const favoriteCategories = favorites.map(f => f.category);
    if (place.category && favoriteCategories.includes(place.category)) {
      score += 20;
    }

    // Distance Penalty
    // Subtract 1 point for every 500 meters away it is. 
    // This ensures that if two places tie in points, the closer one wins.
    if (place.distance_meters) {
      score -= (place.distance_meters / 500);
    }
    return { ...place, personalScore: score };
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
  
  const isFav = favorites.find(f => f.id === place.id);
  
  if (isFav) {
    favorites = favorites.filter(f => f.id !== place.id); // Remove
  } else {
    favorites.push(place); // Add
  }
  
  await AsyncStorage.setItem('favorites', JSON.stringify(favorites));
  return favorites; // Return updated list to UI
};