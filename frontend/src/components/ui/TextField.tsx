import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leadingIcon?: ReactNode;
}

/**
 * Errors sit under the field and describe what to do, not what the validator
 * technically objected to.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, leadingIcon, className, id, type, ...rest }, ref) => {
    const fieldId = id ?? rest.name;
    const [revealed, setRevealed] = useState(false);
    const isPassword = type === 'password';

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="field-label">
            {label}
          </label>
        )}

        <div className="relative">
          {leadingIcon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              {leadingIcon}
            </span>
          )}

          <input
            ref={ref}
            id={fieldId}
            type={isPassword && revealed ? 'text' : type}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className={clsx(
              'field',
              leadingIcon && 'pl-10',
              isPassword && 'pr-10',
              error && 'border-chili/60 focus:border-chili',
              className,
            )}
            {...rest}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              aria-label={revealed ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>

        {error ? (
          <p id={`${fieldId}-error`} className="field-error">
            {error}
          </p>
        ) : (
          hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
        )}
      </div>
    );
  },
);

TextField.displayName = 'TextField';
