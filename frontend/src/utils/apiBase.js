export const getApiBaseUrl = () => {
  const rawBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!rawBase || rawBase.toLowerCase() === 'undefined' || rawBase.toLowerCase() === 'null') {
    return '';
  }
  return rawBase.replace(/\/+$/, '');
};

export const withApiBase = (path) => `${getApiBaseUrl()}${path}`;
