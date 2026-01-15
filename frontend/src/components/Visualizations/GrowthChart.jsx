/**
 * GrowthChart - Constellation growth visualization
 * Shows active, total, and decayed satellites over time
 * Interactive chart with tooltip details matching satellitemap.space
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getConstellationGrowth } from '../../api/satelliteApi';
import '../../styles/GrowthChart.css';

const GrowthChart = ({ constellation }) => {
  const { t } = useTranslation();
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Request growth data with estimate=true to ensure fallback data exists if SATCAT is missing
        const response = await getConstellationGrowth(constellation, 'year'); // Period param is legacy/unused by backend but kept
        const growthData = response.data;
        
        let processedChart = [];
        if (Array.isArray(growthData)) {
           processedChart = growthData.filter(d => d?.date);
        } else if (growthData?.growth) {
           processedChart = growthData.growth;
        }

        // Calculate deltas for "Appeared" and "Decayed" counts per period
        for (let i = 0; i < processedChart.length; i++) {
            const current = processedChart[i];
            const prev = i > 0 ? processedChart[i - 1] : { total: 0, decayed: 0 };
            
            current.appeared_delta = Math.max(0, current.total - prev.total);
            current.decayed_delta = Math.max(0, current.decayed - prev.decayed);
        }
        
        setChartData(processedChart);
      } catch (error) {
        console.error("Failed to fetch growth stats", error);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [constellation]);
  
  if (loading) {
    return <div className="growth-loading">{t('common.loading')}</div>;
  }

  if (!chartData.length) {
    return <div className="growth-loading">{t('common.noData')}</div>;
  }
  
  return (
    <div className="growth-container">
      <div className="growth-chart-container">
        <h3 className="growth-chart-title">{t('constellationData.progress')}</h3>
        <div className="growth-chart" style={{ width: '100%', height: '400px', position: 'relative' }}>
          <InteractiveSVGChart data={chartData} t={t} />
        </div>
      </div>
    </div>
  );
};

export default GrowthChart;

const InteractiveSVGChart = ({ data, t }) => {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) return null;

  const width = 1000;
  const height = 400;
  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scales
  const maxVal = Math.max(1, ...data.map(d => d.active));
  // Add some headroom
  const yMax = Math.ceil(maxVal * 1.1);
  
  const minDate = new Date(data[0].date).getTime();
  const maxDate = new Date(data[data.length - 1].date).getTime();
  const timeSpan = Math.max(1, maxDate - minDate);

  const xScale = (dateStr) => 
    padding.left + ((new Date(dateStr).getTime() - minDate) / timeSpan) * chartWidth;
  
  const yScale = (val) => 
    padding.top + chartHeight - (val / yMax) * chartHeight;

  // Generate Path
  const linePath = data.map((d, i) => {
    const x = xScale(d.date);
    const y = yScale(d.active);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  // Grid lines
  const yTicks = 10;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = (yMax / yTicks) * i;
    const y = yScale(val);
    return { val, y };
  });

  // X Axis Labels (Years)
  const xLabels = [];
  const years = new Set(data.map(d => d.date.substring(0, 4)));
  years.forEach(year => {
      // Find first data point of year
      const point = data.find(d => d.date.startsWith(year));
      if (point) {
          xLabels.push({ text: year, x: xScale(point.date) });
      }
  });

  // Interaction Handler
  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Scale mouseX back to SVG coordinates
    const svgX = (mouseX / rect.width) * width;

    if (svgX < padding.left || svgX > width - padding.right) {
        setHoverIndex(null);
        return;
    }

    // Find nearest data point based on X
    let minDist = Infinity;
    let nearestIdx = -1;

    data.forEach((d, i) => {
        const px = xScale(d.date);
        const dist = Math.abs(px - svgX);
        if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
        }
    });

    setHoverIndex(nearestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Selected Data
  const activePoint = hoverIndex !== null ? data[hoverIndex] : null;
  const activeX = activePoint ? xScale(activePoint.date) : 0;
  const activeY = activePoint ? yScale(activePoint.active) : 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg 
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`} 
        className="growth-svg interact"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Grid Y */}
        {gridLines.map(({val, y}) => (
            <React.Fragment key={val}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#334155" strokeWidth="1" />
                <text x={padding.left - 10} y={y} fill="#94a3b8" fontSize="12" alignmentBaseline="middle" textAnchor="end">
                    {Math.round(val).toLocaleString()}
                </text>
            </React.Fragment>
        ))}

        {/* Grid X (Vertical lines for years) */}
        {xLabels.map(({text, x}) => (
             <React.Fragment key={text}>
                <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                <text x={x} y={height - 10} fill="#94a3b8" fontSize="12" textAnchor="middle">
                    {text}
                </text>
             </React.Fragment>
        ))}

        {/* The Line */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="2" />

        {/* Interactive Elements */}
        {activePoint && (
            <>
                {/* Vertical Cursor Line */}
                <line 
                    x1={activeX} y1={padding.top} 
                    x2={activeX} y2={height - padding.bottom} 
                    stroke="#fff" strokeWidth="1" strokeDasharray="4" 
                    style={{ pointerEvents: 'none' }}
                />
                {/* Point on line */}
                <circle cx={activeX} cy={activeY} r="4" fill="#22c55e" stroke="#fff" strokeWidth="2" style={{ pointerEvents: 'none' }} />
            </>
        )}
      </svg>

      {/* Tooltip Overlay */}
      {activePoint && (
          <div 
            className="growth-tooltip"
            style={{
                position: 'absolute',
                left: `${(activeX / width) * 100}%`,
                top: '20px',
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
            }}
          >
              <div className="tooltip-header">{activePoint.date}</div>
              <div className="tooltip-row">
                  <span className="dot appeared"></span>
                  <span className="label">{t('constellationData.appeared')}:</span>
                  <span className="value">{activePoint.appeared_delta}</span>
              </div>
              <div className="tooltip-row">
                  <span className="dot decayed"></span>
                  <span className="label">{t('constellationData.decayed')}:</span>
                  <span className="value">{activePoint.decayed_delta}</span>
              </div>
              <div className="tooltip-row">
                  <span className="dot active"></span>
                  <span className="label">{t('constellationData.inOrbit')}:</span>
                  <span className="value text-highlight">{activePoint.active != null ? activePoint.active.toLocaleString() : 'N/A'}</span>
              </div>
          </div>
      )}
    </div>
  );
};
