import { create } from 'zustand';
import * as Cesium from 'cesium';
import { getSupportedConstellations, getTleData } from '../api/constellationApi';

const IS_DEV = process.env.NODE_ENV !== 'production';

// Define a color map for different constellations
const CONSTELLATION_COLORS = {
  Starlink: Cesium.Color.CYAN,        // 青色 - SpaceX的经典颜色
  OneWeb: Cesium.Color.ORANGE,        // 橙色 - 更明显的对比
  Iridium: Cesium.Color.LIME,         // 青柠色 - 更鲜艳
  Default: Cesium.Color.WHITE,
};

export const useConstellationStore = create((set, get) => {
  // 初始时间设置
  const initialStartTime = new Date();
  const initialEndTime = new Date(initialStartTime.getTime() + 24 * 3600 * 1000);

  if (IS_DEV) console.log(`[时间设置] 第1次成功设置时间(初始化):`, {
    startTime: initialStartTime,
    endTime: initialEndTime,
    duration: `${Math.round((initialEndTime - initialStartTime) / (1000 * 60 * 60 * 24))}天`
  });

  return {
    // --- STATE ---
    startTime: initialStartTime,
    endTime: initialEndTime,
    timeStep: 1,
    constellations: [],
    selectedConstellations: [],
    tleData: {},
    selectedSatellites: {},
    loading: false,
    error: null,
    showOrbits: false,
    pageSize: 10,
    timeSetCount: 1,

    // display
    lightingEnabled: false,
    sceneMode: '3D',

    // monitoring
    monitoringStrategy: 'none', // 'none' | 'accompany'
    monitoringTarget: null,     // satellite name
    monitoringDistanceKm: 5,
    companionName: null,        // runtime-created companion satellite name when active

    // per-satellite orbit overrides: { [satName]: true|false } (undefined -> follow global)
    orbitOverrides: {},

    // --- ACTIONS ---

    setSimulationTime: (times) => {
      if (times && times.length === 2) {
        set((state) => {
          const newCount = state.timeSetCount + 1;
          if (IS_DEV) console.log(`[时间设置] 第${newCount}次成功设置时间:`, {
            startTime: times[0],
            endTime: times[1],
            duration: `${Math.round((times[1] - times[0]) / (1000 * 60 * 60 * 24))}天`
          });
          return { startTime: times[0], endTime: times[1], timeSetCount: newCount };
        });
      } else set({ startTime: null, endTime: null });
    },

    setTimeStep: (step) => set({ timeStep: step || 1 }),

    fetchConstellations: async () => {
      set({ loading: true, error: null });
      try {
        const response = await getSupportedConstellations();
        const formatted = response.data.map((c) => ({ label: c.name, value: c.name, description: c.description }));
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

      const constellationsToFetch = selected.filter((name) => !currentSelection.includes(name));

      try {
        for (const name of constellationsToFetch) {
          const response = await getTleData(name);
          newTleData[name] = response.data;
          newSelectedSatellites[name] = [];
        }
        set({ tleData: newTleData, selectedSatellites: newSelectedSatellites, loading: false });
      } catch (error) {
        const msg = error.response?.data?.message || '获取TLE数据失败';
        set({ error: msg, loading: false });
      }
    },

    toggleSatelliteSelection: (constellationName, satelliteNames) => {
      set((state) => ({
        selectedSatellites: { ...state.selectedSatellites, [constellationName]: satelliteNames },
      }));
    },

    getConstellationColor: (constellationName) => {
      return CONSTELLATION_COLORS[constellationName] || CONSTELLATION_COLORS.Default;
    },

    toggleOrbitDisplay: () => set((state) => ({ showOrbits: !state.showOrbits })),
    setOrbitDisplay: (show) => set({ showOrbits: show }),
    setPageSize: (size) => set({ pageSize: size }),

    setLightingEnabled: (enabled) => set({ lightingEnabled: !!enabled }),
    setSceneMode: (mode) => set({ sceneMode: mode === '2D' ? '2D' : '3D' }),

    // monitoring actions
    setMonitoringStrategy: (strategy) => set({ monitoringStrategy: strategy || 'none' }),
    setMonitoringTarget: (satName) => set({ monitoringTarget: satName || null }),
    setMonitoringDistanceKm: (km) => set({ monitoringDistanceKm: typeof km === 'number' ? km : 5 }),
    setCompanionName: (name) => set({ companionName: name || null }),

    // per-satellite orbit override
    setOrbitOverride: (satName, value) => set((state) => ({
      orbitOverrides: { ...state.orbitOverrides, [satName]: value },
    })),
    clearOrbitOverride: (satName) => set((state) => {
      const next = { ...state.orbitOverrides }
      delete next[satName]
      return { orbitOverrides: next }
    }),
  };
});
