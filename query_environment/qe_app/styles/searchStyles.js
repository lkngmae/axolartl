import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // Top overlay (search card + filters, stacked vertically)
  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#7BBFBE',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#fff',
  },
  searchInput: {
    flex: 1,
    fontSize: 18,
    color: '#7BBFBE',
    paddingRight: 8,
    maxHeight: 100,
  },
  searchIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5E6A3',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  // Map
  mapSection: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  setLocationButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#7BBFBE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  setLocationText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // Filters row (below search card, inside topOverlay)
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  filterButton: {
    backgroundColor: '#E8607A',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  filterButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  pillsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  pill: {
    borderWidth: 1.5,
    borderColor: '#E8607A',
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  pillText: {
    color: '#E8607A',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // Suggestions bottom panel
  suggestionsPanel: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 12,
  },
  suggestionsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  suggestionCards: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 4,
  },
  resultCard: {
    width: 130,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  resultCardImage: {
    width: '100%',
    height: 80,
    resizeMode: 'cover',
  },
  resultCardName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    padding: 6,
  },
  resultCardPlaceholder: {
    width: 130,
    height: 100,
    borderRadius: 12,
  },
});
