---
title: Skills vs. MCP servers: which do you need?
description: The difference between teaching your AI how to do something and giving it access to something.
level: Beginner
minutes: 3
order: 5
---
Both make your assistant more capable. They solve different problems.

## Skills are know-how

A skill is a set of instructions, references and optional scripts. It teaches the AI **how** to do a task: your report format, a country's tax rules, a debugging method. It runs entirely inside the agent and needs no server.

## MCP servers are access

The [Model Context Protocol](https://modelcontextprotocol.io) connects an AI to **live tools and data**: your calendar, a database, a design file, a payment system. An MCP server is a running program that the AI calls.

## Use both

| You want the AI to… | Use |
|---|---|
| Follow your team's code review checklist | Skill |
| Read issues from your tracker | MCP server |
| Triage those issues by your team's rules | Both |
| Fill in a government form correctly | Skill |
| Book a meeting in your calendar | MCP server |

Browse the [skills library]({{base}}/skills/) and the [MCP directory]({{base}}/mcp/), synced daily from the official registry.
