import * as THREE from 'three';
import { box, mat } from './builders';

export interface CharacterOpts {
  skin: number;
  shirt: number;
  hair: number;
  pants?: number;
  apron?: number;   // staff uniform colour
}

// Round head, boxy body, thick legs. Faces +z in its own space; rotate the group to face a direction.
export class Character {
  group = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private walkT = 0;
  private walking = false;

  constructor(o: CharacterOpts) {
    const g = this.group;
    const pants = o.pants ?? 0x2f3542;
    // legs pivot at the hip: build the geometry hanging down from the origin
    const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.22);
    legGeo.translate(0, -0.275, 0);
    this.legL = new THREE.Mesh(legGeo, mat(pants));
    this.legR = new THREE.Mesh(legGeo, mat(pants));
    this.legL.position.set(-0.13, 0.6, 0);
    this.legR.position.set(0.13, 0.6, 0);
    for (const l of [this.legL, this.legR]) { l.castShadow = true; g.add(l); }
    const shoeGeo = new THREE.BoxGeometry(0.22, 0.1, 0.28);
    shoeGeo.translate(0, -0.55, 0.03);
    this.legL.add(new THREE.Mesh(shoeGeo, mat(0x1b1b1b)));
    this.legR.add(new THREE.Mesh(shoeGeo, mat(0x1b1b1b)));

    const body = box(0.54, 0.6, 0.32, o.shirt);
    body.position.set(0, 0.92, 0);
    g.add(body);
    if (o.apron !== undefined) {
      const apron = box(0.4, 0.5, 0.05, o.apron);
      apron.position.set(0, 0.86, 0.17);
      g.add(apron);
      const strap = box(0.42, 0.06, 0.05, 0xffffff);
      strap.position.set(0, 1.05, 0.18);
      g.add(strap);
      const tag = box(0.1, 0.06, 0.02, 0xffffff);
      tag.position.set(-0.17, 1.08, 0.2);
      g.add(tag);
    }
    const armGeo = new THREE.BoxGeometry(0.14, 0.5, 0.14);
    armGeo.translate(0, -0.22, 0);
    this.armL = new THREE.Mesh(armGeo, mat(o.shirt));
    this.armR = new THREE.Mesh(armGeo, mat(o.shirt));
    this.armL.position.set(-0.35, 1.16, 0);
    this.armR.position.set(0.35, 1.16, 0);
    const handGeo = new THREE.BoxGeometry(0.14, 0.12, 0.14);
    handGeo.translate(0, -0.5, 0);
    this.armL.add(new THREE.Mesh(handGeo, mat(o.skin)));
    this.armR.add(new THREE.Mesh(handGeo, mat(o.skin)));
    for (const a of [this.armL, this.armR]) { a.castShadow = true; g.add(a); }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), mat(o.skin, { flat: false, roughness: 0.7 }));
    head.position.set(0, 1.55, 0);
    head.castShadow = true;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(o.hair, { flat: false }));
    hair.position.set(0, 1.57, -0.02);
    g.add(hair);
    const eyeGeo = new THREE.SphereGeometry(0.035, 6, 6);
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(eyeGeo, mat(0x111111, { flat: false }));
      eye.position.set(x, 1.58, 0.27);
      g.add(eye);
    }
    const mouth = box(0.12, 0.03, 0.02, 0x7a3a2a);
    mouth.position.set(0, 1.46, 0.29);
    g.add(mouth);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  face(dx: number, dz: number): void {
    if (Math.abs(dx) + Math.abs(dz) < 0.0001) return;
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  setWalking(w: boolean): void {
    this.walking = w;
  }

  animate(dt: number): void {
    if (this.walking) {
      this.walkT += dt * 11;
      const s = Math.sin(this.walkT) * 0.65;
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      this.armL.rotation.x = -s * 0.8;
      this.armR.rotation.x = s * 0.8;
      this.group.position.y = Math.abs(Math.sin(this.walkT)) * 0.04;
    } else {
      const k = Math.min(1, dt * 12);
      this.legL.rotation.x += (0 - this.legL.rotation.x) * k;
      this.legR.rotation.x += (0 - this.legR.rotation.x) * k;
      this.armL.rotation.x += (0 - this.armL.rotation.x) * k;
      this.armR.rotation.x += (0 - this.armR.rotation.x) * k;
      this.group.position.y = 0;
    }
  }

  // arms raised as if carrying a stack
  setCarrying(carrying: boolean): void {
    const target = carrying ? -1.4 : 0;
    this.armL.rotation.x = target;
    this.armR.rotation.x = target;
  }
}

export const CUSTOMER_LOOKS: CharacterOpts[] = [
  { skin: 0xf1c27d, shirt: 0xe63946, hair: 0x2b1d0e },
  { skin: 0xe0ac69, shirt: 0x457b9d, hair: 0x6b3e1a, pants: 0x4a3b2a },
  { skin: 0xc68642, shirt: 0xf4a261, hair: 0x1a1a1a },
  { skin: 0x8d5524, shirt: 0x2a9d8f, hair: 0x1a1a1a, pants: 0x1f2a44 },
  { skin: 0xffdbac, shirt: 0x8338ec, hair: 0xd9a441 },
  { skin: 0xf1c27d, shirt: 0xffb703, hair: 0xb54d2c, pants: 0x3a3a3a },
  { skin: 0xe0ac69, shirt: 0x6d6875, hair: 0x2b1d0e },
  { skin: 0xc68642, shirt: 0x06d6a0, hair: 0x6b3e1a, pants: 0x5a4632 },
];
