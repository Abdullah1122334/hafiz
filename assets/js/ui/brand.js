// The Hafiz logo: a bookmark ("keep this") with a keyhole ("safely"), on the brand gradient.
export function logoSvg(size = 40) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lg-${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
    <rect width="64" height="64" rx="16" fill="url(#lg-${size})"/>
    <path d="M21 14h22a3 3 0 0 1 3 3v33.5a1.5 1.5 0 0 1-2.4 1.2L32 43.5l-11.6 8.2A1.5 1.5 0 0 1 18 50.5V17a3 3 0 0 1 3-3z" fill="#fff"/>
    <circle cx="32" cy="26.5" r="4.6" fill="#6d5cf5"/>
    <path d="M30 29.5h4l1.2 7.5h-6.4z" fill="#6d5cf5"/>
  </svg>`;
}
