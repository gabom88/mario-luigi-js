// Port of STATUS.PAS: the status line (name, lives, score, coins, level).

import * as VGA from './vga256.js';
import { B, PlayerName, dataSlot } from './buffers.js';
import { SetFont, WriteText, Bold } from './txt.js';
import { strWidth } from './pascal.js';

const BackGrAddr = [0, 0];

export function InitStatus() {
  BackGrAddr[0] = 0;
  BackGrAddr[1] = 0;
}

export function ShowStatus() {
  const HEIGHT = 6;
  const XView = B.XView;
  const p = dataSlot();
  BackGrAddr[VGA.CurrentPage()] = VGA.PushBackGr(XView, HEIGHT, VGA.SCREEN_WIDTH, 9);
  SetFont(0, Bold);
  WriteText(XView + 10 + 4, HEIGHT, PlayerName[B.Character[p]], 31);
  let i = B.Data.Lives[p];
  if (i > 99) i = 99;
  WriteText(XView + 54 + 4, HEIGHT, strWidth(i, 2), 31);

  let S = strWidth(B.LevelScore, 9).split('');
  for (let k = 3; k <= S.length; k++) if (S[k - 1] === ' ') S[k - 1] = '0';
  S = S.join('');
  WriteText(XView + 84 + 6, HEIGHT, S, 31);

  WriteText(XView + 140 + 40 + 10, HEIGHT, [9], 13);
  WriteText(XView + 140 + 40 + 10, HEIGHT, [7], 14);
  WriteText(XView + 158 + 40 + 10, HEIGHT, strWidth(B.Data.Coins[p], 2), 31);

  // Original levels are 'x-N'; Super Mario Bros. levels show world-level,
  // like the line the author left commented out
  if (B.WorldNumber[0] === 'x' || B.WorldNumber[0] === ' ')
    WriteText(XView + 258, HEIGHT, `LEVEL ${B.WorldNumber[2] ?? ' '}`, 31);
  else
    WriteText(XView + 242, HEIGHT, `WORLD ${B.WorldNumber}`, 31);

  SetFont(0, 0);
  WriteText(XView + 46 + 4, HEIGHT, 'x', 31);
  WriteText(XView + 150 + 40 + 10, HEIGHT, 'x', 31);
}

export function HideStatus() {
  const page = VGA.CurrentPage();
  if (BackGrAddr[page] !== 0) VGA.PopBackGr(BackGrAddr[page]);
  BackGrAddr[page] = 0;
}
