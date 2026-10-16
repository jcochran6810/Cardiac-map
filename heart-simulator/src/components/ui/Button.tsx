import React, { forwardRef } from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'quiet' | 'outline';
  active?: boolean;
};

/** Presentation only: callers retain ownership of actions and state. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'quiet', active = false, className = '', type = 'button', onKeyDown, ...props }, ref,
) {
  return <button ref={ref} type={type} className={`ui-button ui-button--${variant} ${active ? 'ui-button--active' : ''} ${className}`} {...props} onKeyDown={(event) => {
    // Native Space activation must not also trigger the simulator shortcut.
    if (event.key === ' ') event.stopPropagation();
    onKeyDown?.(event);
  }} />;
});

type IconButtonProps = ButtonProps & { 'aria-label': string };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', ...props }, ref,
) {
  return <Button ref={ref} className={`ui-button--icon ${className}`} {...props} />;
});
