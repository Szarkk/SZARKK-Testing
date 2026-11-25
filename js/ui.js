/* =========================================================================
   UI SYNCHRONIZATION, OVERLAYS, ARCHIVE, LEADERBOARD & 2D DIRECT-DRAG INPUT
   ========================================================================= */

import {
  ARCHIVE_ENTRIES,
  ARC_WAVE_MAX,
  CANNON_AUTO_FIRE_DELAY,
  CHAIN_LIGHTNING_MAX_SHOTS,
  CYAN_SHOT_ENERGY_COST,
  GAME_VERSION,
  LOGICAL_H,
  LOGICAL_W,
  PLAYER_MIN_Y,
  POWERUP_MAX_ENERGY,
  RED_LASER_DRAIN_PER_SEC,
  STORAGE_KEYS,
  TAP_BUFFER_TIME,
  TOUCH_HINT_DURATION,
  YELLOW_SHOT_ENERGY_COST
} from './config.js';
import { clamp, writeLS } from './utils.js';
import { getActivePowerups } from './powerups.js';
import { getPlayerMoveSpeedMult } from './player.js';
import {
  disarmSandboxDeploy,
  endSandboxDrag,
  handleSandboxCanvasDeploy,
  moveSandboxDrag,
  setSandboxDrawerOpen,
  startSandboxDrag,
  syncSandboxPowerupTray
} from './sandbox.js';
import {
  drawAurexFighter,
  drawEnemySprite,
  drawEnforcerWingSprite,
  drawPixelCapsule
} from './sprites.js';
import {
  clearLeaderboard,
  getSavedCallsign,
  getTopLeaderboardScore,
  hasAnyLeaderboardEntries,
  loadLeaderboard,
  saveLeaderboardEntry
} from './leaderboard.js';

export function cacheDomElements(game) {
  game.canvas = document.getElementById('game-canvas');
  game.ctx = game.canvas.getContext('2d');
  game.stageContainer = document.getElementById('stage-container');
  game.crtOverlay = document.getElementById('crt-overlay');

  game.elScore = document.getElementById('hud-score');
  game.elHigh = document.getElementById('hud-high');
  game.elSector = document.getElementById('hud-sector');
  game.elLives = document.getElementById('hud-lives');
  game.elStartHigh = document.getElementById('start-high-val');
  game.elMenuCtrlChip = document.getElementById('menu-ctrl-chip');

  game.pwrGaugeBar = document.getElementById('powerup-gauge-bar');
  game._pwrGaugeKey = '';
  game._pwrSlotEls = {};

  game.pillSlow = document.getElementById('pill-slow');
  game.pillSlowTime = document.getElementById('pill-slow-time');
  game.pillSlowFill = document.getElementById('pill-slow-fill');

  game.pillDmg = document.getElementById('pill-dmg');
  game.pillDmgTime = document.getElementById('pill-dmg-time');
  game.pillDmgFill = document.getElementById('pill-dmg-fill');

  game.pillField = document.getElementById('pill-field');
  game.pillFieldLabel = document.getElementById('pill-field-label');
  game.pillFieldTime = document.getElementById('pill-field-time');
  game.pillFieldFill = document.getElementById('pill-field-fill');

  game.pillShock = document.getElementById('pill-shock');
  game.pillShockLabel = document.getElementById('pill-shock-label');
  game.pillShockTime = document.getElementById('pill-shock-time');
  game.pillShockFill = document.getElementById('pill-shock-fill');

  game.btnAuto = document.getElementById('btn-auto');
  game.btnCrt = document.getElementById('btn-crt');
  game.btnSfx = document.getElementById('btn-sfx');
  game.btnPause = document.getElementById('btn-pause');

  game.overlayStart = document.getElementById('overlay-start');
  game.overlayControls = document.getElementById('overlay-controls');
  game.overlayArchive = document.getElementById('overlay-archive');
  game.overlayLeaderboard = document.getElementById('overlay-leaderboard');
  game.overlayPause = document.getElementById('overlay-pause');
  game.overlayGameOver = document.getElementById('overlay-gameover');

  game.leaderboardList = document.getElementById('leaderboard-list');
  game.btnLbTabNormal = document.getElementById('btn-lb-tab-normal');
  game.btnLbTabHard = document.getElementById('btn-lb-tab-hard');
  game.lbClearWrap = document.getElementById('lb-clear-wrap');
  game.lbClearStep0 = document.getElementById('lb-clear-step0');
  game.lbClearStep1 = document.getElementById('lb-clear-step1');
  game.lbClearStep2 = document.getElementById('lb-clear-step2');

  game.btnModeNormal = document.getElementById('btn-mode-normal');
  game.btnModeHard = document.getElementById('btn-mode-hard');
  game.goModeBadge = document.getElementById('go-mode-badge');
  game.goSavePanel = document.getElementById('go-save-panel');
  game.goCallsignInput = document.getElementById('go-callsign-input');
  game.btnSaveScore = document.getElementById('btn-save-score');
  game.goSaveStatus = document.getElementById('go-save-status');

  game.dockDot = document.getElementById('dock-dot');
  game.dockStatusText = document.getElementById('dock-status-text');
  game.touchFire = document.getElementById('touch-fire');
  game.desktopBar = document.getElementById('desktop-bar');
  game.btnShowTouch = document.getElementById('btn-show-touch');
  game.btnHideTouch = document.getElementById('btn-hide-touch');

  const menuVer = document.getElementById('menu-version');
  const pauseVer = document.getElementById('pause-version');
  if (menuVer) menuVer.textContent = GAME_VERSION;
  if (pauseVer) pauseVer.textContent = GAME_VERSION;
}

export function buildArchiveCards(game) {
  const container = document.getElementById('archive-scroll');
  container.innerHTML = '';
  game.archivePreviews = [];

  for (const entry of ARCHIVE_ENTRIES) {
    const card = document.createElement('article');
    card.className = `archive-card ${entry.cardClass}`;

    const top = document.createElement('div');
    top.className = 'archive-card-top';

    const previewBox = document.createElement('div');
    previewBox.className = 'archive-preview-box';
    const pCanvas = document.createElement('canvas');
    pCanvas.className = 'archive-preview-canvas';
    pCanvas.width = 68;
    pCanvas.height = 58;
    previewBox.appendChild(pCanvas);
    game.archivePreviews.push({ id: entry.id, ctx: pCanvas.getContext('2d') });

    const meta = document.createElement('div');
    meta.className = 'archive-meta';
    meta.innerHTML = `
      <div class="archive-name-row">
        <span class="archive-name">${entry.name}</span>
        <span class="tier-badge ${entry.badgeClass}">${entry.badge}</span>
      </div>
      <div class="stat-chips">
        ${entry.stats.map(s => `<span class="stat-chip ${s.cls}">${s.text}</span>`).join('')}
      </div>
    `;

    top.appendChild(previewBox);
    top.appendChild(meta);

    const desc = document.createElement('p');
    desc.className = 'archive-desc';
    desc.textContent = entry.desc;

    card.appendChild(top);
    card.appendChild(desc);
    container.appendChild(card);
  }
}

export function renderArchivePreviews(game) {
  if (game.overlayArchive.classList.contains('hidden')) return;
  const t = game.clock;
  for (const p of game.archivePreviews) {
    const c = p.ctx;
    c.clearRect(0, 0, 68, 58);
    c.strokeStyle = 'rgba(0, 246, 255, 0.14)';
    c.lineWidth = 1;
    for (let gx = 17; gx < 68; gx += 17) {
      c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, 58); c.stroke();
    }
    for (let gy = 14; gy < 58; gy += 14) {
      c.beginPath(); c.moveTo(0, gy); c.lineTo(68, gy); c.stroke();
    }

    const bob = Math.sin(t * 2.6) * 2.5;
    if (p.id === 'PLAYER') {
      drawAurexFighter(c, 34, 31 + bob, false, false, false, t);
    } else if (p.id === 'CAPSULE_CYAN') {
      drawPixelCapsule(c, 34, 29 + bob, 'CYAN', t, 1.35);
    } else if (p.id === 'CAPSULE_RED') {
      drawPixelCapsule(c, 34, 29 + bob, 'RED', t, 1.35);
    } else if (p.id === 'CAPSULE_PURPLE') {
      drawPixelCapsule(c, 34, 29 + bob, 'PURPLE', t, 1.35);
    } else if (p.id === 'CAPSULE_YELLOW') {
      drawPixelCapsule(c, 34, 29 + bob, 'YELLOW', t, 1.35);
    } else if (p.id === 'CAPSULE_CLONE') {
      drawPixelCapsule(c, 34, 29 + bob, 'CLONE', t, 1.35);
    } else if (p.id === 'CENTOID' || p.id === 'ALPHA_CENTOID') {
      // Miniature 3-segment Centoid / Alpha Centoid chain with horned head in front!
      const isAlpha = p.id === 'ALPHA_CENTOID';
      const segs = [
        { x: 18, y: 31 + Math.sin(t * 3.5 + 1.4) * 3.5, head: false, ord: 2 },
        { x: 33, y: 29 + Math.sin(t * 3.5 + 0.7) * 3.5, head: false, ord: 1 },
        { x: 48, y: 30 + Math.sin(t * 3.5) * 3.5, head: true, ord: 0 }
      ];
      for (const s of segs) {
        drawEnemySprite(c, {
          type: p.id,
          x: s.x,
          y: s.y,
          hp: isAlpha ? 2 : 1,
          maxHp: isAlpha ? 2 : 1,
          hitFlash: 0,
          angle: 0,
          isCentoid: true,
          isCentoidHead: s.head,
          centoidOrder: s.ord
        }, t, 0.76);
      }
    } else if (p.id === 'ENFORCER_WING') {
      drawEnforcerWingSprite(c, { variant: 'FLUX', x: 22, y: 30 + bob, angle: -Math.PI / 2 });
      drawEnforcerWingSprite(c, { variant: 'NULL', x: 46, y: 30 - bob, angle: -Math.PI / 2 });
    } else {
      const isMaster = p.id === 'MASTER_FLUX_ENFORCER' || p.id === 'MASTER_NULL_ENFORCER';
      const isPulsar = p.id === 'PULSAR';
      const isElite = isMaster || p.id === 'FLUX_ENFORCER' || p.id === 'NULL_ENFORCER' || isPulsar;
      drawEnemySprite(c, {
        type: p.id,
        x: 34,
        y: isPulsar ? 27 + bob : 30 + bob,
        hp: isMaster ? 18 : (p.id === 'V1_ENFORCER' ? 3 : 6),
        maxHp: isMaster ? 18 : (p.id === 'V1_ENFORCER' ? 3 : 6),
        hitFlash: 0,
        angle: 0,
        animPhase: 0
      }, t, isMaster ? 0.78 : (isPulsar ? 0.94 : (isElite ? 0.96 : 0.92)));
    }
  }
}

export function setLeaderboardClearStep(game, step) {
  if (!game.lbClearStep0) return;
  game.lbClearStep0.classList.toggle('hidden', step !== 0);
  game.lbClearStep1.classList.toggle('hidden', step !== 1);
  game.lbClearStep2.classList.toggle('hidden', step !== 2);
}

export function renderLeaderboard(game) {
  if (!game.leaderboardList) return;
  const viewMode = game.lbViewMode === 'HARD' ? 'HARD' : 'NORMAL';
  if (game.btnLbTabNormal) game.btnLbTabNormal.classList.toggle('selected', viewMode === 'NORMAL');
  if (game.btnLbTabHard) game.btnLbTabHard.classList.toggle('selected', viewMode === 'HARD');

  const entries = loadLeaderboard(viewMode);
  game.leaderboardList.innerHTML = '';
  setLeaderboardClearStep(game, 0);

  if (game.lbClearWrap) {
    game.lbClearWrap.classList.toggle('hidden', !hasAnyLeaderboardEntries());
  }

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lb-empty';
    empty.textContent = viewMode === 'HARD'
      ? 'NO HARD MODE RECORDS YET. SURVIVE SEC 06+ INTENSITY AND SAVE YOUR CALLSIGN.'
      : 'NO NORMAL RECORDS YET. COMPLETE A RUN AND SAVE YOUR CALLSIGN TO CLAIM #01.';
    game.leaderboardList.appendChild(empty);
    return;
  }

  entries.forEach((entry, idx) => {
    const rank = idx + 1;
    const row = document.createElement('div');
    const rankCls = rank <= 3 ? ` rank-${rank}` : '';
    const recentCls = game.lastSavedEntryId && entry.id === game.lastSavedEntryId ? ' is-recent' : '';
    row.className = `lb-row${rankCls}${recentCls}`;

    const elRank = document.createElement('span');
    elRank.className = 'lb-rank';
    elRank.textContent = `#${String(rank).padStart(2, '0')}`;

    const elTag = document.createElement('span');
    elTag.className = 'lb-tag';
    elTag.textContent = entry.tag;

    const elScore = document.createElement('span');
    elScore.className = 'lb-score';
    elScore.textContent = String(entry.score).padStart(6, '0');

    const elSec = document.createElement('span');
    elSec.className = 'lb-sec';
    elSec.textContent = `${viewMode === 'HARD' ? 'H' : 'S'}${String(entry.sector).padStart(2, '0')}`;

    const elAcc = document.createElement('span');
    elAcc.className = 'lb-acc';
    elAcc.textContent = entry.accuracy;

    row.append(elRank, elTag, elScore, elSec, elAcc);
    game.leaderboardList.appendChild(row);
  });
}

export function resetInputs(game) {
  game.keys.clear();
  game.firePointerIds.clear();
  game.dragPointerId = null;
  game.dragActive = false;
  game.tapFireBuffer = 0;
  game.freshFirePress = false;
  updateControlPressVisuals(game);
}

export function updateControlPressVisuals(game) {
  const f = game.firePointerIds.size > 0;
  if (game.touchFire) game.touchFire.classList.toggle('active', f);
}

export function resizeCanvas(game) {
  const rect = game.stageContainer.getBoundingClientRect();
  const availW = Math.max(180, rect.width);
  const availH = Math.max(240, rect.height);
  const aspect = LOGICAL_W / LOGICAL_H;

  let cssW = availW;
  let cssH = cssW / aspect;
  if (cssH > availH) {
    cssH = availH;
    cssW = cssH * aspect;
  }

  cssW = Math.max(180, Math.floor(cssW));
  cssH = Math.max(240, Math.floor(cssH));

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.canvas.style.width = `${cssW}px`;
  game.canvas.style.height = `${cssH}px`;
  game.canvas.width = Math.floor(cssW * dpr);
  game.canvas.height = Math.floor(cssH * dpr);

  game.ctx.setTransform(game.canvas.width / LOGICAL_W, 0, 0, game.canvas.height / LOGICAL_H, 0, 0);
}

export function syncControlsUI(game) {
  document.body.classList.toggle('desktop-mode', game.desktopMode);
  if (game.desktopBar) game.desktopBar.classList.toggle('hidden', !game.desktopMode);
  if (game.btnHideTouch) game.btnHideTouch.classList.toggle('hidden', game.isTouch || game.desktopMode);

  game.btnAuto.textContent = `AUTO:${game.autoFire ? 'ON' : 'OFF'}`;
  game.btnAuto.className = `hud-pill ${game.autoFire ? 'auto-on' : 'auto-off'}`;
  game.btnCrt.className = `hud-pill ${game.crtEnabled ? '' : 'is-off'}`;
  game.btnSfx.className = `hud-pill ${game.sfxEnabled ? '' : 'is-off'}`;
  game.crtOverlay.classList.toggle('crt-off', !game.crtEnabled);

  if (game.btnModeNormal) game.btnModeNormal.classList.toggle('selected', !game.hardMode);
  if (game.btnModeHard) game.btnModeHard.classList.toggle('selected', game.hardMode);

  game.elMenuCtrlChip.textContent = game.desktopMode
    ? `PC 2D KEYS • AUTO: ${game.autoFire ? 'ON' : 'OFF'}`
    : `2D DRAG • AUTO: ${game.autoFire ? 'ON' : 'OFF'}`;

  if (game.dockDot) game.dockDot.className = `status-dot ${game.autoFire ? '' : 'manual'}`;
  if (game.dockStatusText) {
    game.dockStatusText.textContent = game.autoFire
      ? 'TOUCH ANYWHERE TO MOVE // AUTO-FIRE ON'
      : 'TOUCH ANYWHERE TO MOVE // HOLD FIRE';
  }

  const modalAuto = document.getElementById('btn-ctrl-auto');
  if (modalAuto) {
    modalAuto.textContent = `AUTO-FIRE: ${game.autoFire ? 'ON' : 'OFF'}`;
    modalAuto.className = `auto-toggle-btn ${game.autoFire ? 'on' : 'off'}`;
  }
  const btnCtrlCrt = document.getElementById('btn-ctrl-crt');
  if (btnCtrlCrt) btnCtrlCrt.textContent = `CRT: ${game.crtEnabled ? 'ON' : 'OFF'}`;
  const btnCtrlSfx = document.getElementById('btn-ctrl-sfx');
  if (btnCtrlSfx) btnCtrlSfx.textContent = `SFX: ${game.sfxEnabled ? 'ON' : 'OFF'}`;

  writeLS(STORAGE_KEYS.auto, game.autoFire ? '1' : '0');
  writeLS(STORAGE_KEYS.crt, game.crtEnabled ? '1' : '0');
  writeLS(STORAGE_KEYS.sfx, game.sfxEnabled ? '1' : '0');
}

export function updateHUD(game) {
  game.elScore.textContent = String(game.score).padStart(6, '0');
  game.elHigh.textContent = String(game.highScore).padStart(6, '0');
  game.elStartHigh.textContent = String(game.highScore).padStart(6, '0');
  if (game.sandboxMode) {
    if (game.sandboxTrainingRound) {
      game.elSector.textContent = `${game.hardMode ? 'TH' : 'T'}${String(game.sector).padStart(2, '0')}`;
    } else {
      game.elSector.textContent = game.hardMode ? 'SBX-H' : 'SBX';
    }
    game.elSector.classList.toggle('is-hard', !!game.hardMode);
    game.elLives.innerHTML = `<svg class="life-ship-svg" viewBox="0 0 20 22"><polygon points="10,1 19,19 10,14 1,19" fill="rgba(180,255,232,0.9)" stroke="#00ffaa" stroke-width="1.8"/></svg><span class="life-inf-badge">&infin;</span>`;
    return;
  }

  if (game.isChallengeStage) {
    game.elSector.textContent = `${game.hardMode ? 'HC' : 'C'}${game.challengeNum}`;
  } else {
    game.elSector.textContent = `${game.hardMode ? 'H' : ''}${String(game.sector).padStart(2, '0')}`;
  }
  game.elSector.classList.toggle('is-hard', game.hardMode);

  let html = '';
  for (let i = 0; i < Math.max(0, game.lives); i++) {
    html += `<svg class="life-ship-svg" viewBox="0 0 20 22"><polygon points="10,1 19,19 10,14 1,19" fill="rgba(235,245,255,0.85)" stroke="#ffffff" stroke-width="1.8"/></svg>`;
  }
  game.elLives.innerHTML = html;
}

function buildPowerupGaugeSlots(game, activeTypes) {
  const bar = game.pwrGaugeBar;
  bar.innerHTML = '';
  game._pwrSlotEls = {};

  if (activeTypes.length === 0) {
    bar.className = 'pwr-empty';
    const slot = document.createElement('div');
    slot.className = 'pwr-slot pwr-empty';
    slot.innerHTML = `
      <div class="pwr-gauge-meta">
        <span class="pwr-gauge-name">POWER-UP GAUGE</span>
        <span class="pwr-gauge-val">STANDBY</span>
      </div>
      <div class="pwr-gauge-track">
        <div class="pwr-gauge-fill" style="width:0%"></div>
        <div class="pwr-gauge-ticks" aria-hidden="true"></div>
      </div>
    `;
    bar.appendChild(slot);
    return;
  }

  const barClsFor = (t) =>
    t === 'CYAN' ? 'pwr-cyan'
      : (t === 'RED' ? 'pwr-red'
        : (t === 'YELLOW' ? 'pwr-yellow'
          : (t === 'CLONE' ? 'pwr-clone' : 'pwr-purple')));
  const slotClsFor = (t) =>
    t === 'CYAN' ? 'pwr-cyan'
      : (t === 'RED' ? 'pwr-red'
        : (t === 'YELLOW' ? 'pwr-yellow seg-24'
          : (t === 'CLONE' ? 'pwr-clone' : 'pwr-purple seg-6')));

  bar.className = activeTypes.length > 1 ? 'pwr-multi' : barClsFor(activeTypes[0]);

  for (const type of activeTypes) {
    const slot = document.createElement('div');
    slot.className = `pwr-slot ${slotClsFor(type)}`;

    const meta = document.createElement('div');
    meta.className = 'pwr-gauge-meta';
    const elName = document.createElement('span');
    elName.className = 'pwr-gauge-name';
    const elVal = document.createElement('span');
    elVal.className = 'pwr-gauge-val';
    meta.append(elName, elVal);

    const track = document.createElement('div');
    track.className = 'pwr-gauge-track';
    const fill = document.createElement('div');
    fill.className = 'pwr-gauge-fill';
    const ticks = document.createElement('div');
    ticks.className = 'pwr-gauge-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    track.append(fill, ticks);

    slot.append(meta, track);
    bar.appendChild(slot);
    game._pwrSlotEls[type] = { elName, elVal, fill };
  }
}

export function updateStatusPills(game) {
  const p = game.player;

  if (game.pwrGaugeBar) {
    const activeTypes = getActivePowerups(game);
    const key = activeTypes.length > 0 ? activeTypes.join('|') : 'EMPTY';
    if (key !== game._pwrGaugeKey) {
      game._pwrGaugeKey = key;
      buildPowerupGaugeSlots(game, activeTypes);
      if (game.sandboxMode) syncSandboxPowerupTray(game);
    }

    const compact = activeTypes.length >= 2;
    for (const type of activeTypes) {
      const refs = game._pwrSlotEls[type];
      if (!refs) continue;
      const energy = game.powerup.slots[type] || 0;
      const pct = clamp((energy / POWERUP_MAX_ENERGY) * 100, 0, 100);

      if (type === 'PURPLE') {
        const aw = game.arcWaveState;
        if (aw.phase === 'CANNON_CHARGING') {
          refs.elName.textContent = compact ? 'TAP FIRE!' : 'OVERCHARGE // TAP TO FIRE';
          refs.elVal.textContent = `${aw.cannonTimer.toFixed(1)}s`;
          refs.fill.style.width = `${clamp((aw.cannonTimer / CANNON_AUTO_FIRE_DELAY) * 100, 4, 100)}%`;
        } else if (aw.phase === 'CANNON_READY') {
          refs.elName.textContent = compact ? 'CANNON 2x' : 'CANNON PRIMED // 2x TAP';
          refs.elVal.textContent = 'READY';
          refs.fill.style.width = '100%';
        } else {
          const left = Math.max(0, ARC_WAVE_MAX - aw.wavesFired);
          refs.elName.textContent = compact
            ? 'ARC WAVE'
            : (game.autoFire ? 'ARC WAVE // AUTO' : 'ARC WAVE // CONSERVE');
          refs.elVal.textContent = compact ? `${left}/${ARC_WAVE_MAX}` : `${left}/${ARC_WAVE_MAX} WAVES`;
          refs.fill.style.width = `${pct}%`;
        }
      } else if (type === 'CYAN') {
        const maxShots = Math.round(POWERUP_MAX_ENERGY / CYAN_SHOT_ENERGY_COST);
        const shotsLeft = Math.ceil(energy / CYAN_SHOT_ENERGY_COST);
        refs.elName.textContent = compact ? 'HOMING' : 'HOMING MISSILES';
        refs.elVal.textContent = compact ? `${shotsLeft}/${maxShots}` : `${shotsLeft}/${maxShots} SHOTS`;
        refs.fill.style.width = `${pct}%`;
      } else if (type === 'RED') {
        const secLeft = energy / RED_LASER_DRAIN_PER_SEC;
        refs.elName.textContent = compact ? 'LASER' : 'CONTINUOUS LASER';
        refs.elVal.textContent = `${secLeft.toFixed(1)}s`;
        refs.fill.style.width = `${pct}%`;
      } else if (type === 'YELLOW') {
        const shotsLeft = Math.max(0, Math.min(CHAIN_LIGHTNING_MAX_SHOTS, Math.ceil((energy - 0.01) / YELLOW_SHOT_ENERGY_COST)));
        refs.elName.textContent = compact ? 'LIGHTNING' : 'CHAIN LIGHTNING';
        refs.elVal.textContent = compact
          ? `${shotsLeft}/${CHAIN_LIGHTNING_MAX_SHOTS}`
          : `${shotsLeft}/${CHAIN_LIGHTNING_MAX_SHOTS} SHOTS`;
        refs.fill.style.width = `${pct}%`;
      } else if (type === 'CLONE') {
        const secLeft = Math.max(0, game.cloneTimer || 0);
        const cnt = (game.fighterClones || []).length;
        refs.elName.textContent = compact ? `CLONES x${cnt}` : `FIGHTER CLONES (x${cnt})`;
        refs.elVal.textContent = `${secLeft.toFixed(1)}s`;
        refs.fill.style.width = `${pct}%`;
      }
    }
  }

  if (p.slowTimer > 0) {
    game.pillSlow.classList.remove('hidden');
    game.pillSlowTime.textContent = `${p.slowTimer.toFixed(1)}s`;
    game.pillSlowFill.style.width = `${clamp((p.slowTimer / Math.max(1, p.slowMax)) * 100, 0, 100)}%`;
  } else {
    game.pillSlow.classList.add('hidden');
  }

  if (p.dmgDebuffTimer > 0) {
    game.pillDmg.classList.remove('hidden');
    game.pillDmgTime.textContent = `${p.dmgDebuffTimer.toFixed(1)}s`;
    game.pillDmgFill.style.width = `${clamp((p.dmgDebuffTimer / p.dmgDebuffMax) * 100, 0, 100)}%`;
  } else {
    game.pillDmg.classList.add('hidden');
  }

  if (game.pillField) {
    if (game.fieldDebuff && (game.fieldDebuff.indefinite || game.fieldDebuff.timer > 0)) {
      const fd = game.fieldDebuff;
      const isCyan = fd.type === 'CYAN';
      game.pillField.className = `status-pill ${isCyan ? 'slow' : 'dmg'}`;
      game.pillFieldLabel.textContent = isCyan ? 'CYAN FIELD 1.5x SLOW' : 'RED FIELD 0.5x DMG';
      game.pillFieldTime.textContent = fd.indefinite ? '∞' : `${fd.timer.toFixed(1)}s`;
      game.pillFieldFill.style.width = fd.indefinite
        ? '100%'
        : `${clamp((fd.timer / Math.max(0.1, fd.maxTimer)) * 100, 0, 100)}%`;
    } else {
      game.pillField.classList.add('hidden');
    }
  }

  if (game.pillShock) {
    if (p.fireJamTimer > 0) {
      game.pillShock.classList.remove('hidden');
      game.pillShockLabel.textContent = 'WEAPONS JAMMED';
      game.pillShockTime.textContent = `${p.fireJamTimer.toFixed(1)}s`;
      game.pillShockFill.style.width = `${clamp((p.fireJamTimer / Math.max(0.1, p.fireJamMax)) * 100, 0, 100)}%`;
    } else if (p.sparkSlowTimer > 0) {
      game.pillShock.classList.remove('hidden');
      game.pillShockLabel.textContent = 'FIRE RATE 2x SLOW';
      game.pillShockTime.textContent = `${p.sparkSlowTimer.toFixed(1)}s`;
      game.pillShockFill.style.width = `${clamp((p.sparkSlowTimer / Math.max(0.1, p.sparkSlowMax)) * 100, 0, 100)}%`;
    } else {
      game.pillShock.classList.add('hidden');
    }
  }
}

export function hideAllOverlays(game) {
  game.overlayStart.classList.add('hidden');
  game.overlayControls.classList.add('hidden');
  game.overlayArchive.classList.add('hidden');
  if (game.overlayLeaderboard) game.overlayLeaderboard.classList.add('hidden');
  game.overlayPause.classList.add('hidden');
  game.overlayGameOver.classList.add('hidden');
}

export function openModal(game, which, returnTo) {
  game.modalReturnTo = returnTo;
  hideAllOverlays(game);
  if (which === 'ARCHIVE') {
    game.overlayArchive.classList.remove('hidden');
  } else if (which === 'LEADERBOARD') {
    game.lbViewMode = game.hardMode ? 'HARD' : 'NORMAL';
    renderLeaderboard(game);
    game.overlayLeaderboard.classList.remove('hidden');
  } else {
    game.overlayControls.classList.remove('hidden');
  }
}

export function closeModal(game) {
  setLeaderboardClearStep(game, 0);
  hideAllOverlays(game);
  if (game.modalReturnTo === 'PAUSED') game.overlayPause.classList.remove('hidden');
  else if (game.modalReturnTo === 'GAMEOVER') game.overlayGameOver.classList.remove('hidden');
  else game.overlayStart.classList.remove('hidden');
}

export function showGameOverOverlay(game) {
  const acc = game.shotsFired > 0 ? ((game.shotsHit / game.shotsFired) * 100).toFixed(1) : '0.0';
  document.getElementById('go-score').textContent = String(game.score).padStart(6, '0');
  document.getElementById('go-high').textContent = String(game.highScore).padStart(6, '0');
  document.getElementById('go-sector').textContent = `${game.hardMode ? 'H' : ''}${String(game.sector).padStart(2, '0')}`;
  document.getElementById('go-acc').textContent = `${acc}%`;
  document.getElementById('go-shots').textContent = String(game.shotsFired);
  document.getElementById('go-hits').textContent = String(game.shotsHit);
  document.getElementById('go-rescues').textContent = String(game.dualRescues);
  document.getElementById('go-record-badge').classList.toggle('hidden', !game.newRecord);
  if (game.goModeBadge) game.goModeBadge.classList.toggle('hidden', !game.hardMode);

  game.roundScoreSaved = false;
  if (game.goCallsignInput) {
    game.goCallsignInput.value = getSavedCallsign();
  }
  if (game.score > 0) {
    if (game.goSavePanel) game.goSavePanel.classList.remove('hidden');
    if (game.goSaveStatus) game.goSaveStatus.classList.add('hidden');
  } else {
    if (game.goSavePanel) game.goSavePanel.classList.add('hidden');
    if (game.goSaveStatus) {
      game.goSaveStatus.textContent = 'SCORE POINTS TO LOG A RUN ON THE LEADERBOARD';
      game.goSaveStatus.classList.remove('hidden');
    }
  }

  game.overlayGameOver.classList.remove('hidden');
}

function submitRoundScore(game) {
  if (game.roundScoreSaved || game.score <= 0) return;
  const mode = game.hardMode ? 'HARD' : 'NORMAL';
  const rawTag = game.goCallsignInput ? game.goCallsignInput.value : 'PILOT';
  const acc = game.shotsFired > 0 ? `${((game.shotsHit / game.shotsFired) * 100).toFixed(1)}%` : '0.0%';

  const result = saveLeaderboardEntry({
    tag: rawTag,
    score: game.score,
    sector: game.sector,
    accuracy: acc,
    mode
  });

  game.roundScoreSaved = true;
  game.lastSavedEntryId = result.entry.id;
  game.lbViewMode = mode;
  game.highScore = Math.max(game.highScore, result.entry.score, getTopLeaderboardScore(mode));
  if (game.hardMode) {
    game.highScoreHard = game.highScore;
    writeLS(STORAGE_KEYS.hiHard, game.highScoreHard);
  } else {
    game.highScoreNormal = game.highScore;
    writeLS(STORAGE_KEYS.hi, game.highScoreNormal);
  }
  updateHUD(game);
  document.getElementById('go-high').textContent = String(game.highScore).padStart(6, '0');

  if (game.goSavePanel) game.goSavePanel.classList.add('hidden');
  if (game.goSaveStatus) {
    const rankStr = result.rank ? `RANK #${String(result.rank).padStart(2, '0')}` : 'OUTSIDE TOP 10';
    if (result.status === 'REPLACED') {
      game.goSaveStatus.textContent = `NEW BEST (${mode}) FOR ${result.entry.tag} // ${rankStr}`;
    } else if (result.status === 'KEPT_BEST') {
      const bestStr = String(result.entry.score).padStart(6, '0');
      game.goSaveStatus.textContent = `EXISTING BEST KEPT FOR ${result.entry.tag} (${bestStr}) // ${rankStr}`;
    } else {
      game.goSaveStatus.textContent = `SAVED (${mode}) AS ${result.entry.tag} // ${rankStr}`;
    }
    game.goSaveStatus.classList.remove('hidden');
  }
  game.synth.playRescue();
}

export function bindEvents(game) {
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => resizeCanvas(game)).observe(game.stageContainer);
  }
  window.addEventListener('resize', () => resizeCanvas(game));

  // Top HUD buttons
  game.btnAuto.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.synth.unlock();
    game.autoFire = !game.autoFire;
    syncControlsUI(game);
  });

  game.btnCrt.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.crtEnabled = !game.crtEnabled;
    syncControlsUI(game);
  });

  game.btnSfx.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.sfxEnabled = !game.sfxEnabled;
    game.synth.setEnabled(game.sfxEnabled);
    syncControlsUI(game);
  });

  game.btnPause.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (game.state === 'PLAYING') game.pauseGame();
    else if (game.state === 'PAUSED') game.resumeGame();
  });

  // Desktop <-> Touch UI manual toggle
  if (game.btnShowTouch) {
    game.btnShowTouch.addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.desktopMode = false;
      // Show one-time white text prompt ONLY if it hasn't been shown yet (never spammed on restarts!)
      if (!game.touchHintShownOnce) {
        game.touchHintShownOnce = true;
        game.touchHintState = 'GLOWING';
        game.touchHintTimer = 0;
        game.touchHintMoved = false;
      }
      resetInputs(game);
      syncControlsUI(game);
      resizeCanvas(game);
    });
  }

  if (game.btnHideTouch) {
    game.btnHideTouch.addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.desktopMode = true;
      game.touchHintState = 'OFF';
      game.touchHintTimer = 0;
      game.touchHintMoved = false;
      resetInputs(game);
      syncControlsUI(game);
      resizeCanvas(game);
    });
  }

  // Difficulty Mode Toggle (Normal vs Hard Mode [Sec 06+])
  if (game.btnModeNormal) {
    game.btnModeNormal.addEventListener('click', () => game.setHardMode(false));
  }
  if (game.btnModeHard) {
    game.btnModeHard.addEventListener('click', () => game.setHardMode(true));
  }

  // Leaderboard Mode Tabs (Normal vs Hard)
  if (game.btnLbTabNormal) {
    game.btnLbTabNormal.addEventListener('click', () => {
      game.lbViewMode = 'NORMAL';
      renderLeaderboard(game);
    });
  }
  if (game.btnLbTabHard) {
    game.btnLbTabHard.addEventListener('click', () => {
      game.lbViewMode = 'HARD';
      renderLeaderboard(game);
    });
  }

  // Main Menu, Pause, Game Over buttons
  document.getElementById('btn-start').addEventListener('click', () => game.startNewGame());
  document.getElementById('btn-replay').addEventListener('click', () => game.startNewGame());
  document.getElementById('btn-restart').addEventListener('click', () => {
    if (game.sandboxMode) game.startSandbox();
    else game.startNewGame();
  });
  document.getElementById('btn-resume').addEventListener('click', () => game.resumeGame());
  document.getElementById('btn-pause-menu').addEventListener('click', () => game.returnToMainMenu());
  document.getElementById('btn-go-menu').addEventListener('click', () => game.returnToMainMenu());

  // Archive, Controls & Leaderboard modals
  document.getElementById('btn-open-archive').addEventListener('click', () => openModal(game, 'ARCHIVE', 'MENU'));
  document.getElementById('btn-pause-archive').addEventListener('click', () => openModal(game, 'ARCHIVE', 'PAUSED'));
  document.getElementById('btn-archive-back').addEventListener('click', () => closeModal(game));

  document.getElementById('btn-open-controls').addEventListener('click', () => openModal(game, 'CONTROLS', 'MENU'));
  document.getElementById('btn-pause-controls').addEventListener('click', () => openModal(game, 'CONTROLS', 'PAUSED'));
  document.getElementById('btn-ctrl-back').addEventListener('click', () => closeModal(game));

  document.getElementById('btn-open-leaderboard').addEventListener('click', () => openModal(game, 'LEADERBOARD', 'MENU'));
  document.getElementById('btn-pause-leaderboard').addEventListener('click', () => openModal(game, 'LEADERBOARD', 'PAUSED'));
  document.getElementById('btn-go-leaderboard').addEventListener('click', () => openModal(game, 'LEADERBOARD', 'GAMEOVER'));
  document.getElementById('btn-lb-back').addEventListener('click', () => closeModal(game));

  // Game Over Save Score
  if (game.btnSaveScore) {
    game.btnSaveScore.addEventListener('click', () => {
      game.synth.unlock();
      submitRoundScore(game);
    });
  }
  if (game.goCallsignInput) {
    game.goCallsignInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        game.synth.unlock();
        submitRoundScore(game);
      }
    });
  }

  // Leaderboard 2-Step Double Confirmation Clear UI
  document.getElementById('btn-lb-clear-init').addEventListener('click', () => {
    setLeaderboardClearStep(game, 1);
  });
  document.getElementById('btn-lb-clear-cancel1').addEventListener('click', () => {
    setLeaderboardClearStep(game, 0);
  });
  document.getElementById('btn-lb-clear-step1').addEventListener('click', () => {
    setLeaderboardClearStep(game, 2);
  });
  document.getElementById('btn-lb-clear-cancel2').addEventListener('click', () => {
    setLeaderboardClearStep(game, 0);
  });
  document.getElementById('btn-lb-clear-confirm').addEventListener('click', () => {
    clearLeaderboard();
    game.highScore = 0;
    game.highScoreNormal = 0;
    game.highScoreHard = 0;
    game.newRecord = false;
    game.lastSavedEntryId = null;
    updateHUD(game);
    const goHigh = document.getElementById('go-high');
    if (goHigh) goHigh.textContent = '000000';
    game.synth.playDeleteBurst(true);
    renderLeaderboard(game);
  });

  document.getElementById('btn-ctrl-auto').addEventListener('click', () => {
    game.autoFire = !game.autoFire;
    syncControlsUI(game);
  });
  document.getElementById('btn-ctrl-crt').addEventListener('click', () => {
    game.crtEnabled = !game.crtEnabled;
    syncControlsUI(game);
  });
  document.getElementById('btn-ctrl-sfx').addEventListener('click', () => {
    game.sfxEnabled = !game.sfxEnabled;
    game.synth.setEnabled(game.sfxEnabled);
    syncControlsUI(game);
  });

  // Independent Mobile Hold-to-Fire Button (only bottom button remaining!)
  if (game.touchFire) {
    game.touchFire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      game.synth.unlock();
      game.firePointerIds.add(e.pointerId);
      game.tapFireBuffer = TAP_BUFFER_TIME;
      game.freshFirePress = true;
      try { game.touchFire.setPointerCapture(e.pointerId); } catch {}
      updateControlPressVisuals(game);
    }, { passive: false });
  }

  // Touch anywhere inside the playable bottom 2/5ths of the arena (no need to touch on/near the plane!)
  const isWithinDodgeZone = (clientX, clientY) => {
    const p = game.player;
    if (!p.alive || p.capturedById) return false;
    const rect = game.canvas.getBoundingClientRect();
    const ly = ((clientY - rect.top) / Math.max(1, rect.height)) * LOGICAL_H;
    return ly >= PLAYER_MIN_Y - 6;
  };

  game.canvas.addEventListener('pointerdown', (e) => {
    if (game.state !== 'PLAYING') return;
    game.synth.unlock();

    if (e.pointerType === 'touch' && game.desktopMode) {
      game.desktopMode = false;
      if (!game.touchHintShownOnce) {
        game.touchHintShownOnce = true;
        game.touchHintState = 'GLOWING';
        game.touchHintTimer = 0;
      }
      syncControlsUI(game);
      resizeCanvas(game);
    }

    // Sandbox DRAG / DEPLOY pointer handling on canvas
    if (game.sandboxMode && game.sandbox && game.sandbox.deployMode !== 'OFF') {
      const rect = game.canvas.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * LOGICAL_W;
      const ly = ((e.clientY - rect.top) / Math.max(1, rect.height)) * LOGICAL_H;

      if (game.sandbox.deployMode === 'DRAG') {
        if (e.pointerType !== 'mouse' || e.button === 0) {
          e.preventDefault();
          startSandboxDrag(game, e.pointerId, lx, ly);
          return;
        }
      } else if (game.sandbox.deployMode === 'DEPLOY' && game.sandbox.deployKind) {
        if (e.pointerType !== 'mouse' || e.button === 0) {
          e.preventDefault();
          handleSandboxCanvasDeploy(game, lx, ly);
          return;
        }
      }
    }

    // In Desktop Mode, left-click on canvas fires; in Touch UI mode, touch/drag anywhere in bottom 2/5ths!
    if (game.desktopMode && e.pointerType === 'mouse') {
      if (e.button === 0) {
        e.preventDefault();
        game.firePointerIds.add(e.pointerId);
        game.tapFireBuffer = TAP_BUFFER_TIME;
        game.freshFirePress = true;
      }
      return;
    }

    if (game.firePointerIds.has(e.pointerId)) return;
    if (game.dragPointerId !== null && game.dragPointerId !== e.pointerId) return;

    if (isWithinDodgeZone(e.clientX, e.clientY)) {
      e.preventDefault();
      game.dragPointerId = e.pointerId;
      game.dragLastX = e.clientX;
      game.dragLastY = e.clientY;
      game.dragActive = true;
      // Start 1.5s text prompt fade immediately upon touching anywhere below the dotted line
      if (game.touchHintState === 'GLOWING') {
        game.touchHintState = 'FADING';
        game.touchHintTimer = TOUCH_HINT_DURATION;
      }
    }
  }, { passive: false });

  // Global 2D pointermove / pointerup so direct dragging & Sandbox entity dragging never drop off-edge
  window.addEventListener('pointermove', (e) => {
    if (game.sandboxDrag && game.sandboxDrag.pointerId === e.pointerId && game.state === 'PLAYING') {
      e.preventDefault();
      const rect = game.canvas.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * LOGICAL_W;
      const ly = ((e.clientY - rect.top) / Math.max(1, rect.height)) * LOGICAL_H;
      moveSandboxDrag(game, e.pointerId, lx, ly);
      return;
    }
    if (e.pointerId === game.dragPointerId && game.dragActive && game.state === 'PLAYING') {
      e.preventDefault();
      const dx = e.clientX - game.dragLastX;
      const dy = e.clientY - game.dragLastY;
      game.dragLastX = e.clientX;
      game.dragLastY = e.clientY;
      if (game.player.alive && !game.player.capturedById) {
        const rect = game.canvas.getBoundingClientRect();
        const scaleX = LOGICAL_W / Math.max(1, rect.width);
        const scaleY = LOGICAL_H / Math.max(1, rect.height);
        const slowMult = getPlayerMoveSpeedMult(game);
        game.player.x += dx * scaleX * slowMult;
        game.player.y += dy * scaleY * slowMult;
        game.clampPlayerPosition();
      }
    }
  }, { passive: false });

  const releasePointer = (e) => {
    endSandboxDrag(game, e.pointerId);
    if (e.pointerId === game.dragPointerId) {
      game.dragPointerId = null;
      game.dragActive = false;
    }
    if (game.firePointerIds.delete(e.pointerId)) {
      updateControlPressVisuals(game);
    }
  };
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);

  game.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // Keyboard (guard against active text input / select dropdowns!)
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.code === 'Escape') e.target.blur();
      return;
    }

    const c = e.code;
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyZ', 'KeyJ'].includes(c) &&
      game.state === 'PLAYING'
    ) {
      e.preventDefault();
    }
    game.synth.unlock();
    if (c === 'KeyP' || c === 'Escape') {
      const modalOpen =
        !game.overlayControls.classList.contains('hidden') ||
        !game.overlayArchive.classList.contains('hidden') ||
        (game.overlayLeaderboard && !game.overlayLeaderboard.classList.contains('hidden'));
      if (modalOpen) {
        closeModal(game);
      } else if (c === 'Escape' && game.sandboxMode && game.sandbox && game.sandbox.drawerOpen) {
        setSandboxDrawerOpen(game, false);
      } else if (c === 'Escape' && game.sandboxMode && game.sandbox && game.sandbox.deployMode !== 'OFF') {
        disarmSandboxDeploy(game);
      } else if (game.state === 'PLAYING') {
        game.pauseGame();
      } else if (game.state === 'PAUSED') {
        game.resumeGame();
      }
      return;
    }
    if (c === 'KeyM') {
      game.sfxEnabled = !game.sfxEnabled;
      game.synth.setEnabled(game.sfxEnabled);
      syncControlsUI(game);
      return;
    }
    if (c === 'KeyF') {
      game.autoFire = !game.autoFire;
      syncControlsUI(game);
      return;
    }
    if ((c === 'Space' || c === 'KeyZ' || c === 'KeyJ') && !game.keys.has(c)) {
      game.tapFireBuffer = TAP_BUFFER_TIME;
      game.freshFirePress = true;
    }
    game.keys.add(c);
  });

  window.addEventListener('keyup', (e) => {
    game.keys.delete(e.code);
  });

  window.addEventListener('blur', () => {
    resetInputs(game);
  });
}
