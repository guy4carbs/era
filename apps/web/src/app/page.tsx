import { redirect } from 'next/navigation';

/**
 * The root lands everyone on the tab shell. Session-aware chrome (greeting /
 * sign-in / sign-out) now lives in the Feed screen's header; sign-in and
 * onboarding stay outside the (tabs) group.
 */
export default function RootPage() {
  redirect('/feed');
}
