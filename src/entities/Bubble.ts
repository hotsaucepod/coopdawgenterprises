import * as THREE from 'three';
import { makeTextSprite, updateTextSprite } from '../render/text';
import { makeItem, mat } from '../render/builders';
import type { ProductDef } from '../data/floors';

// A thought bubble that floats above a person: an emoji/text, or a product they want, plus a timer bar.
export class Bubble {
  group = new THREE.Group();
  private text: THREE.Sprite;
  private item: THREE.Group | null = null;
  private barBg: THREE.Mesh;
  private barFg: THREE.Mesh;
  private lastText = '';

  constructor(scene: THREE.Scene) {
    this.text = makeTextSprite(' ', { size: 44, bg: '#ffffff', color: '#111', height: 0.55 });
    this.barBg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.02), mat(0x222222, { flat: false }));
    this.barFg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.03), mat(0x3ddc84, { flat: false, emissive: 0x1f7a4a }));
    this.barBg.position.y = -0.4;
    this.barFg.position.y = -0.4;
    this.barBg.visible = false;
    this.barFg.visible = false;
    this.group.add(this.text, this.barBg, this.barFg);
    this.group.visible = false;
    scene.add(this.group);
  }

  showText(t: string): void {
    this.group.visible = true;
    this.text.visible = true;
    if (this.item) this.item.visible = false;
    if (t !== this.lastText) {
      updateTextSprite(this.text, t, { size: 44, bg: '#ffffff', color: '#111', height: 0.55 });
      this.lastText = t;
    }
  }

  showItem(p: ProductDef): void {
    this.group.visible = true;
    this.text.visible = true;
    if (this.lastText !== '   ') {
      updateTextSprite(this.text, '   ', { size: 44, bg: '#ffffff', color: '#111', height: 0.55 });
      this.lastText = '   ';
    }
    if (this.item) this.group.remove(this.item);
    this.item = makeItem(p);
    this.item.position.set(0, -0.12, 0.05);
    this.item.scale.setScalar(1.3);
    this.group.add(this.item);
  }

  setBar(frac: number | null, color = 0x3ddc84): void {
    const on = frac !== null;
    this.barBg.visible = on;
    this.barFg.visible = on;
    if (frac === null) return;
    const f = Math.max(0.001, Math.min(1, frac));
    this.barFg.scale.x = f;
    this.barFg.position.x = -0.35 + 0.35 * f;
    (this.barFg.material as THREE.MeshStandardMaterial) = mat(color, { flat: false, emissive: color });
  }

  hide(): void {
    this.group.visible = false;
  }

  follow(pos: THREE.Vector3, dt: number): void {
    this.group.position.set(pos.x, pos.y + 2.35, pos.z);
    if (this.item) this.item.rotation.y += dt * 2;
  }

  destroy(): void {
    this.group.removeFromParent();
  }
}
