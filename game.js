import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

// 1. ЗВУКОВОЙ ASMR-ДВИЖОК
class AsmrSoundEngine {
    constructor() { this.ctx = null; }
    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    playSpawn() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(380, now + 0.12);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.16, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(now); osc.stop(now + 0.25);
    }
    // Глухой, мягкий низкочастотный звук разреза (без писка!)
    playSlice(count = 1) {
        this.init();
        if (!this.ctx) return;
        const audioCtx = this.ctx;
        const now = audioCtx.currentTime;

        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.085);

        oscGain.gain.setValueAtTime(0.22, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.09);

        const bufferSize = Math.floor(audioCtx.sampleRate * 0.07);
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
        }

        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(220, now);
        filter.frequency.exponentialRampToValueAtTime(75, now + 0.07);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.18, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        whiteNoise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        whiteNoise.start(now);
    }
    playBounce(intensity = 0.5) {
        if (!this.ctx || intensity < 0.3) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
        osc.type = 'sine';
        const f = 110 + Math.random() * 45;
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(Math.min(0.12, intensity * 0.025), now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(now); osc.stop(now + 0.15);
    }
}
const sound = new AsmrSoundEngine();

// 2. СОЧНАЯ ПАЛИТРА И СПИСОК 6 ФОРМ
const ALL_SHAPES = ['snowflake', 'bear', 'heart', 'pear', 'torus', 'star'];
const JELLY_PALETTE = [
    { name: 'Рубиновый', base: 0xff1e4d, deep: 0x990024, rim: 0xffa6b8 },
    { name: 'Изумрудный', base: 0x00e676, deep: 0x006633, rim: 0xb3ffd9 },
    { name: 'Апельсиновый', base: 0xff8800, deep: 0x8f3d00, rim: 0xffe49e },
    { name: 'Голубой лёд', base: 0x00b8ff, deep: 0x00478f, rim: 0xb3ecff },
    { name: 'Лаймовый', base: 0xc6ff00, deep: 0x4d7300, rim: 0xf4ffad },
    { name: 'Малиновый', base: 0xff0066, deep: 0x7a0030, rim: 0xffadd2 },
    { name: 'Виноградный', base: 0xaa22ff, deep: 0x47007a, rim: 0xe6b8ff }
];

// 3. ШЕЙДЕР ПОЛУПРОЗРАЧНОГО ЖЕЛЕ (УПРУГАЯ ТРЯСКА И СОХРАНЕНИЕ ОБЪЁМА НЕ ТРОНУТЫ)
function createJellyMaterial(paletteEntry) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uBaseColor: { value: new THREE.Color(paletteEntry.base) },
            uDeepColor: { value: new THREE.Color(paletteEntry.deep) },
            uRimColor: { value: new THREE.Color(paletteEntry.rim) },
            uLightPos: { value: new THREE.Vector3(8, 16, 10) },
            uLightPos2: { value: new THREE.Vector3(-9, 12, -7) },
            uTime: { value: 0 },
            uWobbleAmp: { value: 0.0 },
            uSquash: { value: 0.0 }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uWobbleAmp;
            uniform float uSquash;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            varying vec3 vLocalPos;
            void main() {
                vLocalPos = position;
                vec3 pos = position;
                float w = sin(pos.y * 5.0 + uTime * 13.0) * cos(pos.x * 4.0 + uTime * 11.0);
                pos.x += w * uWobbleAmp * 0.07;
                pos.z += cos(pos.z * 5.0 - uTime * 13.0) * uWobbleAmp * 0.07;
                pos.y *= (1.0 - uSquash * 0.12);
                pos.xz *= (1.0 + uSquash * 0.07);
                vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
                vWorldPos = worldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uBaseColor;
            uniform vec3 uDeepColor;
            uniform vec3 uRimColor;
            uniform vec3 uLightPos;
            uniform vec3 uLightPos2;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            varying vec3 vLocalPos;
            void main() {
                vec3 N = normalize(vWorldNormal);
                vec3 V = normalize(cameraPosition - vWorldPos);
                vec3 L1 = normalize(uLightPos - vWorldPos);
                vec3 L2 = normalize(uLightPos2 - vWorldPos);

                float wrap1 = max(0.0, (dot(N, L1) + 0.65) / 1.65);
                float wrap2 = max(0.0, (dot(N, L2) + 0.55) / 1.55);

                vec3 backDir = normalize(L1 + N * 0.45);
                float sss = pow(clamp(dot(V, -backDir), 0.0, 1.0), 2.2) * 0.95;
                float depthFactor = clamp(length(vLocalPos) * 0.5, 0.0, 1.0);

                vec3 jellyBody = mix(uBaseColor, uDeepColor, depthFactor * 0.38);
                vec3 col = jellyBody * (0.48 + 0.62 * wrap1 + 0.25 * wrap2) + uBaseColor * sss * 0.75;

                float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);
                col = mix(col, uRimColor, fresnel * 0.48);

                vec3 H1 = normalize(L1 + V);
                float spec = pow(max(dot(N, H1), 0.0), 110.0) * 0.85 + pow(max(dot(N, H1), 0.0), 22.0) * 0.18;
                col += vec3(1.0) * spec;

                float alpha = clamp(0.82 + fresnel * 0.12 + spec * 0.15, 0.82, 0.96);
                gl_FragColor = vec4(col, alpha);
            }
        `,
        transparent: true,
        depthWrite: true,
        depthTest: true,
        side: THREE.FrontSide
    });
}

function enforceOutwardWinding(geom) {
    const nonIdx = geom.index ? geom.toNonIndexed() : geom;
    nonIdx.computeVertexNormals();
    return nonIdx;
}

// 4. ГЕНЕРАТОРЫ 6 ФОРМ ЖЕЛЕ
function createShapeGeometry(type) {
    switch (type) {
        case 'snowflake': {
            const shape = new THREE.Shape();
            const arms = 6, pts = [];
            for (let i = 0; i < arms; i++) {
                const baseA = (i / arms) * Math.PI * 2;
                const prof = [
                    [0.34, 0.0], [0.72, 0.06], [0.92, 0.22], [1.02, 0.16],
                    [0.80, 0.05], [1.34, 0.04], [1.44, 0.0], [1.34, -0.04],
                    [0.80, -0.05], [1.02, -0.16], [0.92, -0.22], [0.72, -0.06]
                ];
                for (const [r, aOff] of prof) {
                    pts.push(new THREE.Vector2(Math.cos(baseA + aOff) * r, Math.sin(baseA + aOff) * r));
                }
                const midA = baseA + (Math.PI / arms);
                pts.push(new THREE.Vector2(Math.cos(midA) * 0.36, Math.sin(midA) * 0.36));
            }
            shape.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
            shape.closePath();
            const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.52, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.08, bevelThickness: 0.1 });
            geom.center(); geom.rotateX(Math.PI / 2);
            return enforceOutwardWinding(geom);
        }
        case 'bear': {
            const geom = new THREE.SphereGeometry(1.3, 44, 34);
            const pos = geom.attributes.position, v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i);
                const nx = v.x / 1.3, ny = v.y / 1.3, nz = v.z / 1.3;
                let sx = 0.85, sy = 1.15, sz = 0.74;
                if (ny > 0.12 && ny < 0.45) { const neck = 1.0 - 0.2 * Math.exp(-Math.pow((ny - 0.28) * 6.0, 2)); sx *= neck; sz *= neck; }
                if (ny > 0.6 && Math.abs(nx) > 0.3) { sy += 0.22 * Math.exp(-Math.pow((Math.abs(nx) - 0.55) * 4.5, 2)); sx += 0.12; }
                if (ny > 0.32 && ny < 0.7 && nz > 0.32) { sz += 0.2 * Math.exp(-Math.pow((ny - 0.5) * 5.0, 2)); }
                pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
            }
            return enforceOutwardWinding(geom);
        }
        case 'heart': {
            const hs = new THREE.Shape();
            hs.moveTo(0, 0.45);
            hs.bezierCurveTo(0, 0.45, -0.15, 0, -0.65, 0);
            hs.bezierCurveTo(-1.35, 0, -1.35, 0.85, -1.35, 0.85);
            hs.bezierCurveTo(-1.35, 1.35, -0.85, 1.85, 0, 2.35);
            hs.bezierCurveTo(0.85, 1.85, 1.35, 1.35, 1.35, 0.85);
            hs.bezierCurveTo(1.35, 0.85, 1.35, 0, 0.65, 0);
            hs.bezierCurveTo(0.15, 0, 0, 0.45, 0, 0.45);
            const geom = new THREE.ExtrudeGeometry(hs, { depth: 0.7, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.18, bevelThickness: 0.18, curveSegments: 22 });
            geom.center(); geom.rotateX(Math.PI); geom.scale(0.85, 0.85, 0.85);
            return enforceOutwardWinding(geom);
        }
        case 'pear': {
            const geom = new THREE.SphereGeometry(1.15, 44, 34);
            const pos = geom.attributes.position, v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i);
                const ny = v.y / 1.15;
                const prof = ny > 0 ? 0.6 + 0.4 * Math.cos(ny * Math.PI * 0.55) : 1.0 + 0.25 * Math.sin(-ny * Math.PI * 0.75);
                pos.setXYZ(i, v.x * prof, v.y * 1.26, v.z * prof);
            }
            return enforceOutwardWinding(geom);
        }
        case 'torus': {
            const geom = new THREE.TorusGeometry(0.92, 0.44, 28, 48);
            geom.rotateX(Math.PI / 2);
            return enforceOutwardWinding(geom);
        }
        case 'star': {
            const star = new THREE.Shape();
            for (let i = 0; i < 10; i++) {
                const r = i % 2 === 0 ? 1.35 : 0.64;
                const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            star.closePath();
            const geom = new THREE.ExtrudeGeometry(star, { depth: 0.6, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.12, bevelThickness: 0.14 });
            geom.center(); geom.rotateX(Math.PI / 2);
            return enforceOutwardWinding(geom);
        }
        default: return createShapeGeometry('snowflake');
    }
}

// 5. ТОЧНЫЙ АЛГОРИТМ РАЗРЕЗА ГЕОМЕТРИИ
function sliceGeometryInWorldSpace(mesh, worldPlane) {
    mesh.updateMatrixWorld(true);
    const srcGeom = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const posAttr = srcGeom.attributes.position;
    const normAttr = srcGeom.attributes.normal;
    const triCount = posAttr.count / 3;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);

    const worldVerts = new Array(posAttr.count);
    const worldNorms = new Array(posAttr.count);
    const dists = new Float32Array(posAttr.count);
    let hasPos = false, hasNeg = false;
    const EPS = 1e-6;

    for (let i = 0; i < posAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
        const n = new THREE.Vector3().fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
        const d = worldPlane.distanceToPoint(v);
        worldVerts[i] = v; worldNorms[i] = n; dists[i] = d;
        if (d > EPS) hasPos = true;
        if (d < -EPS) hasNeg = true;
    }
    if (!hasPos || !hasNeg) return null;

    const posVerts = [], posNorms = [];
    const negVerts = [], negNorms = [];
    const cutSegments = [];

    function pushOrientedTri(tV, tN, v0, v1, v2, n0, n1, n2, expectedDir) {
        const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
        const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
        const cx = e1y * e2z - e1z * e2y;
        const cy = e1z * e2x - e1x * e2z;
        const cz = e1x * e2y - e1y * e2x;
        const dir = expectedDir || n0;
        if (cx * dir.x + cy * dir.y + cz * dir.z < 0) {
            tV.push(v0.x, v0.y, v0.z, v2.x, v2.y, v2.z, v1.x, v1.y, v1.z);
            tN.push(n0.x, n0.y, n0.z, n2.x, n2.y, n2.z, n1.x, n1.y, n1.z);
        } else {
            tV.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
            tN.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
        }
    }

    function lerpV(va, vb, na, nb, da, db) {
        const denom = da - db;
        const t = Math.abs(denom) < 1e-9 ? 0.5 : THREE.MathUtils.clamp(da / denom, 0.0, 1.0);
        return {
            v: new THREE.Vector3().lerpVectors(va, vb, t),
            n: new THREE.Vector3().lerpVectors(na, nb, t).normalize()
        };
    }

    for (let t = 0; t < triCount; t++) {
        const i0 = t * 3, i1 = t * 3 + 1, i2 = t * 3 + 2;
        const v = [worldVerts[i0], worldVerts[i1], worldVerts[i2]];
        const n = [worldNorms[i0], worldNorms[i1], worldNorms[i2]];
        const d = [dists[i0], dists[i1], dists[i2]];
        const s = [d[0] >= 0, d[1] >= 0, d[2] >= 0];
        const posCount = (s[0] ? 1 : 0) + (s[1] ? 1 : 0) + (s[2] ? 1 : 0);

        if (posCount === 3) {
            pushOrientedTri(posVerts, posNorms, v[0], v[1], v[2], n[0], n[1], n[2]);
        } else if (posCount === 0) {
            pushOrientedTri(negVerts, negNorms, v[0], v[1], v[2], n[0], n[1], n[2]);
        } else {
            const soloIsPos = posCount === 1;
            let soloIdx = 0;
            for (let k = 0; k < 3; k++) if (s[k] === soloIsPos) { soloIdx = k; break; }
            const idxA = soloIdx, idxB = (soloIdx + 1) % 3, idxC = (soloIdx + 2) % 3;
            const intAB = lerpV(v[idxA], v[idxB], n[idxA], n[idxB], d[idxA], d[idxB]);
            const intAC = lerpV(v[idxA], v[idxC], n[idxA], n[idxC], d[idxA], d[idxC]);

            if (soloIsPos) {
                pushOrientedTri(posVerts, posNorms, v[idxA], intAB.v, intAC.v, n[idxA], intAB.n, intAC.n);
                pushOrientedTri(negVerts, negNorms, intAB.v, v[idxB], v[idxC], intAB.n, n[idxB], n[idxC]);
                pushOrientedTri(negVerts, negNorms, intAB.v, v[idxC], intAC.v, intAB.n, n[idxC], intAC.n);
            } else {
                pushOrientedTri(negVerts, negNorms, v[idxA], intAB.v, intAC.v, n[idxA], intAB.n, intAC.n);
                pushOrientedTri(posVerts, posNorms, intAB.v, v[idxB], v[idxC], intAB.n, n[idxB], n[idxC]);
                pushOrientedTri(posVerts, posNorms, intAB.v, v[idxC], intAC.v, intAB.n, n[idxC], intAC.n);
            }
            if (intAB.v.distanceToSquared(intAC.v) > 1e-10) {
                cutSegments.push({ a: intAB.v, b: intAC.v });
            }
        }
    }

    if (posVerts.length < 9 || negVerts.length < 9 || cutSegments.length === 0) return null;

    const planeNormal = worldPlane.normal.clone().normalize();
    const posCapNormal = planeNormal.clone().negate();
    const negCapNormal = planeNormal.clone();

    const visited = new Uint8Array(cutSegments.length);
    const clusterDistSq = 0.28 * 0.28;
    const globalCenter = new THREE.Vector3();

    for (let i = 0; i < cutSegments.length; i++) {
        globalCenter.add(cutSegments[i].a).add(cutSegments[i].b);
    }
    globalCenter.divideScalar(cutSegments.length * 2);

    for (let i = 0; i < cutSegments.length; i++) {
        if (visited[i]) continue;
        visited[i] = 1;
        const cluster = [cutSegments[i]];
        let added = true;
        while (added) {
            added = false;
            for (let j = 0; j < cutSegments.length; j++) {
                if (visited[j]) continue;
                const cand = cutSegments[j];
                for (let k = 0; k < cluster.length; k++) {
                    const ex = cluster[k];
                    if (
                        cand.a.distanceToSquared(ex.a) < clusterDistSq ||
                        cand.a.distanceToSquared(ex.b) < clusterDistSq ||
                        cand.b.distanceToSquared(ex.a) < clusterDistSq ||
                        cand.b.distanceToSquared(ex.b) < clusterDistSq
                    ) {
                        visited[j] = 1;
                        cluster.push(cand);
                        added = true;
                        break;
                    }
                }
            }
        }

        const localCenter = new THREE.Vector3();
        for (let k = 0; k < cluster.length; k++) {
            localCenter.add(cluster[k].a).add(cluster[k].b);
        }
        localCenter.divideScalar(cluster.length * 2);

        for (let k = 0; k < cluster.length; k++) {
            const seg = cluster[k];
            pushOrientedTri(posVerts, posNorms, localCenter, seg.a, seg.b, posCapNormal, posCapNormal, posCapNormal, posCapNormal);
            pushOrientedTri(negVerts, negNorms, localCenter, seg.a, seg.b, negCapNormal, negCapNormal, negCapNormal, negCapNormal);
        }
    }

    const posPiece = buildRecenteredPieceData(posVerts, posNorms);
    const negPiece = buildRecenteredPieceData(negVerts, negNorms);
    if (!posPiece || !negPiece) return null;
    return { posPiece, negPiece, capCenter: globalCenter };
}

function buildRecenteredPieceData(vertsArray, normsArray) {
    const vertexCount = vertsArray.length / 3;
    if (vertexCount < 4) return null;

    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < vertsArray.length; i += 3) {
        cx += vertsArray[i]; cy += vertsArray[i + 1]; cz += vertsArray[i + 2];
    }
    cx /= vertexCount; cy /= vertexCount; cz /= vertexCount;

    const centroid = new THREE.Vector3(cx, cy, cz);
    const localPositions = new Float32Array(vertsArray.length);
    const localNormals = new Float32Array(normsArray);
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < vertsArray.length; i += 3) {
        const lx = vertsArray[i] - cx, ly = vertsArray[i + 1] - cy, lz = vertsArray[i + 2] - cz;
        localPositions[i] = lx; localPositions[i + 1] = ly; localPositions[i + 2] = lz;
        if (lx < min.x) min.x = lx; if (ly < min.y) min.y = ly; if (lz < min.z) min.z = lz;
        if (lx > max.x) max.x = lx; if (ly > max.y) max.y = ly; if (lz > max.z) max.z = lz;
    }

    const size = new THREE.Vector3().subVectors(max, min);
    if (size.x < 0.002 || size.y < 0.002 || size.z < 0.002) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(localPositions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(localNormals, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return { geometry, centroid, size };
}

// 6. СЦЕНА, ОСВЕЩЕНИЕ И ОКРУЖЕНИЕ
const canvas = document.getElementById('webgl-canvas');
const sliceOverlay = document.getElementById('slice-overlay');
const ctx2d = sliceOverlay.getContext('2d');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const colorSoftGreen = new THREE.Color(0x1f6f54);
const colorSoftOrange = new THREE.Color(0xc86428);
const activeBgColor = new THREE.Color().copy(colorSoftGreen);
scene.background = activeBgColor;
scene.fog = new THREE.FogExp2(0x1f6f54, 0.012);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 160);
camera.position.set(0, 8.2, 11.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 4.0;
controls.maxDistance = 26.0;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

window.addEventListener('contextmenu', (e) => e.preventDefault());

scene.add(new THREE.HemisphereLight(0xfff8ed, 0x28362e, 1.1));
const keyLight = new THREE.DirectionalLight(0xfff7e8, 2.0);
keyLight.position.set(8, 16, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -14; keyLight.shadow.camera.right = 14;
keyLight.shadow.camera.top = 14; keyLight.shadow.camera.bottom = -14;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xa8ffea, 1.0);
rimLight.position.set(-9, 12, -7);
scene.add(rimLight);

const world = new CANNON.World();
world.gravity.set(0, -18.0, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;

const boardPhysMat = new CANNON.Material('boardMaterial');
const jellyPhysMat = new CANNON.Material('jellyMaterial');
world.addContactMaterial(new CANNON.ContactMaterial(boardPhysMat, jellyPhysMat, { friction: 0.12, restitution: 0.15 }));
world.addContactMaterial(new CANNON.ContactMaterial(jellyPhysMat, jellyPhysMat, { friction: 0.02, restitution: 0.2 }));

function createDetailedWoodTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#cfa06e'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 140; i++) {
        g.fillStyle = i % 2 === 0 ? 'rgba(140, 88, 42, 0.14)' : 'rgba(242, 202, 150, 0.14)';
        g.fillRect(0, (i / 140) * 512, 512, 3 + Math.random() * 5);
    }
    g.strokeStyle = 'rgba(95, 55, 22, 0.5)'; g.lineWidth = 10;
    g.strokeRect(24, 24, 464, 464);
    return new THREE.CanvasTexture(c);
}

// 3D Шеф-нож на доске
function createChefKnife() {
    const knife = new THREE.Group();
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.lineTo(2.8, 0);
    bladeShape.quadraticCurveTo(3.4, 0.08, 3.6, 0.38);
    bladeShape.lineTo(0, 0.65);
    bladeShape.closePath();

    const bladeGeom = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
    bladeGeom.center();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.16 });
    const bladeMesh = new THREE.Mesh(bladeGeom, bladeMat);
    bladeMesh.castShadow = true; bladeMesh.receiveShadow = true;
    bladeMesh.position.set(1.8, 0, 0);
    knife.add(bladeMesh);

    const bolsterGeom = new THREE.BoxGeometry(0.16, 0.7, 0.1);
    const bolsterMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.22 });
    const bolsterMesh = new THREE.Mesh(bolsterGeom, bolsterMat);
    bolsterMesh.position.set(-0.02, 0, 0);
    bolsterMesh.castShadow = true;
    knife.add(bolsterMesh);

    const handleGeom = new THREE.CylinderGeometry(0.16, 0.14, 1.7, 16);
    handleGeom.rotateZ(Math.PI / 2);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.42, metalness: 0.1 });
    const handleMesh = new THREE.Mesh(handleGeom, handleMat);
    handleMesh.position.set(-0.95, 0, 0);
    handleMesh.castShadow = true;
    knife.add(handleMesh);

    const rivetMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.9, roughness: 0.2 });
    for (const rx of [-0.5, -0.95, -1.4]) {
        const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 8), rivetMat);
        rivet.position.set(rx, 0, 0);
        knife.add(rivet);
    }

    knife.rotation.x = Math.PI / 2;
    knife.rotation.z = -0.12;
    knife.position.set(4.3, 0.04, 2.9);
    return knife;
}

// Высота рабочей поверхности доски
const BOARD_Y = 0.01;

function buildEnvironment() {
    // 1. Платформа основания
    const tW = 44.0, tH = 1.0, tD = 30.0;
    const tableMesh = new THREE.Mesh(
        new THREE.BoxGeometry(tW, tH, tD),
        new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.4, metalness: 0.15 })
    );
    tableMesh.position.set(0, -0.9, -1.0);
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    const tableBody = new CANNON.Body({ mass: 0, material: boardPhysMat, shape: new CANNON.Box(new CANNON.Vec3(tW / 2, tH / 2, tD / 2)) });
    tableBody.position.set(0, -0.9, -1.0);
    world.addBody(tableBody);

    // Защитные бортики по периметру стола
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x262c38, roughness: 0.35, metalness: 0.25 });
    const walls = [
        { pos: [0, -0.05, -16.0], size: [tW, 0.8, 0.7] },
        { pos: [0, -0.05, 14.0], size: [tW, 0.8, 0.7] },
        { pos: [-22.0, -0.05, -1.0], size: [0.7, 0.8, tD] },
        { pos: [22.0, -0.05, -1.0], size: [0.7, 0.8, tD] }
    ];
    for (const w of walls) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
        m.position.set(...w.pos); m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        const wb = new CANNON.Body({ mass: 0, material: boardPhysMat, shape: new CANNON.Box(new CANNON.Vec3(w.size[0] / 2, w.size[1] / 2, w.size[2] / 2)) });
        wb.position.set(...w.pos);
        world.addBody(wb);
    }

    // 2. Разделочная доска (без палочек!)
    const bW = 12.0, bH = 0.46, bD = 8.2;
    const boardMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bW, bH, bD),
        new THREE.MeshStandardMaterial({ map: createDetailedWoodTexture(), roughness: 0.35, metalness: 0.05 })
    );
    boardMesh.position.set(0, -0.22, 0.5);
    boardMesh.castShadow = true; boardMesh.receiveShadow = true;
    scene.add(boardMesh);

    const boardBody = new CANNON.Body({ mass: 0, material: boardPhysMat, shape: new CANNON.Box(new CANNON.Vec3(bW / 2, bH / 2, bD / 2)) });
    boardBody.position.set(0, -0.22, 0.5);
    world.addBody(boardBody);

    // 3. Красивый 3D шеф-нож на доске (лишний декор: ваза, банки, блок с ножами и горшок удалены!)
    scene.add(createChefKnife());
}
buildEnvironment();

// 7. СИСТЕМА ЧАСТИЦ/ВЕРШИН, УСТОЙЧИВАЯ ОПОРА И КОЛЛИЗИИ ЖЕЛЕ
const particleRadius = 0.08;
const syrupDrops = [];
const dropSphereGeom = new THREE.SphereGeometry(0.06, 8, 8);

function spawnSyrupSplash(centerPos, colorHex, count = 8) {
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.1 });
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(dropSphereGeom, mat);
        mesh.position.copy(centerPos).add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.35));
        scene.add(mesh);
        syrupDrops.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 3.2, 1.0 + Math.random() * 2.0, (Math.random() - 0.5) * 3.2), life: 1.0 });
    }
}

const jellyPieces = [];
let totalSlicesCount = 0;
let isSlowMo = false;

const statSlicesEl = document.getElementById('stat-slices');
const statPiecesEl = document.getElementById('stat-pieces');
const statComboEl = document.getElementById('stat-combo');
const comboToastEl = document.getElementById('combo-toast');

function updateHUD() {
    statSlicesEl.textContent = totalSlicesCount;
    statPiecesEl.textContent = jellyPieces.length;
}

function showComboToast(slicedNow) {
    if (slicedNow >= 2) {
        statComboEl.textContent = `x${slicedNow}`;
        comboToastEl.textContent = `СОЧНОЕ КОМБО x${slicedNow}!`;
        comboToastEl.classList.add('show');
        clearTimeout(showComboToast._timer);
        showComboToast._timer = setTimeout(() => comboToastEl.classList.remove('show'), 1000);
    } else {
        statComboEl.textContent = 'x1';
    }
}

// Выборка опорных узлов/вершин сетки для честного контакта и межобъектных коллизий
function extractSurfaceNodes(geometry, maxNodes = 28) {
    const pos = geometry.attributes.position;
    const count = pos.count;
    const stride = Math.max(1, Math.floor(count / maxNodes));
    const nodes = [];
    for (let i = 0; i < count && nodes.length < maxNodes; i += stride) {
        nodes.push({
            local: new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
            x: 0, y: 0, z: 0,
            vx: 0, vy: 0, vz: 0
        });
    }
    return nodes;
}

// 1. УБЕРИ УКАТЫВАНИЕ ЖЕЛЕ ПО ДОСКЕ И ПОСЛЕ РАЗРЕЗАНИЯ:
// Опора по реальным нижним точкам/вершинам сетки с сильным горизонтальным трением и гашением вращения
function updateJellyNodesAndBoardFriction(piece) {
    const body = piece.body;
    let touchingBoard = false;
    const boardMinX = -5.9, boardMaxX = 5.9;
    const boardMinZ = -3.5, boardMaxZ = 4.5;

    for (let i = 0; i < piece.nodes.length; i++) {
        const p = piece.nodes[i];
        const wPos = body.pointToWorldFrame(new CANNON.Vec3(p.local.x, p.local.y, p.local.z));
        p.x = wPos.x;
        p.y = wPos.y;
        p.z = wPos.z;

        const rx = p.x - body.position.x;
        const ry = p.y - body.position.y;
        const rz = p.z - body.position.z;
        const vPoint = body.velocity.vadd(body.angularVelocity.cross(new CANNON.Vec3(rx, ry, rz)));
        p.vx = vPoint.x;
        p.vy = vPoint.y;
        p.vz = vPoint.z;

        const onBoard = (p.x >= boardMinX && p.x <= boardMaxX && p.z >= boardMinZ && p.z <= boardMaxZ);
        const floorY = onBoard ? BOARD_Y : -0.4;

        if (p.y <= floorY + particleRadius) {
            p.y = floorY + particleRadius;
            if (p.vy < 0) p.vy = -p.vy * 0.05; // гасим вертикальный отскок
            // Сильное трение с доской, чтобы желе не катилось
            p.vx *= 0.72;
            p.vz *= 0.72;
            if (Math.hypot(p.vx, p.vz) < 0.015) {
                p.vx = 0;
                p.vz = 0;
            }
            touchingBoard = true;
        }
    }

    if (touchingBoard) {
        // Если у тела используется угловая скорость (angularVelocity), при касании доски умножай её на 0.6 на каждом шаге.
        body.angularVelocity.x *= 0.6;
        body.angularVelocity.y *= 0.6;
        body.angularVelocity.z *= 0.6;

        body.velocity.x *= 0.72;
        body.velocity.z *= 0.72;
        if (Math.hypot(body.velocity.x, body.velocity.z) < 0.015) {
            body.velocity.x = 0;
            body.velocity.z = 0;
        }
    }
}

// 2. ИСПРАВЬ КОЛЛИЗИЮ МЕЖДУ ЖЕЛЕ (ЧТОБЫ ОДНО ЖЕЛЕ НЕ ВХОДИЛО ВО ВТОРОЕ):
// Честная повершинная коллизия между всеми активными кусками желе
function resolveJellyToJellyCollisions(jellies) {
    const minDist = particleRadius * 2.1;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < jellies.length; i++) {
        const a = jellies[i];
        for (let j = i + 1; j < jellies.length; j++) {
            const b = jellies[j];
            const dxC = b.center.x - a.center.x;
            const dyC = b.center.y - a.center.y;
            const dzC = b.center.z - a.center.z;
            const maxR = (a.boundingRadius || 2.5) + (b.boundingRadius || 2.5);
            if (dxC * dxC + dyC * dyC + dzC * dzC > maxR * maxR) continue;

            const nodesA = a.nodes || a.particles || a.vertices;
            const nodesB = b.nodes || b.particles || b.vertices;
            for (let na = 0; na < nodesA.length; na++) {
                const pa = nodesA[na];
                for (let nb = 0; nb < nodesB.length; nb++) {
                    const pb = nodesB[nb];
                    const dx = pb.x - pa.x;
                    const dy = pb.y - pa.y;
                    const dz = pb.z - pa.z;
                    const dSq = dx * dx + dy * dy + dz * dz;

                    if (dSq > 1e-6 && dSq < minDistSq) {
                        const dist = Math.sqrt(dSq);
                        const overlap = (minDist - dist) * 0.5;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const nz = dz / dist;

                        pa.x -= nx * overlap;
                        pa.y -= ny * overlap;
                        pa.z -= nz * overlap;
                        pb.x += nx * overlap;
                        pb.y += ny * overlap;
                        pb.z += nz * overlap;

                        const rvx = pb.vx - pa.vx;
                        const rvy = pb.vy - pa.vy;
                        const rvz = pb.vz - pa.vz;
                        const vn = rvx * nx + rvy * ny + rvz * nz;
                        if (vn < 0) {
                            const impulse = vn * 0.45;
                            pa.vx += nx * impulse;
                            pa.vy += ny * impulse;
                            pa.vz += nz * impulse;
                            pb.vx -= nx * impulse;
                            pb.vy -= ny * impulse;
                            pb.vz -= nz * impulse;

                            // Импульс отталкивания на физические тела
                            a.body.velocity.x += nx * impulse * 0.25;
                            a.body.velocity.y += ny * impulse * 0.25;
                            a.body.velocity.z += nz * impulse * 0.25;
                            b.body.velocity.x -= nx * impulse * 0.25;
                            b.body.velocity.y -= ny * impulse * 0.25;
                            b.body.velocity.z -= nz * impulse * 0.25;
                        }

                        // Разведение тел
                        a.body.position.x -= nx * overlap * 0.25;
                        a.body.position.y -= ny * overlap * 0.25;
                        a.body.position.z -= nz * overlap * 0.25;
                        b.body.position.x += nx * overlap * 0.25;
                        b.body.position.y += ny * overlap * 0.25;
                        b.body.position.z += nz * overlap * 0.25;
                    }
                }
            }
        }
    }
}

function addJellyPieceToWorld({ geometry, position, quaternion, palette, velocity, angularVelocity, wobble = 0.85 }) {
    const material = createJellyMaterial(palette);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.copy(position);
    if (quaternion) mesh.quaternion.copy(quaternion);
    scene.add(mesh);

    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);

    const volume = Math.max(0.01, size.x * size.y * size.z);
    const mass = THREE.MathUtils.clamp(volume * 1.1, 0.08, 4.5);

    const body = new CANNON.Body({
        mass,
        material: jellyPhysMat,
        linearDamping: 0.22,
        angularDamping: 0.35
    });

    // Плоский прямоугольный коллайдер с опорой по граням исключает бесконечное укатывание!
    const hx = Math.max(0.04, size.x * 0.46);
    const hy = Math.max(0.04, size.y * 0.46);
    const hz = Math.max(0.04, size.z * 0.46);
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));

    body.position.set(position.x, position.y, position.z);
    if (quaternion) body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    if (velocity) body.velocity.set(velocity.x, velocity.y, velocity.z);
    if (angularVelocity) body.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);

    const pieceObj = {
        mesh,
        body,
        palette,
        size,
        center: body.position,
        boundingRadius: geometry.boundingSphere ? geometry.boundingSphere.radius : Math.max(size.x, size.y, size.z) * 0.6,
        nodes: extractSurfaceNodes(geometry, 28),
        wobbleAmp: wobble,
        squash: 0.0,
        lastImpactTime: 0
    };

    body.addEventListener('collide', (e) => {
        const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (relVel > 1.4) {
            pieceObj.wobbleAmp = Math.min(1.2, pieceObj.wobbleAmp + relVel * 0.1);
            pieceObj.squash = Math.min(0.75, relVel * 0.06);
            const now = performance.now();
            if (now - pieceObj.lastImpactTime > 100) {
                pieceObj.lastImpactTime = now;
                sound.playBounce(relVel);
            }
        }
    });

    world.addBody(body);
    jellyPieces.push(pieceObj);
    updateHUD();
    return pieceObj;
}

function removeJellyPiece(piece) {
    scene.remove(piece.mesh);
    piece.mesh.geometry.dispose();
    piece.mesh.material.dispose();
    world.removeBody(piece.body);
}

function clearAllJelly() {
    while (jellyPieces.length > 0) removeJellyPiece(jellyPieces.pop());
    updateHUD();
}

function spawnJelly(shapeType, offsetX = 0, offsetZ = 0.5, height = 4.0) {
    const rawGeom = createShapeGeometry(shapeType);
    const recentered = buildRecenteredPieceData(rawGeom.attributes.position.array, rawGeom.attributes.normal.array);
    rawGeom.dispose();
    const palette = JELLY_PALETTE[Math.floor(Math.random() * JELLY_PALETTE.length)];
    const spawnPos = new THREE.Vector3(offsetX + (Math.random() - 0.5) * 1.4, height, offsetZ + (Math.random() - 0.5) * 1.0);

    addJellyPieceToWorld({
        geometry: recentered.geometry,
        position: spawnPos,
        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.1, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.1)),
        palette,
        velocity: new THREE.Vector3(0, -1.6, 0),
        angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2),
        wobble: 0.9
    });
    sound.playSpawn();
}

function spawnRandomJelly() {
    const randomShape = ALL_SHAPES[Math.floor(Math.random() * ALL_SHAPES.length)];
    spawnJelly(randomShape);
}

// 8. НАРЕЗКА ЛИНИЕЙ ЛКМ
let isDraggingSlice = false;
const sliceStart = new THREE.Vector2();
const sliceEnd = new THREE.Vector2();
const trailParticles = [];

function resizeOverlay() { sliceOverlay.width = window.innerWidth; sliceOverlay.height = window.innerHeight; }
resizeOverlay();

canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isDraggingSlice = true;
    sliceStart.set(e.clientX, e.clientY);
    sliceEnd.set(e.clientX, e.clientY);
});

window.addEventListener('pointermove', (e) => {
    if (!isDraggingSlice) return;
    sliceEnd.set(e.clientX, e.clientY);
    trailParticles.push({ x: e.clientX, y: e.clientY, alpha: 1.0, radius: 5 + Math.random() * 4 });
});

window.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !isDraggingSlice) return;
    isDraggingSlice = false;
    sliceEnd.set(e.clientX, e.clientY);
    if (sliceStart.distanceTo(sliceEnd) > 8) performLaserSlice(sliceStart, sliceEnd);
});

window.addEventListener('pointercancel', () => { isDraggingSlice = false; });
window.addEventListener('blur', () => { isDraggingSlice = false; });

function performLaserSlice(p1Screen, p2Screen) {
    const ndc1 = new THREE.Vector3((p1Screen.x / window.innerWidth) * 2 - 1, -(p1Screen.y / window.innerHeight) * 2 + 1, 0.5).unproject(camera);
    const ndc2 = new THREE.Vector3((p2Screen.x / window.innerWidth) * 2 - 1, -(p2Screen.y / window.innerHeight) * 2 + 1, 0.5).unproject(camera);
    const worldPlane = new THREE.Plane().setFromCoplanarPoints(camera.position, ndc1, ndc2);
    if (worldPlane.normal.lengthSq() < 1e-6) return;

    const segMinX = Math.min(p1Screen.x, p2Screen.x) - 24, segMaxX = Math.max(p1Screen.x, p2Screen.x) + 24;
    const segMinY = Math.min(p1Screen.y, p2Screen.y) - 24, segMaxY = Math.max(p1Screen.y, p2Screen.y) + 24;

    const snapshot = [...jellyPieces];
    let slicedNow = 0;

    for (const piece of snapshot) {
        const centerProj = piece.mesh.position.clone().project(camera);
        if (centerProj.z > 1.0) continue;
        const sx = (centerProj.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-centerProj.y * 0.5 + 0.5) * window.innerHeight;
        if (sx < segMinX - 180 || sx > segMaxX + 180 || sy < segMinY - 180 || sy > segMaxY + 180) continue;

        const sliceResult = sliceGeometryInWorldSpace(piece.mesh, worldPlane);
        if (!sliceResult) continue;

        slicedNow++;
        totalSlicesCount++;
        spawnSyrupSplash(sliceResult.capCenter, piece.palette.base, 7);

        const parentVel = new THREE.Vector3(piece.body.velocity.x, piece.body.velocity.y, piece.body.velocity.z);
        const planeN = worldPlane.normal.clone();

        const idx = jellyPieces.indexOf(piece);
        if (idx !== -1) jellyPieces.splice(idx, 1);
        removeJellyPiece(piece);

        const pushSpeed = 0.32;
        const velPos = parentVel.clone().multiplyScalar(0.35).addScaledVector(planeN, pushSpeed);
        const velNeg = parentVel.clone().multiplyScalar(0.35).addScaledVector(planeN, -pushSpeed);
        velPos.y = Math.min(velPos.y + 0.05, 0.22);
        velNeg.y = Math.min(velNeg.y + 0.05, 0.22);

        const spinAxis = new THREE.Vector3().crossVectors(planeN, new THREE.Vector3(0, 1, 0)).normalize();
        const angPos = spinAxis.clone().multiplyScalar(-0.5);
        const angNeg = spinAxis.clone().multiplyScalar(0.5);

        const posCentroid = sliceResult.posPiece.centroid.clone().addScaledVector(planeN, 0.045);
        const negCentroid = sliceResult.negPiece.centroid.clone().addScaledVector(planeN, -0.045);

        addJellyPieceToWorld({ geometry: sliceResult.posPiece.geometry, position: posCentroid, quaternion: new THREE.Quaternion(), palette: piece.palette, velocity: velPos, angularVelocity: angPos, wobble: 0.95 });
        addJellyPieceToWorld({ geometry: sliceResult.negPiece.geometry, position: negCentroid, quaternion: new THREE.Quaternion(), palette: piece.palette, velocity: velNeg, angularVelocity: angNeg, wobble: 0.95 });
    }

    if (slicedNow > 0) {
        sound.playSlice(slicedNow);
        showComboToast(slicedNow);
        updateHUD();
    }
}

function renderSliceOverlay() {
    ctx2d.clearRect(0, 0, sliceOverlay.width, sliceOverlay.height);
    for (let i = trailParticles.length - 1; i >= 0; i--) {
        const pt = trailParticles[i]; pt.alpha -= 0.07;
        if (pt.alpha <= 0) { trailParticles.splice(i, 1); continue; }
        ctx2d.beginPath(); ctx2d.arc(pt.x, pt.y, pt.radius * pt.alpha, 0, Math.PI * 2);
        ctx2d.fillStyle = `rgba(16, 185, 129, ${pt.alpha * 0.45})`; ctx2d.fill();
    }
    if (!isDraggingSlice) return;
    ctx2d.save(); ctx2d.lineCap = 'round';
    ctx2d.beginPath(); ctx2d.moveTo(sliceStart.x, sliceStart.y); ctx2d.lineTo(sliceEnd.x, sliceEnd.y);
    ctx2d.strokeStyle = 'rgba(255, 145, 0, 0.55)'; ctx2d.lineWidth = 12; ctx2d.shadowColor = '#ff9100'; ctx2d.shadowBlur = 18; ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(sliceStart.x, sliceStart.y); ctx2d.lineTo(sliceEnd.x, sliceEnd.y);
    ctx2d.strokeStyle = '#ffffff'; ctx2d.lineWidth = 3; ctx2d.stroke();
    ctx2d.restore();
}

// 9. КНОПКИ И ГОРЯЧИЕ КЛАВИШИ (ТОЛЬКО 3 ДЕЙСТВИЯ: ПРОБЕЛ, Т, R)
const btnSpawn = document.getElementById('btn-spawn');
if (btnSpawn) btnSpawn.addEventListener('click', () => spawnRandomJelly());

const slowmoBtn = document.getElementById('btn-slowmo');
function toggleSlowMo() { isSlowMo = !isSlowMo; if (slowmoBtn) slowmoBtn.classList.toggle('active', isSlowMo); }
if (slowmoBtn) slowmoBtn.addEventListener('click', toggleSlowMo);

const btnClear = document.getElementById('btn-clear');
if (btnClear) btnClear.addEventListener('click', clearAllJelly);

function toggleFullScreen() {
    // 1. Поддержка нативного pywebview окна
    if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.toggle_fullscreen === 'function') {
        window.pywebview.api.toggle_fullscreen();
        return;
    }

    // 2. Стандартный Fullscreen API (браузеры, Edge/Chrome в режиме --app)
    const doc = document;
    const docEl = document.documentElement;
    const isFull = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFull) {
        const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
        if (req) req.call(docEl).catch(() => {});
    } else {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
        if (exit) exit.call(doc).catch(() => {});
    }
}

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'F11' || e.code === 'F11') {
        e.preventDefault();
        toggleFullScreen();
        return;
    }
    switch (e.code) {
        case 'Space':
            e.preventDefault();
            spawnRandomJelly();
            break;
        case 'KeyT':
            toggleSlowMo();
            break;
        case 'KeyR':
            clearAllJelly();
            break;
    }
});

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeOverlay();
}

window.addEventListener('resize', onWindowResize);
document.addEventListener('fullscreenchange', () => {
    setTimeout(onWindowResize, 50);
    setTimeout(onWindowResize, 150);
});
document.addEventListener('webkitfullscreenchange', () => {
    setTimeout(onWindowResize, 50);
    setTimeout(onWindowResize, 150);
});

// 10. ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ С ПОДШАГАМИ ФИЗИКИ (SUBSTEPS)
const clock = new THREE.Clock();
spawnJelly('snowflake', 0, 0.5, 3.8);

function animate() {
    requestAnimationFrame(animate);
    const rawDt = Math.min(clock.getDelta(), 0.05);
    const dt = isSlowMo ? rawDt * 0.28 : rawDt;
    const elapsed = clock.getElapsedTime();

    const mix = 0.5 + 0.5 * Math.sin(elapsed * 0.55);
    activeBgColor.lerpColors(colorSoftGreen, colorSoftOrange, mix);
    scene.fog.color.copy(activeBgColor);

    // Подшаги физики: расчет коллизий желе-желе и стабильной опоры о доску
    const SUBSTEPS = 3;
    const subDt = dt / SUBSTEPS;
    for (let step = 0; step < SUBSTEPS; step++) {
        world.step(isSlowMo ? (1 / 180) / SUBSTEPS : (1 / 60) / SUBSTEPS, subDt, 2);
        for (let i = 0; i < jellyPieces.length; i++) {
            updateJellyNodesAndBoardFriction(jellyPieces[i]);
        }
        resolveJellyToJellyCollisions(jellyPieces);
    }

    controls.update();

    for (let i = syrupDrops.length - 1; i >= 0; i--) {
        const d = syrupDrops[i];
        d.vel.y -= 18.0 * dt; d.mesh.position.addScaledVector(d.vel, dt);
        d.life -= dt * 1.5; d.mesh.scale.setScalar(Math.max(0.01, d.life));
        if (d.life <= 0 || d.mesh.position.y < -0.2) { scene.remove(d.mesh); syrupDrops.splice(i, 1); }
    }

    for (let i = 0; i < jellyPieces.length; i++) {
        const p = jellyPieces[i];
        if (p.body.position.y < -3.0) {
            p.body.position.set(0, 3.0, 0.5);
            p.body.velocity.set(0, 0, 0);
        }
        p.mesh.position.copy(p.body.position);
        p.mesh.quaternion.copy(p.body.quaternion);

        // Упругая тряска желе и сохранение объёма (формулы и демпфирование шейдера строго сохранены!)
        p.wobbleAmp = Math.max(0.0, p.wobbleAmp * Math.exp(-3.6 * dt));
        p.squash = Math.max(0.0, p.squash * Math.exp(-8.0 * dt));
        const u = p.mesh.material.uniforms;
        u.uTime.value = elapsed;
        u.uWobbleAmp.value = p.wobbleAmp;
        u.uSquash.value = p.squash;
    }

    renderer.render(scene, camera);
    renderSliceOverlay();
}
animate();
