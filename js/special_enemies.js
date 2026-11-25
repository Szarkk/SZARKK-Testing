/* =========================================================================
   SPECIAL ENEMIES: CENTOID, ALPHA CENTOID, PULSAR & COST-BASED SWAP ENGINE
   ========================================================================= */

import {
  ALPHA_CENTOID_SEG_HP,
  CENTOID_MAX_SPLITS,
  CENTOID_SEGMENTS,
  COLORS,
  COST_SWAP_CHANCE,
  LOGICAL_H,
  LOGICAL_W,
  PULSAR_FIRE_INTERVAL,
  UNIT_META
} from './config.js';
import { clamp } from './utils.js';
import { rollEnemyCapsuleDrop } from './powerups.js';

function sampleTrailAtDist(history, targetDist) {
  if (!history || history.length === 0) return { x: LOGICAL_W * 0.5, y: 80, angle: 0 };
  let acc = 0;
  for (let i = 0; i < history.length - 1; i++) {
    const a = history[i];
    const b = history[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + segLen >= targetDist && segLen > 0.001) {
      const f = (targetDist - acc) / segLen;
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        angle: a.angle
      };
    }
    acc += segLen;
  }
  const last = history[history.length - 1];
  return { x: last.x, y: last.y, angle: last.angle };
}

/**
 * Spawns an 8-segment Centoid (Advanced, green/gold Atari horizontal zig-zag)
 * or Alpha Centoid (Elite, dark blue/purple/pink 90-degree corridor crawler).
 */
export function spawnCentoidChain(game, isAlpha = false, startX = null, startY = null, dirX = null) {
  const fromLeft = dirX !== null ? dirX > 0 : Math.random() < 0.5;
  const initDirX = fromLeft ? 1 : -1;
  const sx = startX !== null ? clamp(startX, 34, LOGICAL_W - 34) : (fromLeft ? 34 : LOGICAL_W - 34);
  const sy = startY !== null ? clamp(startY, 74, 240) : (88 + Math.random() * 76);

  const chainId = game.centoidIdSeq++;
  const rootId = chainId;
  const segSpacing = isAlpha ? 20 : 19;
  const speed = isAlpha ? 158 : 132;
  const initAngle = initDirX > 0 ? 0 : Math.PI;

  // Pre-seed trail history behind the head so all 8 segments align crisply from frame 1
  const history = [];
  const totalLen = CENTOID_SEGMENTS * segSpacing + 40;
  for (let d = 0; d <= totalLen; d += 4) {
    history.push({
      x: sx - initDirX * d,
      y: sy,
      angle: initAngle
    });
  }

  const chain = {
    chainId,
    rootId,
    isAlpha,
    speed,
    segSpacing,
    // Centoid strict horizontal zig-zag state
    dirX: initDirX,
    dirY: 1, // +1 descending toward bottom, -1 ascending back up
    stepMode: 'HORIZ', // 'HORIZ' | 'STEP_Y'
    stepRemaining: 0,
    leftBound: 28 + Math.random() * 18,
    rightBound: LOGICAL_W - 28 - Math.random() * 18,
    // Alpha Centoid 90-degree corridor state (like crimson Null Threads!)
    axis: 'H', // 'H' | 'V'
    corridorDistLeft: 120 + Math.random() * 110,
    history
  };
  game.centoidChains.set(chainId, chain);

  const type = isAlpha ? 'ALPHA_CENTOID' : 'CENTOID';
  const segHp = isAlpha ? ALPHA_CENTOID_SEG_HP : 1;

  for (let k = 0; k < CENTOID_SEGMENTS; k++) {
    const pos = sampleTrailAtDist(history, k * segSpacing);
    game.enemies.push({
      id: game.enemyIdSeq++,
      type,
      isEnforcer: false,
      isElite: isAlpha,
      isMaster: false,
      isCentoid: true,
      isCentoidHead: k === 0,
      centoidChainId: chainId,
      centoidRootId: rootId,
      centoidOrder: k,
      isChallengeElite: false,
      isChallengeExtra: false,
      isChallengeGuard: false,
      hitRadius: k === 0 ? (isAlpha ? 17 : 15) : (isAlpha ? 14 : 13),
      maxHp: segHp,
      hp: segHp,
      ptsForm: isAlpha ? (k === 0 ? 450 : 120) : (k === 0 ? 220 : 60),
      ptsDive: isAlpha ? (k === 0 ? 450 : 120) : (k === 0 ? 220 : 60),
      x: pos.x,
      y: pos.y,
      homeX: pos.x,
      homeY: pos.y,
      rowIdx: 0,
      angle: pos.angle,
      state: 'CENTOID',
      path: null,
      pathT: 1,
      pathDur: 1,
      hitFlash: 0,
      animPhase: Math.random() * Math.PI * 2,
      diveT: 0,
      diveDur: 2.0,
      divePattern: 'SWOOP',
      divePath: null,
      beamTimer: 0,
      beamShield: 0,
      hasCapturedShip: false,
      shotCooldown: 1.8 + Math.random() * 1.4,
      wingSurgeQueue: 0,
      wingSurgeTimer: 0,
      surgePulse: 0,
      v1Synergy: null,
      speedBuffed: false,
      hpBuffed: false
    });
  }
}

/**
 * Handles Centoid / Alpha Centoid headshot instant-delete AND body-hit splitting (max 2 living per original).
 * Returns true if this function handled deletion of the enemy & chain (suppressing duplicate splice).
 */
export function handleCentoidSegmentDestroyed(game, e, idx, scored = true) {
  const chainId = e.centoidChainId;
  const rootId = e.centoidRootId;
  const chain = game.centoidChains.get(chainId);
  const col = e.type === 'ALPHA_CENTOID' ? COLORS.alphaPink : COLORS.centoidGreen;

  // Remove the hit segment first
  game.enemies.splice(idx, 1);
  game.spawnDeleteBurst(e.x, e.y, col, e.isCentoidHead ? 26 : 12, e.isCentoidHead ? 210 : 135);
  game.synth.playDeleteBurst(e.isCentoidHead);
  if (scored) {
    game.addScore(e.ptsForm, e.x, e.y, col);
  }

  // HEADSHOT: Instantly deletes the entire Centoid chain at once without splitting!
  if (e.isCentoidHead) {
    let bonusPts = 0;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const seg = game.enemies[i];
      if (seg.isCentoid && seg.centoidChainId === chainId) {
        game.spawnDeleteBurst(seg.x, seg.y, col, 10, 145);
        bonusPts += seg.ptsForm;
        game.enemies.splice(i, 1);
      }
    }
    game.centoidChains.delete(chainId);
    if (scored && bonusPts > 0) {
      game.addScore(bonusPts, e.x, e.y - 18, e.type === 'ALPHA_CENTOID' ? COLORS.alphaPink : COLORS.centoidGold);
    }
    game.spawnPopup(
      e.x,
      e.y - 30,
      e.type === 'ALPHA_CENTOID' ? 'ALPHA HEADSHOT!' : 'CENTOID HEADSHOT!',
      e.type === 'ALPHA_CENTOID' ? COLORS.alphaPink : COLORS.centoidGold,
      1.25
    );
    // Roll capsule drop once on clean headshot kill if no other split of this root remains
    const anyLeftForRoot = game.enemies.some(o => o.isCentoid && o.centoidRootId === rootId);
    if (scored && !anyLeftForRoot) {
      rollEnemyCapsuleDrop(game, e);
    }
    return;
  }

  // BODY HIT: Find remaining segments on this chain ahead & behind the destroyed segment
  const sameChain = game.enemies
    .filter(o => o.isCentoid && o.centoidChainId === chainId)
    .sort((a, b) => a.centoidOrder - b.centoidOrder);

  if (sameChain.length === 0) {
    game.centoidChains.delete(chainId);
    const anyLeftForRoot = game.enemies.some(o => o.isCentoid && o.centoidRootId === rootId);
    if (scored && !anyLeftForRoot) {
      rollEnemyCapsuleDrop(game, e);
    }
    return;
  }

  const ahead = sameChain.filter(s => s.centoidOrder < e.centoidOrder);
  const behind = sameChain.filter(s => s.centoidOrder > e.centoidOrder);

  // Re-index front segments cleanly
  ahead.forEach((seg, k) => {
    seg.centoidOrder = k;
    seg.isCentoidHead = k === 0;
  });

  if (behind.length === 0) return;

  // Count currently living chains spawned from this same original Centoid (max 2!)
  const livingRootChains = new Set();
  for (const o of game.enemies) {
    if (o.isCentoid && o.centoidRootId === rootId) {
      livingRootChains.add(o.centoidChainId);
    }
  }

  if (ahead.length === 0) {
    // Only trailing segments remain — promote front-most trailing segment to Head on same chain
    behind.forEach((seg, k) => {
      seg.centoidOrder = k;
      seg.isCentoidHead = k === 0;
      seg.hitRadius = k === 0 ? (e.type === 'ALPHA_CENTOID' ? 17 : 15) : seg.hitRadius;
    });
    return;
  }

  if (livingRootChains.size < CENTOID_MAX_SPLITS && chain) {
    // SPLIT into a second independent Centoid!
    const newChainId = game.centoidIdSeq++;
    const newHead = behind[0];
    const newDirX = -chain.dirX;
    const newAngle = newDirX > 0 ? 0 : Math.PI;
    const newHistory = [];
    for (let k = 0; k < behind.length; k++) {
      const seg = behind[k];
      newHistory.push({ x: seg.x, y: seg.y, angle: seg.angle });
    }
    // Pad history tail smoothly so trailing segments don't snap
    const tailSeg = behind[behind.length - 1];
    for (let d = 4; d <= 36; d += 4) {
      newHistory.push({ x: tailSeg.x - newDirX * d, y: tailSeg.y, angle: newAngle });
    }

    game.centoidChains.set(newChainId, {
      chainId: newChainId,
      rootId,
      isAlpha: chain.isAlpha,
      speed: chain.speed * 1.05,
      segSpacing: chain.segSpacing,
      dirX: newDirX,
      dirY: chain.dirY,
      stepMode: 'HORIZ',
      stepRemaining: 0,
      leftBound: 28 + Math.random() * 18,
      rightBound: LOGICAL_W - 28 - Math.random() * 18,
      axis: chain.isAlpha ? (chain.axis === 'H' ? 'V' : 'H') : 'H',
      corridorDistLeft: 95 + Math.random() * 95,
      history: newHistory
    });

    behind.forEach((seg, k) => {
      seg.centoidChainId = newChainId;
      seg.centoidOrder = k;
      seg.isCentoidHead = k === 0;
      if (k === 0) seg.hitRadius = chain.isAlpha ? 17 : 15;
    });

    game.synth.playCentoidSplit();
    game.spawnPopup(newHead.x, newHead.y - 20, 'SPLIT!', col, 0.9);
  } else {
    // Already at max 2 living centoids from this original: re-link tail cleanly to front chain
    const base = ahead.length;
    behind.forEach((seg, k) => {
      seg.centoidOrder = base + k;
      seg.isCentoidHead = false;
    });
  }
}

export function updateCentoids(game, dt) {
  if (!game.centoidChains || game.centoidChains.size === 0) return;
  const idleMode = !!game.sandboxIdle || !!game.sandboxPauseAnim;

  // Group living centoid segments by chainId
  const byChain = new Map();
  for (const e of game.enemies) {
    if (!e.isCentoid) continue;
    let arr = byChain.get(e.centoidChainId);
    if (!arr) {
      arr = [];
      byChain.set(e.centoidChainId, arr);
    }
    arr.push(e);
  }

  for (const [chainId, chain] of game.centoidChains.entries()) {
    const segs = byChain.get(chainId);
    if (!segs || segs.length === 0) {
      game.centoidChains.delete(chainId);
      continue;
    }
    segs.sort((a, b) => a.centoidOrder - b.centoidOrder);
    const head = segs[0];
    head.isCentoidHead = true;

    if (idleMode) continue;

    const spdMult = head.speedBuffed ? 1.3 : 1.0;
    const step = chain.speed * spdMult * dt;
    let hx = head.x;
    let hy = head.y;
    let angle = head.angle;

    if (!chain.isAlpha) {
      // CENTOID: Strict Atari horizontal zig-zags (NO diagonals or curves!) stepping down & reversing up at bottom
      if (chain.stepMode === 'HORIZ') {
        hx += chain.dirX * step;
        angle = chain.dirX > 0 ? 0 : Math.PI;
        if (chain.dirX > 0 && hx >= chain.rightBound) {
          hx = chain.rightBound;
          chain.stepMode = 'STEP_Y';
          chain.stepRemaining = 24;
          chain.dirX = -1;
        } else if (chain.dirX < 0 && hx <= chain.leftBound) {
          hx = chain.leftBound;
          chain.stepMode = 'STEP_Y';
          chain.stepRemaining = 24;
          chain.dirX = 1;
        }
      } else {
        // Pure 90-degree vertical step down (or up after reaching bottom!)
        const dy = Math.min(step, chain.stepRemaining);
        hy += chain.dirY * dy;
        angle = chain.dirY > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        chain.stepRemaining -= dy;
        if (hy >= LOGICAL_H - 96) {
          hy = LOGICAL_H - 96;
          chain.dirY = -1;
          chain.stepRemaining = 0;
        } else if (hy <= 78) {
          hy = 78;
          chain.dirY = 1;
          chain.stepRemaining = 0;
        }
        if (chain.stepRemaining <= 0.1) {
          chain.stepMode = 'HORIZ';
        }
      }
    } else {
      // ALPHA CENTOID: Moves like crimson Null Threads — crisp 90-degree orthogonal grid corridors!
      if (chain.axis === 'H') {
        hx += chain.dirX * step;
        angle = chain.dirX > 0 ? 0 : Math.PI;
        chain.corridorDistLeft -= step;
        const hitEdge = (chain.dirX > 0 && hx >= LOGICAL_W - 30) || (chain.dirX < 0 && hx <= 30);
        if (hitEdge) {
          hx = clamp(hx, 30, LOGICAL_W - 30);
          chain.dirX = -chain.dirX;
        }
        if (hitEdge || chain.corridorDistLeft <= 0) {
          chain.axis = 'V';
          if (hy >= LOGICAL_H - 115) chain.dirY = -1;
          else if (hy <= 92) chain.dirY = 1;
          else if (Math.random() < 0.28) chain.dirY = -chain.dirY;
          chain.corridorDistLeft = 62 + Math.random() * 78;
        }
      } else {
        hy += chain.dirY * step;
        angle = chain.dirY > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        chain.corridorDistLeft -= step;
        const hitEdge = (chain.dirY > 0 && hy >= LOGICAL_H - 92) || (chain.dirY < 0 && hy <= 76);
        if (hitEdge) {
          hy = clamp(hy, 76, LOGICAL_H - 92);
          chain.dirY = -chain.dirY;
        }
        if (hitEdge || chain.corridorDistLeft <= 0) {
          chain.axis = 'H';
          if (hx >= LOGICAL_W - 70) chain.dirX = -1;
          else if (hx <= 70) chain.dirX = 1;
          else chain.dirX = Math.random() < 0.5 ? 1 : -1;
          chain.corridorDistLeft = 105 + Math.random() * 145;
        }
      }
    }

    head.x = hx;
    head.y = hy;
    head.angle = angle;

    // Prepend head sample to path breadcrumb history
    const first = chain.history[0];
    if (!first || Math.hypot(hx - first.x, hy - first.y) >= 2.5) {
      chain.history.unshift({ x: hx, y: hy, angle });
      const maxPts = Math.ceil((segs.length * chain.segSpacing + 90) / 2.5);
      if (chain.history.length > maxPts) {
        chain.history.length = maxPts;
      }
    }

    // Trailing body segments follow exact head path
    for (let k = 1; k < segs.length; k++) {
      const seg = segs[k];
      seg.isCentoidHead = false;
      const pos = sampleTrailAtDist(chain.history, k * chain.segSpacing);
      seg.x = pos.x;
      seg.y = pos.y;
      seg.angle = pos.angle;
    }
  }
}

/**
 * Updates Pulsar 3.0s leaf-falling electro ball firing (both in formation & diving!).
 */
export function updatePulsarAttacks(game, e, dt) {
  if (e.type !== 'PULSAR' || game.sandboxIdle) return;
  if (e.state !== 'FORMATION' && e.state !== 'DIVING') return;
  e.pulsarTimer = (e.pulsarTimer !== undefined ? e.pulsarTimer : PULSAR_FIRE_INTERVAL * (0.5 + Math.random() * 0.5)) - dt;
  if (e.pulsarTimer <= 0 && game.player.alive) {
    e.pulsarTimer = PULSAR_FIRE_INTERVAL;
    game.electroBalls.push({
      baseX: e.x,
      x: e.x,
      y: e.y + 18,
      vy: 90 + Math.random() * 16,
      swayAmp: 34 + Math.random() * 22,
      swayFreq: 2.8 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      age: 0,
      radius: 13 // Size of a Drone!
    });
    game.synth.playElectroBall();
  }
}

/**
 * Spawns 3-4 omnidirectional spark lines on Pulsar death that shoot outward then trail downward.
 */
export function spawnPulsarDeathSparks(game, x, y) {
  const count = Math.random() < 0.5 ? 3 : 4;
  const baseAngle = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = baseAngle + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const burstSpd = 185 + Math.random() * 45;
    game.pulsarSparks.push({
      x,
      y,
      burstVx: Math.cos(a) * burstSpd,
      burstVy: Math.sin(a) * burstSpd,
      vx: Math.cos(a) * burstSpd,
      vy: Math.sin(a) * burstSpd,
      driftVx: Math.cos(a) * 32,
      fallVy: 225 + Math.random() * 40,
      burstDur: 0.30 + Math.random() * 0.10,
      age: 0,
      trail: [{ x, y }]
    });
  }
}

/**
 * Cost-Based Enemy Swap System (5% chance per mob per wave, strictly +-1 tier apart!).
 * Costs: Normal=1, Advanced=2, Elite=3, Master=6.
 * Respects sector unlock rules so late-game enemies never appear early.
 */
export function applyCostBasedSwaps(slots, effSec, hardMode = false) {
  const sec = hardMode ? Math.max(effSec, 8) : effSec;
  const unlockedByTier = (tier) =>
    Object.entries(UNIT_META)
      .filter(([, meta]) => meta.tier === tier && sec >= meta.minSec)
      .map(([type]) => type);

  const advPool = unlockedByTier(2);
  const elitePool = unlockedByTier(3);
  const masterPool = unlockedByTier(4);
  const pick = (pool, avoid = null) => {
    const filtered = avoid ? pool.filter(t => t !== avoid) : pool;
    const src = filtered.length > 0 ? filtered : pool;
    return src[Math.floor(Math.random() * src.length)] || null;
  };

  const result = [];
  const consumed = new Set();

  for (let i = 0; i < slots.length; i++) {
    if (consumed.has(i)) continue;
    const slot = slots[i];
    const meta = UNIT_META[slot.type];
    if (!meta || Math.random() >= COST_SWAP_CHANCE) {
      result.push(slot);
      continue;
    }

    // 1) Normal (Tier 1, Cost 1): 2x Normal -> 1x Advanced (Cost 2, +1 tier!)
    if (meta.tier === 1 && advPool.length > 0) {
      let partnerIdx = -1;
      for (let j = i + 1; j < slots.length; j++) {
        if (!consumed.has(j) && UNIT_META[slots[j].type]?.tier === 1) {
          partnerIdx = j;
          break;
        }
      }
      if (partnerIdx >= 0) {
        consumed.add(partnerIdx);
        const swapped = pick(advPool);
        if (swapped) {
          result.push({ ...slot, type: swapped });
          continue;
        }
      }
    }

    // 2) Advanced (Tier 2, Cost 2): Same-tier swap (V1 <-> Centoid) OR 3x Advanced (Cost 6) -> 2x Elite (Cost 6, +1 tier)
    if (meta.tier === 2) {
      if (elitePool.length > 0 && Math.random() < 0.45) {
        const partners = [];
        for (let j = i + 1; j < slots.length && partners.length < 2; j++) {
          if (!consumed.has(j) && UNIT_META[slots[j].type]?.tier === 2) partners.push(j);
        }
        if (partners.length === 2) {
          consumed.add(partners[0]);
          consumed.add(partners[1]);
          result.push({ ...slot, type: pick(elitePool) });
          result.push({ ...slots[partners[0]], type: pick(elitePool) });
          continue;
        }
      }
      const altAdv = pick(advPool, slot.type);
      if (altAdv && altAdv !== slot.type) {
        result.push({ ...slot, type: altAdv });
        continue;
      }
    }

    // 3) Elite (Tier 3, Cost 3): Same-tier swap (e.g. Elite Enforcer <-> Pulsar / Alpha Centoid) OR 2x Elite (Cost 6) -> 1x Master (Cost 6, +1 tier)
    if (meta.tier === 3) {
      if (masterPool.length > 0 && Math.random() < 0.35) {
        let partnerIdx = -1;
        for (let j = i + 1; j < slots.length; j++) {
          if (!consumed.has(j) && UNIT_META[slots[j].type]?.tier === 3) {
            partnerIdx = j;
            break;
          }
        }
        if (partnerIdx >= 0) {
          consumed.add(partnerIdx);
          result.push({ ...slot, type: pick(masterPool) });
          continue;
        }
      }
      const altElite = pick(elitePool, slot.type);
      if (altElite && altElite !== slot.type) {
        result.push({ ...slot, type: altElite });
        continue;
      }
    }

    // 4) Master (Tier 4, Cost 6): Swap strictly -1 tier -> 2x Elite (Cost 3 + 3 = 6; NEVER Normal or Advanced!)
    if (meta.tier === 4 && elitePool.length > 0) {
      const e1 = pick(elitePool);
      const e2 = pick(elitePool);
      result.push({ ...slot, type: e1, homeX: clamp(slot.homeX - 24, 42, LOGICAL_W - 42) });
      result.push({ ...slot, type: e2, homeX: clamp(slot.homeX + 24, 42, LOGICAL_W - 42) });
      continue;
    }

    result.push(slot);
  }

  return result;
}
