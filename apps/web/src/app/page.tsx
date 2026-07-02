'use client';

import Link from 'next/link';
import { eraAuth, useSession } from '../lib/auth-client';

export default function HomePage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page">
        <h1>Era</h1>
        <p>Your wardrobe, reimagined.</p>
        <Link className="link" href="/sign-in">
          Sign in →
        </Link>
      </main>
    );
  }

  const { user } = session;
  const greeting = user.name.trim().length > 0 ? user.name : user.email;

  return (
    <main className="page">
      <h1>Hi {greeting}</h1>
      <p>
        <Link className="link" href="/onboarding">
          Set your username
        </Link>
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          void eraAuth.signOut();
        }}
      >
        Sign out
      </button>
    </main>
  );
}
