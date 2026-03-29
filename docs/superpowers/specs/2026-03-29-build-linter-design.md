# 1-5. 빌드 린터 설계

작성일: 2026-03-29

## 배경

`data-agrune-action`이 있는데 `data-agrune-name`이나 `data-agrune-desc`가 빠진 어노테이션이 배포되면 AI가 해당 타깃을 제대로 인식/설명하지 못함. 빌드 시 잡아야 함.

현재 `demo/vite.config.ts`에 Vite 플러그인 프로토타입이 있음. 이를 범용화하여 annotate 스킬이 프로젝트 빌드 도구에 맞게 자동 삽입.

## 목표

- 빌드 도구별 린트 플러그인 템플릿 범용화 (Vite, Webpack, esbuild 등)
- annotate 스킬이 프로젝트 빌드 도구를 감지하고 맞는 템플릿 삽입
- 린트 에러 발생 시 AI 자동 수정 루프 지원

## 설계

### 검사 규칙

`data-agrune-action`이 있는 요소에 대해:
- `data-agrune-name` 필수 → 없으면 에러
- `data-agrune-desc` 필수 → 없으면 에러

### 빌드 도구별 템플릿

공통 검사 로직을 공유하되, 빌드 도구 통합 방식만 다름.

**Vite** (기존 프로토타입 기반):
```typescript
// vite-plugin-agrune-lint.ts
function agruneAnnotationLint(): Plugin {
  return {
    name: 'agrune-annotation-lint',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return null
      if (!code.includes('data-agrune-action')) return null
      const errors = checkAnnotations(code)
      if (errors.length > 0) this.error(formatErrors(id, errors))
      return null
    },
  }
}
```

**Webpack** (loader 방식):
```typescript
// agrune-lint-loader.ts
module.exports = function(source) {
  if (!source.includes('data-agrune-action')) return source
  const errors = checkAnnotations(source)
  if (errors.length > 0) this.emitError(new Error(formatErrors(this.resourcePath, errors)))
  return source
}
```

**esbuild** (plugin 방식):
```typescript
// esbuild-plugin-agrune-lint.ts
const agruneAnnotationLint: esbuild.Plugin = {
  name: 'agrune-annotation-lint',
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
      const source = await fs.readFile(args.path, 'utf8')
      if (!source.includes('data-agrune-action')) return null
      const errors = checkAnnotations(source)
      if (errors.length > 0) return { errors: errors.map(e => ({ text: e })) }
      return null
    })
  },
}
```

### 공통 검사 로직

```typescript
function checkAnnotations(code: string): { line: number; message: string }[] {
  const errors = []
  const lines = code.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('data-agrune-action')) continue
    const ctx = lines.slice(i, Math.min(i + 10, lines.length)).join(' ')
    const el = ctx.slice(0, (ctx.indexOf('>') + 1) || undefined)
    if (!el.includes('data-agrune-name'))
      errors.push({ line: i + 1, message: 'missing data-agrune-name' })
    if (!el.includes('data-agrune-desc'))
      errors.push({ line: i + 1, message: 'missing data-agrune-desc' })
  }
  return errors
}
```

### annotate 스킬 통합

annotate 스킬의 작업 플로우:
1. 프로젝트 빌드 도구 감지 (vite.config / webpack.config / package.json 등)
2. 해당 빌드 도구에 맞는 린트 플러그인 템플릿을 프로젝트에 삽입
3. 빌드 설정에 플러그인 등록
4. 빌드 실행 → 린트 에러 발생 시 자동 수정 → 재빌드

### AI 자동 수정 루프

```
빌드 실행 → 린트 에러 감지 → AI가 에러 메시지 파싱 →
해당 라인에 name/desc 추가 → 재빌드 → 통과 확인
```

annotate 스킬이 이 루프를 자동 수행.

## 변경 파일

| 파일 | 변경 |
|------|------|
| `skills/skills/annotate/SKILL.md` | 린트 플러그인 삽입 플로우 추가 |
| `skills/skills/annotate/references/lint-templates/` | 신규. Vite/Webpack/esbuild 템플릿 |
| `demo/vite.config.ts` | 기존 프로토타입을 템플릿 기반으로 교체 |

## 범위 밖

- npm 패키지로 린터 배포 (템플릿 삽입 방식 유지)
- 런타임 검증 (빌드에서 완전히 커버)
- 라이브 스캔 어노테이션 검증 (추후 필요 시 추가)
