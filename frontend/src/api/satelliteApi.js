/**
 * Satellite Tracker API Client
 * Handles all API communication with the backend
 */
import axios from 'axios';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:6359/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout for large requests
});

// ============ CONSTELLATION APIs ============

/**
 * Get all available constellations
 * @returns {Promise} List of constellations with metadata
 */
export const getConstellations = () => {
  return apiClient.get('/constellations');
};

/**
 * Get details for a specific constellation
 * @param {string} slug - Constellation slug (e.g., 'starlink')
 * @returns {Promise} Constellation details
 */
export const getConstellation = (slug) => {
  return apiClient.get(`/constellations/${slug}`);
};

/**
 * Get all satellites in a constellation
 * @param {string} slug - Constellation slug
 * @param {object} params - Query parameters
 * @param {number} params.limit - Maximum satellites to return
 * @param {number} params.offset - Pagination offset
 * @returns {Promise} List of satellites
 */
export const getConstellationSatellites = (slug, params = {}) => {
  return apiClient.get(`/constellations/${slug}/satellites`, { params });
};

/**
 * Get TLE data for all satellites in a constellation
 * Optimized for frontend orbit calculation
 * @param {string} slug - Constellation slug
 * @returns {Promise} TLE data array
 */
export const getConstellationTLE = (slug) => {
  return apiClient.get(`/constellations/${slug}/tle`);
};

/**
 * Get statistics for a constellation
 * @param {string} slug - Constellation slug
 * @returns {Promise} Constellation statistics
 */
export const getConstellationStats = (slug) => {
  return apiClient.get(`/constellations/${slug}/stats`);
};

/**
 * Get launch history for a constellation
 * @param {string} slug - Constellation slug
 * @param {object} params - Query parameters
 * @param {number} params.year - Filter by year
 * @param {number} params.limit - Maximum launches
 * @returns {Promise} Launch history
 */
export const getConstellationLaunches = (slug, params = {}) => {
  return apiClient.get(`/constellations/${slug}/launches`, { params });
};

/**
 * Get growth data for a constellation
 * @param {string} slug - Constellation slug
 * @param {string} period - Time period ('year', 'month', 'week')
 * @returns {Promise} Growth data
 */
export const getConstellationGrowth = (slug, period = 'year') => {
  return apiClient.get(`/constellations/${slug}/growth`, { params: { period } });
};

/**
 * Trigger TLE update for a constellation from CelesTrak
 * @param {string} slug - Constellation slug
 * @returns {Promise} Update results
 */
export const updateConstellationTLE = (slug) => {
  return apiClient.post(`/constellations/${slug}/update`);
};

/**
 * Update TLE data for all constellations
 * @returns {Promise} Update results for all constellations
 */
export const updateAllConstellationsTLE = () => {
  return apiClient.post('/constellations/update-all');
};

// ============ SATELLITE APIs ============

/**
 * Get satellites with optional filtering
 * @param {object} params - Query parameters
 * @param {string} params.constellation - Filter by constellation slug
 * @param {string} params.search - Search by name
 * @param {number} params.limit - Maximum results
 * @param {number} params.offset - Pagination offset
 * @param {boolean} params.include_tle - Include TLE data
 * @returns {Promise} Paginated satellite list
 */
export const getSatellites = (params = {}) => {
  return apiClient.get('/satellites', { params });
};

/**
 * Search satellites by name or NORAD ID
 * @param {string} query - Search query
 * @param {number} limit - Maximum results (default: 50)
 * @returns {Promise} Search results
 */
export const searchSatellites = (query, limit = 50) => {
  return apiClient.get('/satellites/search', { params: { q: query, limit } });
};

/**
 * Get detailed information for a satellite
 * @param {number} noradId - NORAD catalog ID
 * @returns {Promise} Satellite details with TLE
 */
export const getSatellite = (noradId) => {
  return apiClient.get(`/satellites/${noradId}`);
};

/**
 * Get TLE data for a satellite
 * @param {number} noradId - NORAD catalog ID
 * @returns {Promise} TLE data
 */
export const getSatelliteTLE = (noradId) => {
  return apiClient.get(`/satellites/${noradId}/tle`);
};

/**
 * Get current position of a satellite
 * @param {number} noradId - NORAD catalog ID
 * @param {string} time - ISO datetime string (optional, default: now)
 * @returns {Promise} Position data
 */
export const getSatellitePosition = (noradId, time = null) => {
  const params = time ? { time } : {};
  return apiClient.get(`/satellites/${noradId}/position`, { params });
};

/**
 * Get orbit track for a satellite
 * @param {number} noradId - NORAD catalog ID
 * @param {object} params - Track parameters
 * @param {number} params.duration - Duration in minutes (default: 90)
 * @param {number} params.step - Time step in seconds (default: 60)
 * @param {string} params.start - Start time ISO string
 * @returns {Promise} Orbit track points
 */
export const getSatelliteOrbit = (noradId, params = {}) => {
  return apiClient.get(`/satellites/${noradId}/orbit`, { params });
};

/**
 * Get TLE history for decay analysis
 * @param {number} noradId - NORAD catalog ID
 * @param {number} days - History period in days (default: 90)
 * @returns {Promise} Decay analysis data
 */
export const getSatelliteHistory = (noradId, days = 90) => {
  return apiClient.get(`/satellites/${noradId}/history`, { params: { days } });
};

/**
 * Get predicted passes over a location
 * @param {number} noradId - NORAD catalog ID
 * @param {object} observer - Observer location
 * @param {number} observer.lat - Latitude
 * @param {number} observer.lon - Longitude
 * @param {number} observer.alt - Altitude in meters (default: 0)
 * @param {number} days - Prediction period in days (default: 7)
 * @returns {Promise} Pass predictions
 */
export const getSatellitePasses = (noradId, observer, days = 7) => {
  return apiClient.get(`/satellites/${noradId}/passes`, {
    params: {
      lat: observer.lat,
      lon: observer.lon,
      alt: observer.alt || 0,
      days,
    },
  });
};

/**
 * Get TLE data for all satellites (use with caution - large response)
 * @param {string} constellation - Optional constellation filter
 * @returns {Promise} All TLE data
 */
export const getAllTLE = (constellation = null) => {
  const params = constellation ? { constellation } : {};
  return apiClient.get('/satellites/all-tle', { params });
};

// ============ GROUND STATION APIs ============

/**
 * Get all ground stations
 * @param {object} params - Filter parameters
 * @param {string} params.constellation - Filter by constellation
 * @param {string} params.country - Filter by country
 * @param {string} params.type - Filter by station type
 * @returns {Promise} Ground station list
 */
export const getGroundStations = (params = {}) => {
  return apiClient.get('/ground-stations', { params });
};

/**
 * Get a specific ground station
 * @param {number} stationId - Ground station ID
 * @returns {Promise} Ground station details
 */
export const getGroundStation = (stationId) => {
  return apiClient.get(`/ground-stations/${stationId}`);
};

/**
 * Seed Starlink ground station data
 * @returns {Promise} Seeding results
 */
export const seedStarlinkGroundStations = () => {
  return apiClient.post('/ground-stations/seed-starlink');
};

/**
 * Fetch ground stations from external API (satellitemap.space)
 * @param {number} limit - Maximum stations to fetch
 * @returns {Promise} Fetched ground stations
 */
export const fetchExternalGroundStations = (limit = 500) => {
  return apiClient.post(`/ground-stations/fetch-external?limit=${limit}`);
};

/**
 * Get ground stations via proxy (live data from satellitemap.space)
 * @param {number} limit - Maximum stations to return
 * @returns {Promise} Ground station list
 */
export const getGroundStationsProxy = (limit = 500) => {
  return apiClient.get(`/ground-stations/proxy?limit=${limit}`);
};

// ============ SPACE-TRACK APIs ============

/**
 * Get comprehensive Space-Track.org status
 * @returns {Promise} Space-Track status including API health, TIP messages, etc.
 */
export const getSpaceTrackStatus = async () => {
  const response = await apiClient.get('/spacetrack/status');
  return response.data;
};

/**
 * Get Space-Track API health
 * @returns {Promise} Quick health check
 */
export const getSpaceTrackHealth = async () => {
  const response = await apiClient.get('/spacetrack/health');
  return response.data;
};

/**
 * Get TIP (Tracking and Impact Prediction) messages
 * @param {number} limit - Maximum messages to return
 * @returns {Promise} TIP messages for re-entry predictions
 */
export const getSpaceTrackTIP = async (limit = 20) => {
  const response = await apiClient.get('/spacetrack/tip', { params: { limit } });
  return response.data;
};

/**
 * Get Space-Track announcements
 * @returns {Promise} Official announcements
 */
export const getSpaceTrackAnnouncements = async () => {
  const response = await apiClient.get('/spacetrack/announcements');
  return response.data;
};

/**
 * Get recent satellite launches from Space-Track
 * @param {number} days - Days to look back
 * @param {number} limit - Maximum results
 * @returns {Promise} Recent launches
 */
export const getSpaceTrackLaunches = async (days = 30, limit = 50) => {
  const response = await apiClient.get('/spacetrack/launches', { params: { days, limit } });
  return response.data;
};

/**
 * Get TLE publication statistics
 * @param {number} days - Days of statistics
 * @returns {Promise} TLE stats per day
 */
export const getSpaceTrackTLEStats = async (days = 21) => {
  const response = await apiClient.get('/spacetrack/tle-stats', { params: { days } });
  return response.data;
};

/**
 * Get TLE from Space-Track for a specific satellite
 * @param {number} noradId - NORAD catalog ID
 * @returns {Promise} TLE data directly from Space-Track
 */
export const getSpaceTrackTLE = async (noradId) => {
  const response = await apiClient.get(`/spacetrack/tle/${noradId}`);
  return response.data;
};

// ============ SCHEDULER APIs ============

/**
 * Get scheduler status
 * @returns {Promise} Scheduler status and job information
 */
export const getSchedulerStatus = async () => {
  const response = await apiClient.get('/scheduler/status');
  return response.data;
};

/**
 * Trigger manual TLE update
 * @returns {Promise} Update trigger result
 */
export const triggerTLEUpdate = async () => {
  const response = await apiClient.post('/scheduler/trigger-update');
  return response.data;
};

// ============ HEALTH CHECK ============

/**
 * Check API health
 * @returns {Promise} Health status
 */
export const checkHealth = () => {
  return apiClient.get('/health');
};

// Export axios instance for custom requests
export { apiClient };

// Default export with all methods
export const satelliteApi = {
  // Constellations
  getConstellations,
  getConstellation,
  getConstellationSatellites,
  getConstellationTLE,
  getConstellationStats,
  getConstellationLaunches,
  getConstellationGrowth,
  updateConstellationTLE,
  updateAllConstellationsTLE,
  // Satellites
  getSatellites,
  searchSatellites,
  getSatellite,
  getSatelliteTLE,
  getSatellitePosition,
  getSatelliteOrbit,
  getSatelliteHistory,
  getSatellitePasses,
  getAllTLE,
  // Ground Stations
  getGroundStations,
  getGroundStation,
  seedStarlinkGroundStations,
  fetchExternalGroundStations,
  getGroundStationsProxy,
  // Space-Track
  getSpaceTrackStatus,
  getSpaceTrackHealth,
  getSpaceTrackTIP,
  getSpaceTrackAnnouncements,
  getSpaceTrackLaunches,
  getSpaceTrackTLEStats,
  getSpaceTrackTLE,
  // Scheduler
  getSchedulerStatus,
  triggerTLEUpdate,
  // Health
  checkHealth,
};

export default satelliteApi;
