'use client';

import { type ClipboardEvent, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@era/core/strings';
import { Text } from '../Text';
import { Card } from '../Card';
import { Input } from '../Input';
import { Button } from '../Button';
import { pressProps } from '../../lib/motion';

export interface PhotoPickerProps {
  /** Fires with the chosen image File (from camera capture or the library). */
  onPick: (file: File) => void;
  /** Fires with a validated https product URL to import. */
  onLink: (url: string) => void;
  /** Controlled value of the link field (lifted so a failed import can retry it). */
  linkValue: string;
  /** Reports edits to the link field back to the flow. */
  onLinkChange: (value: string) => void;
  /** When a prior import failed, the submit reads as a retry. */
  linkFailed?: boolean;
  /** Enters the batch (several-at-once) capture path. */
  onBulk: () => void;
  /** Enters the receipt-import path. */
  onReceipt: () => void;
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  width: '100%',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  gridTemplateColumns: '1fr 1fr',
  width: '100%',
};

const labelStyle: CSSProperties = {
  display: 'block',
  cursor: 'pointer',
};

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const tileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--space-16)',
  padding: 'var(--space-6)',
  textAlign: 'center',
};


const linkSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  paddingTop: 'var(--space-6)',
  borderTop: '1px solid var(--color-hairline)',
};

const linkRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'flex-end',
};

const linkFieldStyle: CSSProperties = {
  flex: 1,
};


// The two secondary capture paths (batch + receipt) sit as quiet rows beneath
// the link, subordinate to the two photo tiles — one primary way in (a photo),
// a couple of understated alternates, rather than five equal choices.
const moreSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'var(--space-4)',
  borderTop: '1px solid var(--color-hairline)',
};

const moreRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-2)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

/** Parse a trimmed value to an https URL, or null when it isn't one. */
function parseHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The add-flow entry: two big tiles over one image input each, plus an
 * "add from a link" row beneath them. "Take photo" asks for the rear camera via
 * `capture`; "Choose photo" opens the library. Each tile is a real <label>
 * wrapping a visually-hidden file input, so the whole card is a native,
 * accessible trigger. The link row validates client-side (https URL) and
 * auto-submits when a pasted string already parses as one — one less tap.
 */
export function PhotoPicker({
  onPick,
  onLink,
  linkValue,
  onLinkChange,
  linkFailed = false,
  onBulk,
  onReceipt,
}: PhotoPickerProps) {
  const reduced = useReducedMotion();
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so re-picking the same file still fires change.
    event.target.value = '';
    if (file) onPick(file);
  }

  const validUrl = parseHttpsUrl(linkValue);

  function handleSubmit() {
    if (validUrl) onLink(validUrl);
  }

  // Auto-submit when the pasted text is itself a usable link (saves a tap).
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const url = parseHttpsUrl(event.clipboardData.getData('text'));
    if (!url) return;
    event.preventDefault();
    onLinkChange(url);
    onLink(url);
  }

  return (
    <div style={containerStyle}>
      <div style={gridStyle}>
        <label style={labelStyle}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={hiddenInputStyle}
            onChange={handleChange}
          />
          <Card interactive>
            <div style={tileStyle}>
              <Text variant="ui" as="span" size="title1" style={{ lineHeight: '1' }} aria-hidden="true">
                ◉
              </Text>
              <Text variant="ui" as="span" size="subhead" weight={600} style={{ color: 'var(--color-text)' }}>{strings.closet.takePhoto}</Text>
            </div>
          </Card>
        </label>

        <label style={labelStyle}>
          <input type="file" accept="image/*" style={hiddenInputStyle} onChange={handleChange} />
          <Card interactive>
            <div style={tileStyle}>
              <Text variant="ui" as="span" size="title1" style={{ lineHeight: '1' }} aria-hidden="true">
                ▦
              </Text>
              <Text variant="ui" as="span" size="subhead" weight={600} style={{ color: 'var(--color-text)' }}>{strings.closet.pickPhoto}</Text>
            </div>
          </Card>
        </label>
      </div>

      <div style={linkSectionStyle}>
        <div style={linkRowStyle}>
          <div style={linkFieldStyle}>
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              label={strings.closet.addFromLink}
              placeholder={strings.closet.pasteLink}
              value={linkValue}
              onChange={(event) => onLinkChange(event.target.value)}
              onPaste={handlePaste}
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleSubmit}
            disabled={!validUrl}
            aria-label={strings.closet.addFromLink}
          >
            {linkFailed ? (
              strings.closet.retryCta
            ) : (
              <Text variant="ui" as="span" size="body" style={{ lineHeight: '1' }} aria-hidden="true">
                →
              </Text>
            )}
          </Button>
        </div>
      </div>

      <div style={moreSectionStyle}>
        <motion.button type="button" style={moreRowStyle} onClick={onBulk} {...pressProps(reduced)}>
          <Text variant="ui" as="span" size="subhead" weight={600} style={{ color: 'var(--color-secondary-strong)' }}>{strings.closet.bulkCapture.entryCta}</Text>
          <Text variant="ui" as="span" size="body" style={{ color: 'var(--color-secondary)', lineHeight: '1' }} aria-hidden="true">
            →
          </Text>
        </motion.button>
        <motion.button type="button" style={moreRowStyle} onClick={onReceipt} {...pressProps(reduced)}>
          <Text variant="ui" as="span" size="subhead" weight={600} style={{ color: 'var(--color-secondary-strong)' }}>{strings.closet.importReceipt.entryCta}</Text>
          <Text variant="ui" as="span" size="body" style={{ color: 'var(--color-secondary)', lineHeight: '1' }} aria-hidden="true">
            →
          </Text>
        </motion.button>
      </div>
    </div>
  );
}
