import axios from 'axios';

// The backend service URL is now sourced from an environment variable.
// This makes the application more flexible for different environments (dev, staging, prod).
// See the .env.development file for the local configuration.
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Fetches the list of all supported constellations from the backend.
 * @returns {Promise<axios.AxiosResponse<any>>} A promise that resolves to the API response.
 */
export const getSupportedConstellations = () => {
  return apiClient.get('/constellations');
};

/**
 * Fetches the TLE (Two-Line Element) data for a specific constellation.
 * @param {string} constellationName The name of the constellation (e.g., "starlink").
 * @returns {Promise<axios.AxiosResponse<any>>} A promise that resolves to the API response.
 */
export const getTleData = (constellationName) => {
  return apiClient.get(`/tle/${constellationName}`);
};
