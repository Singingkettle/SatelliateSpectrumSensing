/**
 * DecayTracking - Visualization of satellite re-entries and decays
 * Shows chart of decays over time and list of details
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getConstellationDecays } from '../../api/satelliteApi';
import '../../styles/LaunchHistory.css';
import '../../styles/GrowthChart.css'; // Reuse chart styles

const DecayTracking = ({ constellation }) => {
  const { t } = useTranslation();
  const [decays, setDecays] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await getConstellationDecays(constellation);
        setDecays(response.data);
      } catch (error) {
        console.error("Failed to fetch decay history", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [constellation]);

  const chartData = useMemo(() => {
    if (!decays.length) return [];

    // Group by day
    const dailyCounts = {};
    decays.forEach(d => {
      if (!d.decay_date) return;
      const date = d.decay_date.substring(0, 10);
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    // Create array sorted by date
    const sortedDates = Object.keys(dailyCounts).sort();
    
    let cumulative = 0;
    return sortedDates.map(date => {
      cumulative += dailyCounts[date];
      return {
        date,
        count: dailyCounts[date],
        cumulative
      };
    });
  }, [decays]);
  
  if (loading) {
    return <div className="launch-history-loading">{t('common.loading')}</div>;
  }
  
  return (
    <div className="launch-history">
      <h3 className="launch-title">
        {constellation.charAt(0).toUpperCase() + constellation.slice(1)} {t('constellationData.decayTracking')}
      </h3>
      
      {/* Chart Section */}
      <div className="growth-chart-container" style={{ marginBottom: '2rem' }}>
        <h4 style={{ color: '#94a3b8', margin: '0 0 10px 0' }}>
          {t('constellationData.dailyDecays')} / {t('constellationData.cumulativeDecays')}
        </h4>
        <div className="growth-chart" style={{ width: '100%', height: '300px' }}>
           <DecayComboChart data={chartData} t={t} />
        </div>
      </div>

      <div className="launch-year-content" style={{ display: 'block' }}>
        <table className="launch-table">
          <thead>
            <tr>
              <th>NORAD ID</th>
              <th>{t('satelliteNameColumn')}</th>
              <th>{t('satellite.intlDesignator')}</th>
              <th>{t('constellationData.decayDate')}</th>
              <th>{t('constellationData.launchDate')}</th>
              <th>REASON</th>
            </tr>
          </thead>
          <tbody>
            {decays.map((sat) => (
              <tr key={sat.norad_id}>
                <td>{sat.norad_id}</td>
                <td>{sat.name}</td>
                <td>{sat.intl_designator}</td>
                <td className="launch-status failure">{sat.decay_date ? sat.decay_date.substring(0, 10) : 'Unknown'}</td>
                <td>{sat.launch_date ? sat.launch_date.substring(0, 10) : 'Unknown'}</td>
                <td>{sat.reason}</td>
              </tr>
            ))}
            {decays.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                  {t('constellationData.noDecays')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DecayComboChart = ({ data, t }) => {
  if (!data || data.length === 0) return <div style={{color: '#64748b', textAlign: 'center', paddingTop: '100px'}}>{t('common.noData')}</div>;

  const width = 900;
  const height = 300;
  const padding = { top: 20, right: 60, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scales
  const maxDaily = Math.max(1, ...data.map(d => d.count));
  const maxCumulative = Math.max(1, ...data.map(d => d.cumulative));
  
  // Date scale
  const dates = data.map(d => new Date(d.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const timeSpan = Math.max(1, maxDate - minDate);

  const xScale = (dateStr) => {
    const time = new Date(dateStr).getTime();
    return padding.left + ((time - minDate) / timeSpan) * chartWidth;
  };

  const yScaleDaily = (val) => padding.top + chartHeight - (val / maxDaily) * chartHeight;
  const yScaleCumulative = (val) => padding.top + chartHeight - (val / maxCumulative) * chartHeight;

  // Bar width (dynamic based on time span or fixed pixel width if crowded)
  // Simple approximation: distribute bars evenly
  const barWidth = Math.max(1, (chartWidth / data.length) * 0.8);

  // Line Path for Cumulative
  const linePath = data.map((d, i) => {
    const x = xScale(d.date);
    const y = yScaleCumulative(d.cumulative);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="growth-svg">
      {/* Bars (Daily) */}
      {data.map((d, i) => {
        const x = xScale(d.date) - barWidth/2;
        const y = yScaleDaily(d.count);
        const h = chartHeight - (y - padding.top);
        return (
          <rect 
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            fill="#ef4444"
            opacity="0.6"
          />
        );
      })}

      {/* Line (Cumulative) */}
      <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2" />

      {/* Axis Lines */}
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#475569" />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#475569" />
      <line x1={width - padding.right} y1={padding.top} x2={width - padding.right} y2={height - padding.bottom} stroke="#475569" />

      {/* Labels Left (Daily) */}
      <text x={padding.left - 10} y={padding.top} fill="#ef4444" fontSize="10" textAnchor="end">{t('constellationData.dailyDecays')}</text>
      <text x={padding.left - 10} y={padding.top + 15} fill="#ef4444" fontSize="10" textAnchor="end">{maxDaily}</text>

      {/* Labels Right (Cumulative) */}
      <text x={width - padding.right + 10} y={padding.top} fill="#60a5fa" fontSize="10" textAnchor="start">Total</text>
      <text x={width - padding.right + 10} y={padding.top + 15} fill="#60a5fa" fontSize="10" textAnchor="start">{maxCumulative}</text>
      
      {/* Time Labels (First and Last) */}
      <text x={padding.left} y={height - 20} fill="#94a3b8" fontSize="10" textAnchor="middle">{data[0]?.date}</text>
      <text x={width - padding.right} y={height - 20} fill="#94a3b8" fontSize="10" textAnchor="middle">{data[data.length-1]?.date}</text>

    </svg>
  );
};

export default DecayTracking;
