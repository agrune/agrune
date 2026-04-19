import type { FormFixture } from './types.js'

/**
 * Profile / settings corpus — 22 fixtures.
 *
 * **Precision anchor**: ~90% non-sensitive. Exercises the heuristic's
 * false-positive rate on realistic profile/settings forms where most fields
 * should NOT be flagged. A heuristic that over-flags will trip precision ≤ 0.90
 * and fail the CI gate.
 *
 * Includes a handful of true-positive edge cases (API key, recovery passcode)
 * to keep the corpus realistic rather than purely negative.
 */
export const profileFixtures: FormFixture[] = [
  // ── Typical non-sensitive profile fields ──────────────────────────────
  {
    id: 'profile-neg-01',
    html: `<form><input id="nick" name="nickname" /></form>`,
    elements: ['#nick'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-02',
    html: `<form><textarea id="bio" name="bio"></textarea></form>`,
    elements: ['#bio'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-03',
    html: `<form><input id="web" type="url" name="website" /></form>`,
    elements: ['#web'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-04',
    html: `<form><input id="bday" type="date" name="birthday" /></form>`,
    elements: ['#bday'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-05',
    html: `<form><input id="theme" type="color" name="theme" /></form>`,
    elements: ['#theme'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-06',
    html: `<form><input id="loc" name="location" /></form>`,
    elements: ['#loc'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-07',
    html: `<form><input id="tw" name="twitter_handle" /></form>`,
    elements: ['#tw'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-08',
    html: `<form><input id="gh" name="github_url" /></form>`,
    elements: ['#gh'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-09',
    html: `<form><select id="lang" name="language">
      <option value="en">English</option>
      <option value="ko">한국어</option>
    </select></form>`,
    elements: ['#lang'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-10',
    html: `<form><select id="tz" name="timezone"><option>UTC</option></select></form>`,
    elements: ['#tz'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-11',
    html: `<form><input id="notif" type="checkbox" name="email_notifications" /></form>`,
    elements: ['#notif'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-12',
    html: `<form><input id="avatar" type="file" name="avatar" /></form>`,
    elements: ['#avatar'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-13',
    html: `<form><input id="company" name="company_name" /></form>`,
    elements: ['#company'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-14',
    html: `<form><input id="role" name="job_title" /></form>`,
    elements: ['#role'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },
  {
    id: 'profile-neg-15',
    html: `<form><input id="subject" name="subject" placeholder="Email subject" /></form>`,
    elements: ['#subject'],
    expected: [false],
    lang: 'en',
    category: 'profile',
    notes: 'placeholder contains "Email subject" — no password/pin/etc. token',
  },
  {
    id: 'profile-neg-16',
    html: `<form><input id="note" name="public_note" placeholder="Add a note" /></form>`,
    elements: ['#note'],
    expected: [false],
    lang: 'en',
    category: 'profile',
  },

  // ── Korean / Japanese profile (non-sensitive) ─────────────────────────
  {
    id: 'profile-neg-ko-01',
    html: `<form><input id="nick" aria-label="닉네임" name="nickname" /></form>`,
    elements: ['#nick'],
    expected: [false],
    lang: 'ko',
    category: 'profile',
  },
  {
    id: 'profile-neg-ko-02',
    html: `<form><input id="addr" aria-label="주소" name="address" /></form>`,
    elements: ['#addr'],
    expected: [false],
    lang: 'ko',
    category: 'profile',
  },
  {
    id: 'profile-neg-ja-01',
    html: `<form><input id="name" aria-label="名前" name="display_name" /></form>`,
    elements: ['#name'],
    expected: [false],
    lang: 'ja',
    category: 'profile',
  },

  // ── A few true positives to keep the corpus honest ────────────────────
  {
    id: 'profile-pw-01',
    html: `<form><input id="api" aria-label="API secret" name="api_secret" /></form>`,
    elements: ['#api'],
    expected: [true],
    lang: 'en',
    category: 'profile',
    notes: '"secret" boundary match in both name and aria-label',
  },
  {
    id: 'profile-pw-02',
    html: `<form><input id="recov" name="recovery_passcode" /></form>`,
    elements: ['#recov'],
    expected: [true],
    lang: 'en',
    category: 'profile',
    notes: 'underscore boundary — "passcode" token',
  },
  {
    id: 'profile-pw-03',
    html: `<form><input id="pin" aria-label="핀번호" name="pin_code" /></form>`,
    elements: ['#pin'],
    expected: [true],
    lang: 'ko',
    category: 'profile',
  },
]
