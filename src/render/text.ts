import * as THREE from 'three';

export interface TextSpriteOpts {
  size?: number;      // font px on the canvas
  color?: string;
  bg?: string;        // background pill colour, or none
  height?: number;    // world height of the sprite
  bold?: boolean;
  padding?: number;
}

// A billboard label drawn on a canvas. Cheap enough to remake when the text changes.
export function makeTextSprite(text: string, o: TextSpriteOpts = {}): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  updateTextSprite(sprite, text, o);
  return sprite;
}

export function updateTextSprite(sprite: THREE.Sprite, text: string, o: TextSpriteOpts = {}): void {
  const size = o.size ?? 40;
  const pad = o.padding ?? 14;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${o.bold === false ? '' : 'bold '}${size}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.font = font;
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const lineH = size * 1.15;
  const h = lineH * lines.length + pad * 1.2;
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(h);
  ctx.font = font;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    const r = Math.min(18, h / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();
  }
  ctx.fillStyle = o.color ?? '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (!o.bg) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineJoin = 'round';
  }
  lines.forEach((l, i) => {
    const y = pad * 0.6 + lineH * (i + 0.5);
    if (!o.bg) ctx.strokeText(l, canvas.width / 2, y);
    ctx.fillText(l, canvas.width / 2, y);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.map = tex;
  mat.needsUpdate = true;
  const height = o.height ?? 0.45;
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1);
}
