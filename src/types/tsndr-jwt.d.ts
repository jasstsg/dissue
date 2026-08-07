// @tsndr/cloudflare-worker-jwt ships no type definitions of its own.
// Minimal shim covering just what this project uses.
declare module '@tsndr/cloudflare-worker-jwt' {
    interface JwtPayload {
        [key: string]: unknown;
    }

    interface SignOptions {
        algorithm?: string;
    }

    const jwt: {
        sign(payload: JwtPayload, secret: string, options?: SignOptions): Promise<string>;
    };

    export default jwt;
}
