import {
  isHostFiber,
  isCompositeFiber,
  getDisplayName,
  getFiberStack,
  getLatestFiber,
  type Fiber,
} from 'bippy'
import type { FiberIdentityPath } from '@agrune/manifest'

export class FiberIdentityIndex {
  // HTMLElement → path descriptor (참조 아님, 값 타입 저장)
  private readonly domToPath = new WeakMap<HTMLElement, FiberIdentityPath>()
  // path JSON string → HTMLElement 역방향 (WeakRef 사용으로 GC 허용)
  private readonly pathToRef = new Map<string, WeakRef<HTMLElement>>()

  indexFiber(fiber: Fiber): void {
    if (!isHostFiber(fiber)) return
    const dom = fiber.stateNode
    if (!(dom instanceof HTMLElement)) return
    const latest = getLatestFiber(fiber)
    const stack = getFiberStack(latest)
    const path = this.buildPath(stack)
    const key = JSON.stringify(path)
    // 이전 path가 있으면 역방향 맵에서 제거
    const existing = this.domToPath.get(dom)
    if (existing) {
      this.pathToRef.delete(JSON.stringify(existing))
    }
    this.domToPath.set(dom, path)
    this.pathToRef.set(key, new WeakRef(dom))
  }

  deindexFiber(fiber: Fiber): void {
    if (!isHostFiber(fiber)) return
    const dom = fiber.stateNode
    if (!(dom instanceof HTMLElement)) return
    const path = this.domToPath.get(dom)
    if (path) {
      this.pathToRef.delete(JSON.stringify(path))
      this.domToPath.delete(dom)
    }
  }

  getByPath(path: FiberIdentityPath): HTMLElement | null {
    const ref = this.pathToRef.get(JSON.stringify(path))
    return ref?.deref() ?? null
  }

  getPathByDom(el: HTMLElement): FiberIdentityPath | null {
    if (!(el instanceof HTMLElement)) return null
    // WR-06: stale DOM 방어 — fiber 가 unmount 된 직후에도 외부에서 element 참조를
    // 붙들고 있으면 WeakMap 엔트리는 살아있으므로, recorder 가 "이미 detach 된"
    // element 로 selector 를 만들지 않도록 isConnected 체크를 선행한다.
    if (!el.isConnected) return null
    const stored = this.domToPath.get(el)
    if (!stored) return null
    // caller가 반환값을 변형해도 내부 WeakMap 안전하도록 얕은 segment 복제
    return stored.map(seg => ({ componentName: seg.componentName, key: seg.key, index: seg.index }))
  }

  private buildPath(stack: Fiber[]): FiberIdentityPath {
    return stack
      .filter(isCompositeFiber)
      .slice(0, 8) // depth cap (DoS 방어, T-13-14)
      .map((f) => ({
        componentName: getDisplayName(f.type) ?? '',
        key: f.key as string | null,
        index: f.index,
      }))
  }
}
