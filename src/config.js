// 그래픽 품질 프리셋
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

export const QUALITY = {
  low: {
    name: '낮음', pixelRatio: Math.min(dpr, 1), shadow: 1024, shadowRange: 70,
    reflection: false, reflScale: 0.4, msaa: 0, fxaa: true, rays: false, bloom: true, envEvery: 10, treeDensity: 0.6, grass: 14000, leaves: 0.5,
  },
  mid: {
    name: '중간', pixelRatio: Math.min(dpr, 1.25), shadow: 2048, shadowRange: 100,
    reflection: true, reflScale: 0.5, msaa: 0, fxaa: true, rays: true, bloom: true, envEvery: 5, treeDensity: 1.0, grass: 36000, leaves: 1,
  },
  high: {
    name: '높음', pixelRatio: Math.min(dpr, 1.75), shadow: 4096, shadowRange: 130,
    reflection: true, reflScale: 0.6, msaa: 4, fxaa: false, rays: true, bloom: true, envEvery: 2.5, treeDensity: 1.0, grass: 64000, leaves: 1,
  },
};

export const SAVE_KEY = 'oneul-hangang.v1';
