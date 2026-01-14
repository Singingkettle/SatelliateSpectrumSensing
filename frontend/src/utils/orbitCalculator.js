/**
 * Orbit Calculator Utility
 * Uses satellite.js for SGP4/SDP4 orbit propagation
 */
import * as satellite from 'satellite.js';

/**
 * Parse TLE data into satellite.js satrec object
 * @param {string} line1 - TLE line 1
 * @param {string} line2 - TLE line 2
 * @returns {object} satrec object or null on error
 */
export function parseTLE(line1, line2) {
  try {
    return satellite.twoline2satrec(line1, line2);
  } catch (error) {
    console.error('Error parsing TLE:', error);
    return null;
  }
}

/**
 * Calculate satellite position at a given time
 * @param {object} satrec - satellite.js satrec object
 * @param {Date} time - Time for calculation
 * @returns {object|null} Position with lat, lng, alt or null on error
 */
export function getPosition(satrec, time) {
  try {
    const positionAndVelocity = satellite.propagate(satrec, time);
    
    if (!positionAndVelocity.position) {
      return null;
    }
    
    const gmst = satellite.gstime(time);
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    
    return {
      latitude: satellite.degreesLat(positionGd.latitude),
      longitude: satellite.degreesLong(positionGd.longitude),
      altitude: positionGd.height, // km
      velocity: positionAndVelocity.velocity ? {
        x: positionAndVelocity.velocity.x,
        y: positionAndVelocity.velocity.y,
        z: positionAndVelocity.velocity.z,
      } : null,
    };
  } catch (error) {
    // Silently fail for decayed satellites
    return null;
  }
}

/**
 * Calculate position from TLE strings
 * @param {string} line1 - TLE line 1
 * @param {string} line2 - TLE line 2
 * @param {Date} time - Time for calculation
 * @returns {object|null} Position or null
 */
export function getPositionFromTLE(line1, line2, time) {
  const satrec = parseTLE(line1, line2);
  if (!satrec) return null;
  return getPosition(satrec, time);
}

/**
 * Calculate orbit path for a time period
 * @param {object} satrec - satellite.js satrec object
 * @param {Date} startTime - Start time
 * @param {number} durationMinutes - Duration in minutes
 * @param {number} stepSeconds - Step size in seconds
 * @returns {Array} Array of position objects
 */
export function getOrbitPath(satrec, startTime, durationMinutes = 90, stepSeconds = 60) {
  const positions = [];
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  let currentTime = new Date(startTime);
  
  while (currentTime <= endTime) {
    const position = getPosition(satrec, currentTime);
    if (position) {
      positions.push({
        time: new Date(currentTime),
        ...position,
      });
    }
    currentTime = new Date(currentTime.getTime() + stepSeconds * 1000);
  }
  
  return positions;
}

/**
 * Calculate orbital period from TLE
 * @param {object} satrec - satellite.js satrec object
 * @returns {number} Orbital period in minutes
 */
export function getOrbitalPeriod(satrec) {
  // Mean motion is in revolutions per day
  const meanMotion = satrec.no * 1440 / (2 * Math.PI); // convert to rev/day
  return 1440 / meanMotion; // period in minutes
}

/**
 * Get satellite velocity magnitude
 * @param {object} velocity - Velocity vector { x, y, z }
 * @returns {number} Speed in km/s
 */
export function getSpeed(velocity) {
  if (!velocity) return 0;
  return Math.sqrt(
    velocity.x * velocity.x +
    velocity.y * velocity.y +
    velocity.z * velocity.z
  );
}

/**
 * Calculate look angles from observer to satellite
 * @param {object} observerGd - Observer geodetic position { latitude, longitude, height }
 * @param {object} positionEci - Satellite ECI position
 * @param {Date} time - Time of observation
 * @returns {object} Look angles { azimuth, elevation, range }
 */
export function getLookAngles(observerGd, positionEci, time) {
  const gmst = satellite.gstime(time);
  const observerEcf = satellite.geodeticToEcf(observerGd);
  const positionEcf = satellite.eciToEcf(positionEci, gmst);
  const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
  
  return {
    azimuth: satellite.radiansToDegrees(lookAngles.azimuth),
    elevation: satellite.radiansToDegrees(lookAngles.elevation),
    range: lookAngles.rangeSat, // km
  };
}

/**
 * Check if satellite is visible from observer
 * @param {object} satrec - satellite.js satrec object
 * @param {object} observer - Observer location { latitude, longitude, altitude }
 * @param {Date} time - Time to check
 * @param {number} minElevation - Minimum elevation angle in degrees
 * @returns {boolean} True if visible
 */
export function isVisible(satrec, observer, time, minElevation = 0) {
  const positionAndVelocity = satellite.propagate(satrec, time);
  if (!positionAndVelocity.position) return false;
  
  const observerGd = {
    latitude: satellite.degreesToRadians(observer.latitude),
    longitude: satellite.degreesToRadians(observer.longitude),
    height: (observer.altitude || 0) / 1000, // convert to km
  };
  
  const gmst = satellite.gstime(time);
  const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
  const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
  const elevationDeg = satellite.radiansToDegrees(lookAngles.elevation);
  
  return elevationDeg >= minElevation;
}

/**
 * Batch process satellites for current positions
 * Optimized for rendering thousands of satellites
 * @param {Array} satellites - Array of satellite objects with TLE data
 * @param {Date} time - Time for calculation
 * @returns {Array} Array of { satellite, position } objects
 */
export function batchGetPositions(satellites, time) {
  const results = [];
  
  for (const sat of satellites) {
    if (!sat.line1 || !sat.line2) continue;
    
    const satrec = parseTLE(sat.line1, sat.line2);
    if (!satrec) continue;
    
    const position = getPosition(satrec, time);
    if (position) {
      results.push({
        satellite: sat,
        position,
      });
    }
  }
  
  return results;
}

export default {
  parseTLE,
  getPosition,
  getPositionFromTLE,
  getOrbitPath,
  getOrbitalPeriod,
  getSpeed,
  getLookAngles,
  isVisible,
  batchGetPositions,
};
