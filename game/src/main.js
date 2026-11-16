// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. Six screens: title (with the autopilot playing behind
// it), play, upgrade, paused, game over and victory.
//
// ?seed=N fixes the run. ?shot=title|play|upgrade|victory (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, BEST_WAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BOSS,
  EVENT_DASH,
  EVENT_EMBER,
  EVENT_FOE_HIT,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_OVER,
  EVENT_SHOOT,
  EVENT_WAVE_CLEAR,
  EVENT_WIN,
  PHASE_FIGHT,
  PHASE_OVER,
  PHASE_UPGRADE,
  PHASE_WIN,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_DASH,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_PICK_1,
  ACTION_PICK_2,
  ACTION_PICK_3,
  createInput,
} from './input.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WIN,
  createRenderer,
  layoutUpgradeCards,
} from './render.js';
import { autopilot, stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);

function makeWorld(worldSeed) {
  return createWorld(createRandom(worldSeed));
}

function readInt(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveInt(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const staged = stageShot(name, makeWorld(seed), makeWorld);
  const world = staged.world;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, staged.screen, staged.best, world.enemiesRemaining(), {});
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let world = makeWorld(seed);
  let screen = SCREEN_TITLE;
  let best = readInt(BEST_KEY);
  let bestWave = readInt(BEST_WAVE_KEY);
  let accumulator = 0;
  let last = performance.now();
  /** A dash press latched by handleActions and consumed by the next step. */
  let dashQueued = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function bankBest() {
    if (world.state.score > best) {
      best = world.state.score;
      saveInt(BEST_KEY, best);
    }
    if (world.state.wave > bestWave) {
      bestWave = world.state.wave;
      saveInt(BEST_WAVE_KEY, bestWave);
    }
  }

  function startGame() {
    audio.unlock();
    world = makeWorld(Math.floor(Math.random() * 4294967296));
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Your light is your life — gather embers to keep it burning.');
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_FOE_HIT) audio.hit();
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_EMBER) audio.ember();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_WAVE_CLEAR) audio.wave();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_DASH) dashQueued = true;
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_UPGRADE) {
      const pick = actions & ACTION_PICK_1 ? 0 : actions & ACTION_PICK_2 ? 1 : actions & ACTION_PICK_3 ? 2 : -1;
      if (pick >= 0 && world.state.offered[pick]) {
        world.applyUpgrade(world.state.offered[pick].id);
        audio.upgrade();
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}.`);
      }
    }
  }

  function handleClick() {
    const click = input.takeClick();
    if (!click) return;
    audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      startGame();
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      const rects = layoutUpgradeCards();
      const index = rects.findIndex((r) => click.x >= r.x && click.x <= r.x + r.w && click.y >= r.y && click.y <= r.y + r.h);
      if (index >= 0 && world.state.offered[index]) {
        world.applyUpgrade(world.state.offered[index].id);
        audio.upgrade();
        screen = SCREEN_PLAY;
        announce(`Wave ${world.state.wave}.`);
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The game plays itself behind the title card; a fallen Keeper rises again.
      if (world.state.phase === PHASE_OVER || world.state.phase === PHASE_WIN) {
        world = makeWorld(Math.floor(Math.random() * 4294967296));
      }
      if (world.state.phase === PHASE_UPGRADE) {
        world.applyUpgrade(world.state.offered[0].id);
      } else if (world.state.phase === PHASE_FIGHT) {
        world.step(STEP, autopilot(world.state, world.state.time));
      }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const dir = input.direction();
    const aim = input.aim();
    const dash = dashQueued;
    dashQueued = false;
    const control = {
      moveX: dir.x,
      moveY: dir.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
      dash,
    };
    const events = world.step(STEP, control);
    playEvents(events);
    if (events & EVENT_OVER) {
      bankBest();
      screen = SCREEN_OVER;
      audio.gameOver();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    } else if (events & EVENT_WIN) {
      bankBest();
      screen = SCREEN_WIN;
      audio.victory();
      announce(`Dawn breaks! Score ${world.state.score}. Best ${best}.`);
    } else if (world.state.phase === PHASE_UPGRADE) {
      screen = SCREEN_UPGRADE;
      announce(`Wave cleared. Choose a blessing: ${world.state.offered.map((u) => u.name).join(', ')}.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(world.state, screen, best, world.enemiesRemaining(), {
      mouse: screen === SCREEN_PLAY || screen === SCREEN_UPGRADE ? input.aim() : null,
      muted: audio.isMuted(),
    });
  }

  // Leaving the tab pauses a running game rather than letting the dark close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A read-only hook for play-testing (scripted browsers and the finalist
  // review can watch the live screen and world state through it).
  window.__ember = {
    screen: () => screen,
    state: () => world.state,
  };

  announce('Emberlight. Press Enter or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
