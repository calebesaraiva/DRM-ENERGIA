import { currencyDigitsOnly, formatCurrencyInput } from '../utils/currency';

export default function CurrencyInput({ value, onValueChange, onCommit, onChange, onBlur, ...props }) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9.]*"
      value={formatCurrencyInput(value)}
      onChange={(event) => {
        const nextDigits = currencyDigitsOnly(event.target.value);
        onValueChange?.(nextDigits);
        onChange?.(event);
      }}
      onBlur={(event) => {
        onCommit?.(currencyDigitsOnly(value));
        onBlur?.(event);
      }}
    />
  );
}
