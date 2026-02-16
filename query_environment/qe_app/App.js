
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useState, useEffect } from 'react';


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

  const options = ['people', 'nightlife', 'nature', 'architecture', 'urban'];

  return (
    <View style={styles.container}>
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

  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [customTime, setCustomTime] = useState('');

  const [results, setResults] = useState([]);


  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState('');

  const [currentTime, setCurrentTime] = useState('');
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    // Fake user location (NYC example)
    const fakeLocation = {
      latitude: 40.7127,
      longitude: -74.0059
    };

    setUserLocation(fakeLocation);

    // Get current time automatically
    const now = new Date();
    const formattedTime = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    setCurrentTime(formattedTime);
  }, []);


  const handleSearch = async () => {
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
      const response = await fetch('http://your-ip-here:3000/search', {
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

      const data = await response.json();

      console.log("Search Results:", data);
      setResults(data); 

    } catch (error) {
      console.error("Search error:", error);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Search Locations</Text>

      <Text style={styles.label}>Selected preference:</Text>
      <Text style={styles.value}>{preference}</Text>

      <Text style={styles.label}>Your Location (fake for now):</Text>
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

      {results.map((result) => (
        <Text style={styles.value}>
          {JSON.stringify(result, null, 2)}

        </Text>)
      )}

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

  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
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
  }
});
