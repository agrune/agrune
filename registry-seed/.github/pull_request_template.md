# Manifest contribution

<!--
이 PR template 는 community tier 기여자가 첫 manifest PR 을 올릴 때 low-risk
signal (public host, dev-only, no hash class, single host) 을 upfront 로
약속하게 강제한다. PR bot (GitHub Actions) 이 자동으로 아래 체크리스트를 다시
검증하지만, 기여자가 직접 체크함으로써 review latency 를 줄인다.
-->

## Checklist

- [ ] `registry.host` 가 public-resolvable 도메인 (localhost / private IP / `*.internal` / `*.local` 아님)
- [ ] `registry.tier` 는 `community` (verified 는 maintainer 승인 후 전환)
- [ ] `registry.allowedEnvironments` 는 `["dev"]` — community tier 가 prod 요청 시 schema-fail 라벨 자동 부착
- [ ] `registry.seedUrl` 이 manifest host 와 동일 apex/www (HTTPS only)
- [ ] Selector ladder 가 해시 class / `:nth-child` 를 사용하지 않음 (Phase 11 MANIFEST-04)
- [ ] `sensitive:true` 가 필요한 필드 (password, CVV, SSN, OTP, 주민등록번호, 카드번호 등) 는 명시됨 — `sensitive:false` 는 schema 상 불가
- [ ] 이 PR 은 단일 host 의 단일 버전만 추가/수정 (multi-host batch 금지 — velocity 관리 목적)
- [ ] `README.md` 10-seed 또는 기존 `manifests/` 에 이미 있는 host 와 중복 아님

## Summary

<!-- 호스트 / 타겟 개요 / 사용 시나리오 (2-4 줄). -->

## Testing

- [ ] 로컬에서 `agrune manifest validate <file> --url <seedUrl>` 실행 → 모든 target resolve OK
- [ ] 로컬에서 `node .github/scripts/validate-schema.mjs` (또는 `pnpm validate:seed` 모노레포 sync) 실행 → pass

## Security review

<!--
verified tier 로 PR 이 올라온 경우 또는 sensitive:true 필드가 포함된 경우에만
작성. PR bot 이 `requires-human-review:sensitive` / `tier-escalation` 라벨을
자동 부착하면 maintainer 2 명 승인이 강제된다.
-->

- [ ] sensitive:true 필드 목록:
- [ ] tier escalation (community → verified) 사유:
