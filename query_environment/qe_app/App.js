
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useRef, useState, useEffect } from 'react';
import { Image } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { 
  personalizeResults, 
  saveSearchToHistory, 
  toggleFavorite 
} from './personal_model';



import {
  View,
  Text,
  Button,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView
} from 'react-native';


const Stack = createNativeStackNavigator();

function PreferencesScreen({ navigation }) {
  const [selected, setSelected] = useState(null);

  const options = ['structure', 'urban', 'greenery', 'water', 'history', 'beach', 'view', 'art'];

  return (
    <View style={styles.preferencesContainer}>
      <Text style={styles.title}>What do you want to draw?</Text>

      {options.map((item) => (
        <TouchableOpacity
          key={item}
          style={[
            styles.option,
            selected === item && styles.selectedOption
          ]}
          onPress={() => setSelected(item)}
        >
          <Text style={styles.optionText}>{item}</Text>
        </TouchableOpacity>
      ))}

      <Button
        title="Continue"
        disabled={!selected}
        onPress={() =>
          navigation.navigate('Search', { preference: selected })
        }
      />
    </View>
  );
}

function SearchScreen({ route }) {
  const { preference } = route.params;
  const mapRef = useRef(null);

  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [customTime, setCustomTime] = useState('');

  const [results, setResults] = useState([]);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [weatherClass, setWeatherClass] = useState('great_outdoor');
  const [scoreWeights, setScoreWeights] = useState(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 33.6437,
    longitude: -117.8391,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08
  });


  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState('10000');

  const [currentTime, setCurrentTime] = useState('');
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    const initializeLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        const fallback = {
          latitude: 33.6437,
          longitude: -117.8391
        };
        setUserLocation(fallback);
        setMapRegion((prev) => ({
          ...prev,
          latitude: fallback.latitude,
          longitude: fallback.longitude
        }));
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: fallback.latitude,
            longitude: fallback.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08
          }, 400);
        }
      } else {
        const position = await Location.getCurrentPositionAsync({});
        const current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setUserLocation(current);
        setMapRegion((prev) => ({
          ...prev,
          latitude: current.latitude,
          longitude: current.longitude
        }));
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: current.latitude,
            longitude: current.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08
          }, 400);
        }
      }

      const now = new Date();
      const formattedTime = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      setCurrentTime(formattedTime);
    };

    initializeLocation();
  }, []);


  const handleSearch = async () => {
    await saveSearchToHistory(query);
    if (!userLocation && (customLat === '' || customLng === '')) {
      return;
    }

    // Determine which location to use
    const finalLat = customLat !== ''
      ? parseFloat(customLat)
      : userLocation.latitude;

    const finalLng = customLng !== ''
      ? parseFloat(customLng)
      : userLocation.longitude;

    const finalTime = customTime !== ''
      ? customTime
      : currentTime;

    console.log("\n===== FINAL FILTER VALUES USED =====");
    console.log("Latitude:", finalLat);
    console.log("Longitude:", finalLng);
    console.log("Time:", finalTime);
    console.log("Radius:", radius);

    try {
      const response = await fetch('http://ip:3000/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          userLat: finalLat,
          userLng: finalLng,
          maxRadius: parseFloat(radius),
          currentTime: finalTime,
          selectedCategory: preference
        })
      });

      const payload = await response.json();
      const data = Array.isArray(payload) ? payload : (payload.results || []);
      const weather = Array.isArray(payload) ? (data?.[0]?.weather ?? null) : (payload.weather ?? null);
      const wClass = Array.isArray(payload) ? (data?.[0]?.weather_class ?? 'great_outdoor') : (payload.weather_class ?? 'great_outdoor');
      const weights = Array.isArray(payload) ? null : (payload.score_weights ?? null);
      
      console.log("Search Results:", data);
      setCurrentWeather(weather);
      setWeatherClass(wClass);
      setScoreWeights(weights);

      const rankedData = await personalizeResults(data);
      setResults(rankedData);

      // App-side score logging (top 10)
      try {
        const w = weights || { cosine: 0.6, distance: 0.25, category: 0.15 };
        console.log("=== SCORE WEIGHTS (backend) ===", {
          cosine_pct: Math.round((w.cosine ?? 0) * 100),
          distance_pct: Math.round((w.distance ?? 0) * 100),
          category_pct: Math.round((w.category ?? 0) * 100),
        });

        rankedData.slice(0, 10).forEach((r, idx) => {
          const distanceScore = typeof r.distance_meters === 'number'
            ? 1 - (r.distance_meters / Math.max(1, parseFloat(radius)))
            : null;
          console.log(`[#${idx + 1}] ${r.name}`, {
            overall_score: r.final_score,
            cosine_score: r.cosine_score,
            distance_meters: r.distance_meters,
            distance_score: distanceScore,
            category_score: r.category_score,
            personal_score: r.personalScore,
            personal_breakdown: r.personal_breakdown,
            personal_weights: r.personal_weights,
            weights_pct: {
              cosine: Math.round((w.cosine ?? 0) * 100),
              distance: Math.round((w.distance ?? 0) * 100),
              category: Math.round((w.category ?? 0) * 100),
              personalization_note: "personalScore is used for client-side re-ranking (not blended into final_score)."
            }
          });
        });
      } catch (e) {
        console.warn("Score logging failed:", e?.message || e);
      }
  
      if (data.length > 0) {
        const coordinates = data
          .slice(0, 10)
          .map((result) => ({
            latitude: parseFloat(result.latitude),
            longitude: parseFloat(result.longitude)
          }))
          .filter((coord) => !Number.isNaN(coord.latitude) && !Number.isNaN(coord.longitude));

        if (coordinates.length > 0) {
          setMapRegion((prev) => ({
            ...prev,
            latitude: coordinates[0].latitude,
            longitude: coordinates[0].longitude
          }));

          if (mapRef.current) {
            if (coordinates.length > 1) {
              // Ensure that the only locations with photos are include in map zoom.
              const photoResults = data.filter(r => r.image_url).slice(0, 10);
              if (photoResults.length > 0) {
                const coordinates = photoResults.map((result) => ({
                  latitude: parseFloat(result.latitude),
                  longitude: parseFloat(result.longitude)
                })).filter(coord => !Number.isNaN(coord.latitude));
              }
              mapRef.current.fitToCoordinates(coordinates, {
                edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
                animated: true
              });
            } else {
              mapRef.current.animateToRegion({
                latitude: coordinates[0].latitude,
                longitude: coordinates[0].longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02
              }, 500);
            }
          }
        }
      }

    } catch (error) {
      console.error("Search error:", error);
    }
  };
  // Filter for only results with images, then take the first 10
  const displayResults = results.filter(r => r.image_url).slice(0, 10)

  return (
    <ScrollView
      style={styles.searchScreen}
      contentContainerStyle={styles.searchContainer}
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[0]}
    >
      <View style={styles.weatherBanner}>
        <Text style={styles.weatherTitle}>Current weather</Text>
        {currentWeather ? (
          <Text style={styles.weatherText}>
            {currentWeather.condition || 'Unknown'} · {Math.round(currentWeather.temperature ?? 0)}°F · precip {(Math.round((currentWeather.precipitationProbability ?? 0) * 100))}% · UV {currentWeather.uvIndex ?? '—'} · {weatherClass}
          </Text>
        ) : (
          <Text style={styles.weatherText}>Unavailable</Text>
        )}
      </View>

      <Text style={styles.title}>Search Locations</Text>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={mapRegion}
          showsUserLocation
          showsMyLocationButton
        >
          {displayResults.map((result) => {
            const latitude = parseFloat(result.latitude);
            const longitude = parseFloat(result.longitude);
            if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

            return (
              <Marker
                key={result.id}
                coordinate={{ latitude, longitude }}
                title={result.name} 
              />
            );
          })}
        </MapView>
      </View>

      <Text style={styles.label}>Selected preference:</Text>
      <Text style={styles.value}>{preference}</Text>

      <Text style={styles.label}>Your Location:</Text>
      {userLocation && (
        <Text style={styles.value}>
          {userLocation.latitude}, {userLocation.longitude}
        </Text>
      )}

      <Text style={styles.label}>Current Time:</Text>
      <Text style={styles.value}>{currentTime}</Text>

      {/* Query Input */}
      <Text style={styles.label}>What do you want to draw?</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. person walking dog"
        value={query}
        onChangeText={setQuery}
      />

      {/* Radius Filter */}
      <Text style={styles.label}>Max Radius (meters)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 1000"
        value={radius}
        onChangeText={setRadius}
        keyboardType="numeric"
      />

      {/* Optional Custom Location */}
      <Text style={styles.label}>Override Latitude (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 40.7128"
        value={customLat}
        onChangeText={setCustomLat}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Override Longitude (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. -74.0060"
        value={customLng}
        onChangeText={setCustomLng}
        keyboardType="numeric"
      />

      {/* Optional Custom Time */}
      <Text style={styles.label}>Override Time (optional, HH:MM)</Text>
      <TextInput
        style={styles.input}
        placeholder="18:30"
        value={customTime}
        onChangeText={setCustomTime}
      />


      <Button
        title="Search"
        onPress={handleSearch}
      />

      {results.map((result, index) => (
        <View key={result.id ?? index} style={styles.card}>
          {result.image_url ? (
            <Image
              source={{ uri: result.image_url }}
              style={styles.cardImage}
            />
          ) : null}

          <View style={styles.cardContent}>
            <Text style={styles.cardName}>{result.name}</Text>
            {result.outdoor_indicator ? (
              <Text style={styles.cardMeta}>{result.outdoor_indicator}</Text>
            ) : null}
            {result.weather_warning ? (
              <Text style={styles.warningText}>{result.weather_warning}</Text>
            ) : null}
            {typeof result.distance_meters === 'number' ? (
              <Text style={styles.cardMeta}>{Math.round(result.distance_meters)} m away</Text>
            ) : null}
          </View>

          <TouchableOpacity 
            onPress={async () => {
              await toggleFavorite(result);
              alert('Saved to Favorites!'); // A quick visual confirmation for testing
            }}
            // You can add styles.favoriteButton to your StyleSheet
            style={{ backgroundColor: '#ffcccc', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 }}
          >
            <Text style={{ fontWeight: 'bold' }}>❤️ Favorite</Text>
          </TouchableOpacity>

        </View>
      ))}

    </ScrollView>
  );
}



export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Preferences"
          component={PreferencesScreen}
        />
        <Stack.Screen
          name="Search"
          component={SearchScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  searchScreen: {
    flex: 1
  },
  searchContainer: {
    padding: 20,
    paddingBottom: 36
  },
  preferencesContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  mapContainer: {
    width: '100%',
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12
  },
  map: {
    width: '100%',
    height: '100%'
  },
  label: {
    marginTop: 15,
    marginBottom: 5,
    fontWeight: '600'
  },
  value: {
    marginBottom: 15,
    fontStyle: 'italic'
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10
  },

  title: {
    fontSize: 22,
    marginBottom: 20,
    textAlign: 'center'
  },
  option: {
    padding: 15,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center'
  },
  selectedOption: {
    backgroundColor: '#cce5ff'
  },
  optionText: {
    fontSize: 16
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 3, // Shadow for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  cardImage: {
    width: '100%',
    height: 200, // Nice big image
    resizeMode: 'cover',
  },
  cardContent: {
    padding: 15,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cardMeta: {
    marginTop: 6,
    color: '#444'
  },
  warningText: {
    marginTop: 8,
    color: '#8a1f11',
    fontWeight: '600'
  },
  cardDistance: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  }
  ,
  weatherBanner: {
    backgroundColor: '#eef6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  weatherTitle: {
    fontWeight: '700',
    marginBottom: 4
  },
  weatherText: {
    color: '#333'
  }
});
