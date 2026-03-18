import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // Top overlay (weather + search card + filters)
  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
  },
  weatherBanner: {
    backgroundColor: '#eef6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  weatherTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  weatherText: {
    color: '#333',
  },
  weatherLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  searchIconWrap: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  searchIconGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(184, 150, 12, 0.28)',
  },
  searchIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5E6A3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Map
  mapSection: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E8607A',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerDotSelected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#B8960C',
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
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
  dragHandleHitArea: {
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 6,
  },
  suggestionsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f1f1f1',
  },
  tabButtonActive: {
    backgroundColor: '#1a1a2e',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#333',
  },
  tabTextActive: {
    color: '#fff',
  },
  suggestionCards: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 4,
  },
  suggestionsEmpty: {
    width: 280,
    minHeight: 90,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  suggestionsEmptyText: {
    color: '#333',
    fontWeight: '700',
    textAlign: 'center',
  },
  resultCard: {
    width: 150,
    minHeight: 190,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    position: 'relative',
  },
  resultCardImage: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  resultCardName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    padding: 6,
    paddingBottom: 2,
  },
  resultCardMeta: {
    fontSize: 11,
    color: '#666',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  warningTag: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginLeft: 6,
    marginBottom: 6,
    backgroundColor: 'rgba(138,31,17,0.92)',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  warningTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  statusOpen: {
    backgroundColor: 'rgba(21,132,73,0.92)',
  },
  statusClosed: {
    backgroundColor: 'rgba(194,41,22,0.92)',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  outsideBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  outsideHot: {
    backgroundColor: 'rgba(231,120,30,0.92)',
  },
  outsideRainy: {
    backgroundColor: 'rgba(31,96,168,0.92)',
  },
  outsideCold: {
    backgroundColor: 'rgba(120,120,120,0.92)',
  },
  outsideBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  heartButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    padding: 4,
  },
  resultDetails: {
    padding: 10,
    backgroundColor: '#fff',
    minHeight: 80,
    maxHeight: 140,
  },
  resultDetailsContent: {
    paddingBottom: 6,
  },
  resultDetailText: {
    fontSize: 11,
    color: '#333',
    marginTop: 4,
  },
  warningTextSmall: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#8a1f11',
  },
  resultCardPlaceholder: {
    width: 130,
    height: 100,
    borderRadius: 12,
  },

  emptyHint: {
    marginTop: 10,
    color: '#666',
  },

  suggestionsLoading: {
    width: 280,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  suggestionsLoadingText: {
    color: '#333',
    fontWeight: '700',
  },

  favoriteButton: {
    backgroundColor: '#ffcccc',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  favoriteButtonText: {
    fontWeight: 'bold',
  },
});
