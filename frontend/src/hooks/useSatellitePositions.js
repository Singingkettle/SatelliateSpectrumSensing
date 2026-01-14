/**
 * Custom hook for calculating and updating satellite positions
 * Uses satellite.js for real-time orbit propagation
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as satellite from 'satellite.js';

/**
 * Parse TLE and get position
 */
const getPositionFromTLE = (line1, line2, time) => {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);
    const positionAndVelocity = satellite.propagate(satrec, time);
    
    if (!positionAndVelocity.position) {
      return null;
    }
    
    const gmst = satellite.gstime(time);
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    
    return {
      latitude: satellite.degreesLat(positionGd.latitude),
      longitude: satellite.degreesLong(positionGd.longitude),
      altitude: positionGd.height * 1000, // convert to meters
    };
  } catch (error) {
    return null;
  }
};

/**
 * Custom hook to track satellite positions in real-time
 * 
 * @param {Array} satellites - Array of satellite objects with TLE data
 * @param {number} updateInterval - Update interval in milliseconds (default: 1000)
 * @param {boolean} enabled - Whether to enable position updates
 * @returns {Object} { positions, isCalculating, lastUpdate }
 */
export function useSatellitePositions(satellites, updateInterval = 1000, enabled = true) {
  const [positions, setPositions] = useState(new Map());
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const intervalRef = useRef(null);
  const satellitesRef = useRef(satellites);
  
  // Update ref when satellites change
  useEffect(() => {
    satellitesRef.current = satellites;
  }, [satellites]);
  
  // Calculate positions for all satellites
  const calculatePositions = useCallback(() => {
    const currentSatellites = satellitesRef.current;
    if (!currentSatellites || currentSatellites.length === 0) {
      setPositions(new Map());
      return;
    }
    
    setIsCalculating(true);
    const now = new Date();
    const newPositions = new Map();
    
    // Process in batches to avoid blocking UI
    const batchSize = 500;
    let processed = 0;
    
    const processBatch = () => {
      const batch = currentSatellites.slice(processed, processed + batchSize);
      
      for (const sat of batch) {
        if (sat.line1 && sat.line2) {
          const position = getPositionFromTLE(sat.line1, sat.line2, now);
          if (position) {
            const key = sat.norad_id || sat.name;
            newPositions.set(key, {
              ...position,
              name: sat.name,
              norad_id: sat.norad_id,
              constellation: sat.constellation,
            });
          }
        }
      }
      
      processed += batchSize;
      
      if (processed < currentSatellites.length) {
        // Continue processing next batch
        setTimeout(processBatch, 0);
      } else {
        // All done
        setPositions(newPositions);
        setIsCalculating(false);
        setLastUpdate(now);
      }
    };
    
    processBatch();
  }, []);
  
  // Set up interval for position updates
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    // Initial calculation
    calculatePositions();
    
    // Set up interval
    intervalRef.current = setInterval(calculatePositions, updateInterval);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, updateInterval, calculatePositions]);
  
  // Recalculate when satellites array changes
  useEffect(() => {
    if (enabled) {
      calculatePositions();
    }
  }, [satellites, enabled, calculatePositions]);
  
  return {
    positions,
    isCalculating,
    lastUpdate,
    recalculate: calculatePositions,
  };
}

/**
 * Custom hook for calculating orbit path
 * 
 * @param {string} line1 - TLE line 1
 * @param {string} line2 - TLE line 2
 * @param {number} durationMinutes - Orbit duration in minutes
 * @param {number} stepSeconds - Time step in seconds
 * @returns {Array} Array of position objects with time
 */
export function useOrbitPath(line1, line2, durationMinutes = 90, stepSeconds = 60) {
  const [path, setPath] = useState([]);
  
  useEffect(() => {
    if (!line1 || !line2) {
      setPath([]);
      return;
    }
    
    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      const positions = [];
      const now = new Date();
      const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
      let currentTime = new Date(now);
      
      while (currentTime <= endTime) {
        const positionAndVelocity = satellite.propagate(satrec, currentTime);
        
        if (positionAndVelocity.position) {
          const gmst = satellite.gstime(currentTime);
          const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
          
          positions.push({
            time: new Date(currentTime),
            latitude: satellite.degreesLat(positionGd.latitude),
            longitude: satellite.degreesLong(positionGd.longitude),
            altitude: positionGd.height * 1000,
          });
        }
        
        currentTime = new Date(currentTime.getTime() + stepSeconds * 1000);
      }
      
      setPath(positions);
    } catch (error) {
      console.error('Error calculating orbit path:', error);
      setPath([]);
    }
  }, [line1, line2, durationMinutes, stepSeconds]);
  
  return path;
}

export default useSatellitePositions;
