import React from 'react';
import type { SocialLink } from '../data/profileData';

export const BrandIcon: React.FC<{ platform: SocialLink['platform']; className?: string }> = ({
  platform,
  className = 'w-4 h-4',
}) => {
  switch (platform) {
    case 'x':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'github':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          />
        </svg>
      );
    case 'medium':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
        </svg>
      );
    case 'stackoverflow':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M15 21h-10v-2h10v2zm6-11.665l-1.621-9.335-1.973.346 1.62 9.335 1.974-.346zm-5.964 6.937l-9.746-.975-.186 2.016 9.755.879.177-1.92zm.538-2.587l-9.276-2.608-.526 1.954 9.306 2.5.496-1.846zm1.204-2.413l-8.297-4.864-1.029 1.743 8.298 4.865 1.028-1.744zm1.866-1.467l-5.339-7.829-1.672 1.14 5.339 7.829 1.672-1.14zm-2.644 4.195v8h-12v-8h-2v10h16v-10h-2z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
        </svg>
      );
    case 'spotify':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.348-1.435-5.304-1.76-8.785-.964-.335.077-.67-.133-.746-.469-.077-.335.132-.67.469-.746 3.809-.871 7.077-.496 9.713 1.115.293.18.386.563.206.857zm1.225-2.723c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.125-.848-.106-.973-.517-.125-.413.108-.848.518-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.258 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.865 13.115 1.338.445.264.59.838.327 1.282-.264.443-.838.59-1.282.325z" />
        </svg>
      );
    case 'soundcloud':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M11.56 8.87V17h8.76c1.85-.13 2.68-1.27 2.68-2.67 0-1.49-1.12-2.67-2.61-2.67-.33 0-.65.08-.96.2-.43-2.16-2.31-3.77-4.57-3.77-1.25 0-2.42.5-3.3 1.78zm-2.15 1.18v6.95h1.25V9.5c-.46.12-.88.31-1.25.55zm-2.1 1.48V17h1.25v-5.88c-.45.05-.87.2-1.25.41zm-2.06.79V17h1.25v-4.38c-.43-.07-.86-.1-1.25-.3zm-2.07 1.26V17h1.25v-3.54c-.47.03-.91.07-1.25.12zM1 14.81V17h1.25v-2.45c-.55.04-.97.14-1.25.26z" />
        </svg>
      );
  }
};

export const VerifiedBadge: React.FC<{ className?: string; title?: string }> = ({
  className = 'w-4 h-4',
  title = 'Verified Creator',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    role="img"
    aria-label={title}
  >
    <title>{title}</title>
    <path
      d="M12 2L14.4 4.1L17.5 3.7L18.7 6.6L21.6 7.8L21.2 10.9L23.3 13.3L21.2 15.7L21.6 18.8L18.7 20L17.5 22.9L14.4 22.5L12 24.6L9.6 22.5L6.5 22.9L5.3 20L2.4 18.8L2.8 15.7L0.7 13.3L2.8 10.9L2.4 7.8L5.3 6.6L6.5 3.7L9.6 4.1L12 2Z"
      fill="#A88462"
    />
    <path
      d="M9.5 13.2L11.2 14.9L15.2 10.9"
      stroke="#1A120E"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const BuilderBadge: React.FC<{ className?: string; title?: string }> = ({
  className = 'w-4 h-4',
  title = 'Link Hub Builder',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    role="img"
    aria-label={title}
  >
    <title>{title}</title>
    <path
      d="M12 2L4 5.6V11.6C4 16.8 7.4 21.6 12 23C16.6 21.6 20 16.8 20 11.6V5.6L12 2Z"
      fill="#6B4A2E"
      stroke="#D5C4AE"
      strokeWidth="1.5"
    />
    <path
      d="M9.5 12.3L11.2 14L14.8 10.2"
      stroke="#D5C4AE"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const WebsiteBrandLogo: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-6 h-6', title = 'RajdeepBhattacharyya-LinkHub Logo' }) => (
  <svg
    viewBox="0 0 256 256"
    fill="none"
    className={className}
    role="img"
    aria-label={title}
  >
    <title>{title}</title>
    <defs>
      <linearGradient id="lhBrandBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3A2418" />
        <stop offset="55%" stopColor="#281810" />
        <stop offset="100%" stopColor="#1A120E" />
      </linearGradient>
      <linearGradient id="lhBrandCopper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#DFC3A4" />
        <stop offset="45%" stopColor="#B88E65" />
        <stop offset="100%" stopColor="#7A5333" />
      </linearGradient>
      <linearGradient id="lhBrandIvory" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#FAF6F0" />
        <stop offset="100%" stopColor="#E6D8C5" />
      </linearGradient>
    </defs>
    <rect
      x="8"
      y="8"
      width="240"
      height="240"
      rx="56"
      fill="url(#lhBrandBg)"
      stroke="#A88462"
      strokeWidth="8"
    />
    <rect
      x="22"
      y="22"
      width="212"
      height="212"
      rx="42"
      fill="none"
      stroke="#D5C4AE"
      strokeOpacity="0.3"
      strokeWidth="3"
    />
    <g
      fill="none"
      stroke="url(#lhBrandCopper)"
      strokeWidth="18"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M82 68 V188" />
      <path d="M82 68 H120 C140 68 152 80 152 97 C152 114 140 126 120 126 H82" />
      <path d="M114 126 L150 188" />
      <path d="M138 68 H162 C180 68 192 79 192 95 C192 109 182 119 168 123 C185 127 196 139 196 157 C196 175 182 188 160 188 H134" />
    </g>
    <path
      d="M52 128 C52 106 68 92 90 92 H116 C132 92 142 104 148 128 C154 152 164 164 180 164 H186 C202 164 212 150 212 128 C212 106 200 94 182 94"
      fill="none"
      stroke="#1A120E"
      strokeWidth="22"
      strokeLinecap="round"
    />
    <path
      d="M52 128 C52 106 68 92 90 92 H116 C132 92 142 104 148 128 C154 152 164 164 180 164 H186 C202 164 212 150 212 128 C212 106 200 94 182 94"
      fill="none"
      stroke="url(#lhBrandIvory)"
      strokeWidth="12"
      strokeLinecap="round"
    />
    <path
      d="M82 76 V112"
      fill="none"
      stroke="url(#lhBrandCopper)"
      strokeWidth="18"
      strokeLinecap="round"
    />
  </svg>
);

