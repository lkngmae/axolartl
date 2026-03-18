import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { miToMeters, TIME_MAP } from '../constants';
import FiltersModal from '../components/FiltersModal';
import styles from '../styles/preferencesStyles';

export default function PreferencesScreen({ navigation }) {
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [selectedDistance, setSelectedDistance] = useState('10 MI');
  const [selectedTime, setSelectedTime] = useState(null);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);

  const togglePreference = (item) => {
    setSelectedPreferences(prev =>
      prev.includes(item) ? prev.filter(p => p !== item) : [...prev, item]
    );
  };

  const handleSelectTime = (t) => {
    setSelectedTime(prev => (prev === t ? null : t));
  };

  const handleSearch = () => {
    navigation.navigate('Search', {
      preference: selectedPreferences[0]?.toLowerCase() || 'urban',
      preferences: selectedPreferences.map(p => p.toLowerCase()),
      initialQuery: query,
      initialRadius: miToMeters(selectedDistance),
      initialDistanceLabel: selectedDistance,
      initialPreferences: selectedPreferences.map(p => p.toLowerCase()),
      initialTime: selectedTime ? TIME_MAP[selectedTime] : null,
      initialTimeLabel: selectedTime,
    });
  };

  return (
    <SafeAreaView style={styles.background}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {/* Hero: icon + branding */}
            <View style={styles.heroSection}>
              <MaterialIcons name="search" size={130} color="#F5E6A3" />
              <Text style={styles.brandText}>BY AXOLARTL STUDIOS</Text>
            </View>

            {/* Search card — matches SearchScreen style */}
            <View style={styles.card}>
              <TextInput
                style={styles.queryInput}
                placeholder="What specific subject or scene would you like to capture?"
                placeholderTextColor="#7BBFBE"
                value={query}
                onChangeText={setQuery}
                multiline
                textAlignVertical="top"
                blurOnSubmit={false}
              />
              <TouchableOpacity style={styles.searchIconButton} onPress={handleSearch}>
                <MaterialIcons name="search" size={26} color="#B8960C" />
              </TouchableOpacity>
            </View>

            {/* Filter row + pills on teal background */}
            <View style={styles.bottomFilters}>
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
                  <Text style={styles.pillText}>{selectedDistance}  ×</Text>
                </View>
                {selectedTime && (
                  <TouchableOpacity style={styles.pill} onPress={() => setSelectedTime(null)}>
                    <Text style={styles.pillText}>{selectedTime}  ×</Text>
                  </TouchableOpacity>
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
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

