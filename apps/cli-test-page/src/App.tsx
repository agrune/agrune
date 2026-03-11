import { useEffect, useState } from 'react'

type ViewMode = 'overview' | 'orders' | 'customers' | 'control' | 'settings'
type OrderStatus = 'Queued' | 'Review' | 'Ready to Ship' | 'Escalated'
type CustomerTier = 'Founding' | 'Priority' | 'Trial'

interface OrderCard {
  id: 'alpha' | 'bravo' | 'charlie'
  name: string
  owner: string
  eta: string
  status: OrderStatus
  value: string
}

interface CustomerCard {
  id: 'hana' | 'kai' | 'mina'
  name: string
  company: string
  tier: CustomerTier
  note: string
}

const initialOrders: Record<OrderCard['id'], OrderCard> = {
  alpha: {
    id: 'alpha',
    name: 'OR-4821 Fulfillment',
    owner: 'Ari Chen',
    eta: '14:10',
    status: 'Review',
    value: '$12.4k',
  },
  bravo: {
    id: 'bravo',
    name: 'OR-4829 Recovery Kit',
    owner: 'Mina Park',
    eta: '15:30',
    status: 'Queued',
    value: '$6.8k',
  },
  charlie: {
    id: 'charlie',
    name: 'OR-4838 Enterprise Restock',
    owner: 'Jae Song',
    eta: '17:45',
    status: 'Ready to Ship',
    value: '$21.9k',
  },
}

const customers: Record<CustomerCard['id'], CustomerCard> = {
  hana: {
    id: 'hana',
    name: 'Hana Robotics',
    company: 'Seoul',
    tier: 'Founding',
    note: 'automation upgrade pilot active',
  },
  kai: {
    id: 'kai',
    name: 'Kai Commerce',
    company: 'Busan',
    tier: 'Priority',
    note: 'waiting on weekend dispatch approval',
  },
  mina: {
    id: 'mina',
    name: 'Mina Health',
    company: 'Incheon',
    tier: 'Trial',
    note: 'needs guided onboarding and SLA brief',
  },
}

const shellStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top left, rgba(255, 188, 74, 0.18), transparent 24%), radial-gradient(circle at top right, rgba(76, 132, 255, 0.18), transparent 24%), #0d1521',
  color: '#f3f6fb',
  fontFamily:
    '"IBM Plex Sans KR", "IBM Plex Sans", "Pretendard", "Apple SD Gothic Neo", sans-serif',
}

const panelStyle = {
  background: 'rgba(14, 22, 35, 0.78)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  boxShadow: '0 24px 70px rgba(0,0,0,0.26)',
}

const mutedTextStyle = {
  color: '#8ea0b5',
}

function statusColor(status: OrderStatus) {
  if (status === 'Ready to Ship') return '#2dd4bf'
  if (status === 'Escalated') return '#ff7b72'
  if (status === 'Review') return '#f7c948'
  return '#7dd3fc'
}

function tierColor(tier: CustomerTier) {
  if (tier === 'Founding') return '#f59e0b'
  if (tier === 'Priority') return '#22c55e'
  return '#38bdf8'
}

export default function App() {
  const [phase, setPhase] = useState<'login' | 'workspace'>('login')
  const [view, setView] = useState<ViewMode>('overview')
  const [email, setEmail] = useState('ops@orbit-demo.ai')
  const [password, setPassword] = useState('launch-sequence')
  const [workspace, setWorkspace] = useState('orbit-ops')
  const [search, setSearch] = useState('')
  const [brief, setBrief] = useState('오늘은 로그인 이후 주문 승인, 고객 전환, 런치 패널 실행까지 시연합니다.')
  const [announcement, setAnnouncement] = useState('Priority cohort shipping review at 15:30.')
  const [orders, setOrders] = useState(initialOrders)
  const [selectedOrder, setSelectedOrder] = useState<OrderCard['id']>('alpha')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCard['id']>('hana')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [launchpadOpen, setLaunchpadOpen] = useState(false)
  const [pointerAnimation, setPointerAnimation] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [clickDelayLabel, setClickDelayLabel] = useState('0ms')
  const [lastAction, setLastAction] = useState('아직 실행 없음')
  const [activityLog, setActivityLog] = useState<string[]>([
    '09:00 Demo workspace seeded.',
    '09:04 Queue watchers synced.',
    '09:10 Awaiting operator login.',
  ])

  useEffect(() => {
    document.title = phase === 'login' ? 'webcli test' : 'Orbit Ops Console'
  }, [phase])

  const currentOrder = orders[selectedOrder]
  const currentCustomer = customers[selectedCustomer]

  const appendActivity = (message: string) => {
    setActivityLog(current => [`${new Date().toLocaleTimeString('ko-KR', { hour12: false })} ${message}`, ...current].slice(0, 6))
    setLastAction(message)
  }

  const loginToWorkspace = (mode: 'login' | 'signup' | 'demo') => {
    setPhase('workspace')
    setView('overview')
    appendActivity(
      mode === 'signup'
        ? `새 워크스페이스 생성: ${workspace}`
        : mode === 'demo'
          ? '데모 환경 빠른 진입'
          : `로그인 완료: ${email}`,
    )
  }

  const logout = () => {
    setPhase('login')
    appendActivity('운영 콘솔에서 로그아웃')
  }

  const changeOrderStatus = (status: OrderStatus) => {
    setOrders(current => ({
      ...current,
      [selectedOrder]: {
        ...current[selectedOrder],
        status,
      },
    }))
    appendActivity(`${currentOrder.name} 상태를 ${status}로 변경`)
  }

  const focusView = (next: ViewMode, label: string) => {
    setView(next)
    appendActivity(`${label} 화면으로 전환`)
  }

  const filteredOrders = Object.values(orders).filter(order =>
    `${order.name} ${order.owner} ${order.status}`.toLowerCase().includes(search.toLowerCase()),
  )

  if (phase === 'login') {
    return (
      <main
        style={{
          ...shellStyle,
          display: 'grid',
          placeItems: 'center',
          padding: 28,
        }}
      >
        <section
          style={{
            ...panelStyle,
            width: 'min(1080px, 100%)',
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.9fr',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 36,
              background:
                'linear-gradient(140deg, rgba(244, 163, 45, 0.16), rgba(39, 61, 94, 0.06))',
              display: 'grid',
              gap: 18,
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: '#f4a32d',
                  boxShadow: '0 0 18px rgba(244,163,45,0.7)',
                }}
              />
              <span style={{ color: '#f5c46c', fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Orbit Dispatch Demonstrator
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 54, lineHeight: 1.02 }}>
              로그인 이후 바로 운영 콘솔로 전환되는
              <br />
              복합 데모 앱
            </h1>
            <p style={{ ...mutedTextStyle, margin: 0, fontSize: 16, lineHeight: 1.7 }}>
              이 화면은 CLI/TUI가 로그인 입력과 버튼 클릭을 시연하기 위한 진입 페이지입니다. 로그인 후에는 주문 승인,
              고객 전환, 런치패드 모달, 드로어, 설정 토글까지 이어지는 운영 콘솔이 열립니다.
            </p>

            <div
              style={{
                marginTop: 10,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 14,
              }}
            >
              <article style={{ ...panelStyle, padding: 18 }}>
                <div style={{ fontSize: 12, color: '#93a4b8', textTransform: 'uppercase' }}>Flow</div>
                <strong style={{ fontSize: 24 }}>Login → Console</strong>
                <p style={{ ...mutedTextStyle, marginBottom: 0 }}>상태 전환이 명확해서 데모 설명이 쉽습니다.</p>
              </article>
              <article style={{ ...panelStyle, padding: 18 }}>
                <div style={{ fontSize: 12, color: '#93a4b8', textTransform: 'uppercase' }}>Controls</div>
                <strong style={{ fontSize: 24 }}>20+ Targets</strong>
                <p style={{ ...mutedTextStyle, marginBottom: 0 }}>fill과 click 타깃이 여러 그룹으로 분산되어 있습니다.</p>
              </article>
              <article style={{ ...panelStyle, padding: 18 }}>
                <div style={{ fontSize: 12, color: '#93a4b8', textTransform: 'uppercase' }}>Scenes</div>
                <strong style={{ fontSize: 24 }}>Drawer + Modal</strong>
                <p style={{ ...mutedTextStyle, marginBottom: 0 }}>후속 액션 시연에 적합한 오버레이 UI가 포함됩니다.</p>
              </article>
            </div>
          </div>

          <div style={{ padding: 32, display: 'grid', gap: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 28 }}>Operator Sign In</h2>
              <p style={{ ...mutedTextStyle, marginBottom: 0 }}>
                로그인하면 곧바로 라이브 운영 콘솔로 이동합니다.
              </p>
            </div>

            <section
              data-webcli-group="auth-form"
              data-webcli-group-name="Login Fields"
              data-webcli-group-desc="로그인 입력 필드"
              style={{ display: 'grid', gap: 14 }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Operator Email</span>
                <input
                  data-webcli-action="fill"
                  data-webcli-key="auth-email"
                  data-webcli-name="operator_email"
                  data-webcli-desc="운영자 이메일 입력"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="ops@orbit-demo.ai"
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: '#121b28',
                    color: '#f3f6fb',
                    padding: '13px 14px',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Workspace</span>
                <input
                  data-webcli-action="fill"
                  data-webcli-key="auth-workspace"
                  data-webcli-name="workspace_slug"
                  data-webcli-desc="워크스페이스 슬러그 입력"
                  value={workspace}
                  onChange={event => setWorkspace(event.target.value)}
                  placeholder="orbit-ops"
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: '#121b28',
                    color: '#f3f6fb',
                    padding: '13px 14px',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Passphrase</span>
                <input
                  type="password"
                  data-webcli-action="fill"
                  data-webcli-key="auth-password"
                  data-webcli-name="operator_password"
                  data-webcli-desc="운영자 비밀번호 입력"
                  data-webcli-sensitive="true"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="launch-sequence"
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: '#121b28',
                    color: '#f3f6fb',
                    padding: '13px 14px',
                  }}
                />
              </label>
            </section>

            <section
              data-webcli-group="auth-actions"
              data-webcli-group-name="Login Actions"
              data-webcli-group-desc="로그인/회원가입/데모 진입 액션"
              style={{ display: 'grid', gap: 10 }}
            >
              <button
                data-webcli-action="click"
                data-webcli-key="auth-login"
                data-webcli-name="login_primary"
                data-webcli-desc="운영 콘솔 로그인"
                onClick={() => loginToWorkspace('login')}
                style={{
                  borderRadius: 16,
                  border: 0,
                  padding: '15px 16px',
                  background: '#f4a32d',
                  color: '#0c1420',
                  fontWeight: 700,
                }}
              >
                콘솔 로그인
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  data-webcli-action="click"
                  data-webcli-key="auth-signup"
                  data-webcli-name="signup_workspace"
                  data-webcli-desc="새 워크스페이스 생성"
                  onClick={() => loginToWorkspace('signup')}
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.14)',
                    padding: '13px 14px',
                    background: '#162132',
                    color: '#f3f6fb',
                  }}
                >
                  회원가입
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="auth-demo"
                  data-webcli-name="demo_launch"
                  data-webcli-desc="데모 환경 즉시 진입"
                  onClick={() => loginToWorkspace('demo')}
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.14)',
                    padding: '13px 14px',
                    background: '#162132',
                    color: '#f3f6fb',
                  }}
                >
                  데모 진입
                </button>
              </div>
            </section>

            <div style={{ ...panelStyle, padding: 16 }}>
              <strong>Preflight</strong>
              <p style={{ ...mutedTextStyle, marginBottom: 0 }}>
                로그인 후에는 사이드바 전환, 주문 상태 변경, 고객 포커스 전환, 설정 토글, 런치패드 모달과 액션 드로어까지 연속으로 시연할 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main
      style={{
        ...shellStyle,
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
      }}
    >
      <aside
        style={{
          borderRight: '1px solid rgba(255,255,255,0.08)',
          padding: 24,
          background: 'rgba(8, 13, 20, 0.82)',
          display: 'grid',
          alignContent: 'start',
          gap: 18,
        }}
      >
        <div>
          <div style={{ color: '#f5c46c', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Workspace
          </div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 28 }}>Orbit Ops</h1>
          <p style={{ ...mutedTextStyle, margin: 0 }}>{workspace} live console</p>
        </div>

        <section
          data-webcli-group="shell-navigation"
          data-webcli-group-name="Sidebar Navigation"
          data-webcli-group-desc="운영 콘솔 화면 전환"
          style={{ display: 'grid', gap: 10 }}
        >
          <button
            data-webcli-action="click"
            data-webcli-key="nav-overview"
            data-webcli-name="nav_overview"
            data-webcli-desc="개요 화면 열기"
            onClick={() => focusView('overview', '개요')}
            style={{
              borderRadius: 14,
              border: 0,
              padding: '13px 14px',
              background: view === 'overview' ? '#24344b' : '#121b28',
              color: '#f3f6fb',
              textAlign: 'left',
            }}
          >
            Overview
          </button>
          <button
            data-webcli-action="click"
            data-webcli-key="nav-orders"
            data-webcli-name="nav_orders"
            data-webcli-desc="주문 화면 열기"
            onClick={() => focusView('orders', '주문')}
            style={{
              borderRadius: 14,
              border: 0,
              padding: '13px 14px',
              background: view === 'orders' ? '#24344b' : '#121b28',
              color: '#f3f6fb',
              textAlign: 'left',
            }}
          >
            Orders
          </button>
          <button
            data-webcli-action="click"
            data-webcli-key="nav-customers"
            data-webcli-name="nav_customers"
            data-webcli-desc="고객 화면 열기"
            onClick={() => focusView('customers', '고객')}
            style={{
              borderRadius: 14,
              border: 0,
              padding: '13px 14px',
              background: view === 'customers' ? '#24344b' : '#121b28',
              color: '#f3f6fb',
              textAlign: 'left',
            }}
          >
            Customers
          </button>
          <button
            data-webcli-action="click"
            data-webcli-key="nav-control"
            data-webcli-name="nav_control"
            data-webcli-desc="컨트롤 룸 화면 열기"
            onClick={() => focusView('control', '컨트롤 룸')}
            style={{
              borderRadius: 14,
              border: 0,
              padding: '13px 14px',
              background: view === 'control' ? '#24344b' : '#121b28',
              color: '#f3f6fb',
              textAlign: 'left',
            }}
          >
            Control Room
          </button>
          <button
            data-webcli-action="click"
            data-webcli-key="nav-settings"
            data-webcli-name="nav_settings"
            data-webcli-desc="설정 화면 열기"
            onClick={() => focusView('settings', '설정')}
            style={{
              borderRadius: 14,
              border: 0,
              padding: '13px 14px',
              background: view === 'settings' ? '#24344b' : '#121b28',
              color: '#f3f6fb',
              textAlign: 'left',
            }}
          >
            Settings
          </button>
        </section>

        <div style={{ ...panelStyle, padding: 16, display: 'grid', gap: 8 }}>
          <strong>Now Watching</strong>
          <span style={mutedTextStyle}>selected order: {currentOrder.name}</span>
          <span style={mutedTextStyle}>selected customer: {currentCustomer.name}</span>
          <span style={mutedTextStyle}>pointer animation: {pointerAnimation ? 'on' : 'off'}</span>
        </div>

        <button
          data-webcli-action="click"
          data-webcli-key="nav-logout"
          data-webcli-name="logout_console"
          data-webcli-desc="로그아웃하고 로그인 화면으로 돌아가기"
          onClick={logout}
          style={{
            marginTop: 'auto',
            borderRadius: 14,
            border: '1px solid rgba(255,123,114,0.24)',
            padding: '13px 14px',
            background: 'rgba(88, 24, 32, 0.45)',
            color: '#ffb4ab',
          }}
        >
          로그아웃
        </button>
      </aside>

      <section style={{ padding: 24, display: 'grid', gap: 18 }}>
        <header
          style={{
            ...panelStyle,
            padding: 18,
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr auto',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <section
            data-webcli-group="shell-search"
            data-webcli-group-name="Console Search"
            data-webcli-group-desc="상단 검색과 공지 입력"
            style={{ display: 'grid', gap: 10 }}
          >
            <input
              data-webcli-action="fill"
              data-webcli-key="shell-search"
              data-webcli-name="global_search"
              data-webcli-desc="운영 콘솔 검색"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="search orders, owners, status"
              style={{
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#111b29',
                color: '#f3f6fb',
                padding: '13px 14px',
              }}
            />
            <input
              data-webcli-action="fill"
              data-webcli-key="shell-announcement"
              data-webcli-name="announcement_banner"
              data-webcli-desc="상단 공지 메시지 입력"
              value={announcement}
              onChange={event => setAnnouncement(event.target.value)}
              placeholder="broadcast to operators"
              style={{
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#111b29',
                color: '#f3f6fb',
                padding: '13px 14px',
              }}
            />
          </section>

          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ color: '#8ea0b5', fontSize: 12, textTransform: 'uppercase' }}>Live view</span>
            <strong style={{ fontSize: 30 }}>{view}</strong>
            <span style={mutedTextStyle}>{announcement}</span>
          </div>

          <section
            data-webcli-group="shell-actions"
            data-webcli-group-name="Top Actions"
            data-webcli-group-desc="상단 빠른 액션 버튼"
            style={{ display: 'grid', gap: 10 }}
          >
            <button
              data-webcli-action="click"
              data-webcli-key="shell-open-drawer"
              data-webcli-name="open_action_drawer"
              data-webcli-desc="액션 드로어 열기"
              onClick={() => {
                setDrawerOpen(true)
                appendActivity('액션 드로어 열기')
              }}
              style={{
                borderRadius: 14,
                border: 0,
                padding: '12px 14px',
                background: '#24344b',
                color: '#f3f6fb',
              }}
            >
              Open Drawer
            </button>
            <button
              data-webcli-action="click"
              data-webcli-key="shell-open-launchpad"
              data-webcli-name="open_launchpad"
              data-webcli-desc="런치패드 모달 열기"
              onClick={() => {
                setLaunchpadOpen(true)
                appendActivity('런치패드 열기')
              }}
              style={{
                borderRadius: 14,
                border: 0,
                padding: '12px 14px',
                background: '#f4a32d',
                color: '#0d1521',
                fontWeight: 700,
              }}
            >
              Launchpad
            </button>
          </section>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 14,
          }}
        >
          <article style={{ ...panelStyle, padding: 18 }}>
            <span style={{ color: '#8ea0b5', fontSize: 12, textTransform: 'uppercase' }}>Orders in motion</span>
            <h2 style={{ margin: '8px 0 0', fontSize: 30 }}>{filteredOrders.length}</h2>
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>검색 조건과 함께 바로 변경됩니다.</p>
          </article>
          <article style={{ ...panelStyle, padding: 18 }}>
            <span style={{ color: '#8ea0b5', fontSize: 12, textTransform: 'uppercase' }}>Critical accounts</span>
            <h2 style={{ margin: '8px 0 0', fontSize: 30 }}>12</h2>
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>Hana Robotics가 오늘 우선순위입니다.</p>
          </article>
          <article style={{ ...panelStyle, padding: 18 }}>
            <span style={{ color: '#8ea0b5', fontSize: 12, textTransform: 'uppercase' }}>Automation delay</span>
            <h2 style={{ margin: '8px 0 0', fontSize: 30 }}>{clickDelayLabel}</h2>
            <p style={{ ...mutedTextStyle, marginBottom: 0 }}>TUI 설정과 함께 바뀌는 레이블입니다.</p>
          </article>
          <article style={{ ...panelStyle, padding: 18 }}>
            <span style={{ color: '#8ea0b5', fontSize: 12, textTransform: 'uppercase' }}>Last action</span>
            <h2 style={{ margin: '8px 0 0', fontSize: 22, lineHeight: 1.2 }}>{lastAction}</h2>
          </article>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <section
              data-webcli-group="orders-list"
              data-webcli-group-name="Orders List"
              data-webcli-group-desc="주문 선택과 상태 변경"
              style={{ ...panelStyle, padding: 18, display: 'grid', gap: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 22 }}>Orders</h3>
                  <p style={{ ...mutedTextStyle, margin: '4px 0 0' }}>화면 전환과 무관하게 계속 시연할 수 있는 핵심 리스트</p>
                </div>
                <strong style={{ color: '#f5c46c' }}>{filteredOrders.length} active</strong>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <button
                  data-webcli-action="click"
                  data-webcli-key="order-alpha"
                  data-webcli-name="select_order_alpha"
                  data-webcli-desc="알파 주문 선택"
                  onClick={() => {
                    setSelectedOrder('alpha')
                    appendActivity('OR-4821 상세 보기')
                  }}
                  style={{
                    borderRadius: 16,
                    border: 0,
                    padding: 14,
                    textAlign: 'left',
                    background: selectedOrder === 'alpha' ? '#24344b' : '#141f2d',
                    color: '#f3f6fb',
                  }}
                >
                  {orders.alpha.name} · {orders.alpha.owner} · {orders.alpha.value}
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="order-bravo"
                  data-webcli-name="select_order_bravo"
                  data-webcli-desc="브라보 주문 선택"
                  onClick={() => {
                    setSelectedOrder('bravo')
                    appendActivity('OR-4829 상세 보기')
                  }}
                  style={{
                    borderRadius: 16,
                    border: 0,
                    padding: 14,
                    textAlign: 'left',
                    background: selectedOrder === 'bravo' ? '#24344b' : '#141f2d',
                    color: '#f3f6fb',
                  }}
                >
                  {orders.bravo.name} · {orders.bravo.owner} · {orders.bravo.value}
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="order-charlie"
                  data-webcli-name="select_order_charlie"
                  data-webcli-desc="찰리 주문 선택"
                  onClick={() => {
                    setSelectedOrder('charlie')
                    appendActivity('OR-4838 상세 보기')
                  }}
                  style={{
                    borderRadius: 16,
                    border: 0,
                    padding: 14,
                    textAlign: 'left',
                    background: selectedOrder === 'charlie' ? '#24344b' : '#141f2d',
                    color: '#f3f6fb',
                  }}
                >
                  {orders.charlie.name} · {orders.charlie.owner} · {orders.charlie.value}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <button
                  data-webcli-action="click"
                  data-webcli-key="order-approve"
                  data-webcli-name="approve_selected_order"
                  data-webcli-desc="선택한 주문 승인"
                  onClick={() => changeOrderStatus('Ready to Ship')}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 10px',
                    background: '#1d6b55',
                    color: '#f3f6fb',
                  }}
                >
                  Approve
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="order-review"
                  data-webcli-name="review_selected_order"
                  data-webcli-desc="선택한 주문 검토 상태로 전환"
                  onClick={() => changeOrderStatus('Review')}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 10px',
                    background: '#6b541d',
                    color: '#f3f6fb',
                  }}
                >
                  Review
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="order-escalate"
                  data-webcli-name="escalate_selected_order"
                  data-webcli-desc="선택한 주문 에스컬레이션"
                  onClick={() => changeOrderStatus('Escalated')}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 10px',
                    background: '#6b1d2d',
                    color: '#f3f6fb',
                  }}
                >
                  Escalate
                </button>
              </div>
            </section>

            <section
              data-webcli-group="customer-focus"
              data-webcli-group-name="Customer Focus"
              data-webcli-group-desc="고객 카드 전환"
              style={{ ...panelStyle, padding: 18, display: 'grid', gap: 12 }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 22 }}>Customer focus</h3>
                <p style={{ ...mutedTextStyle, margin: '4px 0 0' }}>고객 전환과 화면 상태 변화를 시연합니다.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <button
                  data-webcli-action="click"
                  data-webcli-key="customer-hana"
                  data-webcli-name="focus_customer_hana"
                  data-webcli-desc="하나 로보틱스 고객 포커스"
                  onClick={() => {
                    setSelectedCustomer('hana')
                    appendActivity('Hana Robotics 포커스')
                  }}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 10px',
                    background: selectedCustomer === 'hana' ? '#24344b' : '#141f2d',
                    color: '#f3f6fb',
                  }}
                >
                  Hana
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="customer-kai"
                  data-webcli-name="focus_customer_kai"
                  data-webcli-desc="카이 커머스 고객 포커스"
                  onClick={() => {
                    setSelectedCustomer('kai')
                    appendActivity('Kai Commerce 포커스')
                  }}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 10px',
                    background: selectedCustomer === 'kai' ? '#24344b' : '#141f2d',
                    color: '#f3f6fb',
                  }}
                >
                  Kai
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="customer-mina"
                  data-webcli-name="focus_customer_mina"
                  data-webcli-desc="미나 헬스 고객 포커스"
                  onClick={() => {
                    setSelectedCustomer('mina')
                    appendActivity('Mina Health 포커스')
                  }}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 10px',
                    background: selectedCustomer === 'mina' ? '#24344b' : '#141f2d',
                    color: '#f3f6fb',
                  }}
                >
                  Mina
                </button>
              </div>

              <article
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.04)',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 20 }}>{currentCustomer.name}</strong>
                  <span
                    style={{
                      background: `${tierColor(currentCustomer.tier)}22`,
                      color: tierColor(currentCustomer.tier),
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                    }}
                  >
                    {currentCustomer.tier}
                  </span>
                </div>
                <span style={mutedTextStyle}>{currentCustomer.company}</span>
                <p style={{ margin: 0 }}>{currentCustomer.note}</p>
              </article>
            </section>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ ...panelStyle, padding: 18, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 22 }}>Selected order</h3>
                  <p style={{ ...mutedTextStyle, margin: '4px 0 0' }}>
                    상태 변경이 오른쪽 패널과 로그에 동시에 반영됩니다.
                  </p>
                </div>
                <span
                  style={{
                    borderRadius: 999,
                    padding: '5px 10px',
                    background: `${statusColor(currentOrder.status)}22`,
                    color: statusColor(currentOrder.status),
                    fontSize: 12,
                  }}
                >
                  {currentOrder.status}
                </span>
              </div>
              <strong style={{ fontSize: 26 }}>{currentOrder.name}</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ ...panelStyle, padding: 14 }}>
                  <div style={{ fontSize: 12, color: '#8ea0b5' }}>Owner</div>
                  <strong>{currentOrder.owner}</strong>
                </div>
                <div style={{ ...panelStyle, padding: 14 }}>
                  <div style={{ fontSize: 12, color: '#8ea0b5' }}>ETA</div>
                  <strong>{currentOrder.eta}</strong>
                </div>
              </div>
              <div style={{ ...panelStyle, padding: 14 }}>
                <div style={{ fontSize: 12, color: '#8ea0b5' }}>Value</div>
                <strong>{currentOrder.value}</strong>
              </div>
            </section>

            <section
              data-webcli-group="console-brief"
              data-webcli-group-name="Operator Brief"
              data-webcli-group-desc="브리프 입력과 제어 토글"
              style={{ ...panelStyle, padding: 18, display: 'grid', gap: 12 }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 22 }}>Operator brief</h3>
                <p style={{ ...mutedTextStyle, margin: '4px 0 0' }}>TUI fill과 설정 click을 시연하기 좋은 블록입니다.</p>
              </div>
              <textarea
                data-webcli-action="fill"
                data-webcli-key="ops-brief"
                data-webcli-name="operator_brief"
                data-webcli-desc="운영 브리프 입력"
                value={brief}
                onChange={event => setBrief(event.target.value)}
                rows={5}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: '#111b29',
                  color: '#f3f6fb',
                  padding: '13px 14px',
                  resize: 'vertical',
                }}
              />

              <section
                data-webcli-group="console-settings"
                data-webcli-group-name="Console Settings"
                data-webcli-group-desc="포인터 애니메이션과 오토스크롤 토글"
                style={{ display: 'grid', gap: 10 }}
              >
                <button
                  data-webcli-action="click"
                  data-webcli-key="setting-delay"
                  data-webcli-name="toggle_click_delay"
                  data-webcli-desc="클릭 딜레이 레이블 변경"
                  onClick={() => {
                    setClickDelayLabel(current => (current === '0ms' ? '450ms' : '0ms'))
                    appendActivity('클릭 딜레이 레이블 토글')
                  }}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 14px',
                    background: '#162132',
                    color: '#f3f6fb',
                    textAlign: 'left',
                  }}
                >
                  click delay: {clickDelayLabel}
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="setting-pointer"
                  data-webcli-name="toggle_pointer_animation"
                  data-webcli-desc="포인터 애니메이션 토글"
                  onClick={() => {
                    setPointerAnimation(current => !current)
                    appendActivity('포인터 애니메이션 토글')
                  }}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 14px',
                    background: '#162132',
                    color: '#f3f6fb',
                    textAlign: 'left',
                  }}
                >
                  pointer animation: {pointerAnimation ? 'on' : 'off'}
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="setting-autoscroll"
                  data-webcli-name="toggle_auto_scroll"
                  data-webcli-desc="오토 스크롤 토글"
                  onClick={() => {
                    setAutoScroll(current => !current)
                    appendActivity('오토 스크롤 토글')
                  }}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '12px 14px',
                    background: '#162132',
                    color: '#f3f6fb',
                    textAlign: 'left',
                  }}
                >
                  auto scroll: {autoScroll ? 'on' : 'off'}
                </button>
              </section>
            </section>
          </div>
        </section>

        <section style={{ ...panelStyle, padding: 18, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 22 }}>Activity log</h3>
              <p style={{ ...mutedTextStyle, margin: '4px 0 0' }}>버튼을 누를 때마다 아래 텍스트가 바뀝니다.</p>
            </div>
            <strong style={{ color: '#8ea0b5' }}>{activityLog.length} entries</strong>
          </div>
          {activityLog.map(item => (
            <div
              key={item}
              style={{
                borderRadius: 14,
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              {item}
            </div>
          ))}
        </section>

        {drawerOpen ? (
          <section
            data-webcli-group="action-drawer"
            data-webcli-group-name="Action Drawer"
            data-webcli-group-desc="우측 드로어 빠른 액션"
            style={{
              position: 'fixed',
              right: 24,
              top: 24,
              width: 300,
              ...panelStyle,
              padding: 18,
              display: 'grid',
              gap: 10,
            }}
          >
            <strong style={{ fontSize: 20 }}>Quick actions</strong>
            <button
              data-webcli-action="click"
              data-webcli-key="drawer-message-customer"
              data-webcli-name="drawer_message_customer"
              data-webcli-desc="고객에게 메시지 전송"
              onClick={() => appendActivity(`${currentCustomer.name}에게 메시지 전송`)}
              style={{
                borderRadius: 14,
                border: 0,
                padding: '12px 14px',
                background: '#162132',
                color: '#f3f6fb',
                textAlign: 'left',
              }}
            >
              Message customer
            </button>
            <button
              data-webcli-action="click"
              data-webcli-key="drawer-sync-queue"
              data-webcli-name="drawer_sync_queue"
              data-webcli-desc="주문 큐 동기화"
              onClick={() => appendActivity('주문 큐 수동 동기화')}
              style={{
                borderRadius: 14,
                border: 0,
                padding: '12px 14px',
                background: '#162132',
                color: '#f3f6fb',
                textAlign: 'left',
              }}
            >
              Sync queue
            </button>
            <button
              data-webcli-action="click"
              data-webcli-key="drawer-close"
              data-webcli-name="drawer_close"
              data-webcli-desc="액션 드로어 닫기"
              onClick={() => {
                setDrawerOpen(false)
                appendActivity('액션 드로어 닫기')
              }}
              style={{
                borderRadius: 14,
                border: 0,
                padding: '12px 14px',
                background: '#6b1d2d',
                color: '#f3f6fb',
                textAlign: 'left',
              }}
            >
              Close drawer
            </button>
          </section>
        ) : null}

        {launchpadOpen ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(4, 8, 14, 0.72)',
              display: 'grid',
              placeItems: 'center',
              padding: 24,
            }}
          >
            <section
              data-webcli-group="launchpad-modal"
              data-webcli-group-name="Launchpad Modal"
              data-webcli-group-desc="런치패드 승인 모달"
              style={{
                ...panelStyle,
                width: 'min(580px, 100%)',
                padding: 24,
                display: 'grid',
                gap: 16,
              }}
            >
              <div>
                <div style={{ color: '#f5c46c', fontSize: 12, textTransform: 'uppercase' }}>Launchpad</div>
                <h3 style={{ margin: '6px 0 0', fontSize: 30 }}>Priority release window</h3>
              </div>
              <p style={{ ...mutedTextStyle, margin: 0 }}>
                현재 포커스 고객은 {currentCustomer.name}, 현재 선택 주문은 {currentOrder.name} 입니다. 이 모달은 실제 데모에서 승인/취소 클릭을 시연하기 위한 오버레이입니다.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button
                  data-webcli-action="click"
                  data-webcli-key="launchpad-confirm"
                  data-webcli-name="launchpad_confirm"
                  data-webcli-desc="런치패드 승인"
                  onClick={() => {
                    setLaunchpadOpen(false)
                    appendActivity('런치패드 승인 및 릴리즈 잠금 해제')
                  }}
                  style={{
                    borderRadius: 14,
                    border: 0,
                    padding: '14px 16px',
                    background: '#f4a32d',
                    color: '#0d1521',
                    fontWeight: 700,
                  }}
                >
                  Confirm release
                </button>
                <button
                  data-webcli-action="click"
                  data-webcli-key="launchpad-cancel"
                  data-webcli-name="launchpad_cancel"
                  data-webcli-desc="런치패드 취소"
                  onClick={() => {
                    setLaunchpadOpen(false)
                    appendActivity('런치패드 취소')
                  }}
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.14)',
                    padding: '14px 16px',
                    background: '#162132',
                    color: '#f3f6fb',
                  }}
                >
                  Cancel
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  )
}
