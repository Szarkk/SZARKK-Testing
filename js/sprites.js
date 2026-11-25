/* =========================================================================
   SHARED NEON WIREFRAME, BACKGROUND & PIXEL CAPSULE DRAWING PRIMITIVES
   ========================================================================= */

import { COLORS, LOGICAL_W, LOGICAL_H } from './config.js';
import { clamp } from './utils.js';

export function drawBackground(ctx, stars, nexusGridOffset) {
  const horizon = LOGICAL_H * 0.24;
  const bg = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  bg.addColorStop(0, '#01030b');
  bg.addColorStop(0.24, '#03132b');
  bg.addColorStop(0.32, '#020919');
  bg.addColorStop(1, '#01040c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Vector stars
  for (const s of stars) {
    ctx.fillStyle = s.cyan ? 'rgba(0, 246, 255, 0.56)' : 'rgba(255, 255, 255, 0.44)';
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }

  // Endframe wireframe silhouette
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 246, 255, 0.26)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  const xs = [0, 58, 120, 184, 240, 304, 368, 424, LOGICAL_W];
  const ys = [0, -28, -12, -40, -18, -34, -14, -26, 0];
  for (let i = 0; i < xs.length; i++) ctx.lineTo(xs[i], horizon + ys[i]);
  ctx.stroke();

  // Horizon bloom
  const glow = ctx.createLinearGradient(0, horizon - 18, 0, horizon + 26);
  glow.addColorStop(0, 'rgba(0, 246, 255, 0)');
  glow.addColorStop(0.5, 'rgba(0, 246, 255, 0.28)');
  glow.addColorStop(1, 'rgba(0, 246, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizon - 18, LOGICAL_W, 44);

  // Perspective grid lines
  ctx.strokeStyle = 'rgba(0, 246, 255, 0.16)';
  ctx.lineWidth = 1;
  const vx = LOGICAL_W * 0.5;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(vx + i * 24, horizon);
    ctx.lineTo(vx + i * 122, LOGICAL_H);
    ctx.stroke();
  }

  for (let i = 0; i < 12; i++) {
    const f = (i + nexusGridOffset) / 12;
    const y = horizon + Math.pow(f, 2.2) * (LOGICAL_H - horizon);
    ctx.strokeStyle = `rgba(0, 246, 255, ${0.06 + f * 0.22})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(LOGICAL_W, y);
    ctx.stroke();
  }
  ctx.restore();
}

const POWERUP_RGB = {
  CYAN: { stroke: [0, 246, 255], fill: [0, 178, 224], glow: [0, 246, 255] },
  RED: { stroke: [255, 58, 92], fill: [215, 22, 56], glow: [255, 30, 66] },
  PURPLE: { stroke: [224, 146, 255], fill: [148, 42, 225], glow: [196, 77, 255] },
  YELLOW: { stroke: [255, 232, 68], fill: [232, 166, 18], glow: [255, 224, 52] },
  CLONE: { stroke: [162, 128, 255], fill: [56, 78, 230], glow: [138, 61, 255] }
};

function sampleRgbWave(types, phase, channel, alpha = 1) {
  const n = types.length;
  const wrapped = ((phase % 1) + 1) % 1;
  const scaled = wrapped * n;
  const i0 = Math.floor(scaled) % n;
  const i1 = (i0 + 1) % n;
  const frac = scaled - Math.floor(scaled);
  // Smooth cosine easing for liquid RGB keyboard wave transitions
  const u = (1 - Math.cos(frac * Math.PI)) * 0.5;
  const c0 = (POWERUP_RGB[types[i0]] || POWERUP_RGB.CYAN)[channel];
  const c1 = (POWERUP_RGB[types[i1]] || POWERUP_RGB.CYAN)[channel];
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function drawAurexFighter(
  ctx,
  x,
  y,
  dual = false,
  invuln = false,
  slow = false,
  time = 0,
  activePowerups = null,
  purpleAura = false,
  purpleOvercharge = false
) {
  if (invuln && Math.floor(time * 16) % 2 === 0) return;
  const offsets = dual ? [-14, 14] : [0];

  const list = Array.isArray(activePowerups)
    ? activePowerups.filter(t => POWERUP_RGB[t])
    : (activePowerups && POWERUP_RGB[activePowerups] ? [activePowerups] : []);
  if ((purpleAura || purpleOvercharge) && !list.includes('PURPLE')) {
    list.push('PURPLE');
  }

  const isStacked = list.length >= 2 && !purpleOvercharge;
  const singleType = purpleOvercharge ? 'PURPLE' : (list.length === 1 ? list[0] : null);

  // Default ship is crisp WHITE; single power-up tints to match; stacked power-ups run a moving RGB wave!
  let hullStroke = '#ffffff';
  let hullFill = 'rgba(232, 242, 255, 0.90)';
  let glowCol = '#ffffff';
  let coreStroke = '#152538';
  let wingtipLeft = null;
  let wingtipRight = null;

  if (purpleOvercharge) {
    // Blazing bright incandescent purple when primed for 2nd tap Cannon Shot!
    hullStroke = '#ffffff';
    hullFill = 'rgba(218, 128, 255, 0.96)';
    glowCol = '#f2b8ff';
    coreStroke = '#ffffff';
    wingtipLeft = '#ffffff';
    wingtipRight = '#ffffff';
  } else if (isStacked) {
    glowCol = sampleRgbWave(list, time * 0.85, 'glow', 1);
    coreStroke = '#ffffff';
    wingtipLeft = sampleRgbWave(list, time * 0.85, 'stroke', 1);
    wingtipRight = sampleRgbWave(list, time * 0.85 + 0.5, 'stroke', 1);
  } else if (singleType === 'PURPLE') {
    hullStroke = COLORS.purpleBright;
    hullFill = 'rgba(138, 36, 210, 0.80)';
    glowCol = COLORS.purple;
    coreStroke = '#ffffff';
    wingtipLeft = COLORS.purpleBright;
    wingtipRight = COLORS.purpleBright;
  } else if (singleType === 'RED') {
    hullStroke = '#ff4b6b';
    hullFill = 'rgba(205, 18, 52, 0.82)';
    glowCol = COLORS.nullRed;
    coreStroke = '#ffe4e9';
    wingtipLeft = COLORS.nullRed;
    wingtipRight = COLORS.nullRed;
  } else if (singleType === 'YELLOW') {
    hullStroke = COLORS.yellow;
    hullFill = 'rgba(225, 162, 18, 0.85)';
    glowCol = COLORS.yellow;
    coreStroke = '#fff8cf';
    wingtipLeft = COLORS.yellowOrange;
    wingtipRight = COLORS.yellowOrange;
  } else if (singleType === 'CLONE') {
    hullStroke = '#b294ff';
    hullFill = 'rgba(42, 66, 205, 0.82)';
    glowCol = COLORS.clonePurple;
    coreStroke = '#e3d6ff';
    wingtipLeft = COLORS.cloneBlue;
    wingtipRight = COLORS.clonePurple;
  } else if (singleType === 'CYAN') {
    hullStroke = COLORS.cyan;
    hullFill = 'rgba(0, 178, 224, 0.76)';
    glowCol = COLORS.cyan;
    coreStroke = '#ecffff';
    wingtipLeft = COLORS.cyan;
    wingtipRight = COLORS.cyan;
  }

  // Pulsing Purple Aura (intensified blinding electric violet during Cannon Overcharge!)
  if (purpleAura || purpleOvercharge) {
    ctx.save();
    const pulse = purpleOvercharge
      ? (0.88 + Math.sin(time * 36) * 0.16)
      : (0.85 + Math.sin(time * 24) * 0.15);
    const auraR = (dual ? (purpleOvercharge ? 42 : 36) : (purpleOvercharge ? 32 : 26)) * pulse;
    const grad = ctx.createRadialGradient(x, y, 4, x, y, auraR + 14);
    grad.addColorStop(0, purpleOvercharge ? 'rgba(255, 240, 255, 0.92)' : 'rgba(235, 189, 255, 0.62)');
    grad.addColorStop(0.48, purpleOvercharge ? 'rgba(222, 118, 255, 0.68)' : 'rgba(196, 77, 255, 0.34)');
    grad.addColorStop(1, 'rgba(196, 77, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, auraR + 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = purpleOvercharge ? '#ffffff' : COLORS.purpleBright;
    ctx.shadowColor = purpleOvercharge ? '#f4c4ff' : COLORS.purple;
    ctx.shadowBlur = purpleOvercharge ? 26 : 18;
    ctx.lineWidth = purpleOvercharge ? 2.8 : 2.2;
    ctx.beginPath();
    ctx.arc(x, y, auraR, time * (purpleOvercharge ? 9 : 5), time * (purpleOvercharge ? 9 : 5) + Math.PI * 1.45);
    ctx.stroke();

    ctx.strokeStyle = purpleOvercharge ? COLORS.purpleBright : COLORS.purple;
    ctx.lineWidth = purpleOvercharge ? 2.1 : 1.6;
    ctx.beginPath();
    ctx.arc(x, y, auraR * 0.76, -time * (purpleOvercharge ? 10 : 6), -time * (purpleOvercharge ? 10 : 6) + Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
  }

  for (const ox of offsets) {
    ctx.save();
    ctx.translate(x + ox, y);

    if (isStacked) {
      // Continuously scrolling diagonal RGB-keyboard wave gradient across the fighter hull
      const fillGrad = ctx.createLinearGradient(-13, -15, 13, 13);
      const strokeGrad = ctx.createLinearGradient(-13, -15, 13, 13);
      const stops = 6;
      const scroll = -time * 0.95;
      for (let s = 0; s <= stops; s++) {
        const stopPos = s / stops;
        fillGrad.addColorStop(stopPos, sampleRgbWave(list, stopPos * 0.85 + scroll, 'fill', 0.84));
        strokeGrad.addColorStop(stopPos, sampleRgbWave(list, stopPos * 0.85 + scroll, 'stroke', 1));
      }
      ctx.fillStyle = fillGrad;
      ctx.strokeStyle = strokeGrad;
    } else {
      ctx.strokeStyle = hullStroke;
      ctx.fillStyle = hullFill;
    }

    ctx.shadowColor = glowCol;
    ctx.shadowBlur = (list.length > 0 || purpleAura) ? 18 : 12;
    ctx.lineWidth = 2.0;

    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(13, 11);
    ctx.lineTo(5, 7);
    ctx.lineTo(0, 13);
    ctx.lineTo(-5, 7);
    ctx.lineTo(-13, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit / energy core highlight
    ctx.strokeStyle = coreStroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 7);
    ctx.stroke();

    // Active power-up wingtip nodes
    if (wingtipLeft) {
      ctx.fillStyle = wingtipLeft;
      ctx.fillRect(-12, 6, 3, 4);
      ctx.fillStyle = wingtipRight;
      ctx.fillRect(9, 6, 3, 4);
    }
    ctx.restore();
  }

  if (slow) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 246, 255, 0.78)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, dual ? 30 : 21, time * 3.2, time * 3.2 + Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Renders an autonomous Hologram Fighter Clone (Dark Blue & Purple wireframe + scan shimmer + 3-HP pips).
 */
export function drawFighterClone(ctx, cl, time = 0) {
  const flicker = cl.invulnTimer > 0 && Math.floor(time * 22) % 2 === 0;
  const flash = (cl.hitFlash || 0) > 0;

  ctx.save();
  ctx.translate(cl.x, cl.y);
  ctx.globalAlpha = flicker ? 0.42 : 0.86;

  // Holographic shield ring while invincible (1.0s break-off i-frames!)
  if (cl.invulnTimer > 0) {
    ctx.strokeStyle = '#d4c4ff';
    ctx.shadowColor = COLORS.clonePurple;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, 17, time * 5, time * 5 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.scale(0.86, 0.86);
  ctx.strokeStyle = flash ? '#ffffff' : '#b794ff';
  ctx.fillStyle = flash ? 'rgba(255, 255, 255, 0.72)' : 'rgba(46, 62, 224, 0.48)';
  ctx.shadowColor = COLORS.clonePurple;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 1.9;

  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(13, 11);
  ctx.lineTo(5, 7);
  ctx.lineTo(0, 13);
  ctx.lineTo(-5, 7);
  ctx.lineTo(-13, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hologram core & blue-purple wingtip emitters
  ctx.strokeStyle = '#e8dcff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 7);
  ctx.stroke();

  ctx.fillStyle = COLORS.cloneBlue;
  ctx.fillRect(-11, 5, 3, 4);
  ctx.fillStyle = COLORS.clonePurple;
  ctx.fillRect(8, 5, 3, 4);

  // Subtle holographic scan bars across silhouette
  ctx.strokeStyle = 'rgba(214, 194, 255, 0.55)';
  ctx.lineWidth = 1;
  const sy = ((time * 26 + cl.id * 7) % 24) - 12;
  ctx.beginPath();
  ctx.moveTo(-9, sy);
  ctx.lineTo(9, sy);
  ctx.stroke();
  ctx.restore();

  // Mini 3-pip HP indicator underneath detached clones
  if (cl.detached && cl.maxHp > 0) {
    const pipW = 5;
    const gap = 2;
    const totalW = cl.maxHp * pipW + (cl.maxHp - 1) * gap;
    const sx = cl.x - totalW * 0.5;
    const sy = cl.y + 15;
    ctx.save();
    for (let k = 0; k < cl.maxHp; k++) {
      ctx.fillStyle = k < cl.hp ? '#b794ff' : 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(sx + k * (pipW + gap), sy, pipW, 2.5);
    }
    ctx.restore();
  }
}

export function drawEnemySprite(ctx, e, time = 0, overrideScale = null) {
  const isMaster = e.type === 'MASTER_FLUX_ENFORCER' || e.type === 'MASTER_NULL_ENFORCER';
  const isPulsar = e.type === 'PULSAR';
  const isElite = isMaster || e.type === 'FLUX_ENFORCER' || e.type === 'NULL_ENFORCER' || isPulsar;
  const scale = overrideScale !== null
    ? overrideScale
    : (isMaster ? 1.45 : (isPulsar ? 1.25 : (isElite ? 1.3 : 1.0)));
  const flash = (e.hitFlash || 0) > 0;
  const damaged = e.hp < e.maxHp;

  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.angle) ctx.rotate(e.angle);
  ctx.scale(scale, scale);

  // Radiant pulsing Master-level glowing aura (respective to Cyan Flux or Crimson Null color)
  if (isMaster) {
    const isMasterNull = e.type === 'MASTER_NULL_ENFORCER';
    const pulse = 0.88 + Math.sin(time * 7.5) * 0.12;
    const auraR = 29 * pulse;
    const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, auraR + 7);
    if (isMasterNull) {
      grad.addColorStop(0, 'rgba(255, 65, 100, 0.42)');
      grad.addColorStop(0.55, 'rgba(255, 30, 66, 0.22)');
      grad.addColorStop(1, 'rgba(255, 30, 66, 0)');
    } else {
      grad.addColorStop(0, 'rgba(130, 252, 255, 0.42)');
      grad.addColorStop(0.55, 'rgba(0, 246, 255, 0.22)');
      grad.addColorStop(1, 'rgba(0, 246, 255, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, auraR + 7, 0, Math.PI * 2);
    ctx.fill();

    const ringCol = isMasterNull ? COLORS.nullRed : COLORS.cyan;
    const brightRing = isMasterNull ? '#ff8aa0' : '#b2ffff';
    ctx.save();
    ctx.strokeStyle = ringCol;
    ctx.shadowColor = ringCol;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, auraR * 0.92, time * 2.4, time * 2.4 + Math.PI * 1.25);
    ctx.stroke();

    ctx.strokeStyle = brightRing;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, auraR * 0.78, -time * 3.1, -time * 3.1 + Math.PI * 1.15);
    ctx.stroke();
    ctx.restore();
  }

  if (e.type === 'DRONE') {
    const col = flash ? '#ffffff' : COLORS.cyan;
    ctx.strokeStyle = col;
    ctx.fillStyle = 'rgba(0, 24, 44, 0.9)';
    ctx.shadowColor = col;
    ctx.shadowBlur = 9;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 11);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (e.type === 'INTERCEPTOR') {
    const col = flash ? '#ffffff' : COLORS.gold;
    ctx.strokeStyle = col;
    ctx.fillStyle = 'rgba(38, 22, 4, 0.9)';
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.lineTo(15, -6);
    ctx.lineTo(7, -11);
    ctx.lineTo(0, -3);
    ctx.lineTo(-7, -11);
    ctx.lineTo(-15, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (e.type === 'V1_ENFORCER') {
    const isFluxLinked = e.v1Synergy === 'FLUX';
    const isNullLinked = e.v1Synergy === 'NULL';
    const isDamagedIsolated = !isFluxLinked && !isNullLinked && e.hp <= 1.001 && e.maxHp > 1;
    const col = flash
      ? '#ffffff'
      : (isFluxLinked
        ? COLORS.cyan
        : (isNullLinked
          ? COLORS.nullRed
          : (isDamagedIsolated ? COLORS.amber : COLORS.v1Orange)));
    ctx.strokeStyle = col;
    ctx.fillStyle = isFluxLinked
      ? 'rgba(0, 32, 54, 0.94)'
      : (isNullLinked
        ? 'rgba(54, 6, 16, 0.94)'
        : (isDamagedIsolated ? 'rgba(46, 22, 4, 0.94)' : 'rgba(42, 10, 4, 0.94)'));
    ctx.shadowColor = col;
    ctx.shadowBlur = (isFluxLinked || isNullLinked) ? 18 : 12;
    ctx.lineWidth = (isFluxLinked || isNullLinked) ? 2.2 : 1.9;
    ctx.beginPath();
    ctx.moveTo(-17, -13);
    ctx.lineTo(17, -13);
    ctx.lineTo(17, 14);
    ctx.lineTo(8, 14);
    ctx.lineTo(8, -2);
    ctx.lineTo(-8, -2);
    ctx.lineTo(-8, 14);
    ctx.lineTo(-17, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(-7, -9, 14, 3);

    // Cracked hull lines when isolated at 1 HP; pulsing energy aura ring when Flux/Null linked!
    if (isDamagedIsolated) {
      ctx.strokeStyle = '#ffe0a8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-11, -12); ctx.lineTo(-5, -5); ctx.lineTo(-9, 3);
      ctx.moveTo(10, -11); ctx.lineTo(6, -3); ctx.lineTo(12, 5);
      ctx.stroke();
    } else if (isFluxLinked || isNullLinked) {
      const pulse = 0.72 + Math.sin(time * 12) * 0.28;
      ctx.strokeStyle = isFluxLinked ? '#b4ffff' : '#ff9eb0';
      ctx.globalAlpha = 0.85 * pulse;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 21 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else if (e.type === 'FLUX_ENFORCER' || e.type === 'MASTER_FLUX_ENFORCER') {
    const col = flash ? '#ffffff' : COLORS.cyan;
    ctx.strokeStyle = col;
    ctx.fillStyle = isMaster ? '#061a2e' : '#040b16';
    ctx.shadowColor = col;
    ctx.shadowBlur = isMaster ? 22 : ((e.surgePulse || 0) > 0 ? 22 : 14);
    ctx.lineWidth = isMaster ? 2.2 : 2.0;
    ctx.beginPath();
    ctx.moveTo(-20, -12);
    ctx.lineTo(-10, -17);
    ctx.lineTo(10, -17);
    ctx.lineTo(20, -12);
    ctx.lineTo(18, 16);
    ctx.lineTo(9, 16);
    ctx.lineTo(7, -3);
    ctx.lineTo(-7, -3);
    ctx.lineTo(-9, 16);
    ctx.lineTo(-18, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = isMaster ? '#ffffff' : '#a8fcff';
    ctx.lineWidth = isMaster ? 1.8 : 1.4;
    ctx.beginPath();
    ctx.moveTo(-13, -9);
    ctx.lineTo(13, -9);
    ctx.stroke();
    if (isMaster) {
      // Master Enforcer [Flux] radiant crown crest
      ctx.fillStyle = '#d4ffff';
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(6, -15);
      ctx.lineTo(0, -12);
      ctx.lineTo(-6, -15);
      ctx.closePath();
      ctx.fill();
    }
  } else if (e.type === 'NULL_ENFORCER' || e.type === 'MASTER_NULL_ENFORCER') {
    const col = flash ? '#ffffff' : COLORS.nullRed;
    ctx.strokeStyle = col;
    ctx.fillStyle = isMaster ? '#24040d' : '#140308';
    ctx.shadowColor = col;
    ctx.shadowBlur = isMaster ? 24 : ((e.surgePulse || 0) > 0 ? 22 : 15);
    ctx.lineWidth = isMaster ? 2.2 : 2.0;
    ctx.beginPath();
    ctx.moveTo(-22, -8);
    ctx.lineTo(-12, -17);
    ctx.lineTo(0, -11);
    ctx.lineTo(12, -17);
    ctx.lineTo(22, -8);
    ctx.lineTo(17, 17);
    ctx.lineTo(8, 13);
    ctx.lineTo(6, -2);
    ctx.lineTo(-6, -2);
    ctx.lineTo(-8, 13);
    ctx.lineTo(-17, 17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 30, 66, ${0.55 + Math.sin(time * 8) * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, -5);
    ctx.lineTo(0, -1);
    ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fill();
    if (isMaster) {
      // Master Enforcer [Null] blazing twin horns & white-hot core
      ctx.fillStyle = '#ffe0e8';
      ctx.beginPath();
      ctx.moveTo(0, -19);
      ctx.lineTo(4, -12);
      ctx.lineTo(-4, -12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ff8ca2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-12, -17); ctx.lineTo(-15, -22);
      ctx.moveTo(12, -17); ctx.lineTo(15, -22);
      ctx.stroke();
    }
  } else if (e.type === 'CENTOID') {
    // CENTOID: Shades of green + yellow-gold accents! Head faces +X along its travel angle
    const mainCol = flash ? '#ffffff' : COLORS.centoidGreen;
    const accentCol = flash ? '#ffffff' : COLORS.centoidGold;
    const legWiggle = Math.sin(time * 16 + (e.centoidOrder || 0) * 1.1) * 2.5;

    ctx.shadowColor = mainCol;
    ctx.shadowBlur = e.isCentoidHead ? 15 : 10;

    // Articulated side cyber-legs (both head & body)
    ctx.strokeStyle = accentCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, -8); ctx.lineTo(-6 + legWiggle, -14);
    ctx.moveTo(-4, 8); ctx.lineTo(-6 - legWiggle, 14);
    ctx.moveTo(3, -8); ctx.lineTo(5 - legWiggle, -14);
    ctx.moveTo(3, 8); ctx.lineTo(5 + legWiggle, 14);
    ctx.stroke();

    if (e.isCentoidHead) {
      // Armored Centoid Head w/ twin yellow-gold pincers & glowing eyes (weak point!)
      ctx.fillStyle = '#06331a';
      ctx.strokeStyle = mainCol;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(6, -11);
      ctx.lineTo(-9, -10);
      ctx.lineTo(-12, 0);
      ctx.lineTo(-9, 10);
      ctx.lineTo(6, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Golden mandibles extending forward
      ctx.strokeStyle = accentCol;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(10, -6); ctx.lineTo(18, -10); ctx.lineTo(15, -3);
      ctx.moveTo(10, 6); ctx.lineTo(18, 10); ctx.lineTo(15, 3);
      ctx.stroke();

      // Glowing yellow-gold twin eyes & crown chevron
      ctx.fillStyle = accentCol;
      ctx.beginPath();
      ctx.arc(4, -5, 2.5, 0, Math.PI * 2);
      ctx.arc(4, 5, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fff5b0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-5, -5); ctx.lineTo(0, 0); ctx.lineTo(-5, 5);
      ctx.stroke();
    } else {
      // Segmented green body carapace with darker emerald rim & yellow-gold dorsal node
      ctx.fillStyle = '#083a1f';
      ctx.strokeStyle = mainCol;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(4, -9);
      ctx.lineTo(-5, -9);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-5, 9);
      ctx.lineTo(4, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = COLORS.centoidDarkGreen;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-2, -7); ctx.lineTo(-2, 7);
      ctx.stroke();

      ctx.fillStyle = accentCol;
      ctx.beginPath();
      ctx.arc(2, 0, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (e.type === 'ALPHA_CENTOID') {
    // ALPHA CENTOID: Dark blue, dark purple & bright pink accents!
    const hullCol = flash ? '#ffffff' : COLORS.alphaBlue;
    const purpleCol = flash ? '#ffffff' : COLORS.alphaPurple;
    const pinkCol = flash ? '#ffffff' : COLORS.alphaPink;
    const legWiggle = Math.sin(time * 19 + (e.centoidOrder || 0) * 1.2) * 2.8;

    ctx.shadowColor = pinkCol;
    ctx.shadowBlur = e.isCentoidHead ? 18 : 12;

    // Jagged dark-purple & pink energy legs
    ctx.strokeStyle = pinkCol;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3, -9); ctx.lineTo(-7 + legWiggle, -15);
    ctx.moveTo(-3, 9); ctx.lineTo(-7 - legWiggle, 15);
    ctx.moveTo(4, -9); ctx.lineTo(7 - legWiggle, -15);
    ctx.moveTo(4, 9); ctx.lineTo(7 + legWiggle, 15);
    ctx.stroke();

    if (e.isCentoidHead) {
      // Angular Alpha Crest Head with bright pink twin horns & core
      ctx.fillStyle = '#120a3a';
      ctx.strokeStyle = hullCol;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(7, -12);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-13, 0);
      ctx.lineTo(-10, 11);
      ctx.lineTo(7, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Dark-purple inner armored crest
      ctx.strokeStyle = purpleCol;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-7, -7); ctx.lineTo(8, 0); ctx.lineTo(-7, 7);
      ctx.stroke();

      // Blazing pink mandibles & glowing eyes
      ctx.strokeStyle = pinkCol;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(10, -7); ctx.lineTo(20, -11); ctx.lineTo(16, -3);
      ctx.moveTo(10, 7); ctx.lineTo(20, 11); ctx.lineTo(16, 3);
      ctx.stroke();

      ctx.fillStyle = '#ffc2ee';
      ctx.beginPath();
      ctx.arc(5, -5, 2.7, 0, Math.PI * 2);
      ctx.arc(5, 5, 2.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Dark-blue & purple plated body with pulsing pink core
      ctx.fillStyle = '#100934';
      ctx.strokeStyle = purpleCol;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(5, -10);
      ctx.lineTo(-6, -10);
      ctx.lineTo(-11, 0);
      ctx.lineTo(-6, 10);
      ctx.lineTo(5, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = hullCol;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-5, -6); ctx.lineTo(4, -6);
      ctx.moveTo(-5, 6); ctx.lineTo(4, 6);
      ctx.stroke();

      ctx.fillStyle = pinkCol;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(0, -4);
      ctx.lineTo(-4, 0);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
    }
  } else if (e.type === 'PULSAR') {
    // PULSAR: Yellow Elite-sized fighter with 2 twin lightning rods!
    const col = flash ? '#ffffff' : COLORS.yellow;
    const accent = flash ? '#ffffff' : COLORS.yellowOrange;
    ctx.strokeStyle = col;
    ctx.fillStyle = '#241802';
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2.0;

    // Swept angular elite fighter chassis
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(11, -9);
    ctx.lineTo(20, -2);
    ctx.lineTo(16, 11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 14);
    ctx.lineTo(-7, 8);
    ctx.lineTo(-16, 11);
    ctx.lineTo(-20, -2);
    ctx.lineTo(-11, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Orange inner generator core
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, -3);
    ctx.lineTo(0, -9);
    ctx.lineTo(10, -3);
    ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.stroke();

    // 2 Prominent Twin Lightning Rods extending forward/downward from wings
    ctx.strokeStyle = '#fff5b5';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-12, 6); ctx.lineTo(-14, 19);
    ctx.moveTo(12, 6); ctx.lineTo(14, 19);
    ctx.stroke();

    // Conductor coils on each rod
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, 11); ctx.lineTo(-10, 11);
    ctx.moveTo(-17, 15); ctx.lineTo(-11, 15);
    ctx.moveTo(10, 11); ctx.lineTo(16, 11);
    ctx.moveTo(11, 15); ctx.lineTo(17, 15);
    ctx.stroke();

    // Glowing white-yellow discharge tips
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-14, 19, 2.4, 0, Math.PI * 2);
    ctx.arc(14, 19, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Animated crackling micro-arc jumping between the 2 lightning rods!
    const jig = Math.sin(time * 42 + (e.animPhase || 0)) * 3.5;
    const jig2 = Math.cos(time * 54 + (e.animPhase || 0)) * 3.0;
    ctx.strokeStyle = Math.sin(time * 30) > 0 ? '#ffffff' : COLORS.yellow;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-14, 19);
    ctx.lineTo(-5, 19 + jig);
    ctx.lineTo(5, 19 - jig2);
    ctx.lineTo(14, 19);
    ctx.stroke();
  }
  ctx.restore();

  // V1 Enforcer AOE Buff indicators (+30% Speed cyan chevrons / +33% HP crimson armor ring)
  if (overrideScale === null && (e.speedBuffed || e.hpBuffed)) {
    const buffR = isMaster ? 32 : (isElite ? 27 : 20);
    ctx.save();
    if (e.hpBuffed) {
      ctx.strokeStyle = 'rgba(255, 48, 86, 0.82)';
      ctx.shadowColor = COLORS.nullRed;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, buffR, -time * 2.2, -time * 2.2 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.speedBuffed) {
      ctx.strokeStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.6;
      const sx = buffR - 2;
      ctx.beginPath();
      ctx.moveTo(e.x - sx - 4, e.y - 4); ctx.lineTo(e.x - sx, e.y); ctx.lineTo(e.x - sx - 4, e.y + 4);
      ctx.moveTo(e.x + sx + 4, e.y - 4); ctx.lineTo(e.x + sx, e.y); ctx.lineTo(e.x + sx + 4, e.y + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Upright Mini HP Bar above damaged enemies (or always visible on Masters & 2x HP Challenge Elites)
  if (overrideScale === null && (damaged || e.isChallengeElite || isMaster || e.hpBuffed) && e.hp > 0) {
    const bw = isMaster ? 48 : (e.isChallengeElite ? 44 : (isElite ? 38 : (e.maxHp >= 2 ? 26 : 18)));
    const bx = e.x - bw / 2;
    const by = e.y - (isMaster ? 36 : (isElite ? 30 : (e.maxHp >= 2 ? 23 : 18)));
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(2, 8, 18, 0.88)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = (e.type === 'NULL_ENFORCER' || e.type === 'MASTER_NULL_ENFORCER')
      ? COLORS.nullRed
      : ((e.type === 'FLUX_ENFORCER' || e.type === 'MASTER_FLUX_ENFORCER')
        ? COLORS.cyan
        : (e.type === 'PULSAR'
          ? COLORS.yellow
          : (e.type === 'ALPHA_CENTOID'
            ? COLORS.alphaPink
            : (e.type === 'CENTOID' ? COLORS.centoidGreen : COLORS.gold))));
    ctx.fillRect(bx, by, bw * ratio, 3);
    ctx.restore();
  }
}

export function drawEnforcerWingSprite(ctx, ew) {
  ctx.save();
  ctx.translate(ew.x, ew.y);
  ctx.rotate(ew.angle + Math.PI / 2);
  const isNull = ew.variant === 'NULL';
  const col = isNull ? COLORS.nullRed : COLORS.cyan;
  ctx.strokeStyle = col;
  ctx.fillStyle = isNull ? '#1b0309' : '#021726';
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (isNull) {
    ctx.moveTo(0, -11);
    ctx.lineTo(9, 2);
    ctx.lineTo(5, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-5, 9);
    ctx.lineTo(-9, 2);
  } else {
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders a retro Square Pixelated Power-Up Capsule (Cyan = Homing, Red = Laser, Purple = Arc Wave)
 * Built on an explicit blocky 9x9 pixel grid for crisp pixelated SZARKK arcade appeal.
 */
export function drawPixelCapsule(ctx, x, y, type, time = 0, scale = 1.0) {
  const isCyan = type === 'CYAN';
  const isPurple = type === 'PURPLE';
  const isYellow = type === 'YELLOW';
  const isClone = type === 'CLONE';
  const mainCol = isCyan
    ? COLORS.cyan
    : (isPurple
      ? COLORS.purple
      : (isYellow
        ? COLORS.yellow
        : (isClone ? COLORS.cloneBlue : COLORS.nullRed)));
  const glowCol = isCyan
    ? '#9efcff'
    : (isPurple
      ? COLORS.purpleBright
      : (isYellow
        ? COLORS.yellowOrange
        : (isClone ? COLORS.clonePurple : '#ff8ca0')));
  const fillCol = isCyan
    ? '#041d2e'
    : (isPurple
      ? '#1e0532'
      : (isYellow
        ? '#291b02'
        : (isClone ? '#0b0c2e' : '#26040b')));
  const px = 2.6 * scale;
  const half = 4.5 * px;
  const pulse = 0.8 + Math.sin(time * 7) * 0.2;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.shadowColor = isClone ? COLORS.clonePurple : mainCol;
  ctx.shadowBlur = 12 * pulse;

  // Inner dark square fill
  ctx.fillStyle = fillCol;
  ctx.fillRect(-half + px, -half + px, px * 7, px * 7);

  // Pixelated square outer frame (notched retro corners)
  ctx.fillStyle = mainCol;
  ctx.fillRect(-half + px, -half, px * 7, px);
  ctx.fillRect(-half + px, half - px, px * 7, px);
  ctx.fillRect(-half, -half + px, px, px * 7);
  ctx.fillRect(half - px, -half + px, px, px * 7);

  // Corner accent pixels
  ctx.fillStyle = glowCol;
  ctx.fillRect(-half + px, -half + px, px, px);
  ctx.fillRect(half - 2 * px, -half + px, px, px);
  ctx.fillRect(-half + px, half - 2 * px, px, px);
  ctx.fillRect(half - 2 * px, half - 2 * px, px, px);

  // Inner pixel icon
  ctx.fillStyle = '#ffffff';
  if (isCyan) {
    // Twin Homing Missile / Lock-On Pixel Icon
    ctx.fillRect(-px * 2.5, -px * 1.5, px, px * 3);
    ctx.fillRect(px * 1.5, -px * 1.5, px, px * 3);
    ctx.fillRect(-px * 1.5, -px * 2.5, px, px);
    ctx.fillRect(px * 0.5, -px * 2.5, px, px);
    ctx.fillStyle = mainCol;
    ctx.fillRect(-px * 0.5, -px * 0.5, px, px);
  } else if (isPurple) {
    // Stacked Pixel Arc Wave Icon
    ctx.fillRect(-px * 1.5, -px * 2.5, px * 3, px);
    ctx.fillRect(-px * 2.5, -px * 1.5, px, px);
    ctx.fillRect(px * 1.5, -px * 1.5, px, px);
    ctx.fillStyle = glowCol;
    ctx.fillRect(-px * 1.5, -px * 0.5, px * 3, px);
    ctx.fillRect(-px * 2.5, px * 0.5, px, px);
    ctx.fillRect(px * 1.5, px * 0.5, px, px);
    ctx.fillStyle = mainCol;
    ctx.fillRect(-px * 0.5, px * 1.5, px, px);
  } else if (isYellow) {
    // Chain Lightning Pixel Bolt Icon (white core + orange sparks!)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px * 0.5, -px * 2.5, px, px);
    ctx.fillRect(-px * 0.5, -px * 1.5, px * 2, px);
    ctx.fillRect(-px * 1.5, -px * 0.5, px * 3, px);
    ctx.fillRect(-px * 0.5, px * 0.5, px * 2, px);
    ctx.fillRect(-px * 1.5, px * 1.5, px, px);
    ctx.fillStyle = glowCol;
    ctx.fillRect(-px * 2.5, -px * 1.5, px, px);
    ctx.fillRect(px * 1.5, px * 0.5, px, px);
  } else if (isClone) {
    // 3 Hologram Fighter Clones Pixel Trio (left, right, back)
    ctx.fillStyle = '#e5dcff';
    ctx.fillRect(-px * 2.5, -px * 1.5, px, px * 2);
    ctx.fillRect(px * 1.5, -px * 1.5, px, px * 2);
    ctx.fillRect(-px * 0.5, px * 0.5, px, px * 2);
    ctx.fillStyle = glowCol;
    ctx.fillRect(-px * 0.5, -px * 2.5, px, px * 2);
    ctx.fillRect(-px * 1.5, -px * 0.5, px, px);
    ctx.fillRect(px * 0.5, -px * 0.5, px, px);
  } else {
    // Continuous Vertical Laser Beam Pixel Icon
    ctx.fillRect(-px * 0.5, -px * 3, px, px * 6);
    ctx.fillStyle = glowCol;
    ctx.fillRect(-px * 1.5, -px * 2, px, px * 4);
    ctx.fillRect(px * 0.5, -px * 2, px, px * 4);
  }
  ctx.restore();
}

/**
 * Renders the V1 Enforcer's Arcade-style Tractor Beam cone with animated shimmer bands.
 */
export function drawTractorBeam(ctx, boss, time = 0, capturing = false) {
  const topY = boss.y + 12;
  const botY = LOGICAL_H - 18;
  const topHalfW = 14;
  const botHalfW = 54;
  const pulse = 0.78 + Math.sin(time * (capturing ? 18 : 10)) * 0.22;

  ctx.save();
  // Translucent cone body
  const coneGrad = ctx.createLinearGradient(0, topY, 0, botY);
  if (capturing) {
    coneGrad.addColorStop(0, `rgba(0, 255, 196, ${0.46 * pulse})`);
    coneGrad.addColorStop(0.55, `rgba(0, 246, 255, ${0.34 * pulse})`);
    coneGrad.addColorStop(1, `rgba(255, 70, 110, ${0.28 * pulse})`);
  } else {
    coneGrad.addColorStop(0, `rgba(0, 246, 255, ${0.4 * pulse})`);
    coneGrad.addColorStop(0.55, `rgba(0, 255, 170, ${0.26 * pulse})`);
    coneGrad.addColorStop(1, `rgba(0, 246, 255, ${0.14 * pulse})`);
  }

  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(boss.x - topHalfW, topY);
  ctx.lineTo(boss.x + topHalfW, topY);
  ctx.lineTo(boss.x + botHalfW, botY);
  ctx.lineTo(boss.x - botHalfW, botY);
  ctx.closePath();
  ctx.fill();

  // Glowing outer edge lines
  const edgeCol = capturing ? COLORS.emerald : COLORS.cyan;
  ctx.strokeStyle = edgeCol;
  ctx.shadowColor = edgeCol;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(boss.x - topHalfW, topY);
  ctx.lineTo(boss.x - botHalfW, botY);
  ctx.moveTo(boss.x + topHalfW, topY);
  ctx.lineTo(boss.x + botHalfW, botY);
  ctx.stroke();

  // Animated descending/oscillating wave bands inside the cone
  const bandCount = 8;
  const spanY = botY - topY;
  for (let i = 0; i < bandCount; i++) {
    const phase = ((i / bandCount) + time * (capturing ? 0.95 : 0.65)) % 1;
    const bandY = topY + phase * spanY;
    const hw = topHalfW + (botHalfW - topHalfW) * phase;
    const alpha = Math.sin(phase * Math.PI) * 0.85;
    ctx.strokeStyle = i % 2 === 0
      ? `rgba(0, 255, 185, ${alpha})`
      : `rgba(0, 246, 255, ${alpha})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(boss.x - hw + 3, bandY);
    ctx.lineTo(boss.x + hw - 3, bandY);
    ctx.stroke();
  }

  // Bottom capture zone target ring at player altitude
  const ringY = LOGICAL_H - 54;
  const ringPhase = (ringY - topY) / spanY;
  const ringHalfW = topHalfW + (botHalfW - topHalfW) * ringPhase;
  ctx.strokeStyle = capturing ? 'rgba(255, 90, 120, 0.85)' : 'rgba(0, 255, 170, 0.72)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(boss.x, ringY, ringHalfW * 0.88, 7, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
