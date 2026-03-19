import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import FiltersModal from '../components/FiltersModal';
import SearchBar from '../components/SearchBar';
import { miToMeters, TIME_MAP } from '../constants';
import styles from '../styles/searchStyles';
import {
  saveSearchToHistory,
  toggleFavorite,
  getFavorites
} from '../personal_model';

const FALLBACK_LOCATION = { latitude: 33.6437, longitude: -117.8391 };
const METERS_PER_MILE = 1609.344;
const API_BASE = 'http://192.168.0.143:3000';

export default function SearchScreen({ route }) {
  const { top: topInset } = useSafeAreaInsets();
  const {
    preference,
    initialQuery = '',
    initialDistanceLabel = '10 MI',
    initialPreferences = [],
    initialTime = null,
    initialTimeLabel = null,
  } = route.params;

  const mapRef = useRef(null);
  const hasAutoSearched = useRef(false);

  const [query, setQuery] = useState(initialQuery);
  const [selectedPreferences, setSelectedPreferences] = useState(initialPreferences.map(p => p.toUpperCase()));
  const [selectedDistance, setSelectedDistance] = useState(initialDistanceLabel);
  const [selectedTime, setSelectedTime] = useState(initialTimeLabel);

  const [results, setResults] = useState([]);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [weatherClass, setWeatherClass] = useState('great_outdoor');
  const [scoreWeights, setScoreWeights] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [userLocation, setUserLocation] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [mapRegion, setMapRegion] = useState({
    ...FALLBACK_LOCATION,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });

  const [customLocation, setCustomLocation] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [selectedResultId, setSelectedResultId] = useState(null);
  const [activeTab, setActiveTab] = useState('suggestions'); // 'suggestions' | 'favorites'
  const [hasSearched, setHasSearched] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [lastAppliedFilters, setLastAppliedFilters] = useState({
    category: (preference || initialPreferences[0] || 'urban').toLowerCase(),
    distance: initialDistanceLabel,
    time: initialTimeLabel,
  });
  const searchGlow = useRef(new Animated.Value(0)).current;
  const searchGlowLoopRef = useRef(null);

  // Bottom sheet: 0 = collapsed, negative = expanded upward.
  const SHEET_PEEK_HEIGHT = 180;    // px visible above screen bottom when collapsed
  const SHEET_EXPANDED_HEIGHT = 370; // handle + tabs + full card + padding
  const expandedTranslateY = -(SHEET_EXPANDED_HEIGHT - SHEET_PEEK_HEIGHT); // -190
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetOffsetRef = useRef(0);
  const sheetStartRef = useRef(0);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => {
        const { dx, dy } = gesture;
        return Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx);
      },
      onPanResponderGrant: () => {
        sheetStartRef.current = sheetOffsetRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const next = clamp(
          sheetStartRef.current + gesture.dy,
          expandedTranslateY,
          0
        );
        sheetTranslateY.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const current = clamp(
          sheetStartRef.current + gesture.dy,
          expandedTranslateY,
          0
        );
        const shouldExpand = current < expandedTranslateY / 2;
        const target = shouldExpand ? expandedTranslateY : 0;
        sheetOffsetRef.current = target;
        setIsSheetExpanded(shouldExpand);
        Animated.spring(sheetTranslateY, {
          toValue: target,
          useNativeDriver: true,
          tension: 120,
          friction: 18,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (!userLocation || !currentTime || hasAutoSearched.current) return;
    hasAutoSearched.current = true;
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, currentTime]);

  useEffect(() => {
    const initializeLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const location = status === 'granted'
        ? (await Location.getCurrentPositionAsync({})).coords
        : FALLBACK_LOCATION;

      const coords = { latitude: location.latitude, longitude: location.longitude };
      setUserLocation(coords);
      const region = { ...coords, latitudeDelta: 0.08, longitudeDelta: 0.08 };
      setMapRegion(region);
      mapRef.current?.animateToRegion(region, 400);

      const now = new Date();
      const t = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      setCurrentTime(t);
    };

    initializeLocation();
  }, []);

  const getEffectiveTime = () => {
    return selectedTime ? TIME_MAP[selectedTime] : (initialTime ?? currentTime);
  };

  const fetchWeather = async (overrideLocation = null) => {
    const loc = overrideLocation || customLocation || userLocation;
    if (!loc) return;
    const effectiveTime = getEffectiveTime();

    setWeatherLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userLat: loc.latitude,
          userLng: loc.longitude,
          currentTime: effectiveTime,
          preferredTimeLabel: selectedTime,
        }),
      });
      const payload = await resp.json();
      const w = payload.weather ?? null;
      const wc = payload.weather_class ?? 'great_outdoor';
      setCurrentWeather(w);
      setWeatherClass(wc);
      return { weather: w, weather_class: wc };
    } catch (err) {
      console.error('Weather error:', err);
      setCurrentWeather(null);
      setWeatherClass('great_outdoor');
      return { weather: null, weather_class: 'great_outdoor' };
    } finally {
      setWeatherLoading(false);
    }
  };

  // Query weather once on entry (when location/time are ready), and whenever
  // the preferred time selection changes.
  useEffect(() => {
    if (!userLocation || !currentTime) return;
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, currentTime]);

  useEffect(() => {
    if (!userLocation || !currentTime) return;
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTime]);

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const favs = await getFavorites();
        setFavoriteIds(favs.map(f => f.id).filter(Boolean));
        setFavorites(Array.isArray(favs) ? favs : []);
      } catch {
        setFavoriteIds([]);
        setFavorites([]);
      }
    };
    loadFavorites();
  }, []);

  const stopSearchGlow = () => {
    if (searchGlowLoopRef.current) {
      searchGlowLoopRef.current.stop();
      searchGlowLoopRef.current = null;
    }
    // Ensure the icon immediately returns to the non-glow state.
    searchGlow.setValue(0);
  };

  const startSearchGlow = () => {
    stopSearchGlow();
    searchGlow.setValue(0);
    searchGlowLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(searchGlow, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(searchGlow, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      { resetBeforeIteration: true }
    );
    searchGlowLoopRef.current.start();
  };

  useEffect(() => {
    // Keep the search icon glowing until the user presses search.
    // Restart the glow any time the query is modified.
    startSearchGlow();
    return () => stopSearchGlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const togglePreference = (item) => {
    setSelectedPreferences(prev =>
      prev.includes(item) ? prev.filter(p => p !== item) : [...prev, item]
    );
  };

  const handleSelectTime = (t) => setSelectedTime(prev => (prev === t ? null : t));

  const getSelectedCategory = () => {
    return (selectedPreferences[0] || preference || 'urban').toLowerCase();
  };


  const handleSearch = async () => {
    await saveSearchToHistory(query);
    stopSearchGlow();
    setHasSearched(true);
    const loc = customLocation || userLocation;
    if (!loc) return;

    const finalTime = selectedTime ? TIME_MAP[selectedTime] : (initialTime ?? currentTime);
    setResultsLoading(true);
    setSelectedResultId(null);

    try {
      // Refresh weather at query time as well and pass it to the backend so
      // per-result outside indicators match what the user sees.
      const wx = await fetchWeather(loc);

      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          userLat: loc.latitude,
          userLng: loc.longitude,
          maxRadius: parseFloat(miToMeters(selectedDistance)),
          currentTime: finalTime,
          selectedCategory: getSelectedCategory(),
          preferredTimeLabel: selectedTime,
          weather: wx?.weather ?? currentWeather,
          weather_class: wx?.weather_class ?? weatherClass,
        }),
      });

      const payload = await response.json();
      const data = Array.isArray(payload) ? payload : (payload.results || []);
      const weather = Array.isArray(payload) ? (data?.[0]?.weather ?? null) : (payload.weather ?? null);
      const wClass = Array.isArray(payload) ? (data?.[0]?.weather_class ?? 'great_outdoor') : (payload.weather_class ?? 'great_outdoor');
      const weights = Array.isArray(payload) ? null : (payload.score_weights ?? null);

      setCurrentWeather(weather);
      setWeatherClass(wClass);
      setScoreWeights(weights);

      setResults(data);
      setSelectedResultId(null);
      setLastAppliedFilters({
        category: getSelectedCategory(),
        distance: selectedDistance,
        time: selectedTime,
      });

      const imageRanked = data
        .filter(r => r.image_url && !String(r.image_url).includes('via.placeholder.com'))
        .slice(0, 10);

      const coordinates = imageRanked
        .slice(0, 10)
        .map(r => ({ latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) }))
        .filter(c => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude));

      if (coordinates.length > 1) {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
          animated: true,
        });
      } else if (coordinates.length === 1) {
        mapRef.current?.animateToRegion(
          { ...coordinates[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
          500
        );
      }
    } catch (error) {
      console.error('Search error:', error);
      startSearchGlow();
    } finally {
      setResultsLoading(false);
    }
  };

  const imageResults = results.filter(
    r => r.image_url && !String(r.image_url).includes('via.placeholder.com')
  );
  const isFavorited = (id) => favoriteIds.includes(id);

  const topTen = imageResults.slice(0, 10);
  const displayResults = [
    ...topTen.filter(r => isFavorited(r.id)),
    ...topTen.filter(r => !isFavorited(r.id)),
  ];

  const favoriteImageResults = (favorites || []).filter(
    r => r && r.image_url && !String(r.image_url).includes('via.placeholder.com')
  );
  const displayFavorites = favoriteImageResults.slice(0, 10);

  const focusOnResult = (result) => {
    const latitude = parseFloat(result.latitude);
    const longitude = parseFloat(result.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;
    const region = { latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    setMapRegion(prev => ({ ...prev, ...region }));
    mapRef.current?.animateToRegion(region, 450);
  };

  const handleSelectResult = (result) => {
    setSelectedResultId(prev => (prev === result.id ? null : result.id));
    focusOnResult(result);
  };

  const handleToggleFavorite = async (result) => {
    const favs = await toggleFavorite(result);
    setFavoriteIds(favs.map(f => f.id).filter(Boolean));
    setFavorites(Array.isArray(favs) ? favs : []);
  };

  const handleCloseFilters = () => {
    setShowModal(false);
    if (!hasSearched) return;

    const currentCategory = getSelectedCategory();
    const changed =
      currentCategory !== lastAppliedFilters.category ||
      selectedDistance !== lastAppliedFilters.distance ||
      selectedTime !== lastAppliedFilters.time;

    if (changed) {
      handleSearch();
    }
  };

  const renderStatusBadge = (result) => {
    const source = result?.open_now_source;
    const open = source === 'skipped_outdoor'
      ? true
      : (typeof result?.open_now === 'boolean' ? result.open_now : null);
    if (open == null) return null;

    const label = open ? 'Open' : 'Closed';
    const badgeStyle = open ? styles.statusOpen : styles.statusClosed;
    return (
      <View style={[styles.statusBadge, badgeStyle]}>
        <Text style={styles.statusBadgeText}>{label}</Text>
      </View>
    );
  };

  const renderStatusBadgeOverlay = (result) => {
    const badge = renderStatusBadge(result);
    if (!badge) return null;
    return <View style={styles.statusBadgeOverlay}>{badge}</View>;
  };

  const renderOutsideWeatherBadge = (result) => {
    const indicator = result?.outside_weather_indicator;
    if (!indicator || !indicator.type) return null;

    const badgeStyle = indicator.type === 'rainy'
      ? styles.outsideRainy
      : (indicator.type === 'cold'
        ? styles.outsideCold
        : styles.outsideHot);

    return (
      <View style={[styles.outsideBadge, badgeStyle]}>
        <Text style={styles.outsideBadgeText}>{indicator.label || 'Outside'}</Text>
      </View>
    );
  };

  const renderBadgesRow = (result) => {
    const status = renderStatusBadge(result);
    const outside = renderOutsideWeatherBadge(result);
    if (!status && !outside) return null;
    return (
      <View style={styles.badgesRow}>
        {status}
        {outside}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.screen}>
          {/* Map + search card overlay (tap map area to dismiss keyboard) */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.mapSection}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={mapRegion}
                showsUserLocation
                showsMyLocationButton
                onRegionChangeComplete={setMapRegion}
              >
                {displayResults.map(result => {
                  const latitude = parseFloat(result.latitude);
                  const longitude = parseFloat(result.longitude);
                  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
                  const selected = selectedResultId === result.id;
                  return (
                    <Marker
                      key={result.id}
                      coordinate={{ latitude, longitude }}
                      title={result.name}
                      onPress={() => handleSelectResult(result)}
                    >
                      <View style={[styles.markerDot, selected && styles.markerDotSelected]} />
                    </Marker>
                  );
                })}
              </MapView>

              {/* Top overlay: weather + search card + filters row */}
              <View style={[styles.topOverlay, { top: topInset + 12 }]}>
                <View style={styles.weatherBanner}>
                  <Text style={styles.weatherTitle}>Current weather</Text>
                  {weatherLoading ? (
                    <View style={styles.weatherLoadingRow}>
                      <ActivityIndicator size="small" color="#333" />
                      <Text style={styles.weatherText}>Loading…</Text>
                    </View>
                  ) : currentWeather ? (
                    <Text style={styles.weatherText}>
                      {currentWeather.condition || 'Unknown'} · {Math.round(currentWeather.temperature ?? 0)}°F · precip {(Math.round((currentWeather.precipitationProbability ?? 0) * 100))}% · UV {currentWeather.uvIndex ?? '—'} · {weatherClass}
                    </Text>
                  ) : (
                    <Text style={styles.weatherText}>Unavailable</Text>
                  )}
                </View>

                <SearchBar
                  value={query}
                  onChangeText={setQuery}
                  onSearch={handleSearch}
                  loading={resultsLoading}
                />

                <View style={styles.filtersRow}>
                  <TouchableOpacity style={styles.filterButton} onPress={() => setShowModal(true)}>
                    <Text style={styles.filterButtonText}>PREFERENCES</Text>
                    <MaterialIcons name="tune" size={18} color="#fff" />
                  </TouchableOpacity>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pillsContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    {selectedPreferences.map(item => (
                      <TouchableOpacity key={item} style={styles.pill} onPress={() => togglePreference(item)}>
                        <Text style={styles.pillText}>{item}  ×</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{selectedDistance}</Text>
                    </View>
                    {selectedTime && (
                      <TouchableOpacity style={styles.pill} onPress={() => setSelectedTime(null)}>
                        <Text style={styles.pillText}>{selectedTime}  ×</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>

          {/* Suggestions bottom sheet */}
          <Animated.View
            style={[
              styles.suggestionsPanel,
              {
                height: Math.abs(expandedTranslateY) + SHEET_PEEK_HEIGHT,
                bottom: expandedTranslateY,
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.dragHandleHitArea} {...panResponder.panHandlers}>
              <MaterialIcons
                name={isSheetExpanded ? 'expand-more' : 'expand-less'}
                size={28}
                color="#aaa"
              />
            </View>
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'suggestions' && styles.tabButtonActive]}
                onPress={() => setActiveTab('suggestions')}
              >
                <Text style={[styles.tabText, activeTab === 'suggestions' && styles.tabTextActive]}>Suggestions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'favorites' && styles.tabButtonActive]}
                onPress={() => setActiveTab('favorites')}
              >
                <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>Favorites</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionCards}
              keyboardShouldPersistTaps="handled"
            >
              {activeTab === 'suggestions' ? (
                resultsLoading ? (
                  <View style={styles.suggestionsLoading}>
                    <ActivityIndicator size="small" color="#333" />
                    <Text style={styles.suggestionsLoadingText}>Finding suggestions…</Text>
                  </View>
                ) : !hasSearched ? (
                  <View style={styles.suggestionsEmpty}>
                    <Text style={styles.suggestionsEmptyText}>Click on the yellow search button when ready.</Text>
                  </View>
                ) : displayResults.length > 0 ? (
                  displayResults.map(result => (
                    <View key={result.id} style={styles.resultCard}>
                      {selectedResultId === result.id ? (
                        <View>
                          <TouchableOpacity style={styles.expandedCardHeader} onPress={() => handleSelectResult(result)} activeOpacity={0.85}>
                            <Text style={styles.expandedCardName} numberOfLines={2}>{result.name}</Text>
                            <MaterialIcons name="expand-more" size={20} color="rgba(255,255,255,0.7)" />
                          </TouchableOpacity>
                          <ScrollView
                            style={styles.resultDetails}
                            contentContainerStyle={styles.resultDetailsContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled
                            directionalLockEnabled
                          >
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Distance</Text>
                              <Text style={styles.expandedMeta}>{((Number(result.distance_meters ?? 0) / METERS_PER_MILE) || 0).toFixed(2)} MI ({Math.round(result.distance_meters ?? 0)} m)</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Coords</Text>
                              <Text style={styles.expandedMeta}>{result.latitude}, {result.longitude}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Status</Text>
                              {renderStatusBadge(result) ?? <Text style={styles.expandedMeta}>Unknown</Text>}
                            </View>
                            {(result.categories || []).length > 0 && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Categories</Text>
                                <Text style={styles.expandedMeta}>{result.categories.join(', ')}</Text>
                              </View>
                            )}
                            {(result.keyword_terms || []).length > 0 && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Keywords</Text>
                                <Text style={styles.expandedMeta}>
                                  {((result.keyword_terms_marked || result.keyword_terms) || []).join(', ')}
                                  {result.keyword_terms.length > 80 ? ' …' : ''}
                                </Text>
                              </View>
                            )}
                            {(result.matched_terms || []).length > 0 && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Matched</Text>
                                <Text style={styles.expandedMeta}>{result.matched_terms.join(', ')}</Text>
                              </View>
                            )}
                            <View style={styles.expandedDivider} />
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Overall</Text>
                              <Text style={styles.expandedMeta}>{(result.final_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Base</Text>
                              <Text style={styles.expandedMeta}>{(result.base_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Cosine</Text>
                              <Text style={styles.expandedMeta}>{(result.cosine_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Distance</Text>
                              <Text style={styles.expandedMeta}>{(result.distance_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Category</Text>
                              <Text style={styles.expandedMeta}>{(result.category_score ?? 0).toFixed(4)}</Text>
                            </View>
                            {result.score_weights && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Weights</Text>
                                <Text style={styles.expandedMeta}>
                                  cos {Math.round((result.score_weights.cosine ?? 0) * 100)}% · cat {Math.round((result.score_weights.category ?? 0) * 100)}% · dist {Math.round((result.score_weights.distance ?? 0) * 100)}%
                                </Text>
                              </View>
                            )}
                            {result.weather_warning ? (
                              <View style={[styles.warningTag, { marginTop: 4 }]}>
                                <Text style={styles.warningTagText}>{result.weather_warning}</Text>
                              </View>
                            ) : null}
                          </ScrollView>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => handleSelectResult(result)} activeOpacity={0.85}>
                          <View style={styles.resultCardImageContainer}>
                            <Image source={{ uri: result.image_url }} style={styles.resultCardImage} />
                            {renderStatusBadgeOverlay(result)}
                          </View>
                          <View style={styles.resultCardInfo}>
                            <Text style={styles.resultCardName} numberOfLines={2}>{result.name}</Text>
                            {typeof result.distance_meters === 'number' ? (
                              <Text style={styles.resultCardMeta}>{(result.distance_meters / METERS_PER_MILE).toFixed(2)} MI</Text>
                            ) : null}
                            {result.weather_warning ? (
                              <View style={styles.warningTag}>
                                <Text style={styles.warningTagText}>
                                  {(result.indoor_score ?? 0.5) <= 0.33 ? 'Outside Event' : 'Potentially Outside'}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.heartButton}
                        onPress={() => handleToggleFavorite(result)}
                        hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
                      >
                        <MaterialIcons
                          name={isFavorited(result.id) ? 'favorite' : 'favorite-border'}
                          size={20}
                          color={isFavorited(result.id) ? '#E8607A' : '#fff'}
                        />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <View style={styles.suggestionsEmpty}>
                    <Text style={styles.suggestionsEmptyText}>No image-backed results found.</Text>
                  </View>
                )
              ) : (
                displayFavorites.length > 0 ? (
                  displayFavorites.map(result => (
                    <View key={result.id || result.name} style={styles.resultCard}>
                      {selectedResultId === result.id ? (
                        <View>
                          <TouchableOpacity style={styles.expandedCardHeader} onPress={() => handleSelectResult(result)} activeOpacity={0.85}>
                            <Text style={styles.expandedCardName} numberOfLines={2}>{result.name}</Text>
                            <MaterialIcons name="expand-more" size={20} color="rgba(255,255,255,0.7)" />
                          </TouchableOpacity>
                          <ScrollView
                            style={styles.resultDetails}
                            contentContainerStyle={styles.resultDetailsContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled
                            directionalLockEnabled
                          >
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Distance</Text>
                              <Text style={styles.expandedMeta}>{((Number(result.distance_meters ?? 0) / METERS_PER_MILE) || 0).toFixed(2)} MI ({Math.round(result.distance_meters ?? 0)} m)</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Coords</Text>
                              <Text style={styles.expandedMeta}>{result.latitude}, {result.longitude}</Text>
                            </View>
                            {(result.categories || []).length > 0 && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Categories</Text>
                                <Text style={styles.expandedMeta}>{result.categories.join(', ')}</Text>
                              </View>
                            )}
                            {(result.keyword_terms || []).length > 0 && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Keywords</Text>
                                <Text style={styles.expandedMeta}>
                                  {((result.keyword_terms_marked || result.keyword_terms) || []).join(', ')}
                                  {result.keyword_terms.length > 80 ? ' …' : ''}
                                </Text>
                              </View>
                            )}
                            {(result.matched_terms || []).length > 0 && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Matched</Text>
                                <Text style={styles.expandedMeta}>{result.matched_terms.join(', ')}</Text>
                              </View>
                            )}
                            <View style={styles.expandedDivider} />
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Overall</Text>
                              <Text style={styles.expandedMeta}>{(result.final_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Base</Text>
                              <Text style={styles.expandedMeta}>{(result.base_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Cosine</Text>
                              <Text style={styles.expandedMeta}>{(result.cosine_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Distance</Text>
                              <Text style={styles.expandedMeta}>{(result.distance_score ?? 0).toFixed(4)}</Text>
                            </View>
                            <View style={styles.expandedRow}>
                              <Text style={styles.expandedLabel}>Category</Text>
                              <Text style={styles.expandedMeta}>{(result.category_score ?? 0).toFixed(4)}</Text>
                            </View>
                            {result.score_weights && (
                              <View style={styles.expandedRow}>
                                <Text style={styles.expandedLabel}>Weights</Text>
                                <Text style={styles.expandedMeta}>
                                  cos {Math.round((result.score_weights.cosine ?? 0) * 100)}% · cat {Math.round((result.score_weights.category ?? 0) * 100)}% · dist {Math.round((result.score_weights.distance ?? 0) * 100)}%
                                </Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => handleSelectResult(result)} activeOpacity={0.85}>
                          <View style={styles.resultCardImageContainer}>
                            <Image source={{ uri: result.image_url }} style={styles.resultCardImage} />
                            {renderStatusBadgeOverlay(result)}
                          </View>
                          <View style={styles.resultCardInfo}>
                            <Text style={styles.resultCardName} numberOfLines={2}>{result.name}</Text>
                          </View>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.heartButton}
                        onPress={() => handleToggleFavorite(result)}
                        hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
                      >
                        <MaterialIcons
                          name={isFavorited(result.id) ? 'favorite' : 'favorite-border'}
                          size={20}
                          color={isFavorited(result.id) ? '#E8607A' : '#fff'}
                        />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <View style={styles.suggestionsEmpty}>
                    <Text style={styles.suggestionsEmptyText}>No favorites yet. Tap the heart on any result to save it.</Text>
                  </View>
                )
              )}
            </ScrollView>
          </Animated.View>

          <FiltersModal
            visible={showModal}
            onClose={handleCloseFilters}
            selectedPreferences={selectedPreferences}
            onTogglePreference={togglePreference}
            selectedDistance={selectedDistance}
            onSelectDistance={setSelectedDistance}
            selectedTime={selectedTime}
            onSelectTime={handleSelectTime}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
