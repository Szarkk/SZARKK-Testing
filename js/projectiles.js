/* =========================================================================
   PROJECTILES: BULLETS, CYAN HOMING MISSILES, RED LASER BEAM & PURPLE ARC WAVES
   ========================================================================= */

import {
  ARC_WAVE_DMG,
  ARC_WAVE_SPEED,
  CANNON_AOE_RADIUS,
  CANNON_SHOT_SPEED,
  CHAIN_LIGHTNING_DMG,
  CHAIN_LIGHTNING_JUMP_RANGE,
  CHAIN_LIGHTNING_MAX_JUMPS,
  CHAIN_LIGHTNING_RANGE,
  CLONE_FIRE_COOLDOWN,
  CLONE_IFRAMES,
  COLORS,
  FIRE_COOLDOWN,
  FLUX_THREAD_BULLET_SLOW,
  HOMING_MISSILE_SPEED,
  LOGICAL_H,
  LOGICAL_W,
  PLAYER_BULLET_SPEED,
  PLAYER_MAX_Y,
  PLAYER_MIN_Y,
  PULSAR_JAM_DUR,
  PULSAR_SPARK_SLOW_DUR,
  RED_LASER_DRAIN_PER_SEC,
  RED_LASER_THREAD_CHIP,
  RED_LASER_TICK_DMG,
  RED_LASER_TICK_MULT,
  SLOWED_BULLET_DISSOLVE_TIME
} from './config.js';
import { clamp, distToSeg, lerp, verticalRaySegIntersectY } from './utils.js';
import {
  consumePowerupEnergy,
  destroyAndCollectCapsule,
  hasPowerup,
  removePowerupSlot
} from './powerups.js';
import { getPlayerDamageMult, getPlayerFireCooldownMult, getPlayerMoveSpeedMult } from './player.js';
import { damageEnforcerWing, shatterThreadTrail } from './enforcers.js';
import { damageEnemy } from './enemies.js';

export function spawnArcWaveFromPlayer(game) {
  const p = game.player;
  if (!p.alive || p.capturedById) return;
  const baseDmg = getPlayerDamageMult(game);
  const weakened = baseDmg < 0.999;

  game.arcWaves.push({
    x: p.x,
    y: p.y - 20,
    vy: -ARC_WAVE_SPEED,
    radius: p.dual ? 86 : 68,
    maxRadius: p.dual ? 132 : 108,
    dmg: baseDmg * ARC_WAVE_DMG,
    weakened,
    hitEnemyIds: new Set(),
    hitEnforcerWings: new Set(),
    hitThreadIds: new Set()
  });
  game.synth.playArcWave();
}

export function fireCannonShot(game) {
  const p = game.player;
  if (!p.alive || p.capturedById) return;
  const baseDmg = getPlayerDamageMult(game);

  game.cannonShots.push({
    x: p.x,
    y: p.y - 24,
    vy: -CANNON_SHOT_SPEED,
    dmg: baseDmg * 4.0,
    radius: 13,
    aoeRadius: CANNON_AOE_RADIUS,
    trail: []
  });
  game.shotsFired++;
  game.shake = 0.16;
  game.synth.playArcWave();
  game.spawnPopup(p.x, p.y - 36, 'CANNON SHOT!', COLORS.purpleBright, 1.2);
}

export function detonateCannonShot(game, x, y, dmg, aoeRadius) {
  game.aoeBlasts.push({
    x,
    y,
    radius: 14,
    maxRadius: aoeRadius,
    life: 0.48,
    maxLife: 0.48
  });
  game.shake = 0.34;
  game.hitStop = 0.04;
  game.synth.playCannonBoom();
  game.spawnDeleteBurst(x, y, COLORS.purpleBright, 34, 260);
  game.spawnDeleteBurst(x, y, COLORS.purple, 22, 195);

  // Void all enemy projectiles inside the AOE blast
  for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
    const eb = game.enemyBullets[i];
    if (Math.hypot(eb.x - x, eb.y - y) <= aoeRadius) {
      game.spawnDeleteBurst(eb.x, eb.y, COLORS.purpleBright, 4, 80);
      game.enemyBullets.splice(i, 1);
    }
  }

  // Shatter any Thread trails caught inside the AOE blast
  for (let ti = game.threadTrails.length - 1; ti >= 0; ti--) {
    const trail = game.threadTrails[ti];
    let inside = false;
    for (const seg of trail.segments) {
      if (distToSeg(x, y, seg.x1, seg.y1, seg.x2, seg.y2) <= aoeRadius) {
        inside = true;
        break;
      }
    }
    if (inside) {
      shatterThreadTrail(game, ti, x, y, COLORS.purpleBright);
    }
  }

  // Damage all Enforcer Wings inside the AOE blast
  for (let li = game.enforcerWings.length - 1; li >= 0; li--) {
    const ew = game.enforcerWings[li];
    if (Math.hypot(ew.x - x, ew.y - y) <= aoeRadius + 14) {
      game.shotsHit++;
      damageEnforcerWing(game, li, dmg);
    }
  }

  // Damage all Enemies inside the AOE blast
  for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
    const e = game.enemies[ei];
    if (Math.hypot(e.x - x, e.y - y) <= aoeRadius + e.hitRadius) {
      game.shotsHit++;
      damageEnemy(game, ei, dmg, e.x, e.y, COLORS.purpleBright);
    }
  }

  // Pop any floating capsules caught inside the AOE blast
  for (let ci = game.capsules.length - 1; ci >= 0; ci--) {
    const cap = game.capsules[ci];
    if (Math.hypot(cap.x - x, cap.y - y) <= aoeRadius + cap.hitRadius) {
      destroyAndCollectCapsule(game, ci);
    }
  }
}

/**
 * CYAN POWER-UP — Homing Missiles:
 * 2x shot count per glider, assigns different enemies across the volley,
 * breaks Null Threads in 1 hit, and deals 1.3x damage to Elite/Master Enforcers [Null].
 */
export function fireHomingMissiles(game, shipOffsets, baseDmg, weakened) {
  const p = game.player;
  const candidates = [];
  for (const cap of game.capsules) {
    if (cap.y > -24 && cap.y < LOGICAL_H - 20) candidates.push({ kind: 'CAPSULE', ref: cap });
  }
  for (const e of game.enemies) {
    if (e.y > -24 && e.y < LOGICAL_H - 20) candidates.push({ kind: 'ENEMY', ref: e });
  }
  for (const ew of game.enforcerWings) {
    candidates.push({ kind: 'ENFORCER_WING', ref: ew });
  }
  candidates.sort((a, b) => Math.hypot(a.ref.x - p.x, a.ref.y - p.y) - Math.hypot(b.ref.x - p.x, b.ref.y - p.y));

  let targetCursor = 0;
  for (const ox of shipOffsets) {
    const pairSpread = [-1, 1];
    for (const side of pairSpread) {
      const targetObj = candidates.length > 0
        ? candidates[targetCursor % candidates.length]
        : null;
      targetCursor++;

      const startX = p.x + ox + side * 8;
      const startY = p.y - 14;
      const initAngle = -Math.PI / 2 + side * 0.34;
      game.homingMissiles.push({
        x: startX,
        y: startY,
        vx: Math.cos(initAngle) * HOMING_MISSILE_SPEED,
        vy: Math.sin(initAngle) * HOMING_MISSILE_SPEED,
        angle: initAngle,
        dmg: baseDmg,
        weakened,
        targetKind: targetObj ? targetObj.kind : null,
        targetRef: targetObj ? targetObj.ref : null,
        life: 3.0,
        trail: []
      });
      game.shotsFired++;
    }
  }
  game.synth.playMissileLaunch();
}

/**
 * RED POWER-UP — High-Frequency Piercing Continuous Straight Laser Beam:
 * Shoots straight through ALL enemy ships, Enforcer Wings & capsules!
 * Deals 0.1 base dmg @ 20x tick rate (~121 ticks/sec = identical 2.0 dmg/cycle per glider)
 * so rapid mobile swipes never phase through targets.
 * Stopped ONLY by crimson Null Threads (chips -0.05/tick = same ~1s shatter) or cyan Flux
 * Threads (converts into slowed red laser-bullets that dissolve after 2.0s).
 */
export function updateContinuousLaserBeams(game, dt = 0) {
  const p = game.player;
  if (
    !p.alive ||
    p.capturedById ||
    !hasPowerup(game, 'RED') ||
    !game.redLaserActive
  ) {
    p.laserTickCooldown = 0;
    p.laserFxCooldown = 0;
    game.activeLaserBeams = [];
    return;
  }

  const baseDmg = getPlayerDamageMult(game);
  const weakened = baseDmg < 0.999;
  const fireMult = getPlayerFireCooldownMult(game);
  const tickInterval = (FIRE_COOLDOWN * fireMult) / RED_LASER_TICK_MULT; // 0.00825s (~121 ticks/sec), 1.5x slower in Cyan Field
  const shipOffsets = p.dual ? [-14, 14] : [0];

  // Accumulate exact sub-ticks so 30Hz, 60Hz & 120Hz all produce identical DPS with zero swipe phasing
  p.laserTickCooldown -= dt;
  let tickMult = 0;
  if (p.laserTickCooldown <= 0) {
    tickMult = 1;
    p.laserTickCooldown += tickInterval;
    while (p.laserTickCooldown <= 0 && tickMult < 8) {
      tickMult++;
      p.laserTickCooldown += tickInterval;
    }
    if (p.laserTickCooldown < 0) p.laserTickCooldown = 0;
  }

  const shouldDamageTick = tickMult > 0;
  const shouldFxTick = p.laserFxCooldown <= 0;
  if (shouldFxTick) {
    p.laserFxCooldown = FIRE_COOLDOWN * fireMult; // Standard cadence for laser pulse SFX, refracted bolts & accuracy ticks
  }

  const tickBeamDmg = baseDmg * RED_LASER_TICK_DMG * tickMult; // 0.1 dmg per rapid tick (exact 2.0 dmg per 0.165s)
  const refractBoltDmg = baseDmg * 2.0; // Full 2.0 dmg per refracted Flux Thread red bolt
  const quietTick = !shouldFxTick;

  game.activeLaserBeams = [];

  for (const ox of shipOffsets) {
    const beamX = p.x + ox;
    const beamBottomY = p.y - 16;
    let stopY = 0;
    let threadBlock = null; // { y, kind: 'NULL_THREAD' | 'FLUX_THREAD', idx, trailId }

    // 1) Find the closest Thread blocking or refracting this glider's beam
    for (let ti = game.threadTrails.length - 1; ti >= 0; ti--) {
      const trail = game.threadTrails[ti];
      let hitSegY = null;
      for (const seg of trail.segments) {
        const yCross = verticalRaySegIntersectY(beamX, beamBottomY, seg.x1, seg.y1, seg.x2, seg.y2);
        if (yCross !== null && (hitSegY === null || yCross > hitSegY)) {
          hitSegY = yCross;
        }
      }
      if (hitSegY !== null && (!threadBlock || hitSegY > threadBlock.y)) {
        threadBlock = {
          y: hitSegY,
          kind: trail.variant === 'NULL' ? 'NULL_THREAD' : 'FLUX_THREAD',
          idx: ti,
          trailId: trail.id
        };
      }
    }

    if (threadBlock) {
      stopY = threadBlock.y;
    }

    // 2) Pop any floating Power-Up Capsules pierced by the beam (stacks without canceling laser)
    for (let ci = game.capsules.length - 1; ci >= 0; ci--) {
      const cap = game.capsules[ci];
      if (cap.y <= beamBottomY && cap.y >= stopY && Math.abs(cap.x - beamX) <= cap.hitRadius + 4) {
        game.shotsHit++;
        destroyAndCollectCapsule(game, ci);
      }
    }

    const impacts = [];

    // 3) Pierce ALL Enforcer Wings along the beam segment [stopY .. beamBottomY]
    for (let li = game.enforcerWings.length - 1; li >= 0; li--) {
      const ew = game.enforcerWings[li];
      if (ew.y <= beamBottomY && ew.y >= stopY && Math.abs(ew.x - beamX) <= 18) {
        impacts.push(ew.y);
        if (shouldDamageTick) {
          if (shouldFxTick) game.shotsHit++;
          damageEnforcerWing(game, li, tickBeamDmg, quietTick);
        }
      }
    }

    // 4) Pierce ALL Enemy Ships along the beam segment [stopY .. beamBottomY]
    for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
      const e = game.enemies[ei];
      const beamHalfW = e.hitRadius + 5;
      if (e.y <= beamBottomY && e.y >= stopY && Math.abs(e.x - beamX) <= beamHalfW) {
        impacts.push(e.y);
        if (shouldDamageTick) {
          if (shouldFxTick) game.shotsHit++;
          const isFluxBoss = e.type === 'FLUX_ENFORCER' || e.type === 'MASTER_FLUX_ENFORCER';
          const isNormalTier = e.type === 'DRONE' || e.type === 'INTERCEPTOR';
          const finalDmg = isNormalTier
            ? tickBeamDmg * 2.0
            : (isFluxBoss ? tickBeamDmg * 1.3 : tickBeamDmg);
          damageEnemy(
            game,
            ei,
            finalDmg,
            beamX,
            e.y,
            isFluxBoss ? COLORS.nullRed : COLORS.white,
            quietTick
          );
        }
      }
    }

    // 5) Resolve Thread interaction:
    //    - Null Red Thread chips proportionally on every rapid tick (same ~1s / 6-hit shatter)
    //    - Flux Cyan Thread refracts slowed red bolts on the normal FX cadence (no bullet spam)
    if (shouldFxTick) {
      game.shotsFired++;
    }
    if (threadBlock) {
      if (threadBlock.kind === 'NULL_THREAD' && shouldDamageTick) {
        const trail = game.threadTrails[threadBlock.idx];
        if (trail && trail.id === threadBlock.trailId) {
          trail.hitsRemaining -= RED_LASER_THREAD_CHIP * tickMult;
          trail.flashTimer = 0.14;
          if (trail.hitsRemaining <= 0.001) {
            shatterThreadTrail(game, threadBlock.idx, beamX, stopY, COLORS.nullRed);
          } else if (shouldFxTick) {
            game.synth.playThreadDeflect();
            game.spawnDeleteBurst(beamX, stopY, COLORS.amber, 5, 95);
          }
        }
      } else if (threadBlock.kind === 'FLUX_THREAD' && shouldFxTick) {
        // Beam refracts through cyan Flux Thread into slowed red bullets that dissolve after 2.0s!
        game.playerBullets.push({
          x: beamX,
          y: stopY - 6,
          vy: -PLAYER_BULLET_SPEED / FLUX_THREAD_BULLET_SLOW,
          dmg: refractBoltDmg,
          weakened,
          purple: false,
          redLaserBullet: true,
          slowedByFlux: true,
          dissolveTimer: SLOWED_BULLET_DISSOLVE_TIME,
          dissolveMax: SLOWED_BULLET_DISSOLVE_TIME
        });
        game.synth.playShotSlow();
        game.spawnDeleteBurst(beamX, stopY, COLORS.nullRed, 4, 68);
      }
    }

    game.activeLaserBeams.push({
      offsetX: ox,
      x: beamX,
      y1: beamBottomY,
      y2: stopY,
      weakened,
      hit: !!threadBlock,
      hitColor: threadBlock && threadBlock.kind === 'FLUX_THREAD' ? COLORS.cyan : COLORS.nullRed,
      impacts
    });
  }

  if (shouldFxTick) {
    game.synth.playContinuousLaserTick();
  }

  // Drain Red Laser slot ONLY while actively firing (single rate even in Dual-Fighter!)
  if (dt > 0) {
    consumePowerupEnergy(game, 'RED', RED_LASER_DRAIN_PER_SEC * dt);
  }
}

export function updateArcWavesAndCannon(game, dt) {
  const aw = game.arcWaveState;
  if (aw.auraFade > 0) aw.auraFade = Math.max(0, aw.auraFade - dt);

  // Double-tap Cannon Overcharge: 3.0s auto-fire fallback if user doesn't tap a 2nd time
  if (aw.phase === 'CANNON_CHARGING' && game.player.alive && !game.player.capturedById) {
    aw.cannonTimer -= dt;
    if (Math.random() < 0.35) {
      game.spawnDeleteBurst(
        game.player.x + (Math.random() - 0.5) * 26,
        game.player.y + (Math.random() - 0.5) * 20,
        COLORS.purpleBright,
        1,
        55
      );
    }
    if (aw.cannonTimer <= 0) {
      fireCannonShot(game);
      aw.auraFade = 0.55;
      removePowerupSlot(game, 'PURPLE', true);
    }
  }

  // Update active wider Arc Waves (void enemy projectiles + regular bullet damage)
  for (let i = game.arcWaves.length - 1; i >= 0; i--) {
    const w = game.arcWaves[i];
    w.y += w.vy * dt;
    w.radius = Math.min(w.maxRadius, w.radius + 48 * dt);

    if (w.y < -50) {
      game.arcWaves.splice(i, 1);
      continue;
    }

    // 1) Void enemy projectiles on contact
    for (let bi = game.enemyBullets.length - 1; bi >= 0; bi--) {
      const eb = game.enemyBullets[bi];
      const dx = eb.x - w.x;
      const dy = eb.y - w.y;
      if (Math.abs(dx) <= w.radius + 6 && dy >= -24 && dy <= 18) {
        game.spawnDeleteBurst(eb.x, eb.y, COLORS.purpleBright, 6, 95);
        game.synth.playProjectileVoid();
        game.enemyBullets.splice(bi, 1);
      }
    }

    // 2) Chip Null Threads once per wave
    for (let ti = game.threadTrails.length - 1; ti >= 0; ti--) {
      const trail = game.threadTrails[ti];
      if (trail.variant !== 'NULL' || w.hitThreadIds.has(trail.id)) continue;
      let touched = false;
      for (const seg of trail.segments) {
        if (distToSeg(w.x, w.y, seg.x1, seg.y1, seg.x2, seg.y2) <= w.radius * 0.72) {
          touched = true;
          break;
        }
      }
      if (touched) {
        w.hitThreadIds.add(trail.id);
        trail.hitsRemaining -= 1;
        trail.flashTimer = 0.14;
        if (trail.hitsRemaining <= 0) {
          shatterThreadTrail(game, ti, w.x, w.y, COLORS.nullRed);
        } else {
          game.synth.playThreadDeflect();
        }
      }
    }

    // 3) Damage Enforcer Wings
    for (let li = game.enforcerWings.length - 1; li >= 0; li--) {
      const ew = game.enforcerWings[li];
      if (w.hitEnforcerWings.has(ew)) continue;
      if (Math.abs(ew.x - w.x) <= w.radius + 10 && Math.abs(ew.y - w.y) <= 22) {
        w.hitEnforcerWings.add(ew);
        damageEnforcerWing(game, li, w.dmg);
      }
    }

    // 4) Damage Enemies
    for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
      const e = game.enemies[ei];
      if (w.hitEnemyIds.has(e.id)) continue;
      if (Math.abs(e.x - w.x) <= w.radius + e.hitRadius * 0.7 && Math.abs(e.y - w.y) <= e.hitRadius + 16) {
        w.hitEnemyIds.add(e.id);
        damageEnemy(game, ei, w.dmg, e.x, e.y, COLORS.purpleBright);
      }
    }

    // 5) Pop floating Power-Up Capsules swept by the Arc Wave
    for (let ci = game.capsules.length - 1; ci >= 0; ci--) {
      const cap = game.capsules[ci];
      if (Math.abs(cap.x - w.x) <= w.radius + cap.hitRadius * 0.7 && Math.abs(cap.y - w.y) <= cap.hitRadius + 16) {
        destroyAndCollectCapsule(game, ci);
      }
    }
  }

  // Update Purple Cannon Shots -> explode in large AOE on hit or upper formation
  for (let i = game.cannonShots.length - 1; i >= 0; i--) {
    const c = game.cannonShots[i];
    c.y += c.vy * dt;
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > 9) c.trail.shift();

    let detonated = false;
    for (const ew of game.enforcerWings) {
      if (Math.hypot(c.x - ew.x, c.y - ew.y) <= c.radius + 16) {
        detonated = true;
        break;
      }
    }
    if (!detonated) {
      for (const e of game.enemies) {
        if (Math.hypot(c.x - e.x, c.y - e.y) <= c.radius + e.hitRadius) {
          detonated = true;
          break;
        }
      }
    }
    if (!detonated) {
      for (const cap of game.capsules) {
        if (Math.hypot(c.x - cap.x, c.y - cap.y) <= c.radius + cap.hitRadius) {
          detonated = true;
          break;
        }
      }
    }
    if (!detonated && c.y <= 155) {
      detonated = true;
    }

    if (detonated) {
      detonateCannonShot(game, c.x, c.y, c.dmg, c.aoeRadius);
      game.cannonShots.splice(i, 1);
    } else if (c.y < -40) {
      game.cannonShots.splice(i, 1);
    }
  }

  // Update expanding AOE blast shockwaves
  for (let i = game.aoeBlasts.length - 1; i >= 0; i--) {
    const bl = game.aoeBlasts[i];
    bl.life -= dt;
    const prog = clamp(1 - bl.life / bl.maxLife, 0, 1);
    bl.radius = lerp(18, bl.maxRadius, 1 - Math.pow(1 - prog, 2.6));
    if (bl.life <= 0) game.aoeBlasts.splice(i, 1);
  }
}

export function updatePlayerBullets(game, dt) {
  for (let i = game.playerBullets.length - 1; i >= 0; i--) {
    const b = game.playerBullets[i];
    b.y += b.vy * dt;

    // Bullets slowed by a cyan Flux Thread dissolve after 2.0 seconds
    if (b.slowedByFlux) {
      b.dissolveTimer -= dt;
      if (b.dissolveTimer <= 0) {
        game.spawnDeleteBurst(b.x, b.y, b.redLaserBullet ? COLORS.nullRed : COLORS.cyan, 3, 45);
        game.playerBullets.splice(i, 1);
        continue;
      }
    }

    if (b.y < -20) {
      game.playerBullets.splice(i, 1);
      continue;
    }

    let removed = false;

    // 1) Check Threads
    for (let ti = game.threadTrails.length - 1; ti >= 0; ti--) {
      const trail = game.threadTrails[ti];
      let hitThread = false;
      for (const seg of trail.segments) {
        if (distToSeg(b.x, b.y, seg.x1, seg.y1, seg.x2, seg.y2) < 9) {
          hitThread = true;
          break;
        }
      }
      if (hitThread) {
        if (trail.variant === 'FLUX') {
          if (!b.slowedByFlux) {
            b.slowedByFlux = true;
            b.vy /= FLUX_THREAD_BULLET_SLOW;
            b.dissolveTimer = SLOWED_BULLET_DISSOLVE_TIME;
            b.dissolveMax = SLOWED_BULLET_DISSOLVE_TIME;
            game.synth.playShotSlow();
            game.spawnDeleteBurst(b.x, b.y, COLORS.cyan, 4, 55);
          }
        } else {
          // Crimson Null Threads block regular/purple/laser-bolt shots (6 hits to shatter)
          trail.hitsRemaining -= 1;
          trail.flashTimer = 0.14;
          removed = true;
          if (trail.hitsRemaining <= 0) {
            shatterThreadTrail(game, ti, b.x, b.y, COLORS.nullRed);
          } else {
            game.synth.playThreadDeflect();
            game.spawnDeleteBurst(b.x, b.y, COLORS.amber, 5, 95);
          }
          break;
        }
      }
    }
    if (removed) {
      game.playerBullets.splice(i, 1);
      continue;
    }

    // 2) Friendly-fire against Captured Fighter (respect brief capture grace)
    if (
      game.capturedFighter &&
      game.capturedFighter.friendlyFireGrace <= 0 &&
      Math.hypot(b.x - game.capturedFighter.x, b.y - game.capturedFighter.y) < 15
    ) {
      const owner = game.enemies.find(e => e.id === game.capturedFighter.ownerId);
      if (owner) owner.hasCapturedShip = false;
      game.spawnDeleteBurst(game.capturedFighter.x, game.capturedFighter.y, '#ffffff', 22, 190);
      game.spawnPopup(game.capturedFighter.x, game.capturedFighter.y, 'CAPTURED SHIP DESTROYED', COLORS.nullRed, 1.3);
      game.capturedFighter = null;
      game.synth.playDeleteBurst(true);
      game.playerBullets.splice(i, 1);
      continue;
    }

    // 2b) Destructible floating Power-Up Capsules (shoot to break & activate)
    for (let ci = game.capsules.length - 1; ci >= 0; ci--) {
      const cap = game.capsules[ci];
      if (Math.hypot(b.x - cap.x, b.y - cap.y) < cap.hitRadius) {
        game.shotsHit++;
        destroyAndCollectCapsule(game, ci);
        removed = true;
        break;
      }
    }
    if (removed) {
      game.playerBullets.splice(i, 1);
      continue;
    }

    // 3) Check Enforcer Wings
    for (let li = game.enforcerWings.length - 1; li >= 0; li--) {
      const ew = game.enforcerWings[li];
      if (Math.hypot(b.x - ew.x, b.y - ew.y) < 16) {
        game.shotsHit++;
        damageEnforcerWing(game, li, b.dmg);
        removed = true;
        break;
      }
    }
    if (removed) {
      game.playerBullets.splice(i, 1);
      continue;
    }

    // 4) Check Enemies
    for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
      const e = game.enemies[ei];
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.hitRadius) {
        game.shotsHit++;
        const isFluxBoss = e.type === 'FLUX_ENFORCER' || e.type === 'MASTER_FLUX_ENFORCER';
        const isNormalTier = e.type === 'DRONE' || e.type === 'INTERCEPTOR';
        const finalDmg = b.redLaserBullet
          ? (isNormalTier ? b.dmg * 2.0 : (isFluxBoss ? b.dmg * 1.3 : b.dmg))
          : b.dmg;
        damageEnemy(game, ei, finalDmg, b.x, b.y, b.redLaserBullet ? COLORS.nullRed : COLORS.white);
        removed = true;
        break;
      }
    }
    if (removed) {
      game.playerBullets.splice(i, 1);
    }
  }
}

export function updateHomingMissiles(game, dt) {
  for (let i = game.homingMissiles.length - 1; i >= 0; i--) {
    const m = game.homingMissiles[i];
    m.life -= dt;

    let validTarget = null;
    if (m.targetKind === 'CAPSULE' && game.capsules.includes(m.targetRef)) {
      validTarget = m.targetRef;
    } else if (m.targetKind === 'ENEMY' && game.enemies.includes(m.targetRef)) {
      validTarget = m.targetRef;
    } else if (m.targetKind === 'ENFORCER_WING' && game.enforcerWings.includes(m.targetRef)) {
      validTarget = m.targetRef;
    } else {
      let bestD = Infinity;
      for (const cap of game.capsules) {
        const d = Math.hypot(cap.x - m.x, cap.y - m.y);
        if (d < bestD) {
          bestD = d;
          validTarget = cap;
          m.targetKind = 'CAPSULE';
          m.targetRef = cap;
        }
      }
      for (const e of game.enemies) {
        const d = Math.hypot(e.x - m.x, e.y - m.y);
        if (d < bestD) {
          bestD = d;
          validTarget = e;
          m.targetKind = 'ENEMY';
          m.targetRef = e;
        }
      }
      for (const ew of game.enforcerWings) {
        const d = Math.hypot(ew.x - m.x, ew.y - m.y);
        if (d < bestD) {
          bestD = d;
          validTarget = ew;
          m.targetKind = 'ENFORCER_WING';
          m.targetRef = ew;
        }
      }
    }

    if (validTarget) {
      const desired = Math.atan2(validTarget.y - m.y, validTarget.x - m.x);
      let diff = desired - m.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = 7.8 * dt;
      m.angle += clamp(diff, -maxTurn, maxTurn);
    }

    m.vx = Math.cos(m.angle) * HOMING_MISSILE_SPEED;
    m.vy = Math.sin(m.angle) * HOMING_MISSILE_SPEED;
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 12) m.trail.shift();

    if (m.life <= 0 || m.y < -30 || m.y > LOGICAL_H + 30 || m.x < -30 || m.x > LOGICAL_W + 30) {
      game.homingMissiles.splice(i, 1);
      continue;
    }

    let removed = false;

    // 1) Breaks crimson Null Threads in ONE HIT
    for (let ti = game.threadTrails.length - 1; ti >= 0; ti--) {
      const trail = game.threadTrails[ti];
      if (trail.variant !== 'NULL') continue;
      let hitNullThread = false;
      for (const seg of trail.segments) {
        if (distToSeg(m.x, m.y, seg.x1, seg.y1, seg.x2, seg.y2) < 11) {
          hitNullThread = true;
          break;
        }
      }
      if (hitNullThread) {
        shatterThreadTrail(game, ti, m.x, m.y, COLORS.nullRed);
        removed = true;
        break;
      }
    }
    if (removed) {
      game.homingMissiles.splice(i, 1);
      continue;
    }

    // 2) Check Enforcer Wings
    for (let li = game.enforcerWings.length - 1; li >= 0; li--) {
      const ew = game.enforcerWings[li];
      if (Math.hypot(m.x - ew.x, m.y - ew.y) < 18) {
        game.shotsHit++;
        damageEnforcerWing(game, li, m.dmg);
        removed = true;
        break;
      }
    }
    if (removed) {
      game.homingMissiles.splice(i, 1);
      continue;
    }

    // 2b) Check destructible floating Power-Up Capsules
    for (let ci = game.capsules.length - 1; ci >= 0; ci--) {
      const cap = game.capsules[ci];
      if (Math.hypot(m.x - cap.x, m.y - cap.y) < cap.hitRadius) {
        game.shotsHit++;
        destroyAndCollectCapsule(game, ci);
        removed = true;
        break;
      }
    }
    if (removed) {
      game.homingMissiles.splice(i, 1);
      continue;
    }

    // 3) Check Enemies (1.3x damage bonus against Elite & Master Enforcers [Null])
    for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
      const e = game.enemies[ei];
      if (Math.hypot(m.x - e.x, m.y - e.y) < e.hitRadius + 3) {
        game.shotsHit++;
        const isNullBoss = e.type === 'NULL_ENFORCER' || e.type === 'MASTER_NULL_ENFORCER';
        const finalDmg = isNullBoss ? m.dmg * 1.3 : m.dmg;
        damageEnemy(game, ei, finalDmg, m.x, m.y, COLORS.cyan);
        removed = true;
        break;
      }
    }
    if (removed) {
      game.homingMissiles.splice(i, 1);
    }
  }
}

function buildLightningPath(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(3, Math.min(8, Math.round(dist / 22)));
  const nx = dist > 0.1 ? -dy / dist : 1;
  const ny = dist > 0.1 ? dx / dist : 0;
  const pts = [{ x: x1, y: y1 }];
  for (let s = 1; s < steps; s++) {
    const f = s / steps;
    const jitter = (Math.random() - 0.5) * 18;
    pts.push({ x: x1 + dx * f + nx * jitter, y: y1 + dy * f + ny * jitter });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

function inFront270Arc(dx, dy) {
  // Screen-space straight down (rear) is +PI/2 (+90 deg).
  // Front 270-degree arc excludes ONLY the rear 90-degree wedge (+45 deg .. +135 deg).
  if (dx === 0 && dy === 0) return true;
  const ang = Math.atan2(dy, dx);
  return !(ang > Math.PI * 0.25 && ang < Math.PI * 0.75);
}

/**
 * YELLOW POWER-UP — Chain Lightning (Reworked):
 * Fires 3 individual lightning bolt lines over 0.50s (1 shot each = 3 ammo, 0.80s cooldown)
 * across a front 270-degree radius (~4 fighters = 152px, edge-to-edge);
 * each bolt independently prefers an unhit target inside the arc (enemies, Enforcer Wings,
 * capsules, AND enemy bullets), deals 1.0 base dmg, and chains edge-to-edge (118px) to +4 targets!
 */
export function fireChainLightning(game, shipOffsets, baseDmg, _weakened, boltIdx = 0, burstExcludeSet = null) {
  const p = game.player;
  const dmg = baseDmg * CHAIN_LIGHTNING_DMG;
  // Randomized forward-hull emitter jitter so bolts spark out organically rather than on a fixed grid
  const emitX = (Math.random() - 0.5) * 14;
  const emitY = -4 - Math.random() * 7;

  for (const ox of shipOffsets) {
    const startX = p.x + ox + emitX;
    const startY = p.y + emitY;
    const noseY = p.y - 16;
    game.shotsFired++;

    // 1) Find closest primary target inside the front 270-degree radius (edge-to-edge!),
    //    strongly preferring a fresh target not yet picked by an earlier bolt in this 3-bolt salvo.
    let bestFresh = null;
    let bestFreshDist = CHAIN_LIGHTNING_RANGE;
    let bestAny = null;
    let bestAnyDist = CHAIN_LIGHTNING_RANGE;

    const considerPrimary = (kind, ref, tx, ty, r) => {
      const dx = tx - startX;
      const dy = ty - startY;
      if (!inFront270Arc(dx, dy)) return;
      const edgeDist = Math.max(0, Math.hypot(dx, dy) - r);
      if (edgeDist > CHAIN_LIGHTNING_RANGE) return;

      const alreadyUsed = burstExcludeSet && burstExcludeSet.has(ref);
      if (!alreadyUsed && edgeDist <= bestFreshDist) {
        bestFreshDist = edgeDist;
        bestFresh = { kind, ref, x: tx, y: ty, radius: r };
      }
      if (edgeDist <= bestAnyDist) {
        bestAnyDist = edgeDist;
        bestAny = { kind, ref, x: tx, y: ty, radius: r };
      }
    };

    for (const e of game.enemies) {
      considerPrimary('ENEMY', e, e.x, e.y, e.hitRadius);
    }
    for (const ew of game.enforcerWings) {
      considerPrimary('ENFORCER_WING', ew, ew.x, ew.y, 14);
    }
    for (const cap of game.capsules) {
      considerPrimary('CAPSULE', cap, cap.x, cap.y, cap.hitRadius);
    }
    for (const eb of game.enemyBullets) {
      considerPrimary('ENEMY_BULLET', eb, eb.x, eb.y, 6);
    }

    const primary = bestFresh || bestAny;
    if (primary && burstExcludeSet) {
      burstExcludeSet.add(primary.ref);
    }

    if (!primary) {
      // No target in 270-degree radius: check if a crimson Null Thread lies straight ahead to chip it
      const endY = Math.max(8, noseY - CHAIN_LIGHTNING_RANGE);
      let blockedY = endY;
      let blockedTrailIdx = -1;
      for (let ti = game.threadTrails.length - 1; ti >= 0; ti--) {
        const trail = game.threadTrails[ti];
        if (trail.variant !== 'NULL') continue;
        for (const seg of trail.segments) {
          const yCross = verticalRaySegIntersectY(startX, noseY, seg.x1, seg.y1, seg.x2, seg.y2);
          if (yCross !== null && yCross >= endY && yCross > blockedY) {
            blockedY = yCross;
            blockedTrailIdx = ti;
          }
        }
      }
      if (blockedTrailIdx >= 0) {
        const trail = game.threadTrails[blockedTrailIdx];
        if (trail) {
          trail.hitsRemaining -= 1;
          trail.flashTimer = 0.14;
          if (trail.hitsRemaining <= 0.001) {
            shatterThreadTrail(game, blockedTrailIdx, startX, blockedY, COLORS.nullRed);
          } else {
            game.synth.playThreadDeflect();
          }
        }
        game.lightningBolts.push({
          segments: [buildLightningPath(startX, noseY, startX, blockedY)],
          life: 0.28,
          maxLife: 0.28
        });
      } else {
        // Organic, randomized real-lightning discharge across the front 270-degree arc (never clockwork!)
        const recentAngles = Array.isArray(game._recentLightningAngles) ? game._recentLightningAngles : [];
        let arcAngle = -Math.PI * 0.5 + (Math.random() - 0.5) * (Math.PI * 1.44);
        let bestCandidate = arcAngle;
        let bestMinSep = -1;
        for (let attempt = 0; attempt < 12; attempt++) {
          const cand = -Math.PI * 0.5 + (Math.random() - 0.5) * (Math.PI * 1.44);
          let minSep = Math.PI;
          for (const prevAng of recentAngles) {
            const sep = Math.abs(cand - prevAng);
            if (sep < minSep) minSep = sep;
          }
          if (minSep > bestMinSep) {
            bestMinSep = minSep;
            bestCandidate = cand;
          }
          if (minSep >= 0.62) {
            bestCandidate = cand;
            break;
          }
        }
        arcAngle = bestCandidate;
        recentAngles.push(arcAngle);
        if (recentAngles.length > 3) recentAngles.shift();
        game._recentLightningAngles = recentAngles;

        const reach = CHAIN_LIGHTNING_RANGE * (0.72 + Math.random() * 0.28);
        const ex = clamp(startX + Math.cos(arcAngle) * reach, 10, LOGICAL_W - 10);
        const ey = clamp(startY + Math.sin(arcAngle) * reach, 10, LOGICAL_H - 10);
        const mainTrunk = buildLightningPath(startX, startY, ex, ey);
        const boltSegments = [mainTrunk];

        // Sprout 1-2 natural forked lightning offshoots along the main trunk
        if (mainTrunk.length >= 4) {
          const branchCount = Math.random() < 0.65 ? 2 : 1;
          const firstForkSign = Math.random() < 0.5 ? -1 : 1;
          for (let b = 0; b < branchCount; b++) {
            const pivotIdx = 1 + Math.floor(Math.random() * (mainTrunk.length - 2));
            const pivot = mainTrunk[pivotIdx];
            const forkSign = b === 0 ? firstForkSign : -firstForkSign;
            const forkDir = forkSign * (0.34 + Math.random() * 0.48);
            const forkAngle = arcAngle + forkDir;
            const forkLen = reach * (0.24 + Math.random() * 0.22);
            const fx = clamp(pivot.x + Math.cos(forkAngle) * forkLen, 8, LOGICAL_W - 8);
            const fy = clamp(pivot.y + Math.sin(forkAngle) * forkLen, 8, LOGICAL_H - 8);
            boltSegments.push(buildLightningPath(pivot.x, pivot.y, fx, fy));
          }
        }

        const boltLife = 0.24 + Math.random() * 0.12;
        game.lightningBolts.push({
          segments: boltSegments,
          branchStartIdx: 1,
          life: boltLife,
          maxLife: boltLife
        });
      }
      continue;
    }

    // 2) Build chain sequence: 1 primary + up to 4 additional edge-to-edge short-range jumps!
    const chainTargets = [primary];
    const visitedRefs = new Set([primary.ref]);
    let curX = primary.x;
    let curY = primary.y;
    let curRadius = primary.radius;

    for (let jump = 0; jump < CHAIN_LIGHTNING_MAX_JUMPS; jump++) {
      let nextTarget = null;
      let bestJumpDist = CHAIN_LIGHTNING_JUMP_RANGE;

      const considerJump = (kind, ref, tx, ty, r) => {
        if (visitedRefs.has(ref)) return;
        const edgeDist = Math.max(0, Math.hypot(tx - curX, ty - curY) - curRadius - r);
        if (edgeDist <= bestJumpDist) {
          bestJumpDist = edgeDist;
          nextTarget = { kind, ref, x: tx, y: ty, radius: r };
        }
      };

      for (const e of game.enemies) {
        considerJump('ENEMY', e, e.x, e.y, e.hitRadius);
      }
      for (const ew of game.enforcerWings) {
        considerJump('ENFORCER_WING', ew, ew.x, ew.y, 14);
      }
      for (const cap of game.capsules) {
        considerJump('CAPSULE', cap, cap.x, cap.y, cap.hitRadius);
      }
      for (const eb of game.enemyBullets) {
        considerJump('ENEMY_BULLET', eb, eb.x, eb.y, 6);
      }

      if (!nextTarget) break;
      visitedRefs.add(nextTarget.ref);
      chainTargets.push(nextTarget);
      curX = nextTarget.x;
      curY = nextTarget.y;
      curRadius = nextTarget.radius;
    }

    // 3) Record jagged lightning arcs and apply damage / void enemy bullets across the entire chain
    const segments = [];
    let prevX = startX;
    let prevY = startY;
    for (const tgt of chainTargets) {
      segments.push(buildLightningPath(prevX, prevY, tgt.x, tgt.y));
      prevX = tgt.x;
      prevY = tgt.y;

      game.shotsHit++;
      game.spawnDeleteBurst(tgt.x, tgt.y, COLORS.yellow, tgt.kind === 'ENEMY_BULLET' ? 4 : 5, 95);
      if (tgt.kind === 'ENEMY_BULLET') {
        const bi = game.enemyBullets.indexOf(tgt.ref);
        if (bi >= 0) game.enemyBullets.splice(bi, 1);
      } else if (tgt.kind === 'CAPSULE') {
        const ci = game.capsules.indexOf(tgt.ref);
        if (ci >= 0) destroyAndCollectCapsule(game, ci);
      } else if (tgt.kind === 'ENFORCER_WING') {
        const li = game.enforcerWings.indexOf(tgt.ref);
        if (li >= 0) damageEnforcerWing(game, li, dmg);
      } else if (tgt.kind === 'ENEMY') {
        const ei = game.enemies.indexOf(tgt.ref);
        if (ei >= 0) damageEnemy(game, ei, dmg, tgt.x, tgt.y, COLORS.yellow);
      }
    }

    game.lightningBolts.push({
      segments,
      life: 0.32,
      maxLife: 0.32
    });
  }

  game.synth.playChainLightning();
}

export function updateFighterClonesAndBolts(game, dt) {
  // 1) Fade visual Chain Lightning arcs
  for (let i = game.lightningBolts.length - 1; i >= 0; i--) {
    game.lightningBolts[i].life -= dt;
    if (game.lightningBolts[i].life <= 0) game.lightningBolts.splice(i, 1);
  }

  // 2) Update Fighter Clones (0.8s tethered left/right/back -> detach w/ 1.0s i-frames & 3 HP, 2x dark-purple bolts!)
  const p = game.player;
  if (!game.fighterClones || game.fighterClones.length === 0) return;

  const moveMult = getPlayerMoveSpeedMult(game);
  const fireMult = getPlayerFireCooldownMult(game);
  const dmgMult = getPlayerDamageMult(game);
  const inPauseWindow =
    game.sectorPhase === 'BANNER' ||
    game.sectorPhase === 'CHALLENGE_BANNER' ||
    game.sectorPhase === 'CLEARED' ||
    game.sectorPhase === 'WAVE_GAP';

  for (let i = game.fighterClones.length - 1; i >= 0; i--) {
    const cl = game.fighterClones[i];
    if (cl.invulnTimer > 0) cl.invulnTimer = Math.max(0, cl.invulnTimer - dt);
    if (cl.hitFlash > 0) cl.hitFlash = Math.max(0, cl.hitFlash - dt);

    if (!cl.detached) {
      // Tethered in left / right / back formation around player for 0.8s
      cl.x = clamp(p.x + cl.ox, 22, LOGICAL_W - 22);
      cl.y = clamp(p.y + cl.oy, PLAYER_MIN_Y - 12, LOGICAL_H - 18);
      if (!inPauseWindow) {
        cl.tetherTimer -= dt;
        if (cl.tetherTimer <= 0) {
          cl.detached = true;
          cl.invulnTimer = CLONE_IFRAMES; // 1.0s invincibility frames upon breaking off!
          game.spawnDeleteBurst(cl.x, cl.y, COLORS.clonePurple, 8, 95);
        }
      }
      continue;
    }

    // Autonomous patrol & targeting AI
    cl.patrolPhase += dt * 2.2 * moveMult;
    const laneSpread = (cl.role === 'LEFT' ? -95 : (cl.role === 'RIGHT' ? 95 : 0));
    let desiredX = clamp(LOGICAL_W * 0.5 + laneSpread + Math.sin(cl.patrolPhase) * 72, 28, LOGICAL_W - 28);
    let desiredY = clamp(PLAYER_MIN_Y + 70 + (cl.role === 'BACK' ? 75 : 22) + Math.cos(cl.patrolPhase * 1.3) * 32, PLAYER_MIN_Y + 12, PLAYER_MAX_Y - 14);

    if (game.enemies.length > 0) {
      // Spread each clone onto its own target index so all 3 engage across the formation!
      const tgt = game.enemies[(cl.id - 1) % game.enemies.length];
      if (tgt) {
        desiredX = clamp(tgt.x + Math.sin(cl.patrolPhase * 1.4) * 28, 28, LOGICAL_W - 28);
      }
    }

    const dx = desiredX - cl.x;
    const dy = desiredY - cl.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = 235 * moveMult * dt;
    if (dist > maxStep) {
      cl.x += (dx / dist) * maxStep;
      cl.y += (dy / dist) * maxStep;
    } else {
      cl.x = desiredX;
      cl.y = desiredY;
    }

    // Autonomous rapid dark-purple bolts at 2x speed!
    if (!inPauseWindow && (game.enemies.length > 0 || game.enforcerWings.length > 0 || game.capsules.length > 0)) {
      cl.fireCooldown -= dt;
      if (cl.fireCooldown <= 0) {
        cl.fireCooldown = CLONE_FIRE_COOLDOWN * fireMult;
        game.playerBullets.push({
          x: cl.x,
          y: cl.y - 14,
          vy: -PLAYER_BULLET_SPEED * 2.0,
          dmg: dmgMult,
          weakened: dmgMult < 0.999,
          purple: true,
          cloneBolt: true,
          redLaserBullet: false,
          slowedByFlux: false,
          dissolveTimer: 0,
          dissolveMax: 0
        });
        game.shotsFired++;
      }
    }
  }
}

export function damageFighterClone(game, cloneIdx) {
  const cl = game.fighterClones[cloneIdx];
  if (!cl || !cl.detached || cl.invulnTimer > 0) return false;
  cl.hp -= 1;
  cl.hitFlash = 0.16;
  cl.invulnTimer = 0.28;
  if (cl.hp <= 0) {
    game.spawnDeleteBurst(cl.x, cl.y, COLORS.clonePurple, 14, 145);
    game.synth.playDeleteBurst(false);
    game.fighterClones.splice(cloneIdx, 1);
    if (game.fighterClones.length === 0 && hasPowerup(game, 'CLONE')) {
      removePowerupSlot(game, 'CLONE', false);
    }
  } else {
    game.spawnDeleteBurst(cl.x, cl.y, COLORS.cloneBlue, 6, 85);
    game.synth.playArmorPing();
  }
  return true;
}

export function updatePulsarHazards(game, dt) {
  const p = game.player;

  // 1) Yellow Electro Balls (size of a Drone, falls like a leaf -> 2.0s Fire Jam, NO damage!)
  for (let i = game.electroBalls.length - 1; i >= 0; i--) {
    const eb = game.electroBalls[i];
    eb.age += dt;
    eb.x = clamp(eb.baseX + Math.sin(eb.age * eb.swayFreq + eb.phase) * eb.swayAmp, 16, LOGICAL_W - 16);
    eb.y += eb.vy * dt;
    if (eb.y > LOGICAL_H + 26) {
      game.electroBalls.splice(i, 1);
      continue;
    }
    if (p.alive && !p.capturedById && p.invulnTimer <= 0 && Math.hypot(eb.x - p.x, eb.y - p.y) < (p.dual ? 26 : 19)) {
      p.fireJamTimer = PULSAR_JAM_DUR;
      p.fireJamMax = PULSAR_JAM_DUR;
      game.redLaserActive = false;
      game.activeLaserBeams = [];
      game.synth.playShockJam();
      game.spawnDeleteBurst(eb.x, eb.y, '#ffffff', 12, 120);
      game.spawnPopup(p.x, p.y - 30, 'WEAPONS JAMMED 2.0s!', COLORS.yellow, 1.25);
      game.electroBalls.splice(i, 1);
    }
  }

  // 2) Pulsar Death Spark Lines (3-4 omnidirectional burst lines that curve & trail downward -> 4.0s 2x fire rate slow, NO damage!)
  for (let i = game.pulsarSparks.length - 1; i >= 0; i--) {
    const sp = game.pulsarSparks[i];
    sp.age += dt;
    if (sp.age < sp.burstDur) {
      sp.x += sp.burstVx * dt;
      sp.y += sp.burstVy * dt;
    } else {
      // Smoothly transition into downward-trailing spark arcs
      sp.vx = lerp(sp.vx, sp.driftVx, Math.min(1, dt * 4.5));
      sp.vy = lerp(sp.vy, sp.fallVy, Math.min(1, dt * 4.5));
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
    }
    sp.trail.push({ x: sp.x, y: sp.y });
    if (sp.trail.length > 9) sp.trail.shift();

    if (sp.y > LOGICAL_H + 34 || sp.x < -34 || sp.x > LOGICAL_W + 34) {
      game.pulsarSparks.splice(i, 1);
      continue;
    }

    if (p.alive && !p.capturedById && p.invulnTimer <= 0 && Math.hypot(sp.x - p.x, sp.y - p.y) < (p.dual ? 22 : 14)) {
      p.sparkSlowTimer = PULSAR_SPARK_SLOW_DUR;
      p.sparkSlowMax = PULSAR_SPARK_SLOW_DUR;
      game.synth.playShockJam();
      game.spawnDeleteBurst(sp.x, sp.y, '#ffffff', 8, 90);
      game.spawnPopup(p.x, p.y - 30, 'FIRE RATE 2x SLOW 4.0s!', '#ffffff', 1.25);
      game.pulsarSparks.splice(i, 1);
    }
  }
}

export function updateEnemyBullets(game, dt) {
  const p = game.player;
  for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
    const eb = game.enemyBullets[i];
    eb.x += eb.vx * dt;
    eb.y += eb.vy * dt;
    if (eb.y > LOGICAL_H + 22 || eb.x < -22 || eb.x > LOGICAL_W + 22) {
      game.enemyBullets.splice(i, 1);
      continue;
    }

    // Check hits against detached Fighter Clones (3 HP each, respects 1.0s i-frames)
    let hitClone = false;
    if (game.fighterClones && game.fighterClones.length > 0) {
      for (let ci = game.fighterClones.length - 1; ci >= 0; ci--) {
        const cl = game.fighterClones[ci];
        if (cl.detached && cl.invulnTimer <= 0 && Math.hypot(eb.x - cl.x, eb.y - cl.y) < 13) {
          damageFighterClone(game, ci);
          game.enemyBullets.splice(i, 1);
          hitClone = true;
          break;
        }
      }
    }
    if (hitClone) continue;

    if (p.alive && !p.capturedById && p.invulnTimer <= 0 && Math.hypot(eb.x - p.x, eb.y - p.y) < (p.dual ? 22 : 13)) {
      game.damagePlayer();
      game.enemyBullets.splice(i, 1);
    }
  }
}
