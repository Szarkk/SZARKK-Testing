/* =========================================================================
   ENFORCER TRACTOR BEAM (V1 ENFORCER) + ENFORCER WINGS & THREADS
   ========================================================================= */

import {
  COLORS,
  ELITE_SURGE_CHANCE,
  ELITE_SURGE_INTERVAL,
  LOGICAL_H,
  LOGICAL_W,
  MASTER_SURGE_CHANCE,
  NULL_THREAD_HITS,
  THREAD_LIFETIME,
  TRACTOR_APPROACH_DUR,
  TRACTOR_BEAM_DUR,
  TRACTOR_BEAM_Y,
  TRACTOR_CAPTURE_RADIUS,
  TRACTOR_LIFT_DUR,
  TRACTOR_PULL_RADIUS,
  TRACTOR_RETRY_DELAY
} from './config.js';
import { clamp, distToSeg, evalCubic, lerp } from './utils.js';
import { hasPowerup, removePowerupSlot } from './powerups.js';

export function startEnforcerBeam(game, enforcer) {
  enforcer.state = 'BEAM_APPROACH';
  enforcer.beamShield = 1; // 1-hit Tractor Capacitor Shield while descending so rapid-pulse doesn't instakill it
  enforcer.beamApproachT = 0;
  enforcer.beamStartX = enforcer.x;
  enforcer.beamStartY = enforcer.y;
  // Lock target lane ONCE at launch so the Enforcer swoops to a fixed column and never chases the player
  enforcer.beamTargetX = clamp(game.player.x, 60, LOGICAL_W - 60);
  // Flank wide away from the target fire line before curving into the fixed beam lane
  const flankDir = enforcer.x < enforcer.beamTargetX ? -1 : 1;
  enforcer.beamFlankX = clamp(enforcer.beamTargetX + flankDir * 115, 56, LOGICAL_W - 56);
  game.activeBeamBoss = enforcer;
  game.spawnPopup(enforcer.x, enforcer.y - 24, 'TRACTOR BEAM!', COLORS.cyan, 1.15);
}

export function updateEnforcerBeamApproach(game, e, dt) {
  const targetY = TRACTOR_BEAM_Y;
  const targetX = e.beamTargetX;
  const v1Slow = e.type === 'V1_ENFORCER' ? 0.8 : 1.0;
  const spdMult = v1Slow * (e.speedBuffed ? 1.3 : 1.0);
  e.beamApproachT = Math.min(1, e.beamApproachT + (dt * spdMult) / TRACTOR_APPROACH_DUR);
  const pos = evalCubic([
    { x: e.beamStartX, y: e.beamStartY },
    { x: e.beamFlankX, y: lerp(e.beamStartY, targetY, 0.42) },
    { x: lerp(e.beamFlankX, targetX, 0.62), y: lerp(e.beamStartY, targetY, 0.88) },
    { x: targetX, y: targetY }
  ], e.beamApproachT);
  e.x = pos.x;
  e.y = pos.y;

  if (e.beamApproachT >= 1) {
    e.x = targetX;
    e.y = targetY;
    e.beamShield = 0;
    e.state = 'BEAMING';
    e.beamTimer = TRACTOR_BEAM_DUR;
  }
}

export function updateEnforcerBeaming(game, e, dt) {
  const p = game.player;
  e.beamTimer -= dt;

  if (p.alive && !p.dual && !p.capturedById && p.invulnTimer <= 0 && p.y > e.y + 12) {
    const topY = e.y + 12;
    const botY = LOGICAL_H - 18;
    const depth = clamp((p.y - topY) / Math.max(1, botY - topY), 0, 1);
    const pullRadius = lerp(22, TRACTOR_PULL_RADIUS, depth);
    const captureRadius = lerp(16, TRACTOR_CAPTURE_RADIUS, depth);
    const dx = e.x - p.x;

    // Gentle magnetic pull inside the beam cone, easily escapable at the edges
    if (Math.abs(dx) < pullRadius) {
      p.x += dx * 2.2 * dt;
      game.clampPlayerPosition();
    }
    if (Math.abs(e.x - p.x) < captureRadius) {
      p.capturedById = e.id;
      e.hasCapturedShip = true;
      game.redLaserActive = false;
      game.redLaserPulseTimer = 0;
      game.activeLaserBeams = [];
      game.capturedFighter = {
        x: p.x,
        y: p.y,
        ownerId: e.id,
        friendlyFireGrace: 1.6,
        spin: 0
      };
      game.spawnPopup(p.x, p.y - 30, 'FIGHTER CAPTURED!', COLORS.nullRed, 1.35);
      e.beamTimer = TRACTOR_LIFT_DUR; // Visual tractor lift before returning to formation
    }
  }

  if (e.beamTimer <= 0) {
    e.state = 'RETURNING';
    if (game.activeBeamBoss && game.activeBeamBoss.id === e.id) {
      game.activeBeamBoss = null;
    }
    if (p.capturedById === e.id) {
      p.capturedById = null;
      p.alive = false;
      p.respawnTimer = 1.5;
      p.vibrateAmp = 0;
      p.missileVibTimer = 0;
      p.slowTimer = 0;
      p.dmgDebuffTimer = 0;
      p.fireJamTimer = 0;
      p.sparkSlowTimer = 0;
      game.masterFluxStreak = 0;
      game.masterNullStreak = 0;
      game.masterFluxRewardSpawned = false;
      game.masterNullRewardSpawned = false;
      if (hasPowerup(game, 'CLONE')) {
        removePowerupSlot(game, 'CLONE', true);
      } else {
        game.fighterClones = [];
        game.cloneTimer = 0;
      }
      game.redLaserActive = false;
      game.redLaserPulseTimer = 0;
      game.activeLaserBeams = [];
      if (!game.sandboxMode) {
        game.lives--;
      }
      game.updateHUD();
      game.updateStatusPills();
      if (!game.sandboxMode && game.lives <= 0) {
        game.gameOverTimer = 1.05;
      }
    }
  }
}

export function updateCapturedFighterTether(game, e, dt) {
  if (!e.hasCapturedShip || !game.capturedFighter || game.capturedFighter.ownerId !== e.id) return;
  const p = game.player;
  const liftSpeed = p.capturedById === e.id ? 5.2 : 8.0;
  game.capturedFighter.x += (e.x - game.capturedFighter.x) * Math.min(1, liftSpeed * dt);
  game.capturedFighter.y += ((e.y - 30) - game.capturedFighter.y) * Math.min(1, liftSpeed * dt);
  if (game.capturedFighter.friendlyFireGrace > 0) {
    game.capturedFighter.friendlyFireGrace = Math.max(0, game.capturedFighter.friendlyFireGrace - dt);
  }
  game.capturedFighter.spin = p.capturedById === e.id ? game.capturedFighter.spin + dt * 10 : 0;
}

export function handleEnforcerDestroyed(game, e) {
  if (game.activeBeamBoss && game.activeBeamBoss.id === e.id) {
    game.activeBeamBoss = null;
    game.synth.stopTractorBeam();
    game.tractorTimer = Math.min(game.tractorTimer, TRACTOR_RETRY_DELAY);
  }

  // Abort active pull-up or rescue docked captured ship if V1 Enforcer is destroyed
  if (game.player.capturedById === e.id) {
    game.player.capturedById = null;
    game.capturedFighter = null;
    game.player.invulnTimer = 1.4;
    game.spawnPopup(e.x, e.y - 22, 'CAPTURE ABORTED!', COLORS.emerald, 1.3);
    game.synth.playRescue();
  } else if (e.hasCapturedShip && game.capturedFighter && game.capturedFighter.ownerId === e.id) {
    game.capturedFighter = null;
    game.player.dual = true;
    game.dualRescues++;
    game.spawnPopup(e.x, e.y - 22, 'DUAL-FIGHTER RESCUED!', COLORS.emerald, 1.5);
    game.synth.playRescue();
  }
}

export function spawnEnforcerWing(
  game,
  boss,
  allowSurge = true,
  surgeOffsetIdx = 0,
  forcedSide = null,
  spawnOffsetX = 0
) {
  const isNull = boss.type === 'NULL_ENFORCER' || boss.type === 'MASTER_NULL_ENFORCER';
  const isMaster = boss.type === 'MASTER_FLUX_ENFORCER' || boss.type === 'MASTER_NULL_ENFORCER';
  game.synth.playEnforcerWingLaunch(isNull);

  const surgeChance = isMaster ? MASTER_SURGE_CHANCE : ELITE_SURGE_CHANCE;
  if (allowSurge && boss.wingSurgeQueue <= 0 && Math.random() < surgeChance) {
    const extraCount = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
    boss.wingSurgeQueue = extraCount;
    boss.wingSurgeTimer = ELITE_SURGE_INTERVAL;
    boss.surgePulse = 0.9;
    game.synth.playWingSurge(isNull);
    game.spawnPopup(
      boss.x,
      boss.y - 34,
      `WING SURGE +${extraCount}`,
      isNull ? COLORS.nullRed : COLORS.cyan,
      1.45
    );
  }

  const trail = {
    id: game.threadIdSeq++,
    variant: isNull ? 'NULL' : 'FLUX',
    segments: [],
    hitsRemaining: isNull ? NULL_THREAD_HITS : 999,
    maxHits: NULL_THREAD_HITS,
    flashTimer: 0
  };
  game.threadTrails.push(trail);

  const spread = surgeOffsetIdx * 18 * (surgeOffsetIdx % 2 === 0 ? 1 : -1);

  if (isNull) {
    // Double-length 90-degree crimson Null Thread across 3 corridor tiers (~1080px span, 4.8s lifetime)
    const startX = clamp(boss.x + spawnOffsetX + spread * 0.4, 54, LOGICAL_W - 54);
    const startY = boss.y + 20;
    const dirX = forcedSide !== null
      ? forcedSide
      : ((startX < LOGICAL_W * 0.5 ? 1 : -1) * (surgeOffsetIdx % 2 === 1 ? -1 : 1));
    const dropY1 = clamp(210 + Math.random() * 75 + surgeOffsetIdx * 10, 195, 310);
    const crossX1 = clamp(startX + dirX * (160 + Math.random() * 145), 42, LOGICAL_W - 42);
    const dropY2 = clamp(dropY1 + 115 + Math.random() * 50, 345, 450);
    const crossX2 = clamp(crossX1 - dirX * (175 + Math.random() * 140), 42, LOGICAL_W - 42);
    const dropY3 = clamp(LOGICAL_H - 72 - Math.random() * 44, 505, LOGICAL_H - 64);
    const exitX = dirX > 0 ? LOGICAL_W + 38 : -38;

    game.enforcerWings.push({
      variant: 'NULL',
      trail,
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      hp: 1,
      maxHp: 1,
      speed: 225,
      angle: Math.PI / 2,
      waypoints: [
        { x: startX, y: dropY1 },
        { x: crossX1, y: dropY1 },
        { x: crossX1, y: dropY2 },
        { x: crossX2, y: dropY2 },
        { x: crossX2, y: dropY3 },
        { x: exitX, y: dropY3 }
      ],
      wpIndex: 0
    });
  } else {
    // Varied curved Cyan Flux Thread flight patterns (never repeats the same curve back-to-back!)
    const startX = clamp(boss.x + spawnOffsetX, 44, LOGICAL_W - 44);
    const startY = boss.y + 20;
    const sweepRight = forcedSide !== null
      ? (forcedSide > 0)
      : (Math.random() < 0.5 ? (startX < LOGICAL_W * 0.5) : (surgeOffsetIdx % 2 === 0));
    const dir = sweepRight ? 1 : -1;
    const jitterY = (Math.random() - 0.5) * 44;

    const patternPool = [0, 1, 2, 3, 4].filter(idx => idx !== boss.lastFluxCurveIdx);
    const patIdx = patternPool[Math.floor(Math.random() * patternPool.length)];
    boss.lastFluxCurveIdx = patIdx;

    let curves;
    let dur = 2.25;

    if (patIdx === 1) {
      // 1) FIGURE_8_LOOP: Swoops into a graceful crossing figure-8 ribbon loop across mid & lower deck
      const cx = clamp(LOGICAL_W * 0.5 + (Math.random() - 0.5) * 70, 145, LOGICAL_W - 145);
      const midY = clamp(365 + jitterY, 315, 415);
      const lowY = clamp(545 + jitterY * 0.5, 505, LOGICAL_H - 52);
      curves = [
        [
          { x: startX, y: startY },
          { x: clamp(cx + dir * 165, 34, LOGICAL_W - 34), y: 200 },
          { x: clamp(cx + dir * 145, 34, LOGICAL_W - 34), y: midY + 40 },
          { x: cx, y: midY }
        ],
        [
          { x: cx, y: midY },
          { x: clamp(cx - dir * 175, 34, LOGICAL_W - 34), y: midY - 45 },
          { x: clamp(cx - dir * 185, 34, LOGICAL_W - 34), y: lowY },
          { x: cx, y: lowY - 22 }
        ],
        [
          { x: cx, y: lowY - 22 },
          { x: clamp(cx + dir * 155, 34, LOGICAL_W - 34), y: lowY + 22 },
          { x: clamp(cx + dir * 170, 34, LOGICAL_W - 34), y: 425 },
          { x: dir > 0 ? LOGICAL_W + 42 : -42, y: 310 + jitterY }
        ]
      ];
      dur = 1.65;
    } else if (patIdx === 2) {
      // 2) DEEP_U_SWOOP: Steep flank plunge into a sweeping wide parabolic U-turn across the dodge zone
      const flankX = dir > 0 ? clamp(52 + Math.random() * 44, 38, 110) : clamp(LOGICAL_W - 52 - Math.random() * 44, LOGICAL_W - 110, LOGICAL_W - 38);
      const farX = dir > 0 ? LOGICAL_W - 54 : 54;
      const bottomY = LOGICAL_H - 42 - Math.random() * 34;
      curves = [
        [
          { x: startX, y: startY },
          { x: flankX, y: 210 },
          { x: flankX, y: 470 },
          { x: LOGICAL_W * 0.5, y: bottomY }
        ],
        [
          { x: LOGICAL_W * 0.5, y: bottomY },
          { x: farX, y: bottomY + 12 },
          { x: farX, y: 390 + jitterY },
          { x: dir > 0 ? LOGICAL_W + 42 : -42, y: 255 + jitterY }
        ]
      ];
      dur = 2.15;
    } else if (patIdx === 3) {
      // 3) CORKSCREW_SPIRAL: 3-band tight descending helical weave from top deck down to bottom playfield
      const y1 = 245 + jitterY * 0.4;
      const y2 = 410 + jitterY * 0.4;
      const y3 = LOGICAL_H - 64;
      const x1 = dir > 0 ? LOGICAL_W - 64 : 64;
      const x2 = dir > 0 ? 64 : LOGICAL_W - 64;
      curves = [
        [
          { x: startX, y: startY },
          { x: clamp(startX + dir * 150, 36, LOGICAL_W - 36), y: 165 },
          { x: x1, y: y1 - 45 },
          { x: LOGICAL_W * 0.5, y: y1 + 35 }
        ],
        [
          { x: LOGICAL_W * 0.5, y: y1 + 35 },
          { x: x2, y: y1 + 85 },
          { x: x2, y: y2 - 20 },
          { x: LOGICAL_W * 0.5, y: y2 + 38 }
        ],
        [
          { x: LOGICAL_W * 0.5, y: y2 + 38 },
          { x: x1, y: y2 + 92 },
          { x: x1, y: y3 },
          { x: dir > 0 ? -42 : LOGICAL_W + 42, y: y3 - 48 }
        ]
      ];
      dur = 1.55;
    } else if (patIdx === 4) {
      // 4) APEX_CROSS_ARC: Player-targeted sweeping dive banking into a whip-back cross-arena exit arc
      const px = game.player && game.player.alive ? game.player.x : LOGICAL_W * 0.5;
      const apexX = clamp(px + (Math.random() - 0.5) * 90, 68, LOGICAL_W - 68);
      const apexY = clamp(LOGICAL_H - 96 - Math.random() * 56, 465, LOGICAL_H - 62);
      const whipDir = apexX < LOGICAL_W * 0.5 ? 1 : -1;
      curves = [
        [
          { x: startX, y: startY },
          { x: clamp(startX - whipDir * 130, 36, LOGICAL_W - 36), y: 235 },
          { x: clamp(apexX - whipDir * 85, 36, LOGICAL_W - 36), y: apexY - 70 },
          { x: apexX, y: apexY }
        ],
        [
          { x: apexX, y: apexY },
          { x: clamp(apexX + whipDir * 175, 34, LOGICAL_W - 34), y: apexY + 34 },
          { x: clamp(apexX + whipDir * 210, 34, LOGICAL_W - 34), y: 315 + jitterY },
          { x: whipDir > 0 ? LOGICAL_W + 42 : -42, y: 215 + jitterY }
        ]
      ];
      dur = 2.05;
    } else {
      // 0) DOUBLE_S: Classic wide double-S sweep with randomized vertical & lateral offsets
      const midX = clamp((sweepRight ? 96 : LOGICAL_W - 96) + (Math.random() - 0.5) * 60 - spread * 0.4, 44, LOGICAL_W - 44);
      const midY = clamp(388 + jitterY + (surgeOffsetIdx % 2) * 24, 330, 445);
      curves = [
        [
          { x: startX, y: startY },
          { x: clamp((sweepRight ? 415 : 65) + spread, 36, LOGICAL_W - 36), y: 210 + jitterY * 0.5 + surgeOffsetIdx * 10 },
          { x: clamp((sweepRight ? 368 : 112) + spread * 0.5, 36, LOGICAL_W - 36), y: midY - 45 },
          { x: midX, y: midY }
        ],
        [
          { x: midX, y: midY },
          { x: clamp((sweepRight ? 54 : LOGICAL_W - 54), 36, LOGICAL_W - 36), y: midY + 108 },
          { x: clamp((sweepRight ? 410 : 70) - spread * 0.4, 36, LOGICAL_W - 36), y: LOGICAL_H - 52 },
          { x: sweepRight ? LOGICAL_W + 42 : -42, y: LOGICAL_H - 165 + jitterY * 0.6 }
        ]
      ];
      dur = 2.3;
    }

    game.enforcerWings.push({
      variant: 'FLUX',
      trail,
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      hp: 1,
      maxHp: 1,
      angle: Math.PI / 2,
      curves,
      curveIdx: 0,
      t: 0,
      dur
    });
  }
}

export function shatterThreadTrail(game, trailIdx, fx, fy, color) {
  const trail = game.threadTrails[trailIdx];
  if (!trail) return;
  for (const seg of trail.segments) {
    if (Math.random() < 0.45) {
      game.spawnDeleteBurst((seg.x1 + seg.x2) * 0.5, (seg.y1 + seg.y2) * 0.5, color, 2, 110);
    }
  }
  game.spawnDeleteBurst(fx, fy, color, 10, 155);
  game.synth.playThreadShatter();
  game.threadTrails.splice(trailIdx, 1);
}

export function damageEnforcerWing(game, idx, dmg, quiet = false) {
  const ew = game.enforcerWings[idx];
  if (!ew) return;
  ew.hp -= dmg;
  if (ew.hp <= 0.001) {
    const col = ew.variant === 'NULL' ? COLORS.nullRed : COLORS.cyan;
    game.addScore(150, ew.x, ew.y, col);
    game.spawnDeleteBurst(ew.x, ew.y, col, 14, 150);
    game.synth.playDeleteBurst(false);
    game.enforcerWings.splice(idx, 1);
  } else if (!quiet) {
    game.synth.playArmorPing();
  }
}

export function updateEnforcerWingsAndThreads(game, dt) {
  const p = game.player;

  // 1) Update Enforcer Wings (Flux curved swoops & Null 90-degree corridors)
  for (let i = game.enforcerWings.length - 1; i >= 0; i--) {
    const ew = game.enforcerWings[i];
    const prevX = ew.x;
    const prevY = ew.y;
    let finished = false;

    if (ew.variant === 'FLUX') {
      ew.t += dt / ew.dur;
      while (ew.t >= 1 && ew.curveIdx < ew.curves.length - 1) {
        ew.t -= 1;
        ew.curveIdx++;
      }
      if (ew.t >= 1) {
        finished = true;
      } else {
        const pos = evalCubic(ew.curves[ew.curveIdx], ew.t);
        ew.x = pos.x;
        ew.y = pos.y;
        if (Math.hypot(ew.x - prevX, ew.y - prevY) > 0.1) {
          ew.angle = Math.atan2(ew.y - prevY, ew.x - prevX);
        }
      }
    } else {
      let moveLeft = ew.speed * dt;
      while (moveLeft > 0 && ew.wpIndex < ew.waypoints.length) {
        const wp = ew.waypoints[ew.wpIndex];
        const dx = wp.x - ew.x;
        const dy = wp.y - ew.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= moveLeft) {
          const cornerX = ew.x;
          const cornerY = ew.y;
          ew.x = wp.x;
          ew.y = wp.y;
          moveLeft -= dist;
          ew.wpIndex++;
          if (Math.hypot(ew.x - ew.prevX, ew.y - ew.prevY) > 2) {
            ew.trail.segments.push({
              x1: ew.prevX,
              y1: ew.prevY,
              x2: ew.x,
              y2: ew.y,
              life: THREAD_LIFETIME
            });
            ew.prevX = ew.x;
            ew.prevY = ew.y;
          }
          if (Math.hypot(wp.x - cornerX, wp.y - cornerY) > 0.1) {
            ew.angle = Math.atan2(wp.y - cornerY, wp.x - cornerX);
          }
        } else {
          ew.x += (dx / dist) * moveLeft;
          ew.y += (dy / dist) * moveLeft;
          ew.angle = Math.atan2(dy, dx);
          moveLeft = 0;
        }
      }
      if (ew.wpIndex >= ew.waypoints.length) {
        finished = true;
      }
    }

    // Emit Thread segment as Enforcer Wing travels
    if (!finished && Math.hypot(ew.x - ew.prevX, ew.y - ew.prevY) >= 12) {
      ew.trail.segments.push({
        x1: ew.prevX,
        y1: ew.prevY,
        x2: ew.x,
        y2: ew.y,
        life: THREAD_LIFETIME
      });
      ew.prevX = ew.x;
      ew.prevY = ew.y;
    }

    // Direct Enforcer Wing collision with player ship
    if (
      !finished &&
      p.alive &&
      !p.capturedById &&
      p.invulnTimer <= 0 &&
      Math.hypot(ew.x - p.x, ew.y - p.y) < (p.dual ? 24 : 16)
    ) {
      game.damagePlayer();
      game.spawnDeleteBurst(ew.x, ew.y, ew.variant === 'NULL' ? COLORS.nullRed : COLORS.cyan, 12, 135);
      game.enforcerWings.splice(i, 1);
      continue;
    }

    if (finished) {
      game.enforcerWings.splice(i, 1);
    }
  }

  // 2) Decay Thread segments & check player touch debuffs
  for (let ti = game.threadTrails.length - 1; ti >= 0; ti--) {
    const trail = game.threadTrails[ti];
    if (trail.flashTimer > 0) trail.flashTimer = Math.max(0, trail.flashTimer - dt);

    for (let si = trail.segments.length - 1; si >= 0; si--) {
      const seg = trail.segments[si];
      seg.life -= dt;
      if (seg.life <= 0) {
        trail.segments.splice(si, 1);
        continue;
      }
      if (p.alive && !p.capturedById) {
        if (distToSeg(p.x, p.y, seg.x1, seg.y1, seg.x2, seg.y2) < (p.dual ? 20 : 14)) {
          game.applyThreadDebuff(trail.variant);
        }
      }
    }

    const ownedByActiveWing = game.enforcerWings.some(ew => ew.trail === trail);
    if (trail.segments.length === 0 && !ownedByActiveWing) {
      game.threadTrails.splice(ti, 1);
    }
  }
}
