// Keyboard + mouse + pointer lock input. Browser-only.
// Produces the plain input object world.update() consumes:
// {f,b,l,r,sprint,jump,fire,reload,interact,w1,w2,yawDelta,interactPressed}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared by endStep()
    this.yawDelta = 0;
    this.mouseDown = false;
    this.locked = false;
    this.onFirstGesture = null;
    this.onLockChange = null;
    this._onKeyDown = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.onFirstGesture) this.onFirstGesture();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.locked) this.yawDelta += e.movementX * 0.0023;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.onFirstGesture) this.onFirstGesture();
      }
    };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._onLock = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLock);
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* headless or denied: mouse look via API */ });
    } catch { /* ignore */ }
  }

  exitLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
  }

  held(code) { return this.keys.has(code); }

  wasPressed(code) { return this.pressed.has(code); }

  // Build the per-frame input object for world.update().
  read() {
    const o = {
      f: this.held('KeyW') || this.held('ArrowUp'),
      b: this.held('KeyS') || this.held('ArrowDown'),
      l: this.held('KeyA') || this.held('ArrowLeft'),
      r: this.held('KeyD') || this.held('ArrowRight'),
      sprint: this.held('ShiftLeft') || this.held('ShiftRight'),
      jump: this.held('Space'),
      fire: this.mouseDown,
      reload: this.wasPressed('KeyR'),
      interact: this.wasPressed('KeyE'),
      interactPressed: this.wasPressed('KeyE'),
      w1: this.wasPressed('Digit1'),
      w2: this.wasPressed('Digit2'),
      yawDelta: this.yawDelta,
    };
    return o;
  }

  endStep() {
    this.pressed.clear();
    this.yawDelta = 0;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLock);
  }
}
