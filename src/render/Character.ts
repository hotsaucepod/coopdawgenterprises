import * as THREE from 'three';
import { mat } from './builders';

export interface CharacterOpts {
  skin: number;
  shirt: number;
  hair: number;
  pants?: number;
  apron?: number;   // staff uniform colour
}

function capsule(rx: number, len: number, color: number, opts?: Parameters<typeof mat>[1]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(rx, len, 6, 16), mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Soft, rounded, toy-like person: round head, egg-shaped body, stubby thick legs. Faces +z.
export class Character {
  group = new THREE.Group();
  private legL: THREE.Group;
  private legR: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private body: THREE.Group;
  private walkT = 0;
  private walking = false;

  constructor(o: CharacterOpts) {
    const g = this.group;
    const pants = o.pants ?? 0x2f3a55;

    // legs hang from the hip pivot
    const makeLeg = (x: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.62, 0);
      const leg = capsule(0.12, 0.28, pants);
      leg.position.y = -0.3;
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat(0x222222, { roughness: 0.3, clearcoat: 0.8 }));
      shoe.scale.set(1, 0.6, 1.3);
      shoe.position.set(0, -0.56, 0.05);
      shoe.castShadow = true;
      pivot.add(leg, shoe);
      g.add(pivot);
      return pivot;
    };
    this.legL = makeLeg(-0.15);
    this.legR = makeLeg(0.15);

    // egg body
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), mat(o.shirt, { roughness: 0.4 }));
    torso.scale.set(1, 1.15, 0.85);
    torso.position.y = 0.98;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.body.add(torso);
    if (o.apron !== undefined) {
      const apron = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 18, 0, Math.PI), mat(o.apron, { roughness: 0.45 }));
      apron.scale.set(0.95, 1.05, 0.9);
      apron.position.set(0, 0.9, 0.02);
      this.body.add(apron);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), mat(0xffffff));
      strap.position.set(0, 1.28, 0);
      strap.rotation.x = Math.PI / 2;
      this.body.add(strap);
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.02), mat(0xffffff));
      tag.position.set(-0.16, 1.1, 0.3);
      this.body.add(tag);
    }
    g.add(this.body);

    const makeArm = (x: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.2, 0);
      const arm = capsule(0.085, 0.24, o.shirt);
      arm.position.y = -0.2;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), mat(o.skin, { roughness: 0.6 }));
      hand.position.y = -0.42;
      hand.castShadow = true;
      pivot.add(arm, hand);
      g.add(pivot);
      return pivot;
    };
    this.armL = makeArm(-0.38);
    this.armR = makeArm(0.38);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 22), mat(o.skin, { roughness: 0.55, clearcoat: 0.2 }));
    head.position.set(0, 1.62, 0);
    head.castShadow = true;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.335, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(o.hair, { roughness: 0.5 }));
    hair.position.set(0, 1.64, -0.03);
    g.add(hair);
    // big friendly eyes
    for (const x of [-0.11, 0.11]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), mat(0xffffff, { roughness: 0.2, clearcoat: 1 }));
      white.scale.set(0.8, 1.15, 0.6);
      white.position.set(x, 1.63, 0.28);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(0x1b1b1b, { roughness: 0.2 }));
      pupil.position.set(x, 1.63, 0.325);
      g.add(white, pupil);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 16, Math.PI), mat(0x8a3a2a));
    mouth.position.set(0, 1.5, 0.3);
    mouth.rotation.x = Math.PI;
    g.add(mouth);
    for (const x of [-0.16, 0.16]) {
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(0xff9a9a, { roughness: 0.8, clearcoat: 0 }));
      blush.scale.set(1, 0.6, 0.4);
      blush.position.set(x, 1.55, 0.29);
      g.add(blush);
    }
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
      const s = Math.sin(this.walkT) * 0.7;
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      if (!this.carryPose) {
        this.armL.rotation.x = -s * 0.8;
        this.armR.rotation.x = s * 0.8;
      }
      this.group.position.y = Math.abs(Math.sin(this.walkT)) * 0.05;
      this.body.rotation.z = Math.sin(this.walkT) * 0.05;
    } else {
      const k = Math.min(1, dt * 12);
      this.legL.rotation.x += (0 - this.legL.rotation.x) * k;
      this.legR.rotation.x += (0 - this.legR.rotation.x) * k;
      if (!this.carryPose) {
        this.armL.rotation.x += (0 - this.armL.rotation.x) * k;
        this.armR.rotation.x += (0 - this.armR.rotation.x) * k;
      }
      this.group.position.y = 0;
      this.body.rotation.z += (0 - this.body.rotation.z) * k;
    }
  }

  private carryPose = false;

  // arms raised as if carrying a stack
  setCarrying(carrying: boolean): void {
    this.carryPose = carrying;
    const target = carrying ? -1.5 : 0;
    this.armL.rotation.x = target;
    this.armR.rotation.x = target;
  }
}

export const CUSTOMER_LOOKS: CharacterOpts[] = [
  { skin: 0xf6cfa0, shirt: 0xff595e, hair: 0x2b1d0e },
  { skin: 0xe6b98a, shirt: 0x1982c4, hair: 0x6b3e1a, pants: 0x4a3b2a },
  { skin: 0xc98f5a, shirt: 0xffca3a, hair: 0x1a1a1a },
  { skin: 0x8d5524, shirt: 0x8ac926, hair: 0x1a1a1a, pants: 0x1f2a44 },
  { skin: 0xffe0b8, shirt: 0x6a4c93, hair: 0xd9a441 },
  { skin: 0xf6cfa0, shirt: 0xff924c, hair: 0xb54d2c, pants: 0x3a3a3a },
  { skin: 0xe6b98a, shirt: 0x52b788, hair: 0x2b1d0e },
  { skin: 0xc98f5a, shirt: 0xf15bb5, hair: 0x6b3e1a, pants: 0x5a4632 },
];
