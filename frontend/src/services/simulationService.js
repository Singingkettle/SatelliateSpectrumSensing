import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Starts a new simulation task by sending the configuration to the backend.
 * @param {object} simulationConfig - The configuration object for the simulation.
 * @returns {Promise<axios.AxiosResponse<any>>} A promise that resolves to the API response.
 */
export const startSimulation = (simulationConfig) => {
  return apiClient.post('/simulation/start', simulationConfig);
};