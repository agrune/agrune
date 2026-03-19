# Todo

## 2026-03-19

### `webcli snapshot` 토큰 절감

- 문제: 지금은 전체 snapshot JSON을 매번 읽어서 구조화 제어 이점이 있어도 토큰 낭비가 큼.
- 해야 할 일: 그룹 단위 조회, 이름/문자열 기준 서버측 검색, 긴 `textContent`/`sourceFile` 생략하는 compact 모드, 직전 snapshot 대비 diff 모드 추가 검토.
- 기대 효과: 이미지 기반 브라우저 에이전트 대비 토큰 이점을 더 크게 만들고, 반복 조작 시 응답량을 줄임.
