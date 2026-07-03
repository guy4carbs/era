/**
 * SSRF address-classifier tests for the import-from-url guard.
 *
 * These exercise the PURE address classifiers (isPrivateIPv6 / isPrivateIPv4 /
 * isPrivateAddress) directly rather than assertPublicUrl, which resolves DNS.
 * The focus is the IPv4-mapped IPv6 bypass: the WHATWG URL parser normalizes
 * `[::ffff:169.254.169.254]` to the HEX form `::ffff:a9fe:a9fe`, which the old
 * dotted-only regex missed — letting metadata / loopback / private-v4 targets
 * pass as "public".
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/url-import.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, isPrivateIPv4, isPrivateIPv6 } from './url-import.ts';

// The full Sentinel bypass set, in the DOTTED form a user would type.
const BYPASS_DOTTED = [
  '::ffff:127.0.0.1', // loopback
  '::ffff:169.254.169.254', // cloud metadata
  '::ffff:10.0.0.1', // private 10/8
  '::ffff:192.168.1.1', // private 192.168/16
  '::ffff:172.20.0.1', // private 172.16/12
];

// The SAME addresses in the HEX form the WHATWG URL parser normalizes them to.
// (Verified: new URL('https://[::ffff:169.254.169.254]/').hostname === '[::ffff:a9fe:a9fe]'.)
const BYPASS_HEX = [
  '::ffff:7f00:1', // 127.0.0.1
  '::ffff:a9fe:a9fe', // 169.254.169.254
  '::ffff:a00:1', // 10.0.0.1
  '::ffff:c0a8:101', // 192.168.1.1
  '::ffff:ac14:1', // 172.20.0.1
];

test('IPv4-mapped bypass (dotted form) is blocked', () => {
  for (const addr of BYPASS_DOTTED) {
    assert.equal(isPrivateIPv6(addr), true, `${addr} must be blocked`);
  }
});

test('IPv4-mapped bypass (WHATWG-normalized hex form) is blocked', () => {
  for (const addr of BYPASS_HEX) {
    assert.equal(isPrivateIPv6(addr), true, `${addr} must be blocked`);
  }
});

test('end-to-end: bracketed literals normalized by new URL() are blocked', () => {
  // Proves the real request path: parse the user URL, unwrap the [..], classify.
  const literals = [
    '[::ffff:127.0.0.1]',
    '[::ffff:169.254.169.254]',
    '[::ffff:10.0.0.1]',
    '[::ffff:192.168.1.1]',
    '[::ffff:172.20.0.1]',
    '[64:ff9b::7f00:1]',
  ];
  for (const literal of literals) {
    const hostname = new URL(`https://${literal}/`).hostname.replace(/^\[/, '').replace(/\]$/, '');
    assert.equal(isPrivateAddress(hostname), true, `${literal} (→ ${hostname}) must be blocked`);
  }
});

test('IPv4-translated ::ffff:0:0:0/96 embedding a private v4 is blocked', () => {
  assert.equal(isPrivateIPv6('::ffff:0:7f00:1'), true); // 127.0.0.1
  assert.equal(isPrivateIPv6('::ffff:0:a9fe:a9fe'), true); // 169.254.169.254
});

test('NAT64 well-known 64:ff9b::/96 is blocked', () => {
  assert.equal(isPrivateIPv6('64:ff9b::7f00:1'), true); // embeds 127.0.0.1
  assert.equal(isPrivateIPv6('64:ff9b::a9fe:a9fe'), true); // embeds 169.254.169.254
  assert.equal(isPrivateIPv6('64:ff9b::808:808'), true); // embeds 8.8.8.8 — still reject the prefix
});

test('NAT64 local-use 64:ff9b:1::/48 is blocked', () => {
  assert.equal(isPrivateIPv6('64:ff9b:1::1'), true);
});

test('plain private / reserved IPv6 checks stay intact', () => {
  assert.equal(isPrivateIPv6('::1'), true); // loopback
  assert.equal(isPrivateIPv6('::'), true); // unspecified
  assert.equal(isPrivateIPv6('fe80::1'), true); // link-local
  assert.equal(isPrivateIPv6('fd00::1'), true); // unique-local
  assert.equal(isPrivateIPv6('fc00::1'), true); // unique-local
});

test('mapped PUBLIC host still passes', () => {
  assert.equal(isPrivateIPv6('::ffff:8.8.8.8'), false);
  assert.equal(isPrivateIPv6('::ffff:808:808'), false); // hex form of 8.8.8.8
  assert.equal(isPrivateIPv6('::ffff:1.1.1.1'), false);
});

test('genuine public IPv6 still passes', () => {
  assert.equal(isPrivateIPv6('2606:4700::1'), false); // Cloudflare
  assert.equal(isPrivateIPv6('2001:4860:4860::8888'), false); // Google DNS
});

test('malformed IPv6 is treated as unsafe', () => {
  assert.equal(isPrivateIPv6('::ffff:1.2.3'), true); // short v4 tail
  assert.equal(isPrivateIPv6('::ffff:999.0.0.1'), true); // octet out of range
  assert.equal(isPrivateIPv6('gg::1'), true); // non-hex group
  assert.equal(isPrivateIPv6('1::2::3'), true); // double '::'
});

test('isPrivateIPv4 core ranges', () => {
  for (const ip of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '192.168.1.1', '172.20.0.1', '0.0.0.0']) {
    assert.equal(isPrivateIPv4(ip), true, `${ip} must be private`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
    assert.equal(isPrivateIPv4(ip), false, `${ip} must be public`);
  }
});

test('isPrivateAddress dispatches by version and rejects non-IPs', () => {
  assert.equal(isPrivateAddress('::ffff:169.254.169.254'), true);
  assert.equal(isPrivateAddress('::ffff:a9fe:a9fe'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('2606:4700::1'), false);
  assert.equal(isPrivateAddress('not-an-ip'), true);
});
