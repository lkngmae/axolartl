import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PREFERENCE_OPTIONS, DISTANCE_OPTIONS, TIME_OPTIONS } from '../constants';
import styles from '../styles/preferencesStyles';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function FiltersModal({
  visible,
  onClose,
  selectedPreferences,
  onTogglePreference,
  selectedDistance,
  onSelectDistance,
  selectedTime,
  onSelectTime,
}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SCREEN_HEIGHT);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 120,
        mass: 1.2,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 450,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Preferences</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={26} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalSectionTitle}>Art Reference</Text>
            <View style={styles.modalSectionContent}>
              {PREFERENCE_OPTIONS.map(item => (
                <TouchableOpacity
                  key={item}
                  style={[styles.modalPill, selectedPreferences.includes(item) && styles.modalPillActive]}
                  onPress={() => onTogglePreference(item)}
                >
                  <Text style={[styles.modalPillText, selectedPreferences.includes(item) && styles.modalPillTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalSectionTitle}>Max Distance</Text>
            <View style={styles.modalSectionContent}>
              {DISTANCE_OPTIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.modalPill, selectedDistance === d && styles.modalPillActive]}
                  onPress={() => onSelectDistance(d)}
                >
                  <Text style={[styles.modalPillText, selectedDistance === d && styles.modalPillTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalSectionTitle}>Preferred Time</Text>
            <View style={styles.modalSectionContent}>
              {TIME_OPTIONS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.modalPill, selectedTime === t && styles.modalPillActive]}
                  onPress={() => onSelectTime(t)}
                >
                  <Text style={[styles.modalPillText, selectedTime === t && styles.modalPillTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
