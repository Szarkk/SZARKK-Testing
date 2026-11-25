/* =========================================================================
   SZARKK — MAIN GAME ORCHESTRATOR & SIMULATION LOOP
   ========================================================================= */

import {
  COLORS,
  HARD_MODE_CHALLENGE_OFFSET,
  HARD_MODE_SECTOR_OFFSET,
  LOGICAL_H,
  LOGICAL_W,
  STANDARD_WAVES_PER_SECTOR,
  STORAGE_KEYS,
  TRACTOR_INITIAL_DELAY
} from './config.js';
import { readLS, writeLS } from './utils.js';
import { SynthEngine } from './audio.js';
import {
  createArcWaveState,
  createPowerupState,
  updatePowerupCapsules,
  updatePowerupTimers
} from './powerups.js';
import {
  applyThreadDebuff,
  clampPlayerPosition,
  createPlayerState,
  damagePlayer,
  updatePlayer
} from './player.js';
import { getTopLeaderboardScore } from './leaderboard.js';
import { updateEnforcerWingsAndThreads } from './enforcers.js';
import {
  beginSector,
  updateEnemies,
  updateSectorPhase
} from './enemies.js';
import {
  updateArcWavesAndCannon,
  updateContinuousLaserBeams,
  updateEnemyBullets,
  updateFighterClonesAndBolts,
  updateHomingMissiles,
  updatePlayerBullets,
  updatePulsarHazards
} from './projectiles.js';
import { renderFrame } from './renderer.js';
import { bindSandboxEvents, startSandboxMode, syncSandboxUI } from './sandbox.js';
import {
  bindEvents,
  buildArchiveCards,
  cacheDomElements,
  hideAllOverlays,
  renderArchivePreviews,
  resetInputs,
  resizeCanvas,
  showGameOverOverlay,
  syncControlsUI,
  updateHUD,
  updateStatusPills
} from './ui.js';

export class SzarkkGame {
  constructor() {
    cacheDomElements(this);

    this.synth = new SynthEngine();
    const isCoarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const hasNoHover = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
    this.isTouch = isCoarsePointer && hasNoHover;
    this.desktopMode = !this.isTouch;

    // Persistent Settings & Per-Mode High Scores
    this.hardMode = false;
    this.lbViewMode = 'NORMAL';
    this.autoFire = readLS(STORAGE_KEYS.auto, '0') === '1';
    this.crtEnabled = readLS(STORAGE_KEYS.crt, '1') === '1';
    this.sfxEnabled = readLS(STORAGE_KEYS.sfx, '1') === '1';
    this.synth.setEnabled(this.sfxEnabled);
    this.highScoreNormal = Math.max(parseInt(readLS(STORAGE_KEYS.hi, '0'), 10) || 0, getTopLeaderboardScore('NORMAL'));
    this.highScoreHard = Math.max(parseInt(readLS(STORAGE_KEYS.hiHard, '0'), 10) || 0, getTopLeaderboardScore('HARD'));
    this.highScore = this.highScoreNormal;

    // Independent Multi-Touch Maps (2D Ship Drag + Hold-to-Fire)
    this.keys = new Set();
    this.firePointerIds = new Set();
    this.dragPointerId = null;
    this.dragLastX = 0;
    this.dragLastY = 0;
    this.dragActive = false;
    this.tapFireBuffer = 0;
    this.freshFirePress = false;

    // One-time white text prompt "TOUCH ANYWHERE BELOW TO MOVE" (never re-shown when restarting!)
    this.touchHintShownOnce = this.isTouch;
    this.touchHintState = this.isTouch ? 'GLOWING' : 'OFF'; // OFF | GLOWING | FADING
    this.touchHintTimer = 0;
    this.touchHintMoved = false;

    this.state = 'MENU'; // MENU | PLAYING | PAUSED | GAMEOVER
    this.modalReturnTo = 'MENU';
    this.roundScoreSaved = false;
    this.lastSavedEntryId = null;
    this.clock = 0;
    this.nexusGridOffset = 0;
    this.archivePreviews = [];

    // Background stars & demo fleet
    this.stars = Array.from({ length: 48 }, () => ({
      x: Math.random() * LOGICAL_W,
      y: Math.random() * LOGICAL_H,
      speed: 14 + Math.random() * 44,
      size: Math.random() < 0.35 ? 2 : 1.2,
      cyan: Math.random() < 0.72
    }));

    this.demoFleet = [
      { type: 'V1_ENFORCER', x: 112, y: 118, phase: 0 },
      { type: 'FLUX_ENFORCER', x: 240, y: 102, phase: 1.2 },
      { type: 'NULL_ENFORCER', x: 368, y: 118, phase: 2.4 },
      { type: 'INTERCEPTOR', x: 155, y: 185, phase: 0.7 },
      { type: 'INTERCEPTOR', x: 325, y: 185, phase: 1.9 },
      { type: 'DRONE', x: 240, y: 212, phase: 3.1 }
    ];

    buildArchiveCards(this);
    this.resetGameData();
    bindEvents(this);
    bindSandboxEvents(this);
    syncControlsUI(this);
    updateHUD(this);
    resizeCanvas(this);

    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  resetGameData() {
    this.score = 0;
    this.nextExtraLife = 20000;
    this.sector = 1;
    this.lives = 3;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.dualRescues = 0;
    this.newRecord = false;
    this.gameOverTimer = 0;
    this.enemyIdSeq = 1;
    this.threadIdSeq = 1;
    this.centoidIdSeq = 1;
    this.centoidChains = new Map();
    this.midWaveSpawns = [];
    this.waveQueue = [];
    this.waveSpawnTimer = 0;
    this.sandboxMode = false;
    this.sandboxIdle = false;
    this.sandboxPauseAnim = false;
    this.sandboxHideBg = false;
    this.sandboxShowGrid = false;
    this.sandboxShowRuler = false;
    this.sandboxDrag = null;
    this.sandboxTrainingRound = false;
    this.sandbox = null;
    this.diveTimer = 1.1;
    this.formationShotTimer = 2.0;
    this.sectorTractorCount = 0;
    this.justFinishedChallenge = false;
    this.postChallengeAbductionPending = false;
    this.waveEliteAbductionQueued = false;
    this.waveEliteAbductionUsed = false;
    this.masterFluxStreak = 0;
    this.masterNullStreak = 0;
    this.masterFluxRewardSpawned = false;
    this.masterNullRewardSpawned = false;
    this.fieldDebuff = null; // Hard Mode: { type: 'CYAN' | 'RED', timer, maxTimer }
    this.tractorTimer = TRACTOR_INITIAL_DELAY;
    this.wingLaunchTimer = 2.2;
    this.roundScoreSaved = false;
    this.challengeNum = 0;
    this.isChallengeStage = false;
    this.sectorWave = 1;
    this.sectorTotalWaves = STANDARD_WAVES_PER_SECTOR;
    this.challengeSubRound = 0;
    this.challengeExtraRounds = 0;
    this.challengeHits = 0;
    this.challengeTotal = 0;
    this.lastFormationStyle = null;
    this.lastEntryPattern = null;
    this.formationStyle = 'PHALANX';
    this.swayMode = 'SWAY';

    this.shake = 0;
    this.hitStop = 0;
    this.formationClock = 0;
    this.sectorPhase = 'BANNER'; // BANNER | ENTRY | COMBAT | CHALLENGE | CLEARED
    this.phaseTimer = 0;
    this.bannerTitle = '';
    this.bannerSub = '';
    this.bannerColor = COLORS.cyan;

    this.powerup = createPowerupState();
    this.arcWaveState = createArcWaveState();

    this.capsules = [];
    this.pendingCapsuleDrops = [];
    this.floatingCapsulePlan = null;
    this.activeLaserBeams = [];
    this.redLaserActive = false;
    this.redLaserPulseTimer = 0;

    this.player = createPlayerState();
    this.capturedFighter = null;
    this.activeBeamBoss = null;

    this.playerBullets = [];
    this.homingMissiles = [];
    this.arcWaves = [];
    this.cannonShots = [];
    this.aoeBlasts = [];
    this.lightningBolts = [];
    this.fighterClones = [];
    this.cloneTimer = 0;
    this.electroBalls = [];
    this.pulsarSparks = [];
    this.enemyBuffWaves = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.enforcerWings = [];
    this.threadTrails = [];
    this.particles = [];
    this.popups = [];
  }

  clampPlayerPosition() {
    clampPlayerPosition(this);
  }

  clampPlayerX() {
    clampPlayerPosition(this);
  }

  updateHUD() {
    updateHUD(this);
  }

  updateStatusPills() {
    updateStatusPills(this);
  }

  startNewGame() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    this.synth.unlock();
    resetInputs(this);
    hideAllOverlays(this);
    this.resetGameData();
    this.state = 'PLAYING';
    this.player.invulnTimer = 0; // No blinking at game start
    syncSandboxUI(this);
    beginSector(this, 1);
  }

  startSandbox() {
    startSandboxMode(this);
  }

  syncSandboxUI() {
    syncSandboxUI(this);
  }

  pauseGame() {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    this.synth.stopTractorBeam();
    resetInputs(this);
    hideAllOverlays(this);
    if (this.sandbox) this.sandbox.drawerOpen = false;
    syncSandboxUI(this);
    this.overlayPause.classList.remove('hidden');
  }

  resumeGame() {
    if (this.state !== 'PAUSED') return;
    hideAllOverlays(this);
    this.state = 'PLAYING';
    syncSandboxUI(this);
  }

  returnToMainMenu() {
    this.synth.stopTractorBeam();
    resetInputs(this);
    hideAllOverlays(this);
    this.resetGameData();
    this.state = 'MENU';
    syncSandboxUI(this);
    updateStatusPills(this);
    updateHUD(this);
    this.overlayStart.classList.remove('hidden');
  }

  triggerGameOver() {
    this.state = 'GAMEOVER';
    this.gameOverTimer = 0;
    this.synth.stopTractorBeam();
    this.synth.playGameOver();
    resetInputs(this);
    hideAllOverlays(this);
    showGameOverOverlay(this);
  }

  damagePlayer() {
    damagePlayer(this);
  }

  applyThreadDebuff(variant) {
    applyThreadDebuff(this, variant);
  }

  getEffectiveSector() {
    return this.hardMode ? this.sector + HARD_MODE_SECTOR_OFFSET : this.sector;
  }

  getEffectiveChallengeNum() {
    return this.hardMode ? this.challengeNum + HARD_MODE_CHALLENGE_OFFSET : this.challengeNum;
  }

  setHardMode(enabled) {
    this.hardMode = !!enabled;
    this.highScore = this.hardMode ? this.highScoreHard : this.highScoreNormal;
    syncControlsUI(this);
    updateHUD(this);
  }

  addScore(pts, x, y, color = COLORS.cyan) {
    if (this.sandboxMode) {
      if (x !== undefined && y !== undefined) {
        this.spawnPopup(x, y, `+${pts}`, color, 0.9);
      }
      return;
    }
    this.score += pts;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.newRecord = true;
      if (this.hardMode) {
        this.highScoreHard = this.highScore;
        writeLS(STORAGE_KEYS.hiHard, this.highScoreHard);
      } else {
        this.highScoreNormal = this.highScore;
        writeLS(STORAGE_KEYS.hi, this.highScoreNormal);
      }
    }
    if (this.score >= this.nextExtraLife) {
      this.lives = Math.min(5, this.lives + 1);
      this.nextExtraLife += 35000;
      this.spawnPopup(this.player.x, this.player.y - 38, '1UP // EXTRA FIGHTER', COLORS.emerald, 1.5);
      this.synth.playRescue();
    }
    if (x !== undefined && y !== undefined) {
      this.spawnPopup(x, y, `+${pts}`, color, 0.9);
    }
    updateHUD(this);
  }

  spawnPopup(x, y, text, color = COLORS.cyan, life = 1.1) {
    this.popups.push({ x, y, text, color, life, maxLife: life });
  }

  spawnDeleteBurst(x, y, color, count = 14, speed = 165) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 32 + Math.random() * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.42,
        maxLife: 0.72,
        size: 2 + Math.random() * 4,
        color,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 9
      });
    }
  }

  updateParticlesAndPopups(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rot += pt.vrot * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y -= 28 * dt;
      pop.life -= dt;
      if (pop.life <= 0) this.popups.splice(i, 1);
    }
  }

  update(dt) {
    this.clock += dt;
    this.nexusGridOffset = (this.nexusGridOffset + dt * 1.45) % 1;

    for (const s of this.stars) {
      s.y += s.speed * dt;
      if (s.y > LOGICAL_H) {
        s.y = -4;
        s.x = Math.random() * LOGICAL_W;
      }
    }

    if (this.state !== 'PLAYING') return;

    if (this.gameOverTimer > 0) {
      this.gameOverTimer -= dt;
      if (this.gameOverTimer <= 0) {
        this.gameOverTimer = 0;
        if (this.lives <= 0) {
          this.triggerGameOver();
          return;
        }
      }
    }

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.touchHintState === 'FADING') {
      this.touchHintTimer -= dt;
      if (this.touchHintTimer <= 0) {
        this.touchHintTimer = 0;
        this.touchHintState = 'OFF';
      }
    }
    if (this.fieldDebuff && !this.fieldDebuff.indefinite) {
      const inTransition =
        this.sectorPhase === 'BANNER' ||
        this.sectorPhase === 'CHALLENGE_BANNER' ||
        this.sectorPhase === 'CLEARED';
      if (!inTransition) {
        this.fieldDebuff.timer -= dt;
        if (this.fieldDebuff.timer <= 0) {
          this.fieldDebuff = null;
          if (this.sandboxMode && this.syncSandboxUI) this.syncSandboxUI();
        }
      }
    }

    updatePowerupTimers(this, dt);
    updatePlayer(this, dt);
    updateSectorPhase(this, dt);
    updatePowerupCapsules(this, dt);
    updateEnemies(this, dt);
    updateEnforcerWingsAndThreads(this, dt);
    updateContinuousLaserBeams(this, dt);
    updateArcWavesAndCannon(this, dt);
    updateFighterClonesAndBolts(this, dt);
    updatePlayerBullets(this, dt);
    updateHomingMissiles(this, dt);
    updatePulsarHazards(this, dt);
    updateEnemyBullets(this, dt);
    this.updateParticlesAndPopups(dt);
    updateStatusPills(this);
  }

  render() {
    renderFrame(this);
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.update(dt);
    this.render();
    renderArchivePreviews(this);
    requestAnimationFrame((t) => this.loop(t));
  }
}

function boot() {
  window.__szarkk = new SzarkkGame();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
