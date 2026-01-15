/**
 * CalculatorModal - Satellite calculation tools
 * Includes Train, Transit, Interference, Celestial, and Altitude History calculators
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/uiStore';
import { syncSatelliteHistory, getSatelliteDecayHistory } from '../../api/satelliteApi';
import '../../styles/CalculatorModal.css';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const CalculatorModal = () => {
  const { t } = useTranslation();
  const [activeCalculator, setActiveCalculator] = useState('altitude');
  
  // Calculator types with translation keys
  const CALCULATORS = [
    { id: 'train', nameKey: 'functions.train', icon: '🚂', descKey: 'calculator.trainDesc' },
    { id: 'transit', nameKey: 'functions.transit', icon: '🔀', descKey: 'calculator.transitDesc' },
    { id: 'interference', nameKey: 'functions.interference', icon: '📶', descKey: 'calculator.interferenceDesc' },
    { id: 'celestial', nameKey: 'functions.celestial', icon: '✨', descKey: 'calculator.celestialDesc' },
    { id: 'altitude', nameKey: 'functions.altitudeHistory', icon: '📈', descKey: 'calculator.altitudeDesc' },
  ];
  
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
        return <TrainCalculator t={t} />;
      case 'transit':
        return <TransitCalculator t={t} />;
      case 'interference':
        return <InterferenceCalculator t={t} />;
      case 'celestial':
        return <CelestialCalculator t={t} />;
      case 'altitude':
        return <AltitudeCalculator t={t} />;
      default:
        return null;
    }
  };
  
  return (
    <div className="calculator-modal-overlay" onClick={handleClose}>
      <div className="calculator-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="calculator-header">
          <div className="calculator-title">
             <span>{t('calculator.title')}</span>
          </div>
          <button className="calculator-close" onClick={handleClose}>×</button>
        </div>
        
        {/* Content */}
        <div className="calculator-content">
             {/* Tabs */}
            <div className="calculator-tabs">
            {CALCULATORS.map(calc => (
                <button
                key={calc.id}
                className={`calc-tab ${activeCalculator === calc.id ? 'active' : ''}`}
                onClick={() => setActiveCalculator(calc.id)}
                title={t(calc.descKey, '')}
                >
                <span className="calc-tab-icon">{calc.icon}</span>
                <span className="calc-tab-name">{t(calc.nameKey)}</span>
                </button>
            ))}
            </div>
            
            {/* Active Calculator Component */}
            <div className="calc-active-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {renderCalculatorContent()}
            </div>
        </div>
      </div>
    </div>
  );
};

// Train Calculator - Satellite train visualization
const TrainCalculator = ({ t }) => {
  const [constellation, setConstellation] = useState('starlink');
  
  return (
    <div className="calc-section">
      <h3 className="calc-section-title">{t('functions.train')}</h3>
      <p className="calc-description">
        {t('common.comingSoon')}
      </p>
      
      <div className="calc-form">
        <div className="calc-field">
          <label className="calc-label">{t('satellite.constellation')}</label>
          <select 
            style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
            value={constellation}
            onChange={(e) => setConstellation(e.target.value)}
          >
            <option value="starlink">Starlink</option>
            <option value="oneweb">OneWeb</option>
            <option value="kuiper">Kuiper</option>
          </select>
        </div>
        <div style={{ color: '#888', marginTop: 20 }}>{t('common.comingSoon')}...</div>
      </div>
    </div>
  );
};

// Placeholders
const TransitCalculator = ({ t }) => <div className="calc-placeholder">{t('functions.transit')} - {t('common.comingSoon')}</div>;
const InterferenceCalculator = ({ t }) => <div className="calc-placeholder">{t('functions.interference')} - {t('common.comingSoon')}</div>;
const CelestialCalculator = ({ t }) => <div className="calc-placeholder">{t('functions.celestial')} - {t('common.comingSoon')}</div>;

// Altitude History Calculator
const AltitudeCalculator = ({ t }) => {
    const [inputIds, setInputIds] = useState('25544');
    const [loading, setLoading] = useState(false);
    const [datasets, setDatasets] = useState([]);

    const handlePlot = async () => {
        setLoading(true);
        setDatasets([]);
        const noradList = inputIds.split(/[\n,]+/).map(s => s.trim()).filter(s => s && !isNaN(s));
        
        const newDatasets = [];
        
        for (const [index, id] of noradList.entries()) {
          try {
            // 1. Trigger backend sync (backfill history if missing)
            await syncSatelliteHistory(id);
            
            // 2. Fetch history data
            const response = await getSatelliteDecayHistory(id);
            const data = response.data;
            
            if (Array.isArray(data) && data.length > 0) {
              newDatasets.push({
                id,
                color: COLORS[index % COLORS.length],
                data: data.map(d => ({
                  date: new Date(d.date),
                  altitude: d.altitude_km,
                  period: d.period_minutes
                })).sort((a, b) => a.date - b.date)
              });
            }
          } catch (err) {
            console.error(`Failed to load data for ${id}:`, err);
          }
        }
        
        setDatasets(newDatasets);
        setLoading(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
            <div style={{ padding: '0 4px', color: '#94a3b8', fontSize: '0.9rem' }}>
                {t('calculator.altitudeHistory')}
            </div>

            {/* Input */}
            <div className="calc-input-section">
                <label className="calc-label">{t('calculator.enterNoradIds')}</label>
                <textarea 
                    className="calc-textarea"
                    value={inputIds}
                    onChange={(e) => setInputIds(e.target.value)}
                    placeholder={t('calculator.noradPlaceholder')}
                />
                <div className="calc-actions">
                    <button className="calc-btn primary" onClick={handlePlot} disabled={loading}>
                        {loading ? t('calculator.plotting') : `🔄 ${t('calculator.plot')}`}
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div className="calc-chart-area">
                {datasets.length > 0 ? (
                    <InteractiveChart datasets={datasets} t={t} />
                ) : (
                    <div className="calc-chart-placeholder">
                        {loading ? t('common.loading') : t('calculator.noData')}
                    </div>
                )}
            </div>
        </div>
    );
};

// Internal Chart Component
const InteractiveChart = ({ datasets, t }) => {
  const containerRef = useRef(null);
  const [cursorX, setCursorX] = useState(null);
  
  // Combine all points to find ranges
  const allPoints = datasets.flatMap(d => d.data);
  if (allPoints.length === 0) return null;

  const minDate = Math.min(...allPoints.map(p => p.date));
  const maxDate = Math.max(...allPoints.map(p => p.date));
  const minAlt = Math.min(...allPoints.map(p => p.altitude));
  const maxAlt = Math.max(...allPoints.map(p => p.altitude));
  
  // Padding
  const margin = { top: 20, right: 60, bottom: 40, left: 60 };
  const width = 900;
  const height = 400;
  
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  
  const dateSpan = maxDate - minDate || 1;
  const altSpan = maxAlt - minAlt || 1;
  
  const getX = (date) => margin.left + ((date - minDate) / dateSpan) * chartW;
  const getY = (alt) => margin.top + chartH - ((alt - minAlt) / altSpan) * chartH;

  // Interaction
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scaleX = width / rect.width;
    const svgX = x * scaleX;
    
    if (svgX >= margin.left && svgX <= width - margin.right) {
        setCursorX(svgX);
    } else {
        setCursorX(null);
    }
  };

  const handleMouseLeave = () => setCursorX(null);

  // Find data points near cursor
  const cursorDate = cursorX ? new Date(minDate + ((cursorX - margin.left) / chartW) * dateSpan) : null;
  const activePoints = cursorDate ? datasets.map(ds => {
      const closest = ds.data.reduce((prev, curr) => 
          Math.abs(curr.date - cursorDate) < Math.abs(prev.date - cursorDate) ? curr : prev
      );
      return { ...closest, color: ds.color, id: ds.id };
  }) : [];

  // Ticks
  const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(tick => new Date(minDate + tick * dateSpan));
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(tick => minAlt + tick * altSpan);

  return (
    <div 
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'relative' }} 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="altitude-chart-svg" preserveAspectRatio="none">
        {/* Grid X */}
        {xTicks.map((date, i) => (
            <line key={i} x1={getX(date)} y1={margin.top} x2={getX(date)} y2={height - margin.bottom} stroke="rgba(255,255,255,0.1)" />
        ))}
        {/* Grid Y */}
        {yTicks.map((alt, i) => (
            <line key={i} x1={margin.left} y1={getY(alt)} x2={width - margin.right} y2={getY(alt)} stroke="rgba(255,255,255,0.1)" />
        ))}

        {/* Axes Labels */}
        <text x={10} y={height/2} transform={`rotate(-90 10 ${height/2})`} fill="#fff" textAnchor="middle" fontSize="12">{t('calculator.altitude')} ({t('units.km')})</text>
        {yTicks.map((alt, i) => (
            <text key={i} x={margin.left - 10} y={getY(alt)} fill="#aaa" textAnchor="end" alignmentBaseline="middle" fontSize="10">{Math.round(alt)}</text>
        ))}

        {/* X Axis (Date) */}
        {xTicks.map((date, i) => (
            <text key={i} x={getX(date)} y={height - margin.bottom + 20} fill="#aaa" textAnchor="middle" fontSize="10">
                {date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </text>
        ))}

        {/* Lines */}
        {datasets.map(ds => {
            const path = ds.data.map((p, i) => `${i===0?'M':'L'} ${getX(p.date)} ${getY(p.altitude)}`).join(' ');
            return <path key={ds.id} d={path} fill="none" stroke={ds.color} strokeWidth="2" />;
        })}

        {/* Cursor Line */}
        {cursorX && (
            <line x1={cursorX} y1={margin.top} x2={cursorX} y2={height - margin.bottom} stroke="rgba(255,255,255,0.5)" strokeDasharray="4" />
        )}

        {/* Active Points Highlights */}
        {cursorX && activePoints.map((p, i) => (
            <g key={i}>
                <circle cx={getX(p.date)} cy={getY(p.altitude)} r="4" fill={p.color} stroke="#fff" strokeWidth="2" />
            </g>
        ))}
      </svg>
      
      {/* Tooltip (HTML overlay) */}
      {cursorX && (
          <div style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'rgba(0,0,0,0.8)',
              border: '1px solid #444',
              padding: '10px',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              pointerEvents: 'none',
              zIndex: 10
          }}>
              <div style={{ marginBottom: '5px', borderBottom: '1px solid #555', paddingBottom: '3px' }}>
                  {cursorDate && cursorDate.toLocaleString ? cursorDate.toLocaleString() : t('common.unknown')}
              </div>
              {activePoints.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: p.color }}></span>
                      <span>{p.id}: {p.altitude != null ? p.altitude.toFixed(2) : 'N/A'} {t('units.km')}</span>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};

export default CalculatorModal;
