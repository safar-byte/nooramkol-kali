// Canvas rendering. Draws in logical board units; the caller supplies the scale
// and device pixel ratio. The static tabletop is cached in an offscreen canvas.

import { createRng } from './random.js';

const COLORS = {
  table: '#4b3628',
  tableEdge: '#3a291e',
  grain: 'rgba(255, 228, 190, 0.035)',
  grainDark: 'rgba(0, 0, 0, 0.07)',
  trayFill: 'rgba(214, 178, 120, 0.11)',
  trayBorder: 'rgba(236, 210, 160, 0.55)',
  trayActive: 'rgba(146, 214, 160, 0.9)',
  trayLabel: 'rgba(244, 226, 190, 0.85)',
  shadow: 'rgba(15, 8, 3, 0.42)',
  outline: 'rgba(48, 28, 12, 0.85)',
  highlight: 'rgba(255, 248, 225, 0.5)',
  selected: 'rgba(255, 214, 102, 0.6)',
  hover: 'rgba(255, 245, 220, 0.28)',
  failure: 'rgba(240, 86, 76, 0.95)',
  success: 'rgba(132, 214, 150, 0.95)',
  blocker: 'rgba(255, 170, 70, 0.95)',
  hint: 'rgba(110, 220, 220, 0.9)',
  focus: 'rgba(130, 190, 255, 0.95)',
  remote: 'rgba(150, 200, 255, 0.55)',
  cord: '#9c3b2b',
  debug: 'rgba(0, 230, 255, 0.7)',
  debugHit: 'rgba(255, 60, 220, 0.95)',
};

let backgroundCache = { key: '', canvas: null };

function createOffscreen(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getBackground(layout, pixelWidth, pixelHeight, unit) {
  const key = `${layout.name}|${pixelWidth}|${pixelHeight}`;
  if (backgroundCache.key === key) return backgroundCache.canvas;

  const canvas = createOffscreen(pixelWidth, pixelHeight);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(unit, 0, 0, unit, 0, 0);
  const { width, height, tray } = layout;

  ctx.fillStyle = COLORS.table;
  ctx.fillRect(0, 0, width, height);

  // Quiet wood grain: long, faint, slightly wavy strokes.
  const rng = createRng(20240611);
  for (let i = 0; i < 70; i += 1) {
    const y = rng() * height;
    ctx.strokeStyle = rng() > 0.5 ? COLORS.grain : COLORS.grainDark;
    ctx.lineWidth = 1 + rng() * 3;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    const amp = 2 + rng() * 6;
    for (let x = 0; x <= width + 20; x += 40) {
      ctx.lineTo(x, y + Math.sin(x / (90 + rng() * 40) + i) * amp);
    }
    ctx.stroke();
  }

  // Soft vignette so the centre reads as the playing surface.
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Woven tray mat.
  ctx.save();
  roundRect(ctx, tray.x, tray.y, tray.width, tray.height, 16);
  ctx.fillStyle = COLORS.trayFill;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(236, 210, 160, 0.06)';
  ctx.lineWidth = 3;
  for (let d = -tray.height; d < tray.width + tray.height; d += 12) {
    ctx.beginPath();
    ctx.moveTo(tray.x + d, tray.y);
    ctx.lineTo(tray.x + d - tray.height, tray.y + tray.height);
    ctx.moveTo(tray.x + d - tray.height, tray.y);
    ctx.lineTo(tray.x + d, tray.y + tray.height);
    ctx.stroke();
  }
  ctx.restore();

  backgroundCache = { key, canvas };
  return canvas;
}

function endpoints(item) {
  const length = item.stick.length * (item.lengthScale ?? 1);
  const dx = (Math.cos(item.angle) * length) / 2;
  const dy = (Math.sin(item.angle) * length) / 2;
  return { x1: item.x - dx, y1: item.y - dy, x2: item.x + dx, y2: item.y + dy };
}

function strokeLine(ctx, { x1, y1, x2, y2 }, offsetX = 0, offsetY = 0) {
  ctx.beginPath();
  ctx.moveTo(x1 + offsetX, y1 + offsetY);
  ctx.lineTo(x2 + offsetX, y2 + offsetY);
  ctx.stroke();
}

function drawRing(ctx, item, color, extra, dash = null) {
  const width = item.stick.width * (item.lengthScale ?? 1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width + extra;
  if (dash) ctx.setLineDash(dash);
  strokeLine(ctx, endpoints(item));
  ctx.restore();
}

function drawStick(ctx, item) {
  const scale = item.lengthScale ?? 1;
  const width = item.stick.width * (scale < 1 ? 0.85 : 1);
  const line = endpoints(item);
  const lift = item.lift ?? 0;

  ctx.save();
  ctx.globalAlpha = item.alpha ?? 1;
  ctx.lineCap = 'round';

  ctx.strokeStyle = COLORS.shadow;
  ctx.lineWidth = width + 1.5 + lift * 2;
  strokeLine(ctx, line, 1.6 + lift * 7, 2 + lift * 9);

  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = width + 1.4;
  strokeLine(ctx, line);

  ctx.strokeStyle = item.stick.color;
  ctx.lineWidth = width;
  strokeLine(ctx, line);

  // Thin highlight along one side gives a rounded, midrib-like look.
  const nx = -Math.sin(item.angle) * width * 0.2;
  const ny = Math.cos(item.angle) * width * 0.2;
  ctx.strokeStyle = COLORS.highlight;
  ctx.lineWidth = Math.max(0.8, width * 0.26);
  strokeLine(ctx, line, -nx, -ny);

  if (item.stick.type === 'large') {
    // Darker banded tips mark the large (100 point) stick, independent of colour.
    ctx.strokeStyle = 'rgba(60, 30, 10, 0.75)';
    ctx.lineWidth = width;
    const t = 0.08;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x1 + (line.x2 - line.x1) * t, line.y1 + (line.y2 - line.y1) * t);
    ctx.moveTo(line.x2, line.y2);
    ctx.lineTo(line.x2 - (line.x2 - line.x1) * t, line.y2 - (line.y2 - line.y1) * t);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBadge(ctx, x, y, color, glyph, unitScale) {
  const r = 11;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(unitScale, unitScale);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(30, 16, 8, 0.9)';
  ctx.stroke();
  ctx.fillStyle = '#1d120a';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, 1);
  ctx.restore();
}

function drawBundleTie(ctx, tie) {
  ctx.save();
  ctx.strokeStyle = COLORS.cord;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  const ax = Math.cos(tie.angle);
  const ay = Math.sin(tie.angle);
  const nx = -ay;
  const ny = ax;
  for (const along of [-tie.length * 0.28, tie.length * 0.28]) {
    const cx = tie.x + ax * along;
    const cy = tie.y + ay * along;
    ctx.beginPath();
    ctx.moveTo(cx - nx * tie.halfThickness, cy - ny * tie.halfThickness);
    ctx.lineTo(cx + nx * tie.halfThickness, cy + ny * tie.halfThickness);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPath(ctx, points, color, width, dash) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - 16 * Math.cos(angle - 0.45), end.y - 16 * Math.sin(angle - 0.45));
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - 16 * Math.cos(angle + 0.45), end.y - 16 * Math.sin(angle + 0.45));
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} scene  Everything to draw for this frame (see boardController).
 */
export function drawBoard(ctx, scene) {
  const { layout, scale, dpr, items, overlays, tray, debug, time } = scene;
  const unit = scale * dpr;
  const pixelWidth = ctx.canvas.width;
  const pixelHeight = ctx.canvas.height;
  if (pixelWidth === 0 || pixelHeight === 0) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);
  ctx.drawImage(getBackground(layout, pixelWidth, pixelHeight, unit), 0, 0);
  ctx.setTransform(unit, 0, 0, unit, 0, 0);

  // Tray border and label.
  const t = layout.tray;
  ctx.save();
  roundRect(ctx, t.x, t.y, t.width, t.height, 16);
  ctx.strokeStyle = tray.active ? COLORS.trayActive : COLORS.trayBorder;
  ctx.lineWidth = tray.active ? 3.5 : 2;
  ctx.setLineDash(tray.active ? [] : [10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = tray.active ? COLORS.trayActive : COLORS.trayLabel;
  ctx.font = '600 17px system-ui, "Noto Sans Malayalam", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(tray.label, t.x + t.width / 2, t.y + 12);
  ctx.restore();

  const pulse = 0.5 + 0.5 * Math.sin(time / 260);
  const byId = new Map(items.map((item) => [item.stick.id, item]));

  // Under-glows are drawn before the sticks so they read as halos.
  for (const item of items) {
    const id = item.stick.id;
    if (overlays.hoverId === id && overlays.selectedId !== id) drawRing(ctx, item, COLORS.hover, 9);
    if (overlays.selectedId === id) drawRing(ctx, item, COLORS.selected, 12);
    if (overlays.remoteId === id) drawRing(ctx, item, COLORS.remote, 12);
    if (overlays.hintId === id) drawRing(ctx, item, `rgba(110, 220, 220, ${0.35 + pulse * 0.45})`, 12);
  }

  for (const item of items) drawStick(ctx, item);

  if (overlays.bundleTie) drawBundleTie(ctx, overlays.bundleTie);

  // Outlines and badges are drawn on top so they stay visible in a dense pile.
  for (const id of overlays.blockerIds ?? []) {
    const item = byId.get(id);
    if (item) drawRing(ctx, item, COLORS.blocker, 5, [6, 5]);
  }
  for (const id of overlays.successIds ?? []) {
    const item = byId.get(id);
    if (item) drawRing(ctx, item, COLORS.success, 5, [7, 5]);
  }
  if (overlays.focusId) {
    const item = byId.get(overlays.focusId);
    if (item) drawRing(ctx, item, COLORS.focus, 7, [3, 4]);
  }
  for (const id of overlays.failureIds ?? []) {
    const item = byId.get(id);
    if (!item) continue;
    drawRing(ctx, item, COLORS.failure, 6, [8, 5]);
    drawBadge(ctx, item.x, item.y, COLORS.failure, '!', 1);
  }
  if (overlays.checkingId) {
    const item = byId.get(overlays.checkingId);
    if (item) drawRing(ctx, item, `rgba(255, 230, 160, ${0.3 + pulse * 0.6})`, 8, [4, 6]);
  }
  if (overlays.hintPath) drawPath(ctx, overlays.hintPath, COLORS.hint, 3, [10, 8]);

  if (debug) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const item of debug.capsules) {
      ctx.strokeStyle = COLORS.debug;
      ctx.lineWidth = 0.75;
      const { x1, y1, x2, y2 } = endpoints(item);
      const r = item.stick.width / 2 + debug.margin;
      const angle = item.angle;
      const nx = -Math.sin(angle) * r;
      const ny = Math.cos(angle) * r;
      ctx.beginPath();
      ctx.moveTo(x1 + nx, y1 + ny);
      ctx.lineTo(x2 + nx, y2 + ny);
      ctx.arc(x2, y2, Math.max(r, 0.1), angle + Math.PI / 2, angle - Math.PI / 2, true);
      ctx.lineTo(x1 - nx, y1 - ny);
      ctx.arc(x1, y1, Math.max(r, 0.1), angle - Math.PI / 2, angle + Math.PI / 2, true);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.debugHit;
    for (const p of debug.intersections) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    drawPath(ctx, debug.dragPath, COLORS.debugHit, 1.2, null);
    ctx.restore();
  }
}
