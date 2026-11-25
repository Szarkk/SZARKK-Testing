/* =========================================================================
   STACKABLE POWER-UP CAPSULES (CYAN HOMING / RED LASER / PURPLE ARC WAVE)
   Different power-ups stack simultaneously; same type refills its gauge to 100%.
   Capsules float randomly inside the mid-arena and are activated by shooting them.
   ========================================================================= */

import {
  ALPHA_CENTOID_DROP_CHANCE,
  CAPSULE_BOUNDS,
  CAPSULE_DROP_DELAY,
  CLONE_BREAKOFF_TIME,
  CLONE_DURATION,
  CLONE_HP,
  CLONE_POWERUP_START_SECTOR,
  COLORS,
  CYAN_POWERUP_START_SECTOR,
  CYAN_POWERUP_START_WAVE,
  LOGICAL_H,
  LOGICAL_W,
  MASTER_STREAK_REWARD_COUNT,
  POWERUP_MAX_ENERGY,
  PULSAR_DROP_CHANCE,
  PURPLE_POWERUP_START_SECTOR,
  RED_POWERUP_START_SECTOR,
  YELLOW_POWERUP_START_SECTOR
} from './config.js';
import { clamp } from './utils.js';

export function createPowerupState() {
  return {
    slots: {
      CYAN: 0,
      RED: 0,
      PURPLE: 0,
      YELLOW: 0,
      CLONE: 0
    },
    order: [] // Active distinct power-up types in collection order
  };
}

export function createArcWaveState() {
  return {
    phase: 'IDLE', // IDLE | READY | ACTIVE | CANNON_READY | CANNON_CHARGING
    wavesFired: 0,
    waveTimer: 0,
    triggerGrace: 0,
    cannonTapGrace: 0,
    firedBulletDuringWaves: false,
    cannonTimer: 0,
    auraFade: 0
  };
}

export function resetArcWaveState(game) {
  const aw = game.arcWaveState;
  aw.phase = 'IDLE';
  aw.wavesFired = 0;
  aw.waveTimer = 0;
  aw.triggerGrace = 0;
  aw.cannonTapGrace = 0;
  aw.firedBulletDuringWaves = false;
  aw.cannonTimer = 0;
}

export function hasPowerup(game, type) {
  return (game.powerup.slots[type] || 0) > 0;
}

export function getActivePowerups(game) {
  const awPhase = game.arcWaveState.phase;
  return game.powerup.order.filter((type) => {
    if (type === 'PURPLE' && (awPhase === 'CANNON_READY' || awPhase === 'CANNON_CHARGING')) return true;
    return (game.powerup.slots[type] || 0) > 0;
  });
}

export function clearActivePowerup(game) {
  game.powerup.slots.CYAN = 0;
  game.powerup.slots.RED = 0;
  game.powerup.slots.PURPLE = 0;
  game.powerup.slots.YELLOW = 0;
  game.powerup.slots.CLONE = 0;
  game.powerup.order = [];
  resetArcWaveState(game);
  game.arcWaveState.auraFade = 0;
  game.redLaserActive = false;
  game.redLaserPulseTimer = 0;
  game.activeLaserBeams = [];
  game.fighterClones = [];
  game.cloneTimer = 0;
  if (game.player) {
    game.player.lightningBurstLeft = 0;
    game.player.lightningBurstTimer = 0;
    game.player.lightningBurstExclude = null;
  }
}

export function removePowerupSlot(game, type, silent = false) {
  game.powerup.slots[type] = 0;
  game.powerup.order = game.powerup.order.filter(t => t !== type);

  if (type === 'RED') {
    game.redLaserActive = false;
    game.redLaserPulseTimer = 0;
    game.activeLaserBeams = [];
  } else if (type === 'PURPLE') {
    resetArcWaveState(game);
  } else if (type === 'YELLOW' && game.player) {
    game.player.lightningBurstLeft = 0;
    game.player.lightningBurstTimer = 0;
    game.player.lightningBurstExclude = null;
  } else if (type === 'CLONE') {
    game.fighterClones = [];
    game.cloneTimer = 0;
  }

  if (!silent) {
    const remaining = getActivePowerups(game);
    if (remaining.length === 0) {
      game.spawnPopup(game.player.x, game.player.y - 28, 'STANDARD PULSE RESTORED', COLORS.white, 1.1);
    } else {
      const label = type === 'CYAN'
        ? 'HOMING EMPTY'
        : (type === 'RED'
          ? 'LASER EMPTY'
          : (type === 'YELLOW'
            ? 'LIGHTNING EMPTY'
            : (type === 'CLONE' ? 'CLONES EXPIRED' : 'ARC WAVE EMPTY')));
      const col = type === 'CYAN'
        ? COLORS.cyan
        : (type === 'RED'
          ? COLORS.nullRed
          : (type === 'YELLOW'
            ? COLORS.yellow
            : (type === 'CLONE' ? COLORS.clonePurple : COLORS.purpleBright)));
      game.spawnPopup(game.player.x, game.player.y - 28, label, col, 0.95);
    }
  }
}

export function consumePowerupEnergy(game, type, amount) {
  if (!hasPowerup(game, type)) return false;
  game.powerup.slots[type] = Math.max(0, game.powerup.slots[type] - amount);
  if (game.powerup.slots[type] <= 0.001) {
    game.powerup.slots[type] = 0;
    if (type !== 'PURPLE') {
      removePowerupSlot(game, type, false);
    }
    return true;
  }
  return false;
}

export function getUnlockedCapsuleTypes(effSec, waveNum = 1, hardMode = false, inChallenge = false) {
  if (hardMode || (effSec >= YELLOW_POWERUP_START_SECTOR && effSec >= CLONE_POWERUP_START_SECTOR)) {
    return ['CYAN', 'RED', 'PURPLE', 'YELLOW', 'CLONE'];
  }
  if (effSec >= PURPLE_POWERUP_START_SECTOR) {
    return ['CYAN', 'RED', 'PURPLE'];
  }
  if (effSec >= RED_POWERUP_START_SECTOR) {
    return ['CYAN', 'RED'];
  }
  if (
    effSec >= CYAN_POWERUP_START_SECTOR &&
    (inChallenge || effSec > CYAN_POWERUP_START_SECTOR || waveNum >= CYAN_POWERUP_START_WAVE)
  ) {
    return ['CYAN'];
  }
  return [];
}

export function pickRandomCapsuleType(effSec, waveNum = 4, hardMode = false, inChallenge = false) {
  const pool = getUnlockedCapsuleTypes(effSec, waveNum, hardMode, inChallenge);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function rollEnemyCapsuleDrop(game, enemy) {
  // Track Master 10-kill no-death streak pity reward (works across any unlocked sector/Hard Mode!)
  if (enemy.type === 'MASTER_FLUX_ENFORCER') {
    game.masterFluxStreak = (game.masterFluxStreak || 0) + 1;
    if (game.masterFluxStreak >= MASTER_STREAK_REWARD_COUNT && !game.masterFluxRewardSpawned) {
      game.masterFluxRewardSpawned = true;
      game.pendingCapsuleDrops.push({
        x: clamp(enemy.x, 48, LOGICAL_W - 48),
        y: clamp(enemy.y, 70, LOGICAL_H - 120),
        type: 'CYAN',
        timer: 0.45,
        glowReward: 'FLUX'
      });
      game.spawnPopup(enemy.x, enemy.y - 36, '10x MASTER FLUX // GLOWING CYAN!', COLORS.cyan, 1.6);
    }
  } else if (enemy.type === 'MASTER_NULL_ENFORCER') {
    game.masterNullStreak = (game.masterNullStreak || 0) + 1;
    if (game.masterNullStreak >= MASTER_STREAK_REWARD_COUNT && !game.masterNullRewardSpawned) {
      game.masterNullRewardSpawned = true;
      game.pendingCapsuleDrops.push({
        x: clamp(enemy.x, 48, LOGICAL_W - 48),
        y: clamp(enemy.y, 70, LOGICAL_H - 120),
        type: 'RED',
        timer: 0.45,
        glowReward: 'NULL'
      });
      game.spawnPopup(enemy.x, enemy.y - 36, '10x MASTER NULL // GLOWING RED!', COLORS.nullRed, 1.6);
    }
  }

  const effSec = game.getEffectiveSector ? game.getEffectiveSector() : game.sector;
  const unlocked = getUnlockedCapsuleTypes(effSec, game.sectorWave || 1, game.hardMode, game.isChallengeStage);
  if (unlocked.length === 0) return;

  const allowCyan = unlocked.includes('CYAN');
  const allowRed = unlocked.includes('RED');
  const allowPurple = unlocked.includes('PURPLE');
  const drops = [];

  if (enemy.type === 'PULSAR') {
    // Pulsar: 10% chance to drop Chain Lightning ONLY (never drops other capsules!)
    if (Math.random() < PULSAR_DROP_CHANCE) drops.push('YELLOW');
  } else if (enemy.type === 'ALPHA_CENTOID') {
    // Alpha Centoid: 20% chance to drop Fighter Clones ONLY (rolled once when chain/head defeated!)
    if (Math.random() < ALPHA_CENTOID_DROP_CHANCE) drops.push('CLONE');
  } else if (enemy.type === 'MASTER_FLUX_ENFORCER') {
    // Master Enforcer [Flux]: Independent rolls — 25% Cyan, 5% Red, 10% Purple (Sec 04+)
    if (allowCyan && Math.random() < 0.25) drops.push('CYAN');
    if (allowRed && Math.random() < 0.05) drops.push('RED');
    if (allowPurple && Math.random() < 0.10) drops.push('PURPLE');
  } else if (enemy.type === 'MASTER_NULL_ENFORCER') {
    // Master Enforcer [Null]: Independent rolls — 25% Red, 5% Cyan, 10% Purple (Sec 04+)
    if (allowRed && Math.random() < 0.25) drops.push('RED');
    if (allowCyan && Math.random() < 0.05) drops.push('CYAN');
    if (allowPurple && Math.random() < 0.10) drops.push('PURPLE');
  } else if (enemy.type === 'FLUX_ENFORCER') {
    // Elite Enforcer [Flux]: Cyan 10%, Red 2% (Sec 03+), Purple 2% (Sec 04+)
    const r = Math.random();
    if (allowCyan && r < 0.10) drops.push('CYAN');
    else if (allowRed && r < 0.12) drops.push('RED');
    else if (allowPurple && r < 0.14) drops.push('PURPLE');
  } else if (enemy.type === 'NULL_ENFORCER') {
    // Elite Enforcer [Null]: Red 10%, Cyan 2%, Purple 2% (Sec 04+)
    const r = Math.random();
    if (allowRed && r < 0.10) drops.push('RED');
    else if (allowCyan && r < 0.12) drops.push('CYAN');
    else if (allowPurple && r < 0.14) drops.push('PURPLE');
  } else if (enemy.type === 'V1_ENFORCER' || enemy.type === 'CENTOID') {
    // Advanced Tier (V1 Enforcer / Centoid): 1% total drop chance
    if (Math.random() < 0.01) {
      const picked = pickRandomCapsuleType(effSec, game.sectorWave || 1, game.hardMode, game.isChallengeStage);
      if (picked) drops.push(picked);
    }
  } else {
    // Normal ships (Drones, Interceptors): 0.1% drop chance
    if (Math.random() < 0.001) {
      const picked = pickRandomCapsuleType(effSec, game.sectorWave || 1, game.hardMode, game.isChallengeStage);
      if (picked) drops.push(picked);
    }
  }

  drops.forEach((dropType, idx) => {
    const spreadX = drops.length > 1 ? (idx - (drops.length - 1) * 0.5) * 32 : 0;
    // Materializes 1.0 second after enemy is destroyed
    game.pendingCapsuleDrops.push({
      x: clamp(enemy.x + spreadX, 42, LOGICAL_W - 42),
      y: clamp(enemy.y, 60, LOGICAL_H - 120),
      type: dropType,
      timer: CAPSULE_DROP_DELAY + idx * 0.12
    });
  });
}

function capsuleColorForType(type) {
  if (type === 'CYAN') return COLORS.cyan;
  if (type === 'PURPLE') return COLORS.purple;
  if (type === 'YELLOW') return COLORS.yellow;
  if (type === 'CLONE') return COLORS.clonePurple;
  return COLORS.nullRed;
}

export function spawnFighterClones(game) {
  const p = game.player;
  const slots = [
    { role: 'LEFT', ox: -34, oy: 4 },
    { role: 'RIGHT', ox: 34, oy: 4 },
    { role: 'BACK', ox: 0, oy: 30 }
  ];
  game.fighterClones = slots.map((slot, idx) => ({
    id: idx + 1,
    role: slot.role,
    ox: slot.ox,
    oy: slot.oy,
    x: clamp(p.x + slot.ox, 20, LOGICAL_W - 20),
    y: clamp(p.y + slot.oy, 360, LOGICAL_H - 18),
    hp: CLONE_HP,
    maxHp: CLONE_HP,
    tetherTimer: CLONE_BREAKOFF_TIME,
    detached: false,
    invulnTimer: 0,
    hitFlash: 0,
    fireCooldown: 0.14 + idx * 0.08,
    patrolPhase: idx * 2.1,
    targetX: clamp(p.x + slot.ox, 32, LOGICAL_W - 32),
    targetY: clamp(p.y - 34 + idx * 22, 385, LOGICAL_H - 36)
  }));
  game.cloneTimer = CLONE_DURATION;
  game.synth.playCloneSpawn();
}

export function spawnCapsule(game, x, y, type, mode = 'DROP', glowReward = null) {
  game.synth.playCapsuleSpawn();
  const col = capsuleColorForType(type);
  const { minX, maxX, minY, maxY } = CAPSULE_BOUNDS;
  const targetX = minX + Math.random() * (maxX - minX);
  const targetY = minY + Math.random() * (maxY - minY);

  if (mode === 'FLOAT') {
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -18 : LOGICAL_W + 18;
    const startY = minY + 24 + Math.random() * (maxY - minY - 48);
    const dx = targetX - startX;
    const dy = targetY - startY;
    const d = Math.max(1, Math.hypot(dx, dy));
    game.capsules.push({
      type,
      mode: 'FLOAT',
      glowReward,
      x: startX,
      y: startY,
      vx: (dx / d) * 105,
      vy: (dy / d) * 105,
      targetX,
      targetY,
      enteredArena: false,
      wanderTimer: 1.0 + Math.random() * 0.9,
      age: 0,
      driftClock: 0,
      maxLife: 16.0,
      hitRadius: 21
    });

    const driftLabel = type === 'CYAN'
      ? 'HOMING CAPSULE — SHOOT!'
      : (type === 'PURPLE'
        ? 'ARC WAVE CAPSULE — SHOOT!'
        : (type === 'YELLOW'
          ? 'LIGHTNING CAPSULE — SHOOT!'
          : (type === 'CLONE' ? 'CLONE CAPSULE — SHOOT!' : 'LASER CAPSULE — SHOOT!')));
    game.spawnPopup(LOGICAL_W * 0.5, startY - 26, driftLabel, col, 1.35);
  } else if (mode === 'SANDBOX_PLACE') {
    const px = clamp(x, 28, LOGICAL_W - 28);
    const py = clamp(y, 58, LOGICAL_H - 96);
    game.capsules.push({
      type,
      mode: 'SANDBOX_PLACE',
      sandboxPinned: true,
      anchorX: px,
      anchorY: py,
      glowReward,
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      targetX: px,
      targetY: py,
      enteredArena: true,
      wanderTimer: 99,
      age: 0,
      driftClock: 0,
      maxLife: 9999,
      hitRadius: 21
    });
    game.spawnDeleteBurst(px, py, col, 10, 105);
  } else {
    const startX = clamp(x, 66, LOGICAL_W - 66);
    const startY = clamp(y, 130, maxY);
    const alreadyInArena = startX >= minX && startX <= maxX && startY >= minY && startY <= maxY;
    const randAngle = Math.random() * Math.PI * 2;
    const driftSpd = 52 + Math.random() * 28;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const d = Math.max(1, Math.hypot(dx, dy));

    game.capsules.push({
      type,
      mode: 'DROP',
      glowReward,
      x: startX,
      y: startY,
      vx: alreadyInArena ? Math.cos(randAngle) * driftSpd : (dx / d) * 105,
      vy: alreadyInArena ? Math.sin(randAngle) * driftSpd : (dy / d) * 105,
      targetX,
      targetY,
      enteredArena: alreadyInArena,
      wanderTimer: 0.9 + Math.random() * 1.1,
      age: 0,
      driftClock: 0,
      maxLife: glowReward ? 20.0 : 15.0,
      hitRadius: 21
    });
    game.spawnDeleteBurst(startX, startY, col, glowReward ? 16 : 8, glowReward ? 130 : 90);
  }
}

export function destroyAndCollectCapsule(game, capIdx) {
  const cap = game.capsules[capIdx];
  if (!cap) return;
  game.capsules.splice(capIdx, 1);
  // Restart Master 10-kill streak counter after obtaining the glowing reward capsule
  if (cap.glowReward === 'FLUX') {
    game.masterFluxStreak = 0;
    game.masterFluxRewardSpawned = false;
  } else if (cap.glowReward === 'NULL') {
    game.masterNullStreak = 0;
    game.masterNullRewardSpawned = false;
  }
  const col = capsuleColorForType(cap.type);
  game.spawnDeleteBurst(cap.x, cap.y, col, 14, 150);
  collectCapsule(game, cap);
}

export function collectCapsule(game, cap) {
  const activeBefore = getActivePowerups(game);
  const alreadyHasSame = activeBefore.includes(cap.type);
  const isStacking = !alreadyHasSame && activeBefore.length > 0;

  game.synth.playPowerupPickup(cap.type);
  const col = capsuleColorForType(cap.type);
  game.spawnDeleteBurst(cap.x, cap.y, col, 16, 150);

  if (!game.powerup.order.includes(cap.type)) {
    game.powerup.order.push(cap.type);
  }
  game.powerup.slots[cap.type] = POWERUP_MAX_ENERGY;

  if (cap.type === 'PURPLE') {
    game.arcWaveState.phase = 'READY';
    game.arcWaveState.wavesFired = 0;
    game.arcWaveState.waveTimer = 0;
    game.arcWaveState.triggerGrace = 0;
    game.arcWaveState.cannonTapGrace = 0;
    game.arcWaveState.firedBulletDuringWaves = false;
    game.arcWaveState.cannonTimer = 0;
    const label = alreadyHasSame
      ? 'ARC WAVE RECHARGED!'
      : (isStacking ? 'STACKED // ARC WAVE!' : 'ARC WAVE CHARGED!');
    game.spawnPopup(game.player.x, game.player.y - 34, label, COLORS.purpleBright, 1.4);
  } else if (cap.type === 'CYAN') {
    const label = alreadyHasSame
      ? 'HOMING RECHARGED 100%'
      : (isStacking ? 'STACKED // HOMING!' : 'HOMING MISSILES!');
    game.spawnPopup(game.player.x, game.player.y - 34, label, col, 1.35);
  } else if (cap.type === 'YELLOW') {
    const label = alreadyHasSame
      ? 'LIGHTNING RECHARGED 100%'
      : (isStacking ? 'STACKED // LIGHTNING!' : 'CHAIN LIGHTNING!');
    game.spawnPopup(game.player.x, game.player.y - 34, label, col, 1.35);
  } else if (cap.type === 'CLONE') {
    spawnFighterClones(game);
    const label = alreadyHasSame
      ? `CLONES REFRESHED ${Math.round(CLONE_DURATION)}s!`
      : (isStacking ? 'STACKED // FIGHTER CLONES!' : 'FIGHTER CLONES x3!');
    game.spawnPopup(game.player.x, game.player.y - 34, label, '#b9a6ff', 1.45);
  } else {
    const label = alreadyHasSame
      ? 'LASER RECHARGED 100%'
      : (isStacking ? 'STACKED // LASER!' : 'CONTINUOUS LASER!');
    game.spawnPopup(game.player.x, game.player.y - 34, label, col, 1.35);
  }

  game.updateStatusPills();
}

export function updatePowerupTimers(game, dt) {
  // Conserved weapons (Cyan/Red/Purple/Yellow) never passively decay;
  // Fighter Clones run a 20.0s timer that PAUSES between sectors, waves, and challenge banners!
  if (hasPowerup(game, 'CLONE')) {
    const inPauseWindow =
      game.sectorPhase === 'BANNER' ||
      game.sectorPhase === 'CHALLENGE_BANNER' ||
      game.sectorPhase === 'CLEARED' ||
      game.sectorPhase === 'WAVE_GAP';

    if (!game.fighterClones || game.fighterClones.length === 0) {
      removePowerupSlot(game, 'CLONE', false);
      return;
    }

    if (!inPauseWindow) {
      game.cloneTimer = Math.max(0, (game.cloneTimer || 0) - dt);
      game.powerup.slots.CLONE = (game.cloneTimer / CLONE_DURATION) * POWERUP_MAX_ENERGY;
      if (game.cloneTimer <= 0.001) {
        for (const cl of game.fighterClones) {
          game.spawnDeleteBurst(cl.x, cl.y, COLORS.clonePurple, 10, 110);
        }
        removePowerupSlot(game, 'CLONE', false);
      }
    }
  }
}

export function updatePowerupCapsules(game, dt) {
  const inTransition =
    game.sectorPhase === 'BANNER' ||
    game.sectorPhase === 'CHALLENGE_BANNER' ||
    game.sectorPhase === 'CLEARED';

  // 1) Process 50% per-wave Floating Capsule spawn (Sec 02 W3+: Cyan; Sec 03: Cyan/Red; Sec 04+/Hard: All 3)
  if (
    game.floatingCapsulePlan &&
    !game.floatingCapsulePlan.spawned &&
    game.sectorPhase === 'COMBAT'
  ) {
    game.floatingCapsulePlan.timer -= dt;
    if (game.floatingCapsulePlan.timer <= 0) {
      game.floatingCapsulePlan.spawned = true;
      const effSec = game.getEffectiveSector ? game.getEffectiveSector() : game.sector;
      const type = pickRandomCapsuleType(effSec, game.sectorWave || 1, game.hardMode, game.isChallengeStage);
      if (type) {
        spawnCapsule(game, 0, 0, type, 'FLOAT');
      }
    }
  }

  // 2) Process 1-second delayed drops from destroyed enemies (paused during sector banners so none are lost)
  if (!inTransition) {
    for (let i = game.pendingCapsuleDrops.length - 1; i >= 0; i--) {
      const pend = game.pendingCapsuleDrops[i];
      pend.timer -= dt;
      if (pend.timer <= 0) {
        spawnCapsule(game, pend.x, pend.y, pend.type, 'DROP', pend.glowReward || null);
        game.pendingCapsuleDrops.splice(i, 1);
      }
    }
  }

  // 3) Update active capsules floating randomly in the mid-arena (persist across sector transitions!)
  const { minX, maxX, minY, maxY } = CAPSULE_BOUNDS;

  for (let i = game.capsules.length - 1; i >= 0; i--) {
    const cap = game.capsules[i];
    cap.driftClock = (cap.driftClock || 0) + dt;
    // Pause despawn aging during CLEARED / BANNER screens so capsules never expire during sector transitions
    if (!inTransition) {
      cap.age += dt;
      if (cap.age >= cap.maxLife) {
        if (cap.glowReward === 'FLUX') {
          game.masterFluxStreak = 0;
          game.masterFluxRewardSpawned = false;
        } else if (cap.glowReward === 'NULL') {
          game.masterNullStreak = 0;
          game.masterNullRewardSpawned = false;
        }
        game.capsules.splice(i, 1);
        continue;
      }
    }

    if (cap.sandboxPinned) {
      cap.x = cap.anchorX;
      cap.y = game.sandboxPauseAnim
        ? cap.anchorY
        : cap.anchorY + Math.sin(cap.driftClock * 3.2) * 4.5;
      continue;
    }

    if (!cap.enteredArena) {
      const dx = cap.targetX - cap.x;
      const dy = cap.targetY - cap.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        cap.vx = (dx / d) * 105;
        cap.vy = (dy / d) * 105;
      }
      cap.x += cap.vx * dt;
      cap.y += (cap.vy + Math.sin(cap.driftClock * 3.4) * 10) * dt;

      if (cap.x >= minX && cap.x <= maxX && cap.y >= minY && cap.y <= maxY) {
        cap.enteredArena = true;
        cap.wanderTimer = 0.25;
      }
    } else {
      cap.wanderTimer -= dt;
      if (cap.wanderTimer <= 0) {
        cap.wanderTimer = 1.3 + Math.random() * 1.3;
        const tx = minX + Math.random() * (maxX - minX);
        const ty = minY + Math.random() * (maxY - minY);
        const dx = tx - cap.x;
        const dy = ty - cap.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const spd = 46 + Math.random() * 34;
        cap.vx = (dx / d) * spd;
        cap.vy = (dy / d) * spd;
      }

      cap.x += cap.vx * dt;
      cap.y += (cap.vy + Math.sin(cap.driftClock * 3.4) * 14) * dt;

      if (cap.x < minX) {
        cap.x = minX;
        cap.vx = Math.abs(cap.vx);
      } else if (cap.x > maxX) {
        cap.x = maxX;
        cap.vx = -Math.abs(cap.vx);
      }
      if (cap.y < minY) {
        cap.y = minY;
        cap.vy = Math.abs(cap.vy);
      } else if (cap.y > maxY) {
        cap.y = maxY;
        cap.vy = -Math.abs(cap.vy);
      }
    }
  }
}
