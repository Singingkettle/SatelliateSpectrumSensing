/**
 * LaunchHistory - Constellation launch history table
 * Shows launches by year with expandable details
 */
import React, { useState } from 'react';
import '../../styles/LaunchHistory.css';

// Mock launch data
const mockLaunchData = {
  starlink: {
    2026: [
      { date: 'Jan 12 21:08', mission: 'Starlink Group 6-97', site: 'Cape Canaveral', cospar: '2026-005', status: 'success', alt: '559 km', incl: '43.0°', count: 29, ok: 29, rocket: 'Falcon 9', version: 'v2 mini' },
      { date: 'Jan 9 21:41', mission: 'Starlink Group 6-5', site: 'Cape Canaveral', cospar: '2026-003', status: 'success', alt: '559 km', incl: '43.0°', count: 29, ok: 29, rocket: 'Falcon 9', version: 'v2 mini' },
      { date: 'Jan 4 06:48', mission: 'Starlink Group 6-8', site: 'Cape Canaveral', cospar: '2026-002', status: 'success', alt: '559 km', incl: '43.0°', count: 29, ok: 29, rocket: 'Falcon 9', version: 'v2 mini' },
    ],
    2025: { total: 126, expanded: false },
    2024: { total: 90, expanded: false },
    2023: { total: 63, expanded: false },
    2022: { total: 34, expanded: false },
    2021: { total: 19, expanded: false },
    2020: { total: 14, expanded: false },
    2019: { total: 2, expanded: false },
    2018: { total: 1, expanded: false },
  },
  gps: {
    2026: [],
    2025: { total: 2, expanded: false },
    2024: { total: 1, expanded: false },
    2023: { total: 2, expanded: false },
  },
};

const LaunchHistory = ({ constellation }) => {
  const [expandedYears, setExpandedYears] = useState({ 2026: true });
  
  const data = mockLaunchData[constellation] || mockLaunchData.starlink;
  
  const toggleYear = (year) => {
    setExpandedYears(prev => ({
      ...prev,
      [year]: !prev[year]
    }));
  };
  
  const years = Object.keys(data).sort((a, b) => b - a);
  
  return (
    <div className="launch-history">
      <h3 className="launch-title">
        {constellation.charAt(0).toUpperCase() + constellation.slice(1)} Launch History
      </h3>
      
      <div className="launch-list">
        {years.map(year => {
          const yearData = data[year];
          const isExpanded = expandedYears[year];
          const isArray = Array.isArray(yearData);
          const total = isArray ? yearData.length : yearData.total;
          
          return (
            <div key={year} className="launch-year">
              {/* Year Header */}
              <div 
                className={`launch-year-header ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleYear(year)}
              >
                <span className="launch-year-title">
                  {year}: total {total}
                </span>
                <span className="launch-year-toggle">
                  {isExpanded ? '∧' : '∨'}
                </span>
              </div>
              
              {/* Year Content */}
              {isExpanded && isArray && yearData.length > 0 && (
                <div className="launch-year-content">
                  <table className="launch-table">
                    <thead>
                      <tr>
                        <th>DATE UTC</th>
                        <th>MISSION</th>
                        <th>LAUNCH SITE</th>
                        <th>COSPAR</th>
                        <th>STATUS</th>
                        <th>ALT</th>
                        <th>INCL</th>
                        <th>#</th>
                        <th>OK</th>
                        <th>ROCKET</th>
                        <th>NOTES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearData.map((launch, idx) => (
                        <tr key={idx}>
                          <td>{launch.date}</td>
                          <td>
                            <span className="launch-mission-new">★</span>
                            <a href="#" className="launch-mission-link">
                              {launch.mission}
                            </a>
                          </td>
                          <td>{launch.site}</td>
                          <td>{launch.cospar}</td>
                          <td className={`launch-status ${launch.status}`}>
                            {launch.status}
                          </td>
                          <td>{launch.alt}</td>
                          <td>{launch.incl}</td>
                          <td>{launch.count}</td>
                          <td className="launch-ok">{launch.ok}</td>
                          <td>{launch.rocket}</td>
                          <td className="launch-notes">
                            Satellite version: {launch.version}; COSPAR ID: {launch.cospar}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {isExpanded && !isArray && (
                <div className="launch-year-content">
                  <p className="launch-placeholder">
                    {total} launches in {year}. Click to load details.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LaunchHistory;
