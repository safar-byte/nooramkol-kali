import { useEffect, useId, useRef } from 'react';

/**
 * Modal built on the native <dialog> element, which provides focus trapping,
 * Escape handling and the backdrop. Mount it to open it.
 * When `onClose` is omitted, Escape does nothing (the player must pick a button).
 */
export default function Dialog({ title, onClose, children, className = '', titleIcon = null }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        {titleIcon && (
          <span className="dialog-title-icon" aria-hidden="true">
            {titleIcon}
          </span>
        )}
        {title}
      </h2>
      {children}
    </dialog>
  );
}
