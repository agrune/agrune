import { describe, expect, it } from 'vitest'
import type { PageTarget } from '../src/types'
import {
  buildBlockedTargetDetails,
  buildActionGroups,
  buildDragDestinationGroups,
  buildActionRenderLines,
  createActionViewFrame,
  getNextDragPlacement,
  isLikelyDragDestinationTarget,
  isLikelyDragTarget,
  reconcileActionViewFrames,
} from '../src/tui-app'

type VisibleActionView = Parameters<typeof createActionViewFrame>[0]

function makeView(
  viewKey: string,
  presentation: 'base' | 'overlay',
  groupId: string,
): VisibleActionView {
  return {
    presentation,
    viewKey,
    groups: [
      {
        groupId,
        label: groupId,
        targets: [],
        actionableCount: 0,
      },
    ],
  }
}

function makeTarget(overrides: Partial<PageTarget> = {}): PageTarget {
  return {
    targetId: 'login',
    groupId: 'auth',
    groupName: 'Auth',
    groupDesc: '인증',
    name: '로그인',
    description: '로그인 버튼',
    actionKind: 'click',
    selector: '[data-webcli-key="login"]',
    visible: true,
    inViewport: true,
    enabled: true,
    covered: false,
    actionableNow: true,
    reason: 'ready',
    overlay: false,
    sensitive: false,
    textContent: '로그인',
    valuePreview: null,
    sourceFile: 'App.tsx',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  }
}

describe('blocked target details', () => {
  it('blocked target 설명은 reason 필드를 우선 사용한다', () => {
    expect(
      buildBlockedTargetDetails(
        makeTarget({
          actionableNow: false,
          reason: 'covered',
        }),
      ),
    ).toEqual({
      targetId: 'login',
      reason: 'covered',
      actionableNow: false,
    })
  })
})

describe('drag placement helper', () => {
  it('좌우 이동 시 placement를 순환한다', () => {
    expect(getNextDragPlacement('inside', 1)).toBe('after')
    expect(getNextDragPlacement('inside', -1)).toBe('before')
    expect(getNextDragPlacement('before', -1)).toBe('after')
  })
})

describe('reconcileActionViewFrames', () => {
  it('base 화면이 이전 viewKey로 돌아오면 기존 frame 상태를 복원한다', () => {
    const baseAccount = makeView('base:account', 'base', 'account')
    const baseBilling = makeView('base:billing', 'base', 'billing')

    let frames = reconcileActionViewFrames([], baseAccount)
    frames = [
      {
        ...frames[0],
        selectedActionKey: 'target:account-save',
        actionFilter: 'save',
        collapsedGroups: { account: false },
      },
    ]

    frames = reconcileActionViewFrames(frames, baseBilling)
    expect(frames.map(frame => frame.viewKey)).toEqual(['base:account', 'base:billing'])

    frames = reconcileActionViewFrames(frames, baseAccount)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.selectedActionKey).toBe('target:account-save')
    expect(frames[0]?.actionFilter).toBe('save')
    expect(frames[0]?.collapsedGroups).toEqual({ account: false })
  })

  it('overlay가 닫히면 base frame 포커스를 그대로 유지한다', () => {
    const baseDashboard = makeView('base:dashboard', 'base', 'orders')
    const overlayConfirm = makeView('overlay:confirm', 'overlay', 'confirm')
    const overlayConfirmUpdated = makeView('overlay:confirm:v2', 'overlay', 'confirm')

    let frames = reconcileActionViewFrames([], baseDashboard)
    frames = [
      {
        ...frames[0],
        selectedActionKey: 'target:orders-open',
        collapsedGroups: { orders: false },
      },
    ]

    frames = reconcileActionViewFrames(frames, overlayConfirm)
    expect(frames.map(frame => frame.presentation)).toEqual(['base', 'overlay'])

    frames = reconcileActionViewFrames(frames, overlayConfirmUpdated)
    expect(frames).toHaveLength(2)
    expect(frames[1]?.viewKey).toBe('overlay:confirm:v2')

    frames = reconcileActionViewFrames(frames, baseDashboard)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.selectedActionKey).toBe('target:orders-open')
    expect(frames[0]?.collapsedGroups).toEqual({ orders: false })
  })
})

describe('buildActionGroups', () => {
  it('overlay view에서는 overlay target만 노출한다', () => {
    const baseTarget = makeTarget({
      targetId: 'assignee-trigger',
      groupId: 'wizard-step-basic',
      groupName: '기본 정보',
      name: '담당자 선택',
      actionableNow: false,
      covered: true,
      reason: 'covered',
    })
    const overlayTarget = makeTarget({
      targetId: 'assignee-alice',
      groupId: 'wizard-step-basic',
      groupName: '기본 정보',
      name: 'Alice Chen',
      overlay: true,
    })

    const groups = buildActionGroups(
      {
        version: 1,
        capturedAt: Date.now(),
        url: 'http://example.local',
        title: 'Example',
        groups: [
          {
            groupId: 'wizard-step-basic',
            groupName: '기본 정보',
            targetIds: [baseTarget.targetId, overlayTarget.targetId],
          },
        ],
        targets: [baseTarget, overlayTarget],
      },
      'overlay',
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.targets.map(target => target.targetId)).toEqual(['assignee-alice'])
  })
})

describe('buildActionRenderLines', () => {
  it('kanban-cards 그룹 target은 2열 그리드로 묶는다', () => {
    const group = {
      groupId: 'kanban-cards',
      label: '칸반 카드',
      targets: [],
      actionableCount: 3,
    }

    const lines = buildActionRenderLines([
      { type: 'group', group },
      {
        type: 'target',
        group,
        target: makeTarget({ targetId: 'task-1', groupId: 'kanban-cards', name: 'Task 1' }),
      },
      {
        type: 'target',
        group,
        target: makeTarget({ targetId: 'task-2', groupId: 'kanban-cards', name: 'Task 2' }),
      },
      {
        type: 'target',
        group,
        target: makeTarget({ targetId: 'task-3', groupId: 'kanban-cards', name: 'Task 3' }),
      },
    ])

    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ type: 'group', group: { groupId: 'kanban-cards' } })
    expect(lines[1]).toMatchObject({
      type: 'grid',
      cells: [{ targetId: 'task-1' }, { targetId: 'task-2' }],
    })
    expect(lines[2]).toMatchObject({
      type: 'grid',
      cells: [{ targetId: 'task-3' }],
    })
  })
})

describe('buildDragDestinationGroups', () => {
  it('드롭다운 트리거는 drag target으로 오인하지 않는다', () => {
    const dropdownTrigger = makeTarget({
      targetId: 'assignee-trigger',
      name: '담당자 선택',
      description: '태스크 담당자 드롭다운 열기',
    })

    expect(isLikelyDragTarget(dropdownTrigger)).toBe(false)
    expect(isLikelyDragDestinationTarget(dropdownTrigger)).toBe(false)
  })

  it('drag 모드에서는 dnd 관련 target만 남긴다', () => {
    const cardGroup = {
      groupId: 'kanban-cards',
      label: '칸반 카드',
      targets: [
        makeTarget({
          targetId: 'task-1',
          groupId: 'kanban-cards',
          name: 'Task 1',
          description: '이 카드를 드래그하여 이동',
        }),
        makeTarget({
          targetId: 'task-2',
          groupId: 'kanban-cards',
          name: 'Task 2',
          description: '이 카드를 드래그하여 이동',
        }),
      ],
      actionableCount: 2,
    }
    const columnGroup = {
      groupId: 'kanban-columns',
      label: '칸반 컬럼',
      targets: [
        makeTarget({
          targetId: 'done-column',
          groupId: 'kanban-columns',
          name: 'Done 컬럼',
          description: '이 컬럼으로 카드를 이동',
        }),
      ],
      actionableCount: 1,
    }
    const actionGroup = {
      groupId: 'kanban-card-actions',
      label: '카드 액션',
      targets: [
        makeTarget({
          targetId: 'task-1-delete',
          groupId: 'kanban-card-actions',
          name: 'Task 1 삭제',
          description: '이 태스크를 삭제',
        }),
      ],
      actionableCount: 1,
    }
    const toolGroup = {
      groupId: 'kanban-toolbar',
      label: '칸반 도구',
      targets: [
        makeTarget({
          targetId: 'new-task',
          groupId: 'kanban-toolbar',
          name: 'New Task',
          description: '새 태스크 생성 위자드 열기',
        }),
      ],
      actionableCount: 1,
    }

    const groups = buildDragDestinationGroups(
      [cardGroup, columnGroup, actionGroup, toolGroup],
      'task-1',
    )

    expect(groups.map(group => group.groupId)).toEqual(['kanban-cards', 'kanban-columns'])
    expect(groups[0]?.targets.map(target => target.targetId)).toEqual(['task-2'])
    expect(groups[1]?.targets.map(target => target.targetId)).toEqual(['done-column'])
  })
})
