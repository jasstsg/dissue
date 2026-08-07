import type { APIChatInputApplicationCommandGuildInteraction, APIInteractionResponse } from 'discord-api-types/v10';
import { ephemeralReply } from '../discord/client.js';
import { isGuildAdmin } from '../discord/permissions.js';
import type { Env } from '../env.js';

export async function handleSetupCommand(
    interaction: APIChatInputApplicationCommandGuildInteraction,
    env: Env,
    ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
    if (!isGuildAdmin(interaction)) {
        return ephemeralReply('Only server admins can run /setup.');
    }

    const state = crypto.randomUUID();
    ctx.waitUntil(env.GUILD_CONFIG.put(`state:${state}`, interaction.guild_id, { expirationTtl: 600 }));

    const installUrl = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new?state=${state}`;

    return ephemeralReply(
        `Connect this server's GitHub repo by installing the app here (link expires in 10 minutes):\n${installUrl}`,
    );
}
