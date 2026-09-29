// Keyboard (WASD / arrows) plus a touch joystick that appears wherever you put your finger.
export class Input {
  private keys = new Set<string>();
  private joyOrigin: { x: number; y: number } | null = null;
  private joyPointer = -1;
  vec = { x: 0, y: 0 };
  private base: HTMLDivElement;
  private knob: HTMLDivElement;

  constructor(container: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    this.base = document.createElement('div');
    this.base.className = 'joy-base hidden';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    container.appendChild(this.base);

    container.addEventListener('pointerdown', (e) => {
      if (this.joyPointer !== -1) return;
      if ((e.target as HTMLElement).closest('.panel, .modal, #hud-top, #hud-bottom')) return;
      this.joyPointer = e.pointerId;
      const r = container.getBoundingClientRect();
      this.joyOrigin = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.base.style.left = this.joyOrigin.x + 'px';
      this.base.style.top = this.joyOrigin.y + 'px';
      this.base.classList.remove('hidden');
      this.knob.style.transform = 'translate(-50%, -50%)';
      container.setPointerCapture(e.pointerId);
    });
    container.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointer || !this.joyOrigin) return;
      const r = container.getBoundingClientRect();
      let dx = e.clientX - r.left - this.joyOrigin.x;
      let dy = e.clientY - r.top - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      const max = 52;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      this.vec = { x: dx / max, y: dy / max };
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointer) return;
      this.joyPointer = -1;
      this.joyOrigin = null;
      this.vec = { x: 0, y: 0 };
      this.base.classList.add('hidden');
    };
    container.addEventListener('pointerup', release);
    container.addEventListener('pointercancel', release);
  }

  // movement direction, x right, y down (screen space), length <= 1
  direction(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (x === 0 && y === 0 && Math.hypot(this.vec.x, this.vec.y) > 0.15) {
      x = this.vec.x;
      y = this.vec.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }
}
