import React, { useEffect, useState } from 'react';
import {
  resolveCardPreviewDisplay,
  type LinkPreviewType,
} from '../utils/linkPreview';
import { ensurePublicMediaHydratedRest } from '../services/publicHubRestService';

export interface CardPreviewGraphicProps {
  type: LinkPreviewType;
  thumbnailUrl?: string;
  autoThumbnailUrl?: string;
  title: string;
  isLoading?: boolean;
}

export const CardPreviewGraphic: React.FC<CardPreviewGraphicProps> = ({
  type,
  thumbnailUrl,
  autoThumbnailUrl,
  title,
  isLoading = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const [triedRelay, setTriedRelay] = useState(false);

  const resolved = resolveCardPreviewDisplay({
    previewType: type,
    thumbnailUrl,
    autoThumbnailUrl,
    imageFailed: imgError,
  });

  useEffect(() => {
    setImgError(false);
    setFallbackSrc(null);
    setTriedRelay(false);

    const rawImg = resolved.mode === 'image' ? (resolved.imageUrl || '').trim() : '';
    if (rawImg.startsWith('/api/media/')) {
      let cancelled = false;
      ensurePublicMediaHydratedRest(rawImg)
        .then((hydrated) => {
          if (!cancelled && hydrated && hydrated !== rawImg) {
            setFallbackSrc(hydrated);
            setImgError(false);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [type, thumbnailUrl, autoThumbnailUrl, resolved.mode, resolved.imageUrl]);

  if (resolved.mode === 'image' && resolved.imageUrl) {
    const activeSrc = fallbackSrc || resolved.imageUrl;

    const handleImageError = () => {
      const raw = (resolved.imageUrl || '').trim();
      if (raw.startsWith('/api/media/') && !fallbackSrc) {
        ensurePublicMediaHydratedRest(raw)
          .then((hydrated) => {
            if (hydrated && hydrated.startsWith('data:')) {
              setFallbackSrc(hydrated);
            } else {
              setImgError(true);
            }
          })
          .catch(() => setImgError(true));
        return;
      }
      if (/^https?:\/\//i.test(raw) && !triedRelay && !raw.includes('images.weserv.nl')) {
        setTriedRelay(true);
        setFallbackSrc(`https://images.weserv.nl/?url=${encodeURIComponent(raw)}&w=800&fit=cover`);
        return;
      }
      setImgError(true);
    };

    return (
      <div className="w-full h-32 rounded-xl bg-[#EAE0D3] border border-[#B89B7E] relative overflow-hidden">
        <img
          src={activeSrc}
          alt={`${title || 'Link'} preview thumbnail`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleImageError}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {isLoading && (
          <div className="absolute inset-0 bg-[#FAF6F0]/70 backdrop-blur-[1px] flex items-center justify-center">
            <span className="px-2.5 py-1 rounded-lg bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[10px] font-semibold">
              Fetching preview...
            </span>
          </div>
        )}
      </div>
    );
  }

  let artworkNode: React.ReactNode;
  switch (resolved.artwork) {
    case 'linkhub':
      artworkNode = (
        <div className="w-full h-32 rounded-xl bg-gradient-to-br from-[#F5EFE6] via-[#EAE0D3] to-[#D5C4AE]/80 border border-[#D5C4AE] p-3 flex items-center justify-between relative overflow-hidden">
          <div className="space-y-1.5 z-10 max-w-[58%]">
            <p className="text-[11px] leading-tight text-[#1A120E] font-semibold line-clamp-2">
              {title || 'Featured Showcase'}
            </p>
            <div className="inline-block px-2 py-0.5 rounded bg-[#FAF6F0] border border-[#D5C4AE] text-[9px] font-mono text-[#6B4A2E]">
              SHOWCASE
            </div>
          </div>
          <div className="flex flex-col gap-1.5 -rotate-6 translate-x-1">
            <div className="w-16 h-5 rounded-md bg-[#3A2418] flex items-center px-1.5 gap-1 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#A88462]" />
              <span className="h-1.5 w-8 rounded bg-[#D5C4AE]/80" />
            </div>
            <div className="w-16 h-5 rounded-md bg-[#6B4A2E] flex items-center px-1.5 gap-1 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#FAF6F0]" />
              <span className="h-1.5 w-9 rounded bg-[#FAF6F0]/85" />
            </div>
            <div className="w-16 h-5 rounded-md bg-[#A88462] flex items-center px-1.5 gap-1 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#1A120E]" />
              <span className="h-1.5 w-7 rounded bg-[#1A120E]/75" />
            </div>
          </div>
        </div>
      );
      break;

    case 'flib':
      artworkNode = (
        <div className="w-full h-32 rounded-xl bg-gradient-to-br from-[#6B4A2E] to-[#8C6543] border border-[#A88462] flex flex-col items-center justify-center px-4 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(#FAF6F0 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }}
          />
          <span className="text-sm font-bold tracking-tight text-[#FAF6F0] z-10 line-clamp-2">
            {title || 'Editorial Card'}
          </span>
          <span className="w-10 h-0.5 bg-[#D5C4AE] rounded-full mt-1.5 z-10" />
        </div>
      );
      break;

    case 'chess':
      artworkNode = (
        <div className="w-full h-32 rounded-xl border border-[#D5C4AE] overflow-hidden grid grid-cols-2 relative">
          <div className="bg-[#FAF6F0] flex items-center justify-end pr-1.5">
            <div className="grid grid-cols-4 gap-0.5 text-[9px] leading-none text-[#1A120E] font-mono select-none">
              <span>♜</span><span>♞</span><span>♝</span><span>♛</span>
              <span>♟</span><span>♟</span><span>♟</span><span>♟</span>
              <span className="opacity-25">·</span><span className="opacity-25">·</span><span className="opacity-25">·</span><span className="opacity-25">·</span>
              <span>♙</span><span>♙</span><span>♙</span><span>♙</span>
              <span>♖</span><span>♘</span><span>♗</span><span>♕</span>
            </div>
          </div>
          <div className="bg-[#2B1B12] flex items-center justify-start pl-1.5">
            <div className="grid grid-cols-4 gap-0.5 text-[9px] leading-none text-[#FAF6F0] font-mono select-none">
              <span>♚</span><span>♝</span><span>♞</span><span>♜</span>
              <span>♟</span><span>♟</span><span>♟</span><span>♟</span>
              <span className="opacity-25">·</span><span className="opacity-25">·</span><span className="opacity-25">·</span><span className="opacity-25">·</span>
              <span>♙</span><span>♙</span><span>♙</span><span>♙</span>
              <span>♔</span><span>♗</span><span>♘</span><span>♖</span>
            </div>
          </div>
        </div>
      );
      break;

    case 'chat':
    default:
      artworkNode = (
        <div className="w-full h-32 rounded-xl bg-gradient-to-b from-[#F5EFE6] via-[#EFE6D8] to-[#D5C4AE]/65 border border-[#D5C4AE] p-3 flex flex-col justify-center gap-2 relative overflow-hidden">
          <div className="self-start max-w-[82%] px-2.5 py-1 rounded-xl rounded-bl-xs bg-[#FAF6F0] border border-[#D5C4AE] text-[10px] font-semibold text-[#1A120E] shadow-2xs truncate">
            {title || 'Featured Link'}
          </div>
          <div className="self-end w-24 h-5 rounded-xl rounded-br-xs bg-[#6B4A2E] flex items-center px-2.5 shadow-2xs">
            <span className="h-1.5 w-full rounded bg-[#FAF6F0]/70" />
          </div>
          <div className="self-start w-28 h-5 rounded-xl rounded-bl-xs bg-[#FAF6F0] border border-[#D5C4AE] flex items-center px-2.5 shadow-2xs">
            <span className="h-1.5 w-full rounded bg-[#6B4A2E]/35" />
          </div>
        </div>
      );
      break;
  }

  return (
    <div className="relative">
      {artworkNode}
      {isLoading && (
        <div className="absolute inset-0 rounded-xl bg-[#FAF6F0]/75 backdrop-blur-[1px] flex items-center justify-center">
          <span className="px-2.5 py-1 rounded-lg bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[10px] font-semibold">
            Fetching preview...
          </span>
        </div>
      )}
    </div>
  );
};
