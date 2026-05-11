// src/utils/urlSafety.js
// URL validation and SSRF protection helpers

import dns from 'node:dns/promises';
import net from 'node:net';
import { BadRequestError } from './errors.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
  'metadata',
]);

const isPrivateIpv4 = (ip) => {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0
  );
};

const isPrivateIpv6 = (ip) => {
  const normalized = ip.toLowerCase();

  return (
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    normalized.includes('::ffff:127.')
  );
};

const isPrivateAddress = (address) => {
  const version = net.isIP(address);

  if (version === 4) {
    return isPrivateIpv4(address);
  }

  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return false;
};

export const assertSafeHttpUrl = async (rawUrl) => {
  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new BadRequestError('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new BadRequestError('Invalid URL: only http and https are allowed');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new BadRequestError('Invalid URL: local and private addresses are not allowed');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new BadRequestError('Invalid URL: local and private addresses are not allowed');
    }

    return parsedUrl;
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });

    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new BadRequestError('Invalid URL: local and private addresses are not allowed');
    }
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      throw new BadRequestError('Invalid URL: host could not be resolved');
    }

    throw error;
  }

  return parsedUrl;
};

export default {
  assertSafeHttpUrl,
};