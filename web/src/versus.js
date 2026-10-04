// VERSUS mode (not in the original): Player 1 and Player 2 play the same
// level at once. Lives, coins and score are shared. A player who dies
// reappears next to the other one a little later and costs a life; if
// both are down at the same time the level restarts like in the normal
// game. The camera follows both, and a pipe or the exit taken by either
// one takes both players along (see play.js).

import {
  B, W, dmNoDemo, dmDead, dmDownInToPipe, dmUpInToPipe, mdSmall,
} from './buffers.js';
import {
  VS, PL, selectPlayer, otherPlayer, MovePlayer, DoDemo, DrawPlayer, ErasePlayer,
  Respawn, ClampPlayer, ViewLocked, playerX,
} from './players.js';
import { E, MoveEnemies, CollideEnemies } from './enemies.js';
import { byte } from './pascal.js';

const RESPAWN_TIME = 175; // frames (2.5 s at 70 Hz)
const VIEW_SPAN = 320 - W; // room for a player across the screen
const MAX_SCROLL = 4; // camera speed limit, pixels per frame

// Player that drives the rest of the frame (pipes, stage clear): the one
// entering a pipe, otherwise player 1.
let focus = 0;

export function selectFocus() {
  selectPlayer(focus);
}

const isDying = (i) => (i === VS.cur ? B.Demo : otherPlayer(i)?.Demo) === dmDead;

// The loaded player i has just died
function playerDied(i) {
  VS.died = false;
  const other = 1 - i;
  if (VS.down[other] || isDying(other) || B.Data.Lives[0] <= 1) {
    // both down at the same time, or the last life: like the normal game
    // (play.js takes the life and restarts the level or ends the game)
    B.GameDone = true;
    return;
  }
  B.Data.Lives[0]--;
  B.Data.Mode[i] = mdSmall;
  VS.down[i] = true;
  VS.respawn[i] = RESPAWN_TIME;
}

function tryRespawn(i) {
  if (--VS.respawn[i] > 0) return;
  const other = 1 - i;
  const o = otherPlayer(other);
  // wait while the other one is dying or going through a pipe
  if (VS.down[other] || !o || o.Demo !== dmNoDemo) {
    VS.respawn[i] = 1;
    return;
  }
  Respawn(o.X, o.Y);
  VS.down[i] = false;
}

// One frame of play for both players (instead of MoveEnemies + MovePlayer)
export function VersusStep() {
  MoveEnemies(false);
  let pipe = -1;
  for (const i of [0, 1]) {
    selectPlayer(i);
    if (VS.down[i]) {
      tryRespawn(i);
      continue;
    }
    if (B.Demo === dmNoDemo) {
      CollideEnemies();
      MovePlayer();
    } else DoDemo();
    if (VS.died) playerDied(i);
    if (B.GameDone) {
      focus = i;
      return;
    }
    if (pipe < 0 && (PL.InPipe || B.Demo === dmDownInToPipe || B.Demo === dmUpInToPipe)) pipe = i;
  }
  focus = pipe < 0 ? 0 : pipe;
  Camera();
  selectFocus();
}

// Centres the screen between both players and keeps them on it
function Camera() {
  const alive = [0, 1].filter((i) => !VS.down[i]);
  if (!alive.length) return;
  const pos = alive.map((i) => {
    selectPlayer(i);
    return { x: playerX(), y1: E.PlayerY1 };
  });
  const minX = Math.min(...pos.map((p) => p.x));
  const maxX = Math.max(...pos.map((p) => p.x));
  const old = B.XView;
  // Too far apart: the screen stays and the edges hold them back
  let view = maxX - minX <= VIEW_SPAN ? Math.round((minX + maxX + W) / 2) - 160 : old;
  // Scroll smoothly, but jump at once to a player outside the screen (the
  // level starts far from the left edge)
  const step = minX < old || maxX > old + VIEW_SPAN ? Infinity : MAX_SCROLL + byte(E.Turbo);
  view = Math.max(old - step, Math.min(old + step, view));
  view = Math.min(view, (B.Options.XSize - 16) * W);
  if (view < 0) view = 0;
  if (pos.some((p) => ViewLocked(view, old, p.y1))) view = old;
  B.XView = view;
  for (const i of alive) {
    selectPlayer(i);
    ClampPlayer(B.XView, B.XView + VIEW_SPAN);
  }
}

// Background saves are a stack: erase in the reverse order of drawing
export function EraseBoth() {
  for (const i of [1, 0]) {
    selectPlayer(i);
    ErasePlayer();
  }
  selectFocus();
}

export function DrawBoth() {
  for (const i of [0, 1]) {
    selectPlayer(i);
    if (!VS.down[i]) DrawPlayer();
  }
  selectFocus();
}

export function resetFocus() {
  focus = 0;
}
