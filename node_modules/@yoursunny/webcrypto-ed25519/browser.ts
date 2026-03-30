import * as ed from "@noble/ed25519";
import * as asn1 from "@yoursunny/asn1";
// @ts-expect-error no typing
import { toBase64Url as b64encode, toBuffer as b64decode } from "b64u-lite";

import { C, isEd25519Algorithm } from "./common.js";

export { Ed25519Algorithm } from "./common.js";

function asUint8Array(b: BufferSource): Uint8Array {
  if (b instanceof Uint8Array) {
    return b;
  }
  if (b instanceof ArrayBuffer) {
    return new Uint8Array(b);
  }
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

function asArrayBuffer(b: Uint8Array): ArrayBuffer {
  if (b.byteLength === b.buffer.byteLength) {
    return b.buffer as ArrayBuffer;
  }
  return (b.buffer as ArrayBuffer).slice(b.byteOffset, b.byteLength);
}

const slot = "8d9df0f7-1363-4d2c-8152-ce4ed78f27d8";

interface Ed25519CryptoKey extends CryptoKey {
  [slot]: Uint8Array;
}

class Ponyfill implements Record<keyof SubtleCrypto, Function> {
  constructor(private readonly super_: SubtleCrypto) {
    this.orig_ = {} as any;
    for (const method of ["generateKey", "exportKey", "importKey", "encrypt", "decrypt", "wrapKey", "unwrapKey", "deriveBits", "deriveKey", "sign", "verify", "digest"] as const) {
      if (this[method]) {
        this.orig_[method] = super_[method];
      } else {
        this[method] = super_[method].bind(super_) as any;
      }
    }
  }

  private readonly orig_: Record<keyof SubtleCrypto, Function>;

  public async generateKey(algorithm: KeyAlgorithm, extractable: boolean, keyUsages: Iterable<KeyUsage>): Promise<CryptoKeyPair> {
    if (isEd25519Algorithm(algorithm)) {
      const pvt = ed.utils.randomPrivateKey();
      const pub = await ed.getPublicKeyAsync(pvt);

      const usages = Array.from(keyUsages);
      const privateKey: Ed25519CryptoKey = {
        algorithm,
        extractable,
        type: "private",
        usages,
        [slot]: pvt,
      };
      const publicKey: Ed25519CryptoKey = {
        algorithm,
        extractable: true,
        type: "public",
        usages,
        [slot]: pub,
      };
      return { privateKey, publicKey };
    }
    return this.orig_.generateKey.apply(this.super_, arguments);
  }

  public async exportKey(format: KeyFormat, key: CryptoKey): Promise<JsonWebKey | ArrayBuffer> {
    if (isEd25519Algorithm(key.algorithm) && key.extractable) {
      const raw = (key as Ed25519CryptoKey)[slot];
      switch (format) {
        case "jwk": {
          const jwk: JsonWebKey = {
            kty: C.kty,
            crv: C.crv,
          };
          if (key.type === "public") {
            jwk.x = b64encode(raw);
          } else {
            jwk.d = b64encode(raw);
            jwk.x = b64encode(await ed.getPublicKeyAsync(raw));
          }
          return jwk;
        }
        case "spki": {
          return asArrayBuffer(asn1.pack([
            "30",
            [
              ["30", [["06", "2B6570"]]],
              ["03", raw],
            ],
          ]));
        }
      }
    }
    return this.orig_.exportKey.apply(this.super_, arguments);
  }

  public async importKey(format: KeyFormat, keyData: JsonWebKey | BufferSource, algorithm: Algorithm, extractable: boolean, keyUsages: Iterable<KeyUsage>): Promise<CryptoKey> {
    if (isEd25519Algorithm(algorithm)) {
      const usages = Array.from(keyUsages);
      switch (format) {
        case "jwk": {
          const jwk = keyData as JsonWebKey;
          if (jwk.kty !== C.kty || jwk.crv !== C.crv || !jwk.x) {
            break;
          }

          const key: Ed25519CryptoKey = {
            algorithm,
            extractable,
            type: jwk.d ? "private" : "public",
            usages,
            [slot]: b64decode(jwk.d ?? jwk.x),
          };
          return key;
        }
        case "spki": {
          const der = asn1.parseVerbose(asUint8Array(keyData as BufferSource));
          const algo = der.children?.[0]?.children?.[0]?.value;
          const raw = der.children?.[1]?.value;
          if (!(algo instanceof Uint8Array) || ed.etc.bytesToHex(algo) !== C.oid || !(raw instanceof Uint8Array)) {
            break;
          }
          const key: Ed25519CryptoKey = {
            algorithm,
            extractable: true,
            type: "public",
            usages,
            [slot]: raw,
          };
          return key;
        }
      }
    }
    return this.orig_.importKey.apply(this.super_, arguments);
  }

  public async sign(algorithm: AlgorithmIdentifier, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer> {
    if (isEd25519Algorithm(algorithm) && isEd25519Algorithm(key.algorithm) && key.type === "private" && key.usages.includes("sign")) {
      return asArrayBuffer(await ed.signAsync(asUint8Array(data), (key as Ed25519CryptoKey)[slot]));
    }
    return this.orig_.sign.apply(this.super_, arguments);
  }

  public async verify(algorithm: AlgorithmIdentifier, key: CryptoKey, signature: BufferSource, data: BufferSource): Promise<boolean> {
    if (isEd25519Algorithm(algorithm) && isEd25519Algorithm(key.algorithm) && key.type === "public" && key.usages.includes("verify")) {
      return ed.verifyAsync(asUint8Array(signature), asUint8Array(data), (key as Ed25519CryptoKey)[slot]);
    }
    return this.orig_.verify.apply(this.super_, arguments);
  }
}
interface Ponyfill extends Record<keyof SubtleCrypto, Function> {}

async function checkNativeSupport(): Promise<boolean> {
  try {
    // https://datatracker.ietf.org/doc/html/rfc8037#appendix-A
    const jwk: JsonWebKey = {
      kty: "OKP",
      crv: "Ed25519",
      d: "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A",
      x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
    };
    const pvt = await crypto.subtle.importKey("jwk", jwk, "Ed25519", false, ["sign"]);
    delete jwk.d;
    const pub = await crypto.subtle.importKey("jwk", jwk, "Ed25519", true, ["verify"]);
    const data = new TextEncoder().encode("eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc");
    const sig = await crypto.subtle.sign("Ed25519", pvt, data);
    const verified = await crypto.subtle.verify("Ed25519", pub, sig, data);
    return verified && ed.etc.bytesToHex(new Uint8Array(sig)) ===
      "860c98d2297f3060a33f42739672d61b53cf3adefed3d3c672f320dc021b411e9d59b8628dc351e248b88b29468e0e41855b0fb7d83bb15be902bfccb8cd0a02";
  } catch {
    return false;
  }
}

export const hasNativeSupport = await checkNativeSupport();

export function ponyfillEd25519(): SubtleCrypto {
  if (hasNativeSupport) {
    return crypto.subtle;
  }
  return new Ponyfill(crypto.subtle) as unknown as SubtleCrypto;
}

export function polyfillEd25519(): void {
  if (hasNativeSupport) {
    return;
  }
  Object.defineProperty(globalThis.crypto, "subtle", {
    value: ponyfillEd25519(),
    configurable: true,
  });
}
