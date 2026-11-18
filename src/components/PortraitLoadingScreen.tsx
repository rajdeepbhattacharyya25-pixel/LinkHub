import React, { useEffect, useRef, useState } from 'react';
import type { DesignSystemConfig, ProfileConfig } from '../data/profileData';
import {
  DEFAULT_LOADING_SCREEN_DURATION_MS,
  resolveLoadingFullName,
  shouldHoldLoadingScreen,
} from '../utils/loadingScreenLogic';

interface PortraitLoadingScreenProps {
  profile: ProfileConfig;
  designSystem: DesignSystemConfig;
  durationMs?: number;
  onComplete: () => void;
}

const PORTRAIT_BAKED_URL = '/assets/portrait-sketch-baked.webp';
const SIGNATURE_BODY_BAKED_URL = '/assets/signature-body-baked.webp';
const SIGNATURE_CROWN_BAKED_URL = '/assets/signature-crown-baked.webp';

export const PortraitLoadingScreen: React.FC<PortraitLoadingScreenProps> = ({
  profile,
  designSystem,
  durationMs = DEFAULT_LOADING_SCREEN_DURATION_MS,
  onComplete,
}) => {
  const [exiting, setExiting] = useState(false);
  const [revealed, setRevealed] = useState(false);
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

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      setRevealed(true);
    });

    if (typeof window !== 'undefined' && shouldHoldLoadingScreen(window.location.search)) {
      return () => window.cancelAnimationFrame(rafId);
    }

    const fadeOutAt = Math.max(240, durationMs - 180);
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
  }, [durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${fullName} portfolio`}
      data-testid="portrait-loading-screen"
      className={`z-50 flex flex-col items-center justify-center px-4 sm:px-6 select-none transition-opacity duration-200 ease-out ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: designSystem.canvasBg,
        color: strokeHex,
        willChange: 'opacity',
      }}
    >
      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full">
        {/* Pre-baked GPU-masked Portrait Sketch + Two-Phase GPU Signature Reveal */}
        <div className="relative flex items-center justify-center w-full max-w-[360px] sm:max-w-[540px]">
          <div className="relative w-64 h-64 sm:w-84 sm:h-84 flex items-center justify-center -translate-x-5 sm:-translate-x-8">
            <div
              role="img"
              aria-label={`${fullName} portrait outline sketch`}
              className={`w-full h-full transition-transform duration-300 ease-out ${
                revealed ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'
              }`}
              style={{
                backgroundColor: paperHex,
                maskImage: `url(${PORTRAIT_BAKED_URL})`,
                WebkitMaskImage: `url(${PORTRAIT_BAKED_URL})`,
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskPosition: 'center',
                maskSize: 'contain',
                WebkitMaskSize: 'contain',
              }}
            />
          </div>

          <div
            role="img"
            data-testid="animated-portrait-signature"
            aria-label={`${fullName} handwritten signature animation`}
            className="pointer-events-none absolute right-0 sm:right-1 top-3 sm:top-5 w-40 sm:w-56 aspect-[520/426]"
          >
            {/* Phase 1: Main signature body sweep (GPU clip-path) */}
            <div
              className="absolute inset-0 lh-sig-reveal-body"
              style={{
                backgroundColor: strokeHex,
                maskImage: `url(${SIGNATURE_BODY_BAKED_URL})`,
                WebkitMaskImage: `url(${SIGNATURE_BODY_BAKED_URL})`,
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskPosition: 'center',
                maskSize: 'contain',
                WebkitMaskSize: 'contain',
              }}
            />
            {/* Phase 2: Upper crown sweep (GPU clip-path) */}
            <div
              className="absolute inset-0 lh-sig-reveal-crown"
              style={{
                backgroundColor: accentHex,
                maskImage: `url(${SIGNATURE_CROWN_BAKED_URL})`,
                WebkitMaskImage: `url(${SIGNATURE_CROWN_BAKED_URL})`,
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskPosition: 'center',
                maskSize: 'contain',
                WebkitMaskSize: 'contain',
              }}
            />
          </div>
        </div>

        {/* Hairline Architectural Divider & Smooth Progress Sweep */}
        <div
          className="w-48 sm:w-56 h-[1.5px] rounded-full overflow-hidden mt-2 mb-4"
          style={{
            backgroundColor: 'rgba(213, 196, 174, 0.24)',
          }}
        >
          <div
            className={`h-full rounded-full origin-left transition-transform duration-[1350ms] ease-out ${
              revealed ? 'scale-x-100' : 'scale-x-0'
            }`}
            style={{
              backgroundColor: accentHex,
            }}
          />
        </div>

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
