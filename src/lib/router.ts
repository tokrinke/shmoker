import { useEffect, useState } from 'react';

// Hash routing (#/room/abc) works on GitHub Pages without any server rewrite rules.
export type Route =
  | { page: 'home'; joinCode?: string }
  | { page: 'room'; roomId: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) return { page: 'room', roomId: parts[1] };
  if (parts[0] === 'join' && parts[1]) return { page: 'home', joinCode: parts[1].toUpperCase() };
  return { page: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const goToRoom = (roomId: string) => (window.location.hash = `#/room/${roomId}`);
export const goHome = () => (window.location.hash = '#/');

/** Full invite URL, e.g. https://you.github.io/poker/#/join/K7QX2M */
export function inviteLink(code: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/join/${code}`;
}
