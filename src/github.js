import jwt from '@tsndr/cloudflare-worker-jwt';

const GITHUB_API = 'https://api.github.com';

// GitHub's API rejects requests with no User-Agent header (403).
const USER_AGENT = 'dissue-discord-bot';

async function signAppJwt(env) {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
        {
            iat: now - 60,
            exp: now + 9 * 60, // GitHub caps this at 10 minutes
            iss: env.GITHUB_APP_ID,
        },
        env.GITHUB_APP_PRIVATE_KEY,
        { algorithm: 'RS256' },
    );
}

export async function getInstallationToken(env, installationId) {
    const appJwt = await signAppJwt(env);
    const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${appJwt}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': USER_AGENT,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to mint installation token: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.token; // valid for ~1 hour
}

export async function listInstallationRepositories(env, installationId) {
    const token = await getInstallationToken(env, installationId);
    const response = await fetch(`${GITHUB_API}/installation/repositories`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': USER_AGENT,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list installation repositories: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.repositories;
}

export async function createIssue(env, { installationId, owner, repo, title, body }) {
    const token = await getInstallationToken(env, installationId);

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({ title, body }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create issue: ${response.status} ${await response.text()}`);
    }

    return response.json();
}
