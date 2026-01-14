/**
 * Satellite Store - Main state management for satellite tracking
 * Uses Zustand for efficient React state management
 */
import { create } from 'zustand';
import * as Cesium from 'cesium';
import {
  getConstellations,
  getConstellationTLE,
  getSatellite,
  searchSatellites,
  getGroundStations,
  getGroundStationsProxy,
} from '../api/satelliteApi';

// Constellation color palette
const CONSTELLATION_COLORS = {
  starlink: { cesium: Cesium.Color.fromCssColorString('#1DA1F2'), hex: '#1DA1F2' },
  oneweb: { cesium: Cesium.Color.fromCssColorString('#00A3E0'), hex: '#00A3E0' },
  iridium: { cesium: Cesium.Color.fromCssColorString('#FF6B35'), hex: '#FF6B35' },
  gps: { cesium: Cesium.Color.fromCssColorString('#4CAF50'), hex: '#4CAF50' },
  glonass: { cesium: Cesium.Color.fromCssColorString('#F44336'), hex: '#F44336' },
  galileo: { cesium: Cesium.Color.fromCssColorString('#2196F3'), hex: '#2196F3' },
  beidou: { cesium: Cesium.Color.fromCssColorString('#FF9800'), hex: '#FF9800' },
  planet: { cesium: Cesium.Color.fromCssColorString('#9C27B0'), hex: '#9C27B0' },
  spire: { cesium: Cesium.Color.fromCssColorString('#00BCD4'), hex: '#00BCD4' },
  intelsat: { cesium: Cesium.Color.fromCssColorString('#607D8B'), hex: '#607D8B' },
  ses: { cesium: Cesium.Color.fromCssColorString('#795548'), hex: '#795548' },
  telesat: { cesium: Cesium.Color.fromCssColorString('#E91E63'), hex: '#E91E63' },
  geo: { cesium: Cesium.Color.fromCssColorString('#3F51B5'), hex: '#3F51B5' },
  stations: { cesium: Cesium.Color.fromCssColorString('#FFEB3B'), hex: '#FFEB3B' },
  active: { cesium: Cesium.Color.fromCssColorString('#8BC34A'), hex: '#8BC34A' },
  default: { cesium: Cesium.Color.WHITE, hex: '#FFFFFF' },
};

export const useSatelliteStore = create((set, get) => ({
  // ============ STATE ============
  
  // Constellation data
  constellations: [],           // Available constellations from API
  selectedConstellations: [],   // Currently selected constellation slugs
  constellationData: {},        // Loaded TLE data by constellation slug
  
  // Satellite data
  selectedSatellite: null,      // Currently selected satellite for details panel
  orbitSatellite: null,         // Satellite whose orbit is being displayed (independent of info panel)
  searchResults: [],            // Search results
  searchQuery: '',              // Current search query
  
  // Ground stations
  groundStations: [],           // Loaded ground stations
  showGroundStations: false,    // Whether to display ground stations
  
  // Loading states
  loading: false,
  loadingConstellations: {},    // Loading state per constellation
  error: null,
  
  // Display settings
  showOrbits: true,             // Show orbit paths
  showLabels: true,             // Show satellite labels
  satelliteScale: 1.0,          // Satellite marker scale
  
  // Time settings
  animationSpeed: 1,            // Animation multiplier
  
  // Statistics
  totalSatellitesLoaded: 0,
  
  // ============ GETTERS ============
  
  /**
   * Get color for a constellation
   */
  getConstellationColor: (slug) => {
    const colors = CONSTELLATION_COLORS[slug] || CONSTELLATION_COLORS.default;
    return colors;
  },
  
  /**
   * Get all loaded satellites as flat array
   */
  getAllLoadedSatellites: () => {
    const { constellationData } = get();
    const satellites = [];
    Object.entries(constellationData).forEach(([slug, data]) => {
      if (data.satellites) {
        const color = CONSTELLATION_COLORS[slug] || CONSTELLATION_COLORS.default;
        data.satellites.forEach(sat => {
          satellites.push({
            ...sat,
            constellation: slug,
            color: color.cesium,
          });
        });
      }
    });
    return satellites;
  },
  
  /**
   * Get satellites for a specific constellation
   */
  getConstellationSatellites: (slug) => {
    const { constellationData } = get();
    return constellationData[slug]?.satellites || [];
  },
  
  // ============ ACTIONS ============
  
  /**
   * Fetch available constellations from API
   */
  fetchConstellations: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getConstellations();
      set({ 
        constellations: response.data,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching constellations:', error);
      set({ 
        error: error.response?.data?.error || 'Failed to fetch constellations',
        loading: false,
      });
    }
  },
  
  /**
   * Load TLE data for a constellation
   */
  loadConstellation: async (slug) => {
    const { selectedConstellations, constellationData, loadingConstellations } = get();
    
    // Skip if already loaded or loading
    if (constellationData[slug] || loadingConstellations[slug]) {
      return;
    }
    
    set({ 
      loadingConstellations: { ...loadingConstellations, [slug]: true },
      error: null,
    });
    
    try {
      const response = await getConstellationTLE(slug);
      const data = response.data;
      
      set(state => ({
        constellationData: {
          ...state.constellationData,
          [slug]: data,
        },
        loadingConstellations: { ...state.loadingConstellations, [slug]: false },
        totalSatellitesLoaded: state.totalSatellitesLoaded + (data.count || 0),
      }));
      
      // Add to selected if not already
      if (!selectedConstellations.includes(slug)) {
        set({ selectedConstellations: [...selectedConstellations, slug] });
      }
      
    } catch (error) {
      console.error(`Error loading constellation ${slug}:`, error);
      set(state => ({
        loadingConstellations: { ...state.loadingConstellations, [slug]: false },
        error: error.response?.data?.error || `Failed to load ${slug}`,
      }));
    }
  },
  
  /**
   * Unload a constellation
   */
  unloadConstellation: (slug) => {
    const { constellationData, selectedConstellations } = get();
    const count = constellationData[slug]?.count || 0;
    
    const newData = { ...constellationData };
    delete newData[slug];
    
    set({
      constellationData: newData,
      selectedConstellations: selectedConstellations.filter(s => s !== slug),
      totalSatellitesLoaded: get().totalSatellitesLoaded - count,
    });
  },
  
  /**
   * Clear all constellation selections
   */
  clearAllConstellations: () => {
    set({
      selectedConstellations: [],
      constellationData: {},
      totalSatellitesLoaded: 0,
      selectedSatellite: null,
    });
  },
  
  /**
   * Toggle constellation selection
   */
  toggleConstellation: async (slug) => {
    const { selectedConstellations, constellationData } = get();
    
    if (selectedConstellations.includes(slug)) {
      // Unload if already selected (clicking same constellation toggles it off)
      get().unloadConstellation(slug);
    } else {
      // Single-select mode: clear all other constellations first
      // This matches satellitemap.space behavior where only one constellation is shown at a time
      get().clearAllConstellations();
      
      // Load the new constellation
      await get().loadConstellation(slug);
    }
  },
  
  /**
   * Set multiple selected constellations
   */
  setSelectedConstellations: async (slugs) => {
    const { selectedConstellations } = get();
    
    // Unload constellations that are no longer selected
    for (const slug of selectedConstellations) {
      if (!slugs.includes(slug)) {
        get().unloadConstellation(slug);
      }
    }
    
    // Load new selections
    for (const slug of slugs) {
      if (!selectedConstellations.includes(slug)) {
        await get().loadConstellation(slug);
      }
    }
  },
  
  /**
   * Search satellites
   */
  searchSatellites: async (query) => {
    if (!query || query.length < 2) {
      set({ searchResults: [], searchQuery: '' });
      return;
    }
    
    set({ searchQuery: query, loading: true });
    
    try {
      const response = await searchSatellites(query);
      set({ 
        searchResults: response.data.results,
        loading: false,
      });
    } catch (error) {
      console.error('Search error:', error);
      set({ 
        searchResults: [],
        loading: false,
        error: 'Search failed',
      });
    }
  },
  
  /**
   * Clear search
   */
  clearSearch: () => {
    set({ searchResults: [], searchQuery: '' });
  },
  
  /**
   * Select a satellite for detailed view
   */
  selectSatellite: async (noradId) => {
    if (!noradId) {
      set({ selectedSatellite: null });
      return;
    }
    
    set({ loading: true });
    
    try {
      const response = await getSatellite(noradId);
      set({ 
        selectedSatellite: response.data,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching satellite:', error);
      set({ 
        loading: false,
        error: 'Failed to load satellite details',
      });
    }
  },
  
  /**
   * Clear satellite selection (info panel only, keeps orbit)
   */
  clearSatelliteSelection: () => {
    set({ selectedSatellite: null });
    // Note: orbit is NOT cleared - it remains visible until another satellite is clicked
  },
  
  /**
   * Set selected satellite directly (bypasses API call)
   * Useful when we already have satellite data from entity properties
   * Also sets orbitSatellite to display orbit line
   */
  setSelectedSatellite: (satellite) => {
    set({ 
      selectedSatellite: satellite,
      orbitSatellite: satellite  // Also set orbit satellite
    });
  },
  
  /**
   * Set orbit satellite (for orbit line display, independent of info panel)
   */
  setOrbitSatellite: (satellite) => {
    set({ orbitSatellite: satellite });
  },
  
  /**
   * Clear orbit display
   */
  clearOrbit: () => {
    set({ orbitSatellite: null });
  },
  
  /**
   * Load ground stations (try proxy first, then fallback to local)
   */
  loadGroundStations: async (constellation = null) => {
    set({ loading: true });
    
    try {
      // Try proxy first for live data from satellitemap.space
      let response;
      try {
        response = await getGroundStationsProxy(500);
        console.log(`Loaded ${response.data.count} ground stations from ${response.data.source}`);
      } catch (proxyError) {
        // Fallback to local API
        console.log('Proxy failed, falling back to local ground stations');
        const params = constellation ? { constellation } : {};
        response = await getGroundStations(params);
      }
      
      set({ 
        groundStations: response.data.stations || [],
        loading: false,
      });
    } catch (error) {
      console.error('Error loading ground stations:', error);
      set({ 
        loading: false,
        error: 'Failed to load ground stations',
      });
    }
  },
  
  /**
   * Toggle ground stations visibility
   */
  toggleGroundStations: () => {
    const { showGroundStations, groundStations } = get();
    
    // Load ground stations if not loaded
    if (!showGroundStations && groundStations.length === 0) {
      get().loadGroundStations();
    }
    
    set({ showGroundStations: !showGroundStations });
  },
  
  // ============ DISPLAY SETTINGS ============
  
  setShowOrbits: (show) => set({ showOrbits: show }),
  toggleShowOrbits: () => set(state => ({ showOrbits: !state.showOrbits })),
  
  setShowLabels: (show) => set({ showLabels: show }),
  toggleShowLabels: () => set(state => ({ showLabels: !state.showLabels })),
  
  setSatelliteScale: (scale) => set({ satelliteScale: scale }),
  
  setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
  
  // ============ ERROR HANDLING ============
  
  clearError: () => set({ error: null }),
}));

// Export color constants for external use
export { CONSTELLATION_COLORS };
