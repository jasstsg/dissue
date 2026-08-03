import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { editOriginalResponse, isGuildAdmin } from './discord.js';
import { createIssue } from './github.js';

export async function handleSetupCommand(interaction, env, ctx) {
    if (!isGuildAdmin(interaction)) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: 'Only server admins can run /setup.',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        };
    }

    const state = crypto.randomUUID();
    ctx.waitUntil(env.GUILD_CONFIG.put(`state:${state}`, interaction.guild_id, { expirationTtl: 600 }));

    const installUrl = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new?state=${state}`;

    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `Connect this server's GitHub repo by installing the app here (link expires in 10 minutes):\n${installUrl}`,
            flags: InteractionResponseFlags.EPHEMERAL,
        },
    };
}

export function buildFeedbackModal() {
    return {
        type: InteractionResponseType.MODAL,
        data: {
            custom_id: 'feedbackReportModal',
            title: 'Submit a New Bug',
            components: [
                {
                    type: 1,
                    components: [{
                        type: 4,
                        custom_id: 'feedbackTitle',
                        label: 'Issue Title / Summary',
                        style: 1,
                        placeholder: 'e.g., Login button crashing on mobile',
                        required: true,
                    }],
                },
                {
                    type: 1,
                    components: [{
                        type: 4,
                        custom_id: 'feedbackDescription',
                        label: 'Detailed Description',
                        style: 2,
                        placeholder: 'A feature idea, or a bug + steps to reproduce it (1. Open... 2. Click...)',
                        required: true,
                    }],
                }
            ],
        },
    };
}

function fieldValue(rows, customId) {
    for (const row of rows) {
        for (const component of row.components) {
            if (component.custom_id === customId) return component.value;
        }
    }
    return '';
}

export async function handleFeedbackModalSubmit(interaction, env, ctx) {
    const rows = interaction.data.components;
    const title = fieldValue(rows, 'feedbackTitle');
    const description = fieldValue(rows, 'feedbackDescription');
    const submitter = interaction.member.user.username;
    const guildName = interaction.guild.name;

    ctx.waitUntil((async () => {
        try {
            const guildConfigRaw = await env.GUILD_CONFIG.get(`guild:${interaction.guild_id}`);

            if (!guildConfigRaw) {
                await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                    content: "This server hasn't connected a GitHub repo yet. Ask an admin to run /setup first.",
                });
                return;
            }

            const { installationId, owner, repo } = JSON.parse(guildConfigRaw);
            const githubBody = `Reported by @${submitter} in the ${guildName} discord server\n\n# Description\n${description}`;

            const issue = await createIssue(env, {
                installationId,
                owner,
                repo,
                title,
                body: githubBody,
            });
            await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: `✅ Bug successfully logged! You can view it on our public tracker here: ${issue.html_url}`,
            });
        } catch (error) {
            console.error('Failed to create GitHub issue:', error);
            await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: '❌ Failed to connect to GitHub. Please try again later.',
            });
        }
    })());

    return {
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: InteractionResponseFlags.EPHEMERAL },
    };
}
