import { useState } from 'react';
import { View, TextInput, TouchableOpacity, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function SearchBar({
  value,
  onChangeText,
  onSearch,
  loading = false,
  glowAnim = null,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.card}>
      <TextInput
        style={[styles.input, focused && { color: 'rgba(10, 45, 51, 0.87)' }]}
        placeholder="What specific subject or scene would you like to capture?"
        placeholderTextColor="#7BBFBE"
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        textAlignVertical="top"
        submitBehavior="newline"
      />
      <View style={styles.iconWrap}>
        {glowAnim && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.iconGlow,
              {
                opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }),
                transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }],
              },
            ]}
          />
        )}
        <TouchableOpacity style={styles.iconButton} onPress={onSearch}>
          {loading ? (
            <ActivityIndicator size="small" color="#B8960C" />
          ) : (
            <MaterialIcons name="search" size={26} color="#B8960C" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#7BBFBE',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: '#7BBFBE',
    paddingRight: 8,
    maxHeight: 100,
  },
  iconWrap: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  iconGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(184, 150, 12, 0.28)',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5E6A3',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
