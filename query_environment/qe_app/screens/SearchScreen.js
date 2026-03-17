import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, Button, ScrollView, Image } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import styles from '../styles/searchStyles';

const FALLBACK_LOCATION = { latitude: 33.6437, longitude: -117.8391 };

export default function SearchScreen({ route }) {
  const { preference, initialQuery = '', initialRadius = '10000', initialTime = null } = route.params;
  const mapRef = useRef(null);

  const [query, setQuery] = useState(initialQuery);
  const [radius, setRadius] = useState(initialRadius);
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [customTime, setCustomTime] = useState(initialTime ?? '');

  const [results, setResults] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [mapRegion, setMapRegion] = useState({
    ...FALLBACK_LOCATION,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });

  useEffect(() => {
    const initializeLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const location = status === 'granted'
        ? (await Location.getCurrentPositionAsync({})).coords
        : FALLBACK_LOCATION;

      const coords = { latitude: location.latitude, longitude: location.longitude };
      setUserLocation(coords);
      setMapRegion(prev => ({ ...prev, ...coords }));
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 400);

      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };

    initializeLocation();
  }, []);

  const handleSearch = async () => {
    if (!userLocation && (customLat === '' || customLng === '')) return;

    const finalLat = customLat !== '' ? parseFloat(customLat) : userLocation.latitude;
    const finalLng = customLng !== '' ? parseFloat(customLng) : userLocation.longitude;
    const finalTime = customTime !== '' ? customTime : currentTime;

    console.log("\n===== FINAL FILTER VALUES USED =====");
    console.log("Latitude:", finalLat, "Longitude:", finalLng, "Time:", finalTime, "Radius:", radius);

    try {
      const response = await fetch('http://your-local-host:3000/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          userLat: finalLat,
          userLng: finalLng,
          maxRadius: parseFloat(radius),
          currentTime: finalTime,
          selectedCategory: preference,
        }),
      });

      const data = await response.json();
      setResults(data);

      if (data.length > 0) {
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
      }
    } catch (error) {
      console.error("Search error:", error);
    }
  };

  const displayResults = results.filter(r => r.image_url).slice(0, 10);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Search Locations</Text>

      <View style={styles.mapContainer}>
        <MapView ref={mapRef} style={styles.map} initialRegion={mapRegion} showsUserLocation showsMyLocationButton>
          {displayResults.map(result => {
            const latitude = parseFloat(result.latitude);
            const longitude = parseFloat(result.longitude);
            if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
            return <Marker key={result.id} coordinate={{ latitude, longitude }} title={result.name} />;
          })}
        </MapView>
      </View>

      <Text style={styles.label}>Selected preference:</Text>
      <Text style={styles.value}>{preference}</Text>

      <Text style={styles.label}>Your Location:</Text>
      {userLocation && (
        <Text style={styles.value}>{userLocation.latitude}, {userLocation.longitude}</Text>
      )}

      <Text style={styles.label}>Current Time:</Text>
      <Text style={styles.value}>{currentTime}</Text>

      <Text style={styles.label}>What do you want to draw?</Text>
      <TextInput style={styles.input} placeholder="e.g. person walking dog" value={query} onChangeText={setQuery} />

      <Text style={styles.label}>Max Radius (meters)</Text>
      <TextInput style={styles.input} placeholder="e.g. 1000" value={radius} onChangeText={setRadius} keyboardType="numeric" />

      <Text style={styles.label}>Override Latitude (optional)</Text>
      <TextInput style={styles.input} placeholder="e.g. 40.7128" value={customLat} onChangeText={setCustomLat} keyboardType="numeric" />

      <Text style={styles.label}>Override Longitude (optional)</Text>
      <TextInput style={styles.input} placeholder="e.g. -74.0060" value={customLng} onChangeText={setCustomLng} keyboardType="numeric" />

      <Text style={styles.label}>Override Time (optional, HH:MM)</Text>
      <TextInput style={styles.input} placeholder="18:30" value={customTime} onChangeText={setCustomTime} />

      <Button title="Search" onPress={handleSearch} />

      {displayResults.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={[styles.title, { textAlign: 'left' }]}>Results Found:</Text>
          {displayResults.map(result => (
            <View key={result.id} style={styles.card}>
              {result.image_url ? (
                <Image source={{ uri: result.image_url }} style={styles.cardImage} />
              ) : (
                <View style={[styles.cardImage, { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: '#999' }}>No Image Available</Text>
                </View>
              )}
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{result.name || 'Unknown Location'}</Text>
                <Text style={styles.cardDistance}>{Math.round(result.distance_meters)}m away</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
