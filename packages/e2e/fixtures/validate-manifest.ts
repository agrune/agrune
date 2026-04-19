import { defineManifest, defineGroup, defineTarget } from '@agrune/manifest'

const signin = defineTarget({
  targetId: 'signin',
  actionKinds: ['click'],
  selector: { role: { name: 'button', level: 'Sign in' } },
})

const userCard = defineTarget({
  targetId: 'user_card',
  actionKinds: ['click'],
  selector: { testId: 'user-card' },
})

const docsLink = defineTarget({
  targetId: 'docs_link',
  actionKinds: ['click'],
  selector: { text: 'Docs' },
})

const page = defineGroup({
  groupId: 'page',
  targets: [signin, userCard, docsLink],
})

export default defineManifest({
  groups: [page],
})
