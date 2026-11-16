// The whole game simulation, with no DOM in it: given a seeded random source and
// a control input per step it is fully deterministic, so the screenshot autopilot
// and a plain Node test can drive it exactly like the browser loop does.
//
// The player is the Keeper of the Last Lantern. Light is health: it dims on its
// own, enemies drain it on contact, and only embers (dropped by slain foes) put
// it back. Waves of shadow creatures trickle in from the dark; clearing a wave
// offers a choice of three upgrades; waves 5 and 10 are bosses, and killing the
// wave-10 boss breaks the dawn (victory).
import {
  BOSS,
  BOSS_WAVES,
  EMBER,
  ENEMY,
  FIELD,
  FINAL_WAVE,
  FX,
  PLAYER,
  SHOT,
  UPGRADES,
  spawnInterval,
  waveComposition,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_EMBER = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_OVER = 32;
export const EVENT_WIN = 64;
export const EVENT_BOSS = 128;
export const EVENT_DASH = 256;
export const EVENT_FOE_HIT = 512;

export const PHASE_FIGHT = 'fight';
export const PHASE_UPGRADE = 'upgrade';
export const PHASE_OVER = 'over';
export const PHASE_WIN = 'win';

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clampToField(entity, radius) {
  entity.x = Math.min(FIELD.width - radius, Math.max(radius, entity.x));
  entity.y = Math.min(FIELD.height - radius, Math.max(radius, entity.y));
}

export function createWorld(random) {
  const state = {
    time: 0,
    wave: 0,
    score: 0,
    kills: 0,
    phase: PHASE_FIGHT,
    player: null,
    bullets: [],
    enemies: [],
    shots: [],
    embers: [],
    particles: [],
    floaters: [],
    spawnQueue: [],
    spawnTimer: 0,
    boss: null,
    offered: [],
    banner: { text: '', timer: 0 },
    shake: 0,
    hitStop: 0,
    wardCharges: 0,
    stats: { shotsFired: 0, hitsTaken: 0, embersTaken: 0, damageDealt: 0 },
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      radius: PLAYER.radius,
      light: PLAYER.lightStart,
      lightMax: PLAYER.lightMax,
      fireTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dashX: 0,
      dashY: 0,
      mercy: 0,
      aimX: 1,
      aimY: 0,
      moving: false,
      upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    };
  }

  function fireInterval() {
    return PLAYER.fireInterval * 0.82 ** state.player.upgrades.rapid;
  }
  function bulletCount() {
    return 1 + state.player.upgrades.spread;
  }
  function bulletDamage() {
    return PLAYER.bulletDamage + state.player.upgrades.power;
  }
  function bulletPierce() {
    return state.player.upgrades.pierce;
  }
  function moveSpeed() {
    return PLAYER.speed * 1.12 ** state.player.upgrades.swift;
  }
  function dashCooldownMax() {
    return PLAYER.dashCooldown * 0.7 ** state.player.upgrades.dash;
  }
  function magnetRadius() {
    return PLAYER.magnetRadius * (1 + state.player.upgrades.magnet * 1.6);
  }
  function emberLight() {
    return EMBER.light + state.player.upgrades.greed * 2;
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length >= FX.maxParticles) return;
      const angle = random.range(0, Math.PI * 2);
      const v = random.range(speed * 0.3, speed);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: random.range(0.3, 0.7),
        maxLife: 0.7,
        size: random.range(2, 5),
        color,
      });
    }
  }

  function addFloater(x, y, text, color) {
    if (state.floaters.length >= FX.maxFloaters) state.floaters.shift();
    state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  function spawnPoint() {
    // Any edge point at least 320 away from the player, so nothing appears on top of them.
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = random.int(0, 3);
      const x = edge === 0 ? 30 : edge === 1 ? FIELD.width - 30 : random.range(40, FIELD.width - 40);
      const y = edge === 2 ? 30 : edge === 3 ? FIELD.height - 30 : random.range(40, FIELD.height - 40);
      if (dist2(x, y, state.player.x, state.player.y) > 320 * 320) return { x, y };
    }
    return { x: 30, y: 30 };
  }

  function spawnEnemy(kind) {
    const p = spawnPoint();
    const base = kind === 'boss' ? BOSS : ENEMY[kind];
    // Later waves hit harder: foes grow tougher and a little faster with the wave.
    const hpScale = kind === 'boss' ? 1 : 1 + (state.wave - 1) * 0.09;
    const speedScale = kind === 'boss' ? 1 : Math.min(1.18, 1 + (state.wave - 1) * 0.02);
    const hp = kind === 'boss' ? BOSS.hp(state.wave) : Math.max(1, Math.ceil(base.hp * hpScale));
    const enemy = {
      kind,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      radius: base.radius,
      speed: base.speed * speedScale,
      hp,
      maxHp: hp,
      damage: base.damage,
      score: base.score,
      ember: base.ember,
      touchTimer: 0,
      shootTimer: random.range(1, 2),
      telegraph: 0,
      dashVx: 0,
      dashVy: 0,
      dashTime: 0,
      dashCooldown: 0,
      ringTimer: 1.6,
      summonTimer: BOSS.summonInterval,
      enraged: false,
      flash: 0,
      wobble: random.range(0, Math.PI * 2),
    };
    state.enemies.push(enemy);
    if (kind === 'boss') state.boss = enemy;
    return enemy;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = [];
    const comp = waveComposition(wave);
    const kinds = [];
    if (comp.boss) kinds.push('boss');
    for (let i = 0; i < (comp.wisps ?? 0); i += 1) kinds.push('wisp');
    for (let i = 0; i < (comp.dashers ?? 0); i += 1) kinds.push('dasher');
    for (let i = 0; i < (comp.spitters ?? 0); i += 1) kinds.push('spitter');
    for (let i = 0; i < (comp.brutes ?? 0); i += 1) kinds.push('brute');
    // Shuffle the queue (boss first) so the mix arrives unpredictably.
    for (let i = kinds.length - 1; i > (comp.boss ? 1 : 0); i -= 1) {
      const j = random.int(comp.boss ? 1 : 0, i);
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    state.spawnQueue = kinds;
    state.spawnTimer = 0.5;
    state.wardCharges = state.player.upgrades.ward;
    state.banner = {
      text: comp.boss ? (wave >= FINAL_WAVE ? 'THE HOLLOW KING' : 'A HUNGER STIRS…') : `WAVE ${wave}`,
      timer: 2.2,
    };
    state.phase = PHASE_FIGHT;
  }

  function rollUpgrades() {
    const available = UPGRADES.filter((u) => state.player.upgrades[u.id] < u.max);
    const picks = [];
    const pool = [...available];
    while (picks.length < 3 && pool.length > 0) {
      picks.push(pool.splice(random.int(0, pool.length - 1), 1)[0]);
    }
    while (picks.length < 3) {
      picks.push({ id: 'rekindle', name: 'Rekindle', desc: 'Restore 30 light now', max: 99 });
    }
    state.offered = picks;
    state.phase = PHASE_UPGRADE;
  }

  function applyUpgrade(id) {
    if (state.phase !== PHASE_UPGRADE) return false;
    const card = state.offered.find((u) => u.id === id);
    if (!card) return false;
    if (id === 'rekindle') {
      state.player.light = Math.min(state.player.lightMax, state.player.light + 30);
    } else {
      state.player.upgrades[id] += 1;
      if (id === 'lantern') {
        state.player.lightMax += 25;
        state.player.light = Math.min(state.player.lightMax, state.player.light + 25);
      }
    }
    state.offered = [];
    startWave(state.wave + 1);
    return true;
  }

  function fireShots() {
    const p = state.player;
    const n = bulletCount();
    const baseAngle = Math.atan2(p.aimY, p.aimX);
    const spread = 0.12;
    for (let i = 0; i < n; i += 1) {
      const offset = (i - (n - 1) / 2) * spread;
      const angle = baseAngle + offset;
      state.bullets.push({
        x: p.x + Math.cos(angle) * (p.radius + 6),
        y: p.y + Math.sin(angle) * (p.radius + 6),
        vx: Math.cos(angle) * PLAYER.bulletSpeed,
        vy: Math.sin(angle) * PLAYER.bulletSpeed,
        damage: bulletDamage(),
        pierce: bulletPierce(),
        life: 1.4,
      });
    }
    state.stats.shotsFired += n;
    p.fireTimer = fireInterval();
  }

  function hurtPlayer(damage, x, y) {
    const p = state.player;
    if (p.mercy > 0 || p.dashTimer > 0) return 0;
    if (state.wardCharges > 0) {
      state.wardCharges -= 1;
      p.mercy = PLAYER.mercy;
      addFloater(p.x, p.y - 24, 'WARDED', '#7ee787');
      addParticles(p.x, p.y, '#7ee787', 14, 160);
      return EVENT_HIT;
    }
    p.light -= damage;
    p.mercy = PLAYER.mercy;
    state.stats.hitsTaken += 1;
    state.shake = Math.max(state.shake, FX.shakeHit);
    addParticles(x, y, '#ff5d5d', 12, 200);
    if (p.light <= 0) {
      p.light = 0;
      state.phase = PHASE_OVER;
      state.floaters = [];
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.score += enemy.score;
    addFloater(enemy.x, enemy.y, `+${enemy.score}`, '#ffd166');
    addParticles(enemy.x, enemy.y, enemy.kind === 'boss' ? '#d64570' : '#b9a7ff', enemy.kind === 'boss' ? 40 : 14, 220);
    for (let i = 0; i < enemy.ember; i += 1) {
      const angle = random.range(0, Math.PI * 2);
      const v = random.range(40, 140);
      state.embers.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: EMBER.life,
      });
    }
    if (enemy.kind === 'boss') {
      state.boss = null;
      state.shake = Math.max(state.shake, FX.shakeBoss);
      state.hitStop = Math.max(state.hitStop, 0.12);
    } else {
      state.hitStop = Math.max(state.hitStop, FX.hitStop);
    }
  }

  function enemyShot(x, y, angle) {
    state.shots.push({
      x,
      y,
      vx: Math.cos(angle) * SHOT.speed,
      vy: Math.sin(angle) * SHOT.speed,
      life: SHOT.life,
    });
  }

  function updateEnemy(enemy, dt) {
    const p = state.player;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.touchTimer = Math.max(0, enemy.touchTimer - dt);
    enemy.wobble += dt * 3;

    if (enemy.kind === 'wisp') {
      const wob = Math.sin(enemy.wobble) * 0.5;
      enemy.vx = (nx - ny * wob) * enemy.speed;
      enemy.vy = (ny + nx * wob) * enemy.speed;
    } else if (enemy.kind === 'dasher') {
      enemy.dashCooldown = Math.max(0, enemy.dashCooldown - dt);
      if (enemy.dashTime > 0) {
        enemy.dashTime -= dt;
        enemy.vx = enemy.dashVx;
        enemy.vy = enemy.dashVy;
      } else if (enemy.telegraph > 0) {
        enemy.telegraph -= dt;
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.telegraph <= 0) {
          enemy.dashVx = nx * 520;
          enemy.dashVy = ny * 520;
          enemy.dashTime = 0.32;
          enemy.dashCooldown = 1.6;
        }
      } else if (d < 280 && enemy.dashCooldown <= 0) {
        enemy.telegraph = 0.45;
      } else {
        enemy.vx = nx * enemy.speed;
        enemy.vy = ny * enemy.speed;
      }
    } else if (enemy.kind === 'spitter') {
      // Keeps its distance: closes in past 360, backs off inside 240.
      const dir = d > 360 ? 1 : d < 240 ? -1 : 0;
      enemy.vx = nx * enemy.speed * dir + -ny * Math.sin(enemy.wobble) * 40;
      enemy.vy = ny * enemy.speed * dir + nx * Math.sin(enemy.wobble) * 40;
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && d < 520) {
        enemyShot(enemy.x, enemy.y, Math.atan2(dy, dx));
        enemy.shootTimer = 2.3;
      }
    } else if (enemy.kind === 'brute') {
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
    } else if (enemy.kind === 'boss') {
      if (!enemy.enraged && enemy.hp < enemy.maxHp / 2) {
        enemy.enraged = true;
        enemy.speed *= 1.35;
        addFloater(enemy.x, enemy.y - 56, 'ENRAGED', '#ff5d5d');
      }
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
      enemy.ringTimer -= dt;
      if (enemy.ringTimer <= 0) {
        const count = enemy.enraged ? BOSS.ringShots + 4 : BOSS.ringShots;
        const offset = random.range(0, Math.PI * 2);
        for (let i = 0; i < count; i += 1) enemyShot(enemy.x, enemy.y, offset + (i / count) * Math.PI * 2);
        enemy.ringTimer = enemy.enraged ? BOSS.ringInterval * 0.7 : BOSS.ringInterval;
      }
      enemy.summonTimer -= dt;
      if (enemy.summonTimer <= 0 && state.enemies.length < 14) {
        spawnEnemy('wisp');
        spawnEnemy('wisp');
        enemy.summonTimer = BOSS.summonInterval;
      }
    }

    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    clampToField(enemy, enemy.radius);
  }

  function reset() {
    state.time = 0;
    state.wave = 0;
    state.score = 0;
    state.kills = 0;
    state.phase = PHASE_FIGHT;
    state.player = freshPlayer();
    state.bullets = [];
    state.enemies = [];
    state.shots = [];
    state.embers = [];
    state.particles = [];
    state.floaters = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.boss = null;
    state.offered = [];
    state.banner = { text: '', timer: 0 };
    state.shake = 0;
    state.hitStop = 0;
    state.wardCharges = 0;
    state.stats = { shotsFired: 0, hitsTaken: 0, embersTaken: 0, damageDealt: 0 };
    startWave(1);
  }

  /**
   * Advance the world one fixed step. `control` is { moveX, moveY, aimX, aimY,
   * firing, dash } in field coordinates; returns the events bitmask of what
   * happened this step (for sound and screen changes).
   */
  function step(dt, control) {
    if (state.phase === PHASE_OVER || state.phase === PHASE_WIN || state.phase === PHASE_UPGRADE) {
      // The world idles behind the upgrade / end screens: particles settle.
      updateAmbient(dt);
      return 0;
    }
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      return 0;
    }
    let events = 0;
    state.time += dt;
    const p = state.player;

    // The lantern always dims; standing still is a slow defeat.
    p.light -= PLAYER.dimPerSecond * dt;
    if (p.light <= 0) {
      p.light = 0;
      state.phase = PHASE_OVER;
      state.floaters = [];
      return EVENT_OVER;
    }

    p.mercy = Math.max(0, p.mercy - dt);
    p.fireTimer = Math.max(0, p.fireTimer - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    state.banner.timer = Math.max(0, state.banner.timer - dt);
    state.shake = Math.max(0, state.shake - dt * 30);

    // Aim: toward the mouse (or the autopilot's target).
    const aimDx = control.aimX - p.x;
    const aimDy = control.aimY - p.y;
    const aimLen = Math.hypot(aimDx, aimDy);
    if (aimLen > 1) {
      p.aimX = aimDx / aimLen;
      p.aimY = aimDy / aimLen;
    }

    // Dash: a burst along the current move direction (or aim when standing still).
    if (control.dash && p.dashCooldown <= 0 && p.dashTimer <= 0) {
      const moving = Math.hypot(control.moveX, control.moveY) > 0.1;
      const dx = moving ? control.moveX : p.aimX;
      const dy = moving ? control.moveY : p.aimY;
      const len = Math.hypot(dx, dy) || 1;
      p.dashX = dx / len;
      p.dashY = dy / len;
      p.dashTimer = PLAYER.dashTime;
      p.dashCooldown = dashCooldownMax();
      events |= EVENT_DASH;
      addParticles(p.x, p.y, '#ffd166', 8, 120);
    }

    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.dashX * PLAYER.dashSpeed * dt;
      p.y += p.dashY * PLAYER.dashSpeed * dt;
    } else {
      const speed = moveSpeed();
      p.x += control.moveX * speed * dt;
      p.y += control.moveY * speed * dt;
    }
    p.moving = Math.hypot(control.moveX, control.moveY) > 0.1;
    clampToField(p, p.radius);

    if (control.firing && p.fireTimer <= 0) {
      fireShots();
      events |= EVENT_SHOOT;
    }

    // Spawn the wave's queue, a trickle at a time.
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const kind = state.spawnQueue.shift();
        spawnEnemy(kind);
        if (kind === 'boss') events |= EVENT_BOSS;
        state.spawnTimer = spawnInterval(state.wave);
      }
    }

    // Bullets fly, hit, and (with pierce) fly on.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        const rr = e.radius + PLAYER.bulletRadius;
        if (dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
        e.hp -= b.damage;
        e.flash = 0.08;
        state.stats.damageDealt += b.damage;
        addParticles(b.x, b.y, '#ffe08a', 3, 120);
        if (e.hp <= 0) {
          killEnemy(e, j);
          events |= EVENT_KILL;
        } else {
          events |= EVENT_FOE_HIT;
          if (e.kind !== 'brute' && e.kind !== 'boss') {
            // Knockback, except the heavy kinds.
            e.x += b.vx * 0.012;
            e.y += b.vy * 0.012;
          }
        }
        if (b.pierce > 0) {
          b.pierce -= 1;
        } else {
          state.bullets.splice(i, 1);
        }
        break;
      }
    }

    // Enemies move and touch.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      updateEnemy(e, dt);
      const rr = e.radius + p.radius;
      if (dist2(e.x, e.y, p.x, p.y) < rr * rr && e.touchTimer <= 0) {
        e.touchTimer = ENEMY[e.kind]?.touchCooldown ?? 0.8;
        events |= hurtPlayer(e.damage, e.x, e.y);
        if (state.phase === PHASE_OVER) return events;
        // A hit knocks the attacker back a little so one touch is one hit.
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        e.x += (dx / len) * 26;
        e.y += (dy / len) * 26;
      }
    }

    // Enemy projectiles.
    for (let i = state.shots.length - 1; i >= 0; i -= 1) {
      const s = state.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || s.x < -20 || s.x > FIELD.width + 20 || s.y < -20 || s.y > FIELD.height + 20) {
        state.shots.splice(i, 1);
        continue;
      }
      const rr = SHOT.radius + p.radius;
      if (dist2(s.x, s.y, p.x, p.y) < rr * rr) {
        state.shots.splice(i, 1);
        events |= hurtPlayer(SHOT.damage, s.x, s.y);
        if (state.phase === PHASE_OVER) return events;
      }
    }

    // Embers drift, get magnetized, and are collected.
    const magnet = magnetRadius();
    for (let i = state.embers.length - 1; i >= 0; i -= 1) {
      const e = state.embers[i];
      e.life -= dt;
      if (e.life <= 0) {
        state.embers.splice(i, 1);
        continue;
      }
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < magnet) {
        const pull = 620 * (1 - d / magnet) + 120;
        e.vx += (dx / d) * pull * dt * 4;
        e.vy += (dy / d) * pull * dt * 4;
      }
      e.vx *= 1 - 2.4 * dt;
      e.vy *= 1 - 2.4 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (d < p.radius + EMBER.radius + 4) {
        state.embers.splice(i, 1);
        p.light = Math.min(p.lightMax, p.light + emberLight());
        state.score += EMBER.score;
        state.stats.embersTaken += 1;
        events |= EVENT_EMBER;
        addParticles(e.x, e.y, '#ff9f43', 4, 90);
      }
    }

    updateAmbient(dt);

    // Wave cleared: the last foe falls and the queue is empty.
    if (state.spawnQueue.length === 0 && state.enemies.length === 0 && state.phase === PHASE_FIGHT) {
      if (state.wave >= FINAL_WAVE) {
        state.phase = PHASE_WIN;
        state.floaters = [];
        events |= EVENT_WIN;
      } else {
        rollUpgrades();
        events |= EVENT_WAVE_CLEAR;
      }
    }
    return events;
  }

  function updateAmbient(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - 3 * dt;
      pt.vy *= 1 - 3 * dt;
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
  }

  /** Foes still standing plus foes still queued: what the HUD counts down. */
  function enemiesRemaining() {
    return state.enemies.length + state.spawnQueue.length;
  }

  reset();
  return { state, reset, step, applyUpgrade, rollUpgrades, enemiesRemaining };
}
