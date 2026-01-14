/**
 * CalculatorModal - Satellite calculation tools
 * Includes Train, Transit, Interference, Celestial, and Altitude History calculators
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useUiStore } from '../../store/uiStore';
import '../../styles/CalculatorModal.css';

// Calculator types
const CALCULATORS = [
  { id: 'train', name: 'Train', icon: '🚂', description: 'Satellite train visualization' },
  { id: 'transit', name: 'Transit', icon: '🔀', description: 'Calculate satellite transits' },
  { id: 'interference', name: 'Interference', icon: '📶', description: 'Radio interference analysis' },
  { id: 'celestial', name: 'Celestial', icon: '✨', description: 'Celestial object positions' },
  { id: 'altitude', name: 'Altitude History', icon: '📈', description: 'Historical altitude tracking' },
];

const CalculatorModal = () => {
  const [activeCalculator, setActiveCalculator] = useState('train');
  
  const showCalculatorModal = useUiStore(s => s.showCalculatorModal);
  const setShowCalculatorModal = useUiStore(s => s.setShowCalculatorModal);
  
  const handleClose = useCallback(() => {
    setShowCalculatorModal(false);
  }, [setShowCalculatorModal]);
  
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);
  
  if (!showCalculatorModal) return null;
  
  const renderCalculatorContent = () => {
    switch (activeCalculator) {
      case 'train':
        return <TrainCalculator />;
      case 'transit':
        return <TransitCalculator />;
      case 'interference':
        return <InterferenceCalculator />;
      case 'celestial':
        return <CelestialCalculator />;
      case 'altitude':
        return <AltitudeCalculator />;
      default:
        return null;
    }
  };
  
  return (
    <div className="calc-modal-overlay" onClick={handleClose}>
      <div className="calc-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="calc-header">
          <h2 className="calc-title">Calculator</h2>
          <button className="calc-close" onClick={handleClose}>×</button>
        </div>
        
        {/* Calculator Selection */}
        <div className="calc-tabs">
          {CALCULATORS.map(calc => (
            <button
              key={calc.id}
              className={`calc-tab ${activeCalculator === calc.id ? 'active' : ''}`}
              onClick={() => setActiveCalculator(calc.id)}
              title={calc.description}
            >
              <span className="calc-tab-icon">{calc.icon}</span>
              <span className="calc-tab-name">{calc.name}</span>
            </button>
          ))}
        </div>
        
        {/* Content */}
        <div className="calc-content">
          {renderCalculatorContent()}
        </div>
      </div>
    </div>
  );
};

// Train Calculator - Satellite train visualization
const TrainCalculator = () => {
  const [constellation, setConstellation] = useState('starlink');
  const [launchDate, setLaunchDate] = useState('');
  
  return (
    <div className="calc-section">
      <h3 className="calc-section-title">Satellite Train Calculator</h3>
      <p className="calc-description">
        Visualize recently launched satellite trains as they appear in the night sky.
      </p>
      
      <div className="calc-form">
        <div className="calc-field">
          <label className="calc-label">Constellation</label>
          <select 
            className="calc-select"
            value={constellation}
            onChange={(e) => setConstellation(e.target.value)}
          >
            <option value="starlink">Starlink</option>
            <option value="oneweb">OneWeb</option>
            <option value="kuiper">Kuiper</option>
          </select>
        </div>
        
        <div className="calc-field">
          <label className="calc-label">Launch Date</label>
          <input 
            type="date" 
            className="calc-input"
            value={launchDate}
            onChange={(e) => setLaunchDate(e.target.value)}
          />
        </div>
        
        <div className="calc-field">
          <label className="calc-label">Observer Location</label>
          <div className="calc-location-inputs">
            <input 
              type="number" 
              placeholder="Latitude"
              className="calc-input-small"
            />
            <input 
              type="number" 
              placeholder="Longitude"
              className="calc-input-small"
            />
          </div>
        </div>
        
        <button className="calc-submit">Calculate Train Visibility</button>
      </div>
    </div>
  );
};

// Transit Calculator
const TransitCalculator = () => (
  <div className="calc-section">
    <h3 className="calc-section-title">Transit Calculator</h3>
    <p className="calc-description">
      Calculate when satellites will transit across celestial objects like the Sun or Moon.
    </p>
    
    <div className="calc-form">
      <div className="calc-field">
        <label className="calc-label">Target Object</label>
        <select className="calc-select">
          <option value="sun">Sun</option>
          <option value="moon">Moon</option>
          <option value="planet">Planet</option>
        </select>
      </div>
      
      <div className="calc-field">
        <label className="calc-label">Time Range</label>
        <div className="calc-date-range">
          <input type="date" className="calc-input" />
          <span className="calc-range-sep">to</span>
          <input type="date" className="calc-input" />
        </div>
      </div>
      
      <div className="calc-field">
        <label className="calc-label">Observer Location</label>
        <div className="calc-location-inputs">
          <input type="number" placeholder="Latitude" className="calc-input-small" />
          <input type="number" placeholder="Longitude" className="calc-input-small" />
        </div>
      </div>
      
      <button className="calc-submit">Find Transits</button>
    </div>
  </div>
);

// Interference Calculator
const InterferenceCalculator = () => (
  <div className="calc-section">
    <h3 className="calc-section-title">Interference Calculator</h3>
    <p className="calc-description">
      Analyze potential radio frequency interference between satellites and ground stations.
    </p>
    
    <div className="calc-form">
      <div className="calc-field">
        <label className="calc-label">Constellation</label>
        <select className="calc-select">
          <option value="starlink">Starlink</option>
          <option value="oneweb">OneWeb</option>
          <option value="gps">GPS</option>
          <option value="galileo">Galileo</option>
        </select>
      </div>
      
      <div className="calc-field">
        <label className="calc-label">Frequency Band (MHz)</label>
        <div className="calc-freq-inputs">
          <input type="number" placeholder="Min" className="calc-input-small" />
          <span className="calc-range-sep">-</span>
          <input type="number" placeholder="Max" className="calc-input-small" />
        </div>
      </div>
      
      <div className="calc-field">
        <label className="calc-label">Ground Station Location</label>
        <div className="calc-location-inputs">
          <input type="number" placeholder="Latitude" className="calc-input-small" />
          <input type="number" placeholder="Longitude" className="calc-input-small" />
        </div>
      </div>
      
      <button className="calc-submit">Calculate Interference</button>
    </div>
  </div>
);

// Celestial Calculator
const CelestialCalculator = () => (
  <div className="calc-section">
    <h3 className="calc-section-title">Celestial Calculator</h3>
    <p className="calc-description">
      Find positions of celestial objects for observation planning.
    </p>
    
    <div className="calc-form">
      <div className="calc-field">
        <label className="calc-label">Object Type</label>
        <select className="calc-select">
          <option value="sun">Sun</option>
          <option value="moon">Moon</option>
          <option value="mercury">Mercury</option>
          <option value="venus">Venus</option>
          <option value="mars">Mars</option>
          <option value="jupiter">Jupiter</option>
          <option value="saturn">Saturn</option>
        </select>
      </div>
      
      <div className="calc-field">
        <label className="calc-label">Date & Time (UTC)</label>
        <input type="datetime-local" className="calc-input" />
      </div>
      
      <div className="calc-field">
        <label className="calc-label">Observer Location</label>
        <div className="calc-location-inputs">
          <input type="number" placeholder="Latitude" className="calc-input-small" />
          <input type="number" placeholder="Longitude" className="calc-input-small" />
        </div>
      </div>
      
      <button className="calc-submit">Calculate Position</button>
    </div>
  </div>
);

// Altitude History Calculator
const AltitudeCalculator = () => (
  <div className="calc-section">
    <h3 className="calc-section-title">Altitude History</h3>
    <p className="calc-description">
      Track historical altitude changes for a satellite to predict decay.
    </p>
    
    <div className="calc-form">
      <div className="calc-field">
        <label className="calc-label">Satellite NORAD ID</label>
        <input 
          type="number" 
          placeholder="Enter NORAD ID (e.g., 25544 for ISS)"
          className="calc-input"
        />
      </div>
      
      <div className="calc-field">
        <label className="calc-label">Time Period</label>
        <select className="calc-select">
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="180">Last 6 months</option>
          <option value="365">Last year</option>
        </select>
      </div>
      
      <button className="calc-submit">Show Altitude History</button>
    </div>
  </div>
);

export default CalculatorModal;
