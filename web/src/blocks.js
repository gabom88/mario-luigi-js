// Port of BLOCKS.PAS: the bump animation of a block hit from below.

import * as VGA from './vga256.js';
import { W, H } from './buffers.js';
import { DrawBackGrBlock } from './backgr.js';

const BumpHeight = 4;
const MoveDelay = 0;

const BackGrBuffer = new Uint8Array(W * (H + BumpHeight));
const BlockBuffer = new Uint8Array(W * H);
let Bumping = false;
let BumpX = 0;
let BumpY = 0;
let OldBumpX = 0;
let OldBumpY = 0;
let DY = 0;
let DelayCounter = 0;

export function InitBlocks() {
  Bumping = false;
}

function SaveBumpBackGr() {
  VGA.GetImage(BumpX, BumpY - BumpHeight, W, H + BumpHeight, BackGrBuffer);
  OldBumpX = BumpX;
  OldBumpY = BumpY;
}

export function BumpBlock(X, Y) {
  if (Bumping) return;
  BumpX = X;
  BumpY = Y;
  DY = -BumpHeight;
  VGA.GetImage(X, Y, W, H, BlockBuffer);
  SaveBumpBackGr();
  Bumping = true;
  DelayCounter = 0;
}

export function EraseBlocks() {
  if (Bumping) VGA.PutImage(OldBumpX, OldBumpY - BumpHeight, W, H + BumpHeight, BackGrBuffer);
}

export function DrawBlocks() {
  if (!Bumping) return;
  if (DY < BumpHeight) {
    SaveBumpBackGr();
    const Y = BumpY - BumpHeight + Math.abs(DY);
    VGA.PutImage(BumpX, Y, W, H, BlockBuffer);
    DrawBackGrBlock(BumpX, Y + H, W, BumpHeight - Math.abs(DY));
  } else if (DelayCounter >= 4) Bumping = false;
}

export function MoveBlocks() {
  if (Bumping) {
    DelayCounter++;
    if (DelayCounter > MoveDelay && DY < BumpHeight) {
      DY++;
      DelayCounter = 0;
    }
  }
}
