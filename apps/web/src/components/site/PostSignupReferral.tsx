'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Button, Input, Text } from '../index';
import { track } from '../../lib/analytics';

export interface PostSignupReferralProps {
  referralCode: string;
  /** True when the email was already on the list — shown as a friendly note. */
  alreadyJoined: boolean;
}

// Micro-copy not (yet) in the locked deck — see the note to Quill in the report.
// Kept as named constants so a future string can replace them in one place.
const ALREADY_JOINED_NOTE = "You're already on the list.";
const COPIED_LABEL = 'Copied';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  alignItems: 'center',
  textAlign: 'center',
};

const confirmStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const lineStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  width: '100%',
};

/**
 * The post-signup state: a warm confirmation, the referral nudge, and a
 * shareable invite link with copy-to-clipboard. The link is built from the live
 * `window.location.origin` on mount (client-only) so it is correct in any
 * environment. Copying fires the `referral_copy` analytics event.
 */
export function PostSignupReferral({ referralCode, alreadyJoined }: PostSignupReferralProps) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLink(`${window.location.origin}/?ref=${referralCode}`);
  }, [referralCode]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard may be blocked (permissions / insecure context) — the link is
      // still visible in the field for manual copy, so fail quietly.
    }
    setCopied(true);
    track('referral_copy');
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={wrapStyle}>
      <Text variant="title" as="p" size="title2" style={confirmStyle}>
        {alreadyJoined ? ALREADY_JOINED_NOTE : strings.site.form.success}
      </Text>
      <Text variant="body" as="p" style={lineStyle}>
        {strings.site.referral.line}
      </Text>
      <div style={rowStyle}>
        <Input
          readOnly
          value={link}
          aria-label="Your invite link"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" onClick={copy} disabled={!link}>
          {copied ? COPIED_LABEL : strings.site.referral.cta}
        </Button>
      </div>
    </div>
  );
}
