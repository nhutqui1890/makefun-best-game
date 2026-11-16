// Keyboard and mouse, read once per frame. Movement keys give a normalized
// direction; the mouse gives an aim point in logical field coordinates (the
// canvas scales, so client pixels are mapped back through its bounding rect).
// One-shot actions (confirm, pause, dash, mute, upgrade picks) are latched as
// bit flags and cleared by takeActions(), so a key press is never missed
// between frames and never fires twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;
export const ACTION_PICK_1 = 16;
export const ACTION_PICK_2 = 32;
export const ACTION_PICK_3 = 64;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let mouseDown = false;
  let mouseClicked = false;
  let clickX = 0;
  let clickY = 0;

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (MOVE_KEYS.has(event.code) || event.code === 'Space') event.preventDefault();
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') actions |= ACTION_DASH;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'Digit1' || event.code === 'Numpad1') actions |= ACTION_PICK_1;
    if (event.code === 'Digit2' || event.code === 'Numpad2') actions |= ACTION_PICK_2;
    if (event.code === 'Digit3' || event.code === 'Numpad3') actions |= ACTION_PICK_3;
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const p = toField(event.clientX, event.clientY);
    mouseX = p.x;
    mouseY = p.y;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    mouseDown = true;
    const p = toField(event.clientX, event.clientY);
    clickX = p.x;
    clickY = p.y;
    mouseClicked = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  function onBlur() {
    keys.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** Normalized movement direction from WASD / arrows. */
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    /** Aim point in logical coordinates. */
    aim() {
      return { x: mouseX, y: mouseY };
    },
    firing() {
      return mouseDown;
    },
    /** The last click's field position, once per click; null when none. */
    takeClick() {
      if (!mouseClicked) return null;
      mouseClicked = false;
      return { x: clickX, y: clickY };
    },
    /** Latched one-shot actions, cleared on read. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
