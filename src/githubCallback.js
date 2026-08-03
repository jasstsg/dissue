import { listInstallationRepositories } from './github.js';

export async function handleGitHubCallback(request, env) {
    const url = new URL(request.url);
    const installationId = url.searchParams.get('installation_id');
    const state = url.searchParams.get('state');
    const setupAction = url.searchParams.get('setup_action');

    if (setupAction !== 'install' || !installationId || !state) {
        return new Response('Invalid callback request.', { status: 400 });
    }

    const guildId = await env.GUILD_CONFIG.get(`state:${state}`);
    if (!guildId) {
        return new Response('This install link has expired. Run /setup again in Discord.', { status: 400 });
    }
    await env.GUILD_CONFIG.delete(`state:${state}`);

    try {
        const repositories = await listInstallationRepositories(env, installationId);

        if (repositories.length !== 1) {
            return new Response(
                'This app was granted access to more than one repository. For now, /feedback only supports ' +
                'a single connected repo per server — reinstall and pick just one repository, then run /setup again.',
                { status: 400 },
            );
        }

        const [repo] = repositories;
        await env.GUILD_CONFIG.put(`guild:${guildId}`, JSON.stringify({
            installationId,
            owner: repo.owner.login,
            repo: repo.name,
        }));

        return new Response(`Connected! Bug reports in this server will now go to ${repo.owner.login}/${repo.name}.`, {
            headers: { 'Content-Type': 'text/plain' },
        });
    } catch (error) {
        console.error('GitHub install callback failed:', error);
        return new Response(
            'Something went wrong connecting your GitHub repo. Please go back to Discord and run /setup again. ' +
            'If this keeps happening, let this server\'s admin know.',
            { status: 500, headers: { 'Content-Type': 'text/plain' } },
        );
    }
}
