/**
 * LaunchHistory - Constellation launch history table
 * Shows launches by year with expandable details
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getConstellationLaunches } from '../../api/satelliteApi';
import '../../styles/LaunchHistory.css';

const LaunchHistory = ({ constellation }) => {
  const { t } = useTranslation();
  const [data, setData] = useState({});
  const [expandedYears, setExpandedYears] = useState({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await getConstellationLaunches(constellation);
        const launches = response.data;
        
        // Group by year
        const grouped = {};
        launches.forEach(launch => {
            const year = launch.date ? launch.date.substring(0, 4) : 'Unknown';
            if (!grouped[year]) {
                grouped[year] = [];
            }
            grouped[year].push(launch);
        });
        
        setData(grouped);
        
        // Auto-expand current year if it has data
        const currentYear = new Date().getFullYear().toString();
        if (grouped[currentYear]) {
            setExpandedYears({ [currentYear]: true });
        }
        
      } catch (error) {
        console.error("Failed to fetch launch history", error);
        // Fallback to empty or error state
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [constellation]);
  
  const toggleYear = (year) => {
    setExpandedYears(prev => ({
      ...prev,
      [year]: !prev[year]
    }));
  };
  
  if (loading) {
      return <div className="launch-history-loading">{t('common.loading')}</div>;
  }
  
  const years = Object.keys(data).sort((a, b) => b - a);
  
  return (
    <div className="launch-history">
      <h3 className="launch-title">
        {constellation.charAt(0).toUpperCase() + constellation.slice(1)} {t('constellationData.launchHistory')}
      </h3>
      
      <div className="launch-list">
        {years.map(year => {
          const yearData = data[year];
          const isExpanded = expandedYears[year];
          const total = yearData.length;
          
          return (
            <div key={year} className="launch-year">
              {/* Year Header */}
              <div 
                className={`launch-year-header ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleYear(year)}
              >
                <span className="launch-year-title">
                  {year}: {t('constellationData.count')} {total}
                </span>
                <span className="launch-year-toggle">
                  {isExpanded ? '∧' : '∨'}
                </span>
              </div>
              
              {/* Year Content */}
              {isExpanded && (
                <div className="launch-year-content">
                  <table className="launch-table">
                    <thead>
                      <tr>
                        <th>{t('constellationData.launchDate')}</th>
                        <th>{t('constellationData.mission')}</th>
                        <th>{t('constellationData.site')}</th>
                        <th>COSPAR</th>
                        <th>STATUS</th>
                        <th>{t('satellite.altitude')}</th>
                        <th>{t('satellite.inclination')}</th>
                        <th>#</th>
                        <th>OK</th>
                        <th>{t('constellationData.vehicle')}</th>
                        <th>NOTES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearData.map((launch, idx) => (
                        <tr key={idx}>
                          <td>{launch.date ? launch.date.replace('T', ' ').substring(0, 16) : 'N/A'}</td>
                          <td>
                            <span className="launch-mission-new">★</span>
                            <span className="launch-mission-link">
                              {launch.mission}
                            </span>
                          </td>
                          <td>{launch.site}</td>
                          <td>{launch.cospar_id}</td>
                          <td className={`launch-status ${launch.status}`}>
                            {launch.status}
                          </td>
                          <td>{launch.avg_altitude_km} km</td>
                          <td>{launch.avg_inclination_deg}°</td>
                          <td>{launch.count}</td>
                          <td className="launch-ok">{launch.active_count}</td>
                          <td>{launch.rocket}</td>
                          <td className="launch-notes">
                            COSPAR ID: {launch.cospar_id}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {years.length === 0 && <div className="no-data">{t('constellationData.noLaunches')}</div>}
      </div>
    </div>
  );
};

export default LaunchHistory;
