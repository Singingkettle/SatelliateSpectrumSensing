/**
 * LegendPanel - Right sidebar showing satellite inclination legend
 * Replicates satellitemap.space right sidebar legend with view selector
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSatelliteStore } from '../../store/satelliteStore';
import '../../styles/LegendPanel.css';

// Inclination categories
const INCLINATION_CATEGORIES = [
  { labelKey: 'legend.equatorial', sublabel: '0°-30°', color: '#ef4444', key: 'equatorial' },
  { labelKey: 'legend.low', sublabel: '30°-60°', color: '#f97316', key: 'low' },
  { labelKey: 'legend.medium', sublabel: '60°-90°', color: '#eab308', key: 'medium' },
  { labelKey: 'legend.high', sublabel: '90°-120°', color: '#22c55e', key: 'high' },
  { labelKey: 'legend.retrograde', sublabel: '120°-180°', color: '#3b82f6', key: 'retrograde' },
];

// Orbit altitude categories
const ALTITUDE_CATEGORIES = [
  { label: 'LEO', sublabel: '200-2000 km', color: '#22c55e', key: 'leo' },
  { label: 'MEO', sublabel: '2000-35786 km', color: '#f97316', key: 'meo' },
  { label: 'GEO', sublabel: '~35786 km', color: '#3b82f6', key: 'geo' },
  { label: 'HEO', sublabel: 'Highly Elliptical', color: '#8b5cf6', key: 'heo' },
];

const LegendPanel = () => {
  const { t } = useTranslation();
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [showViewSelector, setShowViewSelector] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const menuRef = useRef(null);
  
  const selectedConstellations = useSatelliteStore(s => s.selectedConstellations);
  const constellationData = useSatelliteStore(s => s.constellationData);
  
  // Legend views/modes
  const LEGEND_VIEWS = [
    { id: 'inclination', labelKey: 'legend.inclination', icon: '📐' },
    { id: 'constellation', labelKey: 'legend.constellation', icon: '⭐' },
    { id: 'altitude', labelKey: 'legend.altitude', icon: '📏' },
    { id: 'hardware', labelKey: 'legend.hardwareType', icon: '🛰️' },
    { id: 'reentry', labelKey: 'legend.reentryRisk', icon: '☄️' },
    { id: 'orbit', labelKey: 'legend.orbitType', icon: '🌍' },
  ];
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowViewSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Calculate distribution statistics
  const stats = useMemo(() => {
    let equatorial = 0, low = 0, medium = 0, high = 0, retrograde = 0;
    let leo = 0, meo = 0, geo = 0, heo = 0;
    let total = 0;
    const constellationCounts = {};
    
    for (const slug of selectedConstellations) {
      const data = constellationData[slug];
      if (data?.satellites) {
        constellationCounts[slug] = data.satellites.length;
        data.satellites.forEach(sat => {
          total++;
          const inc = sat.inclination || 53;
          const avgAlt = ((sat.apogee_km || 500) + (sat.perigee_km || 500)) / 2;
          const ecc = sat.eccentricity || 0;
          
          // Inclination classification
          if (inc < 30) equatorial++;
          else if (inc < 60) low++;
          else if (inc < 90) medium++;
          else if (inc < 120) high++;
          else retrograde++;
          
          // Altitude classification
          if (ecc > 0.25) heo++;
          else if (avgAlt < 2000) leo++;
          else if (avgAlt < 35000) meo++;
          else geo++;
        });
      }
    }
    
    return { equatorial, low, medium, high, retrograde, leo, meo, geo, heo, total, constellationCounts };
  }, [selectedConstellations, constellationData]);
  
  const currentView = LEGEND_VIEWS[currentViewIndex];
  
  const handlePrevView = () => {
    setCurrentViewIndex((prev) => 
      prev === 0 ? LEGEND_VIEWS.length - 1 : prev - 1
    );
  };
  
  const handleNextView = () => {
    setCurrentViewIndex((prev) => 
      prev === LEGEND_VIEWS.length - 1 ? 0 : prev + 1
    );
  };
  
  const handleMenuClick = () => {
    setShowViewSelector(!showViewSelector);
  };
  
  const handleSelectView = (index) => {
    setCurrentViewIndex(index);
    setShowViewSelector(false);
  };
  
  const formatPercent = (count, total) => {
    if (total === 0) return '0%';
    return `${((count / total) * 100).toFixed(1)}%`;
  };
  
  const formatNumber = (num) => {
    return num.toLocaleString();
  };
  
  return (
    <div className={`legend-panel ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Decorative stripe on left edge */}
      <div className="legend-stripe" />
      
      {/* Collapse toggle */}
      <button 
        className="legend-collapse-btn"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? t('legend.expand') : t('legend.collapse')}
      >
        {isCollapsed ? '◀' : '▶'}
      </button>
      
      {!isCollapsed && (
        <>
          {/* Header with title */}
          <div className="legend-header">
            <h3 className="legend-title">{t(currentView.labelKey)}</h3>
          </div>
          
          {/* Inclination Legend Items */}
          {currentView.id === 'inclination' && (
            <>
              <div className="legend-items">
                {INCLINATION_CATEGORIES.map((cat) => (
                  <div key={cat.key} className="legend-item">
                    <span 
                      className="legend-color"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="legend-label">{t(cat.labelKey)}</span>
                    <span className="legend-sublabel">{cat.sublabel}</span>
                  </div>
                ))}
              </div>
              
              {/* Distribution Statistics */}
              {stats.total > 0 && (
                <div className="legend-stats">
                  <div className="legend-stat-title">
                    {t('legend.distribution')} ({formatNumber(stats.total)} {t('legend.satellites')})
                  </div>
                  {INCLINATION_CATEGORIES.map(cat => (
                    <div key={cat.key} className="legend-stat-row">
                      <span className="legend-stat-dot" style={{ backgroundColor: cat.color }} />
                      <span className="legend-stat-label">{t(cat.labelKey)}</span>
                      <span className="legend-stat-count">{stats[cat.key]}</span>
                      <span className="legend-stat-value">
                        ({formatPercent(stats[cat.key], stats.total)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          
          {/* Altitude Legend Items */}
          {currentView.id === 'altitude' && (
            <>
              <div className="legend-items">
                {ALTITUDE_CATEGORIES.map((cat) => (
                  <div key={cat.key} className="legend-item">
                    <span 
                      className="legend-color"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="legend-label">{cat.label}</span>
                    <span className="legend-sublabel">{cat.sublabel}</span>
                  </div>
                ))}
              </div>
              
              {stats.total > 0 && (
                <div className="legend-stats">
                  <div className="legend-stat-title">
                    {t('legend.distribution')} ({formatNumber(stats.total)})
                  </div>
                  <div className="legend-stat-row">
                    <span className="legend-stat-dot" style={{ backgroundColor: '#22c55e' }} />
                    <span className="legend-stat-label">LEO</span>
                    <span className="legend-stat-value">{formatPercent(stats.leo, stats.total)}</span>
                  </div>
                  <div className="legend-stat-row">
                    <span className="legend-stat-dot" style={{ backgroundColor: '#f97316' }} />
                    <span className="legend-stat-label">MEO</span>
                    <span className="legend-stat-value">{formatPercent(stats.meo, stats.total)}</span>
                  </div>
                  <div className="legend-stat-row">
                    <span className="legend-stat-dot" style={{ backgroundColor: '#3b82f6' }} />
                    <span className="legend-stat-label">GEO</span>
                    <span className="legend-stat-value">{formatPercent(stats.geo, stats.total)}</span>
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* Constellation Legend */}
          {currentView.id === 'constellation' && (
            <div className="legend-items constellation-list">
              {selectedConstellations.length === 0 ? (
                <div className="legend-empty">{t('legend.noSelection')}</div>
              ) : (
                selectedConstellations.map(slug => (
                  <div key={slug} className="legend-item constellation-item">
                    <span className="legend-label capitalize">{slug}</span>
                    <span className="legend-count">
                      {stats.constellationCounts[slug] || 0}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
          
          {/* Placeholder for other views */}
          {!['inclination', 'altitude', 'constellation'].includes(currentView.id) && (
            <div className="legend-placeholder">
              <span className="placeholder-icon">{currentView.icon}</span>
              <span className="placeholder-text">{t('common.comingSoon')}</span>
            </div>
          )}
          
          {/* Navigation buttons */}
          <div className="legend-nav" ref={menuRef}>
            <button 
              className="legend-nav-btn"
              onClick={handlePrevView}
              title={t('legend.previousView')}
            >
              ‹
            </button>
            <button 
              className={`legend-nav-btn menu-btn ${showViewSelector ? 'active' : ''}`}
              onClick={handleMenuClick}
              title={t('legend.selectView')}
            >
              ☰
            </button>
            <button 
              className="legend-nav-btn"
              onClick={handleNextView}
              title={t('legend.nextView')}
            >
              ›
            </button>
            
            {/* View selector dropdown */}
            {showViewSelector && (
              <div className="legend-view-selector">
                {LEGEND_VIEWS.map((view, index) => (
                  <button
                    key={view.id}
                    className={`view-option ${currentViewIndex === index ? 'active' : ''}`}
                    onClick={() => handleSelectView(index)}
                  >
                    <span className="view-icon">{view.icon}</span>
                    <span className="view-label">{t(view.labelKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default LegendPanel;
