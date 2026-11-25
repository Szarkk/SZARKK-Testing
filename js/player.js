/* =========================================================================
   AUREX FIGHTER STATE, 2D MOVEMENT, STACKABLE WEAPON FIRING & DEBUFFS
   ========================================================================= */

import {
  ARC_WAVE_INTERVAL,
  ARC_WAVE_MANUAL_COOLDOWN,
  ARC_WAVE_MAX,
  CANNON_AUTO_FIRE_DELAY,
  CHAIN_LIGHTNING_BURST_COOLDOWN,
  CHAIN_LIGHTNING_BURST_COUNT,
  CHAIN_LIGHTNING_BURST_INTERVAL,
  COLORS,
  CYAN_SHOT_ENERGY_COST,
  FIRE_COOLDOWN,
  LOGICAL_H,
  LOGICAL_W,
  PLAYER_BULLET_SPEED,
  PLAYER_DEFAULT_Y,
  PLAYER_MAX_Y,
  PLAYER_MIN_Y,
  PLAYER_SPEED,
  POWERUP_MAX_ENERGY,
  PULSAR_JAM_DUR,
  PULSAR_SPARK_SLOW_DUR,
  YELLOW_SHOT_ENERGY_COST
} from './config.js';
import { clamp } from './utils.js';
import {
  consumePowerupEnergy,
  getActivePowerups,
  hasPowerup,
  removePowerupSlot
} from './powerups.js';
import { fireCannonShot, fireChainLightning, fireHomingMissiles, spawnArcWaveFromPlayer } from './projectiles.js';

export function createPlayerState() {
  return {
    x: LOGICAL_W * 0.5,
    y: PLAYER_DEFAULT_Y,
    dual: false,
    alive: true,
    respawnTimer: 0,
    invulnTimer: 0,
    fireCooldown: 0,
    laserTickCooldown: 0,
    laserFxCooldown: 0,
    arcWaveCooldown: 0,
    lightningCooldown: 0,
    lightningBurstLeft: 0,
    lightningBurstTimer: 0,
    lightningBurstExclude: null,
    vibrateAmp: 0,
    missileVibTimer: 0,
    slowTimer: 0,
    slowMax: 4.0,
    dmgDebuffTimer: 0,
    dmgDebuffMax: 4.0,
    fireJamTimer: 0,
    fireJamMax: PULSAR_JAM_DUR,
    sparkSlowTimer: 0,
    sparkSlowMax: PULSAR_SPARK_SLOW_DUR,
    capturedById: null
  };
}

export function clampPlayerPosition(game) {
  const margin = game.player.dual ? 34 : 20;
  game.player.x = clamp(game.player.x, margin, LOGICAL_W - margin);
  game.player.y = clamp(game.player.y, PLAYER_MIN_Y, PLAYER_MAX_Y);
}

export const clampPlayerX = clampPlayerPosition;

/**
 * Movement speed multiplier — Cyan Field (1.5x slower) does NOT stack with Cyan Flux Thread slow.
 */
export function getPlayerMoveSpeedMult(game) {
  const threadSlow = game.player.slowTimer > 0 ? 0.45 : 1.0;
  const fieldSlow = (game.fieldDebuff && game.fieldDebuff.type === 'CYAN') ? (1 / 1.5) : 1.0;
  return Math.min(threadSlow, fieldSlow);
}

/**
 * Fire cooldown multiplier (>1 = slower fire rate) — Cyan Field (1.5x) & Pulsar Sparks (2x).
 */
export function getPlayerFireCooldownMult(game) {
  const fieldSlow = (game.fieldDebuff && game.fieldDebuff.type === 'CYAN') ? 1.5 : 1.0;
  const sparkSlow = game.player.sparkSlowTimer > 0 ? 2.0 : 1.0;
  return Math.max(fieldSlow, sparkSlow);
}

/**
 * Outgoing damage multiplier — Red Field (2x reduction = 0.5x dmg) does NOT stack with Null Thread -20% dmg.
 */
export function getPlayerDamageMult(game) {
  const threadDmg = game.player.dmgDebuffTimer > 0 ? 0.8 : 1.0;
  const fieldDmg = (game.fieldDebuff && game.fieldDebuff.type === 'RED') ? 0.5 : 1.0;
  return Math.min(threadDmg, fieldDmg);
}

function fireStandardWhiteBullets(game, shipOffsets, baseDmg, weakened) {
  const p = game.player;
  p.fireCooldown = FIRE_COOLDOWN * getPlayerFireCooldownMult(game);
  for (const ox of shipOffsets) {
    game.playerBullets.push({
      x: p.x + ox,
      y: p.y - 16,
      vy: -PLAYER_BULLET_SPEED,
      dmg: baseDmg,
      weakened,
      purple: false,
      redLaserBullet: false,
      slowedByFlux: false,
      dissolveTimer: 0,
      dissolveMax: 0
    });
    game.shotsFired++;
  }
  game.synth.playLaser(weakened);
}

function fireSingleArcWave(game) {
  const p = game.player;
  const aw = game.arcWaveState;
  if (aw.phase === 'CANNON_READY' || aw.phase === 'CANNON_CHARGING' || !hasPowerup(game, 'PURPLE')) {
    return false;
  }

  aw.wavesFired++;
  aw.phase = 'ACTIVE';
  p.arcWaveCooldown = (game.autoFire ? ARC_WAVE_INTERVAL : ARC_WAVE_MANUAL_COOLDOWN) * getPlayerFireCooldownMult(game);
  spawnArcWaveFromPlayer(game);

  const remaining = Math.max(0, ARC_WAVE_MAX - aw.wavesFired);
  game.powerup.slots.PURPLE = (remaining / ARC_WAVE_MAX) * POWERUP_MAX_ENERGY;

  if (aw.wavesFired >= ARC_WAVE_MAX) {
    // Ready for double-tap / double-click Cannon Shot finisher!
    aw.phase = 'CANNON_READY';
    aw.cannonTapGrace = 0.22;
    game.spawnPopup(p.x, p.y - 36, 'CANNON PRIMED! 2x TAP!', COLORS.purpleBright, 1.4);
  } else {
    game.spawnPopup(p.x, p.y - 32, `ARC WAVE ${aw.wavesFired}/${ARC_WAVE_MAX}`, COLORS.purpleBright, 0.95);
  }
  return true;
}

export function damagePlayer(game) {
  const p = game.player;
  if (!p.alive || p.invulnTimer > 0) return;

  const active = getActivePowerups(game);
  const lead = active[0] || null;
  const shipCol = lead === 'RED'
    ? COLORS.nullRed
    : (lead === 'PURPLE'
      ? COLORS.purple
      : (lead === 'YELLOW'
        ? COLORS.yellow
        : (lead === 'CLONE' ? COLORS.clonePurple : (lead === 'CYAN' ? COLORS.cyan : '#ffffff'))));

  if (p.dual) {
    p.dual = false;
    p.invulnTimer = 1.6;
    game.activeLaserBeams = [];
    game.shake = 0.24;
    game.spawnDeleteBurst(p.x + 14, p.y, shipCol, 20, 180);
    game.spawnPopup(p.x, p.y - 24, 'WINGMAN DELETED', COLORS.amber, 1.2);
    game.synth.playDeleteBurst(true);
    return;
  }

  // Dying preserves conserved weapons, resets Master no-death streaks, AND instantly clears Fighter Clones!
  p.alive = false;
  p.respawnTimer = 1.75;
  p.vibrateAmp = 0;
  p.missileVibTimer = 0;
  p.slowTimer = 0;
  p.dmgDebuffTimer = 0;
  p.fireJamTimer = 0;
  p.sparkSlowTimer = 0;
  p.lightningBurstLeft = 0;
  p.lightningBurstTimer = 0;
  game.masterFluxStreak = 0;
  game.masterNullStreak = 0;
  game.masterFluxRewardSpawned = false;
  game.masterNullRewardSpawned = false;
  if (game.fighterClones && game.fighterClones.length > 0) {
    for (const cl of game.fighterClones) {
      game.spawnDeleteBurst(cl.x, cl.y, COLORS.clonePurple, 12, 140);
    }
  }
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
  game.shake = 0.34;
  game.hitStop = 0.05;
  game.spawnDeleteBurst(p.x, p.y, shipCol, 30, 225);
  game.synth.playDeleteBurst(true);
  game.updateHUD();
  game.updateStatusPills();

  if (!game.sandboxMode && game.lives <= 0) {
    game.gameOverTimer = 1.05;
  }
}

export function applyThreadDebuff(game, variant) {
  const p = game.player;
  if (!p.alive) return;
  if (variant === 'FLUX') {
    if (p.slowTimer < 3.6) {
      game.synth.playDebuff(false);
      game.spawnPopup(p.x, p.y - 26, 'STASIS SLOW 4.0S', COLORS.cyan, 1.15);
    }
    p.slowTimer = 4.0;
    p.slowMax = 4.0;
  } else {
    if (p.dmgDebuffTimer < 3.6) {
      game.synth.playDebuff(true);
      game.spawnPopup(p.x, p.y - 26, '-20% DMG 4.0S', COLORS.nullRed, 1.15);
    }
    p.slowTimer = Math.max(p.slowTimer, 1.0);
    if (p.slowMax < 1.0 || p.slowTimer <= 1.0) p.slowMax = 1.0;
    p.dmgDebuffTimer = 4.0;
    p.dmgDebuffMax = 4.0;
  }
}

export function updatePlayer(game, dt) {
  const p = game.player;
  const aw = game.arcWaveState;

  if (!p.alive && game.lives > 0) {
    p.respawnTimer -= dt;
    if (p.respawnTimer <= 0) {
      p.alive = true;
      p.x = LOGICAL_W * 0.5;
      p.y = PLAYER_DEFAULT_Y;
      p.invulnTimer = 2.0;
    }
  }
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
  if (p.slowTimer > 0) p.slowTimer = Math.max(0, p.slowTimer - dt);
  if (p.dmgDebuffTimer > 0) p.dmgDebuffTimer = Math.max(0, p.dmgDebuffTimer - dt);
  if (p.fireJamTimer > 0) p.fireJamTimer = Math.max(0, p.fireJamTimer - dt);
  if (p.sparkSlowTimer > 0) p.sparkSlowTimer = Math.max(0, p.sparkSlowTimer - dt);
  if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  if (p.laserFxCooldown > 0) p.laserFxCooldown = Math.max(0, p.laserFxCooldown - dt);
  if (p.arcWaveCooldown > 0) p.arcWaveCooldown = Math.max(0, p.arcWaveCooldown - dt);
  if (p.lightningCooldown > 0) p.lightningCooldown = Math.max(0, p.lightningCooldown - dt);
  if (p.missileVibTimer > 0) p.missileVibTimer = Math.max(0, p.missileVibTimer - dt);
  if (aw.cannonTapGrace > 0) aw.cannonTapGrace = Math.max(0, aw.cannonTapGrace - dt);
  if (game.tapFireBuffer > 0) game.tapFireBuffer = Math.max(0, game.tapFireBuffer - dt);

  if (!p.alive || p.capturedById) {
    p.vibrateAmp = 0;
    p.lightningBurstLeft = 0;
    p.lightningBurstTimer = 0;
    p.lightningBurstExclude = null;
    game.redLaserActive = false;
    game.activeLaserBeams = [];
    game.freshFirePress = false;
    return;
  }

  // Free 2D Touhou-style movement in the bottom 2/5ths of the arena (WASD / Arrow Keys)
  let moveX = 0;
  let moveY = 0;
  if (game.keys.has('ArrowLeft') || game.keys.has('KeyA')) moveX -= 1;
  if (game.keys.has('ArrowRight') || game.keys.has('KeyD')) moveX += 1;
  if (game.keys.has('ArrowUp') || game.keys.has('KeyW')) moveY -= 1;
  if (game.keys.has('ArrowDown') || game.keys.has('KeyS')) moveY += 1;

  if (moveX !== 0 && moveY !== 0) {
    const inv = 1 / Math.SQRT2;
    moveX *= inv;
    moveY *= inv;
  }

  if (moveX !== 0 || moveY !== 0) {
    const slowMult = getPlayerMoveSpeedMult(game);
    p.x += moveX * PLAYER_SPEED * slowMult * dt;
    p.y += moveY * PLAYER_SPEED * slowMult * dt;
    clampPlayerPosition(game);
  }

  // Firing check (Manual Hold / Tap Buffer / Explicit Auto-Fire — never drains while idle!)
  const manualHold =
    game.keys.has('Space') ||
    game.keys.has('KeyZ') ||
    game.keys.has('KeyJ') ||
    game.firePointerIds.size > 0;
  const inBannerOrCleared =
    game.sectorPhase === 'BANNER' ||
    game.sectorPhase === 'CHALLENGE_BANNER' ||
    game.sectorPhase === 'CLEARED' ||
    (game.sectorPhase === 'WAVE_GAP' && game.capsules.length === 0);
  const autoActive = game.autoFire && !inBannerOrCleared;
  const fireJammed = p.fireJamTimer > 0;
  const wantsFire = !fireJammed && (manualHold || autoActive || game.tapFireBuffer > 0);

  // Double-Tap / Double-Click Purple Cannon Finisher State Machine (paused while fire-jammed!)
  if (!fireJammed && aw.phase === 'CANNON_READY') {
    if ((game.freshFirePress || autoActive) && aw.cannonTapGrace <= 0) {
      // Tap 1: Violent vibration + bright purple overcharge + 3.0s auto-fire countdown
      aw.phase = 'CANNON_CHARGING';
      aw.cannonTimer = CANNON_AUTO_FIRE_DELAY;
      aw.cannonTapGrace = 0.16;
      game.synth.playCannonCharge();
      game.spawnPopup(p.x, p.y - 38, 'OVERCHARGE! TAP AGAIN!', COLORS.purpleBright, 1.35);
      game.freshFirePress = false;
    }
  } else if (!fireJammed && aw.phase === 'CANNON_CHARGING') {
    if (game.freshFirePress && aw.cannonTapGrace <= 0) {
      // Tap 2: Immediately fire AOE Cannon Shot!
      fireCannonShot(game);
      aw.auraFade = 0.55;
      removePowerupSlot(game, 'PURPLE', true);
      game.freshFirePress = false;
    }
  }

  const hasCyan = hasPowerup(game, 'CYAN');
  const hasRed = hasPowerup(game, 'RED');
  const hasPurple = hasPowerup(game, 'PURPLE');
  const hasYellow = hasPowerup(game, 'YELLOW');
  const purplePendingCannon = aw.phase === 'CANNON_READY' || aw.phase === 'CANNON_CHARGING';
  // Note: Fighter Clones (CLONE) are autonomous companions and do NOT override the main gun!
  const hasAnyWeaponPowerup = hasCyan || hasRed || hasPurple || hasYellow || purplePendingCannon;

  const baseDmg = getPlayerDamageMult(game);
  const weakened = baseDmg < 0.999;
  const shipOffsets = p.dual ? [-14, 14] : [0];
  let consumedTap = false;

  // 1) Red Continuous Laser layer (stacks simultaneously with Cyan, Purple & Yellow!)
  if (hasRed && !fireJammed) {
    if (game.tapFireBuffer > 0) {
      game.redLaserPulseTimer = Math.max(game.redLaserPulseTimer, FIRE_COOLDOWN);
      consumedTap = true;
    }
    if (manualHold || autoActive) {
      game.redLaserActive = true;
    } else if (game.redLaserPulseTimer > 0) {
      game.redLaserPulseTimer = Math.max(0, game.redLaserPulseTimer - dt);
      game.redLaserActive = game.redLaserPulseTimer > 0;
    } else {
      game.redLaserActive = false;
    }
  } else {
    game.redLaserActive = false;
    game.activeLaserBeams = [];
  }

  // 2) Cyan Homing Missiles layer (30 volleys, slight fighter vibration!)
  if (hasCyan && wantsFire && p.fireCooldown <= 0) {
    p.fireCooldown = FIRE_COOLDOWN * getPlayerFireCooldownMult(game);
    p.missileVibTimer = 0.16;
    fireHomingMissiles(game, shipOffsets, baseDmg, weakened);
    consumePowerupEnergy(game, 'CYAN', CYAN_SHOT_ENERGY_COST);
    consumedTap = true;
  }

  // 3) Purple Arc Wave layer (6 wide waves @ 0.5 dmg, stacks simultaneously!)
  if (hasPurple && wantsFire && p.arcWaveCooldown <= 0 && !purplePendingCannon) {
    if (fireSingleArcWave(game)) {
      consumedTap = true;
    }
  }

  // 4) Yellow Chain Lightning layer (3 individual lightning bolt lines over 0.50s, 1 shot each = 3 ammo, then 0.80s cooldown!)
  if (fireJammed || !hasYellow) {
    p.lightningBurstLeft = 0;
    p.lightningBurstTimer = 0;
    p.lightningBurstExclude = null;
  } else if (p.lightningBurstLeft > 0) {
    p.lightningBurstTimer -= dt;
    if (p.lightningBurstTimer <= 0) {
      const boltIdx = CHAIN_LIGHTNING_BURST_COUNT - p.lightningBurstLeft;
      fireChainLightning(game, shipOffsets, baseDmg, weakened, boltIdx, p.lightningBurstExclude);
      consumePowerupEnergy(game, 'YELLOW', YELLOW_SHOT_ENERGY_COST);
      p.lightningBurstLeft--;
      const fireMult = getPlayerFireCooldownMult(game);
      if (p.lightningBurstLeft > 0 && hasPowerup(game, 'YELLOW')) {
        p.lightningBurstTimer = CHAIN_LIGHTNING_BURST_INTERVAL * fireMult;
      } else {
        p.lightningBurstLeft = 0;
        p.lightningBurstTimer = 0;
        p.lightningBurstExclude = null;
        p.lightningCooldown = CHAIN_LIGHTNING_BURST_COOLDOWN * fireMult;
      }
    }
  } else if (hasYellow && wantsFire && p.lightningCooldown <= 0) {
    const fireMult = getPlayerFireCooldownMult(game);
    p.lightningBurstExclude = new Set();
    fireChainLightning(game, shipOffsets, baseDmg, weakened, 0, p.lightningBurstExclude);
    consumePowerupEnergy(game, 'YELLOW', YELLOW_SHOT_ENERGY_COST);
    if (hasPowerup(game, 'YELLOW')) {
      p.lightningBurstLeft = Math.max(0, CHAIN_LIGHTNING_BURST_COUNT - 1);
      p.lightningBurstTimer = CHAIN_LIGHTNING_BURST_INTERVAL * fireMult;
    } else {
      p.lightningBurstLeft = 0;
      p.lightningBurstTimer = 0;
      p.lightningBurstExclude = null;
      p.lightningCooldown = CHAIN_LIGHTNING_BURST_COOLDOWN * fireMult;
    }
    consumedTap = true;
  }

  // 5) Standard White Pulse Cannon (when no active weapon power-up is loaded)
  if (!hasAnyWeaponPowerup && wantsFire && p.fireCooldown <= 0) {
    fireStandardWhiteBullets(game, shipOffsets, baseDmg, weakened);
    consumedTap = true;
  }

  if (consumedTap) {
    game.tapFireBuffer = 0;
  }
  game.freshFirePress = false;

  // Compute Fighter Vibration Amplitude (subtle for Laser/Missiles, mild for Electro Jam, violent for Cannon Overcharge!)
  // NOTE: Pulsar spark fire-rate slow has white shock aura with NO vibration!
  let vib = 0;
  if (game.redLaserActive) vib = Math.max(vib, 1.45);
  if (p.missileVibTimer > 0) vib = Math.max(vib, 1.35);
  if (fireJammed) vib = Math.max(vib, 1.75);
  if (aw.phase === 'CANNON_CHARGING') {
    const urgency = 1 - clamp(aw.cannonTimer / CANNON_AUTO_FIRE_DELAY, 0, 1);
    vib = Math.max(vib, 3.6 + urgency * 1.9);
  }
  p.vibrateAmp = vib;
}
