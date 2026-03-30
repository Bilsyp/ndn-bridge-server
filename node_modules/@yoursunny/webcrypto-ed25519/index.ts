export { Ed25519Algorithm } from "./common.js";

export const hasNativeSupport = true;

export function ponyfillEd25519(): SubtleCrypto {
  return crypto.subtle;
}

export function polyfillEd25519(): void {
  //
}
