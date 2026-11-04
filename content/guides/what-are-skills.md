---
title: What are AI agent skills?
description: A plain-English explanation of skills, how agents use them, and why they beat copy-pasting long prompts.
level: Beginner
minutes: 4
order: 1
---
Think of your AI assistant as a smart new hire. It knows a lot, but it doesn't know *your* way of doing things: the exact format of your invoices, the checklist your team uses before a release, the rules of your country's tax forms.

A **skill** is a short, reusable briefing that teaches it one of those jobs.

## What's inside a skill

A skill is just a folder. The only required file is `SKILL.md`:

```markdown
---
name: invoice-checker
description: Checks invoices for missing fields and math errors. Use when the user shares an invoice or asks to validate billing.
---

# Invoice checker
1. Confirm the invoice has a number, date, seller and buyer details...
```

The top part (the *frontmatter*) is a name and a description. Below it are the actual instructions. Bigger skills add a `references/` folder with documentation and a `scripts/` folder with small programs the agent can run.

## How the agent uses it

1. When a conversation starts, the agent reads **only the descriptions** of your installed skills. That's cheap, so you can install dozens.
2. When your request matches a description, the agent opens that skill's full instructions.
3. If the skill points to reference files or scripts, the agent loads or runs them only when needed.

This is called *progressive disclosure*. It's why skills scale far better than pasting a giant prompt into every chat.

## Skills vs. prompts vs. MCP

| | Prompt | Skill | MCP server |
|---|---|---|---|
| What it gives the AI | One-off instructions | Reusable know-how | Live access to a tool or data |
| Lives in | Your chat | A folder | A running server |
| Loaded | Every time you paste it | Automatically, when relevant | When the tool is called |

Skills and MCP work best together: an MCP server lets the AI *reach* your CRM, and a skill teaches it *how your team uses* the CRM.

## Next step

Ready to try one? Follow [Install a skill without code]({{base}}/guides/install-without-code/) or jump straight to the [library]({{base}}/skills/).
