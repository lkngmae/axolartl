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
    marginBottom: 8,
  },
  heroHeading: {
    color: '#F5E6A3',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 36,
  },

  // Search card
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  queryInput: {
    fontSize: 18,
    color: '#7BBFBE',
    minHeight: 130,
    paddingTop: 0,
    marginBottom: 20,
  },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filterButton: {
    backgroundColor: '#E8607A',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
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
  pillsRow: {
    marginTop: 4,
  },
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
    padding: 16,
    paddingBottom: 32,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    paddingTop: 20,
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
