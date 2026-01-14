import * as Cesium from 'cesium';
import { CONSTELLATION_COLORS } from '../store/satelliteStore';

// Earth constants for altitude calculation
const GM = 398600.4418; // km^3/s^2
const EARTH_RADIUS = 6378.137; // km

/**
 * Get color based on inclination (in radians)
 */
export const getColorByInclination = (inclinationRad) => {
  const inc = inclinationRad * 180 / Math.PI;
  if (inc < 30) return Cesium.Color.fromCssColorString('#ff4444'); // Equatorial (Red)
  if (inc < 60) return Cesium.Color.fromCssColorString('#ff8844'); // Low (Orange)
  if (inc < 90) return Cesium.Color.fromCssColorString('#ffcc44'); // Medium (Yellow)
  if (inc < 120) return Cesium.Color.fromCssColorString('#44ff44'); // High (Green)
  return Cesium.Color.fromCssColorString('#4488ff'); // Retrograde (Blue)
};

/**
 * Get color based on constellation slug
 */
export const getColorByConstellation = (slug) => {
  const colorObj = CONSTELLATION_COLORS[slug] || CONSTELLATION_COLORS.default;
  return colorObj.cesium;
};

/**
 * Get color based on altitude (km)
 */
export const getColorByAltitude = (altitudeKm) => {
  if (altitudeKm < 600) return Cesium.Color.fromCssColorString('#ff4444');   // VLEO (Red)
  if (altitudeKm < 1200) return Cesium.Color.fromCssColorString('#ff8844');  // LEO (Orange)
  if (altitudeKm < 2000) return Cesium.Color.fromCssColorString('#ffcc44');  // Upper LEO (Yellow)
  if (altitudeKm < 35000) return Cesium.Color.fromCssColorString('#44ff44'); // MEO (Green)
  return Cesium.Color.fromCssColorString('#4488ff');                         // GEO/HEO (Blue)
};

/**
 * Calculate approximate altitude from mean motion (satrec.no)
 * no is in radians/minute
 */
const calculateAltitude = (satrec) => {
  if (!satrec || !satrec.no) return 0;
  
  // Convert mean motion to rad/s
  const n = satrec.no / 60.0;
  
  // Calculate semi-major axis (a)
  // a = (GM / n^2)^(1/3)
  const a = Math.pow(GM / (n * n), 1/3);
  
  // Altitude = a - Earth Radius
  return a - EARTH_RADIUS;
};

/**
 * Main function to determine satellite color based on scheme
 */
export const getSatelliteColor = (sat, scheme) => {
  if (!sat.satrec && !sat.height) return Cesium.Color.WHITE;
  
  switch (scheme) {
    case 'inclination':
      return getColorByInclination(sat.satrec.inclo);
      
    case 'constellation':
      return getColorByConstellation(sat.constellation);
      
    case 'altitude':
      // Use stored height if available, otherwise calculate from TLE
      const altitude = sat.height || calculateAltitude(sat.satrec);
      return getColorByAltitude(altitude);
      
    default:
      return Cesium.Color.WHITE;
  }
};
