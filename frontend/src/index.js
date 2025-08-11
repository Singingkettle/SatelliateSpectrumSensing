import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App';
import './i18n'; // Import the i18n configuration
import CompanionInfo from './views/CompanionInfo';

const root = ReactDOM.createRoot(document.getElementById('root'));

function RootRouter() {
  const path = window.location.pathname
  if (path.startsWith('/companion/')) return <CompanionInfo />
  return <App />
}

root.render(
  <React.StrictMode>
    <RootRouter />
  </React.StrictMode>
);
