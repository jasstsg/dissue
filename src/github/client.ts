import jwt from '@tsndr/cloudflare-worker-jwt';
import type { Env } from '../env.js';

const GITHUB_API = 'https://api.github.com';

// GitHub's API rejects requests with no User-Agent header (403).
const USER_AGENT = 'dissue-discord-bot';

interface GitHubRepository {
    name: string;
    owner: { login: string };
}

interface GitHubIssue {
    number: number;
    title: string;
    html_url: string;
}

interface GitHubLabel {
    name: string;
}

// Thrown specifically for GitHub's 422 validation errors, which is what a
// stale/removed label name in the `labels` array on issue creation looks
// like — distinct from auth/network failures, so callers can tell "maybe
// worth refreshing labels and retrying" apart from a real failure.
export class GitHubValidationError extends Error {}

async function signAppJwt(env: Env): Promise<string> {
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

function githubFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...init,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': USER_AGENT,
            ...init.headers,
        },
    });
}

export async function getInstallationToken(env: Env, installationId: string): Promise<string> {
    const appJwt = await signAppJwt(env);
    const response = await githubFetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, appJwt, {
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error(`Failed to mint installation token: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as { token: string };
    return data.token; // valid for ~1 hour
}

export async function listInstallationRepositories(env: Env, installationId: string): Promise<GitHubRepository[]> {
    const token = await getInstallationToken(env, installationId);
    const response = await githubFetch(`${GITHUB_API}/installation/repositories`, token);

    if (!response.ok) {
        throw new Error(`Failed to list installation repositories: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as { repositories: GitHubRepository[] };
    return data.repositories;
}

export async function listLabels(env: Env, installationId: string, owner: string, repo: string): Promise<GitHubLabel[]> {
    const token = await getInstallationToken(env, installationId);
    const response = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/labels?per_page=100`, token);

    if (!response.ok) {
        throw new Error(`Failed to list labels: ${response.status} ${await response.text()}`);
    }

    return response.json();
}

export async function createIssue(env: Env, options: {
    installationId: string;
    owner: string;
    repo: string;
    title: string;
    body: string;
    labels?: string[];
}): Promise<GitHubIssue> {
    const { installationId, owner, repo, title, body, labels } = options;
    const token = await getInstallationToken(env, installationId);

    const response = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/issues`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, labels }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 422) {
            throw new GitHubValidationError(`Failed to create issue: ${response.status} ${errorText}`);
        }
        throw new Error(`Failed to create issue: ${response.status} ${errorText}`);
    }

    return response.json();
}
