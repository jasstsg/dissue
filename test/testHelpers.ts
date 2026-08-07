import { generateKeyPairSync } from 'node:crypto';
import { InteractionType } from 'discord-api-types/v10';
import type { APIChatInputApplicationCommandGuildInteraction, APIModalSubmitGuildInteraction, APIModalSubmissionComponent } from 'discord-api-types/v10';

// Minimal fixture covering only the fields this codebase actually reads
// (guild_id, member.permissions, data.name) — cast past the rest of the
// (large, mostly-irrelevant-here) real interaction shape.
export function makeGuildCommandInteraction(overrides: {
    guildId?: string;
    permissions?: string;
    commandName?: string;
} = {}): APIChatInputApplicationCommandGuildInteraction {
    return {
        id: 'interaction-id',
        application_id: 'app-id',
        type: InteractionType.ApplicationCommand,
        token: 'interaction-token',
        version: 1,
        guild_id: overrides.guildId ?? 'guild-1',
        member: {
            permissions: overrides.permissions ?? String(0x8), // Administrator by default
            user: { id: 'user-1', username: 'tester' },
        },
        data: {
            id: 'command-id',
            name: overrides.commandName ?? 'feedback',
            type: 1,
        },
    } as unknown as APIChatInputApplicationCommandGuildInteraction;
}

export function makeModalSubmitInteraction(overrides: {
    guildId?: string;
    customId?: string;
    components?: APIModalSubmissionComponent[];
    username?: string;
} = {}): APIModalSubmitGuildInteraction {
    return {
        id: 'interaction-id',
        application_id: 'app-id',
        type: InteractionType.ModalSubmit,
        token: 'interaction-token',
        version: 1,
        guild_id: overrides.guildId ?? 'guild-1',
        member: { user: { id: 'user-1', username: overrides.username ?? 'tester' } },
        data: {
            custom_id: overrides.customId ?? 'feedbackReportModal',
            components: overrides.components ?? [],
        },
    } as unknown as APIModalSubmitGuildInteraction;
}

// Captures promises passed to ctx.waitUntil so tests can await the
// deferred background work instead of racing it.
export function makeExecutionContext() {
    const promises: Promise<unknown>[] = [];
    const ctx = {
        waitUntil(promise: Promise<unknown>) {
            promises.push(promise);
        },
    } as unknown as ExecutionContext;
    return {
        ctx,
        flush: () => Promise.all(promises),
    };
}

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
