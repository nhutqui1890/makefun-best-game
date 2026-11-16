// Emberlight — every tuning number, colour and upgrade in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. The simulation runs in
// fixed 1/60 s steps and never reads the clock, so a seed replays identically.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The last wave: kill its boss and dawn breaks (victory). Boss waves are 5 and 10. */
export const FINAL_WAVE = 10;
export const BOSS_WAVES = new Set([5, 10]);

export const PLAYER = {
  radius: 14,
  speed: 265,
  /** Light is the player's health: it dims on its own and enemies drain it on contact. */
  lightMax: 100,
  lightStart: 100,
  /** Passive dimming, light per second: embers are the only way to get it back. */
  dimPerSecond: 0.6,
  /** Seconds of mercy after a hit, during which nothing else can hurt the player. */
  mercy: 0.9,
  fireInterval: 0.16,
  bulletSpeed: 640,
  bulletDamage: 1,
  bulletRadius: 5,
  /** Dash: a short burst with brief invulnerability, then a cooldown. */
  dashSpeed: 920,
  dashTime: 0.16,
  dashCooldown: 2.2,
  /** Pickups drift toward the player inside this radius. */
  magnetRadius: 90,
};

export const BULLET = { life: 1.4 };

export const ENEMY = {
  wisp: { radius: 13, speed: 105, hp: 2, damage: 8, score: 10, ember: 1, touchCooldown: 0.8 },
  dasher: { radius: 14, speed: 90, hp: 3, damage: 10, score: 20, ember: 1, touchCooldown: 0.8 },
  spitter: { radius: 15, speed: 78, hp: 4, damage: 8, score: 25, ember: 2, touchCooldown: 0.8 },
  brute: { radius: 26, speed: 52, hp: 14, damage: 16, score: 50, ember: 3, touchCooldown: 0.8 },
};

/** Enemy projectiles (spitters and bosses). */
export const SHOT = { radius: 6, speed: 210, damage: 6, life: 6 };

/** How a wave is built: the mix shifts from wisps toward brutes and spitters. */
export function waveComposition(wave) {
  if (BOSS_WAVES.has(wave)) return { boss: true, wisps: 2 + wave, dashers: wave >= 10 ? 4 : 2 };
  const wisps = 6 + wave * 3;
  const dashers = wave >= 2 ? 2 + Math.floor(wave / 2) : 0;
  const spitters = wave >= 3 ? 2 + Math.floor((wave - 1) / 2) : 0;
  const brutes = wave >= 4 ? 1 + Math.floor((wave - 2) / 2) : 0;
  return { boss: false, wisps, dashers, spitters, brutes };
}

/** Seconds between spawns inside a wave; the queue trickles in rather than flooding. */
export function spawnInterval(wave) {
  return Math.max(0.35, 1.1 - wave * 0.07);
}

export const BOSS = {
  radius: 44,
  speed: 62,
  /** Boss hit points by wave: wave 5 is a rehearsal, wave 10 is the real fight. */
  hp: (wave) => (wave >= 10 ? 240 : 130),
  damage: 20,
  score: 500,
  ember: 8,
  /** Radial burst: shots per ring, and how often. */
  ringShots: 10,
  ringInterval: 2.6,
  /** How often it summons a pair of wisps. */
  summonInterval: 7,
};

/** Ember pickups: light restored and score per ember. */
export const EMBER = { light: 3, score: 10, radius: 8, life: 12 };

/** Upgrades offered between waves: one of three, picked with mouse or keys 1-3. */
export const UPGRADES = [
  { id: 'spread', name: 'Twin Flames', desc: '+1 bullet per shot', max: 3 },
  { id: 'rapid', name: 'Quick Hands', desc: 'Fire 18% faster', max: 4 },
  { id: 'pierce', name: 'Piercing Light', desc: 'Bullets pass through +1 foe', max: 3 },
  { id: 'power', name: 'Heavy Ember', desc: '+1 damage per bullet', max: 4 },
  { id: 'lantern', name: 'Brighter Lantern', desc: '+25 max light, restore 25', max: 3 },
  { id: 'swift', name: 'Swift Boots', desc: 'Move 12% faster', max: 3 },
  { id: 'dash', name: 'Ember Dash', desc: 'Dash recharges 30% faster', max: 2 },
  { id: 'magnet', name: 'Ember Magnet', desc: 'Pull embers from much further', max: 2 },
  { id: 'greed', name: 'Greedy Glow', desc: 'Embers restore +2 light each', max: 2 },
  { id: 'ward', name: 'Warding Flame', desc: 'Block one hit per wave', max: 2 },
];

/** Floating score text, particles and shake budgets. */
export const FX = {
  maxParticles: 220,
  maxFloaters: 24,
  shakeHit: 7,
  shakeBoss: 12,
  hitStop: 0.045,
};

export const PALETTE = {
  backdrop: '#070a12',
  floor: '#0d1220',
  floorGrid: '#121a2e',
  wall: '#1a2440',
  player: '#ffd166',
  playerCore: '#fff3c4',
  bullet: '#ffe08a',
  ember: '#ff9f43',
  wisp: '#8b7ff0',
  dasher: '#e05b7f',
  spitter: '#4fc3a1',
  brute: '#c96a4a',
  boss: '#d64570',
  shot: '#ff6b81',
  text: '#eef1f5',
  muted: '#8b93a3',
  panel: '#131a2c',
  panelEdge: '#2a3654',
  gold: '#ffd166',
  danger: '#ff5d5d',
  heal: '#7ee787',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score and best wave are kept between visits (this browser only). */
export const BEST_KEY = 'emberlight.best';
export const BEST_WAVE_KEY = 'emberlight.bestWave';
