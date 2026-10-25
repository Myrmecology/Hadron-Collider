/**
 * Hadron Collider — Detector visualization (ATLAS-inspired)
 *
 * Concentric layers around IP1 (world origin, beam along z), sized from the
 * same constants the physics transport uses, so visual and physical
 * boundaries coincide exactly.
 *
 *   Inner detector   pixel layers (incl. the 33 mm Insertable B-Layer),
 *                    silicon strips (SCT), transition-radiation tracker (TRT)
 *   Solenoid         2 T superconducting magnet
 *   ECAL             liquid-argon electromagnetic calorimeter (barrel + endcaps)
 *   HCAL             tile calorimeter: 64 azimuthal modules, as in ATLAS
 *   Muon system      three barrel stations, end-cap wheels, and the eight
 *                    barrel-toroid coils (25.3 m long, 9.4–20.1 m diameter)
 *
 * A collision triggers a pulse that travels outward through the layers.
 */
import * as THREE from 'three';
import { COLORS, DETECTOR } from '../config/constants.js';

/** ATLAS barrel layer radii (m): IBL + 3 pixel layers, 4 SCT layers. */
const PIXEL_RADII = [0.03325, 0.0505, 0.0885, 0.1225];
const PIXEL_HALF_LENGTH = 0.4;
const SCT_RADII = [0.299, 0.371, 0.443, 0.514];
const SCT_HALF_LENGTH = 0.75;
const TRT_INNER = 0.554;
const SCT_DISK_Z = [0.85, 0.93, 1.09, 1.3, 1.4, 1.77, 2.12, 2.5, 2.72];

/** ATLAS barrel toroid: 8 coils. */
const TOROID_COILS = 8;
const TOROID_R_INNER = 4.7;
const TOROID_R_OUTER = 10.05;
const TOROID_HALF_LENGTH = 12.65;

/** Muon barrel stations (approximate radii, m) and end-cap wheels (|z|, m). */
const MUON_STATIONS = [5.0, 7.5, 10.0];
const MUON_WHEELS_Z = [13.5, 21.5];

/** Speed at which the collision pulse travels outward (wall-clock m/s). */
const PULSE_SPEED = 9;

/* =============================================================================
   Geometry builders
   ============================================================================= */
function lineMaterial(color, opacity) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/** Wireframe cylinder: longitudinal lines plus hoops at given z positions. */
function cylinderWire(radius, halfLength, segments, hoopCount, color, opacity) {
  const pts = [];
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    pts.push(x, y, -halfLength, x, y, halfLength);
  }
  for (let h = 0; h < hoopCount; h++) {
    const z = hoopCount === 1 ? 0 : -halfLength + (2 * halfLength * h) / (hoopCount - 1);
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2;
      const a1 = ((k + 1) / segments) * Math.PI * 2;
      pts.push(
        Math.cos(a0) * radius, Math.sin(a0) * radius, z,
        Math.cos(a1) * radius, Math.sin(a1) * radius, z,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geometry, lineMaterial(color, opacity));
}

/** Wireframe annulus (end-cap disk) at a given z. */
function annulusWire(rInner, rOuter, z, segments, spokes, color, opacity) {
  const pts = [];
  for (const r of [rInner, rOuter]) {
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2;
      const a1 = ((k + 1) / segments) * Math.PI * 2;
      pts.push(Math.cos(a0) * r, Math.sin(a0) * r, z, Math.cos(a1) * r, Math.sin(a1) * r, z);
    }
  }
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2;
    pts.push(
      Math.cos(a) * rInner, Math.sin(a) * rInner, z,
      Math.cos(a) * rOuter, Math.sin(a) * rOuter, z,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geometry, lineMaterial(color, opacity));
}

/** Translucent solid shell between two radii. */
function shell(rInner, rOuter, halfLength, color, opacity) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    roughness: 0.6,
    metalness: 0.2,
  });
  for (const r of [rInner, rOuter]) {
    const geo = new THREE.CylinderGeometry(r, r, 2 * halfLength, 96, 1, true);
    geo.rotateX(Math.PI / 2); // cylinder axis → z (beam axis)
    group.add(new THREE.Mesh(geo, material));
  }
  return group;
}

/** Tile-calorimeter wedges: radial edges of 64 azimuthal modules. */
function tileModules(rInner, rOuter, halfLength, modules, color, opacity) {
  const pts = [];
  for (let k = 0; k < modules; k++) {
    const a = (k / modules) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const z of [-halfLength, halfLength]) {
      pts.push(c * rInner, s * rInner, z, c * rOuter, s * rOuter, z);
    }
    pts.push(c * rOuter, s * rOuter, -halfLength, c * rOuter, s * rOuter, halfLength);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geometry, lineMaterial(color, opacity));
}

/** One barrel-toroid coil: a rounded racetrack in the (r, z) half-plane at angle φ. */
function toroidCoil(phi, color, opacity) {
  const corner = 1.4;
  const r0 = TOROID_R_INNER;
  const r1 = TOROID_R_OUTER;
  const z0 = -TOROID_HALF_LENGTH;
  const z1 = TOROID_HALF_LENGTH;
  const path = [];
  const arc = (cr, cz, start) => {
    for (let i = 0; i <= 8; i++) {
      const a = start + (i / 8) * (Math.PI / 2);
      path.push([cr + Math.cos(a) * corner, cz + Math.sin(a) * corner]);
    }
  };
  arc(r1 - corner, z1 - corner, 0);
  arc(r0 + corner, z1 - corner, Math.PI / 2);
  arc(r0 + corner, z0 + corner, Math.PI);
  arc(r1 - corner, z0 + corner, (3 * Math.PI) / 2);
  path.push(path[0]);

  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const pts = path.flatMap(([r, z]) => [r * c, r * s, z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Line(geometry, lineMaterial(color, opacity));
}

/* =============================================================================
   Detector
   ============================================================================= */
export class Detector {
  object = new THREE.Group();

  /** Layers that participate in the collision pulse: { radius, materials, base[] }. */
  #layers = [];
  #pulseRadius = Infinity;

  constructor() {
    this.object.name = 'Detector';

    this.#addLayer(0.1, this.#buildPixels());
    this.#addLayer(0.5, this.#buildStrips());
    this.#addLayer(0.8, this.#buildTRT());
    this.#addLayer(DETECTOR.SOLENOID_RADIUS, this.#buildSolenoid());
    this.#addLayer(DETECTOR.ECAL_INNER_RADIUS, this.#buildECAL());
    this.#addLayer(DETECTOR.HCAL_INNER_RADIUS, this.#buildHCAL());
    this.#addLayer(DETECTOR.MUON_INNER_RADIUS, this.#buildMuonSystem());
  }

  #addLayer(radius, object) {
    const materials = [];
    object.traverse((o) => {
      if (o.material) materials.push(o.material);
    });
    this.#layers.push({ radius, materials, base: materials.map((m) => m.opacity) });
    this.object.add(object);
  }

  /* -------------------------------------------------------- Inner detector */
  #buildPixels() {
    const group = new THREE.Group();
    group.name = 'Pixels';
    for (const r of PIXEL_RADII) {
      group.add(cylinderWire(r, PIXEL_HALF_LENGTH, 24, 9, COLORS.DETECTOR_TRACKER, 0.35));
    }
    return group;
  }

  #buildStrips() {
    const group = new THREE.Group();
    group.name = 'SCT';
    for (const r of SCT_RADII) {
      group.add(cylinderWire(r, SCT_HALF_LENGTH, 48, 7, COLORS.DETECTOR_TRACKER, 0.22));
    }
    for (const z of SCT_DISK_Z) {
      for (const sign of [-1, 1]) {
        group.add(annulusWire(0.275, 0.56, sign * z, 48, 12, COLORS.DETECTOR_TRACKER, 0.18));
      }
    }
    return group;
  }

  #buildTRT() {
    const group = new THREE.Group();
    group.name = 'TRT';
    group.add(cylinderWire(TRT_INNER, 0.78, 64, 5, COLORS.DETECTOR_TRACKER, 0.12));
    group.add(cylinderWire(DETECTOR.TRACKER_OUTER_RADIUS, 0.78, 64, 5, COLORS.DETECTOR_TRACKER, 0.16));
    for (const sign of [-1, 1]) {
      group.add(annulusWire(0.64, 1.0, sign * 2.7, 64, 32, COLORS.DETECTOR_TRACKER, 0.1));
    }
    return group;
  }

  /* --------------------------------------------------------------- Solenoid */
  #buildSolenoid() {
    const group = shell(
      DETECTOR.SOLENOID_RADIUS - 0.02,
      DETECTOR.SOLENOID_RADIUS,
      DETECTOR.SOLENOID_HALF_LENGTH,
      0x9fb7cc,
      0.05,
    );
    group.name = 'Solenoid';
    return group;
  }

  /* ------------------------------------------------------------------ ECAL */
  #buildECAL() {
    const group = new THREE.Group();
    group.name = 'ECAL';
    const color = COLORS.DETECTOR_ECAL;
    group.add(shell(DETECTOR.ECAL_INNER_RADIUS, DETECTOR.ECAL_OUTER_RADIUS, DETECTOR.ECAL_HALF_LENGTH, color, 0.045));
    group.add(cylinderWire(DETECTOR.ECAL_INNER_RADIUS, DETECTOR.ECAL_HALF_LENGTH, 128, 13, color, 0.12));
    group.add(cylinderWire(DETECTOR.ECAL_OUTER_RADIUS, DETECTOR.ECAL_HALF_LENGTH, 128, 13, color, 0.08));
    for (const sign of [-1, 1]) {
      group.add(annulusWire(0.3, DETECTOR.ECAL_OUTER_RADIUS, sign * (DETECTOR.ECAL_HALF_LENGTH + 0.25), 96, 64, color, 0.1));
    }
    return group;
  }

  /* ------------------------------------------------------------------ HCAL */
  #buildHCAL() {
    const group = new THREE.Group();
    group.name = 'HCAL';
    const color = COLORS.DETECTOR_HCAL;
    group.add(shell(DETECTOR.HCAL_INNER_RADIUS, DETECTOR.HCAL_OUTER_RADIUS, DETECTOR.HCAL_HALF_LENGTH, color, 0.035));
    group.add(tileModules(DETECTOR.HCAL_INNER_RADIUS, DETECTOR.HCAL_OUTER_RADIUS, DETECTOR.HCAL_HALF_LENGTH, 64, color, 0.14));
    group.add(cylinderWire(DETECTOR.HCAL_INNER_RADIUS, DETECTOR.HCAL_HALF_LENGTH, 64, 9, color, 0.1));
    for (const sign of [-1, 1]) {
      group.add(annulusWire(0.45, DETECTOR.HCAL_OUTER_RADIUS, sign * DETECTOR.HCAL_HALF_LENGTH, 64, 64, color, 0.1));
    }
    return group;
  }

  /* ------------------------------------------------------------ Muon system */
  #buildMuonSystem() {
    const group = new THREE.Group();
    group.name = 'MuonSpectrometer';
    const color = COLORS.DETECTOR_MUON;

    // Barrel stations: 16-sided, echoing the octant structure of the chambers.
    for (const r of MUON_STATIONS) {
      group.add(cylinderWire(r, TOROID_HALF_LENGTH, 16, 6, color, 0.16));
    }
    // End-cap wheels.
    for (const z of MUON_WHEELS_Z) {
      for (const sign of [-1, 1]) {
        group.add(annulusWire(1.5, DETECTOR.MUON_OUTER_RADIUS, sign * z, 16, 16, color, 0.14));
      }
    }
    // Eight barrel-toroid coils, between the muon sectors.
    for (let k = 0; k < TOROID_COILS; k++) {
      const phi = ((k + 0.5) / TOROID_COILS) * Math.PI * 2;
      group.add(toroidCoil(phi, 0xb8c7d6, 0.45));
    }
    return group;
  }

  /* ===========================================================================
     Animation
     =========================================================================== */

  /** Start a collision pulse traveling outward from the beam axis. */
  pulse() {
    this.#pulseRadius = 0;
  }

  /**
   * Advance the pulse (wall-clock time, independent of the physics time scale,
   * so it reads the same at any slow-motion setting).
   * @param {number} wallDt  seconds
   */
  update(wallDt) {
    if (!Number.isFinite(this.#pulseRadius)) return;
    this.#pulseRadius += PULSE_SPEED * wallDt;

    let anyActive = false;
    for (const layer of this.#layers) {
      // Gaussian bump centered on the pulse front.
      const d = (this.#pulseRadius - layer.radius) / 0.9;
      const glow = Math.exp(-d * d);
      if (glow > 0.01) anyActive = true;
      layer.materials.forEach((m, i) => {
        m.opacity = Math.min(1, layer.base[i] * (1 + 3.5 * glow));
      });
    }

    if (!anyActive && this.#pulseRadius > DETECTOR.MUON_OUTER_RADIUS + 3) {
      this.#pulseRadius = Infinity;
      for (const layer of this.#layers) layer.materials.forEach((m, i) => (m.opacity = layer.base[i]));
    }
  }

  dispose() {
    this.object.traverse((obj) => {
      obj.geometry?.dispose?.();
      obj.material?.dispose?.();
    });
  }
}