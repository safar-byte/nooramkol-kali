// Pointer Events wiring for the board canvas: one model for mouse, pen and touch.

import { toBoardPoint } from './hitTest.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} handlers
 * @param {() => {width:number,height:number}} handlers.getBoardSize
 * @param {(point, event) => boolean} handlers.onDown  Return true to start a drag.
 * @param {(point, event) => void} handlers.onMove
 * @param {(point, event) => void} handlers.onUp
 * @param {() => void} handlers.onCancel
 * @param {() => void} [handlers.onLeave]
 * @returns {() => void} detach
 */
export function attachInputController(canvas, handlers) {
  let activePointerId = null;

  const toPoint = (event) => {
    const { width, height } = handlers.getBoardSize();
    return toBoardPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), width, height);
  };

  const onPointerDown = (event) => {
    if (activePointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (handlers.onDown(toPoint(event), event)) {
      activePointerId = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-dragging');
      event.preventDefault();
    }
  };

  const onPointerMove = (event) => {
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    // Coalesced events give every intermediate position on fast devices.
    const events = activePointerId !== null && event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    if (events.length > 0) {
      for (const e of events) handlers.onMove(toPoint(e), event);
    } else {
      handlers.onMove(toPoint(event), event);
    }
  };

  const finish = (event, cancelled) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (cancelled) handlers.onCancel();
    else handlers.onUp(toPoint(event), event);
  };

  const onPointerUp = (event) => finish(event, false);
  const onPointerCancel = (event) => finish(event, true);
  const onLostCapture = (event) => {
    if (event.pointerId === activePointerId) finish(event, true);
  };
  const onPointerLeave = () => {
    if (activePointerId === null) handlers.onLeave?.();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onLostCapture);
  canvas.addEventListener('pointerleave', onPointerLeave);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('lostpointercapture', onLostCapture);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.classList.remove('is-dragging');
  };
}
