import { useEffect, useRef } from 'react';

/** Run `callback(now)` every animation frame while `active`. Cleans up on unmount. */
export function useGameLoop(callback, active = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return undefined;
    let frameId = requestAnimationFrame(function tick(now) {
      callbackRef.current(now);
      frameId = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frameId);
  }, [active]);
}
