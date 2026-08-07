import type { APIChatInputApplicationCommandGuildInteraction, APIInteractionResponseChannelMessageWithSource } from 'discord-api-types/v10';
import { ephemeralReply } from '../discord/client.js';
import { isGuildAdmin } from '../discord/permissions.js';
import { getGuildConfig, syncLabels, LABEL_PREFIX, type GuildConfig } from '../guildConfig.js';
import type { Env } from '../env.js';

function syncLabelsSummary(config: GuildConfig): string {
    if (config.labels.length === 0) {
        return `No labels prefixed \`${LABEL_PREFIX}\` were found in ${config.owner}/${config.repo}. ` +
            `Add labels like \`${LABEL_PREFIX}bug\` or \`${LABEL_PREFIX}feature\` in GitHub, then run /sync-labels again.`;
    }
    const names = config.labels.map(label => label.displayName).join(', ');
    return `Synced ${config.labels.length} feedback type${config.labels.length === 1 ? '' : 's'} from ` +
        `${config.owner}/${config.repo}: ${names}`;
}

export async function handleSyncLabelsCommand(
    interaction: APIChatInputApplicationCommandGuildInteraction,
    env: Env,
): Promise<APIInteractionResponseChannelMessageWithSource> {
    if (!isGuildAdmin(interaction)) {
        return ephemeralReply('Only server admins can run /sync-labels.');
    }

    const config = await getGuildConfig(env, interaction.guild_id);
    if (!config) {
        return ephemeralReply("This server hasn't connected a GitHub repo yet. Run /setup first.");
    }

    const labels = await syncLabels(env, interaction.guild_id, config);
    return ephemeralReply(syncLabelsSummary({ ...config, labels }));
}
