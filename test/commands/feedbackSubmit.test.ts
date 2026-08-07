import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentType } from 'discord-api-types/v10';
import type { APIModalSubmissionComponent } from 'discord-api-types/v10';
import { fieldValue, handleFeedbackModalSubmit } from '../../src/commands/feedbackSubmit.js';
import type { Env } from '../../src/env.js';
import type { GuildConfig } from '../../src/guildConfig.js';
import {
    createFakeKV,
    testGitHubAppPrivateKey,
    makeModalSubmitInteraction,
    makeExecutionContext,
} from '../testHelpers.js';

function makeEnv(kv: KVNamespace): Env {
    return {
        GUILD_CONFIG: kv,
        DISCORD_PUBLIC_KEY: 'unused',
        DISCORD_APPLICATION_ID: 'unused',
        GITHUB_APP_ID: 'unused',
        GITHUB_APP_SLUG: 'unused',
        GITHUB_APP_PRIVATE_KEY: testGitHubAppPrivateKey(),
    };
}

function kvWithGuildConfig(guildId: string, config: GuildConfig): KVNamespace {
    return createFakeKV({ [`guild:${guildId}`]: JSON.stringify(config) });
}

function labelRow(customId: string, value: string): APIModalSubmissionComponent {
    return {
        type: ComponentType.Label,
        component: { type: ComponentType.TextInput, custom_id: customId, value },
    };
}

function selectRow(customId: string, values: string[]): APIModalSubmissionComponent {
    return {
        type: ComponentType.Label,
        component: { type: ComponentType.StringSelect, custom_id: customId, values },
    };
}

test('fieldValue reads a text input\'s value', () => {
    const rows = [labelRow('foo', 'bar'), labelRow('baz', 'qux')];
    assert.equal(fieldValue(rows, 'baz'), 'qux');
});

test('fieldValue reads a select\'s first selected value', () => {
    const rows = [selectRow('feedbackType', ['discord:bug'])];
    assert.equal(fieldValue(rows, 'feedbackType'), 'discord:bug');
});

test('fieldValue returns an empty string when the custom_id is not present', () => {
    assert.equal(fieldValue([labelRow('foo', 'bar')], 'missing'), '');
});

function mockDiscordAndGitHub(t: import('node:test').TestContext, options: {
    createIssueResponses: Array<{ status: number; body: unknown }>;
    labels?: { name: string }[];
}) {
    const editedMessages: unknown[] = [];
    const followups: unknown[] = [];
    let issueCallCount = 0;

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? 'GET';

        if (url.includes('/access_tokens')) {
            return new Response(JSON.stringify({ token: 'fake-token' }), { status: 200 });
        }
        if (url.includes('/labels') && method === 'GET') {
            return new Response(JSON.stringify(options.labels ?? []), { status: 200 });
        }
        if (url.includes('/issues') && method === 'POST') {
            const attempt = options.createIssueResponses[issueCallCount] ?? options.createIssueResponses.at(-1)!;
            issueCallCount++;
            return new Response(JSON.stringify(attempt.body), { status: attempt.status });
        }
        if (url.includes('/webhooks/') && url.endsWith('/messages/@original') && method === 'PATCH') {
            editedMessages.push(JSON.parse(init!.body as string));
            return new Response(null, { status: 200 });
        }
        if (url.includes('/webhooks/') && method === 'POST') {
            followups.push(JSON.parse(init!.body as string));
            return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    return { editedMessages, followups };
}

test('handleFeedbackModalSubmit creates an issue with the selected label and reports success', async (t) => {
    const kv = kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    });
    const env = makeEnv(kv);
    const { editedMessages, followups } = mockDiscordAndGitHub(t, {
        createIssueResponses: [
            { status: 201, body: { number: 42, title: 'Bug title', html_url: 'https://github.com/jasstsg/dissue/issues/42' } },
        ],
    });

    const interaction = makeModalSubmitInteraction({
        guildId: 'guild-1',
        components: [
            labelRow('feedbackTitle', 'Bug title'),
            labelRow('feedbackDescription', 'Bug description'),
            selectRow('feedbackType', ['discord:bug']),
        ],
    });

    const { ctx, flush } = makeExecutionContext();
    await handleFeedbackModalSubmit(interaction, env, ctx);
    await flush();

    assert.equal(editedMessages.length, 1);
    assert.match((editedMessages[0] as { content: string }).content, /submitted/i);
    assert.equal(followups.length, 1);
    assert.match((followups[0] as { content: string }).content, /#42/);
});

test('handleFeedbackModalSubmit resyncs labels and retries once on a stale label', async (t) => {
    const kv = kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    });
    const env = makeEnv(kv);
    const { followups } = mockDiscordAndGitHub(t, {
        createIssueResponses: [
            { status: 422, body: { message: 'Validation Failed' } },
            { status: 201, body: { number: 7, title: 'x', html_url: 'https://github.com/jasstsg/dissue/issues/7' } },
        ],
        labels: [{ name: 'discord:bug' }],
    });

    const interaction = makeModalSubmitInteraction({
        guildId: 'guild-1',
        components: [
            labelRow('feedbackTitle', 'T'),
            labelRow('feedbackDescription', 'D'),
            selectRow('feedbackType', ['discord:bug']),
        ],
    });

    const { ctx, flush } = makeExecutionContext();
    await handleFeedbackModalSubmit(interaction, env, ctx);
    await flush();

    assert.equal(followups.length, 1);
    assert.match((followups[0] as { content: string }).content, /#7/);
});

test('handleFeedbackModalSubmit reports a clear error when the label is still gone after resync', async (t) => {
    const kv = kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    });
    const env = makeEnv(kv);
    const { editedMessages } = mockDiscordAndGitHub(t, {
        createIssueResponses: [
            { status: 422, body: { message: 'Validation Failed' } },
            { status: 422, body: { message: 'Validation Failed' } },
        ],
        labels: [],
    });

    const interaction = makeModalSubmitInteraction({
        guildId: 'guild-1',
        components: [
            labelRow('feedbackTitle', 'T'),
            labelRow('feedbackDescription', 'D'),
            selectRow('feedbackType', ['discord:bug']),
        ],
    });

    const { ctx, flush } = makeExecutionContext();
    await handleFeedbackModalSubmit(interaction, env, ctx);
    await flush();

    assert.equal(editedMessages.length, 1);
    assert.match((editedMessages[0] as { content: string }).content, /no longer exists/);
});
