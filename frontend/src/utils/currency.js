export const currencyDigitsOnly = (value) => {
  if (value === null || typeof value === 'undefined' || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value)) : '';
  return String(value).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
};

export const currencyInputToNumber = (value) => Number(currencyDigitsOnly(value) || 0);

export const formatCurrencyInput = (value) => {
  const digits = currencyDigitsOnly(value);
  return digits ? Number(digits).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '';
};
