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
  dragHandleHitArea: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#FCEEAA',
  },
  tabButtonActive: {
    backgroundColor: '#0A2D33',
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
    width: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FBF7EF',
    position: 'relative',
  },
  resultCardImageContainer: {
    position: 'relative',
    width: '100%',
  },
  resultCardImage: {
    width: '100%',
    height: 155,
    resizeMode: 'cover',
  },
  resultCardInfo: {
    padding: 10,
    paddingTop: 8,
  },
  resultCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A5C70',
    marginBottom: 4,
  },
  resultCardMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E8607A',
    marginBottom: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  warningTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5E9B2',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  warningTagText: {
    color: '#5A4200',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusOpen: {
    backgroundColor: '#F53D7A',
  },
  statusClosed: {
    backgroundColor: 'rgba(194,41,22,0.92)',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
    top: 10,
    right: 10,
    backgroundColor: '#1C3B4A',
    borderRadius: 20,
    padding: 8,
  },
  expandedCardHeader: {
    backgroundColor: '#0A2D33',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  resultDetails: {
    backgroundColor: '#FBF7EF',
    maxHeight: 320,
  },
  resultDetailsContent: {
    padding: 12,
    paddingBottom: 14,
    gap: 8,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(26,92,112,0.15)',
    marginVertical: 6,
  },
  expandedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A5C70',
    width: 70,
    textTransform: 'uppercase',
  },
  expandedMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E8607A',
    flex: 1,
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
