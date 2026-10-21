// Frame-level board engine: owns drag state, animations and rendering so React
// only re-renders on meaningful game events. Game rules stay in the reducer and
// the pure validation modules; this file only connects them to input and canvas.

import { DIFFICULTIES, LAYOUTS, LARGE_STICK_ID, STICK_POINTS, TOTAL_STICKS } from './constants.js';
import { getTraySlot } from './createPile.js';
import { drawBoard } from './drawBoard.js';
import { ACTIONS } from './gameReducer.js';
import { clamp, distance, getStickEndpoints, lerp, pointInRect, segmentIntersectionPoint } from './geometry.js';
import { findHint } from './hints.js';
import { hitTest } from './hitTest.js';
import { playSound } from './sound.js';
import { createMoveValidator, findBlockers, MOVE_FAILURE } from './validateMove.js';

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInQuad = (t) => t * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const DROP_DURATION = 1400;
const VALIDATE_DELAY = 800;

/** Sticks are symmetric, so pick the equivalent angle closest to horizontal. */
function nearestHorizontal(angle) {
  return angle - Math.round(angle / Math.PI) * Math.PI;
}

function animProgress(anim, now) {
  if (anim.duration <= 0) return 1;
  return clamp((now - anim.start - (anim.delay ?? 0)) / anim.duration, 0, 1);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Online-play options (all optional; the defaults give solo behaviour):
 * - canAct(): false while it is the other player's turn.
 * - isAuthority(): only the authority dispatches timer-driven setup actions.
 * - onDragUpdate({stickId,x,y} | null): stream of the local drag for the opponent.
 * - getRemoteDrag(): the opponent's current drag, if any.
 */
export function createBoardController({
  canvas,
  getState,
  getSettings,
  dispatch,
  onFeedback,
  onAnnounce,
  translate,
  canAct = () => true,
  isAuthority = () => true,
  onDragUpdate = () => {},
  getRemoteDrag = () => null,
}) {
  const ctx = canvas.getContext('2d');
  const view = {
    containerWidth: 0,
    containerHeight: 0,
    scale: 1,
    dpr: 1,
    layoutName: null,
    drag: null,
    anims: [],
    flash: null,
    successFlash: null,
    lastPileCheck: null,
    hoverId: null,
    hint: null,
    blockerIds: [],
    focusId: null,
    keyboardActive: false,
    drop: null,
    validating: null,
    remote: null,
    lastRemote: null,
    knownRemoved: null,
  };

  const layoutOf = (state) => LAYOUTS[state.layout];
  const configOf = (state) => DIFFICULTIES[state.difficulty];
  const reduced = () => Boolean(getSettings().reducedMotion);
  const sound = (name) => {
    if (getSettings().soundEnabled) playSound(name);
  };
  const roundKey = (state) => `${state.seed}:${state.startedAt}:${state.dropAttempts}`;

  function resize(containerWidth, containerHeight) {
    view.containerWidth = containerWidth;
    view.containerHeight = containerHeight;
    const state = getState();
    if (!state || containerWidth <= 0 || containerHeight <= 0) return;
    const layout = layoutOf(state);
    const scale = Math.max(0.05, Math.min(containerWidth / layout.width, containerHeight / layout.height));
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.floor(layout.width * scale);
    const cssHeight = Math.floor(layout.height * scale);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    view.scale = cssWidth / layout.width;
    view.dpr = dpr;
    view.layoutName = state.layout;
  }

  function canInteract(state) {
    return (
      Boolean(state) &&
      state.phase === 'playing' &&
      !state.paused &&
      !view.drag &&
      view.anims.length === 0 &&
      canAct()
    );
  }

  function hitRadius(state) {
    return configOf(state).hitRadiusCss / view.scale;
  }

  // ---- drag lifecycle -------------------------------------------------------

  function beginDrag(state, stick, grab, mode) {
    const config = configOf(state);
    dispatch({ type: ACTIONS.BEGIN_DRAG, stickId: stick.id });
    const validator = createMoveValidator({
      sticks: state.sticks,
      stickId: stick.id,
      contactMargin: config.contactMargin,
      liftTolerance: config.liftTolerance,
    });
    const origin = { x: stick.x, y: stick.y };
    view.drag = { stickId: stick.id, origin, pos: origin, grab, mode, path: [origin], validator };
    view.blockerIds = config.showBlockers ? validator.blockers : [];
    view.hint = null;
    view.hoverId = null;
    sound('select');
  }

  function dragTo(center) {
    const drag = view.drag;
    const state = getState();
    const layout = layoutOf(state);
    // Rounded so the path sent over the network validates identically on the host.
    const pos = { x: round2(clamp(center.x, 0, layout.width)), y: round2(clamp(center.y, 0, layout.height)) };
    if (distance(pos, drag.pos) < 0.5) return;
    drag.pos = pos;
    drag.path.push(pos);
    onDragUpdate({ stickId: drag.stickId, x: pos.x, y: pos.y });
    const failure = drag.validator.advance(pos);
    if (failure) failDrag(failure);
  }

  function clearDrag() {
    const drag = view.drag;
    view.drag = null;
    view.blockerIds = [];
    if (drag) onDragUpdate(null);
    return drag;
  }

  function failDrag(result) {
    const drag = clearDrag();
    const now = performance.now();
    const motion = !reduced();
    view.anims.push({
      type: 'return',
      stickId: drag.stickId,
      from: result.contactPoint ?? drag.pos,
      to: drag.origin,
      start: now,
      delay: motion ? 300 : 0,
      duration: motion ? 300 : 0,
    });
    view.flash = { ids: result.disturbedStickIds, until: now + 2200 };
    dispatch({
      type: ACTIONS.MOVE_FAILED,
      stickId: drag.stickId,
      reason: result.reason,
      disturbedStickIds: result.disturbedStickIds,
      path: drag.path,
      now: Date.now(),
    });
    sound('failure');
    onFeedback({
      kind: 'failure',
      text: translate(result.reason === MOVE_FAILURE.liftedFromUnder ? 'foulLifted' : 'foulDisturbed'),
    });
  }

  function returnDrag(reason) {
    const drag = clearDrag();
    if (!drag) return;
    const moved = distance(drag.pos, drag.origin);
    if (moved > 0.5) {
      view.anims.push({
        type: 'return',
        stickId: drag.stickId,
        from: drag.pos,
        to: drag.origin,
        start: performance.now(),
        delay: 0,
        duration: reduced() ? 0 : 260,
      });
    }
    dispatch({ type: ACTIONS.CANCEL_DRAG });
    if (reason === 'missed' && moved > 12) onFeedback({ kind: 'info', text: translate('missedTray') });
  }

  function succeedDrag(state, layout) {
    const drag = clearDrag();
    const stick = state.sticks.find((s) => s.id === drag.stickId);
    const slot = getTraySlot(layout, state.stats.successfulMoves);
    view.anims.push({
      type: 'fly',
      stickId: stick.id,
      from: { x: drag.pos.x, y: drag.pos.y, angle: nearestHorizontal(stick.angle), lengthScale: 1 },
      to: slot,
      start: performance.now(),
      delay: 0,
      duration: reduced() ? 0 : 380,
    });
    dispatch({ type: ACTIONS.MOVE_SUCCEEDED, stickId: stick.id, path: drag.path, now: Date.now() });
    sound('success');
    onFeedback({
      kind: 'success',
      text: translate(stick.type === 'large' ? 'cleanPickLarge' : 'cleanPick', { points: STICK_POINTS[stick.type] }),
    });
  }

  function release() {
    const state = getState();
    const layout = layoutOf(state);
    if (pointInRect(view.drag.pos, layout.tray)) succeedDrag(state, layout);
    else returnDrag('missed');
  }

  // ---- pointer input --------------------------------------------------------

  function pointerDown(point) {
    const state = getState();
    if (!canInteract(state)) return false;
    const stick = hitTest(state.sticks, point, hitRadius(state));
    if (!stick) return false;
    view.keyboardActive = false;
    view.focusId = null;
    beginDrag(state, stick, { x: point.x - stick.x, y: point.y - stick.y }, 'pointer');
    return true;
  }

  function pointerMove(point, event) {
    if (view.drag) {
      if (view.drag.mode === 'pointer') dragTo({ x: point.x - view.drag.grab.x, y: point.y - view.drag.grab.y });
      return;
    }
    const state = getState();
    if (event.pointerType !== 'mouse' || !canInteract(state)) {
      view.hoverId = null;
      canvas.style.cursor = '';
      return;
    }
    const hit = hitTest(state.sticks, point, hitRadius(state));
    view.hoverId = hit && configOf(state).hoverHighlight ? hit.id : null;
    canvas.style.cursor = hit ? 'grab' : '';
  }

  function pointerUp(point) {
    if (!view.drag || view.drag.mode !== 'pointer') return;
    dragTo({ x: point.x - view.drag.grab.x, y: point.y - view.drag.grab.y });
    if (view.drag) release();
  }

  function pointerCancel() {
    if (view.drag?.mode === 'pointer') returnDrag('cancel');
  }

  function pointerLeave() {
    view.hoverId = null;
    canvas.style.cursor = '';
  }

  // ---- keyboard input -------------------------------------------------------

  const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  function describeStick(state, stick, index, count) {
    const covered = findBlockers(state.sticks, stick.id).length;
    return translate('kbFocus', {
      index,
      count,
      kind: translate(stick.type === 'large' ? 'largeStick' : 'smallStick'),
      points: STICK_POINTS[stick.type],
      covered: covered > 0 ? translate('kbCovered', { count: covered }) : '',
    });
  }

  function cycleFocus(state, direction) {
    const active = state.sticks.filter((s) => !s.removed).reverse(); // topmost first
    if (active.length === 0) return;
    const current = active.findIndex((s) => s.id === view.focusId);
    const nextIndex =
      current < 0 ? (direction > 0 ? 0 : active.length - 1) : (current + direction + active.length) % active.length;
    view.focusId = active[nextIndex].id;
    view.keyboardActive = true;
    onAnnounce(describeStick(state, active[nextIndex], nextIndex + 1, active.length));
  }

  function handleKey(event) {
    const state = getState();
    if (!state || state.phase !== 'playing' || state.paused) return false;
    const { key } = event;

    if (view.drag?.mode === 'keyboard') {
      if (ARROWS[key]) {
        const step = event.shiftKey ? 30 : 8;
        const [dx, dy] = ARROWS[key];
        dragTo({ x: view.drag.pos.x + dx * step, y: view.drag.pos.y + dy * step });
        if (view.drag && pointInRect(view.drag.pos, layoutOf(state).tray)) onAnnounce(translate('kbOverTray'));
        return true;
      }
      if (key === 'Enter' || key === ' ') {
        release();
        return true;
      }
      if (key === 'Escape') {
        returnDrag('cancel');
        onAnnounce(translate('kbCancelled'));
        return true;
      }
      return false;
    }
    if (view.drag) return false;

    if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'n' || key === 'N') {
      cycleFocus(state, 1);
      return true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'p' || key === 'P') {
      cycleFocus(state, -1);
      return true;
    }
    if ((key === 'Enter' || key === ' ') && view.focusId && canInteract(state)) {
      const stick = state.sticks.find((s) => s.id === view.focusId && !s.removed);
      if (!stick) return false;
      beginDrag(state, stick, { x: 0, y: 0 }, 'keyboard');
      onAnnounce(translate('kbPicked'));
      return true;
    }
    if ((key === 'h' || key === 'H') && configOf(state).hints && getSettings().hints) {
      showHint();
      return true;
    }
    return false;
  }

  // ---- hints, pause, reset --------------------------------------------------

  function showHint() {
    const state = getState();
    if (!canInteract(state)) return;
    const hint = findHint(state.sticks, layoutOf(state), state.difficulty);
    if (!hint) {
      onFeedback({ kind: 'info', text: translate('noHint') });
      return;
    }
    view.hint = { ...hint, until: performance.now() + 4500 };
    onFeedback({ kind: 'info', text: translate('hintShown') });
  }

  function cancelInteraction() {
    if (view.drag) returnDrag('cancel');
    view.hoverId = null;
    view.hint = null;
  }

  function reset() {
    view.drag = null;
    view.anims = [];
    view.flash = null;
    view.successFlash = null;
    view.lastPileCheck = null;
    view.hint = null;
    view.blockerIds = [];
    view.focusId = null;
    view.hoverId = null;
    view.drop = null;
    view.validating = null;
    view.remote = null;
    view.lastRemote = null;
    view.knownRemoved = null;
  }

  /** Highlight sticks disturbed by the opponent's foul. */
  function flashFailure(ids) {
    view.flash = { ids, until: performance.now() + 2200 };
  }

  /** Track the opponent's drag and animate sticks they removed into the tray. */
  function updateRemote(state, now) {
    const remote = getRemoteDrag();
    const valid =
      remote &&
      state.selectedStickId === remote.stickId &&
      view.drag?.stickId !== remote.stickId &&
      !state.sticks.find((s) => s.id === remote.stickId)?.removed;
    view.remote = valid ? remote : null;
    if (view.remote) view.lastRemote = view.remote;

    const removedIds = state.sticks.filter((s) => s.removed).map((s) => s.id);
    if (view.knownRemoved) {
      const layout = layoutOf(state);
      for (const id of removedIds) {
        if (view.knownRemoved.has(id) || view.anims.some((a) => a.stickId === id)) continue;
        const stick = state.sticks.find((s) => s.id === id);
        const from = view.lastRemote?.stickId === id ? view.lastRemote : stick;
        view.anims.push({
          type: 'fly',
          stickId: id,
          from: { x: from.x, y: from.y, angle: nearestHorizontal(stick.angle), lengthScale: 1 },
          to: getTraySlot(layout, stick.removedOrder ?? 0),
          start: now,
          delay: 0,
          duration: reduced() ? 0 : 380,
        });
      }
    }
    view.knownRemoved = new Set(removedIds);
  }

  // ---- per-frame ------------------------------------------------------------

  function updateTimers(state, now) {
    if (state.phase === 'dropping') {
      const key = roundKey(state);
      if (view.drop?.key !== key) {
        view.drop = { key, start: now, duration: reduced() ? 0 : DROP_DURATION, settled: false };
        sound('drop');
      }
      if (!view.drop.settled && now - view.drop.start >= view.drop.duration && isAuthority()) {
        view.drop.settled = true;
        dispatch({ type: ACTIONS.DROP_SETTLED });
      }
    }
    if (state.phase === 'validating-pile') {
      const key = roundKey(state);
      if (view.validating?.key !== key) view.validating = { key, start: now, sent: false };
      const delay = reduced() ? 150 : VALIDATE_DELAY;
      if (!view.validating.sent && now - view.validating.start >= delay && isAuthority()) {
        view.validating.sent = true;
        dispatch({ type: ACTIONS.PILE_VALIDATED, now: Date.now() });
      }
    }
    // Keyed by round/drop, not object identity: online snapshots replace objects.
    const pileKey = state.pileCheck ? roundKey(state) : null;
    if (pileKey && pileKey !== view.lastPileCheck) {
      view.lastPileCheck = pileKey;
      if (state.pileCheck.valid) view.successFlash = { ids: state.pileCheck.overlappingSmallIds, until: now + 2600 };
    }

    view.anims = view.anims.filter((a) => animProgress(a, now) < 1);
    if (view.flash && now > view.flash.until) view.flash = null;
    if (view.successFlash && now > view.successFlash.until) view.successFlash = null;
    if (view.hint && now > view.hint.until) view.hint = null;
    if (view.focusId && state.sticks.find((s) => s.id === view.focusId)?.removed) view.focusId = null;
  }

  function dropPose(from, to, elapsed, duration, index, count) {
    if (duration <= 0) return { x: to.x, y: to.y, angle: to.angle, lift: 0 };
    const fall = duration * 0.3;
    if (elapsed < fall) {
      return { x: from.x, y: from.y, angle: from.angle, lift: 1 - easeInQuad(elapsed / fall) };
    }
    const stagger = 26;
    const span = duration - fall - stagger * (count - 1);
    const k = clamp((elapsed - fall - index * stagger) / span, 0, 1);
    const e = easeOutCubic(k);
    // Sticks are symmetric, so ending on angle + PI looks identical but tumbles more.
    const targetAngle = to.angle + (index % 3 === 0 ? Math.PI : 0);
    return {
      x: lerp(from.x, to.x, e),
      y: lerp(from.y, to.y, e),
      angle: lerp(from.angle, targetAngle, e),
      lift: 0.35 * Math.sin(Math.PI * k) * (1 - k),
    };
  }

  function buildItems(state, now) {
    const layout = layoutOf(state);
    const animById = new Map(view.anims.map((a) => [a.stickId, a]));
    const dropFrom =
      state.phase === 'dropping' && state.dropFrom ? new Map(state.dropFrom.map((s) => [s.id, s])) : null;
    const held = state.phase === 'bundling';
    const trayItems = [];
    const pileItems = [];
    const topItems = [];

    state.sticks.forEach((stick, index) => {
      const anim = animById.get(stick.id);
      if (stick.removed) {
        if (anim?.type === 'fly') {
          const e = easeInOutCubic(animProgress(anim, now));
          topItems.push({
            stick,
            x: lerp(anim.from.x, anim.to.x, e),
            y: lerp(anim.from.y, anim.to.y, e),
            angle: lerp(anim.from.angle, anim.to.angle, e),
            lengthScale: lerp(1, anim.to.lengthScale, e),
            lift: 0.6 * (1 - e),
          });
        } else {
          trayItems.push({ stick, ...getTraySlot(layout, stick.removedOrder ?? 0) });
        }
        return;
      }
      if (view.drag?.stickId === stick.id) {
        topItems.push({ stick, x: view.drag.pos.x, y: view.drag.pos.y, angle: stick.angle, lift: 0.55 });
        return;
      }
      if (view.remote?.stickId === stick.id) {
        topItems.push({ stick, x: view.remote.x, y: view.remote.y, angle: stick.angle, lift: 0.55 });
        return;
      }
      if (anim?.type === 'return') {
        const e = easeOutCubic(animProgress(anim, now));
        pileItems.push({
          stick,
          x: lerp(anim.from.x, anim.to.x, e),
          y: lerp(anim.from.y, anim.to.y, e),
          angle: stick.angle,
          lift: 0.4 * (1 - e),
        });
        return;
      }
      if (dropFrom && view.drop) {
        const from = dropFrom.get(stick.id) ?? stick;
        const pose = dropPose(from, stick, now - view.drop.start, view.drop.duration, index, state.sticks.length);
        pileItems.push({ stick, ...pose });
        return;
      }
      pileItems.push({ stick, x: stick.x, y: stick.y, angle: stick.angle, lift: held ? 1 : 0 });
    });

    return { trayItems, pileItems, topItems };
  }

  function bundleTie(state, now) {
    const inFall = state.phase === 'dropping' && view.drop && now - view.drop.start < view.drop.duration * 0.3;
    if (state.phase !== 'bundling' && !inFall) return null;
    const source = state.phase === 'dropping' ? state.dropFrom : state.sticks;
    if (!source) return null;
    const x = source.reduce((sum, s) => sum + s.x, 0) / source.length;
    const y = source.reduce((sum, s) => sum + s.y, 0) / source.length;
    return { x, y, angle: source[0].angle, length: 160, halfThickness: (source.length * 6.2) / 2 + 5 };
  }

  function debugInfo(state, pileItems) {
    if (!getSettings().debugOverlay) return null;
    const active = pileItems.filter((item) => !item.stick.removed);
    const intersections = [];
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = getStickEndpoints(active[i].stick, active[i].x, active[i].y, active[i].angle);
        const b = getStickEndpoints(active[j].stick, active[j].x, active[j].y, active[j].angle);
        const p = segmentIntersectionPoint(a.a, a.b, b.a, b.b);
        if (p) intersections.push(p);
      }
    }
    return {
      capsules: active,
      margin: configOf(state).contactMargin,
      intersections,
      dragPath: view.drag?.path ?? null,
    };
  }

  function frame(now) {
    const state = getState();
    if (!state) return;
    if (state.layout !== view.layoutName) resize(view.containerWidth, view.containerHeight);
    if (canvas.width === 0) return;
    updateTimers(state, now);
    updateRemote(state, now);

    const layout = layoutOf(state);
    const { trayItems, pileItems, topItems } = buildItems(state, now);
    const setupFoul = state.phase === 'foul-retry' || state.phase === 'setup-failed';
    const failureIds = [...(view.flash?.ids ?? []), ...(setupFoul ? [LARGE_STICK_ID] : [])];
    const removedCount = state.sticks.filter((s) => s.removed).length;

    drawBoard(ctx, {
      layout,
      scale: view.scale,
      dpr: view.dpr,
      time: reduced() ? 0 : now,
      items: [...trayItems, ...pileItems, ...topItems],
      tray: {
        label: `${translate('tray')} · ${removedCount}/${TOTAL_STICKS}`,
        active: Boolean(view.drag && pointInRect(view.drag.pos, layout.tray)),
      },
      overlays: {
        selectedId: view.drag?.stickId ?? null,
        remoteId: view.remote?.stickId ?? null,
        hoverId: view.drag ? null : view.hoverId,
        hintId: view.hint?.stickId ?? null,
        hintPath: view.hint?.path ?? null,
        blockerIds: view.blockerIds,
        failureIds,
        successIds: view.successFlash?.ids ?? [],
        focusId: view.keyboardActive && !view.drag ? view.focusId : null,
        checkingId: state.phase === 'validating-pile' ? LARGE_STICK_ID : null,
        bundleTie: bundleTie(state, now),
      },
      debug: debugInfo(state, pileItems),
    });
  }

  return {
    resize,
    frame,
    reset,
    flashFailure,
    showHint,
    cancelInteraction,
    handleKey,
    pointerHandlers: {
      getBoardSize: () => layoutOf(getState()),
      onDown: pointerDown,
      onMove: pointerMove,
      onUp: pointerUp,
      onCancel: pointerCancel,
      onLeave: pointerLeave,
    },
    setKeyboardActive(active) {
      view.keyboardActive = active;
    },
  };
}
