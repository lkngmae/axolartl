import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Button, TouchableOpacity, StyleSheet } from 'react-native';

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search Locations</Text>
      <Text>Selected preference: {preference}</Text>
      {/* Later: add TextInput + filters here */}
    </View>
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
