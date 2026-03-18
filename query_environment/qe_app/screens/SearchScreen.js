import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import FiltersModal from '../components/FiltersModal';
import { miToMeters, TIME_MAP } from '../constants';
import styles from '../styles/searchStyles';

const FALLBACK_LOCATION = { latitude: 33.6437, longitude: -117.8391 };

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

  const [query, setQuery] = useState(initialQuery);
  const [selectedPreferences, setSelectedPreferences] = useState(initialPreferences.map(p => p.toUpperCase()));
  const [selectedDistance, setSelectedDistance] = useState(initialDistanceLabel);
  const [selectedTime, setSelectedTime] = useState(initialTimeLabel);

  const [results, setResults] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [mapRegion, setMapRegion] = useState({
    ...FALLBACK_LOCATION,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [customLocation, setCustomLocation] = useState(null);
  const [showModal, setShowModal] = useState(false);

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
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };

    initializeLocation();
  }, []);

  const togglePreference = (item) => {
    setSelectedPreferences(prev =>
      prev.includes(item) ? prev.filter(p => p !== item) : [...prev, item]
    );
  };

  const handleSelectTime = (t) => setSelectedTime(prev => prev === t ? null : t);

  const handleSetLocation = () => {
    setCustomLocation({ latitude: mapRegion.latitude, longitude: mapRegion.longitude });
  };

  const handleSearch = async () => {
    const loc = customLocation || userLocation;
    if (!loc) return;

    const finalTime = selectedTime ? TIME_MAP[selectedTime] : (initialTime ?? currentTime);

    try {
      const response = await fetch('http://your-local-host:3000/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          userLat: loc.latitude,
          userLng: loc.longitude,
          maxRadius: parseFloat(miToMeters(selectedDistance)),
          currentTime: finalTime,
          selectedCategory: preference,
        }),
      });

      const data = await response.json();
      setResults(data);

      const coordinates = data
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
    }
  };

  const displayResults = results.filter(r => r.image_url).slice(0, 10);

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      {/* Map + search card overlay */}
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
            return <Marker key={result.id} coordinate={{ latitude, longitude }} title={result.name} />;
          })}
        </MapView>
        {/* Top overlay: search card + filters row */}
        <View style={[styles.topOverlay, { top: topInset + 12 }]}>
          <View style={styles.searchCard}>
            <TextInput
              style={styles.searchInput}
              placeholder="What specific subject or scene would you like to capture?"
              placeholderTextColor="#7BBFBE"
              value={query}
              onChangeText={setQuery}
              multiline
            />
            <TouchableOpacity style={styles.searchIconButton} onPress={handleSearch}>
              <MaterialIcons name="search" size={24} color="#B8960C" />
            </TouchableOpacity>
          </View>

          <View style={styles.filtersRow}>
            <TouchableOpacity style={styles.filterButton} onPress={() => setShowModal(true)}>
              <Text style={styles.filterButtonText}>PREFERENCES</Text>
              <MaterialIcons name="tune" size={18} color="#fff" />
            </TouchableOpacity>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsContent}
            >
              {selectedPreferences.map(item => (
                <TouchableOpacity key={item} style={styles.pill} onPress={() => togglePreference(item)}>
                  <Text style={styles.pillText}>{item}  ×</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.pill}>
                <Text style={styles.pillText}>{selectedDistance}  ×</Text>
              </View>
              {selectedTime && (
                <TouchableOpacity style={styles.pill} onPress={() => setSelectedTime(null)}>
                  <Text style={styles.pillText}>{selectedTime}  ×</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>

        <TouchableOpacity style={styles.setLocationButton} onPress={handleSetLocation}>
          <Text style={styles.setLocationText}>SET LOCATION</Text>
        </TouchableOpacity>
      </View>

      {/* Suggestions bottom panel */}
      <View style={styles.suggestionsPanel}>
        <View style={styles.dragHandle} />
        <Text style={styles.suggestionsTitle}>Suggestions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionCards}>
          {displayResults.length > 0 ? displayResults.map(result => (
            <View key={result.id} style={styles.resultCard}>
              <Image source={{ uri: result.image_url }} style={styles.resultCardImage} />
              <Text style={styles.resultCardName} numberOfLines={2}>{result.name}</Text>
            </View>
          )) : (
            <>
              <View style={[styles.resultCardPlaceholder, { backgroundColor: '#F5E6A3' }]} />
              <View style={[styles.resultCardPlaceholder, { backgroundColor: '#7BBFBE' }]} />
              <View style={[styles.resultCardPlaceholder, { backgroundColor: '#E8607A', opacity: 0.4 }]} />
            </>
          )}
        </ScrollView>
      </View>

      <FiltersModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        selectedPreferences={selectedPreferences}
        onTogglePreference={togglePreference}
        selectedDistance={selectedDistance}
        onSelectDistance={setSelectedDistance}
        selectedTime={selectedTime}
        onSelectTime={handleSelectTime}
      />
    </SafeAreaView>
  );
}
