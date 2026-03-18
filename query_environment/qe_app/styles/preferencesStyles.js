import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  // Background & layout
  background: {
    flex: 1,
    backgroundColor: '#7BBFBE',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },

  // Hero section (branding + icon + heading)
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  brandText: {
    color: '#F5E6A3',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: 12,
  },

  // Search card — matches SearchScreen card style
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#7BBFBE',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  queryInput: {
    flex: 1,
    fontSize: 18,
    color: '#7BBFBE',
    minHeight: 160,
    paddingTop: 0,
    paddingRight: 8,
  },

  // Filter row + pills outside card, on teal bg
  bottomFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  filterButton: {
    backgroundColor: '#E8607A',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  filterButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  searchIconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F5E6A3',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  // Active filter pills
  pillsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
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

  // Filters modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 24,
    paddingTop: 20,
    paddingBottom: 140,
    marginBottom: -100,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E8607A',
    flex: 1,
  },
  modalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  modalSectionTitle: {
    fontSize: 20,
    color: '#1a1a2e',
    fontWeight: '500',
    marginTop: 20,
    marginBottom: 8,
  },
  modalSectionContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 16,
  },
  modalPill: {
    borderWidth: 1.5,
    borderColor: '#E8607A',
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  modalPillActive: {
    backgroundColor: '#E8607A',
  },
  modalPillText: {
    color: '#E8607A',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  modalPillTextActive: {
    color: '#fff',
  },
});
