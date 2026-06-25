// A synthetic "long-tail government portal" page (정부24-class): heavy nav / mega-menu / multi-
// section application form / results list / footer — so the raw a11y tree is large, while the
// manifest declares only the actionable affordances, grouped. Dev-only bench fixture.

function links(prefix: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `<a href="/${prefix}/${i}">${prefix} 카테고리 ${i + 1}</a>`).join('\n')
}

function formRows(section: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `
    <div class="field">
      <label for="${section}-f${i}">${section} 항목 ${i + 1}</label>
      <input id="${section}-f${i}" name="${section}_${i}" placeholder="${section} 값 ${i + 1} 입력" />
    </div>`).join('\n')
}

function resultRows(n: number): string {
  return Array.from({ length: n }, (_, i) => `
    <li data-id="row-${i}">
      <span class="title">민원 처리 항목 ${i + 1}</span>
      <button class="apply" data-id="row-${i}">신청</button>
      <button class="detail" data-id="row-${i}">상세</button>
    </li>`).join('\n')
}

export const portalHtml = `<!doctype html><html lang="ko"><head><title>정부24 데모 포털</title></head>
<body>
  <header>
    <nav aria-label="주요 메뉴">
      <input id="global-search" type="search" placeholder="통합검색어를 입력하세요" />
      <button id="search-btn">검색</button>
      <a id="login-link" href="/login">로그인</a>
      <a id="signup-link" href="/signup">회원가입</a>
      ${links('menu', 18)}
    </nav>
  </header>
  <aside aria-label="카테고리">
    ${links('category', 40)}
  </aside>
  <main>
    <h1>온라인 민원 신청</h1>
    <form id="application">
      <section aria-label="신청인 정보">
        <h2>신청인 정보</h2>
        ${formRows('applicant', 8)}
      </section>
      <section aria-label="주소 정보">
        <h2>주소 정보</h2>
        ${formRows('address', 6)}
      </section>
      <section aria-label="서류 정보">
        <h2>서류 정보</h2>
        ${formRows('document', 6)}
      </section>
      <button id="submit-application" type="submit">신청서 제출</button>
      <button id="reset-application" type="reset">초기화</button>
    </form>
    <section aria-label="처리 내역">
      <h2>처리 내역</h2>
      <ul class="result-list">
        ${resultRows(30)}
      </ul>
    </section>
  </main>
  <footer>
    ${links('footer', 25)}
  </footer>
</body></html>`

// The manifest declares ONLY the actionable affordances, grouped — outline-first disclosure.
export const portalManifest = {
  version: 3,
  groups: [
    {
      groupId: 'search',
      name: '통합검색',
      desc: '포털 상단 통합검색',
      targets: [
        { targetId: 'search_input', name: '검색어', selector: { css: '#global-search' }, actionKinds: ['fill'] },
        { targetId: 'search_button', name: '검색', selector: { css: '#search-btn' }, actionKinds: ['click'] },
      ],
    },
    {
      groupId: 'account',
      name: '계정',
      targets: [
        { targetId: 'login', name: '로그인', selector: { css: '#login-link' }, actionKinds: ['click'] },
        { targetId: 'signup', name: '회원가입', selector: { css: '#signup-link' }, actionKinds: ['click'] },
      ],
    },
    {
      groupId: 'applicant',
      name: '신청인 정보',
      desc: '민원 신청서 신청인 섹션',
      targets: Array.from({ length: 8 }, (_, i) => ({
        targetId: `applicant_${i}`,
        name: `신청인 항목 ${i + 1}`,
        selector: { css: `#applicant-f${i}` },
        actionKinds: ['fill'],
      })),
    },
    {
      groupId: 'submit',
      name: '제출',
      targets: [
        { targetId: 'submit_btn', name: '신청서 제출', selector: { css: '#submit-application' }, actionKinds: ['click'] },
        { targetId: 'reset_btn', name: '초기화', selector: { css: '#reset-application' }, actionKinds: ['click'] },
      ],
    },
    {
      groupId: 'results',
      name: '처리 내역',
      desc: '민원 처리 항목 목록',
      targets: [],
      repeats: [
        {
          repeatId: 'result_rows',
          keyFrom: 'el.dataset.id ?? ""',
          nameFrom: 'el.closest("li")?.querySelector(".title")?.textContent?.trim() ?? ""',
          strategy: 'dom',
          containerSelector: { css: '.result-list' },
          targets: [
            { targetId: 'apply', name: '신청', selector: { css: '.apply' }, actionKinds: ['click'] },
            { targetId: 'detail', name: '상세', selector: { css: '.detail' }, actionKinds: ['click'] },
          ],
        },
      ],
    },
  ],
}
