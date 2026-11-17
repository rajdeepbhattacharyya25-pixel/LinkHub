import React, { useEffect, useRef, useState } from 'react';
import type { DesignSystemConfig, ProfileConfig } from '../data/profileData';
import {
  DEFAULT_LOADING_SCREEN_DURATION_MS,
  SIGNATURE_ANIMATION_DURATION_MS,
  clamp01,
  computePortraitSketchAlpha,
  computeSignatureInkAlpha,
  computeSignatureRevealFactor,
  resolveLoadingFullName,
  shouldHoldLoadingScreen,
} from '../utils/loadingScreenLogic';
import portraitSketchUrl from '../assets/images/rajdeep_portrait_outline_sketch_1794936563890.jpg';
import signatureImageUrl from '../assets/images/rajdeep_signature.png';

interface PortraitLoadingScreenProps {
  profile: ProfileConfig;
  designSystem: DesignSystemConfig;
  durationMs?: number;
  onComplete: () => void;
}

function hexToRgbTuple(hex: string, fallback: [number, number, number]): [number, number, number] {
  const clean = (hex || '').trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return fallback;
}

let cachedProcessedPortraitCanvas: HTMLCanvasElement | null = null;
let cachedPortraitColorKey = '';

interface CachedSignatureMask {
  width: number;
  height: number;
  alphas: Float32Array;
}

let cachedSignatureMask: CachedSignatureMask | null = null;

export const PortraitLoadingScreen: React.FC<PortraitLoadingScreenProps> = ({
  profile,
  designSystem,
  durationMs = DEFAULT_LOADING_SCREEN_DURATION_MS,
  onComplete,
}) => {
  const [exiting, setExiting] = useState(false);
  const [sketchReady, setSketchReady] = useState(false);
  const [signatureReady, setSignatureReady] = useState(false);
  const [progressStarted, setProgressStarted] = useState(false);

  const portraitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const fullName = resolveLoadingFullName(profile);
  const paperHex = designSystem.cardBg || '#F4EDE2';
  const strokeHex = designSystem.innerCardBg || '#FAF6F0';
  const secondaryHex = designSystem.borderColor || '#D5C4AE';
  const accentHex = designSystem.accentSecondary || '#A88462';

  // Fallback readiness guard so slow asset decode never blocks the 1.5s splash cycle
  useEffect(() => {
    if (sketchReady && signatureReady) return;
    const fallbackTimer = window.setTimeout(() => {
      setSketchReady(true);
      setSignatureReady(true);
    }, 280);
    return () => window.clearTimeout(fallbackTimer);
  }, [sketchReady, signatureReady]);

  // Run the 1.5-second (1500ms) loading screen timer once assets are ready
  useEffect(() => {
    if (!sketchReady) return;
    const rafId = window.requestAnimationFrame(() => {
      setProgressStarted(true);
    });

    if (typeof window !== 'undefined' && shouldHoldLoadingScreen(window.location.search)) {
      return () => window.cancelAnimationFrame(rafId);
    }

    const fadeOutAt = Math.max(200, durationMs - 180);
    const fadeTimer = window.setTimeout(() => {
      setExiting(true);
    }, fadeOutAt);

    const doneTimer = window.setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
      }
    }, durationMs);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [sketchReady, durationMs]);

  // 1. Render the portrait outline sketch at native 1:1 resolution over the textured background
  useEffect(() => {
    let cancelled = false;
    const targetCanvas = portraitCanvasRef.current;
    if (!targetCanvas) return;

    const colorKey = `${paperHex}|${strokeHex}`;
    if (cachedProcessedPortraitCanvas && cachedPortraitColorKey === colorKey) {
      const ctx = targetCanvas.getContext('2d');
      if (ctx) {
        targetCanvas.width = cachedProcessedPortraitCanvas.width;
        targetCanvas.height = cachedProcessedPortraitCanvas.height;
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.drawImage(cachedProcessedPortraitCanvas, 0, 0);
        setSketchReady(true);
        return;
      }
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !portraitCanvasRef.current) return;

      const size = img.naturalWidth || 960;
      const offscreen = document.createElement('canvas');
      offscreen.width = size;
      offscreen.height = size;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const src = imageData.data;

      const [inkR, inkG, inkB] = hexToRgbTuple(paperHex, [244, 237, 226]);
      const outData = ctx.createImageData(size, size);
      const dst = outData.data;

      for (let y = 0; y < size; y++) {
        const bottomFade = y > size * 0.93 ? 1 - (y - size * 0.93) / (size * 0.07) : 1;
        const rowOffset = y * size;
        for (let x = 0; x < size; x++) {
          const p = (rowOffset + x) * 4;
          const lum = (0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]) / 255;
          const alpha = computePortraitSketchAlpha(lum, bottomFade);

          dst[p] = inkR;
          dst[p + 1] = inkG;
          dst[p + 2] = inkB;
          dst[p + 3] = Math.round(alpha * 255);
        }
      }

      ctx.putImageData(outData, 0, 0);
      cachedProcessedPortraitCanvas = offscreen;
      cachedPortraitColorKey = colorKey;

      const destCanvas = portraitCanvasRef.current;
      if (destCanvas) {
        destCanvas.width = size;
        destCanvas.height = size;
        const destCtx = destCanvas.getContext('2d');
        if (destCtx) {
          destCtx.clearRect(0, 0, size, size);
          destCtx.drawImage(offscreen, 0, 0);
          setSketchReady(true);
        }
      }
    };

    img.src = portraitSketchUrl || '/assets/rajdeep-portrait-sketch.jpg';

    return () => {
      cancelled = true;
    };
  }, [paperHex, strokeHex]);

  // 2. Extract the exact handwritten signature mask and animate it stroke-by-stroke
  useEffect(() => {
    let cancelled = false;
    let animRafId = 0;

    const startSignatureAnimation = (mask: CachedSignatureMask) => {
      const sigCanvas = signatureCanvasRef.current;
      if (!sigCanvas || cancelled) return;

      const { width, height, alphas } = mask;
      sigCanvas.width = width;
      sigCanvas.height = height;
      const ctx = sigCanvas.getContext('2d');
      if (!ctx) return;

      const [inkR, inkG, inkB] = hexToRgbTuple(strokeHex, [250, 246, 240]);
      const [tipR, tipG, tipB] = hexToRgbTuple(accentHex, [168, 132, 98]);

      const frameData = ctx.createImageData(width, height);
      const dst = frameData.data;

      const renderFrame = (progress: number) => {
        const clampedProgress = clamp01(progress);
        for (let y = 0; y < height; y++) {
          const normY = y / height;
          const rowOffset = y * width;
          for (let x = 0; x < width; x++) {
            const idx = rowOffset + x;
            const baseAlpha = alphas[idx];
            const p = idx * 4;

            if (baseAlpha <= 0.004) {
              dst[p + 3] = 0;
              continue;
            }

            const normX = x / width;
            const reveal =
              clampedProgress >= 1
                ? 1
                : computeSignatureRevealFactor(normX, normY, clampedProgress);

            if (reveal <= 0.004) {
              dst[p + 3] = 0;
              continue;
            }

            // Highlight active writing tip with Warm Copper before settling to Champagne Ivory
            const isActivePenFront = reveal > 0.05 && reveal < 0.88 && clampedProgress < 0.99;
            if (isActivePenFront) {
              const tipBlend = 1 - Math.abs(reveal - 0.46) / 0.46;
              dst[p] = Math.round(inkR * (1 - tipBlend * 0.45) + tipR * (tipBlend * 0.45));
              dst[p + 1] = Math.round(inkG * (1 - tipBlend * 0.45) + tipG * (tipBlend * 0.45));
              dst[p + 2] = Math.round(inkB * (1 - tipBlend * 0.45) + tipB * (tipBlend * 0.45));
            } else {
              dst[p] = inkR;
              dst[p + 1] = inkG;
              dst[p + 2] = inkB;
            }

            dst[p + 3] = Math.round(baseAlpha * reveal * 255);
          }
        }
        ctx.putImageData(frameData, 0, 0);
      };

      setSignatureReady(true);

      const holdMode =
        typeof window !== 'undefined' && shouldHoldLoadingScreen(window.location.search);
      const startTime = performance.now();

      const step = (now: number) => {
        if (cancelled) return;
        const elapsed = now - startTime;
        const progress = clamp01(elapsed / SIGNATURE_ANIMATION_DURATION_MS);
        renderFrame(progress);

        if (progress < 1) {
          animRafId = window.requestAnimationFrame(step);
        } else if (holdMode) {
          renderFrame(1);
        }
      };

      animRafId = window.requestAnimationFrame(step);
    };

    if (cachedSignatureMask) {
      startSignatureAnimation(cachedSignatureMask);
      return () => {
        cancelled = true;
        if (animRafId) window.cancelAnimationFrame(animRafId);
      };
    }

    const sigImg = new Image();
    sigImg.crossOrigin = 'anonymous';
    sigImg.onload = () => {
      if (cancelled) return;

      const srcW = sigImg.naturalWidth || 1600;
      const srcH = sigImg.naturalHeight || 1200;

      // Crop tight around the handwritten signature & crown in image_c69466af.png
      const cropX = Math.round(srcW * 0.14);
      const cropY = Math.round(srcH * 0.15);
      const cropW = Math.round(srcW * 0.72);
      const cropH = Math.round(srcH * 0.59);

      const width = 520;
      const height = Math.round(( width * cropH ) / cropW);

      const off = document.createElement('canvas');
      off.width = width;
      off.height = height;
      const offCtx = off.getContext('2d');
      if (!offCtx) return;

      offCtx.drawImage(sigImg, cropX, cropY, cropW, cropH, 0, 0, width, height);
      const raw = offCtx.getImageData(0, 0, width, height).data;

      // Compute luminance & 2-pass separable box blur (radius = 8) for local paper illumination
      const lum = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const p = i * 4;
        lum[i] = (0.299 * raw[p] + 0.587 * raw[p + 1] + 0.114 * raw[p + 2]) / 255;
      }

      const r = 8;
      const span = r * 2 + 1;
      const tmp = new Float32Array(width * height);
      const localAvg = new Float32Array(width * height);

      for (let y = 0; y < height; y++) {
        const row = y * width;
        let sum = 0;
        for (let x = -r; x <= r; x++) {
          const cx = Math.min(width - 1, Math.max(0, x));
          sum += lum[row + cx];
        }
        for (let x = 0; x < width; x++) {
          tmp[row + x] = sum / span;
          const left = Math.max(0, x - r);
          const right = Math.min(width - 1, x + r + 1);
          sum += lum[row + right] - lum[row + left];
        }
      }

      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) {
          const cy = Math.min(height - 1, Math.max(0, y));
          sum += tmp[cy * width + x];
        }
        for (let y = 0; y < height; y++) {
          localAvg[y * width + x] = sum / span;
          const top = Math.max(0, y - r);
          const bot = Math.min(height - 1, y + r + 1);
          sum += tmp[bot * width + x] - tmp[top * width + x];
        }
      }

      const alphas = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        // Soft edge guard (3% border) so no crop boundary ever touches the canvas edge
        const edgeX = (x: number) =>
          Math.min(1, Math.min(x / (width * 0.03), (width - 1 - x) / (width * 0.03)));
        const edgeY = Math.min(
          1,
          Math.min(y / (height * 0.03), (height - 1 - y) / (height * 0.03))
        );
        const row = y * width;
        for (let x = 0; x < width; x++) {
          const i = row + x;
          const p = i * 4;
          const ink = computeSignatureInkAlpha(raw[p], raw[p + 1], raw[p + 2], localAvg[i]);
          alphas[i] = ink * edgeX(x) * edgeY;
        }
      }

      const mask: CachedSignatureMask = { width, height, alphas };
      cachedSignatureMask = mask;
      startSignatureAnimation(mask);
    };

    sigImg.src = signatureImageUrl || '/assets/rajdeep-signature.png';

    return () => {
      cancelled = true;
      if (animRafId) window.cancelAnimationFrame(animRafId);
    };
  }, [strokeHex, accentHex]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${fullName} portfolio`}
      data-testid="portrait-loading-screen"
      className={`z-50 flex flex-col items-center justify-center px-4 sm:px-6 select-none transition-opacity duration-200 ease-out ${
        designSystem.textureEnabled ? 'bg-espresso-canvas' : ''
      } ${exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: designSystem.canvasBg,
        color: strokeHex,
      }}
    >
      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full">
        {/* Portrait Outline Sketch + Animated Signature on the Right Side Slightly Upwards */}
        <div className="relative flex items-center justify-center w-full max-w-[360px] sm:max-w-[540px]">
          {/* Accurate Portrait Outline Sketch Container */}
          <div className="relative w-64 h-64 sm:w-84 sm:h-84 flex items-center justify-center -translate-x-5 sm:-translate-x-8">
            <canvas
              ref={portraitCanvasRef}
              aria-label={`${fullName} portrait outline sketch`}
              className={`w-full h-full object-contain transition-all duration-300 ease-out ${
                sketchReady ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'
              }`}
              style={{
                filter: 'drop-shadow(0 16px 36px rgba(18, 11, 8, 0.42))',
              }}
            />
          </div>

          {/* Animated Handwritten Signature — Positioned on the right side of the portrait sketch, slightly upwards */}
          <div
            data-testid="animated-portrait-signature"
            className={`pointer-events-none absolute right-0 sm:right-1 top-3 sm:top-5 w-40 sm:w-56 aspect-[520/426] transition-opacity duration-200 ${
              signatureReady ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <canvas
              ref={signatureCanvasRef}
              aria-label={`${fullName} handwritten signature animation`}
              className="w-full h-full object-contain"
              style={{
                filter: 'drop-shadow(0 8px 20px rgba(18, 11, 8, 0.45))',
              }}
            />
          </div>
        </div>

        {/* Hairline Architectural Divider & 1.5s Progress Sweep */}
        <div
          className="w-48 sm:w-56 h-[1.5px] rounded-full overflow-hidden mt-2 mb-4"
          style={{
            backgroundColor: 'rgba(213, 196, 174, 0.24)',
          }}
        >
          <div
            className={`h-full rounded-full origin-left transition-transform duration-[1350ms] ease-out ${
              progressStarted ? 'scale-x-100' : 'scale-x-0'
            }`}
            style={{
              backgroundColor: accentHex,
            }}
          />
        </div>

        {/* Full Name below the portrait outline sketch */}
        <h1
          className="text-2xl sm:text-[28px] font-bold tracking-tight text-center leading-tight"
          style={{
            color: strokeHex,
            textWrap: 'balance',
          }}
        >
          {fullName}
        </h1>

        {profile.role.trim() && (
          <p
            className="mt-1.5 text-xs font-mono tracking-wide text-center opacity-85"
            style={{ color: secondaryHex }}
          >
            {profile.role.trim()}
          </p>
        )}
      </div>
    </div>
  );
};
