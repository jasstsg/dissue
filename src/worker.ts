// Cloudflare Worker entry point.
//
// Two HTTP routes:
//   POST /interactions    Discord sends every slash command + modal submit here.
//   GET  /github/callback GitHub redirects here after a server admin installs the App.
//
// See GITHUB_APP_PLAN.md for the overall design.

import { InteractionType, InteractionResponseType } from 'discord-api-types/v10';
import type { APIChatInputApplicationCommandGuildInteraction, APIModalSubmitGuildInteraction } from 'discord-api-types/v10';
import { verifyDiscordRequest, json } from './discord/client.js';
import { handleSetupCommand } from './commands/setup.js';
import { handleSyncLabelsCommand } from './commands/syncLabels.js';
import { buildFeedbackModal } from './commands/feedback.js';
import { handleFeedbackModalSubmit } from './commands/feedbackSubmit.js';
import { buildHelpResponse } from './commands/help.js';
import { handleGitHubCallback } from './github/installCallback.js';
import type { Env } from './env.js';

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/interactions') {
            return handleInteraction(request, env, ctx);
        }

        if (request.method === 'GET' && url.pathname === '/github/callback') {
            return handleGitHubCallback(request, env);
        }

        return new Response('Not found', { status: 404 });
    },
} satisfies ExportedHandler<Env>;

async function handleInteraction(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const verification = await verifyDiscordRequest(request, env);
    if (!verification.isValid) {
        return new Response('Invalid request signature', { status: 401 });
    }
    const { interaction } = verification;

    if (interaction.type === InteractionType.Ping) {
        return json({ type: InteractionResponseType.Pong });
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
        if (interaction.data.name === 'setup') {
            return json(await handleSetupCommand(interaction as APIChatInputApplicationCommandGuildInteraction, env, ctx));
        }
        if (interaction.data.name === 'sync-labels') {
            return json(await handleSyncLabelsCommand(interaction as APIChatInputApplicationCommandGuildInteraction, env));
        }
        if (interaction.data.name === 'feedback') {
            return json(await buildFeedbackModal(interaction as APIChatInputApplicationCommandGuildInteraction, env));
        }
        if (interaction.data.name === 'help') {
            return json(buildHelpResponse());
        }
    }

    if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.data.custom_id === 'feedbackReportModal') {
            return json(await handleFeedbackModalSubmit(interaction as APIModalSubmitGuildInteraction, env, ctx));
        }
    }

    return new Response('Unhandled interaction type', { status: 400 });
}
