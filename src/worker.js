// Cloudflare Worker entry point.
//
// Two HTTP routes:
//   POST /interactions    Discord sends every slash command + modal submit here.
//   GET  /github/callback GitHub redirects here after a server admin installs the App.
//
// See GITHUB_APP_PLAN.md for the overall design.

import { InteractionType, InteractionResponseType } from 'discord-interactions';
import { verifyDiscordRequest, json } from './discord.js';
import { handleSetupCommand, buildFeedbackModal, handleFeedbackModalSubmit } from './commands.js';
import { handleGitHubCallback } from './githubCallback.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/interactions') {
            return handleInteraction(request, env, ctx);
        }

        if (request.method === 'GET' && url.pathname === '/github/callback') {
            return handleGitHubCallback(request, env);
        }

        return new Response('Not found', { status: 404 });
    },
};

async function handleInteraction(request, env, ctx) {
    const t0 = Date.now();
    const { isValid, interaction } = await verifyDiscordRequest(request, env);
    console.log(`[timing] verify done at +${Date.now() - t0}ms`);
    if (!isValid) {
        return new Response('Invalid request signature', { status: 401 });
    }

    if (interaction.type === InteractionType.PING) {
        return json({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        if (interaction.data.name === 'setup') {
            const result = await handleSetupCommand(interaction, env, ctx);
            console.log(`[timing] setup responding at +${Date.now() - t0}ms`);
            return json(result);
        }
        if (interaction.data.name === 'feedback') {
            console.log(`[timing] feedback modal responding at +${Date.now() - t0}ms`);
            return json(buildFeedbackModal());
        }
    }

    if (interaction.type === InteractionType.MODAL_SUBMIT) {
        if (interaction.data.custom_id === 'feedbackReportModal') {
            const result = await handleFeedbackModalSubmit(interaction, env, ctx);
            console.log(`[timing] modal submit responding at +${Date.now() - t0}ms`);
            return json(result);
        }
    }

    return new Response('Unhandled interaction type', { status: 400 });
}
