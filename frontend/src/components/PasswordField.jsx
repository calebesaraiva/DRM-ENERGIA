import { useState } from 'react';
import './PasswordField.css';

function PasswordField({ id, label, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-group password-field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="password-field-control">
        <input {...inputProps} id={id} type={visible ? 'text' : 'password'} />
        <button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} title={visible ? 'Ocultar senha' : 'Mostrar senha'}>
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>
  );
}

export default PasswordField;
