import React, { useRef } from 'react';

/**
 * Mythic: Operator ask field
 * Engineering: InputBox
 */
function InputBox({
  value,
  onChange,
  onSubmit,
  disabled,
  forceDemo,
  onToggleForceDemo,
  placeholder = 'Ask Infinity… (/help for commands)',
}) {
  const ref = useRef(null);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && String(value || '').trim()) onSubmit?.();
    }
  };

  return (
    <form
      className="sovereign-input"
      data-testid="sovereign-input-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && String(value || '').trim()) onSubmit?.();
      }}
    >
      <label htmlFor="sovereign-ask" className="visually-hidden">
        Message
      </label>
      <textarea
        id="sovereign-ask"
        ref={ref}
        rows={3}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="sovereign-input__bar">
        <label className="sovereign-check">
          <input
            type="checkbox"
            checked={Boolean(forceDemo)}
            onChange={(e) => onToggleForceDemo?.(e.target.checked)}
          />
          Force demo
        </label>
        <button type="submit" disabled={disabled || !String(value || '').trim()}>
          {disabled ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export default InputBox;
