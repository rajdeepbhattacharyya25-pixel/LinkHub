import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  RotateCw,
  FlipHorizontal2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Check,
  Upload,
  Download,
  Lock,
  Unlock,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  CROP_ASPECT_PRESETS,
  clampCropPan,
  computeCoverBaseScale,
  computeCropFrameSize,
  computeOutputDimensions,
  getCropPresetById,
  getDefaultCropPresetForCategory,
  getRotatedDimensions,
  normalizeRotationDeg,
  renderCroppedImageToFile,
  type CropAspectPresetId,
  type CropResolutionTier,
} from '../utils/imageCrop';
import {
  formatBytes,
  triggerBrowserDownload,
  type MediaAssetCategory,
} from '../utils/mediaAndZip';
import { ensureClientMediaHydrated } from '../services/firebaseHubService';

export interface CropUploadOptions {
  signal?: AbortSignal;
  onProgress?: (progressPct: number, statusLabel: string) => void;
}

export interface CropSessionRequest {
  slotId: string;
  category: MediaAssetCategory;
  title: string;
  file?: File;
  sourceUrl?: string;
  previousStoragePath?: string;
  onApply: (
    croppedFile: File,
    dimensions: { width: number; height: number },
    options?: CropUploadOptions
  ) => Promise<void> | void;
  onUseOriginal?: (
    originalFile: File,
    options?: CropUploadOptions
  ) => Promise<void> | void;
}

interface ImageCropModalProps {
  session: CropSessionRequest;
  onClose: () => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({ session, onClose }) => {
  const defaultPreset = getDefaultCropPresetForCategory(session.category);
  const [presetId, setPresetId] = useState<CropAspectPresetId>(defaultPreset);
  const [freeAspectRatio, setFreeAspectRatio] = useState<number>(4 / 3);
  const [tier, setTier] = useState<CropResolutionTier>('standard');
  const [lockCustomAspect, setLockCustomAspect] = useState(true);

  const initialOut = computeOutputDimensions({
    category: session.category,
    presetId: defaultPreset,
    tier: 'standard',
  });
  const [customWidth, setCustomWidth] = useState<number>(initialOut.width);
  const [customHeight, setCustomHeight] = useState<number>(initialOut.height);

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotationDeg, setRotationDeg] = useState<0 | 90 | 180 | 270>(0);
  const [flipX, setFlipX] = useState<boolean>(false);

  const [activeFile, setActiveFile] = useState<File | undefined>(session.file);
  const [activeSourceUrl, setActiveSourceUrl] = useState<string | undefined>(
    session.sourceUrl
  );
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [resolvedPreviewSrc, setResolvedPreviewSrc] = useState<string>('');
  const [loadingImage, setLoadingImage] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applying, setApplying] = useState<boolean>(false);
  const [uploadStatusText, setUploadStatusText] = useState<string>('Uploading...');
  const [applyError, setApplyError] = useState<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 480,
    height: 280,
  });

  const dragStateRef = useRef<{
    dragging: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  }>({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originPanX: 0,
    originPanY: 0,
  });

  // Escape key closes modal (or aborts active upload), and cleanup aborts on unmount
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (applying) {
          uploadAbortRef.current?.abort();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applying, onClose]);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  // Measure interactive crop stage responsively
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(updateSize);
      obs.observe(el);
      return () => obs.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Load image from File or URL (with Firestore publicMedia hydration + SSRF-safe proxy fallback)
  useEffect(() => {
    let cancelled = false;
    let objectUrlToRevoke: string | null = null;

    const loadImgElement = (src: string, useCrossOrigin: boolean): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        if (useCrossOrigin) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image.'));
        img.src = src;
      });

    async function run() {
      setLoadingImage(true);
      setLoadError(null);
      setLoadedImage(null);

      try {
        if (activeFile) {
          const objUrl = URL.createObjectURL(activeFile);
          objectUrlToRevoke = objUrl;
          const img = await loadImgElement(objUrl, false);
          if (cancelled) return;
          setLoadedImage(img);
          setResolvedPreviewSrc(objUrl);
          setLoadingImage(false);
          return;
        }

        const rawUrl = (activeSourceUrl || '').trim();
        if (!rawUrl) {
          throw new Error('No image selected. Choose an image file to crop and resize.');
        }

        if (
          rawUrl.startsWith('/api/media/') ||
          (session.previousStoragePath || '').startsWith('firestore-media/')
        ) {
          const hydrated = await ensureClientMediaHydrated(rawUrl, session.previousStoragePath);
          if (cancelled) return;
          if (hydrated.startsWith('data:')) {
            const img = await loadImgElement(hydrated, false);
            if (cancelled) return;
            setLoadedImage(img);
            setResolvedPreviewSrc(hydrated);
            setLoadingImage(false);
            return;
          }
        }

        const isDataOrLocal =
          rawUrl.startsWith('data:') ||
          rawUrl.startsWith('blob:') ||
          rawUrl.startsWith('/');

        if (isDataOrLocal) {
          const img = await loadImgElement(rawUrl, false);
          if (cancelled) return;
          setLoadedImage(img);
          setResolvedPreviewSrc(rawUrl);
          setLoadingImage(false);
          return;
        }

        // Try direct CORS load first, then /api/image-proxy, then CORS image relay
        try {
          const directImg = await loadImgElement(rawUrl, true);
          if (cancelled) return;
          setLoadedImage(directImg);
          setResolvedPreviewSrc(rawUrl);
          setLoadingImage(false);
          return;
        } catch {
          try {
            const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(rawUrl)}`;
            const proxiedImg = await loadImgElement(proxyUrl, true);
            if (cancelled) return;
            setLoadedImage(proxiedImg);
            setResolvedPreviewSrc(proxyUrl);
            setLoadingImage(false);
            return;
          } catch {
            const corsRelayUrl = `https://images.weserv.nl/?url=${encodeURIComponent(rawUrl)}`;
            const relayImg = await loadImgElement(corsRelayUrl, true);
            if (cancelled) return;
            setLoadedImage(relayImg);
            setResolvedPreviewSrc(corsRelayUrl);
            setLoadingImage(false);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Unable to load this image for cropping. Choose a local image file instead.'
        );
        setLoadingImage(false);
      }
    }

    run();

    return () => {
      cancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [activeFile, activeSourceUrl, session.previousStoragePath]);

  const activePreset = getCropPresetById(presetId);
  const activeAspectRatio = activePreset.ratio ?? freeAspectRatio;

  const { frameWidth, frameHeight } = computeCropFrameSize({
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    aspectRatio: activeAspectRatio,
    padding: stageSize.width < 420 ? 14 : 22,
  });

  const naturalWidth = loadedImage?.naturalWidth || 800;
  const naturalHeight = loadedImage?.naturalHeight || 600;
  const rotatedDims = getRotatedDimensions(naturalWidth, naturalHeight, rotationDeg);
  const baseScale = computeCoverBaseScale(
    rotatedDims.width,
    rotatedDims.height,
    frameWidth,
    frameHeight
  );
  const totalScale = baseScale * zoom;

  // Keep pan clamped whenever zoom, rotation, or aspect frame changes
  const clampedPan = clampCropPan({
    panX: pan.x,
    panY: pan.y,
    imageWidth: rotatedDims.width,
    imageHeight: rotatedDims.height,
    frameWidth,
    frameHeight,
    zoom,
  });

  const outputDimensions = computeOutputDimensions({
    category: session.category,
    presetId,
    freeAspectRatio,
    tier,
    customWidth,
    customHeight,
  });

  const handleSelectPreset = (nextId: CropAspectPresetId) => {
    setPresetId(nextId);
    setPan({ x: 0, y: 0 });
    const nextOut = computeOutputDimensions({
      category: session.category,
      presetId: nextId,
      freeAspectRatio,
      tier: tier === 'custom' ? 'standard' : tier,
    });
    setCustomWidth(nextOut.width);
    setCustomHeight(nextOut.height);
  };

  const handleSelectTier = (nextTier: CropResolutionTier) => {
    setTier(nextTier);
    if (nextTier !== 'custom') {
      const nextOut = computeOutputDimensions({
        category: session.category,
        presetId,
        freeAspectRatio,
        tier: nextTier,
      });
      setCustomWidth(nextOut.width);
      setCustomHeight(nextOut.height);
    }
  };

  const handleCustomWidthChange = (raw: string) => {
    const parsed = Number(raw);
    const num = Number.isFinite(parsed) ? Math.max(0, Math.min(2400, Math.round(parsed))) : 64;
    setTier('custom');
    setCustomWidth(num);
    if (lockCustomAspect && num >= 64) {
      setCustomHeight(Math.max(64, Math.min(2400, Math.round(num / activeAspectRatio))));
    }
  };

  const handleCustomHeightChange = (raw: string) => {
    const parsed = Number(raw);
    const num = Number.isFinite(parsed) ? Math.max(0, Math.min(2400, Math.round(parsed))) : 64;
    setTier('custom');
    setCustomHeight(num);
    if (lockCustomAspect && num >= 64) {
      setCustomWidth(Math.max(64, Math.min(2400, Math.round(num * activeAspectRatio))));
    }
  };

  const clampCustomDimensionsOnBlur = () => {
    const clampedW = Math.max(64, Math.min(2400, customWidth || 64));
    const clampedH = Math.max(64, Math.min(2400, customHeight || 64));
    setCustomWidth(clampedW);
    setCustomHeight(clampedH);
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotationDeg(0);
    setFlipX(false);
    setPresetId(defaultPreset);
    setTier('standard');
    const resetOut = computeOutputDimensions({
      category: session.category,
      presetId: defaultPreset,
      tier: 'standard',
    });
    setCustomWidth(resetOut.width);
    setCustomHeight(resetOut.height);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!loadedImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      dragging: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originPanX: clampedPan.panX,
      originPanY: clampedPan.panY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag.dragging || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const next = clampCropPan({
      panX: drag.originPanX + dx,
      panY: drag.originPanY + dy,
      imageWidth: rotatedDims.width,
      imageHeight: rotatedDims.height,
      frameWidth,
      frameHeight,
      zoom,
    });
    setPan({ x: next.panX, y: next.panY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.pointerId === e.pointerId) {
      dragStateRef.current.dragging = false;
      dragStateRef.current.pointerId = null;
    }
  };

  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!loadedImage) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom((prev) => Math.max(1, Math.min(4, Number((prev + delta).toFixed(2)))));
  };

  const handleStageKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!loadedImage) return;
    const step = e.shiftKey ? 24 : 10;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setZoom((z) => Math.min(4, Number((z + 0.15).toFixed(2))));
      return;
    } else if (e.key === '-') {
      e.preventDefault();
      setZoom((z) => Math.max(1, Number((z - 0.15).toFixed(2))));
      return;
    } else {
      return;
    }
    e.preventDefault();
    const next = clampCropPan({
      panX: clampedPan.panX + dx,
      panY: clampedPan.panY + dy,
      imageWidth: rotatedDims.width,
      imageHeight: rotatedDims.height,
      frameWidth,
      frameHeight,
      zoom,
    });
    setPan({ x: next.panX, y: next.panY });
  };

  const buildCroppedOutput = async () => {
    if (!loadedImage) {
      throw new Error('Wait for the image to finish loading.');
    }
    const baseName = activeFile?.name || session.slotId || session.category;
    return renderCroppedImageToFile({
      image: loadedImage,
      rotationDeg,
      flipX,
      frameWidth,
      frameHeight,
      zoom,
      panX: clampedPan.panX,
      panY: clampedPan.panY,
      outputWidth: outputDimensions.width,
      outputHeight: outputDimensions.height,
      filenameBase: baseName,
    });
  };

  const handleApplyCrop = async () => {
    setApplyError(null);
    setApplying(true);
    setUploadStatusText('Cropping...');
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    let timedOut = false;
    const safetyTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);

    try {
      const result = await buildCroppedOutput();
      if (controller.signal.aborted) {
        return;
      }
      setUploadStatusText('Uploading...');
      await Promise.race([
        Promise.resolve(
          session.onApply(
            result.file,
            {
              width: result.width,
              height: result.height,
            },
            {
              signal: controller.signal,
              onProgress: (_pct, label) => {
                if (label) setUploadStatusText(label);
              },
            }
          )
        ),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              const abortErr = new Error(
                timedOut
                  ? 'Upload timed out. Check your connection and try again.'
                  : 'Upload cancelled.'
              );
              abortErr.name = timedOut ? 'TimeoutError' : 'AbortError';
              reject(abortErr);
            },
            { once: true }
          );
        }),
      ]);
      if (!controller.signal.aborted) {
        onClose();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError' && !timedOut) {
        setApplyError('Upload cancelled.');
      } else {
        setApplyError(
          err instanceof Error ? err.message : 'Could not apply cropped image.'
        );
      }
    } finally {
      clearTimeout(safetyTimer);
      uploadAbortRef.current = null;
      setApplying(false);
      setUploadStatusText('Uploading...');
    }
  };

  const handleDownloadCropped = async () => {
    setApplyError(null);
    try {
      const result = await buildCroppedOutput();
      triggerBrowserDownload(result.file.name, result.file, result.mimeType);
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : 'Unable to export cropped image.'
      );
    }
  };

  const handleUseOriginal = async () => {
    if (!activeFile || !session.onUseOriginal) return;
    setApplyError(null);
    setApplying(true);
    setUploadStatusText('Uploading...');
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    let timedOut = false;
    const safetyTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);

    try {
      await Promise.race([
        Promise.resolve(
          session.onUseOriginal(activeFile, {
            signal: controller.signal,
            onProgress: (_pct, label) => {
              if (label) setUploadStatusText(label);
            },
          })
        ),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              const abortErr = new Error(
                timedOut
                  ? 'Upload timed out. Check your connection and try again.'
                  : 'Upload cancelled.'
              );
              abortErr.name = timedOut ? 'TimeoutError' : 'AbortError';
              reject(abortErr);
            },
            { once: true }
          );
        }),
      ]);
      if (!controller.signal.aborted) {
        onClose();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError' && !timedOut) {
        setApplyError('Upload cancelled.');
      } else {
        setApplyError(err instanceof Error ? err.message : 'Upload failed.');
      }
    } finally {
      clearTimeout(safetyTimer);
      uploadAbortRef.current = null;
      setApplying(false);
      setUploadStatusText('Uploading...');
    }
  };

  const showCircularGuide =
    session.category === 'avatar' && activePreset.id === '1:1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1A120E]/75 backdrop-blur-xs font-manrope"
      onClick={() => !applying && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[660px] max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#F4EDE2] border-t sm:border border-[#B89B7E] shadow-[0_28px_70px_-12px_rgba(26,18,14,0.65)] p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#3A2418] text-[#FAF6F0] flex items-center justify-center shrink-0">
                <Crop className="w-3.5 h-3.5" />
              </span>
              <h2
                id="crop-modal-title"
                className="text-sm sm:text-base font-bold text-[#1A120E] truncate"
              >
                {session.title}
              </h2>
            </div>
            <p className="text-[11px] sm:text-xs font-medium text-[#3A2418]">
              Drag to position, zoom to frame, and set exact pixel output size.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            aria-label="Close crop tool"
            className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-[#EAE0D3] hover:bg-[#D5C4AE] text-[#1A120E] flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Aspect Ratio Preset Strip */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
              Aspect Frame
            </span>
            {loadedImage && (
              <span className="font-ibm-mono text-[10.5px] font-semibold text-[#5C3D24] tabular-nums">
                Source: {naturalWidth}×{naturalHeight}px
                {activeFile ? ` (${formatBytes(activeFile.size)})` : ''}
              </span>
            )}
          </div>

          <div
            role="group"
            aria-label="Crop aspect presets"
            className="flex flex-wrap items-center gap-1.5"
          >
            {CROP_ASPECT_PRESETS.map((preset) => {
              const active = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  aria-pressed={active}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#3A2418] text-[#FAF6F0] border-[#1A120E]'
                      : 'bg-[#FAF6F0] text-[#1A120E] border-[#B89B7E] hover:bg-[#EAE0D3]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {presetId === 'free' && (
            <div className="p-2.5 rounded-xl bg-[#FAF6F0] border border-[#B89B7E] flex items-center gap-3">
              <label
                htmlFor="free-aspect-slider"
                className="font-ibm-mono text-[10.5px] font-bold text-[#3A2418] whitespace-nowrap"
              >
                Free Ratio ({freeAspectRatio.toFixed(2)}:1)
              </label>
              <input
                id="free-aspect-slider"
                type="range"
                min="0.5"
                max="3.5"
                step="0.05"
                value={freeAspectRatio}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  setFreeAspectRatio(r);
                  setPan({ x: 0, y: 0 });
                }}
                className="flex-1 accent-[#3A2418] cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Interactive Crop Stage */}
        <div
          ref={stageRef}
          data-testid="image-crop-stage"
          tabIndex={0}
          onWheel={handleStageWheel}
          onKeyDown={handleStageKeyDown}
          aria-label="Interactive image crop stage. Drag to pan, scroll or press plus and minus to zoom."
          className="relative w-full h-[240px] sm:h-[290px] rounded-2xl bg-[#1A120E] border border-[#6B4A2E] overflow-hidden flex items-center justify-center select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A88462]"
        >
          {loadingImage ? (
            <div className="flex flex-col items-center gap-2 text-[#FAF6F0]">
              <Loader2 className="w-6 h-6 animate-spin text-[#D5C4AE]" />
              <span className="font-ibm-mono text-[11px] text-[#D5C4AE]">
                Loading image into studio cropper...
              </span>
            </div>
          ) : loadError ? (
            <div className="p-5 max-w-sm text-center space-y-3">
              <AlertTriangle className="w-6 h-6 text-[#E5B887] mx-auto" />
              <p className="text-xs font-medium text-[#FAF6F0] leading-relaxed">
                {loadError}
              </p>
              <label className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#1A120E] text-xs font-bold cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Choose Local Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0];
                    e.target.value = '';
                    if (nextFile) {
                      setActiveFile(nextFile);
                      setActiveSourceUrl(undefined);
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                      setRotationDeg(0);
                      setFlipX(false);
                    }
                  }}
                  className="sr-only"
                />
              </label>
            </div>
          ) : (
            <>
              {/* Subtle checkerboard backing behind crop window */}
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(rgba(213, 196, 174, 0.35) 1px, transparent 1px)',
                  backgroundSize: '14px 14px',
                }}
              />

              {/* Active Crop Frame */}
              <div
                data-testid="image-crop-frame"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  width: `${frameWidth}px`,
                  height: `${frameHeight}px`,
                }}
                className="relative overflow-hidden border-2 border-[#FAF6F0] shadow-[0_0_0_9999px_rgba(16,10,8,0.62)] cursor-grab active:cursor-grabbing touch-none"
              >
                {/* Centered Pan Anchor */}
                <div
                  className="absolute left-1/2 top-1/2 pointer-events-none"
                  style={{
                    width: 0,
                    height: 0,
                    transform: `translate(${clampedPan.panX}px, ${clampedPan.panY}px)`,
                  }}
                >
                  <img
                    src={resolvedPreviewSrc}
                    alt="Crop workspace preview"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: `${naturalWidth}px`,
                      height: `${naturalHeight}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      transform: `translate(-50%, -50%) scale(${totalScale}) rotate(${rotationDeg}deg) scaleX(${
                        flipX ? -1 : 1
                      })`,
                      transformOrigin: 'center center',
                    }}
                  />
                </div>

                {/* Rule of Thirds Hairline Grid */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
                >
                  <div className="border-r border-b border-[#FAF6F0]/25" />
                  <div className="border-r border-b border-[#FAF6F0]/25" />
                  <div className="border-b border-[#FAF6F0]/25" />
                  <div className="border-r border-b border-[#FAF6F0]/25" />
                  <div className="border-r border-b border-[#FAF6F0]/25" />
                  <div className="border-b border-[#FAF6F0]/25" />
                  <div className="border-r border-[#FAF6F0]/25" />
                  <div className="border-r border-[#FAF6F0]/25" />
                  <div />
                </div>

                {/* Circular Avatar Safe-Area Guide */}
                {showCircularGuide && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed border-[#D5C4AE]/90 shadow-[inset_0_0_0_999px_rgba(26,18,14,0.22)]"
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Zoom & Transform Toolbar */}
        <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.max(1, Number((z - 0.15).toFixed(2))))
                }
                disabled={!loadedImage || zoom <= 1}
                aria-label="Zoom out"
                className="w-9 h-9 rounded-lg bg-[#F4EDE2] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[#1A120E] flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-45"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="1"
                max="4"
                step="0.02"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={!loadedImage}
                aria-label="Zoom scale"
                className="flex-1 min-w-0 accent-[#3A2418] cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.min(4, Number((z + 0.15).toFixed(2))))
                }
                disabled={!loadedImage || zoom >= 4}
                aria-label="Zoom in"
                className="w-9 h-9 rounded-lg bg-[#F4EDE2] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[#1A120E] flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-45"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="font-ibm-mono text-[11px] font-bold text-[#1A120E] w-12 text-right tabular-nums shrink-0">
                {zoom.toFixed(2)}×
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setRotationDeg((prev) => normalizeRotationDeg(prev + 90))
                }
                disabled={!loadedImage}
                aria-label="Rotate 90 degrees clockwise"
                className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11px] font-semibold text-[#1A120E] cursor-pointer whitespace-nowrap disabled:opacity-45"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rotate</span>
              </button>

              <button
                type="button"
                onClick={() => setFlipX((prev) => !prev)}
                disabled={!loadedImage}
                aria-pressed={flipX}
                aria-label="Flip image horizontally"
                className={`min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap disabled:opacity-45 ${
                  flipX
                    ? 'bg-[#3A2418] text-[#FAF6F0] border-[#1A120E]'
                    : 'bg-[#F4EDE2] hover:bg-[#EAE0D3] text-[#1A120E] border-[#B89B7E]'
                }`}
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                <span>Flip</span>
              </button>

              <button
                type="button"
                onClick={handleResetView}
                disabled={!loadedImage}
                aria-label="Reset crop and zoom"
                className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11px] font-semibold text-[#3A2418] cursor-pointer whitespace-nowrap disabled:opacity-45"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <label className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EAE0D3] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[11px] font-semibold text-[#1A120E] cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>Replace</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0];
                    e.target.value = '';
                    if (nextFile) {
                      setActiveFile(nextFile);
                      setActiveSourceUrl(undefined);
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                      setRotationDeg(0);
                      setFlipX(false);
                    }
                  }}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          {/* Output Resize Dimensions Bar */}
          <div className="pt-2.5 border-t border-[#D5C4AE] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418] mr-1">
                Resize:
              </span>
              {(
                [
                  { id: 'compact', label: 'Compact' },
                  { id: 'standard', label: 'Standard' },
                  { id: 'highres', label: 'High-Res' },
                  { id: 'custom', label: 'Custom px' },
                ] as { id: CropResolutionTier; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTier(t.id)}
                  aria-pressed={tier === t.id}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    tier === t.id
                      ? 'bg-[#3A2418] text-[#FAF6F0] border-[#1A120E]'
                      : 'bg-[#F4EDE2] text-[#1A120E] border-[#B89B7E] hover:bg-[#EAE0D3]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tier === 'custom' ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={64}
                  max={2400}
                  value={customWidth || ''}
                  onChange={(e) => handleCustomWidthChange(e.target.value)}
                  onBlur={clampCustomDimensionsOnBlur}
                  aria-label="Custom output width in pixels"
                  className="w-20 min-h-[32px] px-2 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-xs font-bold text-[#1A120E] text-center tabular-nums"
                />
                <span className="font-ibm-mono text-xs text-[#5C3D24]">×</span>
                <input
                  type="number"
                  min={64}
                  max={2400}
                  value={customHeight || ''}
                  onChange={(e) => handleCustomHeightChange(e.target.value)}
                  onBlur={clampCustomDimensionsOnBlur}
                  aria-label="Custom output height in pixels"
                  className="w-20 min-h-[32px] px-2 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-xs font-bold text-[#1A120E] text-center tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setLockCustomAspect((prev) => !prev)}
                  aria-pressed={lockCustomAspect}
                  aria-label={
                    lockCustomAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'
                  }
                  title={
                    lockCustomAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'
                  }
                  className="w-8 h-8 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[#3A2418] flex items-center justify-center cursor-pointer"
                >
                  {lockCustomAspect ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ) : (
              <span
                data-testid="crop-output-dimensions"
                className="font-ibm-mono text-[11px] font-bold text-[#1A120E] tabular-nums"
              >
                Output: {outputDimensions.width} × {outputDimensions.height} px · WebP
              </span>
            )}
          </div>
        </div>

        {applyError && (
          <div
            role="alert"
            className="p-2.5 rounded-xl bg-[#FAF6F0] border border-[#9A2E2E] text-xs font-semibold text-[#9A2E2E]"
          >
            {applyError}
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (applying) {
                  uploadAbortRef.current?.abort();
                } else {
                  onClose();
                }
              }}
              className="flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] text-xs font-semibold text-[#1A120E] cursor-pointer whitespace-nowrap"
            >
              {applying ? 'Stop Upload' : 'Cancel'}
            </button>

            {loadedImage && (
              <button
                type="button"
                onClick={handleDownloadCropped}
                disabled={applying}
                title="Download cropped & resized image"
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] text-xs font-semibold text-[#3A2418] cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeFile && session.onUseOriginal && (
              <button
                type="button"
                onClick={handleUseOriginal}
                disabled={applying || !loadedImage}
                className="flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl bg-[#EAE0D3] hover:bg-[#D5C4AE] border border-[#B89B7E] text-xs font-semibold text-[#1A120E] cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                Use Original
              </button>
            )}

            <button
              type="button"
              onClick={handleApplyCrop}
              disabled={applying || !loadedImage}
              className="flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#1A120E] hover:bg-[#3A2418] disabled:opacity-55 text-[#FAF6F0] text-xs font-semibold shadow-xs cursor-pointer whitespace-nowrap"
            >
              {applying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{uploadStatusText}</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Crop &amp; Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
