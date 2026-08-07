# Dissue

Discord bot for creating GitHub Issues.

![Dissue](images/dissue-bot.png)


## Setup (server admins)

1. [Add the Dissue bot to your server](https://discord.com/oauth2/authorize?client_id=1533562929142562978&scope=bot+applications.commands&permissions=0)
2. Run `/setup` in your server.
2. Click the install link it gives you (expires after 10 minutes) and choose **one** GitHub repo to connect — Dissue only supports a single repo per server.
3. You're done. The bot will confirm which repo it connected to.

Only admins (or anyone with the "Manage Server" permission) can run `/setup`.

## Usage (everyone)

Run `/feedback` and fill out the form that pops up:
- **Issue Title / Summary** — becomes the GitHub issue title.
- **Detailed Description** — the issue body. Works for bug reports (include repro steps) or feature ideas.

Submitting it opens an issue in the connected repo and replies with a link to it. If nothing's been connected yet, it'll tell you to ask an admin to run `/setup` first.
