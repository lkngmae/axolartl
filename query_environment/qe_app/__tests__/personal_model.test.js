import AsyncStorage from '@react-native-async-storage/async-storage';
import { personalizeResults, saveSearchToHistory, toggleFavorite } from '../personal_model';

beforeEach(() => {
  AsyncStorage.clear();
  jest.clearAllMocks();
});

// --- personalizeResults ---

describe('personalizeResults', () => {
  test('returns results with a personalScore field', async () => {
    const results = await personalizeResults([{ name: 'Central Park' }]);
    expect(results[0]).toHaveProperty('personalScore');
  });

  test('boosts score for places matching search history keywords', async () => {
    await AsyncStorage.setItem('search_history', JSON.stringify({ park: 4 }));

    const results = await personalizeResults([
      { name: 'Central Park' },
      { name: 'Coffee Shop' },
    ]);

    const park = results.find(r => r.name === 'Central Park');
    const cafe = results.find(r => r.name === 'Coffee Shop');
    // "park" keyword matched → score += 4 * 3 = 12
    expect(park.personalScore).toBe(12);
    expect(cafe.personalScore).toBe(0);
  });

  test('boosts score for places matching a favorite category', async () => {
    await AsyncStorage.setItem('favorites', JSON.stringify([{ id: '1', category: 'cafe' }]));

    const results = await personalizeResults([
      { name: 'Blue Bottle', category: 'cafe' },
      { name: 'Museum of Art', category: 'museum' },
    ]);

    const cafe = results.find(r => r.name === 'Blue Bottle');
    const museum = results.find(r => r.name === 'Museum of Art');
    expect(cafe.personalScore).toBe(20);
    expect(museum.personalScore).toBe(0);
  });

  test('applies distance penalty', async () => {
    const results = await personalizeResults([
      { name: 'Far Place', distance_meters: 1000 },
      { name: 'Near Place', distance_meters: 500 },
    ]);

    const far = results.find(r => r.name === 'Far Place');
    const near = results.find(r => r.name === 'Near Place');
    // penalty = distance / 500
    expect(far.personalScore).toBe(-2);
    expect(near.personalScore).toBe(-1);
  });

  test('sorts results by personalScore descending', async () => {
    await AsyncStorage.setItem('search_history', JSON.stringify({ park: 10 }));

    const results = await personalizeResults([
      { name: 'Coffee Shop', distance_meters: 0 },
      { name: 'City Park', distance_meters: 0 },
    ]);

    expect(results[0].name).toBe('City Park'); // score = 30
    expect(results[1].name).toBe('Coffee Shop'); // score = 0
  });

  test('handles empty results array', async () => {
    const results = await personalizeResults([]);
    expect(results).toEqual([]);
  });

  test('handles no history and no favorites (all scores = 0)', async () => {
    const results = await personalizeResults([
      { name: 'Place A' },
      { name: 'Place B' },
    ]);
    results.forEach(r => expect(r.personalScore).toBe(0));
  });

  test('combines history boost, category boost, and distance penalty', async () => {
    await AsyncStorage.setItem('search_history', JSON.stringify({ coffee: 2 }));
    await AsyncStorage.setItem('favorites', JSON.stringify([{ id: '1', category: 'cafe' }]));

    const results = await personalizeResults([
      { name: 'Coffee Spot', category: 'cafe', distance_meters: 500 },
    ]);

    // history: 2*3=6, category: 20, distance: -1 → total = 25
    expect(results[0].personalScore).toBe(25);
  });
});

// --- saveSearchToHistory ---

describe('saveSearchToHistory', () => {
  test('saves a new keyword with count 1', async () => {
    await saveSearchToHistory('park');
    const stored = JSON.parse(await AsyncStorage.getItem('search_history'));
    expect(stored['park']).toBe(1);
  });

  test('increments count on repeated searches', async () => {
    await saveSearchToHistory('park');
    await saveSearchToHistory('park');
    await saveSearchToHistory('park');
    const stored = JSON.parse(await AsyncStorage.getItem('search_history'));
    expect(stored['park']).toBe(3);
  });

  test('stores keywords in lowercase', async () => {
    await saveSearchToHistory('PARK');
    const stored = JSON.parse(await AsyncStorage.getItem('search_history'));
    expect(stored['park']).toBe(1);
    expect(stored['PARK']).toBeUndefined();
  });

  test('tracks multiple different keywords independently', async () => {
    await saveSearchToHistory('park');
    await saveSearchToHistory('cafe');
    const stored = JSON.parse(await AsyncStorage.getItem('search_history'));
    expect(stored['park']).toBe(1);
    expect(stored['cafe']).toBe(1);
  });

  test('does nothing if query is empty or falsy', async () => {
    await saveSearchToHistory('');
    await saveSearchToHistory(null);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

// --- toggleFavorite ---

describe('toggleFavorite', () => {
  test('adds a place to an empty favorites list', async () => {
    const place = { id: '1', name: 'Blue Bottle', category: 'cafe' };
    const result = await toggleFavorite(place);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  test('removes a place that is already a favorite', async () => {
    const place = { id: '1', name: 'Blue Bottle', category: 'cafe' };
    await toggleFavorite(place); // add
    const result = await toggleFavorite(place); // remove
    expect(result).toHaveLength(0);
  });

  test('adds a second favorite without removing the first', async () => {
    const placeA = { id: '1', name: 'Blue Bottle', category: 'cafe' };
    const placeB = { id: '2', name: 'City Park', category: 'park' };
    await toggleFavorite(placeA);
    const result = await toggleFavorite(placeB);
    expect(result).toHaveLength(2);
  });

  test('only removes the matched place, not others', async () => {
    const placeA = { id: '1', name: 'Blue Bottle', category: 'cafe' };
    const placeB = { id: '2', name: 'City Park', category: 'park' };
    await toggleFavorite(placeA);
    await toggleFavorite(placeB);
    const result = await toggleFavorite(placeA); // remove A only
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  test('returns the updated favorites list', async () => {
    const place = { id: '1', name: 'Blue Bottle', category: 'cafe' };
    const result = await toggleFavorite(place);
    expect(Array.isArray(result)).toBe(true);
  });

  test('persists favorites to AsyncStorage', async () => {
    const place = { id: '1', name: 'Blue Bottle', category: 'cafe' };
    await toggleFavorite(place);
    const stored = JSON.parse(await AsyncStorage.getItem('favorites'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('1');
  });
});
