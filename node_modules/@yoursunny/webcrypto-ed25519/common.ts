export const Ed25519Algorithm: Algorithm = {
  name: "Ed25519",
};

export const C = {
  kty: "OKP",
  crv: "Ed25519",
  oid: "2b6570",
} as const;

export function isEd25519Algorithm(a: AlgorithmIdentifier): boolean {
  return a === Ed25519Algorithm.name || (a as Algorithm).name === Ed25519Algorithm.name;
}
