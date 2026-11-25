/* =========================================================================
   TRAINING / SANDBOX ARENA & TRAINING ROUNDS CONTROLLER
   ========================================================================= */

import { COLORS, HARD_FIELD_DEBUFF_DUR, LOGICAL_H, LOGICAL_W, PLAYER_DEFAULT_Y, PLAYER_MIN_Y } from './config.js';
import { clamp } from './utils.js';
import {
  clearActivePowerup,
  collectCapsule,
  hasPowerup,
  removePowerupSlot,
  spawnCapsule
} from './powerups.js';
import {
  BASE_FORMATION_STYLES,
  CENTOID_FORMATIONS,
  ENTRY_PATTERNS,
  PULSAR_FORMATIONS,
  SWAY_MODES,
  beginSector,
  buildStandardWaveQueue,
  spawnDirectEnemy
} from './enemies.js';
import { hideAllOverlays, resetInputs, updateHUD, updateStatusPills } from './ui.js';

export const SANDBOX_ENEMIES = [
  { id: 'DRONE', label: 'DRONE', cls: 'sbx-c-cyan' },
  { id: 'INTERCEPTOR', label: 'INTERCEPTOR', cls: 'sbx-c-gold' },
  { id: 'V1_ENFORCER', label: 'V1 ENFORCER', cls: 'sbx-c-amber' },
  { id: 'CENTOID', label: 'CENTOID', cls: 'sbx-c-green' },
  { id: 'FLUX_ENFORCER', label: 'ELITE FLUX', cls: 'sbx-c-cyan' },
  { id: 'NULL_ENFORCER', label: 'ELITE NULL', cls: 'sbx-c-red' },
  { id: 'ALPHA_CENTOID', label: 'ALPHA CENTOID', cls: 'sbx-c-pink' },
  { id: 'PULSAR', label: 'PULSAR', cls: 'sbx-c-yellow' },
  { id: 'MASTER_FLUX_ENFORCER', label: 'MASTER FLUX', cls: 'sbx-c-cyan' },
  { id: 'MASTER_NULL_ENFORCER', label: 'MASTER NULL', cls: 'sbx-c-red' }
];

export const SANDBOX_CAPSULES = [
  { id: 'CYAN', label: 'HOMING', cls: 'sbx-c-cyan' },
  { id: 'RED', label: 'LASER', cls: 'sbx-c-red' },
  { id: 'PURPLE', label: 'ARC WAVE', cls: 'sbx-c-purple' },
  { id: 'YELLOW', label: 'LIGHTNING', cls: 'sbx-c-yellow' },
  { id: 'CLONE', label: 'CLONES', cls: 'sbx-c-clone' }
];

// Extensible registry of Field Buffs / Debuffs for Sandbox toggling
export const SANDBOX_FIELD_EFFECTS = [
  { id: 'CYAN', label: 'CYAN FIELD', sub: '1.5x SLOW', kind: 'DEBUFF', dur: HARD_FIELD_DEBUFF_DUR, cls: 'sbx-c-cyan' },
  { id: 'RED', label: 'RED FIELD', sub: '0.5x DMG', kind: 'DEBUFF', dur: HARD_FIELD_DEBUFF_DUR, cls: 'sbx-c-red' }
];

function createDefaultSandboxConfig() {
  return {
    formation: 'PHALANX',
    entry: 'CROSS',
    sway: 'SWAY',
    tierSec: 7,
    hardTier: false,
    deployMode: 'OFF', // 'OFF' | 'DEPLOY' | 'DRAG'
    deployKind: null,  // null | 'ENEMY' | 'CAPSULE'
    deployValue: null,
    deployLabel: '',
    capsuleDeployMode: 'TOUCH', // 'TOUCH' | 'FLOAT'
    fieldIndefinite: true, // Default: Field Buffs / Debuffs stay active indefinitely until toggled off
    trainingSec: 7,
    trainingHard: false,
    drawerOpen: false,
    pwrTrayOpen: false
  };
}

export function startSandboxMode(game) {
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  game.synth.unlock();
  resetInputs(game);
  hideAllOverlays(game);
  game.resetGameData();

  game.sandboxMode = true;
  game.sandboxIdle = false;
  game.sandboxPauseAnim = false;
  game.sandboxHideBg = false;
  game.sandboxShowGrid = false;
  game.sandboxShowRuler = false;
  game.sandboxDrag = null;
  game.sandboxTrainingRound = false;
  game.sandbox = createDefaultSandboxConfig();
  game.hardMode = false;
  game.sector = 1;
  game.state = 'PLAYING';
  game.sectorPhase = 'COMBAT';
  game.player.invulnTimer = 0;
  game.player.x = LOGICAL_W * 0.5;
  game.player.y = PLAYER_DEFAULT_Y;

  game.spawnPopup(LOGICAL_W * 0.5, 220, 'TRAINING / SANDBOX ARENA', COLORS.emerald, 1.45);
  syncSandboxUI(game);
  updateHUD(game);
  updateStatusPills(game);
}

export function clearSandboxArena(game, keepCapsules = false) {
  game.enemies = [];
  game.enemyBullets = [];
  game.enforcerWings = [];
  game.threadTrails = [];
  game.electroBalls = [];
  game.pulsarSparks = [];
  game.enemyBuffWaves = [];
  game.lightningBolts = [];
  game.waveQueue = [];
  game.midWaveSpawns = [];
  game.waveSpawnTimer = 0;
  game.sandboxDrag = null;
  if (game.centoidChains) game.centoidChains.clear();
  if (!keepCapsules) {
    game.capsules = [];
    game.pendingCapsuleDrops = [];
  }
  game.floatingCapsulePlan = null;
  game.activeBeamBoss = null;
  game.capturedFighter = null;
  game.player.capturedById = null;
  game.fieldDebuff = null;
  game.sandboxTrainingRound = false;
  game.sectorPhase = 'COMBAT';
  game.synth.stopTractorBeam();
  syncSandboxUI(game);
  updateHUD(game);
}

export function spawnSandboxFormation(game, instant = false) {
  if (!game.sandboxMode || !game.sandbox) return;
  const sb = game.sandbox;
  clearSandboxArena(game, true);

  game.hardMode = !!sb.hardTier;
  game.sector = sb.tierSec;
  game.formationStyle = sb.formation;
  game.swayMode = sb.sway;
  game.formationClock = 0;
  game.sandboxTrainingRound = false;
  sb.deployMode = 'OFF';
  sb.deployKind = null;
  sb.deployValue = null;
  sb.deployLabel = '';
  sb.drawerOpen = false;

  buildStandardWaveQueue(game, sb.tierSec, 4, {
    forcedStyle: sb.formation,
    forcedEntry: sb.entry,
    instant,
    fullFormation: true,
    skipSwaps: true
  });

  game.sectorPhase = instant ? 'COMBAT' : 'ENTRY';
  game.diveTimer = 1.25;
  game.formationShotTimer = 1.8;
  game.wingLaunchTimer = 2.2;
  const fmtName = sb.formation.replaceAll('_', ' ');
  game.spawnPopup(
    LOGICAL_W * 0.5,
    185,
    instant ? `SET // ${fmtName}` : `ENTRY // ${fmtName}`,
    COLORS.cyan,
    1.25
  );
  syncSandboxUI(game);
  updateHUD(game);
}

export function startSandboxTrainingRound(game) {
  if (!game.sandboxMode || !game.sandbox) return;
  const sb = game.sandbox;
  clearSandboxArena(game, false);

  game.sandboxIdle = false;
  game.sandboxPauseAnim = false;
  game.sandboxTrainingRound = true;
  game.hardMode = !!sb.trainingHard;
  sb.deployMode = 'OFF';
  sb.deployKind = null;
  sb.deployValue = null;
  sb.deployLabel = '';
  sb.drawerOpen = false;

  beginSector(game, sb.trainingSec);
  syncSandboxUI(game);
  updateHUD(game);
}

export function handleSandboxCanvasDeploy(game, lx, ly) {
  if (!game.sandboxMode || !game.sandbox || game.sandbox.deployMode !== 'DEPLOY' || !game.sandbox.deployKind) {
    return false;
  }
  const sb = game.sandbox;
  if (sb.deployKind === 'ENEMY') {
    spawnDirectEnemy(game, sb.deployValue, lx, ly);
    game.synth.playCapsuleSpawn();
    return true;
  }
  if (sb.deployKind === 'CAPSULE') {
    spawnCapsule(game, lx, ly, sb.deployValue, 'SANDBOX_PLACE');
    return true;
  }
  return false;
}

/**
 * Sandbox DRAG mode: grab & reposition any Capsule, Enemy, Centoid chain, or the Aurex Fighter!
 */
export function startSandboxDrag(game, pointerId, lx, ly) {
  if (!game.sandboxMode || !game.sandbox || game.sandbox.deployMode !== 'DRAG') return false;

  // 1) Check Capsules first
  for (let i = game.capsules.length - 1; i >= 0; i--) {
    const cap = game.capsules[i];
    if (Math.hypot(cap.x - lx, cap.y - ly) <= cap.hitRadius + 10) {
      game.sandboxDrag = { pointerId, kind: 'CAPSULE', ref: cap, lastX: lx, lastY: ly };
      return true;
    }
  }

  // 2) Check Enemies (closest hit within hitRadius + 12)
  let bestEnemy = null;
  let bestDist = Infinity;
  for (const e of game.enemies) {
    const d = Math.hypot(e.x - lx, e.y - ly);
    if (d <= e.hitRadius + 12 && d < bestDist) {
      bestDist = d;
      bestEnemy = e;
    }
  }
  if (bestEnemy) {
    if (bestEnemy.isCentoid) {
      game.sandboxDrag = {
        pointerId,
        kind: 'CENTOID',
        chainId: bestEnemy.centoidChainId,
        lastX: lx,
        lastY: ly
      };
    } else {
      game.sandboxDrag = { pointerId, kind: 'ENEMY', ref: bestEnemy, lastX: lx, lastY: ly };
    }
    return true;
  }

  // 3) Check Player ship or lower dodge zone
  const p = game.player;
  if (p.alive && !p.capturedById && (Math.hypot(p.x - lx, p.y - ly) <= 52 || ly >= PLAYER_MIN_Y - 14)) {
    game.sandboxDrag = { pointerId, kind: 'PLAYER', ref: p, lastX: lx, lastY: ly };
    return true;
  }

  return false;
}

export function moveSandboxDrag(game, pointerId, lx, ly) {
  const d = game.sandboxDrag;
  if (!d || d.pointerId !== pointerId) return false;
  const dx = lx - d.lastX;
  const dy = ly - d.lastY;
  d.lastX = lx;
  d.lastY = ly;

  if (d.kind === 'CAPSULE' && d.ref) {
    const cap = d.ref;
    const nx = clamp(cap.x + dx, 24, LOGICAL_W - 24);
    const ny = clamp(cap.y + dy, 46, LOGICAL_H - 44);
    cap.x = nx;
    cap.y = ny;
    cap.anchorX = nx;
    cap.anchorY = ny;
    cap.targetX = nx;
    cap.targetY = ny;
    return true;
  }

  if (d.kind === 'ENEMY' && d.ref) {
    const e = d.ref;
    const nx = clamp(e.x + dx, 24, LOGICAL_W - 24);
    const ny = clamp(e.y + dy, 46, LOGICAL_H - 44);
    const adx = nx - e.x;
    const ady = ny - e.y;
    e.x = nx;
    e.y = ny;
    e.homeX = clamp((e.homeX || nx) + adx, 24, LOGICAL_W - 24);
    e.homeY = clamp((e.homeY || ny) + ady, 46, LOGICAL_H - 44);
    return true;
  }

  if (d.kind === 'CENTOID') {
    const chain = game.centoidChains && game.centoidChains.get(d.chainId);
    for (const seg of game.enemies) {
      if (seg.isCentoid && seg.centoidChainId === d.chainId) {
        seg.x += dx;
        seg.y += dy;
        seg.homeX = seg.x;
        seg.homeY = seg.y;
      }
    }
    if (chain && chain.history) {
      for (const pt of chain.history) {
        pt.x += dx;
        pt.y += dy;
      }
    }
    return true;
  }

  if (d.kind === 'PLAYER' && d.ref) {
    d.ref.x += dx;
    d.ref.y += dy;
    game.clampPlayerPosition();
    return true;
  }

  return false;
}

export function endSandboxDrag(game, pointerId) {
  if (game.sandboxDrag && game.sandboxDrag.pointerId === pointerId) {
    game.sandboxDrag = null;
    return true;
  }
  return false;
}

export function setSandboxDrawerOpen(game, open) {
  if (!game.sandbox) return;
  game.sandbox.drawerOpen = !!open;
  syncSandboxUI(game);
}

export function disarmSandboxDeploy(game) {
  if (!game.sandbox) return;
  game.sandbox.deployMode = 'OFF';
  game.sandbox.deployKind = null;
  game.sandbox.deployValue = null;
  game.sandbox.deployLabel = '';
  game.sandboxDrag = null;
  syncSandboxUI(game);
}

export function syncSandboxPowerupTray(game) {
  const corner = document.getElementById('sandbox-pwr-corner');
  const tray = document.getElementById('sbx-pwr-tray');
  const btnTray = document.getElementById('sbx-btn-pwr-tray');
  if (!corner || !tray || !btnTray) return;

  const active = !!game.sandboxMode && game.state === 'PLAYING' && !!game.sandbox;
  const drawerOpen = active && !!game.sandbox.drawerOpen;
  corner.classList.toggle('hidden', !active || drawerOpen);
  if (!active) {
    tray.classList.add('hidden');
    return;
  }

  const open = !!game.sandbox.pwrTrayOpen;
  tray.classList.toggle('hidden', !open);
  btnTray.textContent = open ? 'PWR ▼' : 'PWR ▲';
  btnTray.classList.toggle('is-open', open);

  const btnRuler = document.getElementById('sbx-btn-ruler');
  if (btnRuler) {
    btnRuler.textContent = game.sandboxShowRuler ? 'RULER:ON' : 'RULER';
    btnRuler.classList.toggle('is-on', !!game.sandboxShowRuler);
  }

  document.querySelectorAll('.sbx-pwr-chip').forEach((btn) => {
    const type = btn.dataset.pwr;
    const isOn = hasPowerup(game, type);
    btn.classList.toggle('is-active', isOn);
    const mark = btn.querySelector('.sbx-pwr-mark');
    if (mark) mark.textContent = isOn ? '✓' : '+';
  });
}

export function syncSandboxUI(game) {
  const strip = document.getElementById('sandbox-strip');
  const drawer = document.getElementById('sandbox-drawer');
  const deployBar = document.getElementById('sandbox-deploy-bar');
  if (!strip || !drawer) return;

  const active = !!game.sandboxMode && (game.state === 'PLAYING' || game.state === 'PAUSED');
  document.body.classList.toggle('sandbox-active', active);
  strip.classList.toggle('hidden', !active);
  syncSandboxPowerupTray(game);
  if (!active || !game.sandbox) {
    drawer.classList.add('hidden');
    if (deployBar) deployBar.classList.add('hidden');
    return;
  }

  const sb = game.sandbox;
  drawer.classList.toggle('hidden', !sb.drawerOpen);

  // Bottom Deploy / Drag / Stop Action Bar
  if (deployBar) {
    const showBar = sb.deployMode !== 'OFF' && !sb.drawerOpen;
    deployBar.classList.toggle('hidden', !showBar);

    const tag = document.getElementById('sbx-deploy-entity-tag');
    if (tag) {
      tag.textContent = sb.deployLabel
        ? (sb.deployMode === 'DRAG' ? `DRAG (${sb.deployLabel})` : sb.deployLabel)
        : 'DRAG ENTITIES';
    }

    const btnDep = document.getElementById('sbx-mode-deploy');
    const btnDrg = document.getElementById('sbx-mode-drag');
    if (btnDep) {
      btnDep.disabled = !sb.deployKind;
      btnDep.classList.toggle('selected', sb.deployMode === 'DEPLOY');
    }
    if (btnDrg) {
      btnDrg.classList.toggle('selected', sb.deployMode === 'DRAG');
    }
  }

  const btnTools = document.getElementById('sbx-btn-tools');
  if (btnTools) {
    btnTools.textContent = sb.drawerOpen ? 'TOOLS ▲' : 'TOOLS ▼';
    btnTools.classList.toggle('is-open', sb.drawerOpen);
  }

  const btnAi = document.getElementById('sbx-btn-ai');
  if (btnAi) {
    btnAi.textContent = game.sandboxIdle ? 'AI:IDLE' : 'AI:ATK';
    btnAi.className = `sbx-pill ${game.sandboxIdle ? 'is-idle' : 'is-attack'}`;
  }

  const btnAiDrawer = document.getElementById('sbx-drawer-ai');
  if (btnAiDrawer) {
    btnAiDrawer.textContent = game.sandboxIdle ? 'ENEMIES: IDLE' : 'ENEMIES: ATTACK';
    btnAiDrawer.className = `sbx-action-btn ${game.sandboxIdle ? 'amber' : 'danger'}`;
  }

  const btnAnim = document.getElementById('sbx-btn-anim');
  if (btnAnim) {
    btnAnim.textContent = game.sandboxPauseAnim ? 'ANIM:PAUSED' : 'ANIM:ON';
    btnAnim.className = `sbx-pill ${game.sandboxPauseAnim ? 'is-paused' : ''}`;
  }

  const btnAnimDrawer = document.getElementById('sbx-drawer-anim');
  if (btnAnimDrawer) {
    btnAnimDrawer.textContent = game.sandboxPauseAnim ? 'IDLE ANIM: PAUSED' : 'IDLE ANIM: ON';
    btnAnimDrawer.className = `sbx-action-btn ${game.sandboxPauseAnim ? 'amber' : 'secondary'}`;
  }

  const btnBg = document.getElementById('sbx-btn-toggle-bg');
  if (btnBg) {
    btnBg.textContent = game.sandboxHideBg ? 'ENDFRAME BG: OFF' : 'ENDFRAME BG: ON';
    btnBg.className = `sbx-action-btn ${game.sandboxHideBg ? 'secondary' : 'primary'}`;
  }

  const btnGrid = document.getElementById('sbx-btn-toggle-grid');
  if (btnGrid) {
    btnGrid.textContent = game.sandboxShowGrid ? 'MEASURE GRID: ON' : 'MEASURE GRID: OFF';
    btnGrid.className = `sbx-action-btn ${game.sandboxShowGrid ? 'emerald' : 'secondary'}`;
  }

  const btnDual = document.getElementById('sbx-btn-dual');
  if (btnDual) {
    btnDual.textContent = `DUAL:${game.player.dual ? 'ON' : 'OFF'}`;
    btnDual.className = `sbx-pill ${game.player.dual ? 'is-on' : ''}`;
  }

  const btnDualDrawer = document.getElementById('sbx-drawer-dual');
  if (btnDualDrawer) {
    btnDualDrawer.textContent = `DUAL FIGHTER: ${game.player.dual ? 'ON' : 'OFF'}`;
    btnDualDrawer.className = `sbx-action-btn ${game.player.dual ? 'emerald' : 'secondary'}`;
  }

  const btnHardMode = document.getElementById('sbx-btn-hard-mode');
  if (btnHardMode) {
    btnHardMode.textContent = game.hardMode ? 'HARD MODE: ON' : 'HARD MODE: OFF';
    btnHardMode.className = `sbx-action-btn ${game.hardMode ? 'hard-on' : 'secondary'}`;
  }

  const btnFieldInf = document.getElementById('sbx-field-mode-inf');
  const btnFieldTimed = document.getElementById('sbx-field-mode-timed');
  if (btnFieldInf) btnFieldInf.classList.toggle('selected', !!sb.fieldIndefinite);
  if (btnFieldTimed) btnFieldTimed.classList.toggle('selected', !sb.fieldIndefinite);

  document.querySelectorAll('.sbx-field-chip').forEach((chip) => {
    const isOn = !!(game.fieldDebuff && game.fieldDebuff.type === chip.dataset.fieldId);
    chip.classList.toggle('is-active', isOn);
  });

  const btnCapTouch = document.getElementById('sbx-cap-mode-touch');
  const btnCapFloat = document.getElementById('sbx-cap-mode-float');
  if (btnCapTouch) btnCapTouch.classList.toggle('selected', sb.capsuleDeployMode === 'TOUCH');
  if (btnCapFloat) btnCapFloat.classList.toggle('selected', sb.capsuleDeployMode === 'FLOAT');

  const btnTrainNorm = document.getElementById('sbx-train-normal');
  const btnTrainHard = document.getElementById('sbx-train-hard');
  if (btnTrainNorm) btnTrainNorm.classList.toggle('selected', !sb.trainingHard);
  if (btnTrainHard) btnTrainHard.classList.toggle('selected', sb.trainingHard);

  const btnTrainStart = document.getElementById('sbx-btn-start-training');
  const btnTrainStop = document.getElementById('sbx-btn-stop-training');
  if (btnTrainStart) {
    btnTrainStart.textContent = game.sandboxTrainingRound
      ? `RESTART SEC ${String(sb.trainingSec).padStart(2, '0')}`
      : 'START TRAINING ROUND';
  }
  if (btnTrainStop) {
    btnTrainStop.classList.toggle('hidden', !game.sandboxTrainingRound);
  }

  // Sync selects
  const selFmt = document.getElementById('sbx-sel-formation');
  if (selFmt && selFmt.value !== sb.formation) selFmt.value = sb.formation;
  const selEntry = document.getElementById('sbx-sel-entry');
  if (selEntry && selEntry.value !== sb.entry) selEntry.value = sb.entry;
  const selSway = document.getElementById('sbx-sel-sway');
  if (selSway && selSway.value !== sb.sway) selSway.value = sb.sway;
  const selTier = document.getElementById('sbx-sel-tier');
  if (selTier) {
    const val = sb.hardTier ? 'HARD' : String(sb.tierSec);
    if (selTier.value !== val) selTier.value = val;
  }
  const selTrainSec = document.getElementById('sbx-sel-train-sec');
  if (selTrainSec && Number(selTrainSec.value) !== sb.trainingSec) {
    selTrainSec.value = String(sb.trainingSec);
  }

  // Highlight active deploy chip
  document.querySelectorAll('.sbx-deploy-chip').forEach((chip) => {
    const isSel = sb.deployKind === chip.dataset.kind && sb.deployValue === chip.dataset.value && sb.deployMode !== 'OFF';
    chip.classList.toggle('selected', isSel);
  });
}

function populateSandboxDom(game) {
  const selFmt = document.getElementById('sbx-sel-formation');
  if (selFmt && selFmt.options.length === 0) {
    const addGroup = (label, list) => {
      const og = document.createElement('optgroup');
      og.label = label;
      for (const id of list) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id.replaceAll('_', ' ');
        og.appendChild(opt);
      }
      selFmt.appendChild(og);
    };
    addGroup('BASE FORMATIONS (5)', BASE_FORMATION_STYLES);
    addGroup('CENTOID FORMATIONS (4)', CENTOID_FORMATIONS);
    addGroup('PULSAR FORMATIONS (4)', PULSAR_FORMATIONS);
  }

  const selEntry = document.getElementById('sbx-sel-entry');
  if (selEntry && selEntry.options.length === 0) {
    for (const id of ENTRY_PATTERNS) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id.replaceAll('_', ' ');
      selEntry.appendChild(opt);
    }
  }

  const selSway = document.getElementById('sbx-sel-sway');
  if (selSway && selSway.options.length === 0) {
    for (const id of SWAY_MODES) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id.replaceAll('_', ' ');
      selSway.appendChild(opt);
    }
  }

  const selTier = document.getElementById('sbx-sel-tier');
  if (selTier && selTier.options.length === 0) {
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((s) => {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `SEC ${String(s).padStart(2, '0')} FLEET`;
      selTier.appendChild(opt);
    });
    const hardOpt = document.createElement('option');
    hardOpt.value = 'HARD';
    hardOpt.textContent = 'HARD FLEET (MASTERS)';
    selTier.appendChild(hardOpt);
  }

  const selTrainSec = document.getElementById('sbx-sel-train-sec');
  if (selTrainSec && selTrainSec.options.length === 0) {
    for (let s = 1; s <= 12; s++) {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `SECTOR ${String(s).padStart(2, '0')}`;
      selTrainSec.appendChild(opt);
    }
  }

  const enemyGrid = document.getElementById('sbx-enemy-grid');
  if (enemyGrid && enemyGrid.childElementCount === 0) {
    for (const en of SANDBOX_ENEMIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sbx-chip sbx-deploy-chip ${en.cls}`;
      btn.dataset.kind = 'ENEMY';
      btn.dataset.value = en.id;
      btn.textContent = en.label;
      btn.addEventListener('click', () => {
        if (!game.sandbox) return;
        game.sandbox.deployKind = 'ENEMY';
        game.sandbox.deployValue = en.id;
        game.sandbox.deployLabel = en.label;
        game.sandbox.deployMode = 'DEPLOY';
        game.sandbox.drawerOpen = false;
        game.spawnPopup(LOGICAL_W * 0.5, 190, `DEPLOY: ${en.label}`, COLORS.cyan, 1.1);
        syncSandboxUI(game);
      });
      enemyGrid.appendChild(btn);
    }
  }

  const capGrid = document.getElementById('sbx-capsule-grid');
  if (capGrid && capGrid.childElementCount === 0) {
    for (const cap of SANDBOX_CAPSULES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sbx-chip sbx-deploy-chip ${cap.cls}`;
      btn.dataset.kind = 'CAPSULE';
      btn.dataset.value = cap.id;
      btn.textContent = cap.label;
      btn.addEventListener('click', () => {
        if (!game.sandbox) return;
        if (game.sandbox.capsuleDeployMode === 'FLOAT') {
          spawnCapsule(game, 0, 0, cap.id, 'FLOAT');
          game.sandbox.drawerOpen = false;
          syncSandboxUI(game);
        } else {
          game.sandbox.deployKind = 'CAPSULE';
          game.sandbox.deployValue = cap.id;
          game.sandbox.deployLabel = `${cap.label} CAP`;
          game.sandbox.deployMode = 'DEPLOY';
          game.sandbox.drawerOpen = false;
          game.spawnPopup(LOGICAL_W * 0.5, 190, `PLACE: ${cap.label} CAP`, COLORS.gold, 1.1);
          syncSandboxUI(game);
        }
      });
      capGrid.appendChild(btn);
    }
  }

  // Bottom-Left Collapsible Power-Up Direct Selector List
  const pwrTrayList = document.getElementById('sbx-pwr-tray-list');
  if (pwrTrayList && pwrTrayList.childElementCount === 0) {
    for (const cap of SANDBOX_CAPSULES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sbx-pwr-item sbx-pwr-chip ${cap.cls}`;
      btn.dataset.pwr = cap.id;
      btn.innerHTML = `<span>${cap.label}</span><span class="sbx-pwr-mark">+</span>`;
      btn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        game.synth.unlock();
        if (hasPowerup(game, cap.id)) {
          removePowerupSlot(game, cap.id, true);
          updateStatusPills(game);
        } else {
          collectCapsule(game, { type: cap.id, x: game.player.x, y: game.player.y });
        }
        syncSandboxPowerupTray(game);
      });
      pwrTrayList.appendChild(btn);
    }
  }

  // Extensible Field Buffs / Debuffs Grid
  const fieldGrid = document.getElementById('sbx-field-grid');
  if (fieldGrid && fieldGrid.childElementCount === 0) {
    for (const eff of SANDBOX_FIELD_EFFECTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sbx-chip sbx-field-chip ${eff.cls}`;
      btn.dataset.fieldId = eff.id;
      btn.innerHTML = `<span>${eff.label}</span><span class="sbx-field-sub">${eff.sub}</span>`;
      btn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        game.synth.unlock();
        const alreadyActive = game.fieldDebuff && game.fieldDebuff.type === eff.id;
        if (alreadyActive) {
          game.fieldDebuff = null;
          game.spawnPopup(LOGICAL_W * 0.5, 190, `${eff.label} OFF`, COLORS.white, 1.0);
        } else {
          const isIndef = !!(game.sandbox && game.sandbox.fieldIndefinite);
          game.fieldDebuff = {
            type: eff.id,
            timer: eff.dur,
            maxTimer: eff.dur,
            indefinite: isIndef
          };
          game.synth.playDebuff(eff.id === 'RED');
          game.spawnPopup(
            LOGICAL_W * 0.5,
            190,
            `${eff.label} ${isIndef ? '[∞]' : `[${eff.dur.toFixed(0)}s]`}`,
            eff.id === 'RED' ? COLORS.nullRed : COLORS.cyan,
            1.2
          );
        }
        updateStatusPills(game);
        syncSandboxUI(game);
      });
      fieldGrid.appendChild(btn);
    }
  }
}

export function bindSandboxEvents(game) {
  populateSandboxDom(game);

  document.getElementById('btn-open-sandbox')?.addEventListener('click', () => startSandboxMode(game));

  document.getElementById('sbx-btn-exit')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.returnToMainMenu();
  });

  document.getElementById('sbx-btn-tools')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (!game.sandbox) return;
    setSandboxDrawerOpen(game, !game.sandbox.drawerOpen);
  });

  document.getElementById('sbx-btn-close-drawer')?.addEventListener('click', () => {
    setSandboxDrawerOpen(game, false);
  });

  const toggleAi = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    game.sandboxIdle = !game.sandboxIdle;
    game.spawnPopup(
      LOGICAL_W * 0.5,
      200,
      game.sandboxIdle ? 'ENEMIES: IDLE MODE' : 'ENEMIES: ATTACK MODE',
      game.sandboxIdle ? COLORS.amber : COLORS.nullRed,
      1.1
    );
    syncSandboxUI(game);
  };
  document.getElementById('sbx-btn-ai')?.addEventListener('click', toggleAi);
  document.getElementById('sbx-drawer-ai')?.addEventListener('click', toggleAi);

  const toggleAnim = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    game.sandboxPauseAnim = !game.sandboxPauseAnim;
    game.spawnPopup(
      LOGICAL_W * 0.5,
      200,
      game.sandboxPauseAnim ? 'IDLE ANIM: PAUSED' : 'IDLE ANIM: RESUMED',
      game.sandboxPauseAnim ? COLORS.purpleBright : COLORS.cyan,
      1.05
    );
    syncSandboxUI(game);
  };
  document.getElementById('sbx-btn-anim')?.addEventListener('click', toggleAnim);
  document.getElementById('sbx-drawer-anim')?.addEventListener('click', toggleAnim);

  document.getElementById('sbx-btn-toggle-bg')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.sandboxHideBg = !game.sandboxHideBg;
    syncSandboxUI(game);
  });

  document.getElementById('sbx-btn-toggle-grid')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.sandboxShowGrid = !game.sandboxShowGrid;
    syncSandboxUI(game);
  });

  const toggleDual = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    game.player.dual = !game.player.dual;
    game.clampPlayerPosition();
    game.synth.playRescue();
    game.spawnPopup(
      game.player.x,
      game.player.y - 30,
      game.player.dual ? 'DUAL-FIGHTER ON' : 'SINGLE FIGHTER',
      COLORS.emerald,
      1.1
    );
    syncSandboxUI(game);
  };
  document.getElementById('sbx-btn-dual')?.addEventListener('click', toggleDual);
  document.getElementById('sbx-drawer-dual')?.addEventListener('click', toggleDual);

  // Bottom Deploy / Drag / Stop Controls
  document.getElementById('sbx-mode-deploy')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (!game.sandbox || !game.sandbox.deployKind) return;
    game.sandbox.deployMode = 'DEPLOY';
    game.sandboxDrag = null;
    syncSandboxUI(game);
  });

  const enterDragMode = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    if (!game.sandbox) return;
    game.sandbox.deployMode = 'DRAG';
    game.sandbox.drawerOpen = false;
    game.sandboxDrag = null;
    game.spawnPopup(LOGICAL_W * 0.5, 195, 'DRAG ANY ENEMY, CAPSULE OR SHIP', COLORS.emerald, 1.15);
    syncSandboxUI(game);
  };
  document.getElementById('sbx-mode-drag')?.addEventListener('click', enterDragMode);
  document.getElementById('sbx-btn-start-drag')?.addEventListener('click', enterDragMode);

  document.getElementById('sbx-mode-stop')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    disarmSandboxDeploy(game);
  });

  document.getElementById('sbx-btn-clear')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    clearSandboxArena(game, false);
    game.spawnPopup(LOGICAL_W * 0.5, 200, 'ARENA CLEARED', COLORS.cyan, 1.0);
  });

  document.getElementById('sbx-btn-hard-mode')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.hardMode = !game.hardMode;
    game.spawnPopup(
      LOGICAL_W * 0.5,
      195,
      game.hardMode ? 'SANDBOX HARD MODE: ON' : 'SANDBOX HARD MODE: OFF',
      game.hardMode ? COLORS.nullRed : COLORS.cyan,
      1.15
    );
    syncSandboxUI(game);
    updateHUD(game);
  });

  document.getElementById('sbx-field-mode-inf')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (!game.sandbox) return;
    game.sandbox.fieldIndefinite = true;
    if (game.fieldDebuff) {
      game.fieldDebuff.indefinite = true;
      game.fieldDebuff.timer = game.fieldDebuff.maxTimer;
    }
    updateStatusPills(game);
    syncSandboxUI(game);
  });

  document.getElementById('sbx-field-mode-timed')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (!game.sandbox) return;
    game.sandbox.fieldIndefinite = false;
    if (game.fieldDebuff) {
      game.fieldDebuff.indefinite = false;
      game.fieldDebuff.timer = game.fieldDebuff.maxTimer;
    }
    updateStatusPills(game);
    syncSandboxUI(game);
  });

  const clearPowerupsAction = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    clearActivePowerup(game);
    game.player.slowTimer = 0;
    game.player.dmgDebuffTimer = 0;
    game.player.fireJamTimer = 0;
    game.player.sparkSlowTimer = 0;
    if (game.fieldDebuff && !game.fieldDebuff.indefinite) {
      game.fieldDebuff = null;
    }
    updateStatusPills(game);
    syncSandboxPowerupTray(game);
    game.spawnPopup(game.player.x, game.player.y - 28, 'POWER-UPS CLEARED', COLORS.white, 1.0);
  };
  document.getElementById('sbx-btn-clear-pwr')?.addEventListener('click', clearPowerupsAction);
  document.getElementById('sbx-btn-quick-clear-pwr')?.addEventListener('click', clearPowerupsAction);

  document.getElementById('sbx-btn-pwr-tray')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (!game.sandbox) return;
    game.sandbox.pwrTrayOpen = !game.sandbox.pwrTrayOpen;
    syncSandboxPowerupTray(game);
  });

  document.getElementById('sbx-btn-ruler')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.sandboxShowRuler = !game.sandboxShowRuler;
    syncSandboxPowerupTray(game);
  });

  document.getElementById('sbx-pwr-all')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.synth.unlock();
    for (const cap of SANDBOX_CAPSULES) {
      collectCapsule(game, { type: cap.id, x: game.player.x, y: game.player.y });
    }
    syncSandboxPowerupTray(game);
  });

  document.getElementById('sbx-sel-formation')?.addEventListener('change', (e) => {
    if (game.sandbox) game.sandbox.formation = e.target.value;
  });
  document.getElementById('sbx-sel-entry')?.addEventListener('change', (e) => {
    if (game.sandbox) game.sandbox.entry = e.target.value;
  });
  document.getElementById('sbx-sel-sway')?.addEventListener('change', (e) => {
    if (game.sandbox) {
      game.sandbox.sway = e.target.value;
      game.swayMode = e.target.value; // Live preview sway rhythm immediately!
    }
  });
  document.getElementById('sbx-sel-tier')?.addEventListener('change', (e) => {
    if (!game.sandbox) return;
    if (e.target.value === 'HARD') {
      game.sandbox.hardTier = true;
      game.sandbox.tierSec = 6;
    } else {
      game.sandbox.hardTier = false;
      game.sandbox.tierSec = clamp(parseInt(e.target.value, 10) || 7, 1, 12);
    }
  });

  document.getElementById('sbx-btn-spawn-entry')?.addEventListener('click', () => {
    spawnSandboxFormation(game, false);
  });
  document.getElementById('sbx-btn-set-instant')?.addEventListener('click', () => {
    spawnSandboxFormation(game, true);
  });

  document.getElementById('sbx-cap-mode-touch')?.addEventListener('click', () => {
    if (game.sandbox) {
      game.sandbox.capsuleDeployMode = 'TOUCH';
      syncSandboxUI(game);
    }
  });
  document.getElementById('sbx-cap-mode-float')?.addEventListener('click', () => {
    if (game.sandbox) {
      game.sandbox.capsuleDeployMode = 'FLOAT';
      if (game.sandbox.deployKind === 'CAPSULE') disarmSandboxDeploy(game);
      else syncSandboxUI(game);
    }
  });

  document.getElementById('sbx-sel-train-sec')?.addEventListener('change', (e) => {
    if (game.sandbox) game.sandbox.trainingSec = clamp(parseInt(e.target.value, 10) || 1, 1, 12);
  });
  document.getElementById('sbx-train-normal')?.addEventListener('click', () => {
    if (game.sandbox) {
      game.sandbox.trainingHard = false;
      syncSandboxUI(game);
    }
  });
  document.getElementById('sbx-train-hard')?.addEventListener('click', () => {
    if (game.sandbox) {
      game.sandbox.trainingHard = true;
      syncSandboxUI(game);
    }
  });
  document.getElementById('sbx-btn-start-training')?.addEventListener('click', () => {
    startSandboxTrainingRound(game);
  });
  document.getElementById('sbx-btn-stop-training')?.addEventListener('click', () => {
    clearSandboxArena(game, false);
    game.spawnPopup(LOGICAL_W * 0.5, 200, 'TRAINING STOPPED', COLORS.amber, 1.1);
  });
}
