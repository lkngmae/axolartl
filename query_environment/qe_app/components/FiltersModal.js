import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PREFERENCE_OPTIONS, DISTANCE_OPTIONS, TIME_OPTIONS } from '../constants';
import styles from '../styles/preferencesStyles';

function AccordionSection({ title, expanded, onToggle, children }) {
  return (
    <>
      <TouchableOpacity style={styles.modalSection} onPress={onToggle}>
        <Text style={styles.modalSectionTitle}>{title}</Text>
        <MaterialIcons
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={24}
          color="#555"
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.modalSectionContent}>
          {children}
        </View>
      )}
    </>
  );
}

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
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Preferences & Filters</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={26} color="#333" />
            </TouchableOpacity>
          </View>

          <AccordionSection
            title="Art Reference Preferences"
            expanded={expandedSection === 'preferences'}
            onToggle={() => toggleSection('preferences')}
          >
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
          </AccordionSection>

          <AccordionSection
            title="Max Distance"
            expanded={expandedSection === 'distance'}
            onToggle={() => toggleSection('distance')}
          >
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
          </AccordionSection>

          <AccordionSection
            title="Preferred Time"
            expanded={expandedSection === 'time'}
            onToggle={() => toggleSection('time')}
          >
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
          </AccordionSection>
        </View>
      </View>
    </Modal>
  );
}
