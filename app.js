/* ============================================================
   Task Manager
   Vanilla JS SPA · Supabase persistence
   ============================================================ */

// ── Constants ─────────────────────────────────────────────
// ── Supabase ──────────────────────────────────────────────
const SUPABASE_URL = 'https://ayusbgyvhonzkwuaqjws.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dXNiZ3l2aG9uemt3dWFxandzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTI3MDIsImV4cCI6MjA5MTgyODcwMn0.oPj5cSBDjHs12_eyODdjUOFPHyQWR_0G7nIkwHrnN54'
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

const CLIENTS = [
  'Hesel',
  'Abogados Now',
  '42KM',
  'Saga',
  'Personal',
]

const STATUS_LABELS = { TODO: 'Por Hacer', IN_PROGRESS: 'En Progreso', REVIEW: 'En Revisión', DONE: 'Listo' }
const STATUS_ORDER  = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']
const PRIORITY_LABELS = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' }

const STATUS_COLORS = { TODO: '#94a3b8', IN_PROGRESS: '#a78bfa', REVIEW: '#60a5fa', DONE: '#4ade80' }
const FILTER_ALL_COLOR = 'var(--accent-pink)'

const COL_COLORS = {
  TODO: '#94a3b8',
  IN_PROGRESS: '#a78bfa',
  REVIEW: '#60a5fa',
  DONE: '#4ade80',
}

const MONTHS_ES  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const MONTHS_CAP = MONTHS_ES.map(m => m[0].toUpperCase() + m.slice(1))
const DAYS_ES    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const DAYS_FULL  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']

// ── State ─────────────────────────────────────────────────
const state = {
  users: [], tasks: [], meetings: [],
  currentUserId: null,
  currentView: 'mis-tareas',
  modalTask: null,
  modalDefaults: {},
  calDate: new Date(),
  calSelected: null,
  meetingId: null,
  meetingIsNew: false,
  calMode: 'month',
  filterStatus: 'all',
  filterClient: 'all',
}

// ── Toast System ──────────────────────────────────────────
function toast(message, type='success') {
  const container = document.getElementById('toast-container')
  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  }
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.innerHTML = `<span class="toast-icon">${icons[type]||icons.info}</span>${message}`
  container.appendChild(el)
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 250) }, 2800)
}

// ── Smart Client Suggestion ───────────────────────────────
function getRecentClient() {
  const recent = state.tasks.filter(t => t.accountName).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
  return recent[0]?.accountName || ''
}

// ── Utils ─────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

function today() { const d = new Date(); d.setHours(0,0,0,0); return d }

function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}

function parseLocalDate(isoStr) {
  const parts = isoStr.slice(0, 10).split('-')
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
}

function fmtDate(isoStr) {
  if (!isoStr) return ''
  const d = parseLocalDate(isoStr)
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()].slice(0,3)}`
}

function fmtTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toTimeString().slice(0,5)
}

function toInputDate(isoStr) {
  if (!isoStr) return ''
  return isoStr.slice(0, 10)
}

function toInputDateTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')
}

function parseDueDate(isoStr) {
  if (!isoStr) return null
  return parseLocalDate(isoStr)
}
function isOverdue(task) {
  if (!task.dueDate || task.status === 'DONE') return false
  const due = parseDueDate(task.dueDate)
  const t = today()
  // Overdue = today is AFTER the due date (not on the due date itself)
  return t.getTime() > due.getTime() && !sameDay(due, t)
}
function isDueToday(task) {
  if (!task.dueDate) return false
  return sameDay(parseDueDate(task.dueDate), today())
}

// ── DB mapping ────────────────────────────────────────────
function mapTaskFromDB(r) {
  return {
    id: r.id, title: r.title, description: r.description,
    status: r.status, priority: r.priority,
    estimatedHours: r.estimated_hours,
    dueDate: r.due_date, timeBlockStart: r.time_block_start, timeBlockEnd: r.time_block_end,
    accountName: r.account_name, accountOther: r.account_other,
    url: r.url, notes: r.notes,
    subtasks: r.subtasks || [],
    assigneeIds: r.assignee_ids || [], assigneeId: r.assignee_id,
    meetingNoteId: r.meeting_note_id,
    gcalEventId: r.gcal_event_id || null,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}
function mapTaskToDB(t) {
  return {
    id: t.id, title: t.title, description: t.description,
    status: t.status, priority: t.priority,
    estimated_hours: t.estimatedHours,
    due_date: t.dueDate || null, time_block_start: t.timeBlockStart || null, time_block_end: t.timeBlockEnd || null,
    account_name: t.accountName || null, account_other: t.accountOther || null,
    url: t.url || null, notes: t.notes || null,
    subtasks: t.subtasks || [],
    assignee_ids: t.assigneeIds || [], assignee_id: t.assigneeId || null,
    meeting_note_id: t.meetingNoteId || null,
    gcal_event_id: t.gcalEventId || null,
    sort_order: t.sortOrder ?? 0,
    created_at: t.createdAt, updated_at: t.updatedAt,
  }
}
function mapMeetingFromDB(r) {
  return { id: r.id, title: r.title, date: r.date, accountName: r.account_name, content: r.content, createdAt: r.created_at }
}
function mapMeetingToDB(m) {
  return { id: m.id, title: m.title, date: m.date || null, account_name: m.accountName || null, content: m.content || null, created_at: m.createdAt }
}

// ── Storage ───────────────────────────────────────────────
async function loadData() {
  const [usersRes, tasksRes, meetingsRes] = await Promise.all([
    sb.from('users').select('*'),
    sb.from('tasks').select('*').order('created_at'),
    sb.from('meetings').select('*').order('created_at'),
  ])
  if (!usersRes.data || usersRes.data.length === 0) { await seedData(); return }
  state.users    = usersRes.data
  state.tasks    = (tasksRes.data || []).map(mapTaskFromDB)
  state.meetings = (meetingsRes.data || []).map(mapMeetingFromDB)
  state.currentUserId = state.users[0]?.id || null
}

function saveUsers()    {}
function saveTasks()    {}
function saveMeetings() {}

// ── Seed ──────────────────────────────────────────────────
async function seedData() {
  const me = { id: uid(), name: 'Diego', email: 'd.moreno@abogadosnow.com' }
  state.users = [me]
  state.currentUserId = me.id
  state.tasks = []
  state.meetings = []
  await sb.from('users').insert(state.users)
}

// ── CRUD ──────────────────────────────────────────────────
function createTask(data) {
  const t = { id:uid(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), ...data }
  state.tasks.push(t)
  sb.from('tasks').insert(mapTaskToDB(t)).then(({ error }) => {
    if (error) { console.error('Supabase createTask:', error); toast('Error al guardar tarea', 'error') }
  })
  return t
}

function updateTask(id, data) {
  const i = state.tasks.findIndex(t=>t.id===id); if(i===-1) return
  state.tasks[i] = { ...state.tasks[i], ...data, updatedAt:new Date().toISOString() }
  sb.from('tasks').update(mapTaskToDB(state.tasks[i])).eq('id', id).then(({ error }) => {
    if (error) { console.error('Supabase updateTask:', error); toast('Error al actualizar', 'error') }
  })
}

function deleteTask(id) {
  const task = state.tasks.find(t => t.id === id)
  if (task?.gcalEventId) deleteGCalEvent(task.gcalEventId)
  state.tasks = state.tasks.filter(t=>t.id!==id)
  sb.from('tasks').delete().eq('id', id).then(({ error }) => { if (error) console.error('Supabase deleteTask:', error) })
}

function createMeeting(data) {
  const m = { id:uid(), createdAt:new Date().toISOString(), ...data }
  state.meetings.push(m)
  sb.from('meetings').insert(mapMeetingToDB(m)).then(({ error }) => { if (error) console.error('Supabase createMeeting:', error) })
  return m
}

function updateMeeting(id, data) {
  const i = state.meetings.findIndex(m=>m.id===id); if(i===-1) return
  state.meetings[i] = { ...state.meetings[i], ...data }
  sb.from('meetings').update(mapMeetingToDB(state.meetings[i])).eq('id', id).then(({ error }) => { if (error) console.error('Supabase updateMeeting:', error) })
}

function deleteMeeting(id) {
  state.tasks.forEach(t=>{ if(t.meetingNoteId===id) { t.meetingNoteId=null; sb.from('tasks').update({ meeting_note_id: null }).eq('id', t.id) } })
  state.meetings = state.meetings.filter(m=>m.id!==id)
  sb.from('meetings').delete().eq('id', id).then(({ error }) => { if (error) console.error('Supabase deleteMeeting:', error) })
}

// ── Router ────────────────────────────────────────────────
function navigate(view) {
  state.currentView = view
  document.querySelector('.sidebar')?.classList.remove('open')
  document.getElementById('sidebar-overlay')?.classList.remove('visible')
  // Remove animate-in from all views, hide them
  document.querySelectorAll('.view').forEach(v => { v.classList.add('hidden'); v.classList.remove('animate-in') })
  const target = document.getElementById('view-'+view)
  if (target) { target.classList.remove('hidden'); target.classList.add('animate-in') }
  document.querySelectorAll('.nav-link').forEach(a=>a.classList.toggle('active', a.dataset.view===view))
  renderView(view)
  // Remove animate-in after animation completes so re-renders don't re-trigger
  setTimeout(() => target?.classList.remove('animate-in'), 300)
}

function renderView(view) {
  if (view==='mi-dia')     renderMiDia()
  if (view==='mis-tareas') renderMisTareas()
  if (view==='kanban')     renderKanban()
  if (view==='calendario') renderCalendario()
  if (view==='reuniones')  renderReuniones()
  if (view==='dashboard')  renderDashboard()
  if (view==='vencidas')   renderVencidas()
  updateOverdueBadge()
  renderOverdueAlert()
}

function updateOverdueBadge() {
  const myOverdue = state.tasks.filter(t => isOverdue(t)).length
  const badge = document.getElementById('sidebar-overdue-count')
  if (badge) { badge.textContent = myOverdue || ''; badge.style.display = myOverdue ? '' : 'none' }
}

// ── Client Colors ─────────────────────────────────────────
const CLIENT_COLORS = {
  'Hesel':        { bg: 'rgba(233,30,140,0.12)', color: '#f472b6' },
  'Abogados Now': { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa' },
  '42KM':         { bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
  'Saga':         { bg: 'rgba(139,92,246,0.12)',   color: '#a78bfa' },
  'Personal':     { bg: 'rgba(234,179,8,0.12)',    color: '#facc15' },
}
const DEFAULT_CLIENT_COLOR = { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' }

function clientBadgeHTML(name) {
  if (!name) return ''
  const c = CLIENT_COLORS[name] || DEFAULT_CLIENT_COLOR
  return `<span class="client-badge" style="background:${c.bg};color:${c.color}">${name}</span>`
}

// ── Task Card ─────────────────────────────────────────────
function taskCardHTML(task, compact=false) {
  const isDone = task.status==='DONE'
  const over   = isOverdue(task)
  const tod    = isDueToday(task)

  const dueMeta = task.dueDate ? `
    <span class="meta-item ${over?'overdue':tod?'today':''}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${over?'¡Vencida! ':tod?'Vence hoy · ':''}${fmtDate(task.dueDate)}
    </span>` : ''

  const timeMeta = task.timeBlockStart ? `
    <span class="time-block-badge">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ${fmtTime(task.timeBlockStart)}${task.timeBlockEnd?'–'+fmtTime(task.timeBlockEnd):''}
    </span>` : ''

  const chevron = `<svg class="badge-chevron" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 9l6 6 6-6"/></svg>`
  const statusBadgeEl = !compact
    ? `<span class="badge badge-${task.status.toLowerCase()}" data-action="status" data-task-id="${task.id}">${STATUS_LABELS[task.status]}${chevron}</span>`
    : ''

  const rescheduleBtn = over ? `
    <button class="btn-reschedule" data-action="reschedule" data-task-id="${task.id}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      Reprogramar
    </button>` : ''

  return `
    <div class="task-card ${compact?'compact':''} ${isDone?'done':''} ${over?'overdue-card':''}" draggable="true" data-task-id="${task.id}">
      <div class="task-card-top">
          ${statusBadgeEl}
          ${task.accountName ? clientBadgeHTML(task.accountName) : ''}
        </div>
        <p class="task-card-title ${isDone?'strikethrough':''}">${over?'🚨 ':''}${task.title}${task.url?` <a class="task-url-icon" href="${task.url}" target="_blank" rel="noopener" title="${task.url}" onclick="event.stopPropagation()"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`:''}</p>
        ${!compact && task.description ? `<p class="task-card-desc">${task.description}</p>` : ''}
        ${!compact && task.subtasks?.length ? `<div class="subtask-progress"><div class="subtask-bar" style="width:${Math.round(task.subtasks.filter(s=>s.done).length/task.subtasks.length*100)}%"></div><span class="subtask-count">${task.subtasks.filter(s=>s.done).length}/${task.subtasks.length} subtareas</span></div>` : ''}
        <div class="task-card-footer">
          <div class="task-card-meta">${dueMeta}${timeMeta}</div>
          <div class="task-card-actions">
            ${rescheduleBtn}
            <button class="task-check ${isDone?'checked':''}" data-action="check" data-task-id="${task.id}" title="${isDone?'Marcar como pendiente':'Marcar como listo'}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>
        </div>
    </div>`
}

// ── View: Tareas Vencidas ─────────────────────────────────
function renderVencidas() {
  const overdue = state.tasks.filter(t => isOverdue(t))
    .sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))

  document.getElementById('vencidas-list').innerHTML = overdue.length
    ? `<div class="task-group">
        <div class="task-group-header">
          <span class="task-group-title" style="color:var(--accent-red)">Vencidas</span>
          <span class="task-group-count" style="color:#f87171">${overdue.length}</span>
        </div>
        <div class="task-list">${overdue.map(t=>taskCardHTML(t)).join('')}</div>
      </div>`
    : `<div class="empty-state"><div class="empty-state-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><p>¡Sin tareas vencidas!</p><span>Todo está al día.</span></div>`
}

// ── View: Dashboard ───────────────────────────────────────
function pieChart(slices, size=120) {
  const total = slices.reduce((s,sl)=>s+sl.value, 0)
  if (!total) return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2-4}" fill="none" stroke="var(--glass-border)" stroke-width="8"/></svg>`
  const cx = size/2, cy = size/2, r = size/2 - 8
  let angle = -Math.PI/2
  const pct = v => Math.round(v/total*100)
  const paths = slices.map(sl => {
    if (!sl.value) return ''
    const sweep = (sl.value/total)*Math.PI*2
    const x1 = cx + r*Math.cos(angle), y1 = cy + r*Math.sin(angle)
    angle += sweep
    const x2 = cx + r*Math.cos(angle), y2 = cy + r*Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${sl.color}" opacity="0.9" class="db-pie-slice" data-label="${sl.label}" data-value="${sl.value}" data-pct="${pct(sl.value)}" style="cursor:pointer;transition:opacity 0.15s"/>`
  }).join('')
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="db-pie">${paths}<circle cx="${cx}" cy="${cy}" r="${r*0.45}" fill="var(--bg-card)"/></svg>`
}

function renderDashboard() {
  const tasks = state.tasks
  const statBar = (label, val, max, color) => `
    <div class="db-bar-row">
      <span class="db-bar-label">${label}</span>
      <div class="db-bar-track"><div class="db-bar-fill" style="width:${max?Math.round(val/max*100):0}%;background:${color}"></div></div>
      <span class="db-bar-val">${val}</span>
    </div>`

  // ── Por cliente
  const CHART_COLORS = ['var(--accent-pink)','var(--accent-purple)','var(--accent-blue)','var(--accent-green)','var(--accent-yellow)','#f97316','#06b6d4']
  const clientNames = [...new Set(tasks.map(t=>t.accountName).filter(Boolean))]
  const byClient = clientNames.map((a,i) => {
    const at = tasks.filter(t=>t.accountName===a)
    return { name:a, color: CHART_COLORS[i % CHART_COLORS.length],
      total:at.length,
      done:at.filter(t=>t.status==='DONE').length }
  }).sort((a,b)=>b.total-a.total)

  // ── Por estado
  const byStatus = STATUS_ORDER.map(s=>({ s, label:STATUS_LABELS[s], count:tasks.filter(t=>t.status===s).length, color:STATUS_COLORS[s] }))
  const maxStatus = Math.max(...byStatus.map(b=>b.count),1)

  // ── Pie: tareas por cliente
  const pieClientTasks = pieChart(byClient.map(a=>({ value:a.total, color:a.color, label:a.name })), 130)

  // ── Tareas atrasadas
  const overdueCount = tasks.filter(t=>isOverdue(t)).length

  document.getElementById('dashboard-content').innerHTML = `
    <div class="db-grid">

      <div class="db-card">
        <div class="db-card-title">Distribución por estado</div>
        ${byStatus.map(b=>statBar(b.label, b.count, maxStatus, b.color)).join('')}
      </div>

      <div class="db-card">
        <div class="db-card-title">Resumen general</div>
        <div class="db-bar-row">
          <span class="db-bar-label">Total de tareas</span>
          <span class="db-bar-val" style="font-size:1.2rem;font-weight:800">${tasks.length}</span>
        </div>
        <div class="db-bar-row">
          <span class="db-bar-label">Completadas</span>
          <span class="db-bar-val" style="color:var(--accent-green);font-size:1.1rem;font-weight:800">${tasks.filter(t=>t.status==='DONE').length}</span>
        </div>
        ${overdueCount ? `<div class="db-bar-row">
          <span class="db-bar-label">Tareas atrasadas</span>
          <span class="db-overdue-count">${overdueCount}</span>
        </div>` : '<p class="db-empty" style="color:var(--accent-green);font-weight:600;margin-top:0.5rem">Sin tareas atrasadas</p>'}
      </div>

      <div class="db-card db-card-wide">
        <div class="db-card-title">Tareas por cliente</div>
        <div class="db-pie-wrap">
          ${pieClientTasks}
          <div class="db-pie-legend db-pie-legend-wide">
            ${byClient.length ? byClient.map(a=>`
              <div class="db-legend-row">
                <span class="db-legend-dot" style="background:${a.color}"></span>
                <span class="db-legend-label">${a.name}</span>
                <span class="db-legend-val">${a.total} tarea${a.total!==1?'s':''}</span>
              </div>`).join('')
            : '<p class="db-empty">Sin datos de clientes aún</p>'}
          </div>
        </div>
      </div>

    </div>`
}

// ── View: Mi Día ──────────────────────────────────────────
function renderMiDia() {
  const t = today()
  const dayName = DAYS_FULL[t.getDay()]
  const label = `${dayName[0].toUpperCase() + dayName.slice(1)}, ${t.getDate()} de ${MONTHS_ES[t.getMonth()]}`
  document.getElementById('mi-dia-subtitle').textContent = label

  const myTasks = getVisibleTasks()

  const tomorrow = new Date(today()); tomorrow.setDate(tomorrow.getDate() + 1)
  const isDueTomorrow = t => t.dueDate && sameDay(parseLocalDate(t.dueDate), tomorrow)

  const overdue      = myTasks.filter(t => isOverdue(t))
  const dueToday     = myTasks.filter(t => isDueToday(t) && t.status !== 'DONE')
  const dueTomorrow  = myTasks.filter(t => isDueTomorrow(t) && t.status !== 'DONE')
  const blockToday   = myTasks.filter(t => {
    if (!t.timeBlockStart) return false
    const d = new Date(t.timeBlockStart)
    return sameDay(d, today()) && !isDueToday(t) && !isOverdue(t)
  })

  const total = overdue.length + dueToday.length + dueTomorrow.length + blockToday.length

  const sectionHTML = (title, tasks, accent) => {
    if (!tasks.length) return ''
    return `
      <div class="task-group">
        <div class="task-group-header">
          <span class="task-group-title" style="color:${accent}">${title}</span>
          <span class="task-group-count">${tasks.length}</span>
        </div>
        <div class="task-list">${tasks.map(t => taskCardHTML(t)).join('')}</div>
      </div>`
  }

  document.getElementById('mi-dia-content').innerHTML = total
    ? sectionHTML('Vencidas', overdue, 'var(--accent-pink)') +
      sectionHTML('Para hoy', dueToday, 'var(--text-1)') +
      sectionHTML('Mañana', dueTomorrow, 'var(--text-2)') +
      sectionHTML('Bloque de tiempo hoy', blockToday, 'var(--accent-green)')
    : `<div class="mi-dia-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.25"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <p>¡Todo despejado!</p>
        <span>No tienes tareas vencidas, para hoy ni para mañana</span>
      </div>`
}

// ── View: Mis Tareas ──────────────────────────────────────
function renderMisTareas() {
  const myTasks = getVisibleTasks()
  const activeStatus  = state.filterStatus || 'all'
  const activeClient  = state.filterClient || 'all'

  let shown = activeStatus==='all' ? myTasks : myTasks.filter(t=>t.status===activeStatus)
  if (activeClient !== 'all') shown = shown.filter(t=>(t.accountName||'')===activeClient)

  document.getElementById('stats-bar').innerHTML = [
    { value:myTasks.filter(t=>t.status==='TODO').length,         label:'Por Hacer',   color:STATUS_COLORS.TODO },
    { value:myTasks.filter(t=>t.status==='IN_PROGRESS').length,  label:'En Progreso', color:STATUS_COLORS.IN_PROGRESS },
    { value:myTasks.filter(t=>t.status==='REVIEW').length,       label:'En Revisión', color:STATUS_COLORS.REVIEW },

    { value:myTasks.filter(t=>t.status==='DONE').length,         label:'Listo',       color:STATUS_COLORS.DONE },
    { value:myTasks.filter(t=>isOverdue(t)).length,              label:'Vencidas',    color:'var(--accent-pink)' },
  ].map(s=>`<div class="stat-card"><span class="stat-value" style="color:${s.color}">${s.value}</span><span class="stat-label">${s.label}</span></div>`).join('')

  // Status filter bar
  const statusFilters = [
    {value:'all', label:'Todas', color:FILTER_ALL_COLOR},
    ...STATUS_ORDER.map(s=>({value:s, label:STATUS_LABELS[s], color:STATUS_COLORS[s]}))
  ]
  document.getElementById('filter-bar-mis').innerHTML =
    statusFilters.map(f=>`<button class="filter-btn ${activeStatus===f.value?'active':''}" data-status="${f.value}" style="--filter-color:${f.color}">${f.label}</button>`).join('')

  // Client filter dropdown
  const clients = [...new Set(myTasks.map(t=>t.accountName).filter(Boolean))].sort()
  const sel = document.getElementById('filter-client-select')
  if (sel) {
    sel.innerHTML = `<option value="all">Todos los clientes</option>` +
      clients.map(a=>`<option value="${a}" ${activeClient===a?'selected':''}>${a}</option>`).join('')
  }

  const grouped = STATUS_ORDER.reduce((acc,s)=>{ acc[s]=shown.filter(t=>t.status===s); return acc },{})
  const hasAny = shown.length > 0

  document.getElementById('mis-tareas-list').innerHTML = hasAny
    ? STATUS_ORDER.filter(s=>grouped[s].length>0).map(s=>`
        <div class="task-group">
          <div class="task-group-header">
            <span class="task-group-title" style="color:${STATUS_COLORS[s]}">${STATUS_LABELS[s]}</span>
            <span class="task-group-count">${grouped[s].length}</span>
          </div>
          <div class="task-list">${grouped[s].map(t=>taskCardHTML(t)).join('')}</div>
        </div>`).join('')
    : `<div class="empty-state"><div class="empty-state-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><p>No hay tareas</p><span>${activeStatus==='all'?'¡Todo al día!':'Sin tareas con este estado'}</span></div>`
}

// ── View: Kanban ──────────────────────────────────────────
function renderKanban() {
  const visible = getVisibleTasks()
  const board = document.getElementById('kanban-board')
  board.innerHTML = STATUS_ORDER.map(col => {
    const colTasks = visible.filter(t=>t.status===col)
    return `
      <div class="kanban-col" data-col="${col}">
        <div class="kanban-col-header">
          <div class="kanban-col-title-wrap">
            <span class="kanban-col-dot" style="background:${COL_COLORS[col]}"></span>
            <span class="kanban-col-name" style="color:${COL_COLORS[col]}">${STATUS_LABELS[col]}</span>
          </div>
          <span class="kanban-col-count">${colTasks.length}</span>
        </div>
        <div class="kanban-tasks">${colTasks.map(t=>taskCardHTML(t,true)).join('')}</div>
        <button class="kanban-add-btn" data-col="${col}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Agregar
        </button>
      </div>`
  }).join('')

  // Kanban column drag-over visual (drop handled by global handler)
  board.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over') })
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'))
  })
}

// ── View: Calendario ──────────────────────────────────────
async function renderCalendario() {
  await loadGCalEvents()

  // Update mode toggle
  document.querySelectorAll('#cal-mode-toggle .view-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.calMode === state.calMode))

  if (state.calMode === 'week') {
    renderCalWeek()
  } else {
    renderCalMonth()
  }

  const topRow = document.getElementById('cal-top-row')
  const detail = document.getElementById('cal-detail')
  if (state.calSelected) {
    topRow.classList.add('has-detail')
    detail.classList.remove('hidden')
    renderCalDetail(state.calSelected)
  } else {
    topRow.classList.remove('has-detail')
    detail.classList.add('hidden')
  }

  renderCalTodayPanel()
}

function renderCalMonth() {
  const d = state.calDate
  const year = d.getFullYear(), month = d.getMonth()
  document.getElementById('cal-month-label').textContent = `${MONTHS_CAP[month]} ${year}`

  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month+1, 0)
  const isWeekend = d => d.getDay() === 0 || d.getDay() === 6

  const firstDow = firstDay.getDay()
  const startPad = (firstDow === 0 || firstDow === 6) ? 0 : firstDow - 1
  const padDays = []
  if (startPad > 0) {
    let cur = new Date(firstDay); cur.setDate(cur.getDate() - 1)
    while (padDays.length < startPad) {
      if (!isWeekend(cur)) padDays.unshift(new Date(cur))
      cur.setDate(cur.getDate() - 1)
    }
  }

  const DAYS_WORK = ['Lun','Mar','Mié','Jue','Vie']
  let gridHTML = `<div class="cal-day-headers">${DAYS_WORK.map(d=>`<div class="cal-day-header">${d}</div>`).join('')}</div><div class="cal-grid" id="cal-grid">`

  padDays.forEach(d => gridHTML += calCellHTML(d, true))

  let rendered = startPad
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(year, month, day)
    if (!isWeekend(d)) { gridHTML += calCellHTML(d, false); rendered++ }
  }

  const trail = rendered % 5 === 0 ? 0 : 5 - (rendered % 5)
  let trailDay = new Date(year, month+1, 1)
  let trailCount = 0
  while (trailCount < trail) {
    if (!isWeekend(trailDay)) { gridHTML += calCellHTML(trailDay, true); trailCount++ }
    trailDay.setDate(trailDay.getDate() + 1)
  }

  gridHTML += '</div>'
  document.querySelector('.cal-grid-wrap').innerHTML = gridHTML
}

function getWeekDays(date) {
  const d = new Date(date)
  const dow = d.getDay()
  // Monday = start of week
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  d.setHours(0,0,0,0)
  const days = []
  for (let i = 0; i < 5; i++) { // Mon-Fri
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

function renderCalWeek() {
  const weekDays = getWeekDays(state.calDate)
  const DAYS_WORK = ['Lun','Mar','Mié','Jue','Vie']
  const first = weekDays[0], last = weekDays[4]

  // Label: "14 – 18 Abril 2026"
  const label = first.getMonth() === last.getMonth()
    ? `${first.getDate()} – ${last.getDate()} ${MONTHS_CAP[first.getMonth()]} ${first.getFullYear()}`
    : `${first.getDate()} ${MONTHS_CAP[first.getMonth()].slice(0,3)} – ${last.getDate()} ${MONTHS_CAP[last.getMonth()].slice(0,3)} ${last.getFullYear()}`
  document.getElementById('cal-month-label').textContent = label

  // Hours to show: 7am - 21pm
  const hours = []
  for (let h = 7; h <= 21; h++) hours.push(h)

  // Build events index: for each day+hour, collect events
  function eventsForDayHour(date, hour) {
    const events = []
    // GCal events
    state.gcalEvents.forEach(e => {
      const start = e.start?.dateTime || e.start?.date
      if (!start) return
      const sd = new Date(start)
      if (!sameDay(sd, date)) return
      const sh = sd.getHours()
      if (sh === hour) events.push({ type: 'gcal', title: e.summary || 'Evento', time: fmtTime(start) + (e.end?.dateTime ? '–' + fmtTime(e.end.dateTime) : ''), desc: (e.description||'').slice(0,50) })
    })
    // Task time blocks
    state.tasks.forEach(t => {
      if (!t.timeBlockStart) return
      const sd = new Date(t.timeBlockStart)
      if (!sameDay(sd, date) || sd.getHours() !== hour) return
      events.push({ type: 'block', title: t.title, time: fmtTime(t.timeBlockStart) + (t.timeBlockEnd ? '–' + fmtTime(t.timeBlockEnd) : ''), id: t.id })
    })
    // Task due dates (show at 9am slot)
    if (hour === 7) {
      state.tasks.forEach(t => {
        if (!t.dueDate || t.timeBlockStart) return
        if (!sameDay(parseLocalDate(t.dueDate), date)) return
        events.push({ type: 'due', title: t.title, time: 'Entrega', id: t.id })
      })
    }
    return events
  }

  let html = '<div class="cal-week-grid"><div class="cal-week-header"><div class="cal-week-header-cell"></div>'
  weekDays.forEach((d, i) => {
    const isToday = sameDay(d, today())
    html += `<div class="cal-week-header-cell ${isToday ? 'today-col' : ''}">${DAYS_WORK[i]}<span class="cal-week-day-num">${d.getDate()}</span></div>`
  })
  html += '</div>'

  hours.forEach(h => {
    html += `<div class="cal-week-time">${String(h).padStart(2,'0')}:00</div>`
    weekDays.forEach(d => {
      const evts = eventsForDayHour(d, h)
      html += `<div class="cal-week-cell" data-date="${d.toISOString()}">`
      evts.forEach(e => {
        html += `<div class="cal-week-event ${e.type}" ${e.id ? `data-task-id="${e.id}"` : ''}>`
        html += `<strong>${e.time}</strong> ${e.title}`
        if (e.desc) html += `<br><span style="opacity:0.7">${e.desc}</span>`
        html += '</div>'
      })
      html += '</div>'
    })
  })

  html += '</div>'
  document.querySelector('.cal-grid-wrap').innerHTML = html
}

function renderCalTodayPanel() {
  const t = today()
  const dayName = DAYS_FULL[t.getDay()]
  const label = `${dayName[0].toUpperCase() + dayName.slice(1)}, ${t.getDate()} de ${MONTHS_ES[t.getMonth()]}`

  const blockTasks = state.tasks
    .filter(task => task.timeBlockStart && sameDay(new Date(task.timeBlockStart), t))
    .sort((a, b) => new Date(a.timeBlockStart) - new Date(b.timeBlockStart))

  const dueTasks = state.tasks
    .filter(task => task.dueDate && sameDay(parseLocalDate(task.dueDate), t) && !blockTasks.includes(task))

  const total = blockTasks.length + dueTasks.length

  const blockHTML = blockTasks.map(task => `
      <div class="today-item today-block" data-task-id="${task.id}">
        <div class="today-item-time">${fmtTime(task.timeBlockStart)}${task.timeBlockEnd ? '–' + fmtTime(task.timeBlockEnd) : ''}</div>
        <div class="today-item-info">
          <div class="today-item-title">${task.title}</div>
          <div class="today-item-meta">${task.accountName || ''}</div>
        </div>
        <button class="task-check ${task.status === 'DONE' ? 'checked' : ''}" data-action="check" data-task-id="${task.id}" title="${task.status === 'DONE' ? 'Marcar como pendiente' : 'Marcar como listo'}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>`).join('')

  const dueHTML = dueTasks.map(task => `
      <div class="today-item today-due" data-task-id="${task.id}">
        <div class="today-item-time">Entrega</div>
        <div class="today-item-info">
          <div class="today-item-title">${task.title}</div>
          <div class="today-item-meta">${task.accountName || ''}</div>
        </div>
        <button class="task-check ${task.status === 'DONE' ? 'checked' : ''}" data-action="check" data-task-id="${task.id}" title="${task.status === 'DONE' ? 'Marcar como pendiente' : 'Marcar como listo'}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>`).join('')

  document.getElementById('cal-today-panel').innerHTML = `
    <div class="today-panel-header">
      <div class="today-panel-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        Hoy — <span class="today-panel-date">${label}</span>
      </div>
      <span class="today-panel-count">${total} tarea${total !== 1 ? 's' : ''}</span>
    </div>
    ${total ? `<div class="today-items">${blockHTML}${dueHTML}</div>`
             : `<p class="today-panel-empty">Sin tareas para hoy</p>`}`
}

function calCellHTML(date, other) {
  const isToday_  = sameDay(date, today())
  const isSel     = state.calSelected && sameDay(date, state.calSelected)
  const calTasks  = state.tasks
  const blockTasks  = calTasks.filter(t=>t.timeBlockStart && sameDay(new Date(t.timeBlockStart), date))
  const dueTasks    = calTasks.filter(t=>t.dueDate && sameDay(parseLocalDate(t.dueDate), date) && !blockTasks.includes(t))
  const gcalForDay  = state.gcalEvents.filter(e => {
    const start = e.start?.dateTime || e.start?.date
    return start && sameDay(new Date(start), date)
  })
  const total = blockTasks.length + dueTasks.length + gcalForDay.length

  const taskPills = [
    ...blockTasks.slice(0,2).map(t=>`<div class="cal-pill block">${fmtTime(t.timeBlockStart)} ${t.title}</div>`),
    ...dueTasks.slice(0, Math.max(0, 2-Math.min(blockTasks.length,2))).map(t=>`<div class="cal-pill due">${t.title}</div>`)
  ]
  const gcalPills = gcalForDay.slice(0, Math.max(0, 2 - Math.min(taskPills.length, 2))).map(e => {
    const start = e.start?.dateTime
    return `<div class="cal-pill gcal">${start ? fmtTime(start) + ' ' : ''}${e.summary || 'Evento'}</div>`
  })
  const pills = [...taskPills, ...gcalPills].join('')

  return `
    <div class="cal-cell ${other?'other-month':''} ${isSel?'selected':''}" data-date="${date.toISOString()}">
      <div class="cal-day-num ${isToday_?'today':''}">${date.getDate()}</div>
      ${pills}
      ${total>2?`<div class="cal-more">+${total-2} más</div>`:''}
    </div>`
}

function renderCalDetail(date) {
  const detail = document.getElementById('cal-detail')
  const blockTasks = state.tasks.filter(t=>t.timeBlockStart && sameDay(new Date(t.timeBlockStart), date))
    .sort((a,b)=>new Date(a.timeBlockStart)-new Date(b.timeBlockStart))
  const dueTasks = state.tasks.filter(t=>t.dueDate && sameDay(parseLocalDate(t.dueDate), date) && !blockTasks.includes(t))
  const gcalForDay = state.gcalEvents
    .filter(e => { const s = e.start?.dateTime || e.start?.date; return s && sameDay(new Date(s), date) })
    .sort((a,b) => new Date(a.start?.dateTime||a.start?.date) - new Date(b.start?.dateTime||b.start?.date))
  const total = blockTasks.length + dueTasks.length + gcalForDay.length

  let html = `
    <div class="cal-detail-header">
      <div class="cal-detail-header-info">
        <div class="cal-detail-title">${DAYS_FULL[date.getDay()]} ${date.getDate()} de ${MONTHS_ES[date.getMonth()]}</div>
        <div class="cal-detail-count">${total} evento${total!==1?'s':''}</div>
      </div>
      <button class="cal-detail-close" id="btn-cal-detail-close" title="Cerrar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`

  if (gcalForDay.length) {
    html += `<div class="cal-detail-section-title" style="color:#4285f4;margin-bottom:0.25rem">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Google Calendar</div>`
    html += gcalForDay.map(e => {
      const start = e.start?.dateTime
      const end   = e.end?.dateTime
      return `<div class="cal-detail-item gcal-item">
        <div class="cal-detail-time">${start ? fmtTime(start) + (end ? ' – ' + fmtTime(end) : '') : 'Todo el día'}</div>
        <div class="cal-detail-name">${e.summary || 'Sin título'}</div>
        ${e.description ? `<div class="cal-detail-assignee">${e.description.slice(0,60)}${e.description.length>60?'…':''}</div>` : ''}
      </div>`
    }).join('')
  }

  if (blockTasks.length) {
    html += `<div class="cal-detail-section-title" style="color:var(--accent-green);${gcalForDay.length?'margin-top:0.875rem':''}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Bloques de tiempo</div>`
    html += blockTasks.map(t=>`
      <div class="cal-detail-item block-item" data-task-id="${t.id}">
        <div class="cal-detail-time">${fmtTime(t.timeBlockStart)}${t.timeBlockEnd?' – '+fmtTime(t.timeBlockEnd):''}</div>
        <div class="cal-detail-name">${t.title}</div>
        <div class="cal-detail-assignee">${t.accountName||''}</div>
      </div>`).join('')
  }

  if (dueTasks.length) {
    html += `<div class="cal-detail-section-title" style="color:var(--accent-pink);${(blockTasks.length||gcalForDay.length)?'margin-top:0.875rem':''}">Fecha límite</div>`
    html += dueTasks.map(t=>`
      <div class="cal-detail-item due-item" data-task-id="${t.id}">
        <div class="cal-detail-name">${t.title}</div>
        <div class="cal-detail-assignee">${t.accountName||''}</div>
      </div>`).join('')
  }

  if (!total) html += `<p style="font-size:0.8rem;color:var(--text-3);text-align:center;padding:1.5rem 0">Sin eventos este día</p>`
  detail.innerHTML = html
}

// ── View: Reuniones ───────────────────────────────────────
function renderReuniones() {
  renderMeetingList()
  if (state.meetingId) openMeetingEditor(state.meetingId, state.meetingIsNew)
}

function saveMeetingEditor() {
  if (!state.meetingId) return
  const clientVal = document.getElementById('editor-client').value
  const accountName = clientVal === '__other__'
    ? document.getElementById('editor-client-other').value.trim() || null
    : clientVal || null
  updateMeeting(state.meetingId, {
    title:       document.getElementById('editor-title').value.trim() || 'Sin título',
    content:     document.getElementById('editor-textarea').value,
    accountName,
  })
}

function renderMeetingList() {
  const list = document.getElementById('meetings-list')
  const filterSel = document.getElementById('meeting-client-filter')

  const clients = [...new Set(state.meetings.map(m => m.accountName).filter(Boolean))].sort()
  const currentFilter = filterSel.value
  filterSel.innerHTML = `<option value="">Todos los clientes</option>` +
    clients.map(a => `<option value="${a}" ${a === currentFilter ? 'selected' : ''}>${a}</option>`).join('')

  let meetings = state.meetings.slice().sort((a,b) => new Date(b.date) - new Date(a.date))
  if (filterSel.value) meetings = meetings.filter(m => m.accountName === filterSel.value)

  if (!meetings.length) {
    list.innerHTML = `<div class="meeting-list-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${currentFilter ? 'Sin reuniones para este cliente' : 'Sin reuniones aún'}</div>`
    return
  }
  list.innerHTML = meetings.map(m => {
    const linked = state.tasks.filter(t=>t.meetingNoteId===m.id).length
    return `
      <div class="meeting-list-item ${state.meetingId===m.id?'active':''}" data-meeting-id="${m.id}">
        <div class="meeting-item-body">
          <div class="meeting-item-title">${m.title}</div>
          <div class="meeting-item-date">${m.accountName?`<span class="meeting-item-client">${m.accountName}</span> · `:''}${fmtDate(m.date)}</div>
          ${linked?`<div class="meeting-item-tasks">${linked} tarea${linked>1?'s':''} vinculada${linked>1?'s':''}</div>`:''}
        </div>
        <button class="btn-ghost btn-icon btn-sm meeting-item-delete" data-delete-meeting-id="${m.id}" title="Eliminar reunión">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`
  }).join('')
}

function openMeetingEditor(id, isNew=false) {
  const m = state.meetings.find(m=>m.id===id)
  if (!m) return
  state.meetingId = id; state.meetingIsNew = isNew
  document.getElementById('editor-empty').classList.add('hidden')
  const content = document.getElementById('editor-content')
  content.classList.remove('hidden')
  document.getElementById('editor-title').value    = m.title
  document.getElementById('editor-textarea').value = m.content
  const clientSel = document.getElementById('editor-client')
  const isOtherClient = m.accountName && !CLIENTS.includes(m.accountName)
  clientSel.innerHTML = `<option value="">— Sin cliente —</option>` +
    CLIENTS.map(a=>`<option value="${a}" ${a===m.accountName?'selected':''}>${a}</option>`).join('') +
    `<option value="__other__" ${isOtherClient?'selected':''}>Otro...</option>`
  const otherClient = document.getElementById('editor-client-other')
  otherClient.style.display = isOtherClient ? '' : 'none'
  otherClient.value = isOtherClient ? m.accountName : ''
  const linked = state.tasks.filter(t=>t.meetingNoteId===id)
  const linkedDiv = document.getElementById('editor-linked-tasks')
  if (linked.length) {
    linkedDiv.classList.remove('hidden')
    linkedDiv.innerHTML = `<div class="linked-tasks-title">Tareas vinculadas</div><div>${linked.map(t=>`<span class="linked-task-pill">${t.title}</span>`).join('')}</div>`
  } else {
    linkedDiv.classList.add('hidden')
  }
  document.getElementById('btn-delete-meeting').style.display = isNew?'none':''
  document.querySelectorAll('.meeting-list-item').forEach(el=>el.classList.toggle('active', el.dataset.meetingId===id))
}

// ── Modal ─────────────────────────────────────────────────
function openModal(task, defaults={}) {
  state.modalTask = task||null; state.modalDefaults = defaults
  const isNew = !task
  document.getElementById('modal-title').textContent    = isNew?'Nueva Tarea':'Editar Tarea'
  document.getElementById('btn-modal-save').textContent = isNew?'Crear tarea':'Guardar'
  document.getElementById('btn-delete-task').style.display = isNew?'none':''

  // Client dropdown
  const client = task?.accountName || defaults.accountName || ''
  const isOther = client && !CLIENTS.includes(client)
  document.getElementById('f-client').innerHTML =
    `<option value="">— Sin cliente —</option>` +
    CLIENTS.map(a=>`<option value="${a}" ${a===client?'selected':''}>${a}</option>`).join('') +
    `<option value="__other__" ${isOther?'selected':''}>Otro...</option>`
  const otherInput = document.getElementById('f-client-other')
  otherInput.style.display = isOther ? '' : 'none'
  otherInput.value = isOther ? client : ''

  document.getElementById('f-title').value        = task?.title        || defaults.title || ''
  document.getElementById('f-desc').value         = task?.description  || ''
  document.getElementById('f-url').value          = task?.url          || ''
  document.getElementById('f-status').value       = task?.status       || defaults.status || 'TODO'
  document.getElementById('f-due').value          = toInputDate(task?.dueDate)
  document.getElementById('f-block-start').value  = toInputDateTime(task?.timeBlockStart)
  document.getElementById('f-block-end').value    = toInputDateTime(task?.timeBlockEnd)

  // Subtasks
  const subtasks = task?.subtasks || []
  renderSubtaskList(subtasks)
  document.getElementById('f-subtask-input').value = ''

  const modal = document.getElementById('task-modal')
  modal.classList.remove('hidden')
  modal.classList.add('modal-enter')
  setTimeout(() => { modal.classList.remove('modal-enter'); document.getElementById('f-title').focus() }, 250)
}

function closeModal() {
  document.getElementById('task-modal').classList.add('hidden')
  state.modalTask = null; state.modalDefaults = {}
}

function renderSubtaskList(subtasks) {
  document.getElementById('f-subtasks-list').innerHTML = subtasks.map((s,i) => `
    <div class="subtask-row" data-idx="${i}">
      <button type="button" class="task-check ${s.done?'checked':''} subtask-check" data-subtask-idx="${i}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <span class="subtask-title ${s.done?'done':''}">${s.title}</span>
      <button type="button" class="btn-ghost btn-icon btn-sm subtask-delete" data-subtask-idx="${i}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('')
}

function getModalSubtasks() {
  const rows = document.querySelectorAll('.subtask-row')
  return Array.from(rows).map(r => ({
    id:    r.dataset.idx,
    title: r.querySelector('.subtask-title').textContent,
    done:  r.querySelector('.subtask-check').classList.contains('checked'),
  }))
}

function saveModal() {
  const title = document.getElementById('f-title').value.trim()
  if (!title) { document.getElementById('f-title').focus(); return }
  const bs = document.getElementById('f-block-start').value
  const be = document.getElementById('f-block-end').value

  // Client (including "Otro")
  const clientSel = document.getElementById('f-client').value
  const accountName = clientSel === '__other__'
    ? document.getElementById('f-client-other').value.trim() || null
    : clientSel || null

  const data = {
    title,
    description:   document.getElementById('f-desc').value.trim()||null,
    assigneeIds:   [state.currentUserId],
    assigneeId:    state.currentUserId,
    accountName,
    url:           document.getElementById('f-url').value.trim()||null,
    status:        document.getElementById('f-status').value,
    priority:      'MEDIUM',
    estimatedHours: null,
    dueDate:       document.getElementById('f-due').value||null,
    timeBlockStart:bs ? new Date(bs).toISOString() : null,
    timeBlockEnd:  be ? new Date(be).toISOString() : null,
    subtasks:      getModalSubtasks(),
    meetingNoteId: state.modalDefaults.meetingNoteId || state.modalTask?.meetingNoteId || null,
  }
  if (state.modalTask) {
    updateTask(state.modalTask.id, data)
    if (state.gcalAccounts.length) {
      const updated = state.tasks.find(t => t.id === state.modalTask.id)
      if (updated?.gcalEventId) {
        updateGCalEvent(updated).then(id => {
          if (id === null) updateTask(updated.id, { gcalEventId: null })
        })
      } else if (data.timeBlockStart) {
        createGCalEvent({ ...state.modalTask, ...data }).then(id => {
          if (id) updateTask(state.modalTask.id, { gcalEventId: id })
        })
      }
    }
  } else {
    const newTask = createTask(data)
    if (state.gcalAccounts.length && data.timeBlockStart) {
      createGCalEvent(newTask).then(id => {
        if (id) updateTask(newTask.id, { gcalEventId: id })
      })
    }
  }
  const isNew = !state.modalTask
  closeModal()
  renderView(state.currentView)
  toast(isNew ? 'Tarea creada' : 'Tarea actualizada')
}

// ── Events ────────────────────────────────────────────────
document.addEventListener('click', e => {
  const el = e.target

  const navLink = el.closest('.nav-link')
  if (navLink?.dataset.view) { navigate(navLink.dataset.view); return }

  if (el.closest('#btn-new-task-mis') || el.closest('#btn-new-task-kanban') || el.closest('#btn-new-task-mi-dia')) { openModal(null); return }

  const kanbanAdd = el.closest('.kanban-add-btn')
  if (kanbanAdd) { openModal(null, { status: kanbanAdd.dataset.col }); return }

  if (el.closest('[data-action="check"]')) {
    const checkBtn = el.closest('[data-action="check"]')
    const taskId = checkBtn.dataset.taskId
    const task = state.tasks.find(t=>t.id===taskId)
    if (task) {
      const wasDone = task.status === 'DONE'
      const card = checkBtn.closest('.task-card')
      // Animate check
      checkBtn.classList.add('anim-pop')
      if (!wasDone && card) card.classList.add('anim-done')
      updateTask(taskId, { status: wasDone ? 'TODO' : 'DONE' })
      if (!wasDone) toast('Tarea completada')
      setTimeout(() => {
        renderView(state.currentView)
        if (state.currentView === 'calendario') renderCalTodayPanel()
      }, wasDone ? 50 : 350)
    }
    return
  }

  if (el.closest('[data-action="reschedule"]')) {
    const rescBtn = el.closest('[data-action="reschedule"]')
    const taskId = rescBtn.dataset.taskId
    showReschedulePopup(taskId, rescBtn)
    return
  }

  const card = el.closest('.task-card')
  if (card?.dataset.taskId && !el.closest('.kanban-add-btn') && !el.closest('[data-action]')) {
    const task = state.tasks.find(t=>t.id===card.dataset.taskId)
    if (task) openModal(task); return
  }

  const calCell = el.closest('.cal-cell')
  if (calCell?.dataset.date) {
    const d = new Date(calCell.dataset.date)
    state.calSelected = (state.calSelected && sameDay(d, state.calSelected)) ? null : d
    renderCalendario(); return
  }

  const detailItem = el.closest('.cal-detail-item, .today-item, .cal-week-event')
  if (detailItem?.dataset.taskId && !el.closest('[data-action]')) {
    const task = state.tasks.find(t=>t.id===detailItem.dataset.taskId)
    if (task) openModal(task); return
  }

  // Close cal detail
  if (el.closest('#btn-cal-detail-close')) {
    state.calSelected = null
    const topRow = document.getElementById('cal-top-row')
    const detail = document.getElementById('cal-detail')
    topRow.classList.remove('has-detail')
    detail.classList.add('hidden')
    document.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'))
    return
  }

  // Calendar mode toggle
  const calMode = el.closest('[data-cal-mode]')
  if (calMode) {
    state.calMode = calMode.dataset.calMode
    renderCalendario()
    return
  }

  if (el.closest('#cal-prev'))  {
    if (state.calMode === 'week') { state.calDate.setDate(state.calDate.getDate() - 7) }
    else { state.calDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth()-1, 1) }
    renderCalendario(); return
  }
  if (el.closest('#cal-next'))  {
    if (state.calMode === 'week') { state.calDate.setDate(state.calDate.getDate() + 7) }
    else { state.calDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth()+1, 1) }
    renderCalendario(); return
  }
  if (el.closest('#cal-today')) { state.calDate = new Date(); state.calSelected = null; renderCalendario(); return }

  const filterBtn = el.closest('.filter-btn')
  if (filterBtn && document.getElementById('view-mis-tareas').contains(filterBtn)) {
    state.filterStatus = filterBtn.dataset.status || 'all'
    renderMisTareas(); return
  }

  const deleteBtn = el.closest('.meeting-item-delete')
  if (deleteBtn?.dataset.deleteMeetingId) {
    const delId = deleteBtn.dataset.deleteMeetingId
    if (!confirm('¿Eliminar esta reunión?')) return
    deleteMeeting(delId)
    if (state.meetingId === delId) {
      state.meetingId = null
      document.getElementById('editor-empty').classList.remove('hidden')
      document.getElementById('editor-content').classList.add('hidden')
    }
    renderMeetingList(); return
  }

  const meetingItem = el.closest('.meeting-list-item')
  if (meetingItem?.dataset.meetingId) {
    state.meetingId = meetingItem.dataset.meetingId; state.meetingIsNew = false
    openMeetingEditor(state.meetingId); renderMeetingList(); return
  }

  if (el.closest('#btn-new-meeting')) {
    const m = createMeeting({ title:'Nueva reunión', content:'', date:new Date().toISOString() })
    state.meetingId = m.id; state.meetingIsNew = true
    renderMeetingList(); openMeetingEditor(m.id, true); return
  }

  if (el.closest('#btn-save-meeting')) {
    if (!state.meetingId) return
    saveMeetingEditor()
    state.meetingIsNew = false
    clearTimeout(_meetingAutoSaveTimer)
    renderMeetingList(); openMeetingEditor(state.meetingId); return
  }

  if (el.closest('#btn-delete-meeting')) {
    if (!state.meetingId || !confirm('¿Eliminar esta reunión?')) return
    deleteMeeting(state.meetingId); state.meetingId = null
    document.getElementById('editor-empty').classList.remove('hidden')
    document.getElementById('editor-content').classList.add('hidden')
    renderMeetingList(); return
  }

  if (el.closest('#btn-extract-task')) {
    const ta = document.getElementById('editor-textarea')
    const selectedText = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim()
    const textToAnalyze = selectedText || ta.value
    openExtractModal(textToAnalyze)
    return
  }

  // Subtask add
  if (el.closest('#btn-add-subtask')) {
    const inp = document.getElementById('f-subtask-input')
    const val = inp.value.trim()
    if (!val) return
    const current = getModalSubtasks()
    current.push({ id: uid(), title: val, done: false })
    renderSubtaskList(current)
    inp.value = ''; inp.focus()
    return
  }

  // Subtask check toggle
  const subCheck = el.closest('.subtask-check')
  if (subCheck) {
    subCheck.classList.toggle('checked')
    const title = subCheck.closest('.subtask-row').querySelector('.subtask-title')
    title.classList.toggle('done', subCheck.classList.contains('checked'))
    return
  }

  // Subtask delete
  const subDel = el.closest('.subtask-delete')
  if (subDel) {
    const current = getModalSubtasks()
    current.splice(parseInt(subDel.dataset.subtaskIdx), 1)
    renderSubtaskList(current)
    return
  }

  if (el.closest('#modal-close') || el.closest('#btn-modal-cancel')) { closeModal(); return }
  if (el === document.getElementById('task-modal'))                   { closeModal(); return }
  if (el.closest('#btn-modal-save'))                                  { saveModal();  return }

  if (el.closest('#btn-delete-task')) {
    if (!state.modalTask || !confirm('¿Eliminar esta tarea?')) return
    deleteTask(state.modalTask.id); closeModal(); renderView(state.currentView); toast('Tarea eliminada', 'info'); return
  }
})

// ── Drag & Drop Reorder ───────────────────────────────────
let _dragTaskId = null
let _dragPlaceholder = null

document.addEventListener('dragstart', e => {
  const card = e.target.closest('.task-card')
  if (!card?.dataset.taskId) return
  _dragTaskId = card.dataset.taskId
  e.dataTransfer.setData('taskId', _dragTaskId)
  e.dataTransfer.effectAllowed = 'move'
  setTimeout(() => card.classList.add('dragging'), 0)
})

document.addEventListener('dragend', e => {
  const card = e.target.closest?.('.task-card')
  if (card) card.classList.remove('dragging')
  document.querySelectorAll('.drag-above, .drag-below').forEach(el => el.classList.remove('drag-above', 'drag-below'))
  _dragTaskId = null
})

// Reorder within task-list containers
document.addEventListener('dragover', e => {
  const card = e.target.closest('.task-card')
  const list = e.target.closest('.task-list, .kanban-tasks, .kanban-col')
  if (!list || !_dragTaskId) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'

  // Clean previous indicators
  list.querySelectorAll('.drag-above, .drag-below').forEach(el => el.classList.remove('drag-above', 'drag-below'))

  if (card && card.dataset.taskId !== _dragTaskId) {
    const rect = card.getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    if (e.clientY < mid) {
      card.classList.add('drag-above')
    } else {
      card.classList.add('drag-below')
    }
  }
})

document.addEventListener('drop', e => {
  const list = e.target.closest('.task-list, .kanban-tasks, .kanban-col')
  if (!list || !_dragTaskId) return

  // Handle kanban column status change
  const kanbanCol = e.target.closest('.kanban-col')

  const targetCard = e.target.closest('.task-card')
  const targetId = targetCard?.dataset.taskId

  if (!targetId || targetId === _dragTaskId) {
    // Dropped on column but not on a card — handle kanban status change
    if (kanbanCol) {
      e.preventDefault()
      kanbanCol.classList.remove('drag-over')
      updateTask(_dragTaskId, { status: kanbanCol.dataset.col })
      renderView(state.currentView)
    }
    return
  }

  e.preventDefault()

  // Determine position: above or below target
  const rect = targetCard.getBoundingClientRect()
  const insertBefore = e.clientY < rect.top + rect.height / 2

  // Get all task IDs in this list in current DOM order
  const cards = Array.from(list.querySelectorAll('.task-card[data-task-id]'))
  const ids = cards.map(c => c.dataset.taskId).filter(id => id !== _dragTaskId)

  // Insert dragged task at new position
  const targetIdx = ids.indexOf(targetId)
  const insertIdx = insertBefore ? targetIdx : targetIdx + 1
  ids.splice(insertIdx, 0, _dragTaskId)

  // Update sort_order for all tasks in this group
  ids.forEach((id, i) => {
    const task = state.tasks.find(t => t.id === id)
    if (task && task.sortOrder !== i) {
      updateTask(id, { sortOrder: i })
    }
  })

  // If kanban, also update status
  if (kanbanCol) {
    updateTask(_dragTaskId, { status: kanbanCol.dataset.col })
  }

  // Clean up
  document.querySelectorAll('.drag-above, .drag-below').forEach(el => el.classList.remove('drag-above', 'drag-below'))
  renderView(state.currentView)
})

document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeModal(); closeExtractModal() }
  if (e.key==='Enter' && e.target.id==='f-subtask-input') {
    document.getElementById('btn-add-subtask').click()
  }
})

document.getElementById('filter-client-select').addEventListener('change', function() {
  state.filterClient = this.value || 'all'
  renderMisTareas()
})

document.getElementById('f-client').addEventListener('change', function() {
  const other = document.getElementById('f-client-other')
  other.style.display = this.value === '__other__' ? '' : 'none'
  if (this.value === '__other__') other.focus()
})

// ── Meeting auto-save ─────────────────────────────────────
let _meetingAutoSaveTimer = null
function scheduleMeetingAutoSave() {
  if (!state.meetingId) return
  const ind = document.getElementById('editor-autosave-indicator')
  if (ind) { ind.textContent = 'Guardando...'; ind.classList.remove('saved') }
  clearTimeout(_meetingAutoSaveTimer)
  _meetingAutoSaveTimer = setTimeout(() => {
    saveMeetingEditor()
    renderMeetingList()
    if (ind) { ind.textContent = 'Guardado ✓'; ind.classList.add('saved') }
  }, 1500)
}

document.getElementById('editor-textarea').addEventListener('input', scheduleMeetingAutoSave)
document.getElementById('editor-title').addEventListener('input', scheduleMeetingAutoSave)

document.getElementById('editor-client').addEventListener('change', function() {
  const other = document.getElementById('editor-client-other')
  other.style.display = this.value === '__other__' ? '' : 'none'
  if (this.value === '__other__') other.focus()
  scheduleMeetingAutoSave()
})
document.getElementById('editor-client-other').addEventListener('input', scheduleMeetingAutoSave)
document.getElementById('meeting-client-filter').addEventListener('change', renderMeetingList)

// ── Task Extraction from Meeting Notes ────────────────────

// Patterns that indicate an actionable task line
const TASK_LINE_PATTERNS = [
  /^→\s*(.+)/,                          // → Crear brief
  /^[-•▸►]\s*(.+)/,                     // - Crear brief / • Crear brief
  /^\*\s+(.+)/,                         // * Crear brief
  /^\d+[.)]\s*(.+)/,                    // 1. Crear brief / 1) Crear brief
  /^(?:TODO|PENDIENTE|ACCIÓN|TAREA)\s*[:：]\s*(.+)/i,
  /^\[[\s]*\]\s*(.+)/,                  // [ ] Unchecked checkbox
]

// Action verbs that hint a line is a task (used for freeform lines without bullet markers)
const ACTION_VERBS = [
  'crear','diseñar','configurar','revisar','preparar','definir','actualizar',
  'enviar','coordinar','documentar','organizar','planificar','investigar',
  'implementar','optimizar','armar','redactar','agendar','contactar',
  'programar','ajustar','validar','entregar','subir','publicar','lanzar',
  'corregir','completar','terminar','finalizar','resolver','asignar',
  'analizar','evaluar','testear','probar','integrar','migrar','deploy',
  'setup','hacer','elaborar','generar','gestionar','solicitar','verificar',
]

// Date patterns in Spanish
const DATE_PATTERNS = [
  { re: /(\d{1,2})\s*(?:de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i, parse: (m) => {
    const monthIdx = MONTHS_ES.indexOf(m[2].toLowerCase())
    if (monthIdx === -1) return null
    const d = new Date(); d.setMonth(monthIdx); d.setDate(parseInt(m[1])); d.setHours(0,0,0,0)
    if (d < new Date()) d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().slice(0,10)
  }},
  { re: /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/, parse: (m) => {
    const day = parseInt(m[1]), month = parseInt(m[2]) - 1
    let year = m[3] ? parseInt(m[3]) : new Date().getFullYear()
    if (year < 100) year += 2000
    const d = new Date(year, month, day)
    return d.toISOString().slice(0,10)
  }},
  { re: /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i, parse: (m) => {
    const dayNames = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
    const altNames = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
    const target = dayNames.indexOf(m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())
    const targetAlt = altNames.indexOf(m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))
    const dayIdx = target >= 0 ? target : targetAlt
    if (dayIdx === -1) return null
    const now = new Date(); now.setHours(0,0,0,0)
    const diff = (dayIdx - now.getDay() + 7) % 7 || 7
    const d = new Date(now); d.setDate(d.getDate() + diff)
    return d.toISOString().slice(0,10)
  }},
  { re: /\b(hoy|mañana|pasado\s*mañana)\b/i, parse: (m) => {
    const d = new Date(); d.setHours(0,0,0,0)
    const word = m[1].toLowerCase()
    if (word === 'mañana') d.setDate(d.getDate() + 1)
    else if (word.startsWith('pasado')) d.setDate(d.getDate() + 2)
    return d.toISOString().slice(0,10)
  }},
]

function extractDateFromText(text) {
  for (const { re, parse } of DATE_PATTERNS) {
    const m = text.match(re)
    if (m) return parse(m)
  }
  return null
}

function parseTasksFromText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const results = []
  const seen = new Set()

  // Track context: lines under "action" headers get boosted
  let inActionSection = false

  for (const line of lines) {
    // Detect section headers that indicate tasks follow
    if (/^(acciones?\s*pendientes?|tareas?|pr[oó]ximos?\s*pasos?|action\s*items?|to\s*do|pendientes?|compromisos)\s*[:：]?\s*$/i.test(line)) {
      inActionSection = true
      continue
    }

    // Reset action section on a new header-like line
    if (/^(puntos?\s*discutidos?|notas?|resumen|contexto|asistentes?|agenda)\s*[:：]?\s*$/i.test(line)) {
      inActionSection = false
      continue
    }

    // Try bullet/marker patterns first
    let taskTitle = null
    let matched = false

    for (const pattern of TASK_LINE_PATTERNS) {
      const m = line.match(pattern)
      if (m) {
        taskTitle = m[1].trim()
        matched = true
        break
      }
    }

    // If no bullet marker, check for action verbs (only if in action section or line starts with verb)
    if (!matched) {
      const firstWord = line.split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (ACTION_VERBS.some(v => firstWord === v || firstWord === v + 'r' || firstWord === v.replace(/r$/, ''))) {
        taskTitle = line
        matched = true
      } else if (inActionSection && line.length > 5 && line.length < 200) {
        // In an action section, treat most non-trivial lines as tasks
        taskTitle = line
        matched = true
      }
    }

    if (taskTitle && taskTitle.length > 3) {
      // Clean up the title
      taskTitle = taskTitle
        .replace(/^[-→•▸►*]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/^\[[\s]*\]\s*/, '')

      // Avoid duplicates
      const key = taskTitle.toLowerCase().slice(0, 40)
      if (seen.has(key)) continue
      seen.add(key)

      // Try to extract date from the line
      const date = extractDateFromText(line)

      results.push({
        id: uid(),
        title: taskTitle,
        dueDate: date || null,
        selected: true,
        source: line.length > 60 ? line.slice(0, 57) + '…' : line,
      })
    }
  }

  return results
}

// ── Extract Modal UI ──────────────────────────────────────
let _extractedTasks = []

function openExtractModal(text) {
  _extractedTasks = parseTasksFromText(text)

  const list = document.getElementById('extract-list')
  const empty = document.getElementById('extract-empty')
  const modal = document.getElementById('extract-modal')

  // Populate client dropdown with meeting's client pre-selected
  const meeting = state.meetingId ? state.meetings.find(m => m.id === state.meetingId) : null
  const meetingClient = meeting?.accountName || ''
  const clientSel = document.getElementById('extract-client')
  const isOther = meetingClient && !CLIENTS.includes(meetingClient)
  clientSel.innerHTML =
    `<option value="">— Sin cliente —</option>` +
    CLIENTS.map(a => `<option value="${a}" ${a === meetingClient ? 'selected' : ''}>${a}</option>`).join('') +
    `<option value="__other__" ${isOther ? 'selected' : ''}>Otro...</option>`

  // Reset global date
  document.getElementById('extract-global-date').value = ''

  const subtitle = document.getElementById('extract-subtitle')
  subtitle.textContent = _extractedTasks.length
    ? `${_extractedTasks.length} tarea${_extractedTasks.length > 1 ? 's' : ''} detectada${_extractedTasks.length > 1 ? 's' : ''} en las notas`
    : 'Analizando notas de la reunión'

  if (_extractedTasks.length) {
    list.classList.remove('hidden')
    empty.classList.add('hidden')
    renderExtractList()
  } else {
    list.classList.add('hidden')
    empty.classList.remove('hidden')
  }

  updateExtractCount()
  modal.classList.remove('hidden')
}

function closeExtractModal() {
  document.getElementById('extract-modal').classList.add('hidden')
  _extractedTasks = []
}

function renderExtractList() {
  const list = document.getElementById('extract-list')
  list.innerHTML = _extractedTasks.map((t, i) => `
    <div class="extract-item ${t.selected ? '' : 'deselected'}" data-extract-idx="${i}">
      <button type="button" class="extract-item-check ${t.selected ? 'checked' : ''}" data-extract-toggle="${i}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <div class="extract-item-body">
        <input class="extract-item-title" value="${t.title.replace(/"/g, '&quot;')}" data-extract-title="${i}" placeholder="Título de la tarea..." />
        <div class="extract-item-row">
          <input type="date" class="extract-item-date" value="${t.dueDate || ''}" data-extract-date="${i}" title="Fecha límite" />
          <span class="extract-item-source" title="${t.source.replace(/"/g, '&quot;')}">↳ ${t.source}</span>
        </div>
      </div>
      <button type="button" class="extract-item-delete" data-extract-delete="${i}" title="Quitar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('')
}

function updateExtractCount() {
  const count = _extractedTasks.filter(t => t.selected).length
  document.getElementById('extract-count').textContent = `${count} tarea${count !== 1 ? 's' : ''} seleccionada${count !== 1 ? 's' : ''}`
  document.getElementById('extract-create').disabled = count === 0
}

function createExtractedTasks() {
  const meetingNoteId = (state.meetingId && !state.meetingIsNew) ? state.meetingId : null

  // Get client from the extract modal dropdown
  const clientSel = document.getElementById('extract-client').value
  const accountName = clientSel === '__other__' ? '' : (clientSel || null)

  const selected = _extractedTasks.filter(t => t.selected)
  if (!selected.length) return

  // Read latest values from the DOM inputs
  selected.forEach(t => {
    const idx = _extractedTasks.indexOf(t)
    const titleInput = document.querySelector(`[data-extract-title="${idx}"]`)
    const dateInput = document.querySelector(`[data-extract-date="${idx}"]`)
    if (titleInput) t.title = titleInput.value.trim()
    if (dateInput) t.dueDate = dateInput.value || null
  })

  for (const t of selected) {
    if (!t.title) continue
    createTask({
      title: t.title,
      description: null,
      assigneeIds: [state.currentUserId],
      assigneeId: state.currentUserId,
      accountName,
      url: null,
      status: 'TODO',
      priority: 'MEDIUM',
      estimatedHours: null,
      dueDate: t.dueDate,
      timeBlockStart: null,
      timeBlockEnd: null,
      subtasks: [],
      meetingNoteId,
    })
  }

  const createdCount = selected.filter(t => t.title).length
  closeExtractModal()
  renderView(state.currentView)
  toast(`${createdCount} tarea${createdCount > 1 ? 's' : ''} creada${createdCount > 1 ? 's' : ''}`)

  // Re-render linked tasks in the editor if open
  if (state.meetingId) {
    const linked = state.tasks.filter(t => t.meetingNoteId === state.meetingId)
    const linkedDiv = document.getElementById('editor-linked-tasks')
    if (linked.length) {
      linkedDiv.classList.remove('hidden')
      linkedDiv.innerHTML = `<div class="linked-tasks-title">Tareas vinculadas</div><div>${linked.map(t => `<span class="linked-task-pill">${t.title}</span>`).join('')}</div>`
    }
  }
}

// Extract modal event delegation
document.addEventListener('click', e => {
  const el = e.target

  // Toggle checkbox
  const toggle = el.closest('[data-extract-toggle]')
  if (toggle) {
    const idx = parseInt(toggle.dataset.extractToggle)
    _extractedTasks[idx].selected = !_extractedTasks[idx].selected
    renderExtractList()
    updateExtractCount()
    return
  }

  // Delete item
  const del = el.closest('[data-extract-delete]')
  if (del) {
    const idx = parseInt(del.dataset.extractDelete)
    _extractedTasks.splice(idx, 1)
    renderExtractList()
    updateExtractCount()
    if (!_extractedTasks.length) {
      document.getElementById('extract-list').classList.add('hidden')
      document.getElementById('extract-empty').classList.remove('hidden')
    }
    return
  }

  if (el.closest('#extract-apply-date')) {
    const globalDate = document.getElementById('extract-global-date').value
    if (!globalDate) return
    _extractedTasks.forEach(t => { if (!t.dueDate) t.dueDate = globalDate })
    renderExtractList()
    return
  }

  if (el.closest('#extract-select-all')) {
    _extractedTasks.forEach(t => t.selected = true)
    renderExtractList()
    updateExtractCount()
    return
  }

  if (el.closest('#extract-deselect-all')) {
    _extractedTasks.forEach(t => t.selected = false)
    renderExtractList()
    updateExtractCount()
    return
  }

  if (el.closest('#extract-create')) { createExtractedTasks(); return }
  if (el.closest('#extract-cancel') || el.closest('#extract-close')) { closeExtractModal(); return }
  if (el === document.getElementById('extract-modal')) { closeExtractModal(); return }
})

// ── Google Calendar ───────────────────────────────────────
const GCAL_CLIENT_ID = '883218314195-degbe8k29aht6g9fdkvfjov2mvrtb2t7.apps.googleusercontent.com'
const GCAL_SCOPE     = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
const GCAL_BASE      = 'https://www.googleapis.com/calendar/v3'

state.gcalAccounts = JSON.parse(localStorage.getItem('gcal_accounts') || '[]')
state.gcalEvents   = []

let _gcalTokenClient = null

function saveGCalAccounts() {
  localStorage.setItem('gcal_accounts', JSON.stringify(state.gcalAccounts))
}

function initGCal() {
  if (typeof google === 'undefined' || !google.accounts?.oauth2) return
  _gcalTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CLIENT_ID,
    scope: GCAL_SCOPE,
    callback: async (resp) => {
      if (resp.error) { console.error('GCal auth error:', resp.error); return }
      const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${resp.access_token}` }
      }).then(r => r.json()).catch(() => ({}))

      const email = info.email || `cuenta-${state.gcalAccounts.length + 1}`
      const existing = state.gcalAccounts.findIndex(a => a.email === email)
      if (existing >= 0) {
        state.gcalAccounts[existing].token = resp.access_token
      } else {
        state.gcalAccounts.push({ email, name: info.name || email, picture: info.picture || null, token: resp.access_token })
      }
      saveGCalAccounts()
      renderGCalAccounts()
      await loadGCalEvents()
      renderView(state.currentView)
    },
  })
  renderGCalAccounts()
}

function renderGCalAccounts() {
  const list = document.getElementById('gcal-accounts-list')
  if (!list) return
  if (!state.gcalAccounts.length) {
    list.innerHTML = `<p class="gcal-empty">Sin cuentas conectadas</p>`
    return
  }
  list.innerHTML = state.gcalAccounts.map((a, i) => `
    <div class="gcal-account-item">
      ${a.picture ? `<img src="${a.picture}" class="gcal-account-avatar" alt="">` : `<span class="gcal-account-avatar gcal-avatar-initials">${(a.name||a.email)[0].toUpperCase()}</span>`}
      <div class="gcal-account-info">
        <div class="gcal-account-name">${a.name || a.email}</div>
      </div>
      <button class="gcal-disconnect-btn" data-gcal-index="${i}" title="Desconectar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('')
}

document.getElementById('btn-gcal-add').addEventListener('click', () => {
  if (!_gcalTokenClient) { initGCal(); setTimeout(() => _gcalTokenClient?.requestAccessToken({ prompt: 'select_account' }), 300); return }
  _gcalTokenClient.requestAccessToken({ prompt: 'select_account' })
})

document.addEventListener('click', e => {
  const btn = e.target.closest('.gcal-disconnect-btn')
  if (!btn) return
  const idx = parseInt(btn.dataset.gcalIndex)
  const acct = state.gcalAccounts[idx]
  if (!acct) return
  if (!confirm(`¿Desconectar la cuenta ${acct.email} de Google Calendar?`)) return
  if (typeof google !== 'undefined') google.accounts.oauth2.revoke(acct.token, () => {})
  state.gcalAccounts.splice(idx, 1)
  saveGCalAccounts()
  state.gcalEvents = []
  renderGCalAccounts()
  renderView(state.currentView)
})

// Settings toggle
document.getElementById('btn-settings-toggle').addEventListener('click', () => {
  const panel = document.getElementById('settings-panel')
  const chevron = document.querySelector('.settings-chevron')
  const open = panel.classList.toggle('open')
  chevron.style.transform = open ? 'rotate(180deg)' : ''
})

async function gcalFetchWithToken(token, path, options = {}) {
  const res = await fetch(GCAL_BASE + path, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (res.status === 401) return { _expired: true }
  if (res.status === 204 || res.status === 410) return {}
  if (!res.ok) return null
  return res.json()
}

async function loadGCalEvents() {
  if (!state.gcalAccounts.length) return
  const d = state.calDate
  // Use a wide range: from start of month (or week) to end, with buffer
  let tMin, tMax
  if (state.calMode === 'week') {
    const weekDays = getWeekDays(d)
    tMin = new Date(weekDays[0]); tMin.setDate(tMin.getDate() - 1)
    tMax = new Date(weekDays[4]); tMax.setDate(tMax.getDate() + 2)
  } else {
    tMin = new Date(d.getFullYear(), d.getMonth(), 1)
    tMax = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
  }
  const params = `?timeMin=${encodeURIComponent(tMin.toISOString())}&timeMax=${encodeURIComponent(tMax.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=250`

  const results = await Promise.all(state.gcalAccounts.map(async (acct, i) => {
    const data = await gcalFetchWithToken(acct.token, `/calendars/primary/events${params}`)
    if (data?._expired) {
      // Auto-refresh: silently request a new token
      if (_gcalTokenClient) {
        try {
          await new Promise((resolve, reject) => {
            _gcalTokenClient.callback = (resp) => {
              if (resp.error) { reject(resp.error); return }
              state.gcalAccounts[i].token = resp.access_token
              state.gcalAccounts[i]._expired = false
              saveGCalAccounts()
              resolve()
            }
            _gcalTokenClient.requestAccessToken({ prompt: '', login_hint: acct.email })
          })
          // Retry with new token
          const retry = await gcalFetchWithToken(state.gcalAccounts[i].token, `/calendars/primary/events${params}`)
          if (retry && !retry._expired) {
            return (retry?.items || []).map(e => ({ ...e, _gcalAccount: acct.email }))
          }
        } catch(err) { console.warn('GCal auto-refresh failed:', err) }
      }
      state.gcalAccounts[i]._expired = true
      saveGCalAccounts()
      renderGCalAccounts()
      toast('Sesión de Google Calendar expirada — reconecta en Configuración', 'error')
      return []
    }
    state.gcalAccounts[i]._expired = false
    return (data?.items || []).map(e => ({ ...e, _gcalAccount: acct.email }))
  }))
  state.gcalEvents = results.flat()
}

async function createGCalEvent(task) {
  if (!state.gcalAccounts.length || !task.timeBlockStart) return null
  const acct = state.gcalAccounts.find(a => !a._expired)
  if (!acct) return null
  const data = await gcalFetchWithToken(acct.token, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify({
      summary:     task.title,
      description: task.description || '',
      start: { dateTime: task.timeBlockStart },
      end:   { dateTime: task.timeBlockEnd || task.timeBlockStart },
      colorId: '9',
    }),
  })
  return data?.id || null
}

async function updateGCalEvent(task) {
  if (!state.gcalAccounts.length || !task.gcalEventId) return task.gcalEventId
  if (!task.timeBlockStart) { await deleteGCalEvent(task.gcalEventId); return null }
  const acct = state.gcalAccounts.find(a => !a._expired)
  if (!acct) return task.gcalEventId
  await gcalFetchWithToken(acct.token, `/calendars/primary/events/${task.gcalEventId}`, {
    method: 'PUT',
    body: JSON.stringify({
      summary:     task.title,
      description: task.description || '',
      start: { dateTime: task.timeBlockStart },
      end:   { dateTime: task.timeBlockEnd || task.timeBlockStart },
      colorId: '9',
    }),
  })
  return task.gcalEventId
}

async function deleteGCalEvent(eventId) {
  if (!state.gcalAccounts.length || !eventId) return
  const acct = state.gcalAccounts.find(a => !a._expired)
  if (!acct) return
  await gcalFetchWithToken(acct.token, `/calendars/primary/events/${eventId}`, { method: 'DELETE' })
}

// ── Mobile sidebar ───────────────────────────────────────
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open')
  document.getElementById('sidebar-overlay').classList.remove('visible')
}

document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
  const isOpen = document.querySelector('.sidebar').classList.contains('open')
  isOpen ? closeSidebar() : (document.querySelector('.sidebar').classList.add('open'), document.getElementById('sidebar-overlay').classList.add('visible'))
})
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar)

// ── Inline Badge Dropdown ─────────────────────────────────
const STATUS_DOTS = { TODO: '#94a3b8', IN_PROGRESS: '#a78bfa', REVIEW: '#60a5fa', DONE: '#4ade80' }

let _bdTaskId   = null
let _bdAction   = null
let _bdAnchor   = null

function showBadgeDropdown(taskId, action, anchorEl) {
  _bdTaskId = taskId; _bdAction = action; _bdAnchor = anchorEl
  const task = state.tasks.find(t => t.id === taskId)
  if (!task) return

  const dropdown = document.getElementById('badge-dropdown')
  const items = STATUS_ORDER.map(v => ({ value: v, label: STATUS_LABELS[v], dot: STATUS_DOTS[v], current: task.status === v }))

  dropdown.innerHTML = items.map(it => `
    <button class="badge-dropdown-item ${it.current ? 'current' : ''}" data-bd-value="${it.value}">
      <span class="item-dot" style="background:${it.dot}"></span>
      ${it.label}
      ${it.current ? `<svg style="margin-left:auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
    </button>`).join('')

  dropdown.classList.remove('hidden')
  const rect = anchorEl.getBoundingClientRect()
  const ddW  = 160
  let left   = rect.left
  let top    = rect.bottom + 6

  if (left + ddW > window.innerWidth - 8) left = window.innerWidth - ddW - 8
  if (top + 200  > window.innerHeight)    top  = rect.top - dropdown.offsetHeight - 6

  dropdown.style.left = left + 'px'
  dropdown.style.top  = top  + 'px'
}

function closeBadgeDropdown() {
  document.getElementById('badge-dropdown').classList.add('hidden')
  _bdTaskId = null; _bdAction = null; _bdAnchor = null
}

// Badge click — open dropdown
document.addEventListener('click', e => {
  const badge = e.target.closest('[data-action]')
  if (badge?.dataset.taskId) {
    e.stopPropagation()
    if (_bdTaskId === badge.dataset.taskId && _bdAction === badge.dataset.action) {
      closeBadgeDropdown(); return
    }
    showBadgeDropdown(badge.dataset.taskId, badge.dataset.action, badge)
    return
  }

  const item = e.target.closest('[data-bd-value]')
  if (item && _bdTaskId) {
    e.stopPropagation()
    const patch = { status: item.dataset.bdValue }
    updateTask(_bdTaskId, patch)
    closeBadgeDropdown()
    renderView(state.currentView)
    return
  }

  if (!e.target.closest('#badge-dropdown')) closeBadgeDropdown()
})

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBadgeDropdown() })

// ── Pie tooltip ───────────────────────────────────────────
const _pieTooltip = document.getElementById('pie-tooltip')
document.addEventListener('mouseover', e => {
  const slice = e.target.closest('.db-pie-slice')
  if (!slice) return
  _pieTooltip.textContent = `${slice.dataset.label}: ${slice.dataset.value} (${slice.dataset.pct}%)`
  _pieTooltip.classList.remove('hidden')
  slice.style.opacity = '1'
  slice.style.filter = 'brightness(1.2)'
})
document.addEventListener('mousemove', e => {
  if (_pieTooltip.classList.contains('hidden')) return
  _pieTooltip.style.left = (e.clientX + 14) + 'px'
  _pieTooltip.style.top  = (e.clientY - 32) + 'px'
})
document.addEventListener('mouseout', e => {
  const slice = e.target.closest('.db-pie-slice')
  if (!slice) return
  _pieTooltip.classList.add('hidden')
  slice.style.opacity = '0.9'
  slice.style.filter = ''
})

// ── Global Search ─────────────────────────────────────────
const _searchInput = document.getElementById('global-search')
const _searchResults = document.getElementById('search-results')

_searchInput.addEventListener('input', () => {
  const q = _searchInput.value.trim().toLowerCase()
  if (q.length < 2) { _searchResults.classList.add('hidden'); return }

  const results = state.tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description||'').toLowerCase().includes(q) ||
    (t.accountName||'').toLowerCase().includes(q)
  ).slice(0, 8)

  if (!results.length) {
    _searchResults.innerHTML = '<div class="search-no-results">Sin resultados</div>'
  } else {
    _searchResults.innerHTML = results.map(t => `
      <div class="search-result-item" data-search-task="${t.id}">
        <span class="search-result-title">${t.title}</span>
        <span class="search-result-meta">${t.accountName||'Sin cliente'} · ${STATUS_LABELS[t.status]}</span>
      </div>`).join('')
  }
  _searchResults.classList.remove('hidden')
})

_searchInput.addEventListener('blur', () => setTimeout(() => _searchResults.classList.add('hidden'), 200))
_searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { _searchInput.blur(); _searchResults.classList.add('hidden') } })

document.addEventListener('click', e => {
  const item = e.target.closest('[data-search-task]')
  if (!item) return
  const task = state.tasks.find(t => t.id === item.dataset.searchTask)
  if (task) { openModal(task); _searchInput.value = ''; _searchResults.classList.add('hidden') }
})

// ── Reschedule Popup ──────────────────────────────────────
let _rescTaskId = null
const _rescPopup = document.getElementById('reschedule-popup')

function showReschedulePopup(taskId, anchor) {
  _rescTaskId = taskId
  _rescPopup.classList.remove('hidden')
  const rect = anchor.getBoundingClientRect()
  let left = rect.left, top = rect.bottom + 6
  if (left + 190 > window.innerWidth) left = window.innerWidth - 200
  if (top + 240 > window.innerHeight) top = rect.top - 240
  _rescPopup.style.left = left + 'px'
  _rescPopup.style.top = top + 'px'
}

function closeReschedulePopup() {
  _rescPopup.classList.add('hidden')
  _rescTaskId = null
}

function getNextMonday() {
  const d = new Date(); d.setHours(0,0,0,0)
  const diff = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

document.addEventListener('click', e => {
  const opt = e.target.closest('.reschedule-opt')
  if (opt && _rescTaskId) {
    e.stopPropagation()
    const action = opt.dataset.resc
    const t = today()
    let newDate = null
    if (action === 'today') newDate = t.toISOString().slice(0, 10)
    else if (action === 'tomorrow') { t.setDate(t.getDate() + 1); newDate = t.toISOString().slice(0, 10) }
    else if (action === 'next-monday') newDate = getNextMonday()
    else if (action === 'next-week') { t.setDate(t.getDate() + 7); newDate = t.toISOString().slice(0, 10) }
    else if (action === 'custom') {
      const task = state.tasks.find(t => t.id === _rescTaskId)
      closeReschedulePopup()
      if (task) openModal(task)
      return
    }
    if (newDate) {
      updateTask(_rescTaskId, { dueDate: newDate })
      toast('Tarea reprogramada')
      renderView(state.currentView)
    }
    closeReschedulePopup()
    return
  }
  if (!e.target.closest('#reschedule-popup') && !e.target.closest('[data-action="reschedule"]')) {
    closeReschedulePopup()
  }
})

// ── Keyboard Shortcuts ────────────────────────────────────
let _shortcutsVisible = false
document.addEventListener('keydown', e => {
  // Skip if in input/textarea/select
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  // ? = show shortcuts
  if (e.key === '?') {
    _shortcutsVisible = !_shortcutsVisible
    document.getElementById('shortcuts-hint').classList.toggle('hidden', !_shortcutsVisible)
    return
  }

  // N = new task
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openModal(null); return }

  // 1-6 = navigate views
  const views = ['mi-dia', 'mis-tareas', 'kanban', 'calendario', 'dashboard', 'reuniones']
  const num = parseInt(e.key)
  if (num >= 1 && num <= 6) { e.preventDefault(); navigate(views[num - 1]); return }
})

// Ctrl+K = focus search
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    _searchInput.focus()
  }
})

// ── Voice Task ────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
let _voiceRecognition = null
let _voiceTranscript = ''

function startVoiceRecording() {
  if (!SpeechRecognition) { toast('Tu navegador no soporta reconocimiento de voz', 'error'); return }

  const modal = document.getElementById('voice-modal')
  const recording = document.getElementById('voice-recording')
  const draft = document.getElementById('voice-draft')
  const footer = document.getElementById('voice-footer')
  const live = document.getElementById('voice-live')
  const status = document.getElementById('voice-status')

  // Reset UI
  modal.classList.remove('hidden')
  recording.classList.remove('hidden')
  draft.classList.add('hidden')
  footer.style.display = 'none'
  live.textContent = ''
  status.textContent = 'Escuchando...'
  _voiceTranscript = ''
  document.getElementById('btn-voice').classList.add('recording')
  document.getElementById('voice-modal-title').textContent = 'Crear tarea por voz'

  // Start recognition
  _voiceRecognition = new SpeechRecognition()
  _voiceRecognition.lang = 'es-ES'
  _voiceRecognition.continuous = true
  _voiceRecognition.interimResults = true

  _voiceRecognition.onresult = (e) => {
    let interim = ''
    let final = ''
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        final += e.results[i][0].transcript
      } else {
        interim += e.results[i][0].transcript
      }
    }
    _voiceTranscript = final
    live.textContent = final + (interim ? interim : '')
  }

  _voiceRecognition.onerror = (e) => {
    console.error('Voice error:', e.error)
    if (e.error === 'not-allowed') {
      toast('Permiso de micrófono denegado', 'error')
      closeVoiceModal()
    } else if (e.error !== 'no-speech') {
      status.textContent = 'Error — intenta de nuevo'
    }
  }

  _voiceRecognition.onend = () => {
    document.getElementById('btn-voice').classList.remove('recording')
    if (_voiceTranscript.trim()) {
      showVoiceDraft(_voiceTranscript.trim())
    } else {
      status.textContent = 'No se detectó audio'
      setTimeout(() => { if (!_voiceTranscript.trim()) closeVoiceModal() }, 2000)
    }
  }

  _voiceRecognition.start()
}

function stopVoiceRecording() {
  if (_voiceRecognition) {
    _voiceRecognition.stop()
    _voiceRecognition = null
  }
  document.getElementById('btn-voice').classList.remove('recording')
}

function showVoiceDraft(text) {
  const recording = document.getElementById('voice-recording')
  const draft = document.getElementById('voice-draft')
  const footer = document.getElementById('voice-footer')

  recording.classList.add('hidden')
  draft.classList.remove('hidden')
  footer.style.display = ''
  document.getElementById('voice-modal-title').textContent = 'Borrador de tarea'

  // Parse the transcript to extract useful info
  const parsed = parseVoiceTranscript(text)

  document.getElementById('voice-title').value = parsed.title
  document.getElementById('voice-desc').value = parsed.description
  document.getElementById('voice-due').value = parsed.dueDate || ''
  document.getElementById('voice-original-text').textContent = text

  // Populate client dropdown
  const clientSel = document.getElementById('voice-client')
  clientSel.innerHTML = `<option value="">— Sin cliente —</option>` +
    CLIENTS.map(a => `<option value="${a}" ${a === parsed.client ? 'selected' : ''}>${a}</option>`).join('')
}

function parseVoiceTranscript(text) {
  let title = ''
  let description = ''
  let client = ''
  let dueDate = null

  // Detect client
  for (const c of CLIENTS) {
    const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(text)) { client = c; break }
  }

  // Detect date
  dueDate = extractDateFromText(text)

  // Strip conversational filler to extract the actual task
  // Patterns like "necesito hacer...", "tengo que...", "hay que...", "crear una tarea para...", etc.
  const fillerPatterns = [
    /^(?:ok|okey|bueno|a ver|haber|mira|oye|eh+)\s*[,.]?\s*/i,
    /^(?:quiero|necesito|tengo que|hay que|debo|debería|toca|me toca|falta)\s+/i,
    /^(?:crear|agregar|añadir|poner|meter)\s+(?:una\s+)?(?:tarea|task)\s+(?:para|de|que diga|que sea|sobre|con)\s+/i,
    /^(?:crear|agregar|añadir|poner|meter)\s+(?:una\s+)?(?:tarea|task)\s+/i,
    /^(?:la tarea (?:es|sería|será|va a ser))\s+/i,
    /^(?:recordar(?:me)?|acuérda(?:me|te)|no olvid(?:ar|es))\s+(?:que\s+(?:tengo que|debo|hay que)\s+)?/i,
    /^(?:apuntar?|anotar?|registrar?)\s+(?:que\s+)?/i,
  ]

  let cleaned = text.trim()
  for (const pattern of fillerPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove trailing date/time phrases from the title
  const trailingDate = [
    /\s+(?:para|antes del?|el próximo|este|hasta el?)\s+(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|mañana|pasado mañana).*$/i,
    /\s+(?:para|antes del?|hasta el?)\s+(?:el\s+)?\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*$/i,
    /\s+(?:para|antes del?|hasta el?)\s+(?:el\s+)?\d{1,2}[\/\-]\d{1,2}.*$/i,
  ]

  // Remove client name from title
  if (client) {
    const clientRe = new RegExp(`\\s*(?:para|de|del?|con|al?)\\s+${client.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'ig')
    cleaned = cleaned.replace(clientRe, '')
    // Also remove standalone client name at the end
    const clientEnd = new RegExp(`\\s+${client.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
    cleaned = cleaned.replace(clientEnd, '')
  }

  // Remove trailing date phrases
  for (const pattern of trailingDate) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Split into sentences
  const sentences = cleaned.split(/[.!?]\s+/).map(s => s.trim()).filter(Boolean)

  if (sentences.length > 1) {
    title = sentences[0]
    description = sentences.slice(1).join('. ')
  } else {
    title = cleaned
  }

  // Clean up: remove trailing punctuation, capitalize
  title = title.replace(/[.,;:!?]+$/, '').trim()
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1)

  // If title is still too long, cut at a reasonable point
  if (title.length > 80) {
    const cutoff = title.lastIndexOf(' ', 80)
    const extra = title.slice(cutoff > 20 ? cutoff : 80).trim()
    title = title.slice(0, cutoff > 20 ? cutoff : 80).trim()
    if (extra) description = extra + (description ? '. ' + description : '')
  }

  // Fallback: if cleaning removed everything, use original
  if (!title) title = text.charAt(0).toUpperCase() + text.slice(1)

  return { title, description, client, dueDate }
}

function createVoiceTask() {
  const title = document.getElementById('voice-title').value.trim()
  if (!title) { document.getElementById('voice-title').focus(); return }

  const clientSel = document.getElementById('voice-client').value
  const dueDate = document.getElementById('voice-due').value || null
  const description = document.getElementById('voice-desc').value.trim() || null

  createTask({
    title,
    description,
    assigneeIds: [state.currentUserId],
    assigneeId: state.currentUserId,
    accountName: clientSel || null,
    url: null,
    status: 'TODO',
    priority: 'MEDIUM',
    estimatedHours: null,
    dueDate,
    timeBlockStart: null,
    timeBlockEnd: null,
    subtasks: [],
    meetingNoteId: null,
  })

  closeVoiceModal()
  renderView(state.currentView)
  toast('Tarea creada por voz')
}

function closeVoiceModal() {
  stopVoiceRecording()
  document.getElementById('voice-modal').classList.add('hidden')
  document.getElementById('btn-voice').classList.remove('recording')
}

// Voice event listeners
document.getElementById('btn-voice').addEventListener('click', startVoiceRecording)
document.getElementById('voice-stop').addEventListener('click', stopVoiceRecording)
document.getElementById('voice-close').addEventListener('click', closeVoiceModal)
document.getElementById('voice-create').addEventListener('click', createVoiceTask)
document.getElementById('voice-retry').addEventListener('click', () => {
  stopVoiceRecording()
  startVoiceRecording()
})
document.getElementById('voice-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('voice-modal')) closeVoiceModal()
})

// ── Overdue Alert Banner ──────────────────────────────────
function renderOverdueAlert() {
  const overdueCount = state.tasks.filter(t => isOverdue(t)).length
  // Remove existing alert
  document.querySelectorAll('.overdue-alert').forEach(el => el.remove())
  if (!overdueCount) return

  const views = ['view-mis-tareas', 'view-mi-dia']
  views.forEach(viewId => {
    const view = document.getElementById(viewId)
    if (!view) return
    const header = view.querySelector('.view-header')
    if (!header) return
    // Don't duplicate
    if (header.nextElementSibling?.classList?.contains('overdue-alert')) return
    const alert = document.createElement('div')
    alert.className = 'overdue-alert'
    alert.dataset.view = 'vencidas'
    alert.innerHTML = `
      <svg class="overdue-alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="overdue-alert-text">Tienes <strong>${overdueCount} tarea${overdueCount > 1 ? 's' : ''} vencida${overdueCount > 1 ? 's' : ''}</strong></span>
      <span class="overdue-alert-count">${overdueCount}</span>`
    alert.addEventListener('click', () => navigate('vencidas'))
    header.after(alert)
  })
}

// ── Auto-archive: hide completed tasks older than 7 days ──
function getVisibleTasks() {
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return state.tasks.filter(t => {
    if (t.status === 'DONE' && new Date(t.updatedAt) < sevenDaysAgo) return false
    return true
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  await loadData()
  navigate('mi-dia')
  setupRealtime()
  renderGCalAccounts()
  setTimeout(initGCal, 500)
  renderOverdueAlert()
}

function setupRealtime() {
  sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, async () => {
      const { data } = await sb.from('tasks').select('*').order('created_at')
      state.tasks = (data || []).map(mapTaskFromDB)
      renderView(state.currentView)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, async () => {
      const { data } = await sb.from('meetings').select('*').order('created_at')
      state.meetings = (data || []).map(mapMeetingFromDB)
      renderView(state.currentView)
    })
    .subscribe()
}

init()
