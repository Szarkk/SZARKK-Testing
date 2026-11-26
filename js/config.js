/* =========================================================================
   SZARKK — CONSTANTS, LOGICAL PLAYFIELD, COMBAT TUNING & NEXUS ARCHIVE
   ========================================================================= */

export const GAME_VERSION = 'Alpha Test 0.1.2';
export const LOGICAL_W = 480;
export const LOGICAL_H = 640;

// Player free 2D movement arena (bottom 2/5ths of playable field — Touhou-style dodging)
export const PLAYER_MIN_Y = Math.round(LOGICAL_H * 0.60); // 384 (top edge of bottom 2/5ths)
export const PLAYER_MAX_Y = LOGICAL_H - 28;               // 612
export const PLAYER_DEFAULT_Y = LOGICAL_H - 54;           // 586

export const STANDARD_WAVES_PER_SECTOR = 4;     // 4 silent waves per standard sector
export const ELITE_FLUX_START_SECTOR = 2;       // Elite Enforcer [Flux] debuts at Sec 02 Wave 3/4
export const ELITE_FLUX_START_WAVE = 3;
export const ELITE_START_SECTOR = 2;            // Earliest sector any Elite Enforcer can appear
export const ELITE_NULL_START_SECTOR = 3;       // Elite Enforcer [Null] debuts at Sector 03
export const V1_ENFORCER_HP = 3;                // Advanced Tier: V1 Enforcers take 3 hits
export const V1_SYNERGY_RADIUS = 115;           // Proximity (~1 fighter apart) to Flux/Null Enforcer
export const V1_BUFF_AOE_RADIUS = 130;          // Small AOE enemy buff radius when color-shifted V1 dies
export const ELITE_ENFORCER_HP = 6;             // Elite Enforcers take 6 hits (12 in Challenge 2+ Raiders)
export const MASTER_START_SECTOR = 6;           // Master Enforcers appear at Sector 06+ alongside Elites
export const MASTER_ENFORCER_HP = 18;           // Master Enforcers take 18 hits
export const MASTER_STREAK_REWARD_COUNT = 10;   // Kill 10 Master Flux or Null without dying -> glowing reward capsule
export const ELITE_ABDUCTION_CHANCE = 0.10;     // 10% chance per wave for 1 Elite Enforcer to abduct
export const HARD_FIELD_DEBUFF_CHANCE = 0.50;   // Hard Mode: 50% chance when surviving Master re-enters while 2+ power-ups active
export const HARD_FIELD_DEBUFF_DUR = 4.0;       // 4.0s Cyan / Red Field CRT debuff duration
export const HARD_FIELD_MIN_POWERUPS = 0;      // Active power-ups required for the Field roll (was effectively 2)
export const HARD_FIELD_ELITES_TRIGGER = true;  // Elite Flux/Null Enforcers (not just Masters) can trigger the Field
export const CHALLENGE_INTERVAL = 2;            // Bonus Challenge stage after every 2nd standard sector (Sec 02->CH.01, Sec 04->CH.02, Sec 06->CH.03...)
export const CHALLENGE_ELITE_START = 2;         // Starting at Challenge 2 (after Sec 04), 2x HP Elite Raiders spawn
export const CHALLENGE_EXTRA_ROUND_START = 2;   // Starting at Challenge 2+, 2 extra tactical rounds spawn
export const CHALLENGE_MASTER_START = 3;        // Starting at Challenge 3 (after Sec 06), guarded Master Enforcers spawn
export const HARD_MODE_SECTOR_OFFSET = 5;       // Hard Mode starts at Sec 06+ intensity (H01 = eff. Sec 06, full waves & Masters live)
export const HARD_MODE_CHALLENGE_OFFSET = 2;    // Hard Mode H-CH.01 starts at Challenge 3+ (Guarded Masters + Extra Rounds)

// MILESTONE 2 ENEMY CONSTANTS (Centoid, Alpha Centoid, Pulsar & Cost-Based Swaps)
export const CENTOID_START_SECTOR = 4;          // Advanced Tier: Centoids appear Sec 04+
export const CENTOID_SEGMENTS = 8;              // 8 segments make up a Centoid / Alpha Centoid
export const CENTOID_MAX_SPLITS = 2;            // Max 2 living centoids split from 1 original
export const ALPHA_CENTOID_START_SECTOR = 7;    // Elite Tier: Alpha Centoids appear Sec 07+
export const ALPHA_CENTOID_SEG_HP = 2;          // 2 HP per segment (headshot deletes entire chain!)
export const ALPHA_CENTOID_DROP_CHANCE = 0.20;  // 20% chance to drop Fighter Clones capsule
export const PULSAR_START_SECTOR = 7;           // Elite Tier: Pulsars appear Sec 07+
export const PULSAR_HP = 6;                     // 6 HP yellow elite-sized fighter
export const PULSAR_FIRE_INTERVAL = 3.0;        // Leaf-falling electro ball every 3.0s
export const PULSAR_JAM_DUR = 2.0;              // Electro ball jams firing for 2.0s (no damage!)
export const PULSAR_SPARK_SLOW_DUR = 4.0;       // Death sparks slow fire rate 2x for 4.0s (no damage!)
export const PULSAR_DROP_CHANCE = 0.10;         // 10% chance to drop Chain Lightning capsule ONLY
export const COST_SWAP_CHANCE = 0.05;           // 5% chance per mob per wave (strictly +-1 tier!)

export const UNIT_META = {
  DRONE:                { tier: 1, cost: 1, minSec: 1 },
  INTERCEPTOR:          { tier: 1, cost: 1, minSec: 1 },
  V1_ENFORCER:          { tier: 2, cost: 2, minSec: 1 },
  CENTOID:              { tier: 2, cost: 2, minSec: CENTOID_START_SECTOR },
  FLUX_ENFORCER:        { tier: 3, cost: 3, minSec: ELITE_FLUX_START_SECTOR },
  NULL_ENFORCER:        { tier: 3, cost: 3, minSec: ELITE_NULL_START_SECTOR },
  ALPHA_CENTOID:        { tier: 3, cost: 3, minSec: ALPHA_CENTOID_START_SECTOR },
  PULSAR:               { tier: 3, cost: 3, minSec: PULSAR_START_SECTOR },
  MASTER_FLUX_ENFORCER: { tier: 4, cost: 6, minSec: MASTER_START_SECTOR },
  MASTER_NULL_ENFORCER: { tier: 4, cost: 6, minSec: MASTER_START_SECTOR }
};

// POWER-UP CONSTANTS (Stackable Gauge-based Cyan, Red, Purple, Yellow & Clone Capsules!)
export const CYAN_POWERUP_START_SECTOR = 2;     // Cyan Capsule unlocks at Sector 02 Wave 3/4
export const CYAN_POWERUP_START_WAVE = 3;
export const RED_POWERUP_START_SECTOR = 3;      // Red Capsule unlocks at Sector 03
export const POWERUP_START_SECTOR = 2;          // Earliest sector capsules unlock (Sec 02 Wave 3+)
export const PURPLE_POWERUP_START_SECTOR = 4;   // Purple Capsule (Arc Wave) starts Sector 04+
export const YELLOW_POWERUP_START_SECTOR = 7;   // Yellow Capsule (Chain Lightning) starts Sector 07+
export const CLONE_POWERUP_START_SECTOR = 7;    // Dark Blue/Purple Capsule (Fighter Clones) starts Sector 07+
export const POWERUP_MAX_ENERGY = 100;          // Full horizontal power-up gauge capacity per slot
export const CYAN_SHOT_ENERGY_COST = 100 / 30;  // 30 conserved Homing Missile volleys per full gauge
export const YELLOW_SHOT_ENERGY_COST = 100 / 24;// 24 conserved Chain Lightning shots (3 individual bolts per burst = 3 ammo, 8 bursts)
export const CHAIN_LIGHTNING_MAX_SHOTS = 24;
export const CHAIN_LIGHTNING_RANGE = 152;       // Short range (~4 fighters long) across front 270-degree arc
export const CHAIN_LIGHTNING_JUMP_RANGE = 118;  // Short-range edge-to-edge chain jump distance
export const CHAIN_LIGHTNING_MAX_JUMPS = 4;     // Jumps to 4 additional targets
export const CHAIN_LIGHTNING_DMG = 1.0;         // 1.0 base damage per hit & jump
export const CHAIN_LIGHTNING_BURST_COUNT = 3;   // 3 bolts fired per burst
export const CHAIN_LIGHTNING_BURST_INTERVAL = 0.25; // 3 bolts go out over 0.50s (0.00s, 0.25s, 0.50s)
export const CHAIN_LIGHTNING_BURST_COOLDOWN = 0.80; // Waits 0.80s after burst before firing again
export const CLONE_DURATION = 20.0;             // 20.0s countdown (pauses between sectors/challenges/waves!)
export const CLONE_BREAKOFF_TIME = 0.8;         // Clones stay left/right/back for 0.8s then break off
export const CLONE_IFRAMES = 1.0;               // 1.0s invincibility frames upon breaking off
export const CLONE_HP = 4;                      // 4 HP per autonomous hologram clone
export const CLONE_FIRE_COOLDOWN = 0.24;        // Rapid dark-purple bolt cadence (2x bolt velocity!)
export const RED_LASER_DRAIN_PER_SEC = 100 / 11.0; // 11.0s of active firing time (drains ONLY while firing)
export const RED_LASER_TICK_MULT = 20;          // 20x tick rate (~121 ticks/sec) at 0.1 dmg = exact 2.0 dmg/cycle with zero swipe phasing
export const RED_LASER_TICK_DMG = 2.0 / RED_LASER_TICK_MULT;    // 0.1 base dmg per rapid laser tick (2x vs Normal tier!)
export const RED_LASER_THREAD_CHIP = 1.0 / RED_LASER_TICK_MULT; // 0.05 Null Thread chip per rapid tick (exact same ~1s shatter)
export const CAPSULE_DROP_DELAY = 1.0;          // Destroyed enemies drop capsules 1 second later
export const FLOATING_CAPSULE_CHANCE = 0.20;    // 20% chance every standard wave once capsules unlock
export const TOUCH_HINT_DURATION = 1.5;         // Touch indicator lasts 1.5s starting immediately upon touch

// Mid-arena playfield bounds where power-up capsules float and are shot to activate
export const CAPSULE_BOUNDS = {
  minX: 62,
  maxX: LOGICAL_W - 62,
  minY: 205,
  maxY: 352
};

// PURPLE ARC WAVE CONSTANTS
export const ARC_WAVE_MAX = 6;                  // 6 conserved Arc Wave charges per gauge
export const ARC_WAVE_DMG = 0.5;                // 0.5 dmg per wave (defensive bullet-clear + chip into 2x AoE Cannon!)
export const ARC_WAVE_INTERVAL = 0.78;          // Auto-fire spacing when AUTO:ON
export const ARC_WAVE_MANUAL_COOLDOWN = 0.45;   // Manual fire spacing when AUTO:OFF
export const ARC_WAVE_SPEED = 420;              // Upward wave speed
export const PURPLE_FIRE_SPEED_MULT = 1.5;      // Purple bullets shoot 1.5x faster
export const CANNON_SHOT_SPEED = 480;           // AOE Cannon Shot velocity
export const CANNON_AOE_RADIUS = 276;           // Massive 2x AOE blast radius
export const CANNON_AUTO_FIRE_DELAY = 3.0;      // Auto-fires 3s after 1st cannon tap if not double-tapped

// WEAPON & THREAD CONSTANTS
export const FIRE_COOLDOWN = 0.165;             // ~6 shots/sec uncapped rapid pulse
export const TAP_BUFFER_TIME = 0.12;            // 120ms tap queue
export const PLAYER_BULLET_SPEED = 760;
export const HOMING_MISSILE_SPEED = 540;
export const PLAYER_SPEED = 310;
export const THREAD_LIFETIME = 4.8;             // Double-length Threads (4.8s duration & 2x path span)
export const FLUX_THREAD_BULLET_SLOW = 9;       // Cyan Flux Threads slow passing bullets by 9x
export const SLOWED_BULLET_DISSOLVE_TIME = 2.0; // Bullets slowed by Flux Threads dissolve after 2.0s
export const NULL_THREAD_HITS = 6;              // Crimson Null Threads take 6 hits to shatter
export const ELITE_SURGE_CHANCE = 0.12;         // 12% chance for +2..4 consecutive Enforcer Wings
export const MASTER_SURGE_CHANCE = 0.22;        // 22% surge chance for Master Enforcers
export const ELITE_SURGE_INTERVAL = 0.36;

// V1 ENFORCER TRACTOR BEAM TUNING (Slightly livelier + 80% post-challenge abduction)
export const TRACTOR_INITIAL_DELAY = 7.5;       // Wait before first tractor beam opportunity
export const TRACTOR_INTERVAL = 16.5;           // Cooldown between occasional tractor sweeps
export const TRACTOR_RETRY_DELAY = 10.5;        // Retry delay if beaming boss is destroyed mid-sweep
export const TRACTOR_MAX_PER_SECTOR = 2;        // Cap abduction attempts per sector so it's never spammy
export const TRACTOR_POST_CHALLENGE_CHANCE = 0.80; // 80% chance an existing V1 Enforcer abducts after each Challenge
export const TRACTOR_BEAM_Y = PLAYER_MIN_Y - 58; // Hover cleanly above the bottom 2/5ths player arena
export const TRACTOR_APPROACH_DUR = 1.15;       // Smooth flanking swoop to locked lane (no homing!)
export const TRACTOR_BEAM_DUR = 3.0;            // Active tractor beam cone duration
export const TRACTOR_LIFT_DUR = 1.25;           // Visual lift duration once player is kidnapped
export const TRACTOR_PULL_RADIUS = 48;          // Horizontal cone radius for gentle magnetic pull
export const TRACTOR_CAPTURE_RADIUS = 34;       // Horizontal radius for kidnapping lock

export const COLORS = {
  cyan: '#00f6ff',
  cyanSoft: '#7efaff',
  blue: '#2277ff',
  emerald: '#00ffaa',
  amber: '#ff9900',
  gold: '#ffd447',
  v1Orange: '#ff5a1f',
  nullRed: '#ff1e42',
  purple: '#c44dff',
  purpleBright: '#ebbdff',
  yellow: '#ffe640',
  yellowOrange: '#ff9e1b',
  cloneBlue: '#2f5bff',
  clonePurple: '#8a3dff',
  centoidGreen: '#2dff7a',
  centoidDarkGreen: '#0c7c3b',
  centoidGold: '#ffd942',
  alphaBlue: '#2a4cff',
  alphaPurple: '#6f2cff',
  alphaPink: '#ff52c8',
  white: '#ecffff'
};

export const STORAGE_KEYS = {
  hi: 'szarkk_test_hi',
  hiHard: 'szarkk_test_hi_hard',
  auto: 'szarkk_test_auto',
  crt: 'szarkk_test_crt',
  sfx: 'szarkk_test_sfx',
  leaderboard: 'szarkk_test_leaderboard',
  callsign: 'szarkk_test_callsign'
};

export const ARCHIVE_ENTRIES = [
  {
    id: 'PLAYER',
    name: 'AUREX FIGHTER',
    badge: 'PLAYER CRAFT',
    badgeClass: 'player',
    cardClass: 'tier-player',
    stats: [
      { text: '2D DODGE ZONE', cls: 'emerald' },
      { text: '~6 SHOTS/SEC', cls: '' },
      { text: 'DUAL RESCUE', cls: 'gold' }
    ],
    desc: 'Your AUREX (Adaptive Unified Recursive EXecution) fighter moves freely across the lower 2/5ths of the Nexus for bullet-hell dodging. Touch and drag anywhere below the dotted line on touchscreens (or use WASD/Arrows on PC). Rescue a captured fighter from an Enforcer to unlock twin-volley Dual-Fighter firepower.'
  },
  {
    id: 'CAPSULE_CYAN',
    name: 'HOMING MISSILES',
    badge: 'POWER-UP • SEC 02 W3+',
    badgeClass: 'elite-cyan',
    cardClass: 'tier-pwr-cyan',
    stats: [
      { text: '30 VOLLEYS (GAUGE)', cls: 'gold' },
      { text: 'STACKABLE', cls: 'emerald' },
      { text: 'TRACKS CAPSULES', cls: '' },
      { text: '1-HIT NULL THREAD', cls: '' },
      { text: '1.3x VS NULL ENF', cls: 'warn' }
    ],
    desc: 'Cyan power-up (Sector 02 Wave 3+) — shoot the capsule to charge 30 manual volleys of 2x homing missiles that track enemies, Enforcer Wings, and floating capsules! Stacks with different power-ups (splitting the bottom gauge and igniting an RGB gradient on your ship). Shatters crimson Null Threads in 1 hit and deals 1.3x damage to Elite/Master Enforcers [Null].'
  },
  {
    id: 'CAPSULE_RED',
    name: 'CONTINUOUS LASER',
    badge: 'POWER-UP • SEC 03+',
    badgeClass: 'elite-red',
    cardClass: 'tier-pwr-red',
    stats: [
      { text: 'PIERCING LASER', cls: 'warn' },
      { text: '11s ACTIVE FIRE', cls: 'gold' },
      { text: 'STACKABLE', cls: 'emerald' },
      { text: '2x VS NORMAL TIER', cls: '' },
      { text: '1.3x VS FLUX ENF', cls: '' }
    ],
    desc: 'Red power-up (Sector 03+) — shoot the capsule to charge 11s of active high-frequency nose-locked laser firing (drains ONLY while firing, 0.1 dmg @ 20x tick rate so fast swipes never miss). Deals 2x DPS to Normal tier enemies, pierces straight through ships (blocked only by Null Threads; converts into slowed dissolving red bolts through Flux Threads), and deals 1.3x damage to Elite/Master Enforcers [Flux].'
  },
  {
    id: 'CAPSULE_PURPLE',
    name: 'ARC WAVE',
    badge: 'POWER-UP • SEC 04+',
    badgeClass: 'deploy',
    cardClass: 'tier-pwr-purple',
    stats: [
      { text: '6 WIDE WAVES (0.5 DMG)', cls: '' },
      { text: 'STACKABLE', cls: 'emerald' },
      { text: 'VOIDS BULLETS', cls: 'gold' },
      { text: '2x AOE CANNON', cls: 'warn' }
    ],
    desc: 'Purple power-up (Sector 04+) — shoot the capsule to charge 6 wide bullet-voiding Arc Waves (0.5 dmg each)! After the 6th wave, double-tap Fire to unleash a massive 2x-radius AOE Cannon Shot (Tap 1 supercharges with violent vibration; Tap 2 fires, or auto-fires after 3s).'
  },
  {
    id: 'CAPSULE_YELLOW',
    name: 'CHAIN LIGHTNING',
    badge: 'POWER-UP • SEC 07+',
    badgeClass: 'commander',
    cardClass: 'tier-pwr-yellow',
    stats: [
      { text: '24 SHOTS (3x BOLTS)', cls: 'gold' },
      { text: 'FRONT 270° ARC', cls: '' },
      { text: 'ZAPS ENEMY BULLETS', cls: 'emerald' },
      { text: 'JUMPS +4 TARGETS', cls: 'warn' }
    ],
    desc: 'Yellow power-up (Sector 07+ & 10% Pulsar drop) — transforms your Aurex Fighter yellow/gold and charges 24 shots fired as rapid 3-bolt bursts (3 individual lightning lines over 0.5s using 3 shots, then 0.8s cooldown) across a front 270-degree radius (~4 fighters). Each bolt independently zaps enemies, capsules, Enforcer Wings, and enemy bullets, dealing 1 damage and chaining edge-to-edge to up to 4 additional targets!'
  },
  {
    id: 'CAPSULE_CLONE',
    name: 'FIGHTER CLONES',
    badge: 'POWER-UP • SEC 07+',
    badgeClass: 'deploy',
    cardClass: 'tier-pwr-clone',
    stats: [
      { text: '3 HOLOGRAMS (4 HP)', cls: 'emerald' },
      { text: '20s TIMER (PAUSES)', cls: 'gold' },
      { text: '2x BOLT SPEED', cls: '' },
      { text: 'STACKABLE', cls: '' }
    ],
    desc: 'Dark blue & purple power-up (Sector 07+ & 20% Alpha Centoid drop) — deploys 3 hologram clones (left, right, back) that break off after 0.8s with 1s invincibility frames and 4 HP each, firing dark purple bolts at 2x speed for 20s (timer pauses between sectors & challenges; clones vanish if you die).'
  },
  {
    id: 'DRONE',
    name: 'DRONE',
    badge: 'NORMAL',
    badgeClass: 'basic',
    cardClass: 'tier-basic',
    stats: [
      { text: 'HP: 1', cls: '' },
      { text: 'PTS: 50 / 100', cls: 'gold' },
      { text: 'DROP: 0.1%', cls: '' }
    ],
    desc: 'Geometric lower-rank scouts that swarm in sweeping dives. Fragile in combat, with a rare 0.1% capsule drop chance starting in Sector 02 Wave 3.'
  },
  {
    id: 'INTERCEPTOR',
    name: 'INTERCEPTOR',
    badge: 'NORMAL',
    badgeClass: 'basic',
    cardClass: 'tier-basic',
    stats: [
      { text: 'HP: 1', cls: '' },
      { text: 'PTS: 80 / 160', cls: 'gold' },
      { text: 'DROP: 0.1%', cls: '' }
    ],
    desc: 'Mid-row assault interceptors that dive in wide arcs while firing amber plasma bolts.'
  },
  {
    id: 'V1_ENFORCER',
    name: 'V1 ENFORCER',
    badge: 'ADVANCED',
    badgeClass: 'commander',
    cardClass: 'tier-commander',
    stats: [
      { text: 'HP: 3', cls: '' },
      { text: 'PTS: 150 / 400', cls: 'gold' },
      { text: 'FLUX/NULL SYNERGY', cls: 'warn' },
      { text: 'TRACTOR BEAM', cls: 'emerald' }
    ],
    desc: 'Advanced-tier arch commander (20% slower movement, lower fire rate). Deploys a Tractor Beam to capture your Aurex Fighter. At 1 HP near a Cyan Enforcer it shifts Cyan and bursts an AOE +30% speed buff on death; near a Red Enforcer it shifts Red and bursts an AOE +33% HP buff on death.'
  },
  {
    id: 'CENTOID',
    name: 'CENTOID',
    badge: 'ADVANCED • SEC 04+',
    badgeClass: 'player',
    cardClass: 'tier-centoid',
    stats: [
      { text: '8 SEGMENTS (1 HP EA)', cls: '' },
      { text: 'HEADSHOT = INSTA-CLEAR', cls: 'emerald' },
      { text: 'SPLITS (MAX 2)', cls: 'warn' }
    ],
    desc: 'Green & gold 8-segment cyber-serpent (Sector 04+). Zig-zags strictly horizontally across the arena, stepping down and rebounding upward at the bottom. Destroy the head to erase the entire Centoid at once without splitting!'
  },
  {
    id: 'ALPHA_CENTOID',
    name: 'ALPHA CENTOID',
    badge: 'ELITE • SEC 07+',
    badgeClass: 'deploy',
    cardClass: 'tier-alpha',
    stats: [
      { text: '8 SEGMENTS (2 HP EA)', cls: 'warn' },
      { text: '90° CORRIDOR PATH', cls: '' },
      { text: 'DROP: 20% CLONES', cls: 'gold' },
      { text: 'HEADSHOT = INSTA-CLEAR', cls: 'emerald' }
    ],
    desc: 'Elite dark-blue, purple & pink 8-segment serpent (Sector 07+) that snaps along sharp 90° corridors like Null Threads. Splitting caps at 2 living snakes; headshots erase the entire chain. 20% chance to drop Fighter Clones.'
  },
  {
    id: 'PULSAR',
    name: 'PULSAR',
    badge: 'ELITE • SEC 07+',
    badgeClass: 'commander',
    cardClass: 'tier-pulsar',
    stats: [
      { text: 'HP: 6', cls: '' },
      { text: '2s FIRE JAM ORBS', cls: 'warn' },
      { text: '4s 2x SLOW SPARKS', cls: '' },
      { text: 'DROP: 10% LIGHTNING', cls: 'gold' }
    ],
    desc: 'Yellow elite-sized fighter with twin lightning rods (Sector 07+). Drops leaf-falling electro balls every 3s that jam your firing for 2s (no HP damage), and explodes on death into downward sparks that halve fire rate for 4s. 10% chance to drop Chain Lightning.'
  },
  {
    id: 'FLUX_ENFORCER',
    name: 'ELITE ENFORCER [FLUX]',
    badge: 'ELITE • SEC 02 W3+',
    badgeClass: 'elite-cyan',
    cardClass: 'tier-flux',
    stats: [
      { text: 'HP: 6 (12 IN CH.2+)', cls: '' },
      { text: '10% ABDUCT / WAVE', cls: 'emerald' },
      { text: 'DROP: 10%C / 2%R / 2%P', cls: 'gold' },
      { text: '9x SLOW + DISSOLVE', cls: 'warn' }
    ],
    desc: 'Deploys starting at Sector 02 Wave 3. Takes 6 hits to destroy and dives slower than normal ships (10% chance per wave for an Elite to attempt abduction). Launches curved cyan Enforcer Wings (12% surge) whose double-length Flux Threads slow your ship 4s, slow passing bullets 9x (dissolving after 2s), and turn Red Lasers into slowed dissolving bolts.'
  },
  {
    id: 'NULL_ENFORCER',
    name: 'ELITE ENFORCER [NULL]',
    badge: 'ELITE • SEC 03+',
    badgeClass: 'elite-red',
    cardClass: 'tier-null',
    stats: [
      { text: 'HP: 6 (12 IN CH.2+)', cls: '' },
      { text: '10% ABDUCT / WAVE', cls: 'emerald' },
      { text: 'DROP: 10%R / 2%C / 2%P', cls: 'gold' },
      { text: '6-HIT THREAD WALL', cls: 'warn' }
    ],
    desc: 'Deploys starting at Sector 03. Takes 6 hits to destroy and dives slower than normal ships (10% chance per wave for an Elite to attempt abduction). Launches 90° crimson Enforcer Wings (12% surge) whose Null Threads BLOCK shots (6 hits to break) and inflict 1s Slow + 4s -20% DMG. In Challenge 2+, raids independently with 2x HP (12) and fires twin Enforcer Wings.'
  },
  {
    id: 'MASTER_FLUX_ENFORCER',
    name: 'MASTER ENFORCER [FLUX]',
    badge: 'MASTER • SEC 06+',
    badgeClass: 'elite-cyan',
    cardClass: 'tier-flux',
    stats: [
      { text: 'HP: 18', cls: 'warn' },
      { text: 'CYAN AURA', cls: '' },
      { text: 'DROP: 25%C / 5%R / 10%P', cls: 'gold' },
      { text: '10-KILL STREAK REWARD', cls: 'emerald' }
    ],
    desc: 'Master-tier Flux dreadnought ringed in a radiant cyan aura (Sector 06+ alongside Elites, and guarded in Challenge 3+ / Hard Mode). Kill 10 without dying for a glowing Cyan reward capsule! On Hard Mode, re-entering after a dive while you stack power-ups can trigger a 4s Cyan CRT Field (1.5x slower move & fire rate).'
  },
  {
    id: 'MASTER_NULL_ENFORCER',
    name: 'MASTER ENFORCER [NULL]',
    badge: 'MASTER • SEC 06+',
    badgeClass: 'elite-red',
    cardClass: 'tier-null',
    stats: [
      { text: 'HP: 18', cls: 'warn' },
      { text: 'CRIMSON AURA', cls: '' },
      { text: 'DROP: 25%R / 5%C / 10%P', cls: 'gold' },
      { text: '10-KILL STREAK REWARD', cls: 'emerald' }
    ],
    desc: 'Master-tier Null warframe blazing with a crimson-red aura (Sector 06+ alongside Elites, and guarded in Challenge 3+ / Hard Mode). Kill 10 without dying for a glowing Red reward capsule! On Hard Mode, re-entering after a dive while you stack power-ups can trigger a 4s Red CRT Field (2x damage reduction).'
  },
  {
    id: 'ENFORCER_WING',
    name: 'ENFORCER WINGS',
    badge: 'DEPLOYABLE',
    badgeClass: 'deploy',
    cardClass: 'tier-deploy',
    stats: [
      { text: 'HP: 1', cls: '' },
      { text: 'PTS: 150', cls: 'gold' },
      { text: 'THREAD ~4.8s (2x)', cls: 'warn' }
    ],
    desc: 'High-speed drones launched by Elite & Master Enforcers. Flux Wings carve double-length curved cyan Flux Threads; Null Wings snap along extended 90° crimson Null Thread corridors.'
  }
];
