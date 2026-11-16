// The screenshot scenes behind ?shot=title|play|upgrade|victory, and the
// autopilot that plays them. Every scene is a real game played forward from a
// fresh world by the autopilot — no staged positions, no faked frames — so the
// screenshots show what a short game really looks like, and the same seed
// always gives the same frame. The title screen's live background uses the
// same autopilot.
//
// The pilot kites: it keeps its distance from the nearest foe, strafes to stay
// off the line of fire, sidesteps incoming shots, dashes out of a close call,
// drifts onto embers when the coast is clear, and picks upgrades by a fixed
// priority (damage and fire rate first, lantern when the light runs low).
import { FIELD, STEP } from './config.js';
import { PHASE_FIGHT, PHASE_OVER, PHASE_UPGRADE, PHASE_WIN } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';

/** Upgrade priority, best first; the pilot takes the first offered card it finds here. */
const PICK_ORDER = ['power', 'rapid', 'spread', 'pierce', 'magnet', 'lantern', 'swift', 'dash', 'greed', 'ward', 'rekindle'];

/** The pilot's upgrade pick from the offered cards. */
export function autopick(offered, light, lightMax) {
  if (light < lightMax * 0.45) {
    const lantern = offered.find((u) => u.id === 'lantern' || u.id === 'rekindle');
    if (lantern) return lantern.id;
  }
  for (const id of PICK_ORDER) {
    const card = offered.find((u) => u.id === id);
    if (card) return card.id;
  }
  return offered[0].id;
}

/** One step of control for the given world state: { moveX, moveY, aimX, aimY, firing, dash }. */
export function autopilot(state, time) {
  const p = state.player;
  const control = { moveX: 0, moveY: 0, aimX: p.x + p.aimX, aimY: p.y + p.aimY, firing: false, dash: false };
  if (state.enemies.length === 0) {
    // Nothing to fight: drift to the centre and sweep up embers.
    const ember = state.embers[0];
    const tx = ember ? ember.x : FIELD.width / 2;
    const ty = ember ? ember.y : FIELD.height / 2;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 30) {
      control.moveX = dx / d;
      control.moveY = dy / d;
    }
    return control;
  }

  // Nearest foe, with a small preference for the fragile kinds.
  let target = null;
  let targetScore = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const weight = e.kind === 'boss' ? 1.25 : e.kind === 'brute' ? 1.1 : 1;
    const score = d * weight - (e.maxHp - e.hp) * 6;
    if (score < targetScore) {
      targetScore = score;
      target = e;
    }
  }
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;

  // Aim with a little lead on a moving target.
  const flight = d / 640;
  control.aimX = target.x + target.vx * flight * 0.6;
  control.aimY = target.y + target.vy * flight * 0.6;
  control.firing = true;

  // Kite: back off inside 240, close in past 400, strafe sideways between.
  let mx = 0;
  let my = 0;
  if (d < 240) {
    mx -= nx * (1.6 - d / 240);
    my -= ny * (1.6 - d / 240);
  } else if (d > 400) {
    mx += nx * 0.9;
    my += ny * 0.9;
  }
  const strafe = Math.sin(time * 1.1) > 0 ? 1 : -1;
  mx += -ny * strafe * 0.7;
  my += nx * strafe * 0.7;

  // Sidestep any shot headed our way.
  for (const s of state.shots) {
    const sx = s.x - p.x;
    const sy = s.y - p.y;
    const sd = Math.hypot(sx, sy);
    if (sd > 150 || sd < 1) continue;
    const approaching = (sx * s.vx + sy * s.vy) / sd;
    if (approaching > 0) continue; // moving away from us
    const px = -sy / sd;
    const py = sx / sd;
    const side = px * mx + py * my >= 0 ? 1 : -1;
    mx += px * side * 1.4;
    my += py * side * 1.4;
  }

  // A dasher's telegraph is a cue to move sideways, hard.
  for (const e of state.enemies) {
    if (e.kind === 'dasher' && e.telegraph > 0) {
      mx += -ny * 2;
      my += nx * 2;
    }
  }

  // Embers when the coast is clear.
  if (d > 220 && state.embers.length > 0) {
    let ember = null;
    let emberD = Infinity;
    for (const e of state.embers) {
      const ed = Math.hypot(e.x - p.x, e.y - p.y);
      if (ed < emberD) {
        emberD = ed;
        ember = e;
      }
    }
    if (ember && emberD < 260) {
      mx += ((ember.x - p.x) / emberD) * 0.8;
      my += ((ember.y - p.y) / emberD) * 0.8;
    }
  }

  // Stay off the walls.
  const margin = 70;
  if (p.x < margin) mx += 1.2;
  if (p.x > FIELD.width - margin) mx -= 1.2;
  if (p.y < margin) my += 1.2;
  if (p.y > FIELD.height - margin) my -= 1.2;

  const len = Math.hypot(mx, my);
  if (len > 0.01) {
    control.moveX = mx / len;
    control.moveY = my / len;
  }

  // Dash out of a close call.
  if (d < 90 && p.dashCooldown <= 0) control.dash = true;
  return control;
}

/** Drive one world forward with the autopilot until `stop` says so (or the cap hits). */
function drive(world, stop, maxSeconds) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    if (state.phase === PHASE_UPGRADE) {
      world.applyUpgrade(autopick(state.offered, state.player.light, state.player.lightMax));
      continue;
    }
    if (state.phase === PHASE_OVER || state.phase === PHASE_WIN) break;
    world.step(STEP, autopilot(state, state.time));
    if (stop(world.state)) break;
  }
  return world.state;
}

/**
 * Stage the named scene (title, play, upgrade or victory; anything else is
 * title) and return the world to draw, the screen to draw over it and the best
 * score to show. `makeWorld` builds a fresh world from a seed, so the victory
 * scene can retry on a fresh seed if the pilot falls short.
 */
export function stageShot(name, world, makeWorld) {
  if (name === 'play') {
    // The pilot kills too fast for six foes to stand at once in an early wave,
    // so the 90 s cap is what lands this scene: mid-boss-fight on wave 5, with
    // the boss's health bar, its ring of shots and the enrage banner showing.
    drive(world, (s) => s.wave >= 3 && s.enemies.length >= 6, 90);
    return { world, screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    drive(world, (s) => s.phase === PHASE_UPGRADE, 240);
    return { world, screen: SCREEN_UPGRADE, best: world.state.score };
  }
  if (name === 'victory') {
    let attempt = world;
    for (let seed = 0; seed < 6; seed += 1) {
      const state = drive(attempt, (s) => s.phase === PHASE_WIN, 900);
      if (state.phase === PHASE_WIN) {
        return { world: attempt, screen: SCREEN_WIN, best: state.score };
      }
      attempt = makeWorld(1000 + seed * 7919);
    }
    // The pilot never won: fall back to the furthest run's end screen.
    return { world: attempt, screen: SCREEN_PLAY, best: attempt.state.score };
  }
  // Title: a few seconds of wave 1 playing behind the title card.
  drive(world, () => false, 6);
  return { world, screen: SCREEN_TITLE, best: 0 };
}
