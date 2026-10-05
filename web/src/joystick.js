// Replacement for JOYSTICK.PAS using the Gamepad API.
// Button 1 (jump) = A / Cross, button 2 (run + fire) = X / Square or B.

export const J = {
  jsEnabled: true,
  jsDetected: true,
  jsButton1: false,
  jsButton2: false,
  jsLeft: false,
  jsRight: false,
  jsUp: false,
  jsDown: false,
};

// pad: -1 reads every gamepad together; 0 / 1 only the first / second
// connected one (VERSUS: one gamepad for each player).
export function ReadJoystick(pad = -1) {
  J.jsButton1 = J.jsButton2 = J.jsLeft = J.jsRight = J.jsUp = J.jsDown = false;
  if (!J.jsEnabled || !navigator.getGamepads) return;
  const pads = [...navigator.getGamepads()].filter((gp) => gp && gp.connected);
  for (const gp of pad < 0 ? pads : pads.slice(pad, pad + 1)) {
    const b = (i) => !!gp.buttons[i]?.pressed;
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    J.jsButton1 ||= b(0) || b(3);
    J.jsButton2 ||= b(1) || b(2);
    J.jsLeft ||= ax < -0.5 || b(14);
    J.jsRight ||= ax > 0.5 || b(15);
    J.jsUp ||= ay < -0.5 || b(12);
    J.jsDown ||= ay > 0.5 || b(13);
  }
}

export function ResetJoystick() {}
export function Calibrate() {}
