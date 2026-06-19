import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlaywrightDriver } from '../src/playwright-driver'

const RUN_SMOKE = process.env.AGRUNE_BACKEND_SMOKE === '1'
const describeSmoke = RUN_SMOKE ? describe : describe.skip

function pageUrl(body: string, manifest: unknown): string {
  const html = `<!doctype html><html><body>${body}<script>window.__agrune_manifest__ = ${JSON.stringify(manifest)}</script></body></html>`
  return `data:text/html,${encodeURIComponent(html)}`
}

const BASIC_PAGE = pageUrl(
  '<button id="b1" onclick="this.textContent=\'clicked\'">go</button>',
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [{ targetId: 'btn', name: 'Go', desc: 'main button', actionKinds: ['click'], selector: { css: '#b1' } }],
    }],
  },
)

// Manifest-authored action feedback: `change` mutates its own text (signature
// changes → snapshot version bumps → onSuccess); `inert` does nothing on click
// (no signature change → onNoEffect). This exercises the screen-change gate end
// to end through the real execute() path.
const FEEDBACK_PAGE = pageUrl(
  `
  <button id="change" onclick="this.textContent='changed'">change</button>
  <button id="inert">inert</button>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'change', name: 'Change', desc: '', actionKinds: ['click'], selector: { css: '#change' }, onSuccess: 'The screen advanced.', onNoEffect: 'Nothing changed.' },
        { targetId: 'inert', name: 'Inert', desc: '', actionKinds: ['click'], selector: { css: '#inert' }, onSuccess: 'Should never appear.', onNoEffect: 'No effect - a precondition is unmet.' },
      ],
    }],
  },
)

// Hybrid unmapped fallback: the manifest covers only #b1; #desc is a real input
// the manifest does not know about. Detection should surface it as a raw x-ref the
// agent can fill. The input mirrors its value into #b1 so the effect is observable
// through a mapped target's textContent.
const HYBRID_PAGE = pageUrl(
  `
  <input id="desc" placeholder="Describe the task" oninput="document.getElementById('b1').textContent=this.value">
  <button id="b1">go</button>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [{ targetId: 'btn', name: 'Go', desc: '', actionKinds: ['click'], selector: { css: '#b1' } }],
    }],
  },
)

// Screen-message delta: clicking submit reveals an app validation message in a
// role=alert node that no manifest target covers. The a11y delta should surface it.
const SCREEN_MSG_PAGE = pageUrl(
  `
  <button id="submit" onclick="document.getElementById('err').textContent='Description is required'">Submit</button>
  <div role="alert" id="err"></div>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [{ targetId: 'submit', name: 'Submit', desc: '', actionKinds: ['click'], selector: { css: '#submit' } }],
    }],
  },
)

// Problem 1 repro: a sensitive (password) field. Filling it must register as a
// screen change (onSuccess) even though valuePreview stays null to avoid leaking
// the secret. Before the hasValue signature fix this wrongly read as onNoEffect.
const MASKED_PAGE = pageUrl(
  `<input id="pw" type="password"><button id="other">other</button>`,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'pw', name: 'Password', desc: '', actionKinds: ['fill'], selector: { css: '#pw' }, onSuccess: 'Secret saved.', onNoEffect: 'Nothing was entered.' },
      ],
    }],
  },
)

// Problem 2 repro: a self-updating clock target plus an inert button. Clicking the
// inert button must read as onNoEffect; without the volatile flag the clock's tick
// bumps the snapshot version so the inert click wrongly reads as onSuccess.
const VOLATILE_PAGE = pageUrl(
  `
  <span id="clock">0</span>
  <button id="inert">inert</button>
  <script>let n=0;setInterval(function(){document.getElementById('clock').textContent=String(++n)},20)</script>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'clock', name: 'Clock', desc: '', actionKinds: ['click'], selector: { css: '#clock' }, volatile: true },
        { targetId: 'inert', name: 'Inert', desc: '', actionKinds: ['click'], selector: { css: '#inert' }, onSuccess: 'Advanced.', onNoEffect: 'No effect.' },
      ],
    }],
  },
)

// Residual of Problem 2 on the a11y-delta channel: a volatile live-region counter
// bumps on any click. Its churn must NOT leak into screenMessages, while a genuine
// app message still does. The counter increments deterministically on click.
const VOLATILE_DELTA_PAGE = pageUrl(
  `
  <div role="status" id="ctr">0</div>
  <button id="go" onclick="document.getElementById('msg').textContent='Saved'">go</button>
  <div role="alert" id="msg"></div>
  <script>document.addEventListener('click',function(){var c=document.getElementById('ctr');c.textContent=String(+c.textContent+1)})</script>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'ctr', name: 'Counter', desc: '', actionKinds: ['click'], selector: { css: '#ctr' }, volatile: true },
        { targetId: 'go', name: 'Go', desc: '', actionKinds: ['click'], selector: { css: '#go' } },
      ],
    }],
  },
)

// Problem 4 repro: filling the input enables the submit button only AFTER a delay
// (a debounced/async effect). An immediate snapshot misses it; settle should wait.
const ASYNC_ENABLE_PAGE = pageUrl(
  `
  <input id="name" oninput="setTimeout(function(){document.getElementById('submit').disabled=false},300)">
  <button id="submit" disabled>submit</button>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'name', name: 'Name', desc: '', actionKinds: ['fill'], selector: { css: '#name' } },
        { targetId: 'submit', name: 'Submit', desc: '', actionKinds: ['click'], selector: { css: '#submit' } },
      ],
    }],
  },
)

// Problem 3 repro: two REQUIRED inputs gate a Create button. The manifest carries
// no `required` flag — required intent is detected from the DOM `required` attribute
// — so after each fill the agent should be told which required fields remain empty
// (pendingRequired) instead of having to infer it from the disabled button.
const REQUIRED_FORM_PAGE = pageUrl(
  `
  <input id="title" required>
  <input id="assignee" required>
  <button id="create">Create</button>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'title', name: 'Title', desc: '', actionKinds: ['fill'], selector: { css: '#title' } },
        { targetId: 'assignee', name: 'Assignee', desc: '', actionKinds: ['fill'], selector: { css: '#assignee' } },
        { targetId: 'create', name: 'Create', desc: '', actionKinds: ['click'], selector: { css: '#create' } },
      ],
    }],
  },
)

// Canvas drag: a React-Flow-like pane. The `.react-flow__viewport` carries a CSS
// matrix (pan 40,40 / zoom 1); a node sits at flow (100,50). A 1:1 mouse-drag
// handler (grab origin = mousedown, i.e. nodeDragThreshold=0 semantics) moves the
// node by the pointer delta. The manifest marks the group as a canvas, so the
// driver converts canvas destinationCoords → viewport px, drags, and reads the
// node's final canvas center back as movedTarget.
const CANVAS_PAGE = pageUrl(
  `
  <div id="cv" data-agrune-demo="workflow-canvas" style="position:relative;width:600px;height:400px;overflow:hidden;background:#eee">
    <div class="react-flow__viewport" style="position:absolute;top:0;left:0;transform:translate(40px,40px) scale(1);transform-origin:0 0">
      <div data-agrune-demo="workflow-node" data-workflow-node-id="n1" style="position:absolute;transform:translate(100px,50px);width:80px;height:40px;background:#9cf">N1</div>
      <div data-agrune-demo="workflow-node" data-workflow-node-id="n2" style="position:absolute;transform:translate(300px,160px);width:80px;height:40px;background:#fc9">N2</div>
    </div>
  </div>
  <script>
  (function(){
    var scale=1;
    function flowPos(node){ var m=new DOMMatrixReadOnly(node.style.transform); return {x:m.e,y:m.f}; }
    document.querySelectorAll('[data-agrune-demo="workflow-node"]').forEach(function(node){
      node.addEventListener('mousedown', function(e){
        var start=flowPos(node); var px0=e.clientX, py0=e.clientY;
        function mv(ev){ if(!(ev.buttons&1)) return; node.style.transform='translate('+(start.x+(ev.clientX-px0)/scale)+'px,'+(start.y+(ev.clientY-py0)/scale)+'px)'; }
        function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); }
        window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
      });
    });
  })();
  </script>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'wf',
      name: 'Workflow',
      canvas: { viewportSelector: '.react-flow__viewport' },
      targets: [
        { targetId: 'node1', name: 'Node 1', desc: 'a draggable node', actionKinds: ['click'], selector: { css: '[data-workflow-node-id="n1"]' } },
      ],
      repeats: [{
        repeatId: 'wf_nodes',
        template: 'wf_${key}',
        keyFrom: 'el.dataset.workflowNodeId ?? ""',
        strategy: 'dom',
        targets: [
          { targetId: 'node', name: 'Node', desc: '', actionKinds: ['click'], selector: { css: '[data-agrune-demo="workflow-node"]' } },
        ],
      }],
    }],
  },
)

const OVERLAY_PAGE = pageUrl(
  `
  <button id="outside">outside</button>
  <div role="dialog"><button id="ok">ok</button></div>
  `,
  {
    version: 3,
    groups: [{
      groupId: 'main',
      targets: [
        { targetId: 'outside', name: 'Outside', desc: '', actionKinds: ['click'], selector: { css: '#outside' } },
        { targetId: 'ok', name: 'Ok', desc: '', actionKinds: ['click'], selector: { css: '#ok' } },
      ],
    }],
  },
)

describeSmoke('PlaywrightDriver (headless chromium smoke)', () => {
  const driver = new PlaywrightDriver({ connection: { mode: 'launch', headless: true } })

  beforeAll(async () => {
    await driver.connect()
    // Decoration off: cursor flights would add latency to every act below.
    driver.updateConfig({ pointerAnimation: false, auroraGlow: false })
  }, 60_000)

  afterAll(async () => {
    await driver.disconnect()
  })

  it('builds a snapshot from the page manifest and executes act commands', async () => {
    const opened = await driver.openTab(BASIC_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const snapshot = driver.getSnapshot(opened.tabId)
    expect(snapshot).not.toBe(null)
    const target = snapshot?.targets.find(entry => entry.targetId === 'btn')
    expect(target?.actionableNow).toBe(true)
    expect(target?.reason).toBe('ready')

    const result = await driver.execute(opened.tabId, { kind: 'act', targetId: 'btn', action: 'click' })
    expect(result.ok).toBe(true)
    expect(result.snapshot?.targets.find(entry => entry.targetId === 'btn')?.textContent).toBe('clicked')
  }, 30_000)

  it('keeps background tab snapshots available after ensureReady', async () => {
    const first = driver.resolveTabId()
    expect(first).not.toBe(null)

    const second = await driver.openTab(BASIC_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    // Regression guard: explicit-tabId snapshot reads must work for non-active tabs.
    expect(driver.getSnapshot(first as number)).not.toBe(null)
    expect(driver.getSnapshot(second.tabId)).not.toBe(null)
  }, 30_000)

  it('emits manifest onSuccess when an action changes the screen, onNoEffect when it does not', async () => {
    const opened = await driver.openTab(FEEDBACK_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    // Screen actually changes (button text mutates) → onSuccess.
    const changed = await driver.execute(opened.tabId, { kind: 'act', targetId: 'change', action: 'click' })
    expect(changed.ok).toBe(true)
    expect((changed.result as { feedback?: string } | undefined)?.feedback).toBe('The screen advanced.')

    // Mechanically-successful click that changes nothing → onNoEffect.
    const inert = await driver.execute(opened.tabId, { kind: 'act', targetId: 'inert', action: 'click' })
    expect(inert.ok).toBe(true)
    expect((inert.result as { feedback?: string } | undefined)?.feedback).toBe('No effect - a precondition is unmet.')
  }, 30_000)

  it('detects an unmapped control and lets the agent act on its raw x-ref', async () => {
    const opened = await driver.openTab(HYBRID_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    // Detection surfaced the manifest-uncovered input under the synthetic group.
    const snapshot = driver.getSnapshot(opened.tabId)
    const unmapped = snapshot?.targets.find(entry => entry.groupId === 'unmapped')
    expect(unmapped?.targetId).toBe('x1')
    expect(unmapped?.actionKinds).toEqual(['fill'])
    expect(unmapped?.name).toContain('Describe the task')

    // Acting on the raw ref executes via the derived selector; the input mirrors
    // its value into the mapped #b1 so we can observe the effect.
    const filled = await driver.execute(opened.tabId, { kind: 'fill', targetId: 'x1', value: 'monitor CI' })
    expect(filled.ok).toBe(true)
    expect(filled.snapshot?.targets.find(entry => entry.targetId === 'btn')?.textContent).toBe('monitor CI')
  }, 30_000)

  it('surfaces an app validation message as screenMessages after an action', async () => {
    const opened = await driver.openTab(SCREEN_MSG_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const res = await driver.execute(opened.tabId, { kind: 'act', targetId: 'submit', action: 'click' })
    expect(res.ok).toBe(true)
    expect((res.result as { screenMessages?: string[] } | undefined)?.screenMessages).toContain(
      'Description is required',
    )
  }, 30_000)

  it('treats filling a sensitive field as a screen change (version bumps, onSuccess)', async () => {
    const opened = await driver.openTab(MASKED_PAGE)
    expect(await driver.ensureReady()).toBe(null)
    const v0 = driver.getSnapshot(opened.tabId)?.version as number

    const res = await driver.execute(opened.tabId, { kind: 'fill', targetId: 'pw', value: 'hunter2' })
    expect(res.ok).toBe(true)
    expect(res.snapshot?.version).toBeGreaterThan(v0)
    expect((res.result as { feedback?: string } | undefined)?.feedback).toBe('Secret saved.')
  }, 30_000)

  it('does not let a volatile target falsely register an action as a screen change', async () => {
    const opened = await driver.openTab(VOLATILE_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const res = await driver.execute(opened.tabId, { kind: 'act', targetId: 'inert', action: 'click' })
    expect(res.ok).toBe(true)
    expect((res.result as { feedback?: string } | undefined)?.feedback).toBe('No effect.')
  }, 30_000)

  it('keeps a volatile region out of screenMessages but surfaces a real message', async () => {
    const opened = await driver.openTab(VOLATILE_DELTA_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const res = await driver.execute(opened.tabId, { kind: 'act', targetId: 'go', action: 'click' })
    expect(res.ok).toBe(true)
    const messages = (res.result as { screenMessages?: string[] } | undefined)?.screenMessages ?? []
    // The real app message gets through...
    expect(messages).toContain('Saved')
    // ...but the volatile counter's value (now "1") does not leak in.
    expect(messages).not.toContain('1')
  }, 30_000)

  it('settle waits for an async state change so the snapshot reflects it', async () => {
    // settle off: the immediate snapshot misses the delayed enable.
    driver.updateConfig({ settleAfterActionMs: 0 })
    const a = await driver.openTab(ASYNC_ENABLE_PAGE)
    expect(await driver.ensureReady()).toBe(null)
    const ra = await driver.execute(a.tabId, { kind: 'fill', targetId: 'name', value: 'abc' })
    expect(ra.snapshot?.targets.find(entry => entry.targetId === 'submit')?.actionableNow).toBe(false)

    // settle on: the bounded wait lets the delayed enable land before capture.
    driver.updateConfig({ settleAfterActionMs: 700 })
    const b = await driver.openTab(ASYNC_ENABLE_PAGE)
    expect(await driver.ensureReady()).toBe(null)
    const rb = await driver.execute(b.tabId, { kind: 'fill', targetId: 'name', value: 'abc' })
    expect(rb.snapshot?.targets.find(entry => entry.targetId === 'submit')?.actionableNow).toBe(true)

    driver.updateConfig({ settleAfterActionMs: 0 }) // restore default for later tests
  }, 30_000)

  it('reports an explicit changed bit so "ok but nothing happened" is unambiguous', async () => {
    const opened = await driver.openTab(FEEDBACK_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const changed = await driver.execute(opened.tabId, { kind: 'act', targetId: 'change', action: 'click' })
    expect((changed.result as { changed?: boolean } | undefined)?.changed).toBe(true)

    const inert = await driver.execute(opened.tabId, { kind: 'act', targetId: 'inert', action: 'click' })
    expect((inert.result as { changed?: boolean } | undefined)?.changed).toBe(false)
  }, 30_000)

  it('surfaces still-empty required fields (pendingRequired) after a fill, DOM-detected', async () => {
    const opened = await driver.openTab(REQUIRED_FORM_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    // Fill one required field — the other required field is still empty and should
    // be named, so the agent knows what gates Create without reading the button.
    const first = await driver.execute(opened.tabId, { kind: 'fill', targetId: 'title', value: 'Investigate latency' })
    expect((first.result as { pendingRequired?: string[] } | undefined)?.pendingRequired).toEqual(['Assignee'])

    // Fill the last required field — nothing remains, so no nudge is emitted.
    const second = await driver.execute(opened.tabId, { kind: 'fill', targetId: 'assignee', value: 'Bob Kim' })
    expect((second.result as { pendingRequired?: string[] } | undefined)?.pendingRequired).toBeUndefined()
  }, 30_000)

  it('surfaces canvas-group nodes in stable canvas coords with a group viewportTransform', async () => {
    const opened = await driver.openTab(CANVAS_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const snapshot = driver.getSnapshot(opened.tabId)
    const node = snapshot?.targets.find(entry => entry.targetId === 'node1')
    // center is reported in CANVAS coords (flow center = (100+40/2*... ) → (140,70)),
    // not viewport px, and labeled coordSpace:'canvas'.
    expect(node?.coordSpace).toBe('canvas')
    expect(node?.center?.x).toBeGreaterThanOrEqual(138)
    expect(node?.center?.x).toBeLessThanOrEqual(142)
    expect(node?.center?.y).toBeGreaterThanOrEqual(68)
    expect(node?.center?.y).toBeLessThanOrEqual(72)

    const group = snapshot?.groups.find(g => g.groupId === 'wf')
    expect(group?.viewportTransform).toEqual({ translateX: 40, translateY: 40, scale: 1 })
  }, 30_000)

  it('drags a canvas node to exact canvas coords and reports movedTarget', async () => {
    const opened = await driver.openTab(CANVAS_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const res = await driver.execute(opened.tabId, {
      kind: 'drag',
      sourceTargetId: 'node1',
      destinationCoords: { x: 300, y: 200 },
    })
    expect(res.ok).toBe(true)
    const result = res.result as {
      coordSpace?: string
      moved?: boolean
      movedTarget?: { from?: { x: number; y: number }; to?: { x: number; y: number }; movedPx?: number }
    }
    expect(result.coordSpace).toBe('canvas')
    expect(result.moved).toBe(true)
    // The node's center lands at canvas (300, 200) within rounding tolerance.
    expect(result.movedTarget?.to?.x).toBeGreaterThanOrEqual(297)
    expect(result.movedTarget?.to?.x).toBeLessThanOrEqual(303)
    expect(result.movedTarget?.to?.y).toBeGreaterThanOrEqual(197)
    expect(result.movedTarget?.to?.y).toBeLessThanOrEqual(203)
    // from is the node's original canvas center (≈140,70).
    expect(result.movedTarget?.from?.x).toBeGreaterThanOrEqual(138)
    expect(result.movedTarget?.from?.x).toBeLessThanOrEqual(142)
  }, 30_000)

  it('drags a NON-first repeat-instance node by its key (resolveLocatorMulti)', async () => {
    const opened = await driver.openTab(CANVAS_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    // The second node, addressed by its repeat-instance ref (key=n2). Before the
    // resolveLocatorMulti fix this resolved to .first() and failed TARGET_NOT_FOUND.
    const snapshot = driver.getSnapshot(opened.tabId)
    const n2 = snapshot?.targets.find(
      t => t.groupId === 'wf' && t.repeatInstance?.key === 'n2' && t.center,
    )
    expect(n2, 'second repeat-instance node resolved with a center').toBeTruthy()

    const res = await driver.execute(opened.tabId, {
      kind: 'drag',
      sourceTargetId: n2!.targetId,
      destinationCoords: { x: 150, y: 90 },
    })
    expect(res.ok, JSON.stringify(res.ok ? {} : res.error)).toBe(true)
    const result = res.result as { moved?: boolean; movedTarget?: { to?: { x: number; y: number } } }
    expect(result.moved).toBe(true)
    expect(result.movedTarget?.to?.x).toBeGreaterThanOrEqual(147)
    expect(result.movedTarget?.to?.x).toBeLessThanOrEqual(153)
  }, 30_000)

  it('rejects a canvas drag whose destination maps outside the visible pane', async () => {
    const opened = await driver.openTab(CANVAS_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const res = await driver.execute(opened.tabId, {
      kind: 'drag',
      sourceTargetId: 'node1',
      destinationCoords: { x: 100000, y: 200 },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('DESTINATION_OUTSIDE_CANVAS')
  }, 30_000)

  it('produces an empty snapshot for pages without an Agrune manifest', async () => {
    const opened = await driver.openTab('data:text/html,<p>no manifest here</p>')
    expect(await driver.ensureReady()).toBe(null)
    const snapshot = driver.getSnapshot(opened.tabId)
    expect(snapshot?.targets).toEqual([])
  }, 30_000)

  it('blocks non-overlay targets while an overlay flow is active (FLOW_BLOCKED)', async () => {
    const opened = await driver.openTab(OVERLAY_PAGE)
    expect(await driver.ensureReady()).toBe(null)

    const blocked = await driver.execute(opened.tabId, { kind: 'act', targetId: 'outside', action: 'click' })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe('FLOW_BLOCKED')

    const allowed = await driver.execute(opened.tabId, { kind: 'act', targetId: 'ok', action: 'click' })
    expect(allowed.ok).toBe(true)
  }, 30_000)

  it('maps unknown targets to TARGET_NOT_FOUND command errors', async () => {
    const tabId = driver.resolveTabId()
    const result = await driver.execute(tabId as number, { kind: 'act', targetId: 'nope', action: 'click' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TARGET_NOT_FOUND')
  }, 30_000)
})
