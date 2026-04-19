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
