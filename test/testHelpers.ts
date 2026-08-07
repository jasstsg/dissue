import { generateKeyPairSync } from 'node:crypto';

// Real (but throwaway) RSA key so code paths that actually sign a JWT
// (github.ts's signAppJwt) succeed in tests, instead of throwing on
// obviously-fake key material. Generated once and cached since it's
// somewhat expensive.
let cachedTestPrivateKey: string | undefined;

export function testGitHubAppPrivateKey(): string {
    if (!cachedTestPrivateKey) {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
        });
        cachedTestPrivateKey = privateKey;
    }
    return cachedTestPrivateKey;
}

// Minimal in-memory stand-in for KVNamespace, covering only the methods
// this codebase actually calls (get/put/delete).
export function createFakeKV(initial: Record<string, string> = {}): KVNamespace {
    const store = new Map(Object.entries(initial));
    return {
        async get(key: string) {
            return store.has(key) ? store.get(key)! : null;
        },
        async put(key: string, value: string) {
            store.set(key, value);
        },
        async delete(key: string) {
            store.delete(key);
        },
    } as unknown as KVNamespace;
}
