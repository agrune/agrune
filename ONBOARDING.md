# Welcome to Agrune

## How We Use Claude

Based on chenjing's usage over the last 30 days:

Work Type Breakdown:
  Plan Design      █████████░░░░░░░░░░░  45%
  Improve Quality  ███████░░░░░░░░░░░░░  35%
  Debug Fix        ████░░░░░░░░░░░░░░░░  20%

Top Skills & Commands:
  /model           ████████████████████  6x/month
  /clear           █████████████░░░░░░░  4x/month
  /plugin          █████████████░░░░░░░  4x/month
  /effort          ██████████░░░░░░░░░░  3x/month
  /reload-plugins  ███████░░░░░░░░░░░░░  2x/month
  /simplify        ███████░░░░░░░░░░░░░  2x/month
  /code-review     ███░░░░░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  honcho_external  ████████████████████  4 calls

## Your Setup Checklist

### Codebases
- [ ] agrune — https://github.com/agrune/agrune.git
- [ ] agrune-studio — https://github.com/agrune/agrune-studio.git
- [ ] demo — https://github.com/agrune/demo.git

### MCP Servers to Activate
- [ ] honcho_external — self-hosted Honcho memory/context layer for conversation recall and representation (read-only by default). Ask the team for the local Honcho instance connection details and add it to your MCP config.

### Skills to Know About
- [ ] /code-review — multi-angle review of the current diff for correctness bugs and cleanups; run it before merging a branch.
- [ ] /simplify — quality pass on changed code (reuse, simplification, efficiency, altitude) that applies the fixes; the team uses it to tidy a diff without bug-hunting.
- [ ] /find-skills — discover and install agent skills when you need a capability you don't have yet.
- [ ] /skills — list the skills currently available in your session.
- [ ] /model & /effort — pick the model and reasoning effort per task (heavily used here for tuning depth vs. speed).
- [ ] /plugin & /reload-plugins — manage and hot-reload plugins.
- [ ] /resume — jump back into a previous session.

## Team Tips

- **Tune depth per task.** `/model` and `/effort` get used a lot here — dial effort up for big refactors and reviews, leave it default for quick questions.
- **Review flow before merging.** Run `/simplify` first (reuse / simplification / efficiency cleanups, applied to the diff), then `/code-review` to hunt correctness bugs. They're complementary — `/simplify` is quality-only, `/code-review` is bugs.
- **Lost the thread? Ask honcho.** When you're picking work back up after a break ("where did I leave off a month ago?"), the `honcho_external` memory layer can recall past context from code + conversation history.
- **Hot-reload plugins.** After changing or installing a plugin, `/reload-plugins` picks it up without restarting; `/find-skills` finds new ones.

## Get Started

No assigned starter task — start with your Setup Checklist above, top to bottom:

1. Clone `agrune` (and `agrune-studio` / `demo` if your work touches them).
2. Connect the `honcho_external` MCP server (grab the instance details from the team).
3. Make a small change on a branch and run `/code-review` on it to see the team's review flow end to end.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
