import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enTranslation from './locales/en/translation.json';
import zhTranslation from './locales/zh/translation.json';

const resources = {
  en: {
    translation: enTranslation,
  },
  zh: {
    translation: zhTranslation,
  },
};

// Custom IP-based language detector
const ipLanguageDetector = {
  name: 'ipDetector',
  
  // Synchronous lookup - returns cached value if available
  lookup: () => {
    // Return null to let other detectors handle it
    // The actual IP detection is async and will cache result
    return null;
  },
  
  // Asynchronous detection with IP geolocation
  async: true,
  detect: async (callback) => {
    try {
      // Check localStorage first
      const stored = localStorage.getItem('i18nextLng');
      if (stored) {
        callback(stored);
        return;
      }
      
      // Try to detect language from IP geolocation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('https://ipapi.co/json/', { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const country = data.country_code;
        
        // Chinese-speaking regions
        const chineseRegions = ['CN', 'TW', 'HK', 'MO', 'SG'];
        
        if (chineseRegions.includes(country)) {
          callback('zh');
          return;
        }
      }
    } catch (error) {
      // Silently fail, use fallback
      console.log('IP detection failed, using fallback');
    }
    
    // Default to browser language or Chinese
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang && browserLang.startsWith('zh')) {
      callback('zh');
    } else if (browserLang && browserLang.startsWith('en')) {
      callback('en');
    } else {
      callback('zh'); // Default fallback
    }
  },
  
  cacheUserLanguage: (lng) => {
    localStorage.setItem('i18nextLng', lng);
  },
};

// Add custom detector to language detector
const languageDetector = new LanguageDetector();
languageDetector.addDetector(ipLanguageDetector);

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh', // Default to Chinese if detection fails
    debug: false, // Disable debug in production
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    detection: {
      order: ['localStorage', 'navigator', 'ipDetector'],
      caches: ['localStorage'],
    },
  });

export default i18n;
