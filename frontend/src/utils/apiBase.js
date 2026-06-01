export const getApiBaseUrl = () => {
  const rawBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!rawBase || rawBase.toLowerCase() === 'undefined' || rawBase.toLowerCase() === 'null') {
    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return 'http://localhost:3001';
    }
    return '';
  }
  return rawBase.replace(/\/+$/, '');
};

export const withApiBase = (path) => `${getApiBaseUrl()}${path}`;
