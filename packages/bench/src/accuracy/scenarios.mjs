// Chained multi-step scenarios for the agentic-loop bench. Each predicate is a
// PURE function over final ground-truth state read from localStorage
// ({ tasks, members, messages }), NOT the DOM. Predicates are deliberately
// tolerant (keyword title match, assignee ∈ active-developer set, non-empty
// bodies, length deltas) so a sloppy-but-correct completion still passes.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// S7's ground truth comes from the SAME npc-facts.json the messenger NPC speaks
// from — the teammate's "today's task" is fixed there, so the predicate knows
// exactly what title to look for regardless of how the LLM phrased the reply.
const __d = dirname(fileURLToPath(import.meta.url))
const FACTS = JSON.parse(readFileSync(process.env.AGRUNE_NPC_FACTS || resolve(__d, '../../../../../demo/npc-facts.json'), 'utf8'))
const TODAY_KW = FACTS.members['member-5'].todayTask.matchKeywords
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TODAY_RE = new RegExp(TODAY_KW.map(escRe).join('|'), 'i')

// Active developers in the seed (role: developer, status: active).
export const ACTIVE_DEVELOPERS = [
  'Bob Kim', 'Charlie Park', 'Iris Tanaka', 'Jack Morrison',
  'Nathan Patel', 'Peter Nguyen', 'Uma Krishnan',
]
export const ACTIVE_DEV_IDS = [
  'member-2', 'member-3', 'member-9', 'member-10', 'member-14', 'member-16', 'member-21',
]

const isDev = (name) => ACTIVE_DEVELOPERS.includes(name)
const hasAssignee = (name) => typeof name === 'string' && name.trim().length > 0
const hasComment = (t) => Array.isArray(t?.comments) && t.comments.some((c) => c.body && c.body.trim())

export const SCENARIOS = [
  {
    id: 'S1-create-for-dev',
    difficulty: 'easy',
    maxSteps: 12,
    catalogGroups: ['navigation', 'board', 'task_wizard', 'select_options'],
    instruction:
      'Create a brand-new task titled "Investigate API latency" (give it a short description like "Latency is high"), assign it to a teammate, then finish creating the task.',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => /investigat|latenc/i.test(x.title) && hasAssignee(x.assignee))
      return { pass: !!t && tasks.length >= 9, detail: t ? `${t.title} → ${t.assignee}` : `len=${tasks.length}` }
    },
  },
  {
    id: 'S2-comment',
    difficulty: 'easy',
    maxSteps: 9,
    catalogGroups: ['navigation', 'board', 'task_detail', 'select_options'],
    instruction:
      'Open the existing task about the authentication flow and post a comment on it asking a teammate for a review.',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => x.id === 'task-2' || /authenticat/i.test(x.title))
      return { pass: hasComment(t), detail: t ? `comments=${(t.comments || []).length}` : 'task not found' }
    },
  },
  {
    id: 'S3-reassign-move',
    difficulty: 'medium',
    maxSteps: 12,
    catalogGroups: ['navigation', 'board', 'task_detail', 'select_options'],
    instruction:
      'Open the existing task about writing API documentation, reassign it to an active developer, and move its status to In Review. Save the changes.',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => x.id === 'task-4' || /api documentation/i.test(x.title))
      return {
        pass: !!t && t.status === 'in-review' && isDev(t.assignee),
        detail: t ? `status=${t.status} assignee=${t.assignee}` : 'not found',
      }
    },
  },
  {
    id: 'S4-create-then-comment',
    difficulty: 'medium',
    maxSteps: 16,
    catalogGroups: ['navigation', 'board', 'task_wizard', 'task_detail', 'select_options'],
    instruction:
      'Create a new task titled "Fix flaky CI tests" with description "CI is flaky" assigned to a teammate and finish creating it. Then open that newly-created task and add a comment "Please review".',
    predicate: ({ tasks }) => {
      const t = tasks.find((x) => /flaky/i.test(x.title) && hasAssignee(x.assignee))
      return { pass: !!t && hasComment(t), detail: t ? `${t.title} comments=${(t.comments || []).length}` : 'not found' }
    },
  },
  {
    id: 'S5-followup-link',
    difficulty: 'hard',
    maxSteps: 16,
    catalogGroups: ['navigation', 'board', 'task_wizard', 'task_detail', 'select_options'],
    instruction:
      'Create a follow-up task titled "CI/CD monitoring" assigned to a teammate and finish creating it. Then open it and link it to the existing "Set up CI/CD pipeline" task as a related ticket.',
    predicate: ({ tasks }) => {
      const base = tasks.find((x) => x.id === 'task-3' || /ci\/cd pipeline/i.test(x.title))
      const follow = tasks.find((x) => /monitor/i.test(x.title) && x.id !== base?.id && hasAssignee(x.assignee))
      const linked =
        !!follow && !!base &&
        ((follow.relatedTo || []).includes(base.id) || (base.relatedTo || []).includes(follow.id))
      return { pass: tasks.length >= 9 && !!follow && linked, detail: follow ? `follow=${follow.id} rel=${JSON.stringify(follow.relatedTo || [])}` : 'no follow-up' }
    },
  },
  {
    id: 'S6-find-dev-then-dm',
    difficulty: 'hard',
    maxSteps: 12,
    catalogGroups: ['navigation', 'members', 'messenger'],
    instruction:
      'Go to the Members tab and find an active developer. Then open the team messenger, open the conversation with that developer, and send them a direct message asking for their opinion on the authentication work.',
    predicate: ({ messages }) => {
      const hit = ACTIVE_DEV_IDS.find((id) =>
        (messages[id] || []).some((m) => m.from === 'me' && !String(m.id).startsWith('msg-seed')),
      )
      return { pass: !!hit, detail: hit ? `dm→${hit}` : 'no new dm to an active developer' }
    },
  },
  {
    // Stateful chain: the agent must CHAT to learn the task (the answer only exists
    // in Eve's LLM reply, surfaced in the snapshot), REMEMBER it across many UI
    // steps, then create the matching ticket. Needs full-conversation memory.
    id: 'S7-chat-find-create',
    difficulty: 'hard',
    maxSteps: 20,
    catalogGroups: ['navigation', 'board', 'task_wizard', 'messenger', 'select_options'],
    instruction:
      'Open the team messenger and ask Eve Wang what new task you should register today. Read her reply, then go to the board, create that task as a new ticket (use her wording for the title), assign it to an active developer, and finish creating it.',
    predicate: ({ tasks, messages }) => {
      const t = tasks.find((x) => (TODAY_RE.test(x.title) || TODAY_RE.test(x.description || '')) && isDev(x.assignee))
      const askedEve = (messages['member-5'] || []).some((m) => m.from === 'me' && !String(m.id).startsWith('msg-seed'))
      return {
        pass: tasks.length >= 9 && !!t && askedEve,
        detail: t ? `${t.title} → ${t.assignee} (askedEve=${askedEve})` : `len=${tasks.length} askedEve=${askedEve}`,
      }
    },
  },
]
