import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  weatherBanner: {
    backgroundColor: '#eef6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  weatherTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  weatherText: {
    color: '#333',
  },
  title: {
    fontSize: 22,
    marginBottom: 20,
    textAlign: 'center',
  },
  mapContainer: {
    width: '100%',
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  label: {
    marginTop: 15,
    marginBottom: 5,
    fontWeight: '600',
  },
  value: {
    marginBottom: 15,
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  cardImage: {
    width: '100%',
    height: 200,
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
    color: '#444',
  },
  warningText: {
    marginTop: 8,
    color: '#8a1f11',
    fontWeight: '600',
  },
  cardDistance: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  favoriteButton: {
    backgroundColor: '#ffcccc',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  favoriteButtonText: {
    fontWeight: 'bold',
  },
});
