/* =========================================================================
   ENEMY SPAWNING, SECTORS, CHALLENGE STAGES & UNPREDICTABLE FORMATION / DIVE AI
   ========================================================================= */

import {
  ALPHA_CENTOID_START_SECTOR,
  CENTOID_START_SECTOR,
  CHALLENGE_ELITE_START,
  CHALLENGE_EXTRA_ROUND_START,
  CHALLENGE_INTERVAL,
  CHALLENGE_MASTER_START,
  COLORS,
  ELITE_ABDUCTION_CHANCE,
  ELITE_ENFORCER_HP,
  ELITE_FLUX_START_SECTOR,
  ELITE_FLUX_START_WAVE,
  ELITE_NULL_START_SECTOR,
  ELITE_SURGE_INTERVAL,
  FLOATING_CAPSULE_CHANCE,
  HARD_FIELD_DEBUFF_CHANCE,
  HARD_FIELD_DEBUFF_DUR,
  HARD_FIELD_ELITES_TRIGGER,
  HARD_FIELD_MIN_POWERUPS,
  LOGICAL_H,
  LOGICAL_W,
  MASTER_ENFORCER_HP,
  MASTER_START_SECTOR,
  PULSAR_FIRE_INTERVAL,
  PULSAR_HP,
  PULSAR_START_SECTOR,
  STANDARD_WAVES_PER_SECTOR,
  TRACTOR_INITIAL_DELAY,
  TRACTOR_INTERVAL,
  TRACTOR_MAX_PER_SECTOR,
  TRACTOR_POST_CHALLENGE_CHANCE,
  V1_BUFF_AOE_RADIUS,
  V1_ENFORCER_HP,
  V1_SYNERGY_RADIUS
} from './config.js';
import { clamp, evalCubic, lerp } from './utils.js';
import { getActivePowerups, getUnlockedCapsuleTypes, rollEnemyCapsuleDrop } from './powerups.js';
import {
  handleEnforcerDestroyed,
  spawnEnforcerWing,
  startEnforcerBeam,
  updateCapturedFighterTether,
  updateEnforcerBeamApproach,
  updateEnforcerBeaming
} from './enforcers.js';
import { damageFighterClone } from './projectiles.js';
import {
  applyCostBasedSwaps,
  handleCentoidSegmentDestroyed,
  spawnCentoidChain,
  spawnPulsarDeathSparks,
  updateCentoids,
  updatePulsarAttacks
} from './special_enemies.js';

export const BASE_FORMATION_STYLES = ['PHALANX', 'CHEVRON', 'TWIN_FLANKS', 'DIAMOND', 'ARCH'];
export const CENTOID_FORMATIONS = [
  'CENTOID_SERPENT_NEST',
  'CENTOID_COIL_WALL',
  'CENTOID_GAUNTLET',
  'CENTOID_SWARM_NEXUS'
];
export const PULSAR_FORMATIONS = [
  'PULSAR_TESLA_ARC',
  'PULSAR_STORM_BATTERY',
  'PULSAR_DIAMOND_COIL',
  'PULSAR_TWIN_CONDUIT'
];
export const FORMATION_STYLES = [
  ...BASE_FORMATION_STYLES,
  ...CENTOID_FORMATIONS,
  ...PULSAR_FORMATIONS
];
export const ENTRY_PATTERNS = ['CROSS', 'SPIRAL', 'TOP_DROP', 'PINCER'];
export const SWAY_MODES = ['SWAY', 'FIGURE8', 'COUNTER_ROW', 'ACCORDION'];

const EXTRA_ROUND_MODES = [
  { id: 'DIAMOND_VORTEX', title: 'ORBITAL DIAMOND VORTEX', color: COLORS.cyan },
  { id: 'TWIN_PINCER', title: 'TWIN PINCER SPEARHEAD', color: COLORS.amber },
  { id: 'HELIX_BARRAGE', title: 'DOUBLE HELIX BARRAGE', color: COLORS.purpleBright },
  { id: 'PHALANX_ASSAULT', title: 'IRON PHALANX ASSAULT', color: COLORS.nullRed }
];

function pickDifferent(pool, avoid) {
  const choices = pool.filter(v => v !== avoid);
  return choices[Math.floor(Math.random() * choices.length)] || pool[0];
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function fireAimedBullet(game, x, y, speed, color, angleOffset = 0, leadFactor = 0) {
  const p = game.player;
  if (!p.alive) return;
  let targetX = p.x;
  if (leadFactor > 0) {
    // Predict player lateral movement slightly for sharper pressure
    let playerDir = 0;
    if (game.keys.has('ArrowLeft') || game.keys.has('KeyA')) playerDir -= 1;
    if (game.keys.has('ArrowRight') || game.keys.has('KeyD')) playerDir += 1;
    targetX = clamp(p.x + playerDir * 72 * leadFactor, 26, LOGICAL_W - 26);
  }
  const baseAngle = Math.atan2(p.y - y, targetX - x) + angleOffset;
  game.enemyBullets.push({
    x,
    y,
    vx: Math.cos(baseAngle) * speed,
    vy: Math.sin(baseAngle) * speed,
    color
  });
}

function fireDirectedBullet(game, x, y, angle, speed, color) {
  game.enemyBullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    color
  });
}

function rollFloatingCapsuleForWave(game, effSec, waveNum) {
  const unlocked = getUnlockedCapsuleTypes(effSec, waveNum, game.hardMode, false);
  if (unlocked.length > 0 && Math.random() < FLOATING_CAPSULE_CHANCE) {
    game.floatingCapsulePlan = {
      timer: 3.5 + Math.random() * 4.5,
      spawned: false
    };
  } else {
    game.floatingCapsulePlan = null;
  }
}

function scheduleMidWaveSpawns(game, effSec, style) {
  game.midWaveSpawns = [];
  if (game.sandboxMode && !game.sandboxTrainingRound) return;

  const secForUnlocks = game.hardMode ? Math.max(effSec, 7) : effSec;
  const isCentoidForm = CENTOID_FORMATIONS.includes(style);
  const isPulsarForm = PULSAR_FORMATIONS.includes(style);

  // 1) Normal Centoid (Sec 04+): mostly mid-wave in waves WITHOUT Centoid formations (roll 3x at 20% -> 0-3)
  if (!isCentoidForm && secForUnlocks >= CENTOID_START_SECTOR) {
    let spawned = 0;
    for (let r = 0; r < 3; r++) {
      if (Math.random() < 0.20) {
        game.midWaveSpawns.push({
          timer: 2.2 + spawned * 2.1 + Math.random() * 1.4,
          type: 'CENTOID'
        });
        spawned++;
      }
    }
  }

  // 2) Alpha Centoid (Sec 07+):
  //    - 10% chance (roll 3x -> 0-3) mid-wave in Centoid waves
  //    - 10% chance (roll 4x -> 0-4) mid-fight in formations NOT featuring any Centoids
  if (secForUnlocks >= ALPHA_CENTOID_START_SECTOR) {
    const rolls = isCentoidForm ? 3 : 4;
    let spawned = 0;
    for (let r = 0; r < rolls; r++) {
      if (Math.random() < 0.10) {
        game.midWaveSpawns.push({
          timer: 3.0 + spawned * 2.2 + Math.random() * 1.6,
          type: 'ALPHA_CENTOID'
        });
        spawned++;
      }
    }
  }

  // 3) Pulsar (Sec 07+): 20% chance (roll 5x -> 0-5) mid-fight in formations NOT featuring Pulsars
  if (!isPulsarForm && secForUnlocks >= PULSAR_START_SECTOR) {
    let spawned = 0;
    for (let r = 0; r < 5; r++) {
      if (Math.random() < 0.20) {
        game.midWaveSpawns.push({
          timer: 2.5 + spawned * 1.55 + Math.random() * 1.2,
          type: 'PULSAR'
        });
        spawned++;
      }
    }
  }

  game.midWaveSpawns.sort((a, b) => a.timer - b.timer);
}

export function prepareStandardWave(game, waveNum) {
  const effSec = game.getEffectiveSector ? game.getEffectiveSector() : game.sector;
  const secForUnlocks = game.hardMode ? Math.max(effSec, 7) : effSec;
  game.sectorWave = waveNum;
  game.waveQueue = [];
  game.waveSpawnTimer = 0;
  game.formationClock = 0;

  // Build eligible formation pool by sector unlocks (Base 5 + 4 Centoid Sec 04+ + 4 Pulsar Sec 07+)
  const pool = [...BASE_FORMATION_STYLES];
  if (secForUnlocks >= CENTOID_START_SECTOR) pool.push(...CENTOID_FORMATIONS);
  if (secForUnlocks >= PULSAR_START_SECTOR) pool.push(...PULSAR_FORMATIONS);

  // Fresh formation geometry and sway mode every wave!
  game.formationStyle = pickDifferent(pool, game.lastFormationStyle);
  game.lastFormationStyle = game.formationStyle;
  game.swayMode = pickDifferent(SWAY_MODES, game.swayMode);

  // 20% floating capsule roll every standard wave once unlocked
  rollFloatingCapsuleForWave(game, effSec, waveNum);

  // Elite Enforcers (non-Masters) have a 10% chance per wave to abduct (max 1 per wave)
  game.waveEliteAbductionQueued = Math.random() < ELITE_ABDUCTION_CHANCE;
  game.waveEliteAbductionUsed = false;

  // Schedule mid-wave Centoid / Alpha Centoid / Pulsar spontaneous reinforcements
  scheduleMidWaveSpawns(game, effSec, game.formationStyle);

  buildStandardWaveQueue(game, effSec, waveNum);
}

export function beginSector(game, num) {
  game.sector = num;
  game.isChallengeStage = false;
  game.challengeNum = 0;
  game.challengeSubRound = 0;
  game.challengeExtraRounds = 0;
  game.sectorWave = 1;
  game.sectorTotalWaves = STANDARD_WAVES_PER_SECTOR;

  const effSec = game.getEffectiveSector ? game.getEffectiveSector() : num;
  game.enemies = [];
  game.enemyBullets = [];
  game.enforcerWings = [];
  game.threadTrails = [];
  if (game.centoidChains) game.centoidChains.clear();
  game.electroBalls = [];
  game.pulsarSparks = [];
  game.midWaveSpawns = [];
  // NOTE: game.capsules & game.pendingCapsuleDrops intentionally PERSIST across sector transitions!
  game.activeBeamBoss = null;
  game.sectorTractorCount = 0;
  game.tractorTimer = TRACTOR_INITIAL_DELAY + Math.random() * 4.0;
  game.redLaserActive = false;
  game.redLaserPulseTimer = 0;
  game.activeLaserBeams = [];
  game.synth.stopTractorBeam();

  game.postChallengeAbductionPending = false;
  if (game.justFinishedChallenge) {
    game.justFinishedChallenge = false;
    // After each Challenge stage, an existing V1 Enforcer has an 80% chance to abduct
    if (Math.random() < TRACTOR_POST_CHALLENGE_CHANCE) {
      game.postChallengeAbductionPending = true;
    }
  }

  prepareStandardWave(game, 1);

  const fmtLabel = game.formationStyle.replaceAll('_', ' ');
  game.sectorPhase = 'BANNER';
  game.phaseTimer = 1.9;
  game.bannerTitle = game.sandboxTrainingRound
    ? `TRAINING // ${game.hardMode ? 'HARD ' : ''}SEC ${String(num).padStart(2, '0')}`
    : (game.hardMode
      ? `HARD // SECTOR ${String(num).padStart(2, '0')}`
      : `SECTOR ${String(num).padStart(2, '0')}`);
  game.bannerSub = game.hardMode
    ? (num === 1
      ? 'SEC 06+ INTENSITY // FULL WAVES & MASTERS LIVE'
      : `MASTER FLEET // ${fmtLabel}`)
    : (effSec === 1
      ? 'V1 ENFORCER PATROL INBOUND'
      : (effSec === ELITE_FLUX_START_SECTOR
        ? 'ELITE ENFORCER [FLUX] & CYAN CAPSULES INBOUND'
        : (effSec === ELITE_NULL_START_SECTOR
          ? 'ELITE ENFORCER [NULL] & RED CAPSULES ONLINE'
          : (effSec === 4
            ? 'CENTOIDS & PURPLE ARC WAVE ONLINE'
            : (effSec === MASTER_START_SECTOR
              ? 'WARNING: MASTER ENFORCERS ONLINE'
              : (effSec === PULSAR_START_SECTOR
                ? 'PULSARS, ALPHA CENTOIDS & NEW CAPSULES ONLINE'
                : (effSec > MASTER_START_SECTOR
                  ? `MASTER FLEET // ${fmtLabel}`
                  : `FLEET FORMATION: ${fmtLabel}`)))))));
  game.bannerColor = (game.hardMode || effSec >= MASTER_START_SECTOR)
    ? COLORS.nullRed
    : (effSec === ELITE_NULL_START_SECTOR ? COLORS.nullRed : (effSec === 4 ? COLORS.purple : COLORS.cyan));

  game.synth.playSectorStart(false);
  game.updateHUD();
}

export function beginChallengeStage(game, challengeNum) {
  game.isChallengeStage = true;
  game.challengeNum = challengeNum;
  const effChallenge = game.getEffectiveChallengeNum ? game.getEffectiveChallengeNum() : challengeNum;

  game.enemies = [];
  game.enemyBullets = [];
  game.enforcerWings = [];
  game.threadTrails = [];
  if (game.centoidChains) game.centoidChains.clear();
  game.electroBalls = [];
  game.pulsarSparks = [];
  game.midWaveSpawns = [];
  // Active capsules persist across sector <-> challenge transitions!
  game.floatingCapsulePlan = null;
  game.activeBeamBoss = null;
  game.postChallengeAbductionPending = false;
  game.redLaserActive = false;
  game.redLaserPulseTimer = 0;
  game.activeLaserBeams = [];
  game.synth.stopTractorBeam();
  game.waveQueue = [];
  game.waveSpawnTimer = 0;
  game.formationClock = 0;

  game.challengeHits = 0;
  game.challengeSubRound = 0;
  game.challengeExtraRounds = effChallenge >= 4
    ? 3
    : (effChallenge >= CHALLENGE_EXTRA_ROUND_START ? 2 : 0);

  game.sectorPhase = 'BANNER';
  game.phaseTimer = 1.9;
  game.bannerTitle = game.hardMode
    ? `HARD STREAM // H-CH.${String(challengeNum).padStart(2, '0')}`
    : `DATA STREAM // CH.${String(challengeNum).padStart(2, '0')}`;
  game.bannerSub = effChallenge >= 4
    ? 'OVERDRIVE: 3 GUARDED MASTERS + 3 EXTRA ROUNDS'
    : (effChallenge >= CHALLENGE_MASTER_START
      ? 'CRITICAL: GUARDED MASTER ENFORCERS + 2 EXTRA ROUNDS'
      : (effChallenge >= CHALLENGE_EXTRA_ROUND_START
        ? 'GAUNTLET ALERT: ELITE RAIDERS + 2 EXTRA ROUNDS'
        : `BONUS STAGE // DATA STREAM 0${challengeNum}`));
  game.bannerColor = effChallenge >= CHALLENGE_MASTER_START
    ? COLORS.nullRed
    : (effChallenge >= CHALLENGE_EXTRA_ROUND_START ? COLORS.purpleBright : COLORS.gold);

  buildChallengeWaveQueue(game, effChallenge);
  game.synth.playSectorStart(true);
  game.updateHUD();
}

const TOP_ROW_XS = {
  4: [96, 192, 288, 384],
  5: [74, 157, 240, 323, 406],
  6: [54, 130, 204, 276, 350, 426]
};

export function buildTopRowConfig(sec, waveNum = 4, hardMode = false) {
  const randElite = () => (Math.random() < 0.5 ? 'FLUX_ENFORCER' : 'NULL_ENFORCER');
  const randMaster = () => (Math.random() < 0.5 ? 'MASTER_FLUX_ENFORCER' : 'MASTER_NULL_ENFORCER');
  let types;

  if (hardMode) {
    // Hard Mode (Option A): Masters front-and-center first, then Elites gradually join across Hard Sectors (capped at 5 slots max!)
    if (sec <= MASTER_START_SECTOR) {
      // H01 (eff. Sec 06): 2 Masters + 2 Classics (4 spacious slots)
      types = ['MASTER_FLUX_ENFORCER', 'MASTER_NULL_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER'];
    } else if (sec === MASTER_START_SECTOR + 1) {
      // H02 (eff. Sec 07): 2 Masters + 1 random Elite + 2 Classics (5 slots)
      types = ['MASTER_FLUX_ENFORCER', 'MASTER_NULL_ENFORCER', randElite(), 'V1_ENFORCER', 'V1_ENFORCER'];
    } else {
      // H03+ (eff. Sec 08+): 2 Masters + 2 Elites + 1 Classic (5 slots max — clean spacing!)
      types = ['MASTER_FLUX_ENFORCER', 'MASTER_NULL_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', 'V1_ENFORCER'];
    }
  } else if (sec < ELITE_FLUX_START_SECTOR) {
    // Sector 01: V1 Enforcers only
    types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER'];
  } else if (sec === ELITE_FLUX_START_SECTOR) {
    // Sector 02: Waves 1-2 Classic only; Wave 3 debuts 1 Elite Enforcer [Flux]; Wave 4 escalates to 2 Elite Enforcer [Flux]
    if (waveNum < ELITE_FLUX_START_WAVE) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER'];
    } else if (waveNum === ELITE_FLUX_START_WAVE) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER'];
    } else {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'FLUX_ENFORCER'];
    }
  } else if (sec === ELITE_NULL_START_SECTOR) {
    // Sector 03: Elite Enforcer [Null] debuts; escalates across Waves 1 -> 4
    if (waveNum === 1) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'NULL_ENFORCER'];
    } else if (waveNum === 2 || waveNum === 3) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER'];
    } else {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', 'NULL_ENFORCER'];
    }
  } else if (sec === 4) {
    // Sector 04: Purple Capsules online; balanced Flux & Null escalation across Waves 1 -> 4
    if (waveNum === 1) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', randElite()];
    } else if (waveNum === 2) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER'];
    } else if (waveNum === 3) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', randElite()];
    } else {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', randElite()];
    }
  } else if (sec < MASTER_START_SECTOR) {
    // Sector 05: Heavy Elite escalation (1 -> 2 -> 3 -> 4 Elites)
    if (waveNum === 1) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', randElite()];
    } else if (waveNum === 2) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER'];
    } else if (waveNum === 3) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', randElite()];
    } else {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', 'NULL_ENFORCER'];
    }
  } else {
    // Sector 06+: Master Enforcers escalate across Waves 1 -> 4 (capped at 5 clean slots!)
    if (waveNum === 1) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER'];
    } else if (waveNum === 2) {
      types = ['V1_ENFORCER', 'V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', randMaster()];
    } else if (waveNum === 3) {
      types = sec >= 8
        ? ['V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', 'MASTER_FLUX_ENFORCER', 'MASTER_NULL_ENFORCER']
        : ['V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', randElite(), randMaster()];
    } else {
      types = ['V1_ENFORCER', 'FLUX_ENFORCER', 'NULL_ENFORCER', 'MASTER_FLUX_ENFORCER', 'MASTER_NULL_ENFORCER'];
    }
  }

  // Randomize left-to-right Enforcer placement every wave so Flux/Null never lock into a fixed order!
  return {
    types: shuffleArray(types),
    xs: TOP_ROW_XS[types.length] || TOP_ROW_XS[6]
  };
}

function shapeSlotPosition(style, x, y, rowIdx, colIdx, rowLen) {
  const norm = rowLen > 1 ? (colIdx / (rowLen - 1)) * 2 - 1 : 0; // -1..1
  const absN = Math.abs(norm);

  if (style === 'CHEVRON') {
    return { x, y: y + (1 - absN) * 32 - 12 };
  }
  if (style === 'TWIN_FLANKS') {
    const push = norm === 0 ? 0 : Math.sign(norm) * 26;
    return { x: clamp(x + push, 44, LOGICAL_W - 44), y: y + (absN < 0.35 ? -16 : 8) };
  }
  if (style === 'DIAMOND') {
    const squeeze = rowIdx === 0 || rowIdx === 4 ? 0.78 : (rowIdx === 2 ? 1.06 : 0.92);
    const cx = LOGICAL_W * 0.5;
    return { x: clamp(cx + (x - cx) * squeeze, 44, LOGICAL_W - 44), y: y + absN * 18 - 8 };
  }
  if (style === 'ARCH') {
    return { x, y: y + absN * absN * 34 - 10 };
  }
  return { x, y };
}

function buildEntryPath(entryPattern, squad, homeX, homeY) {
  const fromLeft = squad % 2 === 0;
  const sx = fromLeft ? -32 : LOGICAL_W + 32;

  if (entryPattern === 'SPIRAL') {
    return [
      { x: fromLeft ? 70 : LOGICAL_W - 70, y: -36 },
      { x: fromLeft ? LOGICAL_W - 45 : 45, y: 270 },
      { x: fromLeft ? 95 : LOGICAL_W - 95, y: 360 },
      { x: homeX, y: homeY }
    ];
  }
  if (entryPattern === 'TOP_DROP') {
    return [
      { x: clamp(homeX + (fromLeft ? -90 : 90), 36, LOGICAL_W - 36), y: -34 },
      { x: fromLeft ? 390 : 90, y: 245 },
      { x: fromLeft ? 110 : 370, y: 185 },
      { x: homeX, y: homeY }
    ];
  }
  if (entryPattern === 'PINCER') {
    return [
      { x: sx, y: 320 - squad * 34 },
      { x: fromLeft ? 190 : 290, y: 390 },
      { x: fromLeft ? 375 : 105, y: 175 },
      { x: homeX, y: homeY }
    ];
  }
  // CROSS (classic swoop)
  return [
    { x: sx, y: 120 + squad * 26 },
    { x: fromLeft ? 340 : 140, y: 315 },
    { x: fromLeft ? 120 : 360, y: 205 },
    { x: homeX, y: homeY }
  ];
}

export function buildStandardWaveQueue(game, sec, waveNum = 4, opts = {}) {
  let slots = [];
  const centoidSpawns = [];
  const style = opts.forcedStyle || game.formationStyle || 'PHALANX';
  const entryPattern = opts.forcedEntry || pickDifferent(ENTRY_PATTERNS, game.lastEntryPattern);
  game.lastEntryPattern = entryPattern;
  const fullFormation = !!game.hardMode || waveNum >= STANDARD_WAVES_PER_SECTOR || !!opts.fullFormation;
  const top = buildTopRowConfig(sec, waveNum, !!game.hardMode);
  const secForUnlocks = game.hardMode ? Math.max(sec, 7) : sec;
  const canAlpha = secForUnlocks >= ALPHA_CENTOID_START_SECTOR;

  if (CENTOID_FORMATIONS.includes(style)) {
    // 4 Dedicated Centoid Formations (Sec 04+)
    const topTypes = style === 'CENTOID_GAUNTLET' ? top.types.slice(0, 4) : top.types;
    const topXs = TOP_ROW_XS[topTypes.length] || top.xs;
    topTypes.forEach((type, idx) => {
      slots.push({ type, homeX: topXs[idx], homeY: 88, rowIdx: 0, squad: idx % 2 });
    });

    if (style === 'CENTOID_SERPENT_NEST') {
      centoidSpawns.push(
        { type: 'CENTOID', startX: opts.instant ? 185 : 34, startY: 146, dirX: 1, delay: 0.55 },
        { type: canAlpha && fullFormation ? 'ALPHA_CENTOID' : 'CENTOID', startX: opts.instant ? 295 : LOGICAL_W - 34, startY: 204, dirX: -1, delay: 1.15 }
      );
      [76, 134, 346, 404].forEach((x, idx) => {
        slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: 162, rowIdx: 1, squad: 2 + (idx >= 2 ? 1 : 0) });
        if (fullFormation || waveNum >= 2) {
          slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: 208, rowIdx: 2, squad: 2 + (idx >= 2 ? 1 : 0) });
        }
      });
      for (let c = 0; c < 6; c++) {
        slots.push({ type: 'DRONE', homeX: 88 + c * 61, homeY: 262, rowIdx: 3, squad: 4 + (c % 2) });
      }
    } else if (style === 'CENTOID_COIL_WALL') {
      centoidSpawns.push(
        { type: canAlpha ? 'ALPHA_CENTOID' : 'CENTOID', startX: opts.instant ? 200 : 34, startY: 160, dirX: 1, delay: 0.45 },
        { type: 'CENTOID', startX: opts.instant ? 280 : LOGICAL_W - 34, startY: 222, dirX: -1, delay: 1.05 }
      );
      // Central Interceptor spearhead
      [172, 218, 262, 308].forEach((x, c) => {
        slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: 148 + (c === 1 || c === 2 ? -10 : 10), rowIdx: 1, squad: 2 });
      });
      // Outer Drone flank walls
      for (let r = 0; r < 2; r++) {
        [58, 104, 376, 422].forEach((x, c) => {
          slots.push({ type: 'DRONE', homeX: x, homeY: 192 + r * 44, rowIdx: 2 + r, squad: 4 + (c >= 2 ? 1 : 0) });
        });
      }
    } else if (style === 'CENTOID_GAUNTLET') {
      centoidSpawns.push(
        { type: 'CENTOID', startX: opts.instant ? 180 : 34, startY: 126, dirX: 1, delay: 0.35 },
        { type: canAlpha ? 'ALPHA_CENTOID' : 'CENTOID', startX: opts.instant ? 300 : LOGICAL_W - 34, startY: 184, dirX: -1, delay: 0.90 },
        { type: 'CENTOID', startX: opts.instant ? 180 : 34, startY: 242, dirX: 1, delay: 1.45 }
      );
      [96, 152, 328, 384].forEach((x, idx) => {
        slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: 154, rowIdx: 1, squad: 2 + (idx >= 2 ? 1 : 0) });
      });
      for (let c = 0; c < 6; c++) {
        slots.push({ type: 'DRONE', homeX: 84 + c * 62, homeY: 278, rowIdx: 3, squad: 4 + (c % 2) });
      }
    } else {
      // CENTOID_SWARM_NEXUS
      centoidSpawns.push(
        { type: canAlpha ? 'ALPHA_CENTOID' : 'CENTOID', startX: opts.instant ? 190 : 34, startY: 144, dirX: 1, delay: 0.50 },
        { type: 'CENTOID', startX: opts.instant ? 290 : LOGICAL_W - 34, startY: 248, dirX: -1, delay: 1.10 }
      );
      const diamInterceptors = [
        [240, 146], [186, 178], [294, 178], [146, 212], [334, 212], [240, 214]
      ];
      diamInterceptors.forEach(([x, y], idx) => {
        slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: y, rowIdx: 1 + (idx % 2), squad: 2 + (idx % 2) });
      });
      [92, 152, 210, 270, 328, 388].forEach((x, idx) => {
        slots.push({ type: 'DRONE', homeX: x, homeY: 274 - Math.abs(idx - 2.5) * 8, rowIdx: 3, squad: 4 + (idx % 2) });
      });
    }
  } else if (PULSAR_FORMATIONS.includes(style)) {
    // 4 Dedicated Pulsar Formations (Sec 07+ / Hard Mode)
    if (style === 'PULSAR_TESLA_ARC') {
      top.types.forEach((type, idx) => {
        slots.push({ type, homeX: top.xs[idx], homeY: 86, rowIdx: 0, squad: idx % 2 });
      });
      const arcCoords = [[82, 172], [184, 144], [296, 144], [398, 172]];
      arcCoords.forEach(([x, y], idx) => {
        slots.push({ type: 'PULSAR', homeX: x, homeY: y, rowIdx: 1, squad: 2 + (idx >= 2 ? 1 : 0) });
      });
      for (let c = 0; c < 6; c++) {
        const norm = (c / 5) * 2 - 1;
        slots.push({ type: 'INTERCEPTOR', homeX: 80 + c * 64, homeY: 214 + norm * norm * 22, rowIdx: 2, squad: 2 + (c >= 3 ? 1 : 0) });
      }
      for (let c = 0; c < 8; c++) {
        const norm = (c / 7) * 2 - 1;
        slots.push({ type: 'DRONE', homeX: 54 + c * 53, homeY: 266 + norm * norm * 16, rowIdx: 3, squad: 4 + (c % 2) });
      }
    } else if (style === 'PULSAR_STORM_BATTERY') {
      // Compact central Enforcer core flanked by twin 2x2 Pulsar batteries!
      const coreTypes = top.types.slice(0, 4);
      [162, 214, 266, 318].forEach((x, idx) => {
        if (coreTypes[idx]) slots.push({ type: coreTypes[idx], homeX: x, homeY: 90, rowIdx: 0, squad: idx % 2 });
      });
      const batteries = [[70, 142], [126, 194], [354, 194], [410, 142]];
      batteries.forEach(([x, y], idx) => {
        slots.push({ type: 'PULSAR', homeX: x, homeY: y, rowIdx: 1, squad: 2 + (idx >= 2 ? 1 : 0) });
      });
      for (let r = 0; r < 2; r++) {
        [182, 240, 298].forEach((x, c) => {
          slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: 158 + r * 44, rowIdx: 1 + r, squad: 2 + (c % 2) });
        });
      }
      for (let c = 0; c < 6; c++) {
        slots.push({ type: 'DRONE', homeX: 80 + c * 64, homeY: 256, rowIdx: 3, squad: 4 + (c % 2) });
      }
    } else if (style === 'PULSAR_DIAMOND_COIL') {
      const top4 = top.types.slice(0, 4);
      [74, 154, 326, 406].forEach((x, idx) => {
        if (top4[idx]) slots.push({ type: top4[idx], homeX: x, homeY: 92, rowIdx: 0, squad: idx % 2 });
      });
      // Iconic electric diamond of 4 Pulsars!
      const diamond = [[240, 126], [124, 186], [356, 186], [240, 244]];
      diamond.forEach(([x, y], idx) => {
        slots.push({ type: 'PULSAR', homeX: x, homeY: y, rowIdx: 1 + (idx > 0 ? 1 : 0), squad: 2 + (idx % 2) });
      });
      [[182, 156], [298, 156], [182, 218], [298, 218], [64, 218], [416, 218]].forEach(([x, y], idx) => {
        slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: y, rowIdx: 2, squad: 2 + (idx % 2) });
      });
      for (let c = 0; c < 6; c++) {
        slots.push({ type: 'DRONE', homeX: 80 + c * 64, homeY: 282, rowIdx: 3, squad: 4 + (c % 2) });
      }
    } else {
      // PULSAR_TWIN_CONDUIT
      const midTop = top.types.slice(0, 4);
      [158, 212, 268, 322].forEach((x, idx) => {
        if (midTop[idx]) slots.push({ type: midTop[idx], homeX: x, homeY: 88, rowIdx: 0, squad: idx % 2 });
      });
      const conduitRows = fullFormation ? [132, 192, 252] : [144, 214];
      conduitRows.forEach((y, r) => {
        slots.push({ type: 'PULSAR', homeX: 82, homeY: y, rowIdx: 1 + r, squad: 2 });
        slots.push({ type: 'PULSAR', homeX: 398, homeY: y, rowIdx: 1 + r, squad: 3 });
      });
      for (let r = 0; r < 2; r++) {
        [164, 214, 266, 316].forEach((x, c) => {
          slots.push({ type: 'INTERCEPTOR', homeX: x, homeY: 146 + r * 44, rowIdx: 1 + r, squad: 2 + (c >= 2 ? 1 : 0) });
        });
      }
      for (let c = 0; c < 6; c++) {
        slots.push({ type: 'DRONE', homeX: 140 + c * 40, homeY: 244 + (c % 2) * 26, rowIdx: 3, squad: 4 + (c % 2) });
      }
    }
  } else {
    // 5 Base Formations: PHALANX, CHEVRON, TWIN_FLANKS, DIAMOND, ARCH
    top.types.forEach((type, idx) => {
      const pos = shapeSlotPosition(style, top.xs[idx], 92, 0, idx, top.types.length);
      slots.push({ type, homeX: pos.x, homeY: pos.y, rowIdx: 0, squad: idx % 2 });
    });

    // Interceptors: Wave 1 = 1 row (6); Waves 2-4 & Hard Mode = 2 full rows (12)
    const interceptorRows = (fullFormation || waveNum >= 2) ? 2 : 1;
    for (let r = 0; r < interceptorRows; r++) {
      for (let c = 0; c < 6; c++) {
        const pos = shapeSlotPosition(style, 80 + c * 64, 152 + r * 42, 1 + r, c, 6);
        slots.push({
          type: 'INTERCEPTOR',
          homeX: pos.x,
          homeY: pos.y,
          rowIdx: 1 + r,
          squad: 2 + (c >= 3 ? 1 : 0)
        });
      }
    }

    // Drones: Wave 1-2 = 1 row (8); Wave 3 = 1 full + 4 inner (12); Wave 4 & Hard Mode = 2 full rows (16)
    const droneRowStartY = interceptorRows === 1 ? 210 : 238;
    const droneRows = (fullFormation || waveNum >= 3) ? 2 : 1;
    for (let r = 0; r < droneRows; r++) {
      const partialSecondRow = !fullFormation && waveNum === 3 && r === 1;
      const cols = partialSecondRow ? [2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7];
      for (const c of cols) {
        const pos = shapeSlotPosition(style, 54 + c * 53, droneRowStartY + r * 38, 3 + r, c, 8);
        slots.push({
          type: 'DRONE',
          homeX: pos.x,
          homeY: pos.y,
          rowIdx: 3 + r,
          squad: 4 + (c % 2)
        });
      }
    }
  }

  // Cost-Based Enemy Swap System (5% per mob per wave, strictly +-1 tier!)
  if (!opts.skipSwaps) {
    slots = applyCostBasedSwaps(slots, sec, !!game.hardMode);
  }

  // Extract any Centoid / Alpha Centoid created by cost swaps into centoidSpawns
  const regularSlots = [];
  for (const s of slots) {
    if (s.type === 'CENTOID' || s.type === 'ALPHA_CENTOID') {
      centoidSpawns.push({
        type: s.type,
        startX: opts.instant ? clamp(s.homeX, 110, LOGICAL_W - 110) : (s.homeX < LOGICAL_W * 0.5 ? 34 : LOGICAL_W - 34),
        startY: clamp(s.homeY, 86, 240),
        dirX: s.homeX < LOGICAL_W * 0.5 ? 1 : -1,
        delay: 0.65 + centoidSpawns.length * 0.55
      });
    } else {
      regularSlots.push(s);
    }
  }

  regularSlots.sort((a, b) => a.squad - b.squad);
  const entryDur = Math.max(1.12, 1.46 - sec * 0.025);

  if (opts.instant) {
    // Instant Sandbox deployment — place directly in FORMATION without entry swoop!
    for (const s of regularSlots) {
      spawnEnemyFromItem(game, {
        type: s.type,
        homeX: s.homeX,
        homeY: s.homeY,
        rowIdx: s.rowIdx,
        path: null,
        instant: true,
        challenge: false,
        challengeElite: false
      });
    }
    for (const cs of centoidSpawns) {
      spawnCentoidChain(game, cs.type === 'ALPHA_CENTOID', cs.startX, cs.startY, cs.dirX);
    }
    game.waveQueue = [];
    game.waveSpawnTimer = 0;
    return;
  }

  regularSlots.forEach((s, i) => {
    const path = buildEntryPath(entryPattern, s.squad, s.homeX, s.homeY);
    game.waveQueue.push({
      delay: 0.20 + i * 0.09,
      type: s.type,
      homeX: s.homeX,
      homeY: s.homeY,
      rowIdx: s.rowIdx,
      path,
      pathDur: entryDur,
      challenge: false,
      challengeElite: false
    });
  });

  centoidSpawns.forEach((cs) => {
    game.waveQueue.push({
      delay: cs.delay,
      type: cs.type,
      isCentoidSpawn: true,
      startX: cs.startX,
      startY: cs.startY,
      dirX: cs.dirX,
      homeX: cs.startX,
      homeY: cs.startY,
      challenge: false,
      challengeElite: false
    });
  });

  game.waveQueue.sort((a, b) => a.delay - b.delay);
  game.waveSpawnTimer = 0;
}

export function buildChallengeWaveQueue(game, challengeNum) {
  const types = ['DRONE', 'INTERCEPTOR', 'V1_ENFORCER', 'INTERCEPTOR', 'DRONE'];
  game.challengeTotal = 40;

  for (let s = 0; s < 5; s++) {
    const fromLeft = s % 2 === 0;
    for (let i = 0; i < 8; i++) {
      const p0 = { x: fromLeft ? -26 : LOGICAL_W + 26, y: 90 + (s * 42) };
      const p1 = { x: fromLeft ? 380 : 100, y: 260 + (i % 2) * 45 };
      const p2 = { x: fromLeft ? 90 : 390, y: 420 };
      const p3 = { x: fromLeft ? LOGICAL_W + 36 : -36, y: 160 + (s * 30) };
      game.waveQueue.push({
        delay: s * 2.3 + i * 0.15,
        type: types[s],
        homeX: p3.x,
        homeY: p3.y,
        path: [p0, p1, p2, p3],
        challenge: true,
        challengeElite: false
      });
    }
  }

  // Starting at Challenge 2 (after Sec 04): 2x HP Elite Raiders;
  // Starting at Challenge 3 (after Sec 06) / Hard Mode H-CH.01+: Guarded Master Enforcer Battle Groups!
  if (challengeNum >= CHALLENGE_ELITE_START) {
    const eliteRaids = challengeNum === CHALLENGE_ELITE_START
      ? [
          { delay: 2.2, type: 'FLUX_ENFORCER', dir: 1, laneY: 98, speed: 64 },
          { delay: 6.2, type: 'NULL_ENFORCER', dir: -1, laneY: 148, speed: 64 }
        ]
      : (challengeNum >= 4
        ? [
            // Normal Ch.4+ / Hard Mode H-CH.02+: 3 Guarded Master Enforcer Battle Groups!
            { delay: 1.8, type: 'MASTER_FLUX_ENFORCER', dir: 1, laneY: 96, speed: 54, guardGroup: 'MASTER_G1' },
            { delay: 5.4, type: 'MASTER_NULL_ENFORCER', dir: -1, laneY: 146, speed: 54, guardGroup: 'MASTER_G2' },
            { delay: 9.0, type: challengeNum % 2 === 0 ? 'MASTER_NULL_ENFORCER' : 'MASTER_FLUX_ENFORCER', dir: 1, laneY: 186, speed: 56, guardGroup: 'MASTER_G3' }
          ]
        : [
            // Normal Ch.3 (after Sec 06) & Hard Mode H-CH.01: Elite Raider + 2 Guarded Master Enforcers!
            { delay: 1.6, type: challengeNum % 2 === 0 ? 'NULL_ENFORCER' : 'FLUX_ENFORCER', dir: 1, laneY: 86, speed: 64 },
            { delay: 4.2, type: 'MASTER_FLUX_ENFORCER', dir: 1, laneY: 132, speed: 52, guardGroup: 'MASTER_G1' },
            { delay: 8.4, type: 'MASTER_NULL_ENFORCER', dir: -1, laneY: 158, speed: 52, guardGroup: 'MASTER_G2' }
          ]);

    const guardOffsets = [
      { ox: 0, oy: 50, type: 'INTERCEPTOR' },
      { ox: -44, oy: 36, type: 'INTERCEPTOR' },
      { ox: 44, oy: 36, type: 'INTERCEPTOR' },
      { ox: -62, oy: -4, type: 'DRONE' },
      { ox: 62, oy: -4, type: 'DRONE' }
    ];

    for (const raid of eliteRaids) {
      game.challengeTotal++;
      const startX = raid.dir > 0 ? -48 : LOGICAL_W + 48;
      game.waveQueue.push({
        delay: raid.delay,
        type: raid.type,
        homeX: LOGICAL_W * 0.5,
        homeY: raid.laneY,
        path: null,
        challenge: true,
        challengeElite: true,
        startX,
        raidDir: raid.dir,
        raidLaneY: raid.laneY,
        raidSpeed: raid.speed,
        guardGroup: raid.guardGroup || null
      });

      // Spawn a tight protective escort formation shielding each Challenge 5+ Master Enforcer
      if (raid.guardGroup) {
        guardOffsets.forEach((gOff, gIdx) => {
          game.challengeTotal++;
          game.waveQueue.push({
            delay: raid.delay + 0.04,
            type: gOff.type,
            homeX: LOGICAL_W * 0.5,
            homeY: raid.laneY + gOff.oy,
            path: null,
            challenge: true,
            challengeGuard: true,
            startX: startX + gOff.ox,
            startY: raid.laneY + gOff.oy,
            guardTargetGroup: raid.guardGroup,
            guardOx: gOff.ox,
            guardOy: gOff.oy,
            guardIdx: gIdx,
            raidDir: raid.dir
          });
        });
      }
    }
    game.waveQueue.sort((a, b) => a.delay - b.delay);
  }

  game.waveSpawnTimer = 0;
}

/**
 * Challenges 4+: Builds 1 of 2 extra tactical rounds featuring unique battle formations
 * and active attack patterns!
 */
export function startChallengeExtraRound(game, effChallengeNum, subRound) {
  const modeIdx = ((effChallengeNum - CHALLENGE_EXTRA_ROUND_START) * 2 + (subRound - 1)) % EXTRA_ROUND_MODES.length;
  const mode = EXTRA_ROUND_MODES[modeIdx];
  const hardEscalated = effChallengeNum >= 4; // Normal Ch.4+ & Hard H-CH.02+ escalate with Master escorts!

  game.waveQueue = [];
  game.waveSpawnTimer = 0;
  game.sectorPhase = 'CHALLENGE_BANNER';
  game.phaseTimer = 1.65;
  const chPrefix = game.hardMode ? `H-CH.${String(game.challengeNum).padStart(2, '0')}` : `CH.${String(game.challengeNum).padStart(2, '0')}`;
  game.bannerTitle = `${chPrefix} // EXTRA ROUND ${subRound}/${game.challengeExtraRounds}`;
  game.bannerSub = hardEscalated ? `${mode.title} [MASTER ESCORT]` : mode.title;
  game.bannerColor = mode.color;
  game.synth.playSectorStart(true);

  const items = [];

  if (mode.id === 'DIAMOND_VORTEX') {
    // 10 ships lock into a rotating orbital diamond around center screen firing radial salvos before peeling off
    const roster = [
      'V1_ENFORCER', 'INTERCEPTOR', 'DRONE', 'INTERCEPTOR', 'DRONE',
      'V1_ENFORCER', 'INTERCEPTOR', 'DRONE', 'INTERCEPTOR', 'DRONE'
    ];
    roster.forEach((type, i) => {
      const baseAngle = (i / roster.length) * Math.PI * 2;
      items.push({
        delay: 0.15 + i * 0.14,
        type,
        homeX: LOGICAL_W * 0.5,
        homeY: 210,
        startX: i % 2 === 0 ? -34 : LOGICAL_W + 34,
        startY: 70 + (i % 5) * 32,
        challenge: true,
        challengeExtra: true,
        extraPattern: 'DIAMOND_VORTEX',
        extraData: {
          clock: 0,
          baseAngle,
          orbitRx: 145,
          orbitRy: 88,
          orbitDir: subRound % 2 === 0 ? -1 : 1,
          peelDelay: 4.5 + i * 0.24,
          shotTimer: 1.55 + (i % 4) * 0.35,
          exitVx: (i % 2 === 0 ? 1 : -1) * (55 + (i % 3) * 35),
          exitVy: 270
        }
      });
    });
  } else if (mode.id === 'TWIN_PINCER') {
    // Two mirrored V-spearhead wings hold flanking crossfire then scissor across the playfield
    const wingTypes = ['V1_ENFORCER', 'INTERCEPTOR', 'INTERCEPTOR', 'DRONE', 'DRONE', 'DRONE'];
    for (const side of [-1, 1]) {
      wingTypes.forEach((type, idx) => {
        const holdX = side < 0 ? 78 + (idx % 3) * 34 : LOGICAL_W - 78 - (idx % 3) * 34;
        const holdY = 110 + Math.floor(idx / 3) * 52 + (idx % 3) * 22;
        items.push({
          delay: 0.18 + idx * 0.16,
          type,
          homeX: holdX,
          homeY: holdY,
          startX: side < 0 ? -36 : LOGICAL_W + 36,
          startY: 64 + idx * 24,
          challenge: true,
          challengeExtra: true,
          extraPattern: 'TWIN_PINCER',
          extraData: {
            clock: 0,
            side,
            holdX,
            holdY,
            holdDur: 2.3 + idx * 0.16,
            shotTimer: 1.05 + idx * 0.24,
            scissorAngle: side < 0 ? Math.PI * 0.32 : Math.PI * 0.68
          }
        });
      });
    }
  } else if (mode.id === 'HELIX_BARRAGE') {
    // 12 interwoven ships descend in a double-helix DNA wave + 1 Elite Enforcer escort
    for (let i = 0; i < 12; i++) {
      const strand = i % 2;
      const type = i % 3 === 0 ? 'INTERCEPTOR' : 'DRONE';
      items.push({
        delay: 0.2 + Math.floor(i / 2) * 0.42 + strand * 0.1,
        type,
        homeX: LOGICAL_W * 0.5,
        homeY: 160,
        startX: LOGICAL_W * 0.5 + (strand === 0 ? -130 : 130),
        startY: -30,
        challenge: true,
        challengeExtra: true,
        extraPattern: 'HELIX_BARRAGE',
        extraData: {
          clock: 0,
          phase: strand * Math.PI,
          amp: 148,
          vy: 112,
          shotTimer: 0.95 + (i % 3) * 0.35
        }
      });
    }
    // Escort Elite Enforcer raider sweeping across the top
    const eliteType = effChallengeNum % 2 === 0 ? 'FLUX_ENFORCER' : 'NULL_ENFORCER';
    items.push({
      delay: 1.4,
      type: eliteType,
      homeX: LOGICAL_W * 0.5,
      homeY: 102,
      path: null,
      challenge: true,
      challengeElite: true,
      startX: -44,
      raidDir: 1,
      raidLaneY: 102,
      raidSpeed: 64
    });
  } else {
    // PHALANX_ASSAULT: Fortified advancing battle wall + outer S-loop flankers (randomized Flux/Null order!)
    const wallTypes = shuffleArray(['V1_ENFORCER', 'FLUX_ENFORCER', 'V1_ENFORCER', 'NULL_ENFORCER', 'V1_ENFORCER']);
    const wallXs = [86, 163, 240, 317, 394];
    wallTypes.forEach((type, idx) => {
      items.push({
        delay: 0.25 + idx * 0.12,
        type,
        homeX: wallXs[idx],
        homeY: 90,
        startX: wallXs[idx],
        startY: -36,
        challenge: true,
        challengeExtra: true,
        extraPattern: 'PHALANX_ASSAULT',
        extraData: {
          clock: 0,
          role: 'WALL',
          laneX: wallXs[idx],
          shotTimer: 1.15 + (idx % 2) * 0.45,
          wingFired: false
        }
      });
    });

    for (let f = 0; f < 6; f++) {
      const side = f % 2 === 0 ? -1 : 1;
      items.push({
        delay: 0.9 + f * 0.55,
        type: 'INTERCEPTOR',
        homeX: side < 0 ? 52 : LOGICAL_W - 52,
        homeY: 120,
        startX: side < 0 ? 42 : LOGICAL_W - 42,
        startY: -32,
        challenge: true,
        challengeExtra: true,
        extraPattern: 'PHALANX_ASSAULT',
        extraData: {
          clock: 0,
          role: 'FLANKER',
          side,
          shotTimer: 0.72
        }
      });
    }
  }

  // H-CH.02+ / Ch.6+ Extra Rounds also include an escalated Master Enforcer escort!
  if (hardEscalated && mode.id !== 'HELIX_BARRAGE') {
    const escortType = (effChallengeNum + subRound) % 2 === 0 ? 'MASTER_NULL_ENFORCER' : 'MASTER_FLUX_ENFORCER';
    const dir = subRound % 2 === 0 ? -1 : 1;
    items.push({
      delay: 1.5,
      type: escortType,
      homeX: LOGICAL_W * 0.5,
      homeY: 96,
      path: null,
      challenge: true,
      challengeElite: true,
      startX: dir > 0 ? -48 : LOGICAL_W + 48,
      raidDir: dir,
      raidLaneY: 96,
      raidSpeed: 58
    });
  }

  items.sort((a, b) => a.delay - b.delay);
  game.challengeTotal += items.length;
  game.waveQueue = items;
}

function getInitialDiveHold(type) {
  if (type === 'MASTER_FLUX_ENFORCER' || type === 'MASTER_NULL_ENFORCER') {
    return 8.5 + Math.random() * 3.5;
  }
  if (type === 'FLUX_ENFORCER' || type === 'NULL_ENFORCER' || type === 'PULSAR') {
    return 5.5 + Math.random() * 2.5;
  }
  return 0;
}

function getRediveHold(type) {
  if (type === 'MASTER_FLUX_ENFORCER' || type === 'MASTER_NULL_ENFORCER') {
    return 6.5 + Math.random() * 3.0;
  }
  if (type === 'FLUX_ENFORCER' || type === 'NULL_ENFORCER' || type === 'PULSAR') {
    return 4.5 + Math.random() * 2.5;
  }
  return 0;
}

export function spawnEnemyFromItem(game, item) {
  if (item.isCentoidSpawn || item.type === 'CENTOID' || item.type === 'ALPHA_CENTOID') {
    spawnCentoidChain(
      game,
      item.type === 'ALPHA_CENTOID',
      item.startX !== undefined ? item.startX : null,
      item.startY !== undefined ? item.startY : (item.homeY !== undefined ? item.homeY : null),
      item.dirX !== undefined ? item.dirX : null
    );
    return;
  }

  const isEnforcer = item.type.endsWith('_ENFORCER');
  const isPulsar = item.type === 'PULSAR';
  const isMaster = item.type === 'MASTER_FLUX_ENFORCER' || item.type === 'MASTER_NULL_ENFORCER';
  const isElite = isMaster || item.type === 'FLUX_ENFORCER' || item.type === 'NULL_ENFORCER' || isPulsar;
  const isChallengeElite = !!item.challengeElite;
  const isChallengeExtra = !!item.challengeExtra;
  const isChallengeGuard = !!item.challengeGuard;

  // Master = 18 HP; Elite / Pulsar = 6 HP (12 in Ch.2+ Raiders); Advanced V1 Enforcer = 3 HP
  const maxHp = isMaster
    ? MASTER_ENFORCER_HP
    : (isPulsar
      ? PULSAR_HP
      : (isChallengeElite
        ? ELITE_ENFORCER_HP * 2
        : (isChallengeGuard
          ? (item.type === 'INTERCEPTOR' ? 2 : 1)
          : (isChallengeExtra
            ? (isElite ? ELITE_ENFORCER_HP : (item.type === 'V1_ENFORCER' ? V1_ENFORCER_HP : 1))
            : (item.challenge
              ? 1
              : (isElite ? ELITE_ENFORCER_HP : (item.type === 'V1_ENFORCER' ? V1_ENFORCER_HP : 1)))))));

  const ptsForm = isMaster
    ? (isChallengeElite ? 2500 : (item.type === 'MASTER_NULL_ENFORCER' ? 850 : 750))
    : (isPulsar
      ? 380
      : (isChallengeElite ? 1500 : (isChallengeGuard ? 250 : (isChallengeExtra
        ? (isElite ? 900 : (isEnforcer ? 350 : 200))
        : (item.challenge ? 100 : (
          item.type === 'NULL_ENFORCER' ? 400 :
          item.type === 'FLUX_ENFORCER' ? 350 :
          item.type === 'V1_ENFORCER' ? 150 :
          item.type === 'INTERCEPTOR' ? 80 : 50
        ))))));
  const ptsDive = isMaster
    ? (isChallengeElite ? 2500 : (item.type === 'MASTER_NULL_ENFORCER' ? 2000 : 1800))
    : (isPulsar
      ? 950
      : (isChallengeElite ? 1500 : (isChallengeGuard ? 250 : (isChallengeExtra
        ? ptsForm
        : (item.challenge ? 100 : (
          item.type === 'NULL_ENFORCER' ? 1000 :
          item.type === 'FLUX_ENFORCER' ? 900 :
          item.type === 'V1_ENFORCER' ? 400 :
          item.type === 'INTERCEPTOR' ? 160 : 100
        ))))));

  const startX = item.instant
    ? item.homeX
    : ((isChallengeElite || isChallengeExtra || isChallengeGuard) ? item.startX : item.path[0].x);
  const startY = item.instant
    ? item.homeY
    : (isChallengeElite
      ? item.raidLaneY
      : ((isChallengeExtra || isChallengeGuard) ? item.startY : item.path[0].y));

  const initState = item.instant
    ? 'FORMATION'
    : (isChallengeElite
      ? 'CHALLENGE_ELITE'
      : (isChallengeGuard
        ? 'CHALLENGE_GUARD'
        : (isChallengeExtra ? 'CHALLENGE_EXTRA' : (item.challenge ? 'CHALLENGE' : 'ENTERING'))));

  game.enemies.push({
    id: game.enemyIdSeq++,
    type: item.type,
    isEnforcer,
    isElite,
    isMaster,
    isCentoid: false,
    isChallengeElite,
    isChallengeExtra,
    isChallengeGuard,
    hitRadius: isMaster ? 30 : (isPulsar ? 25 : (isElite ? 26 : (isEnforcer ? 20 : 16))),
    maxHp,
    hp: maxHp,
    ptsForm,
    ptsDive,
    x: startX,
    y: startY,
    homeX: item.homeX,
    homeY: item.homeY,
    rowIdx: item.rowIdx || 0,
    angle: 0,
    state: initState,
    path: item.path || null,
    pathT: 0,
    pathDur: item.pathDur || (item.challenge ? 3.0 : 1.4),
    hitFlash: 0,
    animPhase: Math.random() * Math.PI * 2,
    diveT: 0,
    diveDur: 2.1,
    divePattern: 'SWOOP',
    divePath: null,
    weaveAmp: 0,
    weaveFreq: 0,
    feintSnapped: false,
    feintSnapT: 0.44,
    feintSubCurve: null,
    loopCx: 0,
    loopCy: 0,
    loopR: 48,
    loopDir: 1,
    beamTimer: 0,
    beamShield: 0,
    beamApproachT: 0,
    beamStartX: startX,
    beamStartY: startY,
    beamTargetX: startX,
    beamFlankX: startX,
    hasCapturedShip: false,
    diveReadyTimer: getInitialDiveHold(item.type),
    shotCooldown: isElite ? (1.2 + Math.random() * 0.9) : (0.35 + Math.random() * 0.55),
    pulsarTimer: isPulsar ? PULSAR_FIRE_INTERVAL * (0.45 + Math.random() * 0.55) : 0,
    wingSurgeQueue: 0,
    wingSurgeTimer: 0,
    surgePulse: 0,
    raidDir: item.raidDir || 1,
    raidLaneY: item.raidLaneY || 110,
    raidSpeed: item.raidSpeed || 64,
    raidClock: 0,
    challengeTwinFired: false,
    guardGroup: item.guardGroup || null,
    guardTargetGroup: item.guardTargetGroup || null,
    guardOx: item.guardOx || 0,
    guardOy: item.guardOy || 0,
    guardIdx: item.guardIdx || 0,
    guardClock: 0,
    guardBroken: false,
    v1Synergy: null,
    speedBuffed: false,
    hpBuffed: false,
    extraPattern: item.extraPattern || null,
    extraData: item.extraData ? { ...item.extraData } : null
  });

  if (isChallengeElite) {
    const isNullKind = item.type === 'NULL_ENFORCER' || item.type === 'MASTER_NULL_ENFORCER';
    const label = isMaster
      ? (isNullKind
        ? (item.guardGroup ? 'MASTER NULL + GUARD FORMATION' : 'MASTER NULL RAIDER [18 HP]')
        : (item.guardGroup ? 'MASTER FLUX + GUARD FORMATION' : 'MASTER FLUX RAIDER [18 HP]'))
      : (isNullKind ? 'NULL RAIDER [2X HP]' : 'FLUX RAIDER [2X HP]');
    game.spawnPopup(
      LOGICAL_W * 0.5,
      startY - 14,
      label,
      isNullKind ? COLORS.nullRed : COLORS.cyan,
      1.4
    );
  }
}

/**
 * Direct touch/click enemy spawner used by the Training/Sandbox Arena.
 */
export function spawnDirectEnemy(game, type, x, y) {
  const cx = clamp(x, 34, LOGICAL_W - 34);
  const cy = clamp(y, 58, LOGICAL_H - 120);
  if (type === 'CENTOID' || type === 'ALPHA_CENTOID') {
    const dirX = cx < LOGICAL_W * 0.5 ? -1 : 1; // Trail extends inward toward arena center
    spawnCentoidChain(game, type === 'ALPHA_CENTOID', cx, cy, dirX);
    game.spawnDeleteBurst(cx, cy, type === 'ALPHA_CENTOID' ? COLORS.alphaPink : COLORS.centoidGreen, 12, 110);
    return;
  }
  spawnEnemyFromItem(game, {
    type,
    homeX: cx,
    homeY: cy,
    rowIdx: 1,
    path: null,
    instant: true,
    challenge: false,
    challengeElite: false
  });
  game.spawnDeleteBurst(cx, cy, COLORS.cyan, 10, 95);
}

export function finishChallengeStage(game) {
  const hits = game.challengeHits;
  const total = Math.max(1, game.challengeTotal);
  if (hits >= total) {
    game.addScore(10000);
    game.bannerTitle = 'PERFECT DATA STREAM!';
    game.bannerSub = '100% ACCURACY // BONUS +10000';
    game.bannerColor = COLORS.gold;
    game.synth.playRescue();
  } else {
    const bonus = hits * 100;
    if (bonus > 0) game.addScore(bonus);
    game.bannerTitle = 'CHALLENGE COMPLETE';
    game.bannerSub = `HITS ${hits}/${total} // BONUS +${bonus}`;
    game.bannerColor = COLORS.emerald;
    game.synth.playSectorStart(false);
  }
  game.justFinishedChallenge = true;
  game.sectorPhase = 'CLEARED';
  game.phaseTimer = 2.4;
}

function assignDivePattern(game, diver, forcedPattern = null, flankOffset = 0) {
  const effSec = game.getEffectiveSector ? game.getEffectiveSector() : game.sector;
  diver.state = 'DIVING';
  diver.diveT = 0;
  diver.feintSnapped = false;
  diver.feintSnapT = 0.44;
  diver.feintSubCurve = null;

  const patterns = effSec === 1
    ? ['SWOOP', 'WEAVE', 'FEINT']
    : ['SWOOP', 'WEAVE', 'FEINT', 'LOOP'];
  const pattern = forcedPattern || patterns[Math.floor(Math.random() * patterns.length)];
  diver.divePattern = pattern;

  const baseDur = Math.max(1.45, 2.35 - effSec * 0.085);
  // Dive speed ladder (higher duration mult = slower dive):
  // Normal (1.0x) > Advanced V1 (1.25x) > Elite Enforcers (1.45x) > Pulsars (1.75x) > Master Enforcers (2.10x)
  const tierDiveMult = diver.isMaster
    ? 2.10
    : (diver.type === 'PULSAR'
      ? 1.75
      : (diver.isElite ? 1.45 : (diver.type === 'V1_ENFORCER' ? 1.25 : 1.0)));
  diver.diveDur = baseDur * tierDiveMult * (pattern === 'LOOP' ? 1.18 : (pattern === 'WEAVE' ? 1.08 : 0.94));

  const tx = clamp(game.player.x + flankOffset + (Math.random() - 0.5) * 78, 36, LOGICAL_W - 36);
  const swingDir = diver.x < LOGICAL_W * 0.5 ? 1 : -1;
  const resetShotCd = !diver.isElite; // Leave Elite/Pulsar/Master bullet timers untouched on dive!

  if (pattern === 'WEAVE') {
    diver.weaveAmp = 44 + Math.random() * 34;
    diver.weaveFreq = 3.5 + Math.random() * 2.0;
    diver.divePath = [
      { x: diver.x, y: diver.y },
      { x: clamp(lerp(diver.x, tx, 0.35), 48, LOGICAL_W - 48), y: diver.y + 160 },
      { x: tx, y: LOGICAL_H - 115 },
      { x: clamp(tx + swingDir * 60, 28, LOGICAL_W - 28), y: LOGICAL_H + 58 }
    ];
    if (resetShotCd) diver.shotCooldown = 0.28 + Math.random() * 0.25;
  } else if (pattern === 'FEINT') {
    const fakeSide = game.player.x < LOGICAL_W * 0.5 ? 1 : -1;
    const fakeX = clamp(game.player.x + fakeSide * (120 + Math.random() * 45), 42, LOGICAL_W - 42);
    diver.divePath = [
      { x: diver.x, y: diver.y },
      { x: fakeX, y: lerp(diver.y, LOGICAL_H - 190, 0.72) },
      { x: tx, y: LOGICAL_H - 96 },
      { x: clamp(tx - fakeSide * 75, 24, LOGICAL_W - 24), y: LOGICAL_H + 58 }
    ];
    if (resetShotCd) diver.shotCooldown = 0.36 + Math.random() * 0.22;
  } else if (pattern === 'LOOP') {
    diver.loopCx = clamp(lerp(diver.x, tx, 0.55), 86, LOGICAL_W - 86);
    diver.loopCy = clamp(diver.y + 185, 240, 380);
    diver.loopR = 46 + Math.random() * 22;
    diver.loopDir = Math.random() < 0.5 ? 1 : -1;
    diver.divePath = [
      { x: diver.x, y: diver.y },
      { x: diver.loopCx + diver.loopDir * 90, y: diver.loopCy - 60 },
      { x: tx, y: LOGICAL_H - 84 },
      { x: clamp(tx + diver.loopDir * 85, 28, LOGICAL_W - 28), y: LOGICAL_H + 58 }
    ];
    if (resetShotCd) diver.shotCooldown = 0.32 + Math.random() * 0.25;
  } else {
    // Sharp lead-aimed SWOOP
    diver.divePath = [
      { x: diver.x, y: diver.y },
      { x: clamp(diver.x + swingDir * (95 + Math.random() * 65), 36, LOGICAL_W - 36), y: diver.y + 145 },
      { x: tx, y: LOGICAL_H - 88 },
      { x: clamp(tx + (Math.random() < 0.5 ? -95 : 95), 20, LOGICAL_W - 20), y: LOGICAL_H + 58 }
    ];
    if (resetShotCd) diver.shotCooldown = 0.26 + Math.random() * 0.28;
  }
  // Advanced V1 Enforcers fire noticeably less often than normal tiers
  if (diver.type === 'V1_ENFORCER') {
    diver.shotCooldown *= 1.55;
  }
}

export function launchFormationDiver(game) {
  const effSec = game.getEffectiveSector ? game.getEffectiveSector() : game.sector;
  const ready = game.enemies.filter(e => e.state === 'FORMATION' && (e.diveReadyTimer || 0) <= 0);
  if (ready.length === 0) return;

  const activeDivers = game.enemies.filter(e => e.state === 'DIVING').length;
  const maxDivers = Math.min(7, 2 + Math.floor((effSec + 1) / 2));
  if (activeDivers >= maxDivers) return;

  // Slightly higher occasional abduction chance when a V1 Enforcer is ready in formation
  if (
    !game.player.dual &&
    !game.capturedFighter &&
    !game.activeBeamBoss &&
    game.player.alive &&
    game.sectorTractorCount < TRACTOR_MAX_PER_SECTOR &&
    game.tractorTimer <= 6.0 &&
    Math.random() < 0.08
  ) {
    const v1Enforcers = ready.filter(e => e.type === 'V1_ENFORCER' && !e.hasCapturedShip);
    if (v1Enforcers.length > 0) {
      const enforcer = v1Enforcers[Math.floor(Math.random() * v1Enforcers.length)];
      startEnforcerBeam(game, enforcer);
      game.sectorTractorCount++;
      game.postChallengeAbductionPending = false;
      game.tractorTimer = TRACTOR_INTERVAL + Math.random() * 6.0;
      return;
    }
  }

  // Coordinated multi-fighter squadron / pincer dives grow more frequent as sectors advance
  const squadChance = clamp(0.32 + effSec * 0.06, 0.35, 0.78);
  const desiredCount = (Math.random() < squadChance && ready.length >= 2)
    ? (effSec >= 3 && Math.random() < 0.38 && ready.length >= 3 ? 3 : 2)
    : 1;
  const launchCount = Math.min(desiredCount, maxDivers - activeDivers, ready.length);

  const chosen = [];
  const pool = [...ready];
  for (let k = 0; k < launchCount; k++) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }

  // Either synchronized pincer pair or mixed unpredictable patterns
  const syncPincer = chosen.length >= 2 && Math.random() < 0.55;
  chosen.forEach((diver, idx) => {
    const flankOffset = syncPincer ? (idx === 0 ? -56 : (idx === 1 ? 56 : 0)) : 0;
    const forced = syncPincer && idx > 0 ? chosen[0].divePattern : null;
    assignDivePattern(game, diver, forced, flankOffset);
  });
}

export function updateSectorPhase(game, dt) {
  if (game.sectorPhase === 'BANNER') {
    game.phaseTimer -= dt;
    if (game.phaseTimer <= 0) {
      game.sectorPhase = game.isChallengeStage ? 'CHALLENGE' : 'ENTRY';
    }
    return;
  }

  if (game.sectorPhase === 'CHALLENGE_BANNER') {
    game.phaseTimer -= dt;
    if (game.phaseTimer <= 0) {
      game.sectorPhase = 'CHALLENGE';
    }
    return;
  }

  // Seamless unannounced breather between Waves 1 -> 2 -> 3 -> 4 inside a Standard Sector
  if (game.sectorPhase === 'WAVE_GAP') {
    game.phaseTimer -= dt;
    if (game.phaseTimer <= 0) {
      prepareStandardWave(game, game.sectorWave);
      game.sectorPhase = 'ENTRY';
    }
    return;
  }

  if (game.sectorPhase === 'ENTRY' || game.sectorPhase === 'CHALLENGE') {
    game.waveSpawnTimer += dt;
    while (game.waveQueue.length > 0 && game.waveQueue[0].delay <= game.waveSpawnTimer) {
      spawnEnemyFromItem(game, game.waveQueue.shift());
    }
    if (game.waveQueue.length === 0) {
      if (game.sectorPhase === 'ENTRY') {
        const stillEntering = game.enemies.some(e => e.state === 'ENTERING');
        if (!stillEntering) {
          game.sectorPhase = 'COMBAT';
          game.diveTimer = 0.75;
          game.formationShotTimer = 1.6;
          // If the 80% post-challenge abduction roll triggered, queue an early sweep once settled
          game.tractorTimer = game.postChallengeAbductionPending
            ? 1.8
            : (TRACTOR_INITIAL_DELAY + Math.random() * 3.0);
          game.wingLaunchTimer = 1.8;
        }
      } else if (game.sectorPhase === 'CHALLENGE' && game.enemies.length === 0 && game.enforcerWings.length === 0) {
        if (game.challengeSubRound < game.challengeExtraRounds) {
          game.challengeSubRound++;
          const effCh = game.getEffectiveChallengeNum ? game.getEffectiveChallengeNum() : game.challengeNum;
          startChallengeExtraRound(game, effCh, game.challengeSubRound);
        } else {
          finishChallengeStage(game);
        }
      }
    }
    return;
  }

  if (game.sectorPhase === 'COMBAT') {
    const effSec = game.getEffectiveSector ? game.getEffectiveSector() : game.sector;

    // Process mid-wave spontaneous Centoid / Alpha Centoid / Pulsar spawns (paused in Sandbox Idle!)
    if (!game.sandboxIdle && game.midWaveSpawns && game.midWaveSpawns.length > 0) {
      if (game.enemies.length === 0 && game.enforcerWings.length === 0 && game.midWaveSpawns[0].timer > 0.35) {
        // Fast-forward next reinforcement if arena emptied so player never waits on dead air
        const shift = game.midWaveSpawns[0].timer - 0.3;
        for (const ms of game.midWaveSpawns) ms.timer = Math.max(0.05, ms.timer - shift);
      }
      for (let mi = game.midWaveSpawns.length - 1; mi >= 0; mi--) {
        game.midWaveSpawns[mi].timer -= dt;
        if (game.midWaveSpawns[mi].timer <= 0) {
          const ms = game.midWaveSpawns.splice(mi, 1)[0];
          if (ms.type === 'CENTOID' || ms.type === 'ALPHA_CENTOID') {
            spawnCentoidChain(game, ms.type === 'ALPHA_CENTOID');
            game.spawnPopup(
              LOGICAL_W * 0.5,
              116,
              ms.type === 'ALPHA_CENTOID' ? 'ALPHA CENTOID INBOUND!' : 'CENTOID INBOUND!',
              ms.type === 'ALPHA_CENTOID' ? COLORS.alphaPink : COLORS.centoidGreen,
              1.25
            );
          } else if (ms.type === 'PULSAR') {
            const fromLeft = Math.random() < 0.5;
            const hx = clamp(76 + Math.random() * (LOGICAL_W - 152), 70, LOGICAL_W - 70);
            const hy = 112 + Math.random() * 102;
            const path = buildEntryPath(fromLeft ? 'CROSS' : 'TOP_DROP', fromLeft ? 0 : 1, hx, hy);
            spawnEnemyFromItem(game, {
              type: 'PULSAR',
              homeX: hx,
              homeY: hy,
              rowIdx: 1,
              path,
              pathDur: 1.2,
              challenge: false,
              challengeElite: false
            });
            game.spawnPopup(hx, hy - 22, 'PULSAR INBOUND!', COLORS.yellow, 1.15);
          }
        }
      }
    }

    const pendingMidSpawns = game.midWaveSpawns ? game.midWaveSpawns.length : 0;
    if (game.enemies.length === 0 && game.enforcerWings.length === 0 && pendingMidSpawns === 0) {
      // Free Sandbox mode: never auto-clear or advance sectors when arena empties
      if (game.sandboxMode && !game.sandboxTrainingRound) {
        return;
      }

      if (game.sectorWave < game.sectorTotalWaves) {
        // Silent wave progression — NO wave banner or announcement!
        game.sectorWave++;
        game.sectorPhase = 'WAVE_GAP';
        game.phaseTimer = 0.75;
        return;
      }
      game.sectorPhase = 'CLEARED';
      game.phaseTimer = 1.85;
      if (game.sandboxTrainingRound) {
        game.bannerTitle = `TRAINING // SEC ${String(game.sector).padStart(2, '0')} CLEARED`;
        game.bannerSub = 'RETURNING TO SANDBOX ARENA...';
      } else {
        game.bannerTitle = game.hardMode
          ? `HARD // SECTOR ${String(game.sector).padStart(2, '0')} CLEARED`
          : `SECTOR ${String(game.sector).padStart(2, '0')} CLEARED`;
        game.bannerSub = game.sector % CHALLENGE_INTERVAL === 0
          ? 'INCOMING DATA STREAM...'
          : 'ADVANCING SECTOR...';
      }
      game.bannerColor = COLORS.emerald;
      return;
    }

    // In Sandbox IDLE mode, enemies hold formation & sway rhythm without diving, firing, beaming, or launching wings!
    if (game.sandboxIdle) return;

    // Aggressive, variable diving scheduler
    game.diveTimer -= dt;
    if (game.diveTimer <= 0) {
      launchFormationDiver(game);
      const baseGap = Math.max(0.52, 1.48 - effSec * 0.08);
      game.diveTimer = baseGap * (0.78 + Math.random() * 0.44);
    }

    // Formation skirmish fire so stationary players stay under pressure
    game.formationShotTimer -= dt;
    if (game.formationShotTimer <= 0 && game.player.alive) {
      const shooters = game.enemies.filter(
        e => e.state === 'FORMATION' && (e.type === 'INTERCEPTOR' || e.isEnforcer)
      );
      if (shooters.length > 0) {
        let s = shooters[Math.floor(Math.random() * shooters.length)];
        // Advanced V1 Enforcers fire bullets less often than normal tiers
        if (s.type === 'V1_ENFORCER' && Math.random() < 0.55) {
          const nonV1 = shooters.filter(cand => cand.type !== 'V1_ENFORCER');
          s = nonV1.length > 0 ? nonV1[Math.floor(Math.random() * nonV1.length)] : null;
        }
        if (s) {
          const spd = Math.min(430, 265 + effSec * 11);
          const col = (s.type === 'NULL_ENFORCER' || s.type === 'MASTER_NULL_ENFORCER')
            ? COLORS.nullRed
            : ((s.type === 'FLUX_ENFORCER' || s.type === 'MASTER_FLUX_ENFORCER') ? COLORS.cyan : COLORS.amber);
          fireAimedBullet(game, s.x, s.y + 12, spd, col, (Math.random() - 0.5) * 0.14, 0.35);
          if (s.isElite) {
            s.shotCooldown = Math.max(0.95, 1.55 - effSec * 0.045);
          }
        }
      }
      game.formationShotTimer = Math.max(0.85, 2.2 - effSec * 0.1) * (0.75 + Math.random() * 0.5);
    }

    // Tractor Beam scheduler: V1 Enforcers + 10%/wave Elite Enforcer (non-Master, max 1/wave) abduction!
    if (
      !game.player.dual &&
      !game.capturedFighter &&
      !game.activeBeamBoss &&
      game.player.alive
    ) {
      game.tractorTimer -= dt;
      if (game.tractorTimer <= 0) {
        // Check queued 10% per-wave Elite Enforcer abduction first (strictly non-Masters, max 1 per wave)
        const eliteBeamCandidates = (game.waveEliteAbductionQueued && !game.waveEliteAbductionUsed)
          ? game.enemies.filter(
              e => (e.type === 'FLUX_ENFORCER' || e.type === 'NULL_ENFORCER') && e.state === 'FORMATION' && !e.hasCapturedShip
            )
          : [];

        if (eliteBeamCandidates.length > 0) {
          const chosenElite = eliteBeamCandidates[Math.floor(Math.random() * eliteBeamCandidates.length)];
          startEnforcerBeam(game, chosenElite);
          game.waveEliteAbductionUsed = true;
          game.waveEliteAbductionQueued = false;
          game.tractorTimer = TRACTOR_INTERVAL + Math.random() * 6.0;
        } else if (game.sectorTractorCount < TRACTOR_MAX_PER_SECTOR) {
          const beamCandidates = game.enemies.filter(
            e => e.type === 'V1_ENFORCER' && e.state === 'FORMATION' && !e.hasCapturedShip
          );
          if (beamCandidates.length > 0) {
            const chosen = beamCandidates[Math.floor(Math.random() * beamCandidates.length)];
            startEnforcerBeam(game, chosen);
            game.sectorTractorCount++;
            game.postChallengeAbductionPending = false;
            game.tractorTimer = TRACTOR_INTERVAL + Math.random() * 6.0;
          } else {
            game.tractorTimer = 2.4;
          }
        }
      }
    }

    // Elite & Master Enforcer Wing scheduler (strictly Enforcers — Pulsars never launch Enforcer Wings!)
    const elitesInForm = game.enemies.filter(e => e.isElite && e.isEnforcer && e.state === 'FORMATION');
    if (elitesInForm.length > 0) {
      game.wingLaunchTimer -= dt;
      if (game.wingLaunchTimer <= 0) {
        const boss = elitesInForm[Math.floor(Math.random() * elitesInForm.length)];
        spawnEnforcerWing(game, boss, true, 0);
        game.wingLaunchTimer = Math.max(2.5, 4.5 - effSec * 0.16);
      }
    }
  } else if (game.sectorPhase === 'CLEARED') {
    game.phaseTimer -= dt;
    if (game.phaseTimer <= 0) {
      if (game.sandboxTrainingRound) {
        game.sandboxTrainingRound = false;
        game.sectorPhase = 'COMBAT';
        game.enemies = [];
        game.enemyBullets = [];
        game.enforcerWings = [];
        game.threadTrails = [];
        game.electroBalls = [];
        game.pulsarSparks = [];
        if (game.centoidChains) game.centoidChains.clear();
        game.spawnPopup(LOGICAL_W * 0.5, 220, 'SANDBOX READY', COLORS.cyan, 1.2);
        if (game.syncSandboxUI) game.syncSandboxUI();
      } else if (!game.isChallengeStage && game.sector % CHALLENGE_INTERVAL === 0) {
        beginChallengeStage(game, Math.floor(game.sector / CHALLENGE_INTERVAL));
      } else {
        beginSector(game, game.sector + 1);
      }
    }
  }
}

function checkV1SynergyShift(game, e) {
  if (e.type !== 'V1_ENFORCER' || e.v1Synergy || e.hp > 1.001 || e.hp <= 0.001) return;
  let closestKind = null;
  let closestDist = V1_SYNERGY_RADIUS;
  for (const other of game.enemies) {
    if (other === e) continue;
    const isFlux = other.type === 'FLUX_ENFORCER' || other.type === 'MASTER_FLUX_ENFORCER';
    const isNull = other.type === 'NULL_ENFORCER' || other.type === 'MASTER_NULL_ENFORCER';
    if (!isFlux && !isNull) continue;
    const d = Math.hypot(other.x - e.x, other.y - e.y);
    if (d <= closestDist) {
      closestDist = d;
      closestKind = isFlux ? 'FLUX' : 'NULL';
    }
  }
  if (closestKind) {
    e.v1Synergy = closestKind;
    game.spawnPopup(
      e.x,
      e.y - 24,
      closestKind === 'FLUX' ? 'FLUX LINK!' : 'NULL LINK!',
      closestKind === 'FLUX' ? COLORS.cyan : COLORS.nullRed,
      1.0
    );
  }
}

export function damageEnemy(game, idx, dmg, hitX, hitY, sparkCol = COLORS.white, quiet = false) {
  const e = game.enemies[idx];
  if (!e) return;

  // Enforcer Tractor Capacitor Shield absorbs 1.0 hit during approach
  if (e.state === 'BEAM_APPROACH' && e.beamShield > 0.001) {
    e.beamShield -= Math.min(1, dmg);
    e.hitFlash = 0.14;
    if (!quiet || e.beamShield <= 0.001) {
      game.synth.playThreadDeflect();
      game.spawnDeleteBurst(hitX, hitY, COLORS.cyan, 8, 120);
    }
    return;
  }

  e.hp -= dmg;
  e.hitFlash = 0.12;
  if (e.hp <= 0.001) {
    destroyEnemy(game, idx, true);
  } else {
    checkV1SynergyShift(game, e);
    if (!quiet) {
      game.synth.playArmorPing();
      game.spawnDeleteBurst(hitX, hitY, sparkCol, 4, 85);
    }
  }
}

export function destroyEnemy(game, idx, scored = true) {
  const e = game.enemies[idx];
  if (!e) return;

  // Centoid / Alpha Centoid segments handle headshot insta-delete & max-2 body splits!
  if (e.isCentoid) {
    handleCentoidSegmentDestroyed(game, e, idx, scored);
    return;
  }

  handleEnforcerDestroyed(game, e);

  // Pulsar explodes on death into 3-4 omnidirectional downward-trailing spark lines!
  if (e.type === 'PULSAR') {
    spawnPulsarDeathSparks(game, e.x, e.y);
  }

  // Color-shifted V1 Enforcer death AOE enemy power-up (non-stacking!)
  if (e.type === 'V1_ENFORCER' && e.v1Synergy) {
    const isFlux = e.v1Synergy === 'FLUX';
    const buffCol = isFlux ? COLORS.cyan : COLORS.nullRed;
    game.enemyBuffWaves.push({
      x: e.x,
      y: e.y,
      radius: 14,
      maxRadius: V1_BUFF_AOE_RADIUS,
      color: buffCol,
      life: 0.55,
      maxLife: 0.55
    });
    let buffedCount = 0;
    for (const other of game.enemies) {
      if (other === e) continue;
      if (Math.hypot(other.x - e.x, other.y - e.y) <= V1_BUFF_AOE_RADIUS) {
        if (isFlux && !other.speedBuffed) {
          other.speedBuffed = true;
          buffedCount++;
        } else if (!isFlux && !other.hpBuffed) {
          other.hpBuffed = true;
          const addHp = Math.ceil(other.maxHp * 0.33);
          other.maxHp += addHp;
          other.hp += addHp;
          buffedCount++;
        }
      }
    }
    if (buffedCount > 0) {
      game.spawnPopup(
        e.x,
        e.y - 26,
        isFlux ? 'ENEMY +30% SPD!' : 'ENEMY +33% HP!',
        buffCol,
        1.35
      );
    }
  }

  const col = (e.type === 'NULL_ENFORCER' || e.type === 'MASTER_NULL_ENFORCER') ? COLORS.nullRed
    : ((e.type === 'FLUX_ENFORCER' || e.type === 'MASTER_FLUX_ENFORCER') ? COLORS.cyan
      : (e.type === 'PULSAR'
        ? COLORS.yellow
        : (e.type === 'V1_ENFORCER'
          ? (e.v1Synergy === 'FLUX' ? COLORS.cyan : (e.v1Synergy === 'NULL' ? COLORS.nullRed : COLORS.v1Orange))
          : (e.type === 'INTERCEPTOR' ? COLORS.gold : COLORS.cyan))));

  game.spawnDeleteBurst(e.x, e.y, col, e.isMaster ? 38 : (e.isElite ? 28 : 16), e.isMaster ? 250 : (e.isElite ? 220 : 165));
  game.synth.playDeleteBurst(e.isElite || e.isEnforcer);

  if (e.isMaster) {
    game.shake = 0.28;
    game.hitStop = 0.045;
  } else if (e.isElite) {
    game.shake = 0.18;
    game.hitStop = 0.03;
  }

  if (scored) {
    rollEnemyCapsuleDrop(game, e);

    if (game.sectorPhase === 'CHALLENGE' || game.sectorPhase === 'CHALLENGE_BANNER') {
      game.challengeHits++;
      const chPts = e.isMaster ? 2500 : (e.isChallengeElite ? 1500 : ((e.isChallengeExtra || e.isChallengeGuard) ? e.ptsForm : 100));
      game.addScore(chPts, e.x, e.y, (e.isChallengeElite || e.isChallengeExtra || e.isChallengeGuard) ? col : COLORS.gold);
    } else {
      const isDiving = e.state === 'DIVING' || e.state === 'BEAMING' || e.state === 'BEAM_APPROACH';
      game.addScore(isDiving ? e.ptsDive : e.ptsForm, e.x, e.y, col);
    }
  }
  game.enemies.splice(idx, 1);
}

function getFormationTarget(game, e) {
  const cx = LOGICAL_W * 0.5;
  const clk = game.formationClock;
  const mode = game.swayMode || 'SWAY';

  if (mode === 'FIGURE8') {
    const sx = Math.sin(clk * 1.25) * 28;
    const sy = Math.sin(clk * 2.5 + e.rowIdx * 0.4) * 7;
    return { x: cx + (e.homeX - cx) * (1 + Math.sin(clk * 1.6) * 0.04) + sx, y: e.homeY + sy };
  }
  if (mode === 'COUNTER_ROW') {
    const dir = e.rowIdx % 2 === 0 ? 1 : -1;
    const sx = Math.sin(clk * 1.35) * 24 * dir;
    return { x: e.homeX + sx, y: e.homeY + Math.cos(clk * 2.0 + e.homeX * 0.02) * 5 };
  }
  if (mode === 'ACCORDION') {
    const breath = 1 + Math.sin(clk * 2.15) * 0.095;
    const sx = Math.sin(clk * 0.95) * 16;
    return { x: cx + (e.homeX - cx) * breath + sx, y: e.homeY + Math.sin(clk * 2.15 + e.rowIdx * 0.6) * 6 };
  }
  const swayX = Math.sin(clk * 1.15) * 24;
  const breath = 1 + Math.sin(clk * 1.8) * 0.045;
  return {
    x: cx + (e.homeX - cx) * breath + swayX,
    y: e.homeY + Math.sin(clk * 1.8 + e.homeX * 0.02) * 4
  };
}

function updateChallengeExtraEnemy(game, e, dt) {
  const d = e.extraData;
  d.clock += dt;
  const p = game.player;
  const bulletSpd = Math.min(430, 275 + game.sector * 8);
  const bCol = e.type === 'NULL_ENFORCER' ? COLORS.nullRed : (e.type === 'FLUX_ENFORCER' ? COLORS.cyan : COLORS.amber);

  if (e.extraPattern === 'DIAMOND_VORTEX') {
    const cx = LOGICAL_W * 0.5;
    const cy = 215;
    if (d.clock < 1.15) {
      const t = d.clock / 1.15;
      const ease = 1 - Math.pow(1 - t, 3);
      const ca = Math.cos(d.baseAngle);
      const sa = Math.sin(d.baseAngle);
      const diam = 1 / (Math.abs(ca) + Math.abs(sa));
      const tx = cx + ca * diam * d.orbitRx;
      const ty = cy + sa * diam * d.orbitRy;
      e.x = lerp(e.x, tx, Math.min(1, dt * 6 + ease * 0.14));
      e.y = lerp(e.y, ty, Math.min(1, dt * 6 + ease * 0.14));
    } else if (d.clock < d.peelDelay) {
      const orbT = d.clock - 1.15;
      const ang = d.baseAngle + orbT * 1.65 * d.orbitDir;
      const pulse = 1 + Math.sin(orbT * 3.6) * 0.14;
      // Diamond-shaped superellipse orbit
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const diam = 1 / (Math.abs(ca) + Math.abs(sa));
      e.x = cx + ca * diam * d.orbitRx * pulse;
      e.y = cy + sa * diam * d.orbitRy * pulse;
      d.shotTimer -= dt;
      if (d.shotTimer <= 0 && p.alive) {
        fireAimedBullet(game, e.x, e.y + 10, bulletSpd, bCol, 0, 0.25);
        d.shotTimer = 1.45;
      }
    } else {
      e.x += d.exitVx * dt;
      e.y += d.exitVy * dt;
      d.shotTimer -= dt;
      if (d.shotTimer <= 0 && e.y < LOGICAL_H - 170 && p.alive) {
        fireAimedBullet(game, e.x, e.y + 10, bulletSpd * 1.05, bCol);
        d.shotTimer = 1.2;
      }
    }
    return e.y > LOGICAL_H + 56 || e.x < -64 || e.x > LOGICAL_W + 64;
  }

  if (e.extraPattern === 'TWIN_PINCER') {
    if (d.clock < 1.05) {
      const k = Math.min(1, dt * 5.2);
      e.x += (d.holdX - e.x) * k;
      e.y += (d.holdY - e.y) * k;
    } else if (d.clock < 1.05 + d.holdDur) {
      const t = d.clock - 1.05;
      e.x = d.holdX + Math.sin(t * 4.2) * 14 * d.side;
      e.y = d.holdY + Math.cos(t * 3.0) * 8;
      d.shotTimer -= dt;
      if (d.shotTimer <= 0 && p.alive) {
        // Converging crossfire volley
        fireAimedBullet(game, e.x, e.y + 10, bulletSpd, bCol, -0.14 * d.side, 0.3);
        if (e.isEnforcer) {
          fireAimedBullet(game, e.x, e.y + 10, bulletSpd, bCol, 0.12 * d.side, 0);
        }
        d.shotTimer = 1.25;
      }
    } else {
      const spd = 285;
      e.x += Math.cos(d.scissorAngle) * spd * dt;
      e.y += Math.sin(d.scissorAngle) * spd * dt;
    }
    return e.y > LOGICAL_H + 56 || e.x < -64 || e.x > LOGICAL_W + 64;
  }

  if (e.extraPattern === 'HELIX_BARRAGE') {
    e.y += d.vy * dt;
    e.x = LOGICAL_W * 0.5 + Math.sin(d.clock * 3.3 + d.phase) * d.amp;
    d.shotTimer -= dt;
    if (d.shotTimer <= 0 && e.y > 40 && e.y < LOGICAL_H - 165 && p.alive) {
      if (e.type === 'INTERCEPTOR') {
        fireAimedBullet(game, e.x, e.y + 10, bulletSpd, COLORS.gold, -0.18);
        fireAimedBullet(game, e.x, e.y + 10, bulletSpd, COLORS.gold, 0.18);
      } else {
        fireAimedBullet(game, e.x, e.y + 10, bulletSpd, COLORS.cyan, 0, 0.25);
      }
      d.shotTimer = 1.15;
    }
    return e.y > LOGICAL_H + 56;
  }

  // PHALANX_ASSAULT
  if (d.role === 'WALL') {
    const marchWave = Math.sin(d.clock * 2.2);
    e.x = clamp(d.laneX + marchWave * 28, 38, LOGICAL_W - 38);
    // Stepped advance: surge down then briefly brace
    const stepSpeed = Math.sin(d.clock * 2.4) > -0.25 ? 82 : 24;
    e.y += stepSpeed * dt;

    if (e.isElite && !d.wingFired && e.y > 105) {
      d.wingFired = true;
      spawnEnforcerWing(game, e, false, 0, e.x < LOGICAL_W * 0.5 ? 1 : -1, 0);
    }

    d.shotTimer -= dt;
    if (d.shotTimer <= 0 && e.y > 35 && e.y < LOGICAL_H - 150 && p.alive) {
      fireDirectedBullet(game, e.x - 10, e.y + 14, Math.PI * 0.5, bulletSpd * 0.95, bCol);
      fireDirectedBullet(game, e.x + 10, e.y + 14, Math.PI * 0.5, bulletSpd * 0.95, bCol);
      d.shotTimer = 1.3;
    }
    return e.y > LOGICAL_H + 56;
  }

  // PHALANX FLANKER
  e.y += 162 * dt;
  const edgeBase = d.side < 0 ? 58 : LOGICAL_W - 58;
  e.x = edgeBase - d.side * Math.sin(d.clock * 3.8) * 44;
  d.shotTimer -= dt;
  if (d.shotTimer <= 0 && e.y > 50 && e.y < LOGICAL_H - 140 && p.alive) {
    fireAimedBullet(game, e.x, e.y + 10, bulletSpd * 1.04, COLORS.gold, 0, 0.35);
    d.shotTimer = 0.95;
  }
  return e.y > LOGICAL_H + 56;
}

export function updateEnemies(game, dt) {
  if (!game.sandboxPauseAnim) {
    game.formationClock += dt;
  }
  const p = game.player;
  let beamActive = false;

  // Update V1 Enforcer AOE buff shockwave rings
  for (let wi = game.enemyBuffWaves.length - 1; wi >= 0; wi--) {
    const bw = game.enemyBuffWaves[wi];
    bw.life -= dt;
    const prog = clamp(1 - bw.life / bw.maxLife, 0, 1);
    bw.radius = lerp(14, bw.maxRadius, 1 - Math.pow(1 - prog, 2.4));
    if (bw.life <= 0) game.enemyBuffWaves.splice(wi, 1);
  }

  // Update all living Centoid & Alpha Centoid segment chains
  updateCentoids(game, dt);

  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.surgePulse > 0) e.surgePulse = Math.max(0, e.surgePulse - dt);
    const spdMult = e.speedBuffed ? 1.3 : 1.0;

    if (e.isCentoid) {
      // Centoids already moved via updateCentoids — check clone & player collisions!
      if (game.fighterClones && game.fighterClones.length > 0) {
        for (let ci = game.fighterClones.length - 1; ci >= 0; ci--) {
          const cl = game.fighterClones[ci];
          if (cl.detached && cl.invulnTimer <= 0 && Math.hypot(e.x - cl.x, e.y - cl.y) < e.hitRadius + 10) {
            damageFighterClone(game, ci);
          }
        }
      }
      if (
        p.alive &&
        !p.capturedById &&
        p.invulnTimer <= 0 &&
        Math.hypot(e.x - p.x, e.y - p.y) < e.hitRadius + (p.dual ? 14 : 8)
      ) {
        game.damagePlayer();
      }
      continue;
    }

    // Consecutive Enforcer Wing Surge queue — PAUSED while preparing to abduct, abducting, or Sandbox Idle!
    if (!game.sandboxIdle && e.wingSurgeQueue > 0 && e.state !== 'BEAM_APPROACH' && e.state !== 'BEAMING') {
      e.wingSurgeTimer -= dt;
      if (e.wingSurgeTimer <= 0) {
        const idx = e.wingSurgeQueue;
        e.wingSurgeQueue--;
        e.wingSurgeTimer = ELITE_SURGE_INTERVAL;
        spawnEnforcerWing(game, e, false, idx);
      }
    }

    // Pulsar 3.0s leaf-falling electro ball attacks
    if (e.type === 'PULSAR') {
      updatePulsarAttacks(game, e, dt);
    }

    if (e.state === 'ENTERING' || e.state === 'CHALLENGE') {
      e.pathT += (dt * spdMult) / e.pathDur;
      const pos = evalCubic(e.path, clamp(e.pathT, 0, 1));
      e.x = pos.x;
      e.y = pos.y;
      if (e.pathT >= 1) {
        if (e.state === 'CHALLENGE') {
          game.enemies.splice(i, 1);
          continue;
        }
        e.state = 'FORMATION';
        e.diveReadyTimer = getInitialDiveHold(e.type);
      }
    } else if (e.state === 'FORMATION') {
      if (!game.sandboxIdle && e.diveReadyTimer > 0) {
        e.diveReadyTimer = Math.max(0, e.diveReadyTimer - dt);
      }
      const target = getFormationTarget(game, e);
      e.x = target.x;
      e.y = target.y;
      e.angle = 0;
    } else if (e.state === 'DIVING') {
      const effSec = game.getEffectiveSector ? game.getEffectiveSector() : game.sector;
      const prevX = e.x;
      const prevY = e.y;
      e.diveT += (dt * spdMult) / e.diveDur;
      const t = clamp(e.diveT, 0, 1);

      // Seamless C1-continuous FEINT juke (builds a new curve from exact current pos — zero teleporting!)
      if (e.divePattern === 'FEINT' && !e.feintSnapped && t >= 0.44 && p.alive) {
        e.feintSnapped = true;
        e.feintSnapT = t;
        const pCur = evalCubic(e.divePath, t);
        const pAhead = evalCubic(e.divePath, Math.min(1, t + 0.02));
        const tanX = (pAhead.x - pCur.x) / 0.02;
        const tanY = (pAhead.y - pCur.y) / 0.02;
        const snapX = clamp(p.x + (Math.random() - 0.5) * 44, 34, LOGICAL_W - 34);
        const exitX = clamp(snapX + (snapX < LOGICAL_W * 0.5 ? 85 : -85), 24, LOGICAL_W - 24);
        e.feintSubCurve = [
          { x: pCur.x, y: pCur.y },
          { x: clamp(pCur.x + tanX * 0.16, 28, LOGICAL_W - 28), y: pCur.y + Math.max(24, tanY * 0.16) },
          { x: snapX, y: LOGICAL_H - 96 },
          { x: exitX, y: LOGICAL_H + 58 }
        ];
      }

      if (e.feintSubCurve) {
        const subT = clamp((t - e.feintSnapT) / Math.max(0.01, 1 - e.feintSnapT), 0, 1);
        const pos = evalCubic(e.feintSubCurve, subT);
        e.x = pos.x;
        e.y = pos.y;
      } else if (e.divePattern === 'LOOP' && t > 0.28 && t < 0.68) {
        const lt = (t - 0.28) / 0.40; // 0..1 full 360-degree loop
        const basePos = evalCubic(e.divePath, t);
        const loopAng = lt * Math.PI * 2 * e.loopDir;
        const env = Math.sin(lt * Math.PI);
        e.x = clamp(basePos.x + Math.sin(loopAng) * e.loopR * env, 24, LOGICAL_W - 24);
        e.y = basePos.y - (1 - Math.cos(loopAng)) * e.loopR * 0.72 * env;
      } else {
        const pos = evalCubic(e.divePath, t);
        if (e.divePattern === 'WEAVE') {
          const weave = Math.sin(t * Math.PI * e.weaveFreq) * e.weaveAmp * Math.sin(t * Math.PI);
          e.x = clamp(pos.x + weave, 24, LOGICAL_W - 24);
          e.y = pos.y;
        } else {
          e.x = pos.x;
          e.y = pos.y;
        }
      }

      const vx = e.x - prevX;
      const vy = e.y - prevY;
      if (Math.hypot(vx, vy) > 0.25 && !e.isEnforcer && e.type !== 'PULSAR') {
        e.angle = Math.atan2(vy, vx) - Math.PI * 0.5;
      }

      if (e.type !== 'PULSAR' && !game.sandboxIdle) {
        e.shotCooldown -= dt;
        if (e.shotCooldown <= 0 && e.y < LOGICAL_H - 145 && p.alive) {
          const spd = Math.min(460, 275 + effSec * 12);
          const col = (e.type === 'NULL_ENFORCER' || e.type === 'MASTER_NULL_ENFORCER')
            ? COLORS.nullRed
            : ((e.type === 'FLUX_ENFORCER' || e.type === 'MASTER_FLUX_ENFORCER') ? COLORS.cyan : COLORS.amber);

          if (e.isMaster) {
            // Master Enforcers fire a 3-bolt tactical fan
            fireAimedBullet(game, e.x, e.y + 14, spd, col, -0.24, 0.25);
            fireAimedBullet(game, e.x, e.y + 14, spd, col, 0, 0.25);
            fireAimedBullet(game, e.x, e.y + 14, spd, col, 0.24, 0.25);
          } else if ((e.type === 'INTERCEPTOR' || e.isEnforcer) && (effSec >= 2 || e.divePattern === 'LOOP')) {
            // Twin aimed spread volley for higher unpredictability
            const spread = e.isEnforcer ? 0.20 : 0.15;
            fireAimedBullet(game, e.x, e.y + 12, spd, col, -spread, 0.25);
            fireAimedBullet(game, e.x, e.y + 12, spd, col, spread, 0.25);
          } else {
            fireAimedBullet(game, e.x, e.y + 12, spd, col, 0, e.divePattern === 'FEINT' ? 0.55 : 0.35);
          }
          const baseCd = Math.max(0.52, 0.92 - effSec * 0.035);
          e.shotCooldown = e.type === 'V1_ENFORCER' ? baseCd * 1.55 : baseCd;
        }
      }

      if (e.diveT >= 1) {
        e.y = -32;
        e.angle = 0;
        e.state = 'RETURNING';
        if (e.hasCapturedShip && game.capturedFighter && game.capturedFighter.ownerId === e.id) {
          game.capturedFighter.x = e.x;
          game.capturedFighter.y = e.y - 30;
        }

        // Hard Mode CRT Field Debuff: a Flux (cyan) / Null (red) Enforcer survived its dive and re-enters
        const isFluxKind = e.type === 'MASTER_FLUX_ENFORCER' || e.type === 'FLUX_ENFORCER';
        const isNullKind = e.type === 'MASTER_NULL_ENFORCER' || e.type === 'NULL_ENFORCER';
        const canTriggerField = e.isMaster || (HARD_FIELD_ELITES_TRIGGER && (isFluxKind || isNullKind));
        if (
          canTriggerField &&
          game.hardMode &&
          !game.fieldDebuff &&
          getActivePowerups(game).length >= HARD_FIELD_MIN_POWERUPS &&
          Math.random() < HARD_FIELD_DEBUFF_CHANCE
        ) {
          const isFluxMaster = isFluxKind;
          game.fieldDebuff = {
            type: isFluxMaster ? 'CYAN' : 'RED',
            timer: HARD_FIELD_DEBUFF_DUR,
            maxTimer: HARD_FIELD_DEBUFF_DUR
          };
          game.synth.playDebuff(!isFluxMaster);
          game.shake = 0.22;
          game.spawnPopup(
            LOGICAL_W * 0.5,
            135,
            isFluxMaster ? 'CYAN CRT FIELD // 1.5x SLOW!' : 'RED CRT FIELD // 0.5x DMG!',
            isFluxMaster ? COLORS.cyan : COLORS.nullRed,
            1.7
          );
        }
      }
    } else if (e.state === 'BEAM_APPROACH') {
      updateEnforcerBeamApproach(game, e, dt);
    } else if (e.state === 'BEAMING') {
      beamActive = true;
      updateEnforcerBeaming(game, e, dt);
    } else if (e.state === 'RETURNING') {
      const target = getFormationTarget(game, e);
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const dist = Math.hypot(dx, dy);
      const baseReturnSpd = e.isMaster
        ? 135
        : (e.type === 'PULSAR'
          ? 160
          : (e.isElite ? 185 : (e.type === 'V1_ENFORCER' ? Math.floor(255 * 0.8) : 255)));
      const step = baseReturnSpd * spdMult * dt;
      if (dist <= step) {
        e.x = target.x;
        e.y = target.y;
        e.angle = 0;
        e.state = 'FORMATION';
        e.diveReadyTimer = getRediveHold(e.type);
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    } else if (e.state === 'CHALLENGE_ELITE') {
      e.raidClock += dt;
      e.x += e.raidDir * e.raidSpeed * dt;
      e.y = e.raidLaneY + Math.sin(e.raidClock * 2.5) * 22;

      if (!e.challengeTwinFired && e.x > 64 && e.x < LOGICAL_W - 64) {
        e.challengeTwinFired = true;
        const isNullKind = e.type === 'NULL_ENFORCER' || e.type === 'MASTER_NULL_ENFORCER';
        spawnEnforcerWing(game, e, e.isMaster, 0, -1, -18);
        spawnEnforcerWing(game, e, false, 0, 1, 18);
        game.spawnPopup(
          e.x,
          e.y - 34,
          e.isMaster ? 'MASTER LAUNCH x2' : 'TWIN LAUNCH x2',
          isNullKind ? COLORS.nullRed : COLORS.cyan,
          1.25
        );
      }

      if ((e.raidDir > 0 && e.x > LOGICAL_W + 70) || (e.raidDir < 0 && e.x < -70)) {
        game.enemies.splice(i, 1);
        continue;
      }
    } else if (e.state === 'CHALLENGE_GUARD') {
      e.guardClock += dt;
      const boss = e.guardBroken
        ? null
        : game.enemies.find(b => b.guardGroup === e.guardTargetGroup && b.state === 'CHALLENGE_ELITE');

      if (boss) {
        // Shielding formation orbits & holds tightly around its Master Enforcer
        const swayX = Math.sin(e.guardClock * 3.4 + e.guardIdx * 1.1) * 8;
        const swayY = Math.cos(e.guardClock * 3.0 + e.guardIdx * 0.9) * 6;
        const tx = boss.x + e.guardOx + swayX;
        const ty = boss.y + e.guardOy + swayY;
        e.x += (tx - e.x) * Math.min(1, dt * 8.5);
        e.y += (ty - e.y) * Math.min(1, dt * 8.5);

        e.shotCooldown -= dt;
        if (e.shotCooldown <= 0 && e.x > 24 && e.x < LOGICAL_W - 24 && p.alive) {
          const spd = Math.min(430, 275 + game.sector * 6);
          const col = boss.type === 'MASTER_NULL_ENFORCER' ? COLORS.nullRed : COLORS.cyan;
          fireAimedBullet(game, e.x, e.y + 10, spd, col, 0, 0.2);
          e.shotCooldown = 1.45 + Math.random() * 0.55;
        }
      } else {
        // Master Enforcer destroyed or exited — guards break off cleanly down-screen
        e.guardBroken = true;
        e.x += e.raidDir * 85 * dt;
        e.y += 235 * dt;
        if (e.y > LOGICAL_H + 54 || e.x < -64 || e.x > LOGICAL_W + 64) {
          game.enemies.splice(i, 1);
          continue;
        }
      }
    } else if (e.state === 'CHALLENGE_EXTRA') {
      const exited = updateChallengeExtraEnemy(game, e, dt);
      if (exited) {
        game.enemies.splice(i, 1);
        continue;
      }
    }

    updateCapturedFighterTether(game, e, dt);

    // Direct collision with detached Fighter Clones (3 HP each, respects i-frames)
    if (game.fighterClones && game.fighterClones.length > 0) {
      for (let ci = game.fighterClones.length - 1; ci >= 0; ci--) {
        const cl = game.fighterClones[ci];
        if (cl.detached && cl.invulnTimer <= 0 && Math.hypot(e.x - cl.x, e.y - cl.y) < e.hitRadius + 10) {
          damageFighterClone(game, ci);
        }
      }
    }

    // Direct collision with player ship
    if (
      p.alive &&
      !p.capturedById &&
      p.invulnTimer <= 0 &&
      Math.hypot(e.x - p.x, e.y - p.y) < e.hitRadius + (p.dual ? 14 : 8)
    ) {
      game.damagePlayer();
    }
  }

  // Defensive orphan cleanup if captor enemy is no longer active
  if (
    game.capturedFighter &&
    !game.enemies.some(e => e.id === game.capturedFighter.ownerId && e.hasCapturedShip) &&
    game.player.capturedById !== game.capturedFighter.ownerId
  ) {
    game.capturedFighter = null;
  }

  if (beamActive) game.synth.startTractorBeam();
  else game.synth.stopTractorBeam();
}
