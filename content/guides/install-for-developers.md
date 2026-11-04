---
title: Installing skills in Claude Code, Codex, Copilot and Cursor
description: Where each coding agent looks for skills, global vs. per-project installs, and keeping skills in git.
level: Developer
minutes: 5
order: 3
---
Coding agents load skills from a folder on disk. Drop a skill folder there and restart the agent.

## The folders

| Agent | All projects | One project |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Codex CLI | `~/.codex/skills/` | `.codex/skills/` |
| GitHub Copilot | `~/.copilot/skills/` | `.github/skills/` |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/` |
| Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/` |

These paths change as tools evolve. If a skill isn't detected, check your agent's docs.

## One-line install

Every skill page has a ready-made command per agent, like this:

```bash
mkdir -p ~/.claude/skills && curl -fsSL https://example.com/zips/my-skill.zip -o /tmp/my-skill.zip && unzip -o /tmp/my-skill.zip -d ~/.claude/skills
```

## Per-project skills belong in git

Commit project skills (`.claude/skills/…`) so your whole team gets the same behavior, and review changes to them like code. A skill is code your agent will follow.

## Straight from the source

To track upstream changes yourself, use a sparse checkout of just the skill's folder. The command is under **From source (git)** on every skill page.

## Before you run scripts

Skills can include scripts. Agents usually ask before running them, but read them first anyway, especially anything that touches the network, your credentials or files outside the project.
