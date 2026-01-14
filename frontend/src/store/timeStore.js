/**
 * Time Store - Manages time/clock state for satellite tracking
 * Centralizes time control to sync between UI and Cesium viewer
 */
import { create } from 'zustand';

// Speed presets (multiplier values)
export const SPEED_PRESETS = {
  '-10x': -10,
  '-5x': -5,
  '-2x': -2,
  '-1x': -1,
  'Real': 1,
  '2x': 2,
  '5x': 5,
  '10x': 10,
  '60x': 60,
  '300x': 300,
  '1000x': 1000,
};

export const useTimeStore = create((set, get) => ({
  // ============ TIME STATE ============
  
  // Playback state
  isPlaying: true,              // Whether time is advancing
  speedMultiplier: 1,           // Time speed multiplier (1 = real-time)
  
  // Current simulation time (managed by Cesium, but tracked here for UI)
  currentTime: new Date(),      // Current simulation time
  
  // Time mode
  mode: 'real',                 // 'real' = real-time, 'sim' = simulation mode
  
  // Time bounds for simulation
  startTime: null,              // Simulation start time (null = unbounded)
  stopTime: null,               // Simulation end time (null = unbounded)
  
  // Clock range behavior
  clockRange: 'UNBOUNDED',      // 'UNBOUNDED' | 'CLAMPED' | 'LOOP'
  
  // ============ ACTIONS ============
  
  // Playback control
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  
  play: () => set({ isPlaying: true }),
  
  pause: () => set({ isPlaying: false }),
  
  togglePlayPause: () => set(state => ({ isPlaying: !state.isPlaying })),
  
  // Speed control
  setSpeedMultiplier: (multiplier) => set({ speedMultiplier: multiplier }),
  
  increaseSpeed: () => set(state => {
    const speeds = Object.values(SPEED_PRESETS).sort((a, b) => a - b);
    const currentIndex = speeds.findIndex(s => s >= state.speedMultiplier);
    const nextIndex = Math.min(currentIndex + 1, speeds.length - 1);
    return { speedMultiplier: speeds[nextIndex] };
  }),
  
  decreaseSpeed: () => set(state => {
    const speeds = Object.values(SPEED_PRESETS).sort((a, b) => a - b);
    const currentIndex = speeds.findIndex(s => s >= state.speedMultiplier);
    const prevIndex = Math.max(currentIndex - 1, 0);
    return { speedMultiplier: speeds[prevIndex] };
  }),
  
  resetSpeed: () => set({ speedMultiplier: 1 }),
  
  // Time control
  setCurrentTime: (time) => set({ currentTime: time }),
  
  // Reset to current real time
  resetToNow: () => set({ 
    currentTime: new Date(),
    mode: 'real',
    speedMultiplier: 1,
    isPlaying: true,
  }),
  
  // Jump to specific time
  jumpToTime: (time) => set({
    currentTime: time instanceof Date ? time : new Date(time),
    mode: 'sim',
  }),
  
  // Step forward/backward by duration (in minutes)
  stepForward: (minutes = 1) => set(state => ({
    currentTime: new Date(state.currentTime.getTime() + minutes * 60 * 1000),
    mode: 'sim',
  })),
  
  stepBackward: (minutes = 1) => set(state => ({
    currentTime: new Date(state.currentTime.getTime() - minutes * 60 * 1000),
    mode: 'sim',
  })),
  
  // Mode control
  setMode: (mode) => set({ mode }),
  
  // Time bounds
  setTimeBounds: (start, stop) => set({ 
    startTime: start,
    stopTime: stop,
  }),
  
  clearTimeBounds: () => set({
    startTime: null,
    stopTime: null,
  }),
  
  // Clock range
  setClockRange: (range) => set({ clockRange: range }),
  
  // ============ GETTERS ============
  
  // Get formatted date string (DD/MM/YY)
  getFormattedDate: () => {
    const date = get().currentTime;
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = String(date.getUTCFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  },
  
  // Get formatted time string (HH:MM:SS)
  getFormattedTime: () => {
    const date = get().currentTime;
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },
  
  // Get speed label
  getSpeedLabel: () => {
    const multiplier = get().speedMultiplier;
    for (const [label, value] of Object.entries(SPEED_PRESETS)) {
      if (value === multiplier) return label;
    }
    return `${multiplier}x`;
  },
}));
