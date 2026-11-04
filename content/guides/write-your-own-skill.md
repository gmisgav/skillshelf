---
title: Write your own skill
description: Turn a workflow you keep re-explaining into a skill in 15 minutes, then share it with everyone.
level: Intermediate
minutes: 7
order: 4
---
If you've explained the same process to your AI three times, it should be a skill.

## 1. Start with the description

The description decides **when** your skill fires, so it's the most important line you'll write. Say what it does *and* when to use it, using the words people actually type:

```yaml
---
name: release-notes
description: Writes customer-facing release notes from merged PRs and commit messages. Use when the user asks for release notes, a changelog entry, "what shipped", or a product update email. Do NOT use for internal engineering changelogs.
---
```

The "Do NOT use for…" clause stops your skill from firing on near-miss requests.

## 2. Write instructions like a checklist

Agents follow numbered steps and clear rules better than prose. Keep `SKILL.md` focused, under roughly 500 lines.

```markdown
# Release notes

## Steps
1. Collect merged PRs since the last tag.
2. Group them: New, Improved, Fixed. Drop internal-only changes.
3. Write one plain-English line per change, starting with a verb.

## Rules
- No ticket numbers or internal codenames.
- Lead with user benefit, not implementation.
```

## 3. Move detail into references

Long tables, API docs, style guides and examples go in `references/`. Link to them from `SKILL.md` ("For tone rules, read references/voice.md"). The agent only loads them when needed, so they don't cost anything until then.

## 4. Add scripts only for deterministic work

If a step is exact (parsing a file, computing a checksum, calling an API), a small script in `scripts/` is more reliable than asking the model. Keep scripts short, readable and dependency-light. Never download and execute remote code.

## 5. Test it

Install it locally, then try three kinds of prompts:
- Requests that **should** trigger it.
- Near-misses that **shouldn't**.
- Edge cases (missing input, huge input).

Tighten the description until it fires exactly when it should.

## 6. Share it

Push it to a public GitHub repo with an MIT or Apache-2.0 license and [submit it to {{site}}]({{base}}/submit/). Every update you push syncs automatically.
