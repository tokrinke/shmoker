import type { SVGProps } from 'react';

// Small line icons (no icon library needed). Size follows the font: <IconCoins size={18} />.
type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number };

function icon(paths: JSX.Element, options: { filled?: boolean } = {}) {
  return function Icon({ size = 20, ...props }: IconProps) {
    return (
      <svg
        className="icon"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={options.filled ? 'currentColor' : 'none'}
        stroke={options.filled ? 'none' : 'currentColor'}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const IconSound = icon(<><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a8 8 0 0 1 0 11" /></>);
export const IconSoundOff = icon(<><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>);
export const IconExit = icon(<><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></>);
export const IconCopy = icon(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>);
export const IconCrown = icon(<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />, { filled: true });
export const IconCoins = icon(<><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>);
export const IconWallet = icon(<><path d="M4 7a2 2 0 0 1 2-2h11v3" /><rect x="3" y="7" width="18" height="12" rx="2" /><circle cx="16.5" cy="13" r="1.1" fill="currentColor" /></>);
export const IconFold = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const IconCheck = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconCall = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12h7M13 8.5l3.5 3.5-3.5 3.5" /></>);
export const IconRaise = icon(<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" />);
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconEnter = icon(<><path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8" /><path d="M14 8l4 4-4 4" /><path d="M18 12H4" /></>);
export const IconArrowRight = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconUsers = icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.2 2.7-5 6-5s6 1.8 6 5" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.3c1.8.7 3 2.2 3 4.7" /></>);
export const IconClock = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconLock = icon(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconBell = icon(<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>);
