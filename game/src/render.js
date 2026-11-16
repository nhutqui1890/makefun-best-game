// Everything drawn: the arena, the lantern light, every entity, the HUD and
// all six screens. The canvas is a fixed 1280x720 logical surface (CSS scales
// it to the window); all motion derives from the world's own time, never the
// wall clock, so a screenshot scene replays identically every time.

import { BOSS_WAVES, FIELD, FINAL_WAVE, PALETTE, PLAYER } from './config.js';
import { PHASE_FIGHT } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

/** The three upgrade cards' rectangles, shared by the renderer and click handling. */
export function layoutUpgradeCards() {
  const w = 300;
  const h = 210;
  const gap = 28;
  const total = w * 3 + gap * 2;
  const x0 = (FIELD.width - total) / 2;
  const y = 268;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function glowCircle(x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function text(str, x, y, size, color, align = 'center', weight = 700) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function drawFloor(time) {
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Faint grid and a few darker flagstones.
    ctx.strokeStyle = PALETTE.floorGrid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
      ctx.stroke();
    }
    // Drifting dust motes, placed by a hash of their index so they are stable per frame.
    for (let i = 0; i < 40; i += 1) {
      const hx = ((i * 2654435761) % 1000) / 1000;
      const hy = ((i * 40503) % 1000) / 1000;
      const x = (hx * FIELD.width + time * 6 * (1 + (i % 3))) % FIELD.width;
      const y = (hy * FIELD.height + Math.sin(time * 0.4 + i) * 12) % FIELD.height;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time + i * 1.7);
      circle(x, y, 1.6, '#5a6a94');
    }
    ctx.globalAlpha = 1;
    // Arena border.
    ctx.strokeStyle = PALETTE.wall;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, FIELD.width - 6, FIELD.height - 6);
  }

  function drawEmbers(state) {
    for (const e of state.embers) {
      const flicker = 0.75 + 0.25 * Math.sin(state.time * 9 + e.x);
      const blink = e.life < 3 ? (Math.sin(state.time * 14) > 0 ? 1 : 0.25) : 1;
      ctx.globalAlpha = blink;
      glowCircle(e.x, e.y, 26, '#ff9f43', 0.5 * flicker);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffc46b';
      const s = 6 * flicker;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    const flicker = 0.9 + 0.1 * Math.sin(state.time * 7);
    // Lantern halo: wide when the light is full, tight and dim when it fades.
    const halo = 130 + (p.light / p.lightMax) * 190;
    glowCircle(p.x, p.y, halo * flicker, '#ffb347', 0.55);
    glowCircle(p.x, p.y, 60, '#fff3c4', 0.8);
    // Dash trail.
    if (p.dashTimer > 0) {
      ctx.globalAlpha = 0.4;
      circle(p.x - p.dashX * 26, p.y - p.dashY * 26, p.radius * 0.8, '#ffd166');
      ctx.globalAlpha = 1;
    }
    // Mercy blink.
    if (p.mercy > 0 && Math.sin(state.time * 40) > 0) ctx.globalAlpha = 0.45;
    // Cloak: a hooded keeper, drawn as a circle body with a pointed hood.
    circle(p.x, p.y, p.radius, '#2c3a5e');
    ctx.fillStyle = '#3d517d';
    ctx.beginPath();
    ctx.moveTo(p.x - 10, p.y + 4);
    ctx.lineTo(p.x, p.y - p.radius - 6);
    ctx.lineTo(p.x + 10, p.y + 4);
    ctx.closePath();
    ctx.fill();
    // Face: two bright eyes toward the aim.
    const ex = p.x + p.aimX * 4;
    const ey = p.y + p.aimY * 4;
    circle(ex - 4, ey - 2, 2.4, '#fff3c4');
    circle(ex + 4, ey - 2, 2.4, '#fff3c4');
    // The lantern itself, held out toward the aim.
    const lx = p.x + p.aimX * (p.radius + 8);
    const ly = p.y + p.aimY * (p.radius + 8);
    glowCircle(lx, ly, 22, '#ffd166', 0.9);
    circle(lx, ly, 5, '#fff3c4');
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e, time) {
    const colors = { wisp: '#8b7ff0', dasher: '#e05b7f', spitter: '#4fc3a1', brute: '#c96a4a', boss: '#d64570' };
    const color = colors[e.kind] ?? '#888888';
    const flash = e.flash > 0;
    const body = flash ? '#ffffff' : color;
    glowCircle(e.x, e.y, e.radius * 2.1, color, 0.35);
    if (e.kind === 'wisp') {
      // A drifting flame with a wavy tail.
      circle(e.x, e.y, e.radius, body);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(e.x - e.radius * 0.7, e.y + e.radius * 0.4);
      ctx.quadraticCurveTo(e.x - e.radius * 0.4, e.y + e.radius * 1.6, e.x + Math.sin(time * 6 + e.wobble) * 6, e.y + e.radius * 1.9);
      ctx.quadraticCurveTo(e.x + e.radius * 0.4, e.y + e.radius * 1.6, e.x + e.radius * 0.7, e.y + e.radius * 0.4);
      ctx.closePath();
      ctx.fill();
      circle(e.x - 4, e.y - 2, 2.2, '#0b0e18');
      circle(e.x + 4, e.y - 2, 2.2, '#0b0e18');
    } else if (e.kind === 'dasher') {
      // A dart: telegraphs white-hot before it lunges.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(e.vy, e.vx));
      ctx.fillStyle = e.telegraph > 0 ? '#ffffff' : body;
      ctx.beginPath();
      ctx.moveTo(e.radius + 6, 0);
      ctx.lineTo(-e.radius, -e.radius * 0.8);
      ctx.lineTo(-e.radius * 0.5, 0);
      ctx.lineTo(-e.radius, e.radius * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (e.kind === 'spitter') {
      // A diamond with a glowing maw.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = body;
      const s = e.radius * 1.5;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      circle(e.x, e.y, 5, '#d9ffe9');
    } else if (e.kind === 'brute') {
      // A heavy hexagon with cracks.
      ctx.fillStyle = body;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + Math.PI / 6;
        const px = e.x + Math.cos(a) * e.radius;
        const py = e.y + Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      circle(e.x - 8, e.y - 4, 3, '#ffe08a');
      circle(e.x + 8, e.y - 4, 3, '#ffe08a');
      // Health arc over the brute.
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 7, -Math.PI / 2, -Math.PI / 2 + (e.hp / e.maxHp) * TAU);
      ctx.stroke();
    } else if (e.kind === 'boss') {
      // The Hollow King: a spiked crown of shadow with a burning core.
      ctx.fillStyle = body;
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU + time * 0.4;
        const r = i % 2 === 0 ? e.radius + 14 : e.radius - 4;
        const px = e.x + Math.cos(a) * r;
        const py = e.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      circle(e.x, e.y, e.radius * 0.62, e.enraged ? '#ff2d55' : '#5c1030');
      circle(e.x - 12, e.y - 6, 5, '#ffd166');
      circle(e.x + 12, e.y - 6, 5, '#ffd166');
      circle(e.x, e.y + 10, 7, '#ffd166');
    }
  }

  function drawBullets(state) {
    for (const b of state.bullets) {
      glowCircle(b.x, b.y, 14, '#ffe08a', 0.7);
      circle(b.x, b.y, PLAYER.bulletRadius, '#fff3c4');
    }
    for (const s of state.shots) {
      glowCircle(s.x, s.y, 16, '#ff6b81', 0.7);
      circle(s.x, s.y, 6, '#ff8fa3');
      circle(s.x, s.y, 2.5, '#ffffff');
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      circle(pt.x, pt.y, pt.size, pt.color);
    }
    ctx.globalAlpha = 1;
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      text(f.text, f.x, f.y, 17, f.color, 'center', 800);
    }
    ctx.globalAlpha = 1;
  }

  function drawDarkness(state) {
    // The dark presses in as the light fades: a radial veil centred on the player.
    const p = state.player;
    const lightFrac = p.light / p.lightMax;
    const inner = 120 + lightFrac * 260;
    const g = ctx.createRadialGradient(p.x, p.y, inner * 0.55, p.x, p.y, inner * 1.9);
    g.addColorStop(0, 'rgba(3,5,10,0)');
    g.addColorStop(1, `rgba(3,5,10,${0.88 - lightFrac * 0.25})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Hurt flash.
    if (p.mercy > PLAYER.mercy - 0.18) {
      const a = (p.mercy - (PLAYER.mercy - 0.18)) / 0.18;
      ctx.fillStyle = `rgba(255,40,60,${0.22 * a})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawHud(state, best, remaining) {
    const p = state.player;
    // Score, top left.
    text('SCORE', 28, 26, 13, PALETTE.muted, 'left', 800);
    text(String(state.score), 28, 52, 30, PALETTE.text, 'left', 800);
    text(`BEST ${Math.max(best, state.score)}`, 28, 82, 14, PALETTE.muted, 'left', 600);
    // Wave, top centre.
    const waveLabel = BOSS_WAVES.has(state.wave) ? `WAVE ${state.wave} — BOSS` : `WAVE ${state.wave} / ${FINAL_WAVE}`;
    text(waveLabel, FIELD.width / 2, 30, 20, PALETTE.gold, 'center', 800);
    text(remaining > 0 ? `${remaining} shadows remain` : 'Cleared!', FIELD.width / 2, 56, 14, PALETTE.muted, 'center', 600);
    // Boss health bar.
    if (state.boss) {
      const bw = 420;
      const bx = (FIELD.width - bw) / 2;
      const by = 76;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
      ctx.fillStyle = '#d64570';
      ctx.fillRect(bx, by, bw * Math.max(0, state.boss.hp / state.boss.maxHp), 10);
    }
    // Light bar, bottom centre: the player's health, drawn as a lantern gauge.
    const bw = 340;
    const bx = (FIELD.width - bw) / 2;
    const by = FIELD.height - 34;
    text('LIGHT', bx - 12, by + 7, 13, PALETTE.muted, 'right', 800);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
    const frac = p.light / p.lightMax;
    ctx.fillStyle = frac > 0.35 ? '#ffb347' : '#ff5d5d';
    ctx.fillRect(bx, by, bw * frac, 12);
    // Dash pip, bottom right.
    const dashReady = p.dashCooldown <= 0;
    text(dashReady ? 'DASH READY [SHIFT]' : 'DASH…', FIELD.width - 28, FIELD.height - 26, 14, dashReady ? PALETTE.heal : PALETTE.muted, 'right', 700);
    // Wave banner.
    if (state.banner.timer > 0) {
      const a = Math.min(1, state.banner.timer / 0.6);
      ctx.globalAlpha = a;
      text(state.banner.text, FIELD.width / 2, 150, 44, PALETTE.gold, 'center', 900);
      ctx.globalAlpha = 1;
    }
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(4,6,12,${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawTitle(state, best) {
    dim(0.55);
    glowCircle(FIELD.width / 2, 190, 220, '#ffb347', 0.35);
    text('EMBERLIGHT', FIELD.width / 2, 168, 84, PALETTE.gold, 'center', 900);
    text('Keeper of the Last Lantern', FIELD.width / 2, 226, 24, PALETTE.text, 'center', 600);
    text('Your light is your life. It dims on its own — slay shadows, gather their', FIELD.width / 2, 300, 18, PALETTE.muted, 'center', 500);
    text('embers, and hold the dark back for 10 waves until dawn breaks.', FIELD.width / 2, 326, 18, PALETTE.muted, 'center', 500);
    text('WASD / Arrows — move        Mouse — aim        Hold click — shoot        Shift — dash', FIELD.width / 2, 392, 17, PALETTE.text, 'center', 600);
    text('P — pause        M — sound', FIELD.width / 2, 420, 17, PALETTE.text, 'center', 600);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
    ctx.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO BEGIN', FIELD.width / 2, 500, 24, '#fff3c4', 'center', 800);
    ctx.globalAlpha = 1;
    if (best > 0) text(`Best score ${best}`, FIELD.width / 2, 556, 16, PALETTE.muted, 'center', 600);
    text('An original game — no network, no downloads, everything drawn in code.', FIELD.width / 2, FIELD.height - 28, 13, PALETTE.muted, 'center', 500);
  }

  function drawUpgrade(state, mouse) {
    dim(0.62);
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 130, 34, PALETTE.gold, 'center', 900);
    text('Choose a blessing for the road ahead', FIELD.width / 2, 172, 19, PALETTE.muted, 'center', 500);
    const rects = layoutUpgradeCards();
    state.offered.forEach((card, i) => {
      const r = rects[i];
      const hover = mouse && mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h;
      panel(r.x, r.y, r.w, r.h);
      if (hover) {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      }
      text(`[${i + 1}]`, r.x + r.w / 2, r.y + 34, 15, PALETTE.muted, 'center', 700);
      text(card.name, r.x + r.w / 2, r.y + 78, 24, PALETTE.text, 'center', 800);
      text(card.desc, r.x + r.w / 2, r.y + 122, 16, PALETTE.muted, 'center', 500);
      const owned = card.id === 'rekindle' ? 0 : state.player.upgrades[card.id] ?? 0;
      if (owned > 0) text(`Owned ×${owned}`, r.x + r.w / 2, r.y + 168, 14, PALETTE.heal, 'center', 600);
    });
    text('Click a card, or press 1, 2 or 3', FIELD.width / 2, 540, 17, PALETTE.muted, 'center', 500);
  }

  function drawPaused() {
    dim(0.6);
    text('PAUSED', FIELD.width / 2, 300, 54, PALETTE.text, 'center', 900);
    text('Press P or Esc to carry on', FIELD.width / 2, 360, 19, PALETTE.muted, 'center', 500);
    text('M toggles sound', FIELD.width / 2, 390, 19, PALETTE.muted, 'center', 500);
  }

  function drawStats(state, best, y0) {
    const rows = [
      ['Score', String(state.score)],
      ['Best', String(Math.max(best, state.score))],
      ['Wave reached', `${state.wave} / ${FINAL_WAVE}`],
      ['Shadows slain', String(state.kills)],
      ['Embers gathered', String(state.stats.embersTaken)],
      ['Time', formatTime(state.time)],
    ];
    rows.forEach(([label, value], i) => {
      const y = y0 + i * 34;
      text(label, FIELD.width / 2 - 130, y, 18, PALETTE.muted, 'left', 600);
      text(value, FIELD.width / 2 + 130, y, 18, PALETTE.text, 'right', 800);
    });
  }

  function drawOver(state, best) {
    dim(0.72);
    text('THE LIGHT GOES OUT', FIELD.width / 2, 150, 52, '#ff8fa3', 'center', 900);
    text('The dark takes the lantern… this time.', FIELD.width / 2, 200, 19, PALETTE.muted, 'center', 500);
    drawStats(state, best, 268);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
    ctx.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO TRY AGAIN', FIELD.width / 2, 540, 24, '#fff3c4', 'center', 800);
    ctx.globalAlpha = 1;
  }

  function drawWin(state, best) {
    dim(0.55);
    glowCircle(FIELD.width / 2, 150, 260, '#ffd166', 0.5);
    text('DAWN BREAKS', FIELD.width / 2, 150, 56, PALETTE.gold, 'center', 900);
    text('Ten waves held. The first sun in a hundred years rises over the arena.', FIELD.width / 2, 202, 19, PALETTE.text, 'center', 500);
    drawStats(state, best, 268);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
    ctx.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO PLAY AGAIN', FIELD.width / 2, 540, 24, '#fff3c4', 'center', 800);
    ctx.globalAlpha = 1;
  }

  function drawReticle(mouse) {
    if (!mouse) return;
    ctx.strokeStyle = 'rgba(255,243,196,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 11, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouse.x - 16, mouse.y);
    ctx.lineTo(mouse.x - 7, mouse.y);
    ctx.moveTo(mouse.x + 7, mouse.y);
    ctx.lineTo(mouse.x + 16, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 16);
    ctx.lineTo(mouse.x, mouse.y - 7);
    ctx.moveTo(mouse.x, mouse.y + 7);
    ctx.lineTo(mouse.x, mouse.y + 16);
    ctx.stroke();
  }

  return {
    draw(state, screen, best, remaining, ui = {}) {
      ctx.save();
      // Screen shake, from the world's own time so it replays identically.
      if (state.shake > 0.2) {
        const sx = Math.sin(state.time * 91.7) * state.shake;
        const sy = Math.cos(state.time * 113.3) * state.shake;
        ctx.translate(sx, sy);
      }
      drawFloor(state.time);
      drawEmbers(state);
      drawPlayer(state);
      for (const e of state.enemies) drawEnemy(e, state.time);
      drawBullets(state);
      drawParticles(state);
      drawDarkness(state);
      ctx.restore();

      const inGame = screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_UPGRADE;
      if (inGame) drawHud(state, best, remaining);
      if (screen === SCREEN_PLAY && ui.mouse) drawReticle(ui.mouse);
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      else if (screen === SCREEN_UPGRADE) drawUpgrade(state, ui.mouse);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawOver(state, best);
      else if (screen === SCREEN_WIN) drawWin(state, best);
      if (ui.muted) text('MUTED [M]', FIELD.width - 28, 26, 13, PALETTE.muted, 'right', 700);
    },
  };
}
