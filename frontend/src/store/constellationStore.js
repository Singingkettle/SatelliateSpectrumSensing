import { create } from 'zustand';
import * as Cesium from 'cesium';
import { getSupportedConstellations, getTleData } from '../api/constellationApi';

// Define a color map for different constellations
const CONSTELLATION_COLORS = {
  Starlink: Cesium.Color.AQUA,
  OneWeb: Cesium.Color.YELLOW,
  Iridium: Cesium.Color.LIMEGREEN,
  Default: Cesium.Color.WHITE,
};

export const useConstellationStore = create((set, get) => ({
  // --- STATE ---
  startTime: new Date(),
  endTime: new Date(new Date().getTime() + 24 * 3600 * 1000),
  timeStep: 1,
  constellations: [],
  selectedConstellations: [],
  tleData: {},
  selectedSatellites: {},
  loading: false,
  error: null,

  // --- ACTIONS ---

  setSimulationTime: (times) => {
    if (times && times.length === 2) {
      set({ startTime: times[0], endTime: times[1] });
    } else {
      set({ startTime: null, endTime: null });
    }
  },

  setTimeStep: (step) => set({ timeStep: step || 1 }),

  fetchConstellations: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getSupportedConstellations();
      const formatted = response.data.map((c) => ({
        label: c.name,
        value: c.name,
        description: c.description,
      }));
      set({ constellations: formatted, loading: false });
    } catch (error) {
      const msg = error.response?.data?.message || '获取星座列表失败';
      set({ error: msg, loading: false });
    }
  },

  setSelectedConstellations: async (selected) => {
    const currentSelection = get().selectedConstellations;
    set({ selectedConstellations: selected, loading: true, error: null });

    const newTleData = { ...get().tleData };
    const newSelectedSatellites = { ...get().selectedSatellites };

    currentSelection.forEach((name) => {
      if (!selected.includes(name)) {
        delete newTleData[name];
        delete newSelectedSatellites[name];
      }
    });

    const constellationsToFetch = selected.filter(
      (name) => !currentSelection.includes(name)
    );

    try {
      for (const name of constellationsToFetch) {
        const response = await getTleData(name);
        newTleData[name] = response.data;
        newSelectedSatellites[name] = [];
      }
      set({ 
        tleData: newTleData, 
        selectedSatellites: newSelectedSatellites, 
        loading: false 
      });
    } catch (error) {
      const msg = error.response?.data?.message || '获取TLE数据失败';
      set({ error: msg, loading: false });
    }
  },

  toggleSatelliteSelection: (constellationName, satelliteNames) => {
    set((state) => ({
      selectedSatellites: {
        ...state.selectedSatellites,
        [constellationName]: satelliteNames,
      },
    }));
  },
  
  getConstellationColor: (constellationName) => {
    return CONSTELLATION_COLORS[constellationName] || CONSTELLATION_COLORS.Default;
  },
}));
