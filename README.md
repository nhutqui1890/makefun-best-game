[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/nhutqui1890/makefun-best-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/nhutqui1890/makefun-best-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# Emberlight — Keeper of the Last Lantern

A complete, original top-down arena survival game for the
[best-game-01 bounty on make.fun](https://make.fun/bounty/best-game-01).
It plays offline in a desktop browser from static files — no network
request, no downloads, no build step. Every pixel is drawn in code and
every sound is synthesized with WebAudio.

## The game

You are the Keeper of the Last Lantern. **Your light is your life**: it
dims on its own, shadows drain it on contact, and only the embers of
slain foes put it back. Hold the dark back for 10 waves and dawn breaks.

- **10 waves** of four shadow kinds — wisps, lunging dashers, ranged
  spitters and heavy brutes — with **boss fights on waves 5 and 10**
  (the Hollow King: radial shot rings, wisp summons, an enrage phase).
- **Choose 1 of 3 upgrades** between waves, from a pool of 10: spread
  shot, rapid fire, piercing, damage, a brighter lantern, speed, dash
  recharge, magnet, greed and a warding flame.
- **Dash** (Shift) with brief invulnerability, screen shake, hit-stop,
  particles, floating score text and a full HUD (score, best, wave,
  foes remaining, boss health, light gauge, dash status).
- **Six screens**: title (with the game playing itself behind it),
  play, upgrade choice, pause, game over and victory — each with stats
  and restart. Best score and best wave are kept in localStorage.
- **Synthesized sound**: shots, hits, kills, pickups, dash, waves,
  boss, victory and defeat, over a slow ambient drone. M toggles mute.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse | Aim |
| Hold left click | Shoot |
| Shift | Dash |
| P / Esc | Pause |
| 1 / 2 / 3 or click | Pick an upgrade |
| M | Mute |
| Enter / click | Start, restart |

## Play it

```sh
node serve.ts
# then open http://localhost:8080
```

Node.js 22.18+ and a desktop browser are all it needs.

## Layout

- `game/index.html` + `game/style.css` — the page shell.
- `game/src/config.js` — every tuning number, colour and upgrade.
- `game/src/random.js` — the seeded generator (same seed, same game).
- `game/src/world.js` — the simulation: entities, waves, bosses,
  upgrades, collisions. No DOM in it, so it runs in plain Node.
- `game/src/render.js` — all drawing: arena, lantern light, entities,
  HUD and the six screens.
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — synthesized WebAudio sound.
- `game/src/shots.js` — the autopilot and the deterministic screenshot
  scenes (`?shot=title|play|upgrade|victory&seed=N`).
- `game/src/main.js` — boot and the fixed-step game loop.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with `vendor/makefun-game.ts`.
- `screenshots/` — four real renders of the game's own code: title,
  boss fight, upgrade choice, victory.

## License

MIT — see [LICENSE](LICENSE).
