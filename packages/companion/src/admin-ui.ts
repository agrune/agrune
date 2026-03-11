function escapeHtmlServer(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

export function renderAdminLoginHtml(tokenPath: string, errorMessage?: string): string {
  const escapedTokenPath = escapeHtmlServer(tokenPath)
  const escapedError = errorMessage ? escapeHtmlServer(errorMessage) : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WebMCP Companion Admin Login</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f2f5fa; color: #16212f; }
      main { width: min(460px, calc(100vw - 32px)); background: #fff; border: 1px solid #d8e0ea; border-radius: 14px; padding: 22px; box-shadow: 0 16px 40px rgba(15, 27, 43, 0.08); }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { color: #4a596e; line-height: 1.45; }
      form { display: grid; gap: 10px; margin-top: 18px; }
      input { border: 1px solid #cbd6e4; border-radius: 10px; padding: 10px 12px; font: inherit; }
      button { border: 0; border-radius: 10px; padding: 10px 12px; background: #0f6bdc; color: #fff; font: inherit; cursor: pointer; }
      code { font-family: ui-monospace, Menlo, monospace; background: #eef3f9; padding: 1px 5px; border-radius: 6px; }
      .error { color: #932626; background: #ffe4e4; border-radius: 10px; padding: 10px 12px; }
      .muted { color: #65758a; font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <h1>WebMCP Companion Admin</h1>
      <p>관리자 토큰으로 로그인하면 <code>/admin</code>과 <code>/admin/api/*</code>에 접근할 수 있습니다.</p>
      ${escapedError ? `<p class="error">${escapedError}</p>` : ''}
      <form method="GET" action="/admin/login">
        <label for="token">Admin Token</label>
        <input id="token" name="token" type="password" autocomplete="off" required />
        <button type="submit">Login</button>
      </form>
      <p class="muted">토큰 파일: <code>${escapedTokenPath}</code></p>
    </main>
  </body>
</html>`
}

export function renderAdminHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WebMCP Companion Admin</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f2f5fa; color: #16212f; }
      main { max-width: 1080px; margin: 0 auto; padding: 18px 14px 40px; }
      h1 { margin: 0; font-size: 28px; }
      p { color: #4a596e; }
      .card { background: #fff; border: 1px solid #d8e0ea; border-radius: 10px; padding: 12px; margin-top: 14px; }
      button { border: 0; border-radius: 8px; padding: 6px 10px; background: #0f6bdc; color: white; cursor: pointer; }
      button.danger { background: #c63636; }
      button:disabled { opacity: 0.55; cursor: wait; }
      table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 13px; }
      th, td { border-bottom: 1px solid #e7edf5; text-align: left; padding: 6px; vertical-align: top; }
      th { color: #4a596e; font-weight: 600; }
      code { font-family: ui-monospace, Menlo, monospace; }
      pre { margin: 0; max-height: 280px; overflow: auto; background: #0f1b2b; color: #d6e0ef; padding: 10px; border-radius: 8px; font-size: 12px; }
      .muted { color: #65758a; }
      .pill { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 12px; background: #e9f1ff; color: #1f4d93; }
      .pill.pending { background: #fff4dd; color: #8c5a08; }
      .pill.denied { background: #ffe4e4; color: #932626; }
      .pill.active { background: #dff6e6; color: #1d6b3a; }
    </style>
  </head>
  <body>
    <main>
      <h1>WebMCP Companion</h1>
      <p>로컬 companion 상태/세션/승인을 관리합니다.</p>
      <section class="card">
        <h3>Status</h3>
        <pre id="status">loading...</pre>
      </section>
      <section class="card">
        <h3>Sessions</h3>
        <div id="sessions"></div>
      </section>
      <section class="card">
        <h3>Origins</h3>
        <div id="origins"></div>
      </section>
      <section class="card">
        <h3>Confirmations</h3>
        <div id="confirmations"></div>
      </section>
      <section class="card">
        <h3>Logs</h3>
        <pre id="logs">loading...</pre>
      </section>
    </main>
    <script>
      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => {
          switch (char) {
            case '&':
              return '&amp;'
            case '<':
              return '&lt;'
            case '>':
              return '&gt;'
            case '"':
              return '&quot;'
            case "'":
              return '&#39;'
            default:
              return char
          }
        })
      }

      function safeJson(value) {
        try {
          return JSON.stringify(value) ?? 'null'
        } catch {
          return '[unserializable]'
        }
      }

      async function api(path, init = {}) {
        const res = await fetch(path, {
          credentials: 'same-origin',
          ...init,
          headers: {
            'content-type': 'application/json',
            ...(init.headers || {}),
          },
        })
        const text = await res.text()
        if (res.status === 401) {
          window.location.assign('/admin/login')
          throw new Error('HTTP 401')
        }
        if (!res.ok) {
          throw new Error(\`HTTP \${res.status}: \${text}\`)
        }
        return text ? JSON.parse(text) : {}
      }

      function fmtMs(ts) {
        if (!ts) return '-'
        const d = new Date(ts)
        return d.toLocaleTimeString()
      }

      function renderSessions(list) {
        if (!Array.isArray(list) || list.length === 0) {
          document.getElementById('sessions').innerHTML = '<div class="muted">세션 없음</div>'
          return
        }

        const rows = list.map(session => {
          const statusClass =
            session.approvalStatus === 'pending' || session.approvalStatus === 'denied'
              ? session.approvalStatus
              : ''
          const statusPill =
            \`<span class="pill \${statusClass}">\${escapeHtml(session.approvalStatus || 'unknown')}</span>\`
          const activePill = session.active ? '<span class="pill active">active</span>' : ''
          const action = session.active
            ? ''
            : \`<button data-action="activate-session" data-session-id="\${escapeHtml(session.id)}">Set Active</button>\`
          return \`<tr>
            <td><code>\${escapeHtml(session.id)}</code></td>
            <td>\${escapeHtml(session.title || '-')}<br/><span class="muted">\${escapeHtml(session.url || '-')}</span></td>
            <td>\${escapeHtml(session.origin || '-')}</td>
            <td>\${statusPill} \${activePill}</td>
            <td>\${escapeHtml(String(session.toolCount ?? 0))}</td>
            <td>\${escapeHtml(String(session.pendingCallCount ?? 0))}</td>
            <td>\${escapeHtml(fmtMs(session.lastSeenAt))}</td>
            <td>\${action}</td>
          </tr>\`
        }).join('')

        document.getElementById('sessions').innerHTML = \`<table>
          <thead><tr><th>ID</th><th>Page</th><th>Origin</th><th>Status</th><th>Tools</th><th>Pending</th><th>Last Seen</th><th>Action</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`
      }

      function renderOrigins(items) {
        if (!Array.isArray(items) || items.length === 0) {
          document.getElementById('origins').innerHTML = '<div class="muted">origin 없음</div>'
          return
        }
        const rows = items.map(item => {
          const statusClass = item.status === 'pending' || item.status === 'denied' ? item.status : ''
          const approve =
            \`<button data-action="approve-origin" data-origin="\${escapeHtml(item.origin || '')}">Approve</button>\`
          const revoke =
            \`<button class="danger" data-action="revoke-origin" data-origin="\${escapeHtml(item.origin || '')}">Revoke</button>\`
          return \`<tr>
            <td><code>\${escapeHtml(item.origin || '')}</code></td>
            <td><span class="pill \${statusClass}">\${escapeHtml(item.status || 'unknown')}</span></td>
            <td>\${approve} \${revoke}</td>
          </tr>\`
        }).join('')
        document.getElementById('origins').innerHTML = \`<table>
          <thead><tr><th>Origin</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`
      }

      function renderConfirmations(items) {
        if (!Array.isArray(items) || items.length === 0) {
          document.getElementById('confirmations').innerHTML = '<div class="muted">확인 대기 없음</div>'
          return
        }
        const rows = items.map(item => {
          const approve =
            \`<button data-action="approve-confirmation" data-call-id="\${escapeHtml(item.callId || '')}">Approve</button>\`
          const reject =
            \`<button class="danger" data-action="reject-confirmation" data-call-id="\${escapeHtml(item.callId || '')}">Reject</button>\`
          return \`<tr>
            <td><code>\${escapeHtml(item.callId || '')}</code></td>
            <td>\${escapeHtml(item.toolName || '-')}</td>
            <td><code>\${escapeHtml(safeJson(item.arguments))}</code></td>
            <td>\${escapeHtml(fmtMs(item.createdAt))}</td>
            <td>\${approve} \${reject}</td>
          </tr>\`
        }).join('')
        document.getElementById('confirmations').innerHTML = \`<table>
          <thead><tr><th>Call</th><th>Tool</th><th>Args</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`
      }

      async function activateSession(sessionId) {
        await api('/admin/api/sessions/activate', { method: 'POST', body: JSON.stringify({ sessionId }) })
        await refresh()
      }

      async function approveOrigin(origin) {
        await api('/admin/api/origins/approve', { method: 'POST', body: JSON.stringify({ origin }) })
        await refresh()
      }

      async function revokeOrigin(origin) {
        await api('/admin/api/origins/revoke', { method: 'POST', body: JSON.stringify({ origin }) })
        await refresh()
      }

      async function approveConfirmation(callId) {
        await api('/admin/api/confirmations/approve', { method: 'POST', body: JSON.stringify({ callId }) })
        await refresh()
      }

      async function rejectConfirmation(callId) {
        await api('/admin/api/confirmations/reject', { method: 'POST', body: JSON.stringify({ callId }) })
        await refresh()
      }

      async function refresh() {
        try {
          const [status, sessions, origins, logs, confirmations] = await Promise.all([
            api('/admin/api/status'),
            api('/admin/api/sessions'),
            api('/admin/api/origins'),
            api('/admin/api/logs?limit=80'),
            api('/admin/api/confirmations'),
          ])

          document.getElementById('status').textContent = JSON.stringify(status, null, 2)
          renderSessions(sessions.sessions || [])
          renderOrigins(origins.origins || [])
          renderConfirmations(confirmations.confirmations || [])
          document.getElementById('logs').textContent = JSON.stringify(logs.logs || [], null, 2)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          document.getElementById('status').textContent = message
        }
      }

      document.addEventListener('click', event => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest('button[data-action]')
        if (!(button instanceof HTMLButtonElement)) return

        const action = button.dataset.action || ''
        button.disabled = true

        void (async () => {
          try {
            if (action === 'activate-session' && button.dataset.sessionId) {
              await activateSession(button.dataset.sessionId)
              return
            }
            if (action === 'approve-origin' && button.dataset.origin) {
              await approveOrigin(button.dataset.origin)
              return
            }
            if (action === 'revoke-origin' && button.dataset.origin) {
              await revokeOrigin(button.dataset.origin)
              return
            }
            if (action === 'approve-confirmation' && button.dataset.callId) {
              await approveConfirmation(button.dataset.callId)
              return
            }
            if (action === 'reject-confirmation' && button.dataset.callId) {
              await rejectConfirmation(button.dataset.callId)
            }
          } finally {
            button.disabled = false
          }
        })()
      })

      refresh()
      setInterval(refresh, 1500)
    </script>
  </body>
</html>`
}
