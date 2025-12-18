import { base58btc } from 'multiformats/bases/base58';
import { bytesFrom } from '@ckb-ccc/core';

export const getDidKeyFromPublicHex = (pubHex: string): string => {
  try {
    const pub = bytesFrom(pubHex);
    const prefix = new Uint8Array([0xE7, 0x01]);
    const prefixed = new Uint8Array(prefix.length + pub.length);
    prefixed.set(prefix, 0);
    prefixed.set(pub, prefix.length);
    const mb = base58btc.encode(prefixed);
    return `did:key:${mb}`;
  } catch {
    return '';
  }
};