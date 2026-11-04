---
title: Install a skill without writing code
description: Step-by-step for Claude.ai, Claude Desktop and ChatGPT. Download, upload, done.
level: Beginner
minutes: 3
order: 2
---
You don't need a terminal for any of this.

## Claude.ai (web)

1. Open any skill on {{site}} and click **Download ZIP**.
2. In Claude.ai, go to **Settings → Capabilities** and make sure code execution is turned on (skills need it).
3. Under **Skills**, click **Upload skill** and pick the ZIP you downloaded.
4. Start a new chat and ask for something the skill handles. Claude loads it on its own.

## Claude Desktop

1. Download the skill's ZIP.
2. Open **Customize → Skills**, click **+**, then **Upload a skill**.
3. Choose the ZIP and start a new conversation.

## ChatGPT

ChatGPT doesn't load skill folders yet, but the instructions still work:

1. On the skill page, click **Copy SKILL.md**.
2. Create a **Project** (or a custom GPT) and paste the text into its instructions.
3. If the skill has a `references` folder, upload those files to the project too.

## Updating a skill

Skills on {{site}} sync from their authors automatically. When a new version appears (check the changelog on the skill page), download the ZIP again and replace the old one.

## Tips

- **Install a few, not a hundred.** Each skill's description is read at the start of every chat. Pick the ones you'll actually use.
- **Read the trust score.** It explains exactly what the scanner found. See [how we scan]({{base}}/security/).
- **Start with a bundle.** [Starter bundles]({{base}}/bundles/) group the top skills in each category.
