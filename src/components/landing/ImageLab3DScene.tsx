import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type PipelineStageId = 'preprocess' | 'features' | 'svd' | 'pca';
export type CameraPreset = 'isometric' | 'svd' | 'features' | 'pca';

interface ImageLab3DSceneProps {
  selectedStage: PipelineStageId;
  onSelectStage: (stage: PipelineStageId) => void;
  explodeAmount: number; // 0 to 1
  cameraPreset: CameraPreset;
  autoOrbit: boolean;
  onUserOrbit?: () => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    const gl =
      (testCanvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (testCanvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|Software|ANGLE.*Direct3D.*WARP|Basic Render Driver/i.test(renderer);
  } catch {
    return true;
  }
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r);
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function createTileTexture(label: string, sublabel: string, accent: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = accent ? '#1A2D3A' : '#121B22';
  ctx.fillRect(0, 0, 256, 256);

  // Crisp micro-grid background
  ctx.strokeStyle = 'rgba(143, 163, 179, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 32; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 16);
    ctx.lineTo(i, 240);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, i);
    ctx.lineTo(240, i);
    ctx.stroke();
  }

  // Subtle corner brackets
  ctx.strokeStyle = accent ? '#FE7F2D' : '#3C627A';
  ctx.lineWidth = 4;
  const b = 18;
  const l = 28;
  ctx.beginPath();
  ctx.moveTo(b, b + l);
  ctx.lineTo(b, b);
  ctx.lineTo(b + l, b);
  ctx.moveTo(256 - b - l, b);
  ctx.lineTo(256 - b, b);
  ctx.lineTo(256 - b, b + l);
  ctx.moveTo(b, 256 - b - l);
  ctx.lineTo(b, 256 - b);
  ctx.lineTo(b + l, 256 - b);
  ctx.moveTo(256 - b - l, 256 - b);
  ctx.lineTo(256 - b, 256 - b);
  ctx.lineTo(256 - b, 256 - b - l);
  ctx.stroke();

  // Indicator bar
  ctx.fillStyle = accent ? '#FE7F2D' : '#6A8FAD';
  ctx.fillRect(42, 48, 52, 6);

  // Label text
  ctx.fillStyle = '#EAECEF';
  ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 42, 138);

  ctx.fillStyle = accent ? '#FFB07A' : '#8FA3B3';
  ctx.font = '500 21px "JetBrains Mono", monospace';
  ctx.fillText(sublabel, 42, 182);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createPhantomMatrixTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090D12';
  ctx.fillRect(0, 0, 256, 256);

  // Concentric phantom ellipses (Shepp-Logan inspired grayscale matrix)
  ctx.strokeStyle = 'rgba(234, 236, 239, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(128, 128, 86, 102, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1E3140';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(128, 128, 72, 86, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#111A22';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(104, 118, 18, 36, 0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#4B718B';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(152, 122, 16, 30, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#6A8FAD';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(128, 164, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#FE7F2D';
  ctx.fill();

  // Pixel matrix grid overlay
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSvdPlaneTexture(symbol: string, subtitle: string, mode: 'U' | 'S' | 'V'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = mode === 'S' ? 'rgba(20, 29, 36, 0.92)' : 'rgba(17, 27, 35, 0.88)';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle matrix grid
  const step = 48;
  ctx.strokeStyle = mode === 'S' ? 'rgba(254, 127, 45, 0.22)' : 'rgba(118, 149, 184, 0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 32; i <= 480; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 32);
    ctx.lineTo(i, 480);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(32, i);
    ctx.lineTo(480, i);
    ctx.stroke();
  }

  if (mode === 'U') {
    // Orthogonal column basis stripes
    for (let col = 0; col < 6; col++) {
      const x = 68 + col * 64;
      const alpha = Math.max(0.16, 0.85 - col * 0.12);
      ctx.fillStyle = `rgba(118, 149, 184, ${alpha})`;
      ctx.fillRect(x, 120, 24, 310);
    }
  } else if (mode === 'S') {
    // Singular value diagonal descending energy blocks
    for (let k = 0; k < 7; k++) {
      const pos = 84 + k * 54;
      const size = Math.max(12, 42 - k * 4.5);
      const alpha = Math.max(0.25, 1.0 - k * 0.11);
      ctx.fillStyle = `rgba(254, 127, 45, ${alpha})`;
      ctx.fillRect(pos, pos, size, size);
    }
  } else {
    // Orthogonal row basis stripes
    for (let row = 0; row < 6; row++) {
      const y = 112 + row * 58;
      const alpha = Math.max(0.18, 0.85 - row * 0.12);
      ctx.fillStyle = `rgba(143, 184, 214, ${alpha})`;
      ctx.fillRect(72, y, 368, 20);
    }
  }

  // Border frame
  ctx.strokeStyle = mode === 'S' ? '#FE7F2D' : '#3E657E';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 492);

  // Header badge text
  ctx.fillStyle = mode === 'S' ? '#FE7F2D' : '#EAECEF';
  ctx.font = '800 52px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(symbol, 34, 82);

  ctx.fillStyle = '#9BB0C1';
  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.fillText(subtitle, 130, 74);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  isometric: { pos: [8.8, 7.6, 9.6], target: [0.0, 0.7, 0.0] },
  svd: { pos: [4.8, 5.2, 5.6], target: [0.0, 1.7, 0.0] },
  features: { pos: [0.2, 7.2, 5.4], target: [0.0, 0.4, 0.2] },
  pca: { pos: [8.2, 4.6, 2.2], target: [3.2, 0.8, -1.6] },
};

export const ImageLab3DScene: React.FC<ImageLab3DSceneProps> = ({
  selectedStage,
  onSelectStage,
  explodeAmount,
  cameraPreset,
  autoOrbit,
  onUserOrbit,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const propsRef = useRef({
    selectedStage,
    explodeAmount,
    cameraPreset,
    autoOrbit,
    onSelectStage,
    onUserOrbit,
  });
  propsRef.current = {
    selectedStage,
    explodeAmount,
    cameraPreset,
    autoOrbit,
    onSelectStage,
    onUserOrbit,
  };

  const presetDirtyRef = useRef(false);
  useEffect(() => {
    presetDirtyRef.current = true;
  }, [cameraPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: isSoftwareGl ? 'default' : 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (!isSoftwareGl) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.cursor = 'grab';

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090b0e, 0.024);

    // PMREM RoomEnvironment for crisp anodized metallic reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.65;

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.isometric.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.isometric.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 5.5;
    controls.maxDistance = 20;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.update();

    let cameraTransitionActive = false;
    const desiredCamPos = new THREE.Vector3(...CAMERA_PRESETS.isometric.pos);
    const desiredTarget = new THREE.Vector3(...CAMERA_PRESETS.isometric.target);

    const onControlStart = () => {
      cameraTransitionActive = false;
      renderer.domElement.style.cursor = 'grabbing';
      propsRef.current.onUserOrbit?.();
    };
    const onControlEnd = () => {
      renderer.domElement.style.cursor = 'grab';
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('end', onControlEnd);

    // Three-point studio lighting (warm signal-orange key, cool teal fill, rim)
    const ambientLight = new THREE.AmbientLight(0xd9e6f2, 0.45);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff1e6, 1.85);
    keyLight.position.set(8, 13, 8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 35;
      keyLight.shadow.camera.left = -9;
      keyLight.shadow.camera.right = 9;
      keyLight.shadow.camera.top = 9;
      keyLight.shadow.camera.bottom = -9;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x5282a4, 0.95);
    fillLight.position.set(-9, 6, -5);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xfe7f2d, 2.2, 16, 1.6);
    rimLight.position.set(0.4, 3.6, 0.4);
    scene.add(rimLight);

    // Track geometries, materials, textures for strict cleanup
    const disposables: Array<{ dispose: () => void }> = [pmremGenerator, envTexture];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    // Architectural base floor + subtle isometric engineering grid
    const floorMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x090b0e,
        roughness: 0.92,
        metalness: 0.08,
      })
    );
    const floorMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(50, 50)), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.65;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    const gridHelper = new THREE.GridHelper(32, 32, 0x233d4d, 0x13202a);
    gridHelper.position.y = -0.64;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.42;
    scene.add(gridHelper);

    // Reusable PBR palette materials
    const obsidianMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x10171e,
        roughness: 0.42,
        metalness: 0.65,
      })
    );
    const tealAnodizedMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x233d4d,
        roughness: 0.34,
        metalness: 0.72,
      })
    );
    const darkDeckMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x141f28,
        roughness: 0.5,
        metalness: 0.48,
      })
    );
    const orangeGlowMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfe7f2d,
        emissive: 0xfe7f2d,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.3,
      })
    );
    const slateAccentMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x5c7f9e,
        emissive: 0x233d4d,
        emissiveIntensity: 0.35,
        roughness: 0.38,
        metalness: 0.55,
      })
    );

    const interactiveGroups: Record<PipelineStageId, THREE.Group> = {
      preprocess: new THREE.Group(),
      features: new THREE.Group(),
      svd: new THREE.Group(),
      pca: new THREE.Group(),
    };

    const pickables: THREE.Object3D[] = [];
    const registerPickable = (mesh: THREE.Object3D, stage: PipelineStageId) => {
      mesh.userData.stageId = stage;
      pickables.push(mesh);
    };

    // =========================================================================
    // STAGE 1: INPUT IMAGE MATRIX NODE (Preprocess) — Left Isometric
    // =========================================================================
    const inputGroup = interactiveGroups.preprocess;
    inputGroup.position.set(-4.3, 0.05, 2.3);
    scene.add(inputGroup);

    const inputBaseGeo = track(new THREE.BoxGeometry(1.75, 0.95, 1.75));
    const inputBase = new THREE.Mesh(inputBaseGeo, obsidianMat);
    inputBase.castShadow = !isSoftwareGl;
    inputBase.receiveShadow = !isSoftwareGl;
    registerPickable(inputBase, 'preprocess');
    inputGroup.add(inputBase);

    const inputCollarGeo = track(new THREE.BoxGeometry(1.82, 0.12, 1.82));
    const inputCollar = new THREE.Mesh(inputCollarGeo, tealAnodizedMat);
    inputCollar.position.y = 0.42;
    inputGroup.add(inputCollar);

    const phantomTex = track(createPhantomMatrixTexture());
    const phantomMat = track(
      new THREE.MeshStandardMaterial({
        map: phantomTex,
        roughness: 0.25,
        metalness: 0.2,
      })
    );
    const phantomPlate = new THREE.Mesh(track(new THREE.PlaneGeometry(1.48, 1.48)), phantomMat);
    phantomPlate.rotation.x = -Math.PI / 2;
    phantomPlate.position.y = 0.5;
    registerPickable(phantomPlate, 'preprocess');
    inputGroup.add(phantomPlate);

    // Animated optical scan laser bar across the input matrix
    const scanBar = new THREE.Mesh(track(new THREE.BoxGeometry(1.46, 0.035, 0.045)), orangeGlowMat);
    scanBar.position.set(0, 0.54, 0);
    inputGroup.add(scanBar);

    // Front orange status port dot
    const portDotGeo = track(new THREE.SphereGeometry(0.065, 16, 16));
    const inputPort = new THREE.Mesh(portDotGeo, orangeGlowMat);
    inputPort.position.set(0.89, 0.05, -0.35);
    inputGroup.add(inputPort);

    // =========================================================================
    // STAGE 2: CENTRAL 3x3 FEATURE EXTRACTION DECK — Center Hero
    // =========================================================================
    const featureGroup = interactiveGroups.features;
    featureGroup.position.set(0, 0.25, 0);
    scene.add(featureGroup);

    // Extruded beveled hero chassis plate (signature Surfsky-inspired silhouette in #233D4D + #FE7F2D)
    const deckShape = createRoundedRectShape(4.6, 4.6, 0.42);
    const deckBevelGeo = track(
      new THREE.ExtrudeGeometry(deckShape, {
        depth: 0.26,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelSegments: 3,
      })
    );
    deckBevelGeo.rotateX(Math.PI / 2);
    const deckFrame = new THREE.Mesh(deckBevelGeo, tealAnodizedMat);
    deckFrame.position.y = 0.05;
    deckFrame.castShadow = !isSoftwareGl;
    deckFrame.receiveShadow = !isSoftwareGl;
    registerPickable(deckFrame, 'features');
    featureGroup.add(deckFrame);

    // Recessed obsidian top deck
    const innerDeckShape = createRoundedRectShape(4.32, 4.32, 0.32);
    const innerDeckGeo = track(
      new THREE.ExtrudeGeometry(innerDeckShape, {
        depth: 0.14,
        bevelEnabled: false,
      })
    );
    innerDeckGeo.rotateX(Math.PI / 2);
    const innerDeck = new THREE.Mesh(innerDeckGeo, darkDeckMat);
    innerDeck.position.y = 0.16;
    innerDeck.receiveShadow = !isSoftwareGl;
    registerPickable(innerDeck, 'features');
    featureGroup.add(innerDeck);

    // Signature thin orange edge strip along the front-right perimeter bevel
    const trimBar1 = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 0.06, 0.05)), orangeGlowMat);
    trimBar1.position.set(0, -0.1, 2.38);
    featureGroup.add(trimBar1);

    const trimBar2 = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.06, 3.8)), orangeGlowMat);
    trimBar2.position.set(2.38, -0.1, 0);
    featureGroup.add(trimBar2);

    // 3x3 Feature Extractor Tiles (real ImageLab 22-dim domains)
    const tileConfigs = [
      { label: 'STATS', sub: 'μ σ γ H', accent: false },
      { label: 'GLCM', sub: 'Texture', accent: false },
      { label: 'LBP', sub: 'Micro-pat', accent: false },
      { label: 'SOBEL', sub: 'Gradient', accent: false },
      { label: 'SVD Σ', sub: 'Rank-k', accent: true },
      { label: 'CANNY', sub: 'Contours', accent: false },
      { label: 'SHAPE', sub: 'Hu / Area', accent: false },
      { label: '2D DCT', sub: 'Spectral', accent: false },
      { label: 'HAAR', sub: 'Wavelet', accent: false },
    ];

    const tileGeo = track(new THREE.BoxGeometry(1.16, 0.12, 1.16));
    const tileMeshes: THREE.Mesh[] = [];

    tileConfigs.forEach((cfg, idx) => {
      const row = Math.floor(idx / 3);
      const col = idx % 3;
      const tex = track(createTileTexture(cfg.label, cfg.sub, cfg.accent));
      const topMat = track(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.35,
          metalness: 0.3,
        })
      );
      const tile = new THREE.Mesh(tileGeo, [
        obsidianMat,
        obsidianMat,
        topMat,
        obsidianMat,
        obsidianMat,
        obsidianMat,
      ]);
      tile.position.set((col - 1) * 1.32, 0.24, (row - 1) * 1.32);
      tile.castShadow = !isSoftwareGl;
      tile.userData.baseY = 0.24;
      tile.userData.tileIndex = idx;
      registerPickable(tile, idx === 4 ? 'svd' : 'features');
      featureGroup.add(tile);
      tileMeshes.push(tile);
    });

    // Sub-deck cohort shadow pods (echoing the layered architectural depth below the main cluster)
    const podMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x0f1820,
        roughness: 0.7,
        metalness: 0.4,
        transparent: true,
        opacity: 0.75,
      })
    );
    const podGeo = track(new THREE.BoxGeometry(1.75, 0.08, 1.75));
    const podOffsets: Array<[number, number, number]> = [
      [-1.1, -0.68, 1.1],
      [1.1, -0.68, 1.1],
      [-1.1, -0.68, -1.1],
      [1.1, -0.68, -1.1],
    ];
    podOffsets.forEach(([px, py, pz]) => {
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.position.set(px, py, pz);
      featureGroup.add(pod);
    });

    // =========================================================================
    // STAGE 3: FLOATING SVD DECOMPOSITION PLANES (U · Σ · Vᵀ) — Vertical Explode
    // =========================================================================
    const svdGroup = interactiveGroups.svd;
    svdGroup.position.set(0, 0.85, 0);
    scene.add(svdGroup);

    const planeGeo = track(new THREE.BoxGeometry(3.2, 0.055, 3.2));
    const svdSpecs: Array<{ sym: string; sub: string; mode: 'U' | 'S' | 'V'; baseY: number; maxY: number }> = [
      { sym: 'Vᵀ', sub: 'Right Basis', mode: 'V', baseY: 0.38, maxY: 1.05 },
      { sym: 'Σ', sub: 'Singular Energy', mode: 'S', baseY: 0.82, maxY: 2.05 },
      { sym: 'U', sub: 'Left Basis', mode: 'U', baseY: 1.26, maxY: 3.05 },
    ];

    const svdMeshes: Array<{ mesh: THREE.Mesh; baseY: number; maxY: number; mode: 'U' | 'S' | 'V' }> = [];

    svdSpecs.forEach(spec => {
      const tex = track(createSvdPlaneTexture(spec.sym, spec.sub, spec.mode));
      const mat = track(
        new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          opacity: spec.mode === 'S' ? 0.92 : 0.78,
          roughness: 0.22,
          metalness: 0.35,
          emissive: spec.mode === 'S' ? 0xfe7f2d : 0x233d4d,
          emissiveIntensity: spec.mode === 'S' ? 0.22 : 0.15,
        })
      );
      const plane = new THREE.Mesh(planeGeo, mat);
      plane.position.y = spec.baseY;
      registerPickable(plane, 'svd');
      svdGroup.add(plane);
      svdMeshes.push({ mesh: plane, baseY: spec.baseY, maxY: spec.maxY, mode: spec.mode });
    });

    // 4 thin vertical alignment laser posts linking the SVD layers
    const postGeo = track(new THREE.CylinderGeometry(0.018, 0.018, 1, 8));
    const postMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xfe7f2d,
        transparent: true,
        opacity: 0.45,
      })
    );
    const svdPosts: THREE.Mesh[] = [];
    [
      [-1.45, -1.45],
      [1.45, -1.45],
      [-1.45, 1.45],
      [1.45, 1.45],
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 0.9, pz);
      svdGroup.add(post);
      svdPosts.push(post);
    });

    // =========================================================================
    // STAGE 4: PCA SUBSPACE & EXPERIMENT REGISTRY NODE — Back-Right Isometric
    // =========================================================================
    const pcaGroup = interactiveGroups.pca;
    pcaGroup.position.set(4.3, 0.12, -2.25);
    scene.add(pcaGroup);

    const pcaBase = new THREE.Mesh(track(new THREE.BoxGeometry(1.85, 0.85, 1.85)), obsidianMat);
    pcaBase.castShadow = !isSoftwareGl;
    pcaBase.receiveShadow = !isSoftwareGl;
    registerPickable(pcaBase, 'pca');
    pcaGroup.add(pcaBase);

    const pcaRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.68, 0.04, 12, 48)), tealAnodizedMat);
    pcaRing.rotation.x = Math.PI / 2;
    pcaRing.position.y = 0.55;
    pcaGroup.add(pcaRing);

    // 3D Orthogonal Principal Component Axes spinning smoothly inside a floating subspace
    const pcAxesGroup = new THREE.Group();
    pcAxesGroup.position.set(0, 1.15, 0);
    pcaGroup.add(pcAxesGroup);

    const pc1Axis = new THREE.Mesh(track(new THREE.CylinderGeometry(0.032, 0.032, 1.35, 10)), orangeGlowMat);
    pc1Axis.rotation.z = Math.PI / 3;
    pcAxesGroup.add(pc1Axis);

    const pc2Axis = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 10)), slateAccentMat);
    pc2Axis.rotation.x = Math.PI / 3;
    pcAxesGroup.add(pc2Axis);

    const pc3Axis = new THREE.Mesh(track(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 10)), tealAnodizedMat);
    pcAxesGroup.add(pc3Axis);

    const pcCoreSphere = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.22, 0)), orangeGlowMat);
    registerPickable(pcCoreSphere, 'pca');
    pcAxesGroup.add(pcCoreSphere);

    // Secondary SQLite / Report Output Tablet (mid-right)
    const reportTablet = new THREE.Mesh(track(new THREE.BoxGeometry(1.9, 0.14, 0.92)), tealAnodizedMat);
    reportTablet.position.set(0.3, -0.35, 2.75);
    reportTablet.rotation.y = -Math.PI / 6;
    registerPickable(reportTablet, 'pca');
    pcaGroup.add(reportTablet);

    const reportStrip = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.04, 0.16)), orangeGlowMat);
    reportStrip.position.set(0.3, -0.26, 2.75);
    reportStrip.rotation.y = -Math.PI / 6;
    pcaGroup.add(reportStrip);

    // =========================================================================
    // SIGNAL BUS TRACES & ANIMATED INSTANCED DATA PACKETS
    // =========================================================================
    const tracePaths: THREE.CatmullRomCurve3[] = [
      // Input Node -> Central Feature Deck
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.4, 0.08, 2.0),
        new THREE.Vector3(-2.6, 0.08, 1.5),
        new THREE.Vector3(-2.2, 0.08, 0.95),
      ]),
      // Central Deck -> PCA Subspace Hub
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(2.2, 0.08, -0.95),
        new THREE.Vector3(2.9, 0.08, -1.45),
        new THREE.Vector3(3.4, 0.08, -1.9),
      ]),
      // PCA Hub -> Report / SQLite Tablet
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(4.5, -0.1, -1.3),
        new THREE.Vector3(4.95, -0.15, -0.35),
        new THREE.Vector3(4.65, -0.2, 0.4),
      ]),
      // Return Feedback Loop: Report Tablet -> Input Matrix
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(3.7, -0.32, 1.05),
        new THREE.Vector3(1.1, -0.32, 3.65),
        new THREE.Vector3(-1.7, -0.32, 3.5),
        new THREE.Vector3(-3.55, -0.25, 2.6),
      ]),
    ];

    const traceMat = track(
      new THREE.MeshBasicMaterial({
        color: 0x385e76,
        transparent: true,
        opacity: 0.78,
      })
    );
    tracePaths.forEach(curve => {
      const tubeGeo = track(new THREE.TubeGeometry(curve, 24, 0.022, 6, false));
      const tube = new THREE.Mesh(tubeGeo, traceMat);
      scene.add(tube);
    });

    const packetCount = 16;
    const packetGeo = track(new THREE.SphereGeometry(0.068, 10, 10));
    const packetMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xfe7f2d,
      })
    );
    const packetInstanced = new THREE.InstancedMesh(packetGeo, packetMat, packetCount);
    scene.add(packetInstanced);

    // Pre-allocated scratch objects (zero allocations inside render loop)
    const dummyMatrix = new THREE.Matrix4();
    const packetPos = new THREE.Vector3();
    const packetScale = new THREE.Vector3(1, 1, 1);
    const packetQuat = new THREE.Quaternion();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let hoveredStage: PipelineStageId | null = null;
    let lastRaycastMs = 0;

    const updatePointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / (rect.height || 1)) * 2 + 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastMs < 50) return;
      lastRaycastMs = now;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (hits.length > 0) {
        const st = hits[0].object.userData.stageId as PipelineStageId | undefined;
        hoveredStage = st ?? null;
        renderer.domElement.style.cursor = 'pointer';
      } else {
        hoveredStage = null;
        renderer.domElement.style.cursor = 'grab';
      }
    };

    let pointerDownX = 0;
    let pointerDownY = 0;
    const onPointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (dist > 6) return; // Dragged orbit, not a click
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (hits.length > 0) {
        const st = hits[0].object.userData.stageId as PipelineStageId | undefined;
        if (st) {
          propsRef.current.onSelectStage(st);
        }
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    const onContextRestored = () => {
      renderer.render(scene, camera);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // ResizeObserver for crisp container responsiveness
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.max(100, Math.floor(entry.contentRect.width));
        const h = Math.max(100, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Software WebGL safe pacing helper (gl.fenceSync)
    let disposed = false;
    let rafId = 0;
    let timeoutId = 0;
    const glContext = renderer.getContext() as WebGL2RenderingContext;
    const hasFenceSync = typeof glContext.fenceSync === 'function';

    const afterDraw = (next: () => void) => {
      if (disposed) return;
      if (!isSoftwareGl || !hasFenceSync) {
        rafId = requestAnimationFrame(next);
        return;
      }
      const sync = glContext.fenceSync(glContext.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        timeoutId = window.setTimeout(next, 32);
        return;
      }
      glContext.flush();
      const poll = () => {
        if (disposed) {
          glContext.deleteSync(sync);
          return;
        }
        const status = glContext.clientWaitSync(sync, 0, 0);
        if (status === glContext.TIMEOUT_EXPIRED) {
          timeoutId = window.setTimeout(poll, 16);
        } else {
          glContext.deleteSync(sync);
          rafId = requestAnimationFrame(next);
        }
      };
      timeoutId = window.setTimeout(poll, 16);
    };

    const clock = new THREE.Clock();
    let elapsed = 0;
    let currentExplode = propsRef.current.explodeAmount;

    const tick = () => {
      if (disposed) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      const { selectedStage: activeStage, explodeAmount: targetExplode, cameraPreset: preset, autoOrbit: orbitOn } =
        propsRef.current;

      // Apply requested camera preset smoothly
      if (presetDirtyRef.current) {
        presetDirtyRef.current = false;
        const cfg = CAMERA_PRESETS[preset];
        desiredCamPos.set(...cfg.pos);
        desiredTarget.set(...cfg.target);
        cameraTransitionActive = true;
      }

      if (cameraTransitionActive) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, 4.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, 4.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, 4.5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTarget.x, 4.5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredTarget.y, 4.5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredTarget.z, 4.5, dt);
        if (camera.position.distanceTo(desiredCamPos) < 0.04) {
          cameraTransitionActive = false;
        }
      }

      controls.autoRotate = orbitOn && !cameraTransitionActive;
      controls.autoRotateSpeed = 0.55;
      controls.update();

      // Smooth damped explode factor for SVD decomposition planes
      currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 5.2, dt);

      svdMeshes.forEach((entry, idx) => {
        const hoverBoost = activeStage === 'svd' || hoveredStage === 'svd' ? 0.14 : 0;
        const bob = Math.sin(elapsed * 1.4 + idx * 0.9) * 0.04;
        const targetY = THREE.MathUtils.lerp(entry.baseY, entry.maxY, currentExplode) + hoverBoost + bob;
        entry.mesh.position.y = targetY;
      });

      // Stretch vertical alignment posts to bridge the top and bottom SVD planes
      const bottomY = svdMeshes[0].mesh.position.y;
      const topY = svdMeshes[2].mesh.position.y;
      const span = Math.max(0.2, topY - bottomY);
      const midY = (bottomY + topY) / 2;
      svdPosts.forEach(p => {
        p.scale.y = span;
        p.position.y = midY;
      });

      // Gentle highlight lift on hovered or selected pipeline stage
      const preTargetY = activeStage === 'preprocess' || hoveredStage === 'preprocess' ? 0.28 : 0.05;
      inputGroup.position.y = THREE.MathUtils.damp(inputGroup.position.y, preTargetY, 6, dt);

      const pcaTargetY = activeStage === 'pca' || hoveredStage === 'pca' ? 0.34 : 0.12;
      pcaGroup.position.y = THREE.MathUtils.damp(pcaGroup.position.y, pcaTargetY, 6, dt);

      // Subtle living wave on the 3x3 feature extraction tiles
      const featBoost = activeStage === 'features' || hoveredStage === 'features' ? 0.1 : 0;
      tileMeshes.forEach((tile, i) => {
        const wave = Math.sin(elapsed * 1.9 + i * 0.55) * 0.025;
        const targetTileY = (tile.userData.baseY as number) + wave + featBoost;
        tile.position.y = THREE.MathUtils.damp(tile.position.y, targetTileY, 6, dt);
      });

      // Optical scan line sweeping the input phantom matrix
      scanBar.position.z = Math.sin(elapsed * 1.8) * 0.64;

      // Orthogonal PCA subspace gyroscopic rotation
      pcAxesGroup.rotation.y = elapsed * 0.55;
      pcAxesGroup.rotation.x = Math.sin(elapsed * 0.6) * 0.18;

      // Animated data packets gliding along the 4 signal traces
      for (let i = 0; i < packetCount; i++) {
        const curveIdx = i % tracePaths.length;
        const phase = (elapsed * 0.28 + i * 0.24) % 1;
        tracePaths[curveIdx].getPointAt(phase, packetPos);
        const pulse = 0.85 + Math.sin(elapsed * 5 + i) * 0.2;
        packetScale.set(pulse, pulse, pulse);
        dummyMatrix.compose(packetPos, packetQuat, packetScale);
        packetInstanced.setMatrixAt(i, dummyMatrix);
      }
      packetInstanced.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);
      afterDraw(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('end', onControlEnd);
      controls.dispose();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposables.forEach(d => {
        try {
          d.dispose();
        } catch {
          // Ignore already disposed
        }
      });
      renderer.dispose();
    };
  }, []);

  if (webglFailed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#090B0E] text-[#8FA3B3] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl border border-[#233D4D] bg-[#111920] flex items-center justify-center mb-4">
          <span className="font-mono text-lg font-bold text-[#FE7F2D]">UΣVᵀ</span>
        </div>
        <p className="text-sm font-medium text-[#EAECEF]">Interactive 3D Tensor Pipeline</p>
        <p className="text-xs text-[#8FA3B3] mt-1 max-w-xs">
          WebGL hardware acceleration is unavailable in this browser context. Launch the workspace directly to run OpenCV, PCA, and SVD analysis.
        </p>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full touch-none select-none" aria-label="Interactive 3D ImageLab mathematical pipeline visualization" />;
};
