// 수면에 퍼지는 동심원(물수제비, 물고기가 튈 때).
import * as THREE from 'three';

export class Ripples {
  constructor(ctx, n = 28) {
    this.n = n; this.i = 0;
    this.data = new Float32Array(n * 4).fill(-100);
    const g = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(2, 2);
    plane.rotateX(-Math.PI / 2);
    g.setAttribute('position', plane.getAttribute('position'));
    g.setAttribute('uv', plane.getAttribute('uv'));
    g.setIndex(plane.getIndex());
    this.attr = new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aR', this.attr);
    g.instanceCount = n;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: ctx.uniforms.uTime, uCol: ctx.uniforms.uFoamCol },
      vertexShader: /* glsl */ `
        attribute vec4 aR; // x, z, 시작 시각, 크기
        uniform float uTime;
        varying vec2 vUv; varying float vAge;
        void main() {
          float age = (uTime - aR.z) / 2.2;
          vAge = age;
          vUv = uv;
          float r = aR.w * (0.25 + 1.6 * sqrt(clamp(age, 0.0, 1.0)));
          vec3 p = vec3(aR.x + position.x * r, 0.035, aR.y + position.z * r);
          if (age < 0.0 || age > 1.0) p.y = -20.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying vec2 vUv; varying float vAge;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.1, 0.0, abs(r - 0.82)) + 0.6 * smoothstep(0.08, 0.0, abs(r - 0.5));
          gl_FragColor = vec4(uCol, ring * (1.0 - vAge) * 0.6);
        }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.layers.set(1);
    this.time = ctx.uniforms.uTime;
    ctx.scene.add(this.mesh);
  }

  add(x, z, size = 1) {
    this.data.set([x, z, this.time.value, size], this.i * 4);
    this.i = (this.i + 1) % this.n;
    this.attr.needsUpdate = true;
  }
}
