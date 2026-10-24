import { useEffect, useState } from 'react';
import { LandingPage } from './components/landing/LandingPage';
import { RoomPage } from './components/RoomPage';
import { useRoute } from './lib/router';
import { ensureGuestSession, isConfigured } from './lib/supabase';

export default function App() {
  const route = useRoute();
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isConfigured) return;
    ensureGuestSession().then(setUserId).catch((problem: Error) => setError(problem.message));
  }, []);

  if (!isConfigured) {
    return (
      <main className="room-message panel">
        <h1>Setup needed</h1>
        <p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example and the README), then rebuild.</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="room-message panel">
        <h1>Could not start</h1>
        <p>{error}</p>
        <button className="button" onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  }
  if (!userId) return <main className="room-screen"><div className="skeleton room-screen__skeleton" /></main>;

  return route.page === 'room' ? (
    <RoomPage key={route.roomId} roomId={route.roomId} userId={userId} />
  ) : (
    <LandingPage joinCode={route.joinCode} />
  );
}
