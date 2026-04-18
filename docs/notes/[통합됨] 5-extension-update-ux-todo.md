> **[아카이브 / v1.0 시점 문서]** 본 문서는 2026-04-15 CDP-only 피봇 이전에 작성된 설계 메모입니다. 여기에 등장하는 `extension`, `native messaging`, `backend daemon` 표현은 당시 아키텍처 기준이며, 현재 agrune (v1.1) 은 `CdpDriver + @agrune/mcp` 조합만 사용합니다. 최신 정보는 상위 `README.md` 와 `AGENTS.md` 를 참고하세요. (배너 추가: 2026-04-18)

---

# 확장프로그램 업데이트 UX

작성일: 2026-03-24

## 문제

현재 개발 흐름에서는 확장프로그램을 삭제했다가 다시 올리는 비용이 크다.

## 개발 환경

- `재설치` 대신 `reload + 탭 새로고침`
- native host 재연결과 extension code reload를 분리
- 설치기는 로드 중인 unpacked extension 디렉터리를 통째로 지우지 않도록 개선

## 상용 환경

- 확장프로그램은 스토어 배포 또는 관리형 배포 기준으로 자동 업데이트
- native host/backend와 extension 간 버전 스큐를 허용하는 호환성 전략 필요
- 정상 업데이트 경로에서 사용자에게 재설치 요구 금지
