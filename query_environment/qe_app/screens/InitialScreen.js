import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { miToMeters, TIME_MAP } from '../constants';
import FiltersModal from '../components/FiltersModal';
import SearchBar from '../components/SearchBar';
import styles from '../styles/preferencesStyles';

export default function InitialScreen({ navigation }) {
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [selectedDistance, setSelectedDistance] = useState('10 MI');
  const [selectedTime, setSelectedTime] = useState(null);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

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
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {/* Hero: icon + branding */}
            <View style={styles.heroSection}>
              <MaterialIcons name="search" size={130} color="#F5E6A3" />
              <Text style={styles.brandText}>BY AXOLARTL STUDIOS</Text>
            </View>

            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSearch={handleSearch}
              glowAnim={glowAnim}
            />

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

