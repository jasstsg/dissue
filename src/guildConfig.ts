import { listLabels } from './github.js';
import type { Env } from './env.js';

// Only labels with this prefix become feedback-type options — lets repo
// owners opt specific labels in without exposing their whole label set.
export const LABEL_PREFIX = 'discord:';

// Discord select menus support at most 25 options.
const MAX_LABEL_OPTIONS = 25;

export interface FeedbackLabel {
    name: string; // full GitHub label name, e.g. "discord:bug" — used as-is when creating the issue
    displayName: string; // prefix stripped, e.g. "bug" — shown to the user
}

export interface GuildConfig {
    installationId: string;
    owner: string;
    repo: string;
    labels: FeedbackLabel[];
}

export async function getGuildConfig(env: Env, guildId: string): Promise<GuildConfig | null> {
    const raw = await env.GUILD_CONFIG.get(`guild:${guildId}`);
    return raw ? JSON.parse(raw) : null;
}

export async function putGuildConfig(env: Env, guildId: string, config: GuildConfig): Promise<void> {
    await env.GUILD_CONFIG.put(`guild:${guildId}`, JSON.stringify(config));
}

// Fetches the repo's labels from GitHub, filters to the ones opted in via
// LABEL_PREFIX, and persists the result onto the guild's stored config.
export async function syncLabels(env: Env, guildId: string, config: GuildConfig): Promise<FeedbackLabel[]> {
    const allLabels = await listLabels(env, config.installationId, config.owner, config.repo);

    const labels: FeedbackLabel[] = allLabels
        .filter(label => label.name.startsWith(LABEL_PREFIX))
        .slice(0, MAX_LABEL_OPTIONS)
        .map(label => ({ name: label.name, displayName: label.name.slice(LABEL_PREFIX.length) }));

    await putGuildConfig(env, guildId, { ...config, labels });
    return labels;
}
