(function () {
  "use strict";

  // 화면 루트와 저장 키
  const main = document.getElementById("app-main");
  const modalRoot = document.getElementById("modal-root");
  const toast = document.getElementById("toast");
  const liveRegion = document.getElementById("live-region");
  const topbarTitle = document.getElementById("topbar-title");
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const V1_STORAGE_KEY = "autoAiPlanner.appData.v1";
  const V2_STORAGE_KEY = "autoAiPlanner.appData.v2";
  const APP_STORAGE_KEY = "autoAiPlanner.appData.v3";
  const API_KEY_LOCAL_KEY = "autoAiPlanner.apiKey.local";
  const API_KEY_SESSION_KEY = "autoAiPlanner.apiKey.session";
  const API_PROFILE_SESSION_KEY = "autoAiPlanner.apiProfile.session";
  const OPENROUTER_MODELS_CACHE_KEY = "autoAiPlanner.openRouterModels.v4";
  const APP_DATA_VERSION = 3;
  const DEFAULT_PROFILE_NAME = "지민";
  const DEFAULT_DASHBOARD_HEADLINE = "중요한 일정과 다음 행동을 한눈에 확인하세요.";
  const DEFAULT_DASHBOARD_SUBTITLE = "오늘의 우선순위를 살펴보고, 할 수 있는 일부터 차근차근 시작해 보세요.";
  const DEFAULT_SCHEDULE_COLOR = "#6D5CE7";
  const DEFAULT_PLAN_COLOR = "#0F9D8A";
  const COLOR_PALETTE = ["#6D5CE7", "#2563EB", "#0F9D8A", "#F59E0B", "#EF4444", "#DB2777", "#7C3AED", "#475569"];
  let migratedLegacyData = false;

  // 상태 표기와 화면 이름
  const statusMeta = {
    scheduled: { label: "예정", icon: "◷" },
    progress: { label: "진행 중", icon: "↻" },
    completed: { label: "완료", icon: "✓" },
    paused: { label: "보류", icon: "Ⅱ" },
    cancelled: { label: "취소", icon: "×" },
    overdue: { label: "마감 초과", icon: "!" }
  };

  const priorityMeta = {
    high: { label: "높음", icon: "↑" },
    medium: { label: "보통", icon: "―" },
    low: { label: "낮음", icon: "↓" }
  };

  const routeTitles = {
    dashboard: "대시보드",
    tasks: "일정 목록",
    calendar: "달력",
    completed: "완료 일정",
    settings: "설정",
    todos: "할 일",
    plans: "프로젝트",
    "task-detail": "일정 상세",
    "plan-detail": "프로젝트 상세"
  };

  let today = startOfDay(new Date());
  // AI 공급자 기본 설정
  const API_PROVIDERS = {
    mock: {
      label: "체험 모드",
      optionLabel: "체험 모드 · API 없이 사용",
      endpoint: "",
      model: "mock-planner-v1",
      endpointLocked: true,
      endpointHelp: "외부 네트워크 없이 일정 생성과 수정 흐름을 시험합니다."
    },
    gemini: {
      label: "Google Gemini",
      optionLabel: "Google Gemini API",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/interactions",
      model: "gemini-3.5-flash",
      endpointLocked: false,
      endpointHelp: "Google Gemini Interactions API를 사용합니다. 모델명은 필요에 따라 변경할 수 있습니다."
    },
    groq: {
      label: "GroqCloud",
      optionLabel: "GroqCloud API",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.3-70b-versatile",
      endpointLocked: false,
      endpointHelp: "GroqCloud의 OpenAI 호환 Chat Completions API를 사용합니다."
    },
    openrouter: {
      label: "OpenRouter",
      optionLabel: "OpenRouter API",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: "openrouter/free",
      endpointLocked: false,
      endpointHelp: "목록에서 무료 모델을 선택하거나 모델 ID를 직접 입력하세요. 기본값은 사용 가능한 무료 모델을 자동 선택합니다."
    },
    "openai-compatible": {
      label: "사용자 지정 API",
      optionLabel: "사용자 지정 API",
      endpoint: "",
      model: "",
      endpointLocked: false,
      endpointHelp: "OpenAI 호환 Chat Completions 형식의 API 주소와 모델 ID를 직접 입력하세요."
    }
  };
  const SUPPORTED_API_PROVIDERS = Object.keys(API_PROVIDERS);
  const storedAppData = loadStoredAppData();
  const defaultApiSettings = {
    provider: "mock",
    endpoint: API_PROVIDERS.mock.endpoint,
    model: API_PROVIDERS.mock.model,
    rememberApiKey: false,
    timeout: 20
  };

  // 전역 화면과 데이터 상태
  const state = {
    route: "dashboard",
    selectedTaskId: null,
    selectedPlanId: null,
    schedules: storedAppData ? storedAppData.schedules : createMockTasks().map(normalizeStoredTask).filter(Boolean),
    todos: storedAppData ? storedAppData.todos : createMockTodos(),
    projects: storedAppData ? storedAppData.projects : createMockPlans(),
    profile: storedAppData?.profile || { displayName: DEFAULT_PROFILE_NAME },
    dashboardHeadline: storedAppData?.preferences.dashboardHeadline || DEFAULT_DASHBOARD_HEADLINE,
    dashboardSubtitle: storedAppData?.preferences.dashboardSubtitle || DEFAULT_DASHBOARD_SUBTITLE,
    theme: storedAppData?.preferences.theme || "light",
    reduceMotion: storedAppData?.preferences.reduceMotion ?? (systemTheme.matches && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    confirmBeforeDelete: storedAppData?.preferences.confirmBeforeDelete ?? true,
    startPage: storedAppData?.preferences.startPage || "dashboard",
    recentPrompts: storedAppData?.recentPrompts || [],
    apiSettings: { ...defaultApiSettings, ...(storedAppData?.apiSettings || {}), ...loadSessionApiSettings() },
    lastSavedAt: storedAppData?.lastSavedAt || null,
    calendarDate: new Date(today.getFullYear(), today.getMonth(), 1),
    selectedDate: toISODate(today),
    calendarView: storedAppData?.preferences.calendarView || "month",
    calendarMonths: storedAppData?.preferences.calendarView === "multi" ? 13 : 1,
    calendarFilters: { schedules: true, todos: true, milestones: true, projects: true, ...(storedAppData?.preferences.calendarFilters || {}) },
    multiMonthStart: new Date(today.getFullYear(), today.getMonth() - 6, 1),
    filters: { search: "", status: "all", priority: "all", date: "all", tag: "all", sort: "date" },
    todoFilters: { search: "", status: "all", priority: "all" },
    completedSearch: "",
    completedSort: "recent",
    generation: { status: "idle", input: "", mode: storedAppData?.preferences.lastAiMode || "auto", step: 0, newTaskId: null, timers: [], errorMessage: "", errorCode: "", previewTask: null, previewEntity: null, previewType: null },
    apiProfiles: storedAppData?.apiProfiles || {},
    openRouterModels: [],
    openRouterModelsStatus: "idle",
    groqModels: [],
    groqModelsStatus: "idle",
    apiTest: { status: "idle", message: "", details: "" },
    activeRequest: null,
    modal: null,
    lastFocused: null
  };

  // 일정 상태 호환 별칭
  Object.defineProperty(state, "tasks", {
    configurable: true,
    get() { return state.schedules; },
    set(value) { state.schedules = value; }
  });
  // 프로젝트 상태 호환 별칭
  Object.defineProperty(state, "plans", {
    configurable: true,
    get() { return state.projects; },
    set(value) { state.projects = value; }
  });

  // 날짜 계산 도우미
  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function fromISODate(value) {
    const parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  let todayRefreshTimer = null;
  function refreshTodayReference() {
    const nextToday = startOfDay(new Date());
    const previousTodayISO = toISODate(today);
    const nextTodayISO = toISODate(nextToday);
    const dateChanged = nextTodayISO !== previousTodayISO;
    today = nextToday;
    if (dateChanged) {
      if (state.selectedDate === previousTodayISO) state.selectedDate = nextTodayISO;
      render();
      announce("날짜가 바뀌어 오늘 기준 정보를 새로 표시했습니다.");
    }
    window.clearTimeout(todayRefreshTimer);
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 1, 0);
    todayRefreshTimer = window.setTimeout(refreshTodayReference, Math.max(1000, nextMidnight.getTime() - Date.now()));
  }

  // 초기 예시 데이터
  function createMockTasks() {
    return [
      {
        id: 1,
        title: "[예시] 오늘의 업무 계획 정리",
        status: "scheduled",
        date: toISODate(today),
        duration: "1시간",
        priority: "medium",
        difficulty: "보통",
        tags: ["예시"],
        description: "일정 추가·수정·완료 기능을 확인하기 위한 예시 일정입니다.",
        subtasks: [
          { title: "우선순위 확인", done: true },
          { title: "다음 행동 정리", done: false }
        ],
        createdAt: toISODate(today)
      }
    ];
  }

  function createMockTodos() {
    return [
      normalizeTodo({ id: 1, title: "[예시] 오늘 확인할 할 일", description: "할 일 완료·수정·일정 전환 기능을 확인하기 위한 예시입니다.", completed: false, priority: "medium", dueDate: toISODate(today), tags: ["예시"], createdAt: new Date().toISOString() }, 0)
    ].filter(Boolean);
  }

  function createMockPlans() {
    const startDate = toISODate(addDays(today, -2));
    const endDate = toISODate(addDays(today, 30));
    return [normalizePlan({
      id: 1,
      title: "[예시] 한 달 프로젝트",
      description: "프로젝트 기간·중간 목표·달력 선 표시를 확인하기 위한 예시입니다.",
      startDate,
      endDate,
      status: "active",
      calendarColor: DEFAULT_PLAN_COLOR,
      milestones: [
        { id: 1, title: "[예시] 중간 목표 확인", description: "중간 목표 기능을 보여주는 예시입니다.", date: toISODate(addDays(today, 14)), completed: false }
      ],
      linkedScheduleIds: [],
      linkedTodoIds: [],
      tags: ["예시"],
      createdAt: new Date().toISOString()
    }, 0)].filter(Boolean);
  }

  // 저장 데이터 값 검증
  function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const date = fromISODate(value);
    return !Number.isNaN(date.getTime()) && toISODate(date) === value;
  }

  function isValidTimeString(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  }

  function isValidMonthString(value) {
    const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return false;
    const year = Number(match[1]);
    return year >= 1000 && year <= 9999;
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : fallback;
  }

  // 일정·할 일·프로젝트 정규화
  function normalizeStoredTask(task, index) {
    if (!task || typeof task !== "object" || !String(task.title || "").trim()) return null;
    const validStatuses = Object.keys(statusMeta);
    const validPriorities = Object.keys(priorityMeta);
    const startDate = isValidDateString(task.startDate) ? String(task.startDate) : isValidDateString(task.date) ? String(task.date) : toISODate(today);
    const endDate = isValidDateString(task.endDate) && String(task.endDate) >= startDate ? String(task.endDate) : startDate;
    const allDay = task.allDay !== false;
    const subtasks = Array.isArray(task.subtasks)
      ? task.subtasks.slice(0, 30).map((item) => ({ title: String(item?.title || "").slice(0, 120), done: Boolean(item?.done) })).filter((item) => item.title)
      : [];
    return {
      id: Number.isFinite(Number(task.id)) ? Number(task.id) : Date.now() + index,
      entityType: "schedule",
      title: String(task.title).trim().slice(0, 100),
      status: validStatuses.includes(task.status) ? task.status : "scheduled",
      startDate,
      endDate,
      allDay,
      startTime: !allDay && isValidTimeString(task.startTime) ? String(task.startTime) : null,
      endTime: !allDay && isValidTimeString(task.endTime) ? String(task.endTime) : null,
      calendarColor: normalizeColor(task.calendarColor, DEFAULT_SCHEDULE_COLOR),
      planId: Number.isFinite(Number(task.planId)) ? Number(task.planId) : null,
      date: startDate,
      duration: String(task.duration || "1시간").slice(0, 40),
      priority: validPriorities.includes(task.priority) ? task.priority : "medium",
      difficulty: ["높음", "보통", "낮음"].includes(task.difficulty) ? task.difficulty : "보통",
      tags: Array.isArray(task.tags) ? task.tags.slice(0, 10).map((tag) => String(tag).trim().slice(0, 30)).filter(Boolean) : [],
      description: String(task.description || "추가 설명이 없습니다.").slice(0, 2000),
      subtasks,
      createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
      ...(task.completedAt && typeof task.completedAt === "string" ? { completedAt: String(task.completedAt) } : {})
    };
  }

  function normalizeTodo(todo, index) {
    if (!todo || typeof todo !== "object" || !String(todo.title || "").trim()) return null;
    const completed = Boolean(todo.completed);
    return {
      id: Number.isFinite(Number(todo.id)) ? Number(todo.id) : Date.now() + index,
      entityType: "todo",
      title: String(todo.title).trim().slice(0, 120),
      description: String(todo.description || "").slice(0, 2000),
      completed,
      priority: Object.keys(priorityMeta).includes(todo.priority) ? todo.priority : "medium",
      dueDate: isValidDateString(todo.dueDate) ? String(todo.dueDate) : null,
      dueTime: isValidTimeString(todo.dueTime) ? String(todo.dueTime) : null,
      tags: Array.isArray(todo.tags) ? todo.tags.slice(0, 10).map((tag) => String(tag).trim().slice(0, 30)).filter(Boolean) : [],
      planId: Number.isFinite(Number(todo.planId)) ? Number(todo.planId) : null,
      calendarColor: normalizeColor(todo.calendarColor, "#F59E0B"),
      createdAt: typeof todo.createdAt === "string" ? todo.createdAt : new Date().toISOString(),
      completedAt: completed ? (typeof todo.completedAt === "string" ? todo.completedAt : new Date().toISOString()) : null
    };
  }

  function normalizeMilestone(milestone, index, fallbackDate) {
    if (!milestone || typeof milestone !== "object" || !String(milestone.title || "").trim()) return null;
    return {
      id: Number.isFinite(Number(milestone.id)) ? Number(milestone.id) : Date.now() + index,
      title: String(milestone.title).trim().slice(0, 120),
      date: isValidDateString(milestone.date) ? String(milestone.date) : fallbackDate,
      completed: Boolean(milestone.completed),
      description: String(milestone.description || "").slice(0, 1000)
    };
  }

  function normalizePlan(plan, index) {
    if (!plan || typeof plan !== "object" || !String(plan.title || "").trim()) return null;
    const startDate = isValidDateString(plan.startDate) ? String(plan.startDate) : toISODate(today);
    const endDate = isValidDateString(plan.endDate) && String(plan.endDate) >= startDate ? String(plan.endDate) : startDate;
    const validStatuses = ["draft", "active", "paused", "completed"];
    return {
      id: Number.isFinite(Number(plan.id)) ? Number(plan.id) : Date.now() + index,
      entityType: "project",
      title: String(plan.title).trim().slice(0, 120),
      goal: String(plan.goal || plan.description || "").slice(0, 1000),
      description: String(plan.description || "").slice(0, 3000),
      startDate,
      endDate,
      status: validStatuses.includes(plan.status) ? plan.status : "active",
      calendarColor: normalizeColor(plan.calendarColor, DEFAULT_PLAN_COLOR),
      milestones: Array.isArray(plan.milestones) ? plan.milestones.map((item, itemIndex) => normalizeMilestone(item, itemIndex, endDate)).filter(Boolean) : [],
      linkedScheduleIds: Array.isArray(plan.linkedScheduleIds) ? plan.linkedScheduleIds.map(Number).filter(Number.isFinite) : [],
      linkedTodoIds: Array.isArray(plan.linkedTodoIds) ? plan.linkedTodoIds.map(Number).filter(Number.isFinite) : [],
      checklist: Array.isArray(plan.checklist) ? plan.checklist.slice(0, 50).map((item) => ({ title: String(item?.title || item || "").slice(0, 120), done: Boolean(item?.done) })).filter((item) => item.title) : [],
      priority: Object.keys(priorityMeta).includes(plan.priority) ? plan.priority : "medium",
      tags: Array.isArray(plan.tags) ? plan.tags.slice(0, 10).map((tag) => String(tag).trim().slice(0, 30)).filter(Boolean) : [],
      parentProjectId: Number.isFinite(Number(plan.parentProjectId)) ? Number(plan.parentProjectId) : null,
      legacySource: plan.legacySource || null,
      createdAt: typeof plan.createdAt === "string" ? plan.createdAt : new Date().toISOString()
    };
  }

  // 저장 형식 정규화와 이전 호환
  function normalizeAppData(value) {
    if (!value || typeof value !== "object") throw new Error("저장 데이터 형식이 올바르지 않습니다.");
    const scheduleSource = Array.isArray(value.schedules) ? value.schedules : Array.isArray(value.tasks) ? value.tasks : null;
    if (!scheduleSource) throw new Error("일정 목록이 없는 저장 데이터입니다.");
    const sourceVersion = Number(value.version) || 1;
    const rawProjects = Array.isArray(value.projects) ? value.projects : Array.isArray(value.plans) ? value.plans : [];
    const normalizedProjects = rawProjects.map(normalizePlan).filter(Boolean);
    const legacyRanges = sourceVersion < 3 ? scheduleSource.filter((item) => {
      const start = item?.startDate || item?.date;
      return isValidDateString(start) && isValidDateString(item?.endDate) && item.endDate > start;
    }) : [];
    let projectId = Math.max(0, ...normalizedProjects.map((item) => Number(item.id) || 0));
    const rangeProjects = legacyRanges.map((item, index) => normalizePlan({
      id: ++projectId,
      title: item.title,
      goal: item.description,
      description: item.description,
      startDate: item.startDate || item.date,
      endDate: item.endDate,
      status: item.status === "completed" ? "completed" : item.status === "paused" ? "paused" : "active",
      calendarColor: item.calendarColor,
      priority: item.priority,
      tags: item.tags,
      checklist: item.subtasks,
      milestones: [],
      legacySource: { type: "range-schedule", id: item.id },
      createdAt: item.createdAt
    }, index)).filter(Boolean);
    const schedules = (sourceVersion < 3 ? scheduleSource.filter((item) => !legacyRanges.includes(item)) : scheduleSource).map(normalizeStoredTask).filter(Boolean);
    const preferences = value.preferences && typeof value.preferences === "object" ? value.preferences : {};
    const apiSettings = value.apiSettings && typeof value.apiSettings === "object" ? value.apiSettings : {};
    const provider = SUPPORTED_API_PROVIDERS.includes(apiSettings.provider) ? apiSettings.provider : "mock";
    const providerMeta = API_PROVIDERS[provider];
    return {
      version: APP_DATA_VERSION,
      profile: {
        displayName: String(value.profile?.displayName || value.userName || DEFAULT_PROFILE_NAME).trim().slice(0, 30) || DEFAULT_PROFILE_NAME
      },
      schedules,
      todos: Array.isArray(value.todos) ? value.todos.map(normalizeTodo).filter(Boolean) : [],
      projects: [...normalizedProjects, ...rangeProjects],
      preferences: {
        dashboardHeadline: normalizeDashboardCopy(preferences.dashboardHeadline, DEFAULT_DASHBOARD_HEADLINE, 80),
        dashboardSubtitle: normalizeDashboardCopy(preferences.dashboardSubtitle, DEFAULT_DASHBOARD_SUBTITLE, 120),
        theme: ["light", "dark", "system"].includes(preferences.theme) ? preferences.theme : "light",
        reduceMotion: Boolean(preferences.reduceMotion),
        confirmBeforeDelete: preferences.confirmBeforeDelete !== false,
        startPage: ["dashboard", "tasks", "todos", "plans", "calendar"].includes(preferences.startPage) ? preferences.startPage : "dashboard",
        calendarView: ["month", "multi"].includes(preferences.calendarView) ? preferences.calendarView : Number(preferences.calendarMonths) > 1 ? "multi" : "month",
        lastAiMode: ["auto", "schedule", "todo", "project"].includes(preferences.lastAiMode) ? preferences.lastAiMode : "auto",
        calendarFilters: {
          schedules: preferences.calendarFilters?.schedules !== false,
          todos: preferences.calendarFilters?.todos !== false,
          milestones: preferences.calendarFilters?.milestones !== false,
          projects: preferences.calendarFilters?.projects !== false
        }
      },
      recentPrompts: Array.isArray(value.recentPrompts) ? value.recentPrompts.slice(0, 5).map((item) => String(item).slice(0, 200)) : [],
      apiSettings: {
        provider,
        endpoint: String(apiSettings.endpoint ?? providerMeta.endpoint).slice(0, 500),
        model: String(apiSettings.model || providerMeta.model).slice(0, 120),
        rememberApiKey: Boolean(apiSettings.rememberApiKey),
        timeout: Math.min(120, Math.max(5, Number(apiSettings.timeout) || 20))
      },
      apiProfiles: apiSettings.profiles && typeof apiSettings.profiles === "object" ? apiSettings.profiles : value.apiProfiles && typeof value.apiProfiles === "object" ? value.apiProfiles : {},
      lastSavedAt: typeof value.lastSavedAt === "string" ? value.lastSavedAt : null
    };
  }

  function normalizeDashboardCopy(value, fallback, maxLength) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().slice(0, maxLength);
    return normalized || fallback;
  }

  // 데이터 복원
  function loadStoredAppData() {
    try {
      const v3Raw = localStorage.getItem(APP_STORAGE_KEY);
      if (v3Raw) return normalizeAppData(JSON.parse(v3Raw));
      const v2Raw = localStorage.getItem(V2_STORAGE_KEY);
      if (v2Raw) {
        const migrated = normalizeAppData(JSON.parse(v2Raw));
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(migrated));
        migratedLegacyData = true;
        return migrated;
      }
      const v1Raw = localStorage.getItem(V1_STORAGE_KEY);
      if (!v1Raw) return null;
      const migrated = normalizeAppData(JSON.parse(v1Raw));
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(migrated));
      migratedLegacyData = true;
      return migrated;
    } catch (error) {
      console.warn("저장된 앱 데이터를 복원하지 못해 기본값을 사용합니다.");
      return null;
    }
  }

  // 공급자별 API 키 보관
  function readApiKeyMap(storage, storageKey, fallbackProvider) {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch (error) {
        // 이전 단일 키를 현재 공급자 키로 이전
      }
      return { [fallbackProvider || "openai-compatible"]: raw };
    } catch (error) {
      return {};
    }
  }

  function loadSessionApiSettings() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(API_PROFILE_SESSION_KEY) || "null");
      if (!parsed || !SUPPORTED_API_PROVIDERS.includes(parsed.provider)) return {};
      return {
        provider: parsed.provider,
        endpoint: String(parsed.endpoint || API_PROVIDERS[parsed.provider].endpoint).slice(0, 500),
        model: String(parsed.model || API_PROVIDERS[parsed.provider].model).slice(0, 120),
        timeout: Math.min(120, Math.max(5, Number(parsed.timeout) || 20)),
        rememberApiKey: false
      };
    } catch (error) {
      return {};
    }
  }

  function writeApiKeyMap(storage, storageKey, map) {
    const cleaned = Object.fromEntries(Object.entries(map).filter(([provider, value]) => SUPPORTED_API_PROVIDERS.includes(provider) && typeof value === "string" && value));
    if (Object.keys(cleaned).length) storage.setItem(storageKey, JSON.stringify(cleaned));
    else storage.removeItem(storageKey);
  }

  function getApiKeyRecord(provider) {
    const selectedProvider = provider || state.apiSettings.provider;
    try {
      const fallbackProvider = state.apiSettings.provider || "openai-compatible";
      const sessionMap = readApiKeyMap(sessionStorage, API_KEY_SESSION_KEY, fallbackProvider);
      const localMap = readApiKeyMap(localStorage, API_KEY_LOCAL_KEY, fallbackProvider);
      if (sessionMap[selectedProvider]) return { value: sessionMap[selectedProvider], remember: false };
      if (localMap[selectedProvider]) return { value: localMap[selectedProvider], remember: true };
      return { value: "", remember: false };
    } catch (error) {
      return { value: "", remember: false };
    }
  }

  function getApiKey(provider) {
    return getApiKeyRecord(provider).value;
  }

  // 앱 상태 자동 저장
  function persistAppData(options) {
    const config = options || {};
    state.lastSavedAt = new Date().toISOString();
    const payload = {
      version: APP_DATA_VERSION,
      profile: state.profile,
      schedules: state.schedules,
      todos: state.todos,
      projects: state.projects,
      preferences: { dashboardHeadline: state.dashboardHeadline, dashboardSubtitle: state.dashboardSubtitle, theme: state.theme, reduceMotion: state.reduceMotion, confirmBeforeDelete: state.confirmBeforeDelete, startPage: state.startPage, calendarView: state.calendarView, lastAiMode: state.generation.mode, calendarFilters: state.calendarFilters },
      recentPrompts: state.recentPrompts,
      apiSettings: { ...(state.apiSettings.rememberApiKey ? state.apiSettings : defaultApiSettings), profiles: state.apiProfiles },
      lastSavedAt: state.lastSavedAt
    };
    try {
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      if (!config.silent) showToast("브라우저 저장 공간이 부족하여 변경 내용을 저장하지 못했습니다.");
      return false;
    }
  }

  function saveApiKey(value, remember, provider) {
    try {
      const selectedProvider = provider || state.apiSettings.provider;
      if (selectedProvider === "mock") return;
      const fallbackProvider = state.apiSettings.provider || selectedProvider;
      const localMap = readApiKeyMap(localStorage, API_KEY_LOCAL_KEY, fallbackProvider);
      const sessionMap = readApiKeyMap(sessionStorage, API_KEY_SESSION_KEY, fallbackProvider);
      if (remember) {
        if (value) localMap[selectedProvider] = value;
        else delete localMap[selectedProvider];
        delete sessionMap[selectedProvider];
      } else {
        if (value) sessionMap[selectedProvider] = value;
        else delete sessionMap[selectedProvider];
        delete localMap[selectedProvider];
      }
      writeApiKeyMap(localStorage, API_KEY_LOCAL_KEY, localMap);
      writeApiKeyMap(sessionStorage, API_KEY_SESSION_KEY, sessionMap);
    } catch (error) {
      showToast("API 키를 브라우저 저장소에 보관하지 못했습니다.");
    }
  }

  function addRecentPrompt(prompt) {
    const value = String(prompt || "").trim();
    if (!value) return;
    state.recentPrompts = [value, ...state.recentPrompts.filter((item) => item !== value)].slice(0, 5);
    persistAppData({ silent: true });
  }

  // 백업 데이터 적용과 키 초기화
  function applyImportedData(data) {
    const normalized = normalizeAppData(data);
    state.schedules = normalized.schedules;
    state.todos = normalized.todos;
    state.projects = normalized.projects;
    state.profile = normalized.profile;
    state.dashboardHeadline = normalized.preferences.dashboardHeadline;
    state.dashboardSubtitle = normalized.preferences.dashboardSubtitle;
    state.theme = normalized.preferences.theme;
    state.reduceMotion = normalized.preferences.reduceMotion;
    state.confirmBeforeDelete = normalized.preferences.confirmBeforeDelete;
    state.startPage = normalized.preferences.startPage;
    state.calendarView = normalized.preferences.calendarView;
    state.calendarMonths = state.calendarView === "multi" ? 13 : 1;
    state.calendarFilters = normalized.preferences.calendarFilters;
    state.recentPrompts = normalized.recentPrompts;
    state.apiSettings = { ...defaultApiSettings, ...normalized.apiSettings, rememberApiKey: false };
    state.apiProfiles = normalized.apiProfiles || {};
    state.lastSavedAt = normalized.lastSavedAt;
    localStorage.removeItem(API_KEY_LOCAL_KEY);
    sessionStorage.removeItem(API_KEY_SESSION_KEY);
    sessionStorage.removeItem(API_PROFILE_SESSION_KEY);
    persistAppData();
    applyTheme();
  }

  // 안전한 HTML 출력과 표시 도우미
  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function selected(value, current) {
    return value === current ? " selected" : "";
  }

  function checked(value) {
    return value ? " checked" : "";
  }

  function formatDate(value, options) {
    const date = typeof value === "string" ? fromISODate(value) : value;
    return new Intl.DateTimeFormat("ko-KR", options || { month: "long", day: "numeric", weekday: "short" }).format(date);
  }

  function formatFullDate(date) {
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
  }

  function scheduleDateLabel(schedule, full) {
    const dateOptions = full ? { year: "numeric", month: "long", day: "numeric", weekday: "short" } : { month: "long", day: "numeric", weekday: "short" };
    const start = formatDate(schedule.startDate || schedule.date, dateOptions);
    const end = schedule.endDate || schedule.startDate || schedule.date;
    const range = end !== (schedule.startDate || schedule.date) ? `${start} – ${formatDate(end, dateOptions)}` : start;
    if (schedule.allDay !== false || !schedule.startTime) return `${range} · 종일`;
    return `${range} · ${escapeHTML(schedule.startTime)}${schedule.endTime ? `–${escapeHTML(schedule.endTime)}` : ""}`;
  }

  function dateInRange(iso, start, end) {
    return iso >= start && iso <= end;
  }

  function nextId(items) {
    return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
  }

  function planProgress(plan) {
    if (!plan.milestones.length) return plan.status === "completed" ? 100 : 0;
    return Math.round(plan.milestones.filter((item) => item.completed).length / plan.milestones.length * 100);
  }

  function effectiveStatus(task) {
    if (["completed", "cancelled"].includes(task.status)) return task.status;
    if (fromISODate(task.endDate || task.startDate || task.date) < today) return "overdue";
    return task.status;
  }

  function taskProgress(task) {
    if (task.status === "completed") return 100;
    if (!task.subtasks.length) return 0;
    return Math.round((task.subtasks.filter((item) => item.done).length / task.subtasks.length) * 100);
  }

  function progressClass(value) {
    const allowed = [0, 25, 33, 50, 67, 75, 100];
    return allowed.reduce((best, current) => Math.abs(current - value) < Math.abs(best - value) ? current : best, 0);
  }

  function statusBadge(task) {
    const status = effectiveStatus(task);
    const meta = statusMeta[status];
    return `<span class="status-badge status-${status}"><span aria-hidden="true">${meta.icon}</span>${meta.label}</span>`;
  }

  function priorityBadge(task) {
    const meta = priorityMeta[task.priority];
    return `<span class="priority-badge"><span aria-hidden="true">${meta.icon}</span>중요도 ${meta.label}</span>`;
  }

  function announce(message) {
    liveRegion.textContent = "";
    window.setTimeout(() => { liveRegion.textContent = message; }, 20);
  }

  let toastTimer = null;
  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    announce(message);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function applyTheme() {
    const resolved = state.theme === "system" ? (systemTheme.matches ? "dark" : "light") : state.theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.toggle("reduce-motion", state.reduceMotion);
    const label = document.querySelector(".theme-label");
    if (label) label.textContent = resolved === "dark" ? "라이트 모드" : "다크 모드";
  }

  function updateProfileDisplay() {
    const name = String(state.profile?.displayName || DEFAULT_PROFILE_NAME).trim() || DEFAULT_PROFILE_NAME;
    const initials = Array.from(name).slice(0, 2).join("").toUpperCase();
    document.querySelectorAll("[data-profile-name]").forEach((element) => { element.textContent = name; });
    document.querySelectorAll("[data-profile-display] .avatar, [data-profile-avatar]").forEach((element) => { element.textContent = initials; });
  }

  // 해시 라우팅과 화면 렌더링
  function parseRoute() {
    const raw = window.location.hash.slice(1) || state.startPage || "dashboard";
    const queryIndex = raw.indexOf("?");
    const route = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
    const params = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : "");
    if (!routeTitles[route]) return { route: "error", params };
    return { route, params };
  }

  function render() {
    const parsed = parseRoute();
    state.route = parsed.route;
    if (state.route === "task-detail") {
      state.selectedTaskId = Number(parsed.params.get("id")) || state.selectedTaskId || state.tasks[0]?.id;
    }
    if (state.route === "plan-detail") {
      state.selectedPlanId = Number(parsed.params.get("id")) || state.selectedPlanId || state.plans[0]?.id;
    }

    updateNavigation();
    const renderers = {
      dashboard: renderDashboard,
      tasks: renderTasks,
      todos: renderTodos,
      plans: renderPlans,
      calendar: renderCalendar,
      completed: renderCompleted,
      settings: renderSettings,
      "task-detail": renderTaskDetail,
      "plan-detail": renderPlanDetail,
      error: renderErrorPage
    };
    main.innerHTML = renderers[state.route]();
    document.title = `${routeTitles[state.route] || "페이지 오류"} · AutoAiPlanner`;
    updateProfileDisplay();
    if (state.route === "calendar" && state.calendarView === "multi") window.requestAnimationFrame(setupMultiMonthTrack);
    if (state.route === "settings" && state.apiSettings.provider === "openrouter") window.requestAnimationFrame(() => loadOpenRouterModels(false));
    if (state.route === "settings" && state.apiSettings.provider === "groq") window.requestAnimationFrame(() => loadGroqModels(false));
  }

  function updateNavigation() {
    const activeRoute = state.route === "task-detail" ? "tasks" : state.route === "plan-detail" ? "plans" : state.route;
    document.querySelectorAll("[data-route-link]").forEach((link) => {
      const isActive = link.dataset.routeLink === activeRoute;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    topbarTitle.textContent = routeTitles[state.route] || "페이지 오류";
  }

  function pageHeading(title, description, actionHTML, kicker, headingId) {
    const resolvedHeadingId = headingId || "page-title";
    return `<header class="page-heading">
      <div>
        ${kicker ? `<p class="date-kicker">${escapeHTML(kicker)}</p>` : ""}
        <h1 id="${escapeHTML(resolvedHeadingId)}">${escapeHTML(title)}</h1>
        <p>${escapeHTML(description)}</p>
      </div>
      ${actionHTML || ""}
    </header>`;
  }

  // 대시보드와 AI 입력 렌더링
  function renderDashboard() {
    const activeTasks = state.tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
    const todayTasks = activeTasks.filter((task) => task.date === toISODate(today));
    const urgent = activeTasks.filter((task) => {
      const diff = Math.round((fromISODate(task.date) - today) / 86400000);
      return diff <= 3;
    });
    const completed = state.tasks.filter((task) => task.status === "completed").length;
    const completionRate = state.tasks.length ? Math.round((completed / state.tasks.length) * 100) : 0;
    const priorities = activeTasks
      .slice()
      .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority] || a.date.localeCompare(b.date)))
      .slice(0, 4);
    const recent = state.tasks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    const todayTodos = state.todos.filter((item) => !item.completed && (!item.dueDate || item.dueDate <= toISODate(today))).slice(0, 4);

    return `<section class="page" aria-labelledby="dashboard-title">
      ${pageHeading(state.dashboardHeadline, state.dashboardSubtitle, `<button class="button button-secondary button-small dashboard-copy-button" type="button" data-action="edit-dashboard-copy">문구 수정</button>`, formatFullDate(today), "dashboard-title")}
      ${renderComposer()}
      <div class="summary-grid" aria-label="일정 요약">
        <article class="card summary-card">
          <span class="summary-icon" aria-hidden="true"><i class="summary-icon-glyph clock"></i></span>
          <div><span>오늘 일정</span><strong>${todayTasks.length}개</strong><small>집중할 일정</small></div>
        </article>
        <article class="card summary-card warning">
          <span class="summary-icon" aria-hidden="true"><i class="summary-icon-glyph alert"></i></span>
          <div><span>마감 임박</span><strong>${urgent.length}개</strong><small>확인이 필요해요</small></div>
        </article>
        <article class="card summary-card success">
          <span class="summary-icon" aria-hidden="true"><i class="summary-icon-glyph check"></i></span>
          <div><span>완료율</span><strong>${completionRate}%</strong><small>${completed}개 완료</small></div>
        </article>
      </div>
      <section class="card section-card quick-todo-card" aria-labelledby="quick-todo-heading">
        <div class="section-heading"><div><h2 id="quick-todo-heading">오늘의 할 일</h2><p>떠오른 할 일을 바로 적고, 필요하면 일정으로 바꿀 수 있어요.</p></div><a class="text-button" href="#todos">전체 보기 →</a></div>
        <form id="quick-todo-form" class="quick-add-row"><label class="sr-only" for="quick-todo-input">할 일 빠른 추가</label><input id="quick-todo-input" name="title" maxlength="120" placeholder="할 일을 입력하고 Enter"><button class="button button-primary" type="submit">추가</button></form>
        <div class="compact-todo-list">${todayTodos.length ? todayTodos.map(renderTodoRow).join("") : `<p class="muted-copy">오늘 바로 처리할 할 일이 없습니다.</p>`}</div>
      </section>
      <div class="dashboard-grid">
        <section class="card section-card" aria-labelledby="priority-heading">
          <div class="section-heading"><div><h2 id="priority-heading">우선순위 일정</h2><p>먼저 확인하면 좋은 일정이에요.</p></div><a class="text-button" href="#tasks">전체 보기 →</a></div>
          ${priorities.length ? `<div class="task-list">${priorities.map(renderTaskRow).join("")}</div>` : renderEmpty("✓", "진행할 일정이 없어요", "새로운 일정을 만들어 하루를 계획해 보세요.", "일정 추가", "open-add")}
        </section>
        <section class="card section-card" aria-labelledby="mini-calendar-heading">
          <div class="section-heading"><h2 id="mini-calendar-heading">미니 달력</h2><a class="text-button" href="#calendar">달력 열기 →</a></div>
          ${renderCalendarGrid(new Date(today.getFullYear(), today.getMonth(), 1), true)}
        </section>
      </div>
      <section class="card section-card recent-section" aria-labelledby="recent-heading">
        <div class="section-heading"><div><h2 id="recent-heading">최근 생성 일정</h2><p>가장 최근에 추가한 일정입니다.</p></div></div>
        <div class="task-list">${recent.map(renderTaskRow).join("")}</div>
      </section>
    </section>`;
  }

  function renderComposer() {
    const generation = state.generation;
    const apiConnected = state.apiSettings.provider !== "mock" && Boolean(getApiKey());
    const promptExamples = state.recentPrompts.length
      ? state.recentPrompts
      : ["금요일까지 주간 보고서 작성", "이번 주말 제주 여행 준비 일정 만들어줘", "매일 저녁 30분씩 영어 공부 계획"];
    return `<section class="hero-composer" aria-labelledby="composer-title">
      ${!apiConnected ? `<div class="ai-connection-hint"><span aria-hidden="true">i</span><div><strong>현재 체험 모드를 사용하고 있어요</strong><p>실제 AI 모델로 계획을 만들려면 AI 서비스를 연결하세요. 작성 중인 문장은 그대로 유지됩니다.</p></div><button class="button button-secondary button-small" type="button" data-action="go-api-settings">AI 연결 설정</button></div>` : ""}
      <form id="ai-form">
        <label class="composer-label" for="ai-input" id="composer-title"><span class="ai-spark" aria-hidden="true">✦</span>무엇을 계획하고 싶나요?</label>
        <fieldset class="ai-mode-picker"><legend>만들 항목</legend>${[["auto","자동"],["schedule","일정"],["todo","할 일"],["project","프로젝트"]].map(([value,label]) => `<label><input type="radio" name="aiMode" value="${value}"${checked(generation.mode === value)}><span>${label}</span></label>`).join("")}</fieldset>
        <div class="composer-row">
          <textarea id="ai-input" name="prompt" ${generation.status === "loading" ? "disabled" : ""} placeholder="예: 다음 주 금요일까지 마케팅 발표 자료 준비하고, 자료 조사와 슬라이드 작성으로 나눠줘">${escapeHTML(generation.input)}</textarea>
          <button class="button button-primary" type="submit" ${!generation.input.trim() || generation.status === "loading" ? "disabled" : ""}><span aria-hidden="true">✦</span>AI로 만들기</button>
        </div>
        <div class="composer-secondary-actions"><button class="button button-secondary button-small" type="button" data-action="open-detail-planner">✦ AI로 계획 구체화</button><span>목표를 중간 목표·일정·할 일로 먼저 나눠봅니다.</span></div>
      </form>
      ${generation.status === "idle" ? `<div class="recent-prompts"><span>${state.recentPrompts.length ? "최근 사용" : "입력 예시"}</span>${promptExamples.map((prompt) => `<button class="recent-chip" type="button" data-action="use-prompt" data-prompt="${escapeHTML(prompt)}">${escapeHTML(prompt.length > 24 ? `${prompt.slice(0, 24)}…` : prompt)}</button>`).join("")}</div>` : ""}
      ${renderGenerationState()}
    </section>`;
  }

  function renderGenerationState() {
    const generation = state.generation;
    if (generation.status === "idle") return "";
    if (generation.status === "loading") {
      const steps = ["요청 유형을 분류하고 있습니다.", "날짜와 구조를 정리하는 중입니다.", "저장 전 미리보기를 준비하고 있습니다."];
      return `<div class="generation-panel" role="status" aria-live="polite">
        <div class="generation-status">
          <span class="spinner" aria-hidden="true"></span>
          <div class="generation-copy"><strong>${steps[generation.step]}</strong><span>${state.apiSettings.provider === "mock" ? "체험 모드가 응답을 준비하고 있어요." : `${escapeHTML(state.apiSettings.model || "선택한 모델")}에 안전하게 요청하고 있어요.`}</span><div class="step-dots" aria-hidden="true">${steps.map((_, index) => `<i class="${index <= generation.step ? "active" : ""}"></i>`).join("")}</div></div>
          <button class="button button-secondary button-small" type="button" data-action="cancel-generation">취소</button>
        </div>
        <div class="skeleton-card" aria-hidden="true"><span class="skeleton-line"></span><span class="skeleton-line"></span><span class="skeleton-line"></span></div>
      </div>`;
    }
    if (generation.status === "success") {
      const task = state.tasks.find((item) => item.id === generation.newTaskId);
      return `<div class="generation-panel"><div class="generation-result"><span class="result-icon" aria-hidden="true">✓</span><div class="result-body"><strong>${generation.previewType === "schedule" ? "일정" : generation.previewType === "todo" ? "할 일" : generation.previewType === "plan" ? "프로젝트" : "중간 목표"}을 저장했어요</strong><p>${task ? `“${escapeHTML(task.title)}” 일정을 ${formatDate(task.date)}에 추가했습니다.` : "AI 생성 결과를 로컬에 저장했습니다."}</p><div class="result-actions">${task ? `<button class="button button-primary button-small" type="button" data-action="view-generated">일정 보기</button><button class="button button-secondary button-small" type="button" data-action="edit-generated">수정</button>` : `<button class="button button-primary button-small" type="button" data-action="view-generated-entity">결과 보기</button>`}<button class="button button-quiet button-small" type="button" data-action="regenerate">다시 생성</button></div></div></div></div>`;
    }
    if (generation.status === "preview") {
      return `<div class="generation-panel"><div class="generation-result"><span class="result-icon" aria-hidden="true">⌕</span><div class="result-body"><strong>저장 전에 생성 내용을 확인해 주세요</strong><p>AI가 분류한 ${generation.previewType || "항목"}은 아직 저장되지 않았습니다.</p><div class="result-actions"><button class="button button-primary button-small" type="button" data-action="reopen-create-preview">미리보기 열기</button><button class="button button-secondary button-small" type="button" data-action="direct-entry">직접 일정 입력</button></div></div></div></div>`;
    }
    return `<div class="generation-panel"><div class="generation-result error"><span class="result-icon" aria-hidden="true">!</span><div class="result-body"><strong>일정을 만들지 못했어요</strong><p>${escapeHTML(generation.errorMessage || "입력 내용을 분석하는 중 문제가 발생했습니다. 내용은 그대로 유지했어요.")}</p><div class="result-actions"><button class="button button-primary button-small" type="button" data-action="retry-generation">다시 시도</button>${generation.errorCode === "settings" ? `<button class="button button-secondary button-small" type="button" data-action="go-api-settings">API 설정</button>` : ""}<button class="button button-secondary button-small" type="button" data-action="direct-entry">직접 일정 입력</button></div></div></div></div>`;
  }

  function renderTaskRow(task) {
    const progress = taskProgress(task);
    const pClass = progressClass(progress);
    return `<article class="task-row">
      <span class="priority-bar ${task.priority}" aria-hidden="true"></span>
      <div class="task-main">
        <div class="task-title-line"><strong>${escapeHTML(task.title)}</strong>${statusBadge(task)}</div>
        <div class="task-meta"><span class="color-key"><i style="--item-color:${task.calendarColor}" aria-hidden="true"></i>${scheduleDateLabel(task)}</span><span>◷ ${escapeHTML(task.duration)}</span><span>${priorityMeta[task.priority].icon} 중요도 ${priorityMeta[task.priority].label}</span></div>
      </div>
      <button class="progress-ring progress-${pClass}" type="button" data-action="view-task" data-id="${task.id}" data-label="${progress}%" aria-label="${escapeHTML(task.title)} 상세 보기, 진행률 ${progress}%"></button>
    </article>`;
  }

  // 일정 목록과 검색 결과 렌더링
  function renderTasks() {
    return `<section class="page" aria-labelledby="tasks-heading">
      ${pageHeading("일정 목록", "검색과 필터로 필요한 일정을 빠르게 찾아보세요.", `<button class="button button-primary" type="button" data-action="open-add"><span aria-hidden="true">＋</span><span class="mobile-hide">일정 추가</span></button>`, "", "tasks-heading")}
      <section class="card toolbar-card" aria-label="일정 검색과 필터">
        <div class="search-field"><span aria-hidden="true">⌕</span><label class="sr-only" for="task-search">일정 검색</label><input id="task-search" type="search" value="${escapeHTML(state.filters.search)}" placeholder="일정 또는 태그 검색"></div>
        <div class="field desktop-filter"><label class="sr-only" for="status-filter">상태</label><select id="status-filter"><option value="all"${selected("all", state.filters.status)}>모든 상태</option>${Object.entries(statusMeta).map(([value, meta]) => `<option value="${value}"${selected(value, state.filters.status)}>${meta.label}</option>`).join("")}</select></div>
        <div class="field desktop-filter"><label class="sr-only" for="priority-filter">중요도</label><select id="priority-filter"><option value="all"${selected("all", state.filters.priority)}>모든 중요도</option><option value="high"${selected("high", state.filters.priority)}>높음</option><option value="medium"${selected("medium", state.filters.priority)}>보통</option><option value="low"${selected("low", state.filters.priority)}>낮음</option></select></div>
        <div class="field desktop-filter"><label class="sr-only" for="date-filter">날짜 범위</label><select id="date-filter"><option value="all"${selected("all", state.filters.date)}>전체 기간</option><option value="today"${selected("today", state.filters.date)}>오늘</option><option value="week"${selected("week", state.filters.date)}>7일 이내</option><option value="overdue"${selected("overdue", state.filters.date)}>마감 초과</option></select></div>
        <div class="field desktop-filter sort-field"><label class="sr-only" for="sort-filter">정렬</label><select id="sort-filter"><option value="date"${selected("date", state.filters.sort)}>마감일순</option><option value="priority"${selected("priority", state.filters.sort)}>중요도순</option><option value="recent"${selected("recent", state.filters.sort)}>최근 생성순</option></select></div>
        <button class="button button-secondary mobile-filter-button" type="button" data-action="open-filter"><span aria-hidden="true">≡</span>필터</button>
      </section>
      <div id="task-results">${renderTaskResultsMarkup()}</div>
    </section>`;
  }

  function getFilteredTasks() {
    const query = state.filters.search.trim().toLowerCase();
    const tasks = state.tasks.filter((task) => {
      const matchesQuery = !query || task.title.toLowerCase().includes(query) || task.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesStatus = state.filters.status === "all" || effectiveStatus(task) === state.filters.status;
      const matchesPriority = state.filters.priority === "all" || task.priority === state.filters.priority;
      const matchesTag = state.filters.tag === "all" || task.tags.includes(state.filters.tag);
      let matchesDate = true;
      if (state.filters.date === "today") matchesDate = task.date === toISODate(today);
      if (state.filters.date === "week") {
        const diff = Math.round((fromISODate(task.date) - today) / 86400000);
        matchesDate = diff >= 0 && diff <= 7;
      }
      if (state.filters.date === "overdue") matchesDate = effectiveStatus(task) === "overdue";
      return matchesQuery && matchesStatus && matchesPriority && matchesTag && matchesDate;
    });

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (state.filters.sort === "priority") tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.date.localeCompare(b.date));
    if (state.filters.sort === "recent") tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (state.filters.sort === "date") tasks.sort((a, b) => a.date.localeCompare(b.date));
    return tasks;
  }

  function renderTaskResultsMarkup() {
    const tasks = getFilteredTasks();
    if (!tasks.length) {
      return renderEmpty("⌕", "조건에 맞는 일정이 없어요", "검색어나 필터를 바꾸면 더 많은 일정을 볼 수 있어요.", "필터 초기화", "clear-filters");
    }
    return `<div class="task-grid">${tasks.map(renderTaskCard).join("")}</div>`;
  }

  function refreshTaskResults() {
    const results = document.getElementById("task-results");
    if (results) results.innerHTML = renderTaskResultsMarkup();
  }

  function renderTaskCard(task) {
    const progress = taskProgress(task);
    const pClass = progressClass(progress);
    return `<article class="task-card ${task.status === "completed" ? "is-completed" : ""}">
      <div class="task-card-top"><div><div class="task-title-line"><h3>${escapeHTML(task.title)}</h3></div></div>${statusBadge(task)}</div>
      <div class="task-meta"><span class="color-key"><i style="--item-color:${task.calendarColor}" aria-hidden="true"></i>${scheduleDateLabel(task)}</span><span>◷ ${escapeHTML(task.duration)}</span><span>◆ 난이도 ${escapeHTML(task.difficulty)}</span></div>
      <div>${priorityBadge(task)}</div>
      <div class="tag-list">${task.tags.map((tag) => `<span class="tag">#${escapeHTML(tag)}</span>`).join("")}</div>
      <div class="task-progress"><div class="progress-copy"><span>하위 작업</span><span>${progress}%</span></div><div class="progress-track"><span class="width-${pClass}"></span></div></div>
      <div class="card-actions"><button class="button button-primary button-small" type="button" data-action="view-task" data-id="${task.id}">상세 보기</button>${task.status !== "completed" ? `<button class="button button-secondary button-small" type="button" data-action="complete-task" data-id="${task.id}">완료</button>` : ""}<button class="ghost-icon" type="button" data-action="edit-task" data-id="${task.id}" aria-label="${escapeHTML(task.title)} 수정">•••</button><button class="button button-danger button-small item-delete-button" type="button" data-action="delete-item" data-type="schedule" data-id="${task.id}" aria-label="${escapeHTML(task.title)} 일정 삭제">삭제</button></div>
    </article>`;
  }

  // 할 일과 프로젝트 렌더링
  function renderTodoRow(todo, options) {
    const context = options && typeof options === "object" ? options.context : "";
    const contextClass = context === "selected-day" ? " selected-day-todo" : "";
    const due = todo.dueDate ? `${formatDate(todo.dueDate)}${todo.dueTime ? ` ${escapeHTML(todo.dueTime)}` : ""}` : "날짜 없음";
    return `<article class="todo-row${contextClass} ${todo.completed ? "is-completed" : ""}">
      <label class="todo-check"><input type="checkbox" data-todo-toggle="${todo.id}"${checked(todo.completed)}><span class="sr-only">${escapeHTML(todo.title)} 완료 상태</span></label>
      <div class="todo-copy"><strong>${escapeHTML(todo.title)}</strong><span>${priorityMeta[todo.priority].icon} ${priorityMeta[todo.priority].label} · ${due}${todo.planId ? " · 프로젝트 연결" : ""}</span></div>
      <div class="todo-actions"><button class="ghost-icon" type="button" data-action="ai-edit-entity" data-type="todo" data-id="${todo.id}" title="AI로 수정" aria-label="${escapeHTML(todo.title)} AI로 수정">✦</button><button class="ghost-icon" type="button" data-action="convert-todo" data-id="${todo.id}" title="일정으로 전환" aria-label="${escapeHTML(todo.title)} 일정으로 전환">↗</button><button class="ghost-icon" type="button" data-action="edit-todo" data-id="${todo.id}" aria-label="${escapeHTML(todo.title)} 수정">•••</button><button class="ghost-icon item-delete-icon" type="button" data-action="delete-item" data-type="todo" data-id="${todo.id}" title="삭제" aria-label="${escapeHTML(todo.title)} 할 일 삭제">×</button></div>
    </article>`;
  }

  function getFilteredTodos() {
    const query = state.todoFilters.search.trim().toLowerCase();
    return state.todos.filter((todo) => {
      const matchesQuery = !query || todo.title.toLowerCase().includes(query) || todo.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesStatus = state.todoFilters.status === "all" || (state.todoFilters.status === "completed" ? todo.completed : !todo.completed);
      const matchesPriority = state.todoFilters.priority === "all" || todo.priority === state.todoFilters.priority;
      return matchesQuery && matchesStatus && matchesPriority;
    }).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  }

  function renderTodos() {
    const todos = getFilteredTodos();
    const activeCount = state.todos.filter((item) => !item.completed).length;
    const completedCount = state.todos.length - activeCount;
    return `<section class="page" aria-labelledby="todos-heading">
      ${pageHeading("할 일", "짧은 할 일을 빠르게 기록하고 필요한 항목만 일정으로 전환하세요.", `<button class="button button-primary" type="button" data-action="add-todo">＋ 할 일 추가</button>`, "", "todos-heading")}
      <section class="card todo-overview">
        <form id="quick-todo-form" class="quick-add-row"><label class="sr-only" for="todo-quick-input">할 일 빠른 추가</label><input id="todo-quick-input" name="title" maxlength="120" placeholder="할 일을 입력하고 Enter"><button class="button button-primary" type="submit">빠른 추가</button></form>
        <div class="todo-stats"><span><strong>${activeCount}</strong> 진행 중</span><span><strong>${completedCount}</strong> 완료</span></div>
      </section>
      <section class="card toolbar-card" aria-label="할 일 검색과 필터">
        <div class="search-field"><span aria-hidden="true">⌕</span><label class="sr-only" for="todo-search">할 일 검색</label><input id="todo-search" type="search" value="${escapeHTML(state.todoFilters.search)}" placeholder="할 일 또는 태그 검색"></div>
        <div class="field"><label class="sr-only" for="todo-status-filter">상태</label><select id="todo-status-filter"><option value="all"${selected("all", state.todoFilters.status)}>모든 상태</option><option value="active"${selected("active", state.todoFilters.status)}>진행 중</option><option value="completed"${selected("completed", state.todoFilters.status)}>완료</option></select></div>
        <div class="field"><label class="sr-only" for="todo-priority-filter">중요도</label><select id="todo-priority-filter"><option value="all"${selected("all", state.todoFilters.priority)}>모든 중요도</option><option value="high"${selected("high", state.todoFilters.priority)}>높음</option><option value="medium"${selected("medium", state.todoFilters.priority)}>보통</option><option value="low"${selected("low", state.todoFilters.priority)}>낮음</option></select></div>
        ${completedCount ? `<button class="button button-danger button-small" type="button" data-action="ask-clear-todos">완료 항목 삭제</button>` : ""}
      </section>
      <section class="card section-card"><div id="todo-results" class="todo-list">${todos.length ? todos.map(renderTodoRow).join("") : renderEmpty("☑", "조건에 맞는 할 일이 없어요", "새 할 일을 추가하거나 필터를 바꿔 보세요.", "할 일 추가", "add-todo")}</div></section>
    </section>`;
  }

  function renderPlanCard(plan) {
    const progress = planProgress(plan);
    return `<article class="card plan-card" style="--plan-color:${plan.calendarColor}">
      <div class="plan-card-head"><span class="plan-color-line" aria-hidden="true"></span><span class="status-badge status-${plan.status === "completed" ? "completed" : plan.status === "paused" ? "paused" : "progress"}">${plan.status === "completed" ? "완료" : plan.status === "paused" ? "보류" : plan.status === "draft" ? "초안" : "진행 중"}</span></div>
      <h3>${escapeHTML(plan.title)}</h3><p>${escapeHTML(plan.description || "설명이 없습니다.")}</p>
      <div class="plan-range">${formatDate(plan.startDate)} – ${formatDate(plan.endDate)}</div>
      <div class="task-progress"><div class="progress-copy"><span>중간 목표 ${plan.milestones.filter((item) => item.completed).length}/${plan.milestones.length}</span><span>${progress}%</span></div><div class="progress-track"><span style="width:${progress}%"></span></div></div>
      <div class="card-actions"><button class="button button-primary button-small" type="button" data-action="view-plan" data-id="${plan.id}">프로젝트 보기</button><button class="button button-secondary button-small" type="button" data-action="edit-plan" data-id="${plan.id}" aria-label="${escapeHTML(plan.title)} 프로젝트 이름 수정">수정</button><button class="button button-quiet button-small" type="button" data-action="detail-project" data-id="${plan.id}">✦ AI로 구체화</button><button class="button button-danger button-small item-delete-button" type="button" data-action="delete-item" data-type="project" data-id="${plan.id}" aria-label="${escapeHTML(plan.title)} 프로젝트 삭제">삭제</button></div>
    </article>`;
  }

  function renderPlans() {
    return `<section class="page" aria-labelledby="plans-heading">
      ${pageHeading("프로젝트", "주·월 단위 목표를 기간 선과 중간 목표로 관리하세요.", `<button class="button button-primary" type="button" data-action="add-plan">＋ 프로젝트</button>`, "", "plans-heading")}
      ${state.plans.length ? `<div class="plan-grid">${state.plans.slice().sort((a, b) => a.endDate.localeCompare(b.endDate)).map(renderPlanCard).join("")}</div>` : renderEmpty("◇", "아직 프로젝트가 없어요", "시작일과 종료일을 정하고 중간 목표를 추가해 보세요.", "첫 프로젝트 만들기", "add-plan")}
    </section>`;
  }

  function renderPlanDetail() {
    const plan = state.plans.find((item) => item.id === state.selectedPlanId);
    if (!plan) return renderErrorPage("요청한 프로젝트를 찾을 수 없습니다.");
    const linkedSchedules = state.schedules.filter((item) => item.planId === plan.id || plan.linkedScheduleIds.includes(item.id));
    const linkedTodos = state.todos.filter((item) => item.planId === plan.id || plan.linkedTodoIds.includes(item.id));
    const progress = planProgress(plan);
    return `<section class="page">
      <button class="text-button detail-back" type="button" data-action="go-plans">← 프로젝트로</button>
      <article class="card detail-card plan-detail" style="--plan-color:${plan.calendarColor}">
        <header class="detail-hero"><span class="plan-color-line" aria-hidden="true"></span><div class="detail-hero-top"><div><span class="status-badge status-progress">${progress}% 진행</span><h1>${escapeHTML(plan.title)}</h1><div class="detail-meta"><span>${formatDate(plan.startDate, { year: "numeric", month: "long", day: "numeric" })} – ${formatDate(plan.endDate, { year: "numeric", month: "long", day: "numeric" })}</span></div></div><div class="detail-actions-inline"><button class="button button-primary button-small" type="button" data-action="add-milestone" data-id="${plan.id}">중간 목표 추가</button><button class="button button-secondary button-small" type="button" data-action="detail-project" data-id="${plan.id}">✦ AI로 계획 구체화</button><button class="button button-secondary button-small" type="button" data-action="ai-edit-entity" data-type="plan" data-id="${plan.id}">✦ AI로 수정</button><button class="button button-secondary button-small" type="button" data-action="edit-plan" data-id="${plan.id}" aria-label="${escapeHTML(plan.title)} 프로젝트 이름 수정">직접 수정</button></div></div></header>
        <div class="detail-body"><div>
          <section class="detail-section"><h2>계획 설명</h2><p class="detail-description">${escapeHTML(plan.description || "추가 설명이 없습니다.")}</p></section>
          <section class="detail-section"><div class="section-heading"><h2>중간 목표</h2><span>${plan.milestones.length}개</span></div><div class="milestone-list">${plan.milestones.length ? plan.milestones.slice().sort((a, b) => a.date.localeCompare(b.date)).map((milestone) => `<article class="milestone-row ${milestone.completed ? "is-completed" : ""}"><label><input type="checkbox" data-milestone-toggle="${milestone.id}" data-plan-id="${plan.id}"${checked(milestone.completed)}><span><strong>${escapeHTML(milestone.title)}</strong><small>${formatDate(milestone.date)}</small></span></label><div><button class="ghost-icon" type="button" data-action="ai-edit-entity" data-type="milestone" data-id="${milestone.id}" data-plan-id="${plan.id}" aria-label="${escapeHTML(milestone.title)} AI로 수정">✦</button><button class="ghost-icon" type="button" data-action="edit-milestone" data-id="${milestone.id}" data-plan-id="${plan.id}" aria-label="${escapeHTML(milestone.title)} 중간 목표 이름 수정">•••</button></div></article>`).join("") : `<p class="muted-copy">등록된 중간 목표가 없습니다.</p>`}</div></section>
        </div><aside>
          <section class="detail-section"><h2>연결된 일정</h2>${linkedSchedules.length ? `<div class="linked-list">${linkedSchedules.map((item) => `<button type="button" data-action="view-task" data-id="${item.id}">${escapeHTML(item.title)}<small>${scheduleDateLabel(item)}</small></button>`).join("")}</div>` : `<p class="muted-copy">연결된 일정이 없습니다.</p>`}</section>
          <section class="detail-section"><h2>연결된 할 일</h2>${linkedTodos.length ? `<div class="compact-todo-list">${linkedTodos.map(renderTodoRow).join("")}</div>` : `<p class="muted-copy">연결된 할 일이 없습니다.</p>`}</section>
          <div class="detail-actions"><button class="button button-secondary" type="button" data-action="add-linked-schedule" data-id="${plan.id}">연결 일정 추가</button><button class="button button-secondary" type="button" data-action="add-linked-todo" data-id="${plan.id}">연결 할 일 추가</button><button class="button button-danger" type="button" data-action="delete-plan" data-id="${plan.id}">프로젝트 삭제</button></div>
        </aside></div>
      </article>
    </section>`;
  }

  // 달력 이동과 한 달·여러 달 렌더링
  function moveCalendarMonth(amount) {
    const offset = Number(amount) || 0;
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + offset, 1);
    if (state.calendarView === "multi") {
      state.multiMonthStart = new Date(state.multiMonthStart.getFullYear(), state.multiMonthStart.getMonth() + offset, 1);
    }
    render();
  }

  function goToCalendarMonth(value) {
    if (!isValidMonthString(value)) return false;
    const [year, month] = value.split("-").map(Number);
    const target = new Date(year, month - 1, 1);
    state.calendarDate = target;
    state.selectedDate = toISODate(target);
    if (state.calendarView === "multi") state.multiMonthStart = new Date(year, month - 7, 1);
    persistAppData({ silent: true });
    closeModal();
    render();
    announce(`${year}년 ${month}월로 이동했습니다.`);
    return true;
  }

  function renderCalendar() {
    const isMulti = state.calendarView === "multi";
    const trackStart = state.multiMonthStart;
    const trackMonths = Array.from({ length: 13 }, (_, index) => new Date(trackStart.getFullYear(), trackStart.getMonth() + index, 1));
    const periodLabel = `${state.calendarDate.getFullYear()}년 ${state.calendarDate.getMonth() + 1}월`;
    return `<section class="page" aria-labelledby="calendar-heading">
      ${pageHeading("달력", "일정은 점으로, 프로젝트는 이어지는 얇은 선으로 확인하세요.", `<button class="button button-secondary" type="button" data-action="calendar-today">오늘</button>`, "", "calendar-heading")}
      <section class="card calendar-control-card" aria-label="달력 보기 설정">
        <div class="calendar-period-nav"><button type="button" data-action="calendar-prev" aria-label="이전 달 보기">‹</button><button type="button" class="calendar-period-button" data-action="open-month-picker" aria-label="이동할 연도와 월 선택, 현재 ${periodLabel}">${periodLabel}</button><button type="button" data-action="calendar-next" aria-label="다음 달 보기">›</button></div>
        <div class="segmented-control" aria-label="달력 보기 방식"><button type="button" data-action="calendar-view" data-view="month" class="${!isMulti ? "active" : ""}" aria-pressed="${!isMulti}">한 달 보기</button><button type="button" data-action="calendar-view" data-view="multi" class="${isMulti ? "active" : ""}" aria-pressed="${isMulti}">여러 달 보기</button></div>
        <div class="calendar-filter-checks"><label><input type="checkbox" data-calendar-filter="schedules"${checked(state.calendarFilters.schedules)}>일정</label><label><input type="checkbox" data-calendar-filter="todos"${checked(state.calendarFilters.todos)}>할 일</label><label><input type="checkbox" data-calendar-filter="milestones"${checked(state.calendarFilters.milestones)}>중간 목표</label><label><input type="checkbox" data-calendar-filter="projects"${checked(state.calendarFilters.projects)}>프로젝트</label></div>
        <div class="calendar-legend"><span><i class="legend-dot" aria-hidden="true"></i>일정</span><span><i class="legend-line plan" aria-hidden="true"></i>프로젝트</span><span><i class="legend-symbol" aria-hidden="true">◆</i>할 일</span><span><i class="legend-symbol" aria-hidden="true">★</i>중간 목표</span></div>
      </section>
      <div class="multi-calendar-layout"><section id="multi-month-track" class="multi-month-grid ${isMulti ? "is-multi" : "is-single"}" aria-label="${isMulti ? "계속 스크롤할 수 있는 여러 달 달력" : "한 달 달력"}" tabindex="${isMulti ? "0" : "-1"}" data-start="${trackMonths[0] ? `${trackMonths[0].getFullYear()}-${trackMonths[0].getMonth()}` : ""}" data-end="${trackMonths.at(-1) ? `${trackMonths.at(-1).getFullYear()}-${trackMonths.at(-1).getMonth()}` : ""}">${isMulti ? trackMonths.map((date) => renderMonthPanel(date, true)).join("") : renderMonthPanel(state.calendarDate, false)}</section><aside class="card selected-day-panel" aria-label="선택한 날짜의 항목">${renderSelectedDay()}</aside></div>
    </section>`;
  }

  function renderCalendarGrid(baseDate, mini) {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = addDays(first, -first.getDay());
    const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    const currentISO = toISODate(today);
    const selectedDate = mini ? currentISO : state.selectedDate;
    const className = mini ? "mini-calendar" : "full-calendar";
    const actionPrefix = mini ? "mini-" : "calendar-";

    return `<div class="${className}">
      <div class="calendar-toolbar"><h${mini ? "3" : "2"}>${year}년 ${month + 1}월</h${mini ? "3" : "2"}><div class="calendar-nav"><button type="button" data-action="${actionPrefix}prev" aria-label="이전 달">‹</button><button type="button" data-action="${actionPrefix}next" aria-label="다음 달">›</button></div></div>
      <div class="calendar-weekdays" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div class="calendar-days">${days.map((date) => {
        const iso = toISODate(date);
        const tasks = state.tasks.filter((task) => dateInRange(iso, task.startDate, task.endDate));
        const classes = ["calendar-day", date.getMonth() !== month ? "outside" : "", iso === currentISO ? "today" : "", iso === selectedDate ? "selected" : ""].filter(Boolean).join(" ");
        return `<button type="button" class="${classes}" data-action="${mini ? "select-mini-date" : "select-date"}" data-date="${iso}" aria-label="${formatDate(date, { month: "long", day: "numeric" })}${iso === currentISO ? ", 오늘" : ""}${tasks.length ? `, 일정 ${tasks.length}개` : ""}"><span>${date.getDate()}</span>${tasks.length ? `<span class="calendar-dots" aria-hidden="true">${tasks.slice(0, 3).map((task) => `<i style="--item-color:${task.calendarColor}"></i>`).join("")}</span>` : ""}</button>`;
      }).join("")}</div>
    </div>`;
  }

  function renderRangeSegment(item, iso, kind) {
    const start = item.startDate;
    const end = item.endDate;
    const edge = iso === start && iso === end ? "single" : iso === start ? "range-start" : iso === end ? "range-end" : "range-middle";
    const action = kind === "plan" ? "view-plan" : "view-task";
    const label = kind === "plan" ? `프로젝트: ${item.title}` : `일정: ${item.title}`;
    return `<button type="button" class="calendar-range-segment ${kind} ${edge}" style="--item-color:${item.calendarColor}" data-action="${action}" data-id="${item.id}" title="${escapeHTML(label)}"><span aria-hidden="true">${kind !== "plan" && (iso === start || fromISODate(iso).getDay() === 0) ? escapeHTML(item.title) : ""}</span><span class="sr-only">${escapeHTML(label)}, ${formatDate(start)}부터 ${formatDate(end)}까지</span></button>`;
  }

  function getCalendarItemsForDate(iso) {
    return {
      singleSchedules: state.calendarFilters.schedules ? state.schedules.filter((item) => item.startDate === iso && item.endDate === iso) : [],
      rangedSchedules: state.calendarFilters.schedules ? state.schedules.filter((item) => item.startDate < item.endDate && dateInRange(iso, item.startDate, item.endDate)) : [],
      plans: state.calendarFilters.projects ? state.plans.filter((item) => dateInRange(iso, item.startDate, item.endDate)) : [],
      todos: state.calendarFilters.todos ? state.todos.filter((item) => !item.completed && item.dueDate === iso) : [],
      milestones: state.calendarFilters.milestones ? state.plans.flatMap((plan) => plan.milestones.filter((item) => item.date === iso).map((item) => ({ ...item, planId: plan.id, planTitle: plan.title, color: plan.calendarColor }))) : []
    };
  }

  function limitCalendarItemsForCell(items, compact) {
    const count = items.singleSchedules.length + items.rangedSchedules.length + items.plans.length + items.todos.length + items.milestones.length;
    if (count < 9) return { ...items, count, hiddenCount: 0 };
    let budget = compact ? 5 : 8;
    const take = (collection, limit) => {
      const size = Math.min(collection.length, limit, budget);
      budget -= size;
      return collection.slice(0, size);
    };
    const visible = {
      plans: take(items.plans, compact ? 2 : 3),
      singleSchedules: take(items.singleSchedules, 3),
      rangedSchedules: take(items.rangedSchedules, 2),
      todos: take(items.todos, 2),
      milestones: take(items.milestones, 2)
    };
    const visibleCount = Object.values(visible).reduce((sum, collection) => sum + collection.length, 0);
    return { ...visible, count, hiddenCount: count - visibleCount };
  }

  function renderMonthPanel(baseDate, compact) {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = addDays(first, -first.getDay());
    const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    const currentISO = toISODate(today);
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    return `<section class="card month-panel ${compact ? "compact-month" : "full-month"}" aria-labelledby="month-${year}-${month}" data-month-key="${monthKey}">
      ${compact ? "" : `<button type="button" class="month-card-nav month-card-nav-prev" data-action="calendar-prev" aria-label="이전 달 보기">‹</button><button type="button" class="month-card-nav month-card-nav-next" data-action="calendar-next" aria-label="다음 달 보기">›</button>`}
      <h2 id="month-${year}-${month}">${compact ? `<button type="button" data-action="open-month" data-year="${year}" data-month="${month}" aria-label="${year}년 ${month + 1}월 한 달 보기">${year}년 ${month + 1}월</button>` : `${year}년 ${month + 1}월`}</h2>
      <div class="calendar-weekdays" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div class="calendar-days calendar-days-v2">${days.map((date) => {
        const iso = toISODate(date);
        const visible = limitCalendarItemsForCell(getCalendarItemsForDate(iso), compact);
        const { singleSchedules, rangedSchedules, plans, todos, milestones, count, hiddenCount } = visible;
        const classes = ["calendar-day-v2", date.getMonth() !== month ? "outside" : "", iso === currentISO ? "today" : "", iso === state.selectedDate ? "selected" : ""].filter(Boolean).join(" ");
        return `<div class="${classes}" data-action="select-date" data-date="${iso}"><button type="button" class="calendar-date-button" data-action="select-date" data-date="${iso}" aria-label="${formatDate(date, { month: "long", day: "numeric" })}${iso === currentISO ? ", 오늘" : ""}, 항목 ${count}개${hiddenCount ? `, 숨긴 항목 ${hiddenCount}개는 더보기 버튼에서 확인` : ""}"><span>${date.getDate()}</span></button><div class="calendar-items">
          ${singleSchedules.map((item) => `<button type="button" class="calendar-event-dot" style="--item-color:${item.calendarColor}" data-action="view-task" data-id="${item.id}" title="하루 일정: ${escapeHTML(item.title)}"><i aria-hidden="true"></i><span>${escapeHTML(item.title)}</span></button>`).join("")}
          ${rangedSchedules.map((item) => renderRangeSegment(item, iso, "schedule")).join("")}
          ${todos.map((item) => `<button type="button" class="calendar-symbol todo" data-action="edit-todo" data-id="${item.id}" title="할 일: ${escapeHTML(item.title)}">◆<span class="sr-only">할 일: ${escapeHTML(item.title)}</span></button>`).join("")}
          ${milestones.map((item) => `<button type="button" class="calendar-symbol milestone" style="--item-color:${item.color}" data-action="view-plan" data-id="${item.planId}" title="중간 목표: ${escapeHTML(item.title)}">★<span class="sr-only">중간 목표: ${escapeHTML(item.title)}</span></button>`).join("")}
          ${hiddenCount ? `<button type="button" class="calendar-more" data-action="open-calendar-day-items" data-date="${iso}" aria-label="숨긴 항목 ${hiddenCount}개 모두 보기">+${hiddenCount}</button>` : ""}
        </div><div class="calendar-project-lanes">${plans.map((item) => renderRangeSegment(item, iso, "plan")).join("")}</div></div>`;
      }).join("")}</div>
    </section>`;
  }

  function parseTrackMonth(value) {
    const [year, month] = String(value || "").split("-").map(Number);
    return Number.isFinite(year) && Number.isFinite(month) ? new Date(year, month, 1) : new Date(today.getFullYear(), today.getMonth(), 1);
  }

  // 연속 월 트랙 확장과 키보드 이동
  function extendMultiMonthTrack(track, direction) {
    if (!track || track.dataset.extending === "true") return;
    track.dataset.extending = "true";
    const batchSize = 6;
    if (direction < 0) {
      const start = parseTrackMonth(track.dataset.start);
      const months = Array.from({ length: batchSize }, (_, index) => new Date(start.getFullYear(), start.getMonth() - batchSize + index, 1));
      const beforeWidth = track.scrollWidth;
      track.insertAdjacentHTML("afterbegin", months.map((date) => renderMonthPanel(date, true)).join(""));
      const first = months[0];
      track.dataset.start = `${first.getFullYear()}-${first.getMonth()}`;
      track.scrollLeft += track.scrollWidth - beforeWidth;
    } else {
      const end = parseTrackMonth(track.dataset.end);
      const months = Array.from({ length: batchSize }, (_, index) => new Date(end.getFullYear(), end.getMonth() + index + 1, 1));
      track.insertAdjacentHTML("beforeend", months.map((date) => renderMonthPanel(date, true)).join(""));
      const last = months.at(-1);
      track.dataset.end = `${last.getFullYear()}-${last.getMonth()}`;
    }
    track.dataset.extending = "false";
  }

  function setupMultiMonthTrack() {
    const track = document.getElementById("multi-month-track");
    if (!track?.classList.contains("is-multi") || track.dataset.ready === "true") return;
    track.dataset.ready = "true";
    const currentKey = `${state.calendarDate.getFullYear()}-${String(state.calendarDate.getMonth() + 1).padStart(2, "0")}`;
    const currentPanel = track.querySelector(`[data-month-key="${currentKey}"]`);
    if (currentPanel) track.scrollLeft = Math.max(0, currentPanel.offsetLeft - (track.clientWidth - currentPanel.offsetWidth) / 2);
    let ticking = false;
    track.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        if (track.scrollLeft < track.clientWidth * 0.75) extendMultiMonthTrack(track, -1);
        if (track.scrollWidth - track.scrollLeft - track.clientWidth < track.clientWidth * 0.75) extendMultiMonthTrack(track, 1);
        ticking = false;
      });
    }, { passive: true });
    track.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        const panel = track.querySelector(`[data-month-key="${toISODate(today).slice(0, 7)}"]`);
        panel?.scrollIntoView({ behavior: state.reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
        return;
      }
      track.scrollBy({ left: (event.key === "ArrowLeft" ? -1 : 1) * Math.max(280, track.clientWidth * 0.7), behavior: state.reduceMotion ? "auto" : "smooth" });
    });
  }

  function renderSelectedDay() {
    const tasks = state.calendarFilters.schedules ? state.tasks.filter((task) => dateInRange(state.selectedDate, task.startDate, task.endDate)) : [];
    const todos = state.calendarFilters.todos ? state.todos.filter((item) => item.dueDate === state.selectedDate) : [];
    const plans = state.calendarFilters.projects ? state.plans.filter((item) => dateInRange(state.selectedDate, item.startDate, item.endDate)) : [];
    const milestones = state.calendarFilters.milestones ? state.plans.flatMap((plan) => plan.milestones.filter((item) => item.date === state.selectedDate).map((item) => ({ ...item, planId: plan.id, planTitle: plan.title }))) : [];
    const date = fromISODate(state.selectedDate);
    const total = tasks.length + todos.length + plans.length + milestones.length;
    return `<div class="selected-date-label"><strong>${formatDate(date, { month: "long", day: "numeric", weekday: "long" })}</strong><span>${total ? `항목 ${total}개가 있어요.` : "등록된 항목이 없어요."}</span></div>
      ${tasks.length ? `<div class="task-list">${tasks.map(renderTaskRow).join("")}</div>` : ""}
      ${todos.length ? `<div class="selected-section"><h3>할 일</h3>${todos.map((todo) => renderTodoRow(todo, { context: "selected-day" })).join("")}</div>` : ""}
      ${plans.length ? `<div class="selected-section"><h3>진행 중인 프로젝트</h3>${plans.map((item) => `<button class="linked-milestone" type="button" data-action="view-plan" data-id="${item.id}"><span class="color-key"><i style="--item-color:${item.calendarColor}"></i></span><strong>${escapeHTML(item.title)}</strong><small>${formatDate(item.startDate)} – ${formatDate(item.endDate)}</small></button>`).join("")}</div>` : ""}
      ${milestones.length ? `<div class="selected-section"><h3>중간 목표</h3>${milestones.map((item) => `<button class="linked-milestone" type="button" data-action="view-plan" data-id="${item.planId}"><span>★</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.planTitle)}</small></button>`).join("")}</div>` : ""}
      ${!total ? renderEmpty("＋", "비어 있는 하루예요", "이 날짜에 일정이나 할 일을 추가해 보세요.", "일정 추가", "open-add") : ""}`;
  }

  function renderTaskDetail() {
    const task = state.tasks.find((item) => item.id === state.selectedTaskId);
    if (!task) return renderErrorPage("요청한 일정을 찾을 수 없습니다.");
    const progress = taskProgress(task);
    return `<section class="page">
      <button class="text-button detail-back" type="button" data-action="go-back">← 일정 목록으로</button>
      <article class="card detail-card">
        <header class="detail-hero">
          <div class="detail-hero-top"><div><div>${statusBadge(task)} ${priorityBadge(task)}</div><h1>${escapeHTML(task.title)}</h1><div class="detail-meta"><span class="color-key"><i style="--item-color:${task.calendarColor}" aria-hidden="true"></i>${scheduleDateLabel(task, true)}</span><span>◷ 예상 ${escapeHTML(task.duration)}</span><span>◆ 난이도 ${escapeHTML(task.difficulty)}</span></div></div><div class="tag-list">${task.tags.map((tag) => `<span class="tag">#${escapeHTML(tag)}</span>`).join("")}</div></div>
        </header>
        <div class="detail-body">
          <div>
            <section class="detail-section"><h2>일정 설명</h2><p class="detail-description">${escapeHTML(task.description)}</p></section>
            <section class="detail-section"><div class="section-heading"><h2>하위 작업</h2><span class="status-badge status-progress">${progress}% 진행</span></div><div class="subtask-list">${task.subtasks.length ? task.subtasks.map((subtask, index) => `<label class="subtask-item ${subtask.done ? "done" : ""}"><input type="checkbox" data-subtask="${index}"${checked(subtask.done)}><span>${escapeHTML(subtask.title)}</span></label>`).join("") : "<p class=\"detail-description\">등록된 하위 작업이 없습니다.</p>"}</div></section>
          </div>
          <aside>
            <section class="detail-section"><h2>일정 정보</h2><dl class="facts-list"><div><dt>날짜와 시간</dt><dd>${scheduleDateLabel(task)}</dd></div><div><dt>예상 시간</dt><dd>${escapeHTML(task.duration)}</dd></div><div><dt>중요도</dt><dd>${priorityMeta[task.priority].label}</dd></div><div><dt>난이도</dt><dd>${escapeHTML(task.difficulty)}</dd></div><div><dt>진행률</dt><dd>${progress}%</dd></div></dl></section>
            <div class="field detail-status-select"><label for="detail-status">상태 변경</label><select id="detail-status">${Object.entries(statusMeta).map(([value, meta]) => `<option value="${value}"${selected(value, task.status)}>${meta.label}</option>`).join("")}</select></div>
            <div class="detail-actions"><button class="button button-primary" type="button" data-action="ai-edit-task" data-id="${task.id}"><span aria-hidden="true">✦</span>AI로 수정</button><button class="button button-secondary" type="button" data-action="edit-task" data-id="${task.id}">직접 수정</button>${task.status !== "completed" ? `<button class="button button-secondary" type="button" data-action="complete-task" data-id="${task.id}">완료 처리</button>` : `<button class="button button-secondary" type="button" data-action="restore-task" data-id="${task.id}">다시 진행</button>`}<button class="button button-danger" type="button" data-action="ask-delete" data-id="${task.id}">삭제</button></div>
          </aside>
        </div>
      </article>
    </section>`;
  }

  function renderCompleted() {
    const query = state.completedSearch.trim().toLowerCase();
    const tasks = state.tasks.filter((task) => task.status === "completed" && (!query || task.title.toLowerCase().includes(query) || task.tags.some((tag) => tag.toLowerCase().includes(query))));
    tasks.sort((a, b) => state.completedSort === "oldest" ? (a.completedAt || a.date).localeCompare(b.completedAt || b.date) : (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
    return `<section class="page" aria-labelledby="completed-heading">
      ${pageHeading("완료 일정", "완료한 기록을 돌아보고 꾸준한 흐름을 확인하세요.", "", "", "completed-heading")}
      <section class="card toolbar-card" aria-label="완료 일정 검색"><div class="search-field"><span aria-hidden="true">⌕</span><label class="sr-only" for="completed-search">완료 일정 검색</label><input id="completed-search" type="search" value="${escapeHTML(state.completedSearch)}" placeholder="완료 일정 검색"></div><div class="field desktop-filter"><label class="sr-only" for="completed-sort">완료 일정 정렬</label><select id="completed-sort"><option value="recent"${selected("recent", state.completedSort)}>최근 완료순</option><option value="oldest"${selected("oldest", state.completedSort)}>오래된 완료순</option></select></div></section>
      <div id="completed-results">${renderCompletedResults(tasks)}</div>
    </section>`;
  }

  function renderCompletedResults(tasks) {
    if (!tasks.length) return renderEmpty("✓", "완료한 일정이 없어요", "작은 일정 하나부터 완료하고 기록을 만들어 보세요.", "일정 목록 보기", "go-tasks");
    return `<div class="completed-list">${tasks.map((task) => `<article class="card completed-row"><span class="complete-check" aria-hidden="true">✓</span><div><h3>${escapeHTML(task.title)}</h3><p>${task.tags.map((tag) => `#${escapeHTML(tag)}`).join(" ")} · ${escapeHTML(task.duration)}</p></div><span class="completion-date">${formatDate(task.completedAt || task.date)} 완료</span><button class="button button-secondary button-small" type="button" data-action="view-task" data-id="${task.id}">상세 보기</button></article>`).join("")}</div>`;
  }

  function refreshCompletedResults() {
    const container = document.getElementById("completed-results");
    if (!container) return;
    const query = state.completedSearch.trim().toLowerCase();
    const tasks = state.tasks.filter((task) => task.status === "completed" && (!query || task.title.toLowerCase().includes(query) || task.tags.some((tag) => tag.toLowerCase().includes(query))));
    tasks.sort((a, b) => state.completedSort === "oldest" ? (a.completedAt || a.date).localeCompare(b.completedAt || b.date) : (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
    container.innerHTML = renderCompletedResults(tasks);
  }

  // 공급자 모델 목록과 설정 UI
  function isFreeOpenRouterModel(model) {
    const id = String(model?.id || "");
    const name = String(model?.name || "");
    return model?.free === true || id === "openrouter/free" || id.endsWith(":free") || name.includes("무료");
  }

  function getApiModelOptions(provider) {
    const defaults = {
      mock: [{ id: "mock-planner-v1", name: "체험 모드" }],
      gemini: [{ id: "gemini-3.5-flash", name: "Gemini Flash" }, { id: "gemini-2.5-pro", name: "Gemini Pro" }],
      groq: [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" }],
      openrouter: [
        { id: "openrouter/free", name: "무료 모델 자동 선택" }
      ],
      "openai-compatible": []
    };
    const loadedModels = provider === "openrouter"
      ? [...defaults.openrouter, ...state.openRouterModels]
      : provider === "groq"
        ? [...defaults.groq, ...state.groqModels]
        : defaults[provider] || [];
    const models = provider === "openrouter" ? loadedModels.filter(isFreeOpenRouterModel) : loadedModels;
    return [...new Map(models.map((model) => [model.id, model])).values()].slice(0, 180);
  }

  function renderApiModelOptions(provider, currentModel) {
    const models = getApiModelOptions(provider);
    const current = String(currentModel || "");
    const canShowCurrent = provider !== "openrouter" || isFreeOpenRouterModel({ id: current, name: current });
    if (current && canShowCurrent && !models.some((model) => model.id === current)) models.unshift({ id: current, name: `${current} · 현재 설정` });
    return `${models.map((model) => `<option value="${escapeHTML(model.id)}"${selected(model.id, current)}>${escapeHTML(model.name || model.id)}</option>`).join("")}<option value="__custom__"${selected("__custom__", models.some((model) => model.id === current) ? "" : "__custom__")}>직접 입력</option>`;
  }

  function refreshProviderModelControls() {
    const select = document.getElementById("api-model-preset");
    const input = document.getElementById("api-model");
    const customField = document.getElementById("api-model-custom-field");
    const provider = state.apiSettings.provider;
    if (!select || !input || !["openrouter", "groq"].includes(provider)) return;
    const current = String(input.value || state.apiSettings.model || API_PROVIDERS[provider].model);
    select.innerHTML = renderApiModelOptions(provider, current);
    select.value = getApiModelOptions(provider).some((model) => model.id === current) ? current : "__custom__";
    customField?.classList.toggle("is-hidden", select.value !== "__custom__");
    if (provider === "openrouter") updateOpenRouterCapabilityHint(select.value);
  }

  function openRouterModelSupportsStructuredOutput(modelId) {
    const model = getApiModelOptions("openrouter").find((item) => item.id === modelId);
    return Array.isArray(model?.supportedParameters) && model.supportedParameters.includes("structured_outputs");
  }

  function updateOpenRouterCapabilityHint(modelId) {
    const hint = document.getElementById("api-model-capability");
    if (!hint) return;
    if (modelId === "__custom__") {
      hint.textContent = "직접 입력한 모델은 구조화 출력 지원 여부를 확인할 수 없어 기본 JSON 모드와 앱 검증을 사용합니다.";
      return;
    }
    hint.textContent = openRouterModelSupportsStructuredOutput(modelId)
      ? "무료 모델 · JSON Schema 구조화 출력 지원"
      : "무료 모델 · 기본 JSON 모드와 앱 검증 사용";
  }

  function reconcileOpenRouterModelAvailability(models) {
    const currentModel = String(state.apiSettings.model || "");
    const availableIds = new Set(models.map((model) => String(model.id || "")));
    const isUnavailableFreeModel = state.apiSettings.provider === "openrouter"
      && currentModel !== "openrouter/free"
      && currentModel.endsWith(":free")
      && !availableIds.has(currentModel);
    if (!isUnavailableFreeModel) return null;

    state.apiSettings.model = "openrouter/free";
    if (state.apiProfiles.openrouter) state.apiProfiles.openrouter.model = "openrouter/free";
    const modelInput = document.getElementById("api-model");
    if (modelInput) modelInput.value = "openrouter/free";
    persistAppData({ silent: true });
    return currentModel;
  }

  async function loadOpenRouterModels(force) {
    if (state.openRouterModelsStatus === "loading" || (!force && state.openRouterModelsStatus === "success")) return;
    try {
      if (!force) {
        const cached = JSON.parse(localStorage.getItem(OPENROUTER_MODELS_CACHE_KEY) || "null");
        if (cached?.savedAt && Date.now() - Number(cached.savedAt) < 86400000 && Array.isArray(cached.models)) {
          state.openRouterModels = cached.models;
          state.openRouterModelsStatus = "success";
          const replacedModel = reconcileOpenRouterModelAvailability(state.openRouterModels);
          if (state.route === "settings") refreshProviderModelControls();
          if (replacedModel) showToast("종료된 무료 모델을 무료 모델 자동 선택으로 변경했습니다.");
          return;
        }
      }
    } catch (error) {
      // 손상된 캐시 무시 후 목록 재요청
    }
    state.openRouterModelsStatus = "loading";
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("OpenRouter 모델 목록을 불러오지 못했습니다.");
      const payload = await response.json();
      const models = Array.isArray(payload?.data) ? payload.data.filter((model) => {
        const promptPrice = Number(model?.pricing?.prompt);
        const completionPrice = Number(model?.pricing?.completion);
        return promptPrice === 0 && completionPrice === 0;
      }).map((model) => {
        const family = String(model?.id || "").startsWith("deepseek/") ? "DeepSeek" : String(model?.id || "").startsWith("google/gemini") ? "Gemini" : "OpenRouter";
        const supportedParameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters.map(String) : [];
        const schemaLabel = supportedParameters.includes("structured_outputs") ? " · JSON Schema" : "";
        return { id: String(model?.id || "").slice(0, 160), name: `${family} · ${String(model?.name || model?.id || "모델").slice(0, 100)} · 무료${schemaLabel}`, free: true, supportedParameters };
      }).filter((model) => model.id) : [];
      state.openRouterModels = [{ id: "openrouter/free", name: "무료 모델 자동 선택" }, ...models];
      state.openRouterModelsStatus = "success";
      const replacedModel = reconcileOpenRouterModelAvailability(state.openRouterModels);
      try { localStorage.setItem(OPENROUTER_MODELS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), models: state.openRouterModels })); } catch (error) { /* 캐시 저장 실패 시 현재 목록 유지 */ }
      if (state.route === "settings") refreshProviderModelControls();
      if (replacedModel) showToast("종료된 무료 모델을 무료 모델 자동 선택으로 변경했습니다.");
    } catch (error) {
      state.openRouterModelsStatus = "error";
      if (force) showToast("모델 목록을 불러오지 못했습니다. 모델 ID를 직접 입력할 수 있습니다.");
    }
  }

  function reconcileGroqModelAvailability(models) {
    if (state.apiSettings.provider !== "groq" || !models.length) return null;
    const currentModel = String(state.apiSettings.model || "");
    if (models.some((model) => model.id === currentModel)) return null;
    const fallback = models.find((model) => model.id === API_PROVIDERS.groq.model) || models[0];
    if (!fallback) return null;
    state.apiSettings.model = fallback.id;
    if (state.apiProfiles.groq) state.apiProfiles.groq.model = fallback.id;
    const modelInput = document.getElementById("api-model");
    if (modelInput) modelInput.value = fallback.id;
    persistAppData({ silent: true });
    return { previous: currentModel, next: fallback.id };
  }

  async function loadGroqModels(force) {
    if (state.groqModelsStatus === "loading" || (!force && state.groqModelsStatus === "success")) return;
    const apiKey = getApiKey("groq");
    if (!apiKey) return;
    state.groqModelsStatus = "loading";
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error("Groq 모델 목록을 불러오지 못했습니다.");
      const payload = await response.json();
      state.groqModels = Array.isArray(payload?.data)
        ? payload.data.map((model) => ({ id: String(model?.id || "").slice(0, 160), name: String(model?.id || "").slice(0, 160) })).filter((model) => model.id)
        : [];
      state.groqModelsStatus = "success";
      const replaced = reconcileGroqModelAvailability(state.groqModels);
      if (state.route === "settings") refreshProviderModelControls();
      if (replaced) showToast("종료된 Groq 모델을 현재 사용 가능한 모델로 변경했습니다.");
    } catch (error) {
      state.groqModelsStatus = "error";
      if (force) showToast("Groq 모델 목록을 불러오지 못했습니다. 모델 ID를 직접 입력할 수 있습니다.");
    }
  }

  function renderApiSettingsCard() {
    const providerMeta = API_PROVIDERS[state.apiSettings.provider] || API_PROVIDERS.mock;
    const isMockProvider = state.apiSettings.provider === "mock";
    const apiKeyRecord = getApiKeyRecord(state.apiSettings.provider);
    const apiKey = apiKeyRecord.value;
    const rememberApiKey = apiKey ? apiKeyRecord.remember : state.apiSettings.rememberApiKey;
    const apiStatusClass = state.apiTest.status === "success" ? "api-status-success" : state.apiTest.status === "error" ? "api-status-error" : state.apiTest.status === "loading" ? "api-status-loading" : "";
    const modelHint = state.apiSettings.provider === "openrouter"
      ? `<small class="field-help" id="api-model-capability">무료 모델만 표시하며 구조화 출력 지원 여부를 자동 확인합니다.</small>`
      : state.apiSettings.provider === "groq"
        ? `<small class="field-help">API 키를 입력하면 Groq에서 현재 사용 가능한 모델 목록을 불러옵니다.</small>`
        : "";
    return `<section class="card settings-card settings-wide" id="api-settings-card"><div class="settings-title-row"><div><div class="title-with-help"><h2>AI 연결</h2><button class="help-button" type="button" data-action="open-api-help" aria-label="AI API 발급 및 설정 도움말">?</button></div><p>Google Gemini, GroqCloud, OpenRouter 또는 사용자 지정 API를 선택할 수 있습니다.</p></div><span class="status-badge ${isMockProvider ? "status-progress" : "status-scheduled"}">${isMockProvider ? "✦ 체험 모드" : `● ${escapeHTML(providerMeta.label)}`}</span></div>
      <form id="api-settings-form" class="api-settings-form">
        <div class="form-grid">
          <div class="field"><label for="api-provider">AI 서비스</label><select id="api-provider" name="provider">${SUPPORTED_API_PROVIDERS.map((provider) => `<option value="${provider}"${selected(provider, state.apiSettings.provider)}>${escapeHTML(API_PROVIDERS[provider].optionLabel)}</option>`).join("")}</select></div>
          <div class="field"><label for="api-model-preset">모델 선택</label><select id="api-model-preset" name="modelPreset">${renderApiModelOptions(state.apiSettings.provider, state.apiSettings.model)}</select><div id="api-model-custom-field" class="field nested-field ${getApiModelOptions(state.apiSettings.provider).some((model) => model.id === state.apiSettings.model) ? "is-hidden" : ""}"><label for="api-model">모델 ID 직접 입력</label><input id="api-model" name="model" value="${escapeHTML(state.apiSettings.model)}" placeholder="예: 공급자/모델-이름"></div>${modelHint}</div>
        </div>
        <div class="field"><label for="api-endpoint">API 주소(엔드포인트)</label><div class="input-with-action"><input id="api-endpoint" name="endpoint" type="url" value="${escapeHTML(state.apiSettings.endpoint)}" placeholder="https://example.com/v1/chat/completions" ${isMockProvider ? "disabled" : ""}><button class="input-action" type="button" data-action="reset-api-endpoint" ${isMockProvider ? "disabled" : ""}>기본값</button></div><small class="field-help">${escapeHTML(providerMeta.endpointHelp)} 주소를 직접 수정할 수 있습니다.</small></div>
        <div class="form-grid">
          <div class="field"><label for="api-key">API 키</label><div class="input-with-action"><input id="api-key" name="apiKey" type="password" autocomplete="off" value="${escapeHTML(apiKey)}" placeholder="${escapeHTML(providerMeta.label)} API 키 입력" ${isMockProvider ? "disabled" : ""}><button class="input-action" type="button" data-action="toggle-api-key" aria-label="API 키 표시" ${isMockProvider ? "disabled" : ""}>보기</button></div></div>
          <div class="field"><label for="api-timeout">요청 제한 시간</label><select id="api-timeout" name="timeout"><option value="10"${selected(10, Number(state.apiSettings.timeout))}>10초</option><option value="20"${selected(20, Number(state.apiSettings.timeout))}>20초</option><option value="30"${selected(30, Number(state.apiSettings.timeout))}>30초</option><option value="60"${selected(60, Number(state.apiSettings.timeout))}>60초</option></select></div>
        </div>
        <label class="security-check"><input id="remember-api-key" name="rememberApiKey" type="checkbox"${checked(rememberApiKey)} ${isMockProvider ? "disabled" : ""}><span><strong>이 기기에 AI 연결 설정 저장</strong><small>AI 서비스·모델·API 주소·키를 서비스별로 저장합니다. 키는 암호화되지 않으므로 공용 기기에서는 끄세요.</small></span></label>
        <div class="api-actions"><button class="button button-secondary" type="button" data-action="test-api" ${state.apiTest.status === "loading" ? "disabled aria-busy=\"true\"" : ""}>${state.apiTest.status === "loading" ? "연결 확인 중…" : "연결 테스트"}</button>${state.apiTest.status === "loading" ? `<button class="button button-quiet" type="button" data-action="cancel-api-test">취소</button>` : ""}<button class="button button-primary" type="submit" data-action="submit-api-settings">설정 저장</button></div>
      </form>
      ${state.apiTest.message ? `<div class="api-status ${apiStatusClass}" role="${state.apiTest.status === "error" ? "alert" : "status"}" aria-live="${state.apiTest.status === "error" ? "assertive" : "polite"}"><span aria-hidden="true">${state.apiTest.status === "success" ? "✓" : state.apiTest.status === "error" ? "!" : "↻"}</span><div><strong>${escapeHTML(state.apiTest.message)}</strong>${state.apiTest.details ? `<details><summary>${state.apiTest.status === "error" ? "실패 원인과 해결 방법" : "세부 내용"}</summary><p>${escapeHTML(state.apiTest.details)}</p></details>` : ""}</div></div>` : ""}
    </section>`;
  }

  function refreshApiSettingsCard(focusId) {
    const card = document.getElementById("api-settings-card");
    if (!card) return;
    card.outerHTML = renderApiSettingsCard();
    if (state.apiSettings.provider === "openrouter") window.requestAnimationFrame(() => loadOpenRouterModels(false));
    if (state.apiSettings.provider === "groq") window.requestAnimationFrame(() => loadGroqModels(false));
    if (focusId) window.requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  }

  function renderSettings() {
    const lastSaved = state.lastSavedAt ? new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(state.lastSavedAt)) : "아직 저장되지 않음";
    return `<section class="page" aria-labelledby="settings-heading">
      ${pageHeading("설정", "내 환경에 맞게 화면과 사용 방식을 조정하세요.", "", "", "settings-heading")}
      <div class="settings-grid">
        <section class="card settings-card"><h2>사용자 이름</h2><p>사이드바와 상단에 표시할 이름을 바꿀 수 있습니다.</p><form id="profile-name-form" class="profile-name-form"><div class="field"><label for="profile-display-name">사용자 이름</label><input id="profile-display-name" name="displayName" required minlength="1" maxlength="30" value="${escapeHTML(state.profile.displayName)}"></div><div class="api-actions"><button class="button button-primary button-small" type="submit">이름 저장</button></div></form></section>
        <section class="card settings-card"><h2>화면 테마</h2><p>선택한 테마가 모든 화면에 즉시 적용됩니다.</p><fieldset><legend class="sr-only">테마 선택</legend><div class="theme-options">
          <label class="theme-option"><input type="radio" name="theme" value="light"${checked(state.theme === "light")}><span class="theme-preview"><span class="preview-bars"><i></i><i></i></span><strong>밝게</strong></span></label>
          <label class="theme-option"><input type="radio" name="theme" value="dark"${checked(state.theme === "dark")}><span class="theme-preview dark-preview"><span class="preview-bars"><i></i><i></i></span><strong>어둡게</strong></span></label>
          <label class="theme-option"><input type="radio" name="theme" value="system"${checked(state.theme === "system")}><span class="theme-preview system-preview"><span class="preview-bars"><i></i><i></i></span><strong>시스템</strong></span></label>
        </div></fieldset></section>
        <section class="card settings-card"><h2>접근성</h2><p>움직임을 줄이고 더 편안하게 사용할 수 있습니다.</p><div class="setting-row"><div><strong>모션 감소</strong><span>이동과 확대 효과를 최소화합니다.</span></div><label class="switch"><span class="sr-only">모션 감소</span><input id="reduce-motion" type="checkbox"${checked(state.reduceMotion)}><span class="switch-track"></span></label></div></section>
        <section class="card settings-card"><h2>삭제 설정</h2><p>개별 항목을 삭제할 때 확인 단계를 사용할지 선택합니다.</p><div class="setting-row"><div><strong>항목을 삭제하기 전에 확인하기</strong><span>끄면 일정, 할 일, 프로젝트의 삭제 버튼을 누르는 즉시 삭제됩니다.</span></div><label class="switch"><span class="sr-only">항목을 삭제하기 전에 확인하기</span><input id="confirm-before-delete" type="checkbox"${checked(state.confirmBeforeDelete)}><span class="switch-track"></span></label></div></section>
        <section class="card settings-card"><h2>시작 화면</h2><p>AutoAiPlanner를 열었을 때 가장 먼저 볼 화면입니다.</p><div class="field"><label for="start-page">기본 화면</label><select id="start-page"><option value="dashboard"${selected("dashboard", state.startPage)}>대시보드</option><option value="tasks"${selected("tasks", state.startPage)}>일정 목록</option><option value="todos"${selected("todos", state.startPage)}>할 일</option><option value="plans"${selected("plans", state.startPage)}>프로젝트</option><option value="calendar"${selected("calendar", state.startPage)}>달력</option></select></div></section>
        <section class="card settings-card"><h2>앱 상태</h2><p>v3 데이터와 설정은 이 브라우저에 자동 저장됩니다.</p><div class="setting-row"><div><strong>로컬 저장 v3</strong><span>서버 전송 없이 현재 기기에 저장</span></div><span class="status-badge status-completed">✓ 사용 중</span></div><div class="setting-row"><div><strong>저장된 항목</strong><span>마지막 저장 ${escapeHTML(lastSaved)}</span></div><strong>${state.tasks.length + state.todos.length + state.plans.length}개</strong></div></section>

        ${renderApiSettingsCard()}

        <section class="card settings-card settings-wide"><div class="settings-title-row"><div><h2>로컬 데이터 관리</h2><p>API 키를 제외한 일정·할 일·프로젝트와 설정을 v3 JSON 파일로 백업할 수 있습니다.</p></div><span class="status-badge status-completed">v3 · ${state.tasks.length + state.todos.length + state.plans.length}개</span></div><div class="data-actions"><button class="button button-secondary" type="button" data-action="export-data">백업 내보내기</button><button class="button button-secondary" type="button" data-action="import-data">백업 가져오기</button><button class="button button-quiet" type="button" data-action="ask-reset-data">예시 데이터 복원</button><button class="button button-danger" type="button" data-action="ask-clear-data">모든 데이터 삭제</button></div><input class="sr-only" id="backup-import" type="file" accept="application/json,.json"></section>
      </div>
    </section>`;
  }

  function renderErrorPage(message) {
    return `<section class="page">${renderEmpty("!", "페이지를 표시할 수 없어요", message || "요청한 주소가 올바르지 않습니다.", "대시보드로 이동", "go-dashboard")}</section>`;
  }

  function renderEmpty(icon, title, description, buttonLabel, action) {
    return `<div class="empty-state"><div class="empty-content"><span class="empty-icon" aria-hidden="true">${icon}</span><h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p>${buttonLabel ? `<button class="button button-primary" type="button" data-action="${action}">${escapeHTML(buttonLabel)}</button>` : ""}</div></div>`;
  }

  function validateApiSettings(settings, apiKey) {
    const errors = [];
    if (!settings || !SUPPORTED_API_PROVIDERS.includes(settings.provider)) errors.push("지원하는 AI 서비스를 선택해 주세요.");
    if (settings && settings.provider !== "mock") {
      const endpoint = getEffectiveApiEndpoint(settings);
      if (!endpoint) errors.push("API 주소(엔드포인트)를 입력해 주세요.");
      else {
        try {
          const url = new URL(endpoint);
          const localHost = ["localhost", "127.0.0.1"].includes(url.hostname);
          if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) errors.push("API 주소는 HTTPS 또는 로컬 개발 주소여야 합니다.");
        } catch (error) {
          errors.push("API 주소(엔드포인트)가 올바르지 않습니다.");
        }
      }
      if (!settings.model) errors.push("모델명을 입력해 주세요.");
      if (!apiKey) errors.push("API 키를 입력해 주세요.");
    }
    return { valid: errors.length === 0, errors };
  }

  function getEffectiveApiEndpoint(settings) {
    const meta = API_PROVIDERS[settings?.provider] || API_PROVIDERS["openai-compatible"];
    return String(meta.endpointLocked ? meta.endpoint : settings?.endpoint || "").replace(/\/+$/, "");
  }

  // 작업별 AI 응답 스키마
  const AI_SCHEMA_VERSION = 1;
  const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
  const TIME_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";
  const COLOR_PATTERN = "^#[0-9A-Fa-f]{6}$";

  function objectSchema(properties, required) {
    return { type: "object", properties, required: required || Object.keys(properties), additionalProperties: false };
  }

  const AI_ENTITY_DATA_SCHEMAS = {
    schedule: objectSchema({
      title: { type: "string", minLength: 1, maxLength: 100 },
      status: { type: "string", enum: ["scheduled", "progress", "completed", "paused", "cancelled", "overdue"] },
      startDate: { type: "string", pattern: DATE_PATTERN },
      endDate: { type: "string", pattern: DATE_PATTERN },
      allDay: { type: "boolean" },
      startTime: { type: ["string", "null"], pattern: TIME_PATTERN },
      endTime: { type: ["string", "null"], pattern: TIME_PATTERN },
      calendarColor: { type: "string", pattern: COLOR_PATTERN },
      planId: { type: ["integer", "null"] },
      duration: { type: "string", maxLength: 40 },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      difficulty: { type: "string", enum: ["높음", "보통", "낮음"] },
      tags: { type: "array", maxItems: 10, items: { type: "string", maxLength: 30 } },
      description: { type: "string", maxLength: 2000 },
      subtasks: { type: "array", maxItems: 30, items: objectSchema({ title: { type: "string", minLength: 1, maxLength: 120 }, done: { type: "boolean" } }) }
    }),
    todo: objectSchema({
      title: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", maxLength: 2000 },
      completed: { type: "boolean" },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      dueDate: { type: ["string", "null"], pattern: DATE_PATTERN },
      dueTime: { type: ["string", "null"], pattern: TIME_PATTERN },
      tags: { type: "array", maxItems: 10, items: { type: "string", maxLength: 30 } },
      planId: { type: ["integer", "null"] },
      calendarColor: { type: "string", pattern: COLOR_PATTERN }
    }),
    plan: objectSchema({
      title: { type: "string", minLength: 1, maxLength: 120 },
      goal: { type: "string", maxLength: 1000 },
      description: { type: "string", maxLength: 3000 },
      startDate: { type: "string", pattern: DATE_PATTERN },
      endDate: { type: "string", pattern: DATE_PATTERN },
      status: { type: "string", enum: ["draft", "active", "paused", "completed"] },
      calendarColor: { type: "string", pattern: COLOR_PATTERN },
      milestones: { type: "array", maxItems: 20, items: objectSchema({ title: { type: "string", minLength: 1, maxLength: 120 }, date: { type: "string", pattern: DATE_PATTERN }, completed: { type: "boolean" }, description: { type: "string", maxLength: 1000 } }) }
    }),
    milestone: objectSchema({
      title: { type: "string", minLength: 1, maxLength: 120 },
      date: { type: "string", pattern: DATE_PATTERN },
      completed: { type: "boolean" },
      description: { type: "string", maxLength: 1000 }
    })
  };

  function createEnvelopeSchema(entityTypes, action, targetId) {
    const types = entityTypes.length ? entityTypes : ["schedule", "todo", "plan", "milestone"];
    const dataSchema = types.length === 1 ? AI_ENTITY_DATA_SCHEMAS[types[0]] : { anyOf: types.map((type) => AI_ENTITY_DATA_SCHEMAS[type]) };
    return objectSchema({
      schemaVersion: { type: "integer", const: AI_SCHEMA_VERSION },
      entityType: { type: "string", enum: types },
      action: { type: "string", const: action },
      targetId: action === "create" ? { type: "null" } : { type: "integer", const: Number(targetId) },
      parentPlanId: { type: ["integer", "null"] },
      needsConfirmation: { type: "boolean" },
      confirmationMessage: { type: "string", maxLength: 500 },
      data: dataSchema
    });
  }

  function getCreateEnvelopeSchema(requestedType) {
    const normalizedType = requestedType === "project" ? "plan" : requestedType;
    const types = ["schedule", "todo", "plan"].includes(normalizedType) ? [normalizedType] : ["schedule", "todo", "plan", "milestone"];
    return createEnvelopeSchema(types, "create", null);
  }

  function getUpdateEnvelopeSchema(entityType, targetId) {
    return createEnvelopeSchema([entityType], "update", targetId);
  }

  const PROJECT_DETAIL_SCHEMA = objectSchema({
    title: { type: "string", minLength: 1, maxLength: 120 },
    goal: { type: "string", maxLength: 1000 },
    description: { type: "string", maxLength: 3000 },
    startDate: { type: "string", pattern: DATE_PATTERN },
    endDate: { type: "string", pattern: DATE_PATTERN },
    milestones: { type: "array", minItems: 3, maxItems: 6, items: objectSchema({ title: { type: "string", minLength: 1, maxLength: 120 }, date: { type: "string", pattern: DATE_PATTERN } }) },
    schedules: { type: "array", minItems: 3, maxItems: 6, items: objectSchema({ title: { type: "string", minLength: 1, maxLength: 100 }, startDate: { type: "string", pattern: DATE_PATTERN } }) },
    todos: { type: "array", minItems: 3, maxItems: 6, items: objectSchema({ title: { type: "string", minLength: 1, maxLength: 120 }, dueDate: { type: ["string", "null"], pattern: DATE_PATTERN } }) }
  });

  const CONNECTION_TEST_SCHEMA = objectSchema({ ok: { type: "boolean", const: true } });

  const AI_EDITABLE_FIELDS = {
    schedule: ["title", "status", "startDate", "endDate", "allDay", "startTime", "endTime", "calendarColor", "planId", "duration", "priority", "difficulty", "tags", "description", "subtasks"],
    todo: ["title", "description", "completed", "priority", "dueDate", "dueTime", "tags", "planId", "calendarColor"],
    plan: ["title", "goal", "description", "startDate", "endDate", "status", "calendarColor", "milestones"],
    milestone: ["title", "date", "completed", "description"]
  };

  function getEditableEntityData(entityType, entity) {
    const keys = AI_EDITABLE_FIELDS[entityType] || [];
    return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(entity || {}, key)).map((key) => [key, entity[key]]));
  }

  function aiSchemaSummary(schema) {
    return JSON.stringify(schema);
  }

  function buildCreateSchedulePrompt(userInput, requestedType) {
    const mode = ["schedule", "todo", "project"].includes(requestedType) ? requestedType : "auto";
    const forcedType = mode === "project" ? "plan" : mode;
    const modeInstruction = forcedType === "auto" ? "요청 내용을 보고 가장 알맞은 유형을 선택하세요." : `반드시 ${forcedType} 유형으로 생성하고 다른 유형으로 바꾸지 마세요.`;
    const schema = getCreateEnvelopeSchema(mode);
    return [
      {
        role: "system",
        content: `당신은 AutoAiPlanner의 요청 분류·구조화 도우미입니다. 기준 날짜는 ${toISODate(new Date())}, 시간대는 Asia/Seoul입니다. ${modeInstruction} 자동 모드에서는 schedule, todo, plan, milestone 중 하나로 분류하세요. milestone은 연결할 프로젝트가 있을 때만 선택하고 parentPlanId를 넣으세요. 상대 날짜를 YYYY-MM-DD로 바꾸고 시간이 없으면 null, 하루 일정이면 startDate와 endDate를 같게 하세요. allDay가 true면 startTime과 endTime은 null이어야 합니다. 정보가 부족하면 needsConfirmation을 true로 설정하세요. schemaVersion은 ${AI_SCHEMA_VERSION}입니다. Markdown이나 설명 없이 주어진 JSON Schema를 만족하는 JSON 하나만 반환하세요. JSON Schema: ${aiSchemaSummary(schema)}`
      },
      { role: "user", content: userInput }
    ];
  }

  function buildUpdateSchedulePrompt(existingTask, instruction) {
    const safeTask = {
      id: existingTask.id,
      title: existingTask.title,
      status: existingTask.status,
      startDate: existingTask.startDate,
      endDate: existingTask.endDate,
      allDay: existingTask.allDay,
      startTime: existingTask.startTime,
      endTime: existingTask.endTime,
      calendarColor: existingTask.calendarColor,
      planId: existingTask.planId,
      duration: existingTask.duration,
      priority: existingTask.priority,
      difficulty: existingTask.difficulty,
      tags: existingTask.tags,
      description: existingTask.description,
      subtasks: existingTask.subtasks
    };
    return [
      {
        role: "system",
        content: `당신은 기존 일정 수정 도우미입니다. 기준 날짜는 ${toISODate(new Date())}, 시간대는 Asia/Seoul입니다. 시스템 ID와 생성일은 변경하지 마세요. data에는 수정 후의 편집 가능한 전체 일정 데이터를 넣고, 요청하지 않은 값은 기존 값을 그대로 유지하세요. schemaVersion은 ${AI_SCHEMA_VERSION}입니다. Markdown이나 설명 없이 주어진 JSON Schema를 만족하는 JSON 하나만 반환하세요. JSON Schema: ${aiSchemaSummary(getUpdateEnvelopeSchema("schedule", existingTask.id))}`
      },
      { role: "user", content: `기존 일정: ${JSON.stringify(safeTask)}\n수정 요청: ${instruction}` }
    ];
  }

  function createApiError(code, message, details, status) {
    const error = new Error(message);
    error.code = code;
    error.details = details || "";
    error.status = status || 0;
    return error;
  }

  // 요청 취소와 시간 초과 처리
  function beginRequest(type, timeoutSeconds) {
    if (state.activeRequest) state.activeRequest.controller.abort();
    const request = { type, controller: new AbortController(), timedOut: false, cancelled: false, timeoutId: null };
    request.timeoutId = window.setTimeout(() => {
      request.timedOut = true;
      request.controller.abort();
    }, Math.max(5, Number(timeoutSeconds) || 20) * 1000);
    state.activeRequest = request;
    return request;
  }

  function finishRequest(request) {
    window.clearTimeout(request?.timeoutId);
    if (state.activeRequest === request) state.activeRequest = null;
  }

  function delayWithSignal(duration, signal) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, duration);
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
      }, { once: true });
    });
  }

  function inferMockDate(text) {
    if (text.includes("오늘")) return toISODate(today);
    if (text.includes("내일")) return toISODate(addDays(today, 1));
    if (text.includes("모레")) return toISODate(addDays(today, 2));
    if (text.includes("주말")) {
      const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
      return toISODate(addDays(today, daysUntilSaturday));
    }
    const weekdays = { 일요일: 0, 월요일: 1, 화요일: 2, 수요일: 3, 목요일: 4, 금요일: 5, 토요일: 6 };
    const found = Object.entries(weekdays).find(([name]) => text.includes(name));
    if (found) {
      let diff = (found[1] - today.getDay() + 7) % 7;
      if (text.includes("다음 주")) diff += diff === 0 ? 7 : 7;
      else if (diff === 0) diff = 7;
      return toISODate(addDays(today, diff));
    }
    return toISODate(addDays(today, 5));
  }

  // 체험 모드 응답 생성
  async function mockAiResponse(prompt, context, signal) {
    await delayWithSignal(900, signal);
    if (prompt.includes("시간 초과")) throw createApiError("TIMEOUT", "응답 시간이 초과되었습니다.", "Mock 시간 초과 시나리오");
    if (prompt.includes("실패")) throw createApiError("MOCK_FAILURE", "체험 모드가 요청된 실패 상태를 반환했습니다.", "입력에 ‘실패’가 포함되어 있습니다.");
    if (prompt.includes("잘못된 응답")) return "이 응답은 JSON이 아닙니다.";

    if (context.mode === "update") {
      const existing = context.task;
      const changes = {};
      if (/(내일|모레|오늘|주말|요일|다음 주)/.test(prompt)) {
        changes.startDate = inferMockDate(prompt);
        changes.endDate = inferMockDate(prompt);
      }
      if (prompt.includes("중요도")) {
        if (prompt.includes("높")) changes.priority = "high";
        else if (prompt.includes("낮")) changes.priority = "low";
        else changes.priority = "medium";
      }
      const duration = prompt.match(/(\d+)\s*(시간|분)/);
      if (duration) changes.duration = `${duration[1]}${duration[2]}`;
      const color = prompt.match(/#[0-9a-f]{6}/i);
      if (color) changes.calendarColor = color[0];
      const titleMatch = prompt.match(/제목(?:을|은)?\s*[‘'\"]?([^‘'\".]+)[’'\"]?로\s*바/);
      if (titleMatch) changes.title = titleMatch[1].trim();
      const addSubtask = prompt.match(/(.+?)(?:을|를)\s*(?:하위 작업|작업)(?:으로)?\s*추가/);
      if (addSubtask) changes.subtasks = [...existing.subtasks, { title: addSubtask[1].trim(), done: false }];
      if (!Object.keys(changes).length) changes.description = `${existing.description}\n수정 요청: ${prompt}`.trim();
      return JSON.stringify({ schemaVersion: AI_SCHEMA_VERSION, entityType: "schedule", action: "update", targetId: existing.id, parentPlanId: existing.planId || null, needsConfirmation: false, confirmationMessage: "", data: { ...getEditableEntityData("schedule", existing), ...changes } });
    }

    const duration = prompt.match(/(\d+)\s*(시간|분)/);
    const priority = prompt.includes("중요") || prompt.includes("발표") || prompt.includes("보고서") ? "high" : "medium";
    const title = createTitleFromPrompt(prompt);
    const date = inferMockDate(prompt);
    const timeMatch = prompt.match(/(?:오전|오후)?\s*(\d{1,2})(?:시|:)(?:\s*(\d{1,2})분?)?/);
    const requestedType = context.requestedType === "project" ? "plan" : context.requestedType;
    const isPlan = requestedType === "plan" || (requestedType === "auto" && /(장기|개월|달 동안|프로젝트 계획|로드맵)/.test(prompt));
    const isMilestone = requestedType === "auto" && /(마일스톤|중간 목표|단계)/.test(prompt) && /(추가|만들)/.test(prompt);
    const isTodo = requestedType === "todo" || (!isPlan && !isMilestone && requestedType !== "schedule" && /(todo|할 일|체크|사기|제출하기|전화하기)/i.test(prompt));
    if (isMilestone) return JSON.stringify({ schemaVersion: AI_SCHEMA_VERSION, entityType: "milestone", action: "create", targetId: null, parentPlanId: state.plans[0]?.id || null, needsConfirmation: !state.plans.length, confirmationMessage: state.plans.length ? "" : "중간 목표를 연결할 프로젝트를 선택해 주세요.", data: { title, date, description: prompt, completed: false } });
    if (isPlan) {
      const weeks = Number(prompt.match(/(\d+)\s*주/)?.[1] || 0);
      const months = Number(prompt.match(/(\d+)\s*(?:개월|달)/)?.[1] || 0);
      const endDate = toISODate(addDays(today, weeks ? weeks * 7 : months ? months * 30 : 60));
      return JSON.stringify({ schemaVersion: AI_SCHEMA_VERSION, entityType: "plan", action: "create", targetId: null, parentPlanId: null, needsConfirmation: false, confirmationMessage: "", data: { title, goal: prompt, startDate: toISODate(today), endDate, status: "active", calendarColor: DEFAULT_PLAN_COLOR, description: prompt, milestones: [{ title: "준비 단계 완료", date: toISODate(addDays(today, Math.max(1, Math.round((fromISODate(endDate) - today) / 172800000)))), completed: false, description: "" }, { title: "최종 목표 달성", date: endDate, completed: false, description: "" }] } });
    }
    if (isTodo) return JSON.stringify({ schemaVersion: AI_SCHEMA_VERSION, entityType: "todo", action: "create", targetId: null, parentPlanId: null, needsConfirmation: false, confirmationMessage: "", data: { title, description: prompt, completed: false, dueDate: /(오늘|내일|모레|요일|주말)/.test(prompt) ? date : null, dueTime: null, priority, tags: ["AI 생성"], planId: null, calendarColor: "#F59E0B" } });
    let hour = timeMatch ? Number(timeMatch[1]) : null;
    if (hour !== null && prompt.includes("오후") && hour < 12) hour += 12;
    const startTime = hour !== null ? `${String(hour).padStart(2, "0")}:${String(Number(timeMatch[2] || 0)).padStart(2, "0")}` : null;
    const rangeDays = Number(prompt.match(/(\d+)\s*일\s*(?:동안|간)/)?.[1] || 1);
    return JSON.stringify({ schemaVersion: AI_SCHEMA_VERSION, entityType: "schedule", action: "create", targetId: null, parentPlanId: null, needsConfirmation: false, confirmationMessage: "", data: { title, status: "scheduled", startDate: date, endDate: toISODate(addDays(fromISODate(date), rangeDays - 1)), allDay: !startTime, startTime, endTime: null, calendarColor: DEFAULT_SCHEDULE_COLOR, planId: null, duration: duration ? `${duration[1]}${duration[2]}` : "2시간", priority, difficulty: priority === "high" ? "보통" : "낮음", tags: ["AI 생성", prompt.includes("공부") ? "학습" : "일정"], description: prompt, subtasks: [{ title: "필요 사항 확인", done: false }, { title: "핵심 작업 진행", done: false }, { title: "최종 검토", done: false }] } });
  }

  // 공급자별 구조화 출력 지원
  const GROQ_JSON_SCHEMA_MODELS = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b", "openai/gpt-oss-safeguard-20b"]);
  const GROQ_STRICT_JSON_SCHEMA_MODELS = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);

  function sanitizeSchemaName(name) {
    return String(name || "auto_ai_planner_response").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  }

  function providerSupportsJsonSchema(settings) {
    if (settings.provider === "gemini") return true;
    if (settings.provider === "openrouter") return openRouterModelSupportsStructuredOutput(settings.model);
    if (settings.provider === "groq") return GROQ_JSON_SCHEMA_MODELS.has(settings.model);
    return false;
  }

  function buildCompatibleResponseFormat(settings, options) {
    if (options?.schema && providerSupportsJsonSchema(settings)) {
      return {
        type: "json_schema",
        json_schema: {
          name: sanitizeSchemaName(options.schemaName),
          strict: settings.provider === "openrouter" || GROQ_STRICT_JSON_SCHEMA_MODELS.has(settings.model),
          schema: options.schema
        }
      };
    }
    return { type: "json_object" };
  }

  // OpenAI 호환 공급자 요청
  async function callOpenAiCompatibleAdapter(messages, settings, signal, options) {
    const endpoint = getEffectiveApiEndpoint(settings);
    const body = {
      model: settings.model,
      messages,
      temperature: 0.2,
      max_tokens: Number(options?.maxOutputTokens) || 2400,
      response_format: buildCompatibleResponseFormat(settings, options)
    };
    if (settings.provider === "openrouter" && options?.schema && providerSupportsJsonSchema(settings)) body.provider = { require_parameters: true };
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey(settings.provider)}` },
        body: JSON.stringify(body),
        signal
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw createApiError("NETWORK", "API 서버에 연결하지 못했습니다.", "네트워크 연결 또는 브라우저 CORS 정책을 확인하세요.");
    }
    const raw = await response.text();
    if (!response.ok) throw createApiError("HTTP", "API 요청이 거절되었습니다.", raw.slice(0, 500), response.status);
    let data;
    try { data = JSON.parse(raw); } catch (error) { throw createApiError("INVALID_RESPONSE", "API가 올바른 JSON 응답을 반환하지 않았습니다.", raw.slice(0, 300)); }
    const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? data?.output?.[0]?.content?.[0]?.text;
    if (typeof content !== "string") throw createApiError("INVALID_RESPONSE", "API 응답에서 결과 텍스트를 찾지 못했습니다.", "choices[0].message.content 또는 output_text가 필요합니다.");
    return content;
  }

  function callGroqAdapter(messages, settings, signal, options) {
    return callOpenAiCompatibleAdapter(messages, settings, signal, options);
  }

  function callOpenRouterAdapter(messages, settings, signal, options) {
    return callOpenAiCompatibleAdapter(messages, settings, signal, options);
  }

  function callCustomApiAdapter(messages, settings, signal, options) {
    return callOpenAiCompatibleAdapter(messages, settings, signal, options);
  }

  function adaptSchemaForGemini(value) {
    if (Array.isArray(value)) return value.map(adaptSchemaForGemini);
    if (!value || typeof value !== "object") return value;
    const adapted = {};
    Object.entries(value).forEach(([key, item]) => {
      if (key === "const") adapted.enum = [item];
      else if (!["pattern", "minLength", "maxLength"].includes(key)) adapted[key] = adaptSchemaForGemini(item);
    });
    if (value.pattern === DATE_PATTERN) adapted.format = "date";
    if (value.pattern === TIME_PATTERN) adapted.format = "time";
    if (value.pattern === COLOR_PATTERN) adapted.description = `${adapted.description ? `${adapted.description} ` : ""}#RRGGBB 형식의 색상`;
    return adapted;
  }

  // Gemini 요청 형식 변환
  async function callGeminiAdapter(messages, settings, signal, options) {
    const endpoint = getEffectiveApiEndpoint(settings);
    const systemInstruction = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const conversation = messages.filter((message) => message.role !== "system");
    const input = conversation.length === 1 && conversation[0].role === "user"
      ? conversation[0].content
      : conversation.map((message) => `${message.role === "assistant" ? "이전 AI 응답" : "사용자 요청"}:\n${message.content}`).join("\n\n");
    const body = {
      model: settings.model,
      input,
      system_instruction: systemInstruction,
      response_format: options?.schema
        ? { type: "text", mime_type: "application/json", schema: adaptSchemaForGemini(options.schema) }
        : { type: "text", mime_type: "application/json" },
      generation_config: { temperature: 0.2, max_output_tokens: Number(options?.maxOutputTokens) || 2400 }
    };
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": getApiKey(settings.provider) },
        body: JSON.stringify(body),
        signal
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw createApiError("NETWORK", "Gemini API에 연결하지 못했습니다.", "네트워크 연결 또는 브라우저 CORS 정책을 확인하세요.");
    }
    const raw = await response.text();
    if (!response.ok) throw createApiError("HTTP", "Gemini API 요청이 거절되었습니다.", raw.slice(0, 500), response.status);
    let data;
    try { data = JSON.parse(raw); } catch (error) { throw createApiError("INVALID_RESPONSE", "Gemini API가 올바른 JSON 응답을 반환하지 않았습니다.", raw.slice(0, 300)); }
    const modelStep = Array.isArray(data?.steps) ? [...data.steps].reverse().find((step) => step?.type === "model_output") : null;
    const stepText = Array.isArray(modelStep?.content) ? modelStep.content.filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text).join("") : "";
    const content = data?.output_text
      ?? data?.outputs?.find((item) => typeof item?.text === "string")?.text
      ?? (stepText || undefined)
      ?? data?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === "string")?.text;
    if (typeof content !== "string") throw createApiError("INVALID_RESPONSE", "Gemini API 응답에서 결과 텍스트를 찾지 못했습니다.", "output_text가 포함된 응답이 필요합니다.");
    return content;
  }

  const API_REQUEST_ADAPTERS = {
    gemini: callGeminiAdapter,
    groq: callGroqAdapter,
    openrouter: callOpenRouterAdapter,
    "openai-compatible": callCustomApiAdapter
  };

  async function callConfiguredApi(messages, settings, signal, options) {
    if (settings.provider === "openrouter" && state.openRouterModelsStatus === "idle") await loadOpenRouterModels(false);
    if (settings.provider === "groq" && state.groqModelsStatus === "idle") await loadGroqModels(false);
    const adapter = API_REQUEST_ADAPTERS[settings.provider];
    if (!adapter) throw createApiError("SETTINGS", "지원하지 않는 AI 서비스입니다.");
    return adapter(messages, settings, signal, options || {});
  }

  async function requestAiSchedule(prompt, context, signal) {
    if (state.apiSettings.provider === "mock") return mockAiResponse(prompt, context, signal);
    const updating = context.mode === "update";
    const messages = updating ? buildUpdateSchedulePrompt(context.task, prompt) : buildCreateSchedulePrompt(prompt, context.requestedType);
    const schema = updating ? getUpdateEnvelopeSchema("schedule", context.task.id) : getCreateEnvelopeSchema(context.requestedType);
    const schemaName = updating ? "update_schedule" : `create_${context.requestedType || "auto"}`;
    return callConfiguredApi(messages, state.apiSettings, signal, { schema, schemaName });
  }

  // AI 응답 교정과 공통 봉투 정규화
  async function requestParsedAiSchedule(prompt, context, signal) {
    const responseText = await requestAiSchedule(prompt, context, signal);
    try {
      return normalizeAiEnvelope(parseAiResponse(responseText));
    } catch (error) {
      if (error.code !== "PARSE") throw error;
      let repairedText;
      if (state.apiSettings.provider === "mock") {
        repairedText = await mockAiResponse(prompt.replace(/잘못된 응답/g, "형식 교정"), context, signal);
      } else {
        const baseMessages = context.mode === "update" ? buildUpdateSchedulePrompt(context.task, prompt) : buildCreateSchedulePrompt(prompt, context.requestedType);
        const schema = context.mode === "update" ? getUpdateEnvelopeSchema("schedule", context.task.id) : getCreateEnvelopeSchema(context.requestedType);
        const schemaName = context.mode === "update" ? "repair_update_schedule" : `repair_create_${context.requestedType || "auto"}`;
        repairedText = await callConfiguredApi([...baseMessages, { role: "assistant", content: String(responseText).slice(0, 2000) }, { role: "user", content: "이전 응답을 주어진 JSON Schema에 맞는 JSON 하나로 교정하세요. 설명과 Markdown은 포함하지 마세요." }], state.apiSettings, signal, { schema, schemaName });
      }
      return normalizeAiEnvelope(parseAiResponse(repairedText));
    }
  }

  function parseAiResponse(responseText) {
    if (responseText && typeof responseText === "object") return responseText;
    const raw = String(responseText || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(raw); } catch (error) { throw createApiError("PARSE", "AI 응답을 일정 형식으로 해석하지 못했습니다.", raw.slice(0, 300)); }
  }

  function normalizeAiEnvelope(parsed) {
    if (!parsed || typeof parsed !== "object") return parsed;
    if (parsed.task && !parsed.entityType) {
      return { schemaVersion: AI_SCHEMA_VERSION, entityType: "schedule", action: "create", targetId: null, parentPlanId: null, needsConfirmation: Boolean(parsed.needsConfirmation), confirmationMessage: String(parsed.confirmationMessage || ""), data: parsed.task };
    }
    const normalized = { ...parsed, schemaVersion: Number(parsed.schemaVersion) || AI_SCHEMA_VERSION };
    if (!normalized.data && normalized.changes && typeof normalized.changes === "object") normalized.data = normalized.changes;
    if (normalized.parentPlanId === undefined) normalized.parentPlanId = null;
    if (normalized.needsConfirmation === undefined) normalized.needsConfirmation = false;
    if (normalized.confirmationMessage === undefined) normalized.confirmationMessage = "";
    return normalized;
  }

  function validateTaskPayload(payload, fallback) {
    const base = fallback || {};
    const merged = { ...base, ...(payload || {}) };
    if (!String(merged.title || "").trim()) throw createApiError("VALIDATION", "AI 응답에 일정 제목이 없습니다.");
    const startDate = merged.startDate || merged.date;
    const endDate = merged.endDate || startDate;
    if (!isValidDateString(startDate) || !isValidDateString(endDate) || endDate < startDate) throw createApiError("VALIDATION", "AI 응답의 날짜 범위가 올바르지 않습니다.");
    if (!Object.keys(priorityMeta).includes(merged.priority)) throw createApiError("VALIDATION", "AI 응답의 중요도가 올바르지 않습니다.");
    if (merged.status && !Object.keys(statusMeta).includes(merged.status)) throw createApiError("VALIDATION", "AI 응답의 일정 상태가 올바르지 않습니다.");
    if (merged.difficulty && !["높음", "보통", "낮음"].includes(merged.difficulty)) throw createApiError("VALIDATION", "AI 응답의 난이도가 올바르지 않습니다.");
    if (!Array.isArray(merged.tags)) throw createApiError("VALIDATION", "AI 응답의 태그 형식이 올바르지 않습니다.");
    if (!Array.isArray(merged.subtasks)) throw createApiError("VALIDATION", "AI 응답의 하위 작업 형식이 올바르지 않습니다.");
    const normalized = normalizeStoredTask({
      ...merged,
      startDate,
      endDate,
      date: startDate,
      id: base.id || Date.now(),
      status: merged.status || "scheduled",
      difficulty: merged.difficulty || "보통",
      tags: Array.isArray(merged.tags) ? merged.tags : [],
      subtasks: Array.isArray(merged.subtasks) ? merged.subtasks : [],
      createdAt: base.createdAt || toISODate(today)
    }, 0);
    if (!normalized) throw createApiError("VALIDATION", "AI 응답의 일정 데이터가 올바르지 않습니다.");
    return normalized;
  }

  // 저장 전 AI 생성 결과 검증
  function validateAiCreateEnvelope(parsed) {
    if (!parsed || Number(parsed.schemaVersion) !== AI_SCHEMA_VERSION || parsed.action !== "create" || !["schedule", "todo", "plan", "milestone"].includes(parsed.entityType) || !parsed.data || typeof parsed.data !== "object") throw createApiError("VALIDATION", "AI가 지원하지 않는 생성 형식을 반환했습니다.");
    let entity;
    if (parsed.entityType === "schedule") entity = validateTaskPayload(parsed.data);
    if (parsed.entityType === "todo") entity = normalizeTodo({ ...parsed.data, id: nextId(state.todos), completed: false, createdAt: new Date().toISOString() }, 0);
    if (parsed.entityType === "plan") entity = normalizePlan({ ...parsed.data, id: nextId(state.plans), createdAt: new Date().toISOString() }, 0);
    if (parsed.entityType === "milestone") {
      const plan = state.plans.find((item) => item.id === Number(parsed.parentPlanId));
      if (!plan) throw createApiError("VALIDATION", "중간 목표를 연결할 프로젝트를 찾지 못했습니다.");
      entity = normalizeMilestone(parsed.data, 0, plan.endDate);
      if (entity.date < plan.startDate || entity.date > plan.endDate) throw createApiError("VALIDATION", "중간 목표 날짜가 프로젝트 기간 밖에 있습니다.");
    }
    if (!entity) throw createApiError("VALIDATION", "AI 응답의 데이터가 올바르지 않습니다.");
    return { entityType: parsed.entityType, entity, parentPlanId: Number(parsed.parentPlanId) || null, needsConfirmation: Boolean(parsed.needsConfirmation), confirmationMessage: String(parsed.confirmationMessage || "") };
  }

  // API 오류 사용자 메시지 변환
  function mapApiError(error, request) {
    if (error?.name === "AbortError") {
      if (request?.timedOut) return { code: "timeout", message: "응답 시간이 초과되었습니다. 제한 시간을 늘리거나 다시 시도해 주세요.", details: "요청 제한 시간 초과" };
      return { code: "cancelled", message: "요청을 취소했습니다.", details: "" };
    }
    if (error?.status === 400) return { code: "bad-request", message: "API 요청 형식 또는 모델 설정이 올바르지 않습니다.", details: error?.details || "선택한 공급자에서 해당 모델과 JSON 응답 형식을 지원하는지 확인하세요." };
    if (error?.status === 401 || error?.status === 403) return { code: "auth", message: "API 키 인증에 실패했습니다.", details: "API 키와 사용 권한을 확인하세요." };
    if (error?.status === 402) return { code: "credits", message: "API 크레딧이 부족합니다.", details: "선택한 공급자의 결제 상태 또는 무료 사용 한도를 확인하세요." };
    if (error?.status === 404) return { code: "not-found", message: "API 주소 또는 모델을 찾을 수 없습니다.", details: "엔드포인트와 모델명을 확인하세요." };
    if (error?.status === 429) return { code: "rate-limit", message: "API 요청 한도 또는 사용량을 초과했습니다.", details: "잠시 후 다시 시도하거나 API 사용량을 확인하세요." };
    if (error?.code === "NETWORK") return { code: "network", message: "API 서버에 연결하지 못했습니다.", details: "네트워크 상태와 브라우저 CORS 허용 여부를 확인하세요." };
    return { code: error?.code || "unknown", message: error?.message || "AI 요청을 처리하지 못했습니다.", details: error?.details || "" };
  }

  // 생성 요청과 미리보기 준비
  async function startGeneration() {
    const input = state.generation.input.trim();
    if (!input) return;
    const settingsCheck = validateApiSettings(state.apiSettings, getApiKey());
    if (!settingsCheck.valid) {
      state.generation.status = "error";
      state.generation.errorCode = "settings";
      state.generation.errorMessage = settingsCheck.errors.join(" ");
      render();
      return;
    }
    addRecentPrompt(input);
    clearGenerationTimers();
    state.generation.status = "loading";
    state.generation.errorMessage = "";
    state.generation.errorCode = "";
    state.generation.step = 0;
    render();
    announce("AI 일정 생성을 시작했습니다.");
    state.generation.timers.push(window.setTimeout(() => { state.generation.step = 1; if (state.route === "dashboard") render(); }, 650));
    state.generation.timers.push(window.setTimeout(() => { state.generation.step = 2; if (state.route === "dashboard") render(); }, 1300));
    const request = beginRequest("generation", state.apiSettings.timeout);
    try {
      const parsed = await requestParsedAiSchedule(input, { mode: "create", requestedType: state.generation.mode }, request.controller.signal);
      const preview = validateAiCreateEnvelope(parsed);
      if (preview.entityType === "schedule") {
        preview.entity.id = nextId(state.schedules);
        preview.entity.createdAt = new Date().toISOString();
        state.generation.previewTask = preview.entity;
      }
      state.generation.previewEntity = preview.entity;
      state.generation.previewType = preview.entityType;
      state.generation.status = "preview";
      if (state.route === "dashboard") render();
      openModal("ai-entity-preview", { ...preview });
    } catch (error) {
      const mapped = mapApiError(error, request);
      if (mapped.code === "cancelled") return;
      state.generation.status = "error";
      state.generation.errorCode = mapped.code;
      state.generation.errorMessage = mapped.message;
      if (state.route === "dashboard") render();
      announce(mapped.message);
    } finally {
      clearGenerationTimers();
      finishRequest(request);
    }
  }

  function createTitleFromPrompt(prompt) {
    const cleaned = prompt.replace(/(일정|계획|만들어줘|준비하고|나눠줘|까지)/g, " ").replace(/\s+/g, " ").trim();
    return cleaned.length > 30 ? `${cleaned.slice(0, 30)}…` : cleaned || "새로운 일정";
  }

  function clearGenerationTimers() {
    state.generation.timers.forEach(window.clearTimeout);
    state.generation.timers = [];
  }

  function cancelGeneration() {
    if (state.activeRequest?.type === "generation") {
      state.activeRequest.cancelled = true;
      state.activeRequest.controller.abort();
    }
    clearGenerationTimers();
    state.generation.status = "idle";
    state.generation.step = 0;
    render();
    showToast("일정 생성을 취소했습니다.");
  }

  function completeTask(id) {
    const task = state.tasks.find((item) => item.id === Number(id));
    if (!task) return;
    task.status = "completed";
    task.completedAt = toISODate(today);
    task.subtasks.forEach((subtask) => { subtask.done = true; });
    persistAppData();
    render();
    showToast(`“${task.title}” 일정을 완료했습니다.`);
  }

  function restoreTask(id) {
    const task = state.tasks.find((item) => item.id === Number(id));
    if (!task) return;
    task.status = "progress";
    delete task.completedAt;
    persistAppData();
    render();
    showToast("일정을 다시 진행 중으로 변경했습니다.");
  }

  // 모달 열기와 포커스 복귀
  function openModal(type, payload) {
    state.lastFocused = document.activeElement;
    state.modal = { type, ...(payload || {}) };
    renderModal();
    document.body.classList.add("modal-open");
    window.setTimeout(() => {
      const focusTarget = state.modal?.type === "month-picker"
        ? document.getElementById("month-picker-input")
        : modalRoot.querySelector("input:not([type=hidden]), select, textarea, button");
      if (focusTarget) focusTarget.focus();
    }, 20);
  }

  function closeModal() {
    if (state.modal?.type === "ai-edit" && state.activeRequest?.type === "ai-update") {
      state.activeRequest.cancelled = true;
      state.activeRequest.controller.abort();
    }
    if (state.modal?.type === "detail-project" && state.activeRequest?.type === "project-detail") {
      state.activeRequest.cancelled = true;
      state.activeRequest.controller.abort();
    }
    state.modal = null;
    modalRoot.innerHTML = "";
    document.body.classList.remove("modal-open");
    if (state.lastFocused && document.contains(state.lastFocused)) state.lastFocused.focus();
  }

  function renderTaskEditorFields(task, prefix) {
    const idPrefix = prefix || "preview";
    const startDate = task.startDate || task.date || toISODate(today);
    const endDate = task.endDate || startDate;
    const isRange = endDate !== startDate;
    const allDay = task.allDay !== false;
    return `<div class="field"><label for="${idPrefix}-title">일정 제목</label><input id="${idPrefix}-title" name="title" required maxlength="100" value="${escapeHTML(task.title || "")}"></div>
      <div class="form-grid"><div class="field"><label for="${idPrefix}-period">일정 범위</label><select id="${idPrefix}-period" name="periodType" data-schedule-period><option value="single"${selected("single", isRange ? "range" : "single")}>하루 일정</option><option value="range"${selected("range", isRange ? "range" : "single")}>여러 날(프로젝트로 저장)</option></select></div><div class="field"><label for="${idPrefix}-duration">예상 시간</label><input id="${idPrefix}-duration" name="duration" value="${escapeHTML(task.duration || "1시간")}"></div></div>
      <div class="form-grid"><div class="field"><label for="${idPrefix}-start-date">시작일</label><input id="${idPrefix}-start-date" name="startDate" type="date" required value="${escapeHTML(startDate)}"></div><div class="field schedule-end-field ${isRange ? "" : "is-hidden"}"><label for="${idPrefix}-end-date">종료일</label><input id="${idPrefix}-end-date" name="endDate" type="date" value="${escapeHTML(endDate)}"></div></div>
      <label class="security-check schedule-all-day"><input type="checkbox" name="allDay" data-schedule-all-day${checked(allDay)}><span><strong>종일 일정</strong><small>끄면 선택적으로 시·분을 입력할 수 있습니다.</small></span></label>
      <div class="form-grid schedule-time-fields ${allDay ? "is-hidden" : ""}"><div class="field"><label for="${idPrefix}-start-time">시작 시간</label><input id="${idPrefix}-start-time" name="startTime" type="time" value="${escapeHTML(task.startTime || "")}"></div><div class="field"><label for="${idPrefix}-end-time">종료 시간</label><input id="${idPrefix}-end-time" name="endTime" type="time" value="${escapeHTML(task.endTime || "")}"></div></div>
      <div class="form-grid"><div class="field"><label for="${idPrefix}-priority">중요도</label><select id="${idPrefix}-priority" name="priority"><option value="high"${selected("high", task.priority)}>높음</option><option value="medium"${selected("medium", task.priority)}>보통</option><option value="low"${selected("low", task.priority)}>낮음</option></select></div><div class="field"><label for="${idPrefix}-difficulty">난이도</label><select id="${idPrefix}-difficulty" name="difficulty"><option value="높음"${selected("높음", task.difficulty)}>높음</option><option value="보통"${selected("보통", task.difficulty)}>보통</option><option value="낮음"${selected("낮음", task.difficulty)}>낮음</option></select></div></div>
      <div class="field color-field"><label for="${idPrefix}-color">달력 색상</label><div class="color-control"><div class="color-palette">${COLOR_PALETTE.map((color) => `<button type="button" class="color-swatch ${normalizeColor(task.calendarColor, DEFAULT_SCHEDULE_COLOR) === color ? "active" : ""}" style="--swatch:${color}" data-action="choose-color" data-target="${idPrefix}-color" data-color="${color}" aria-label="${color} 색상 선택"></button>`).join("")}</div><input id="${idPrefix}-color" name="calendarColor" type="color" value="${normalizeColor(task.calendarColor, DEFAULT_SCHEDULE_COLOR)}" aria-label="사용자 지정 달력 색상"></div><small class="field-help">하루 일정은 점으로, 여러 날 항목은 프로젝트의 얇은 선으로 표시됩니다.</small></div>
      <div class="field"><label for="${idPrefix}-plan">프로젝트 연결</label><select id="${idPrefix}-plan" name="planId"><option value="">연결 안 함</option>${state.plans.map((plan) => `<option value="${plan.id}"${selected(plan.id, Number(task.planId))}>${escapeHTML(plan.title)}</option>`).join("")}</select></div>
      <div class="field"><label for="${idPrefix}-tags">태그</label><input id="${idPrefix}-tags" name="tags" value="${escapeHTML((task.tags || []).join(", "))}" placeholder="업무, 발표처럼 쉼표로 구분"></div>
      <div class="field"><label for="${idPrefix}-description">설명</label><textarea id="${idPrefix}-description" name="description" rows="3">${escapeHTML(task.description || "")}</textarea></div>
      <div class="field"><label for="${idPrefix}-subtasks">하위 작업</label><textarea id="${idPrefix}-subtasks" name="subtasks" rows="4" placeholder="한 줄에 하나씩 입력">${escapeHTML((task.subtasks || []).map((item) => item.title).join("\n"))}</textarea><small class="field-help">한 줄에 하위 작업 하나를 입력하세요.</small></div>`;
  }

  function renderTaskDifferences(before, after) {
    const fields = [
      ["title", "제목", before.title, after.title],
      ["status", "상태", statusMeta[before.status]?.label, statusMeta[after.status]?.label],
      ["startDate", "시작일", before.startDate, after.startDate],
      ["endDate", "종료일", before.endDate, after.endDate],
      ["startTime", "시작 시간", before.startTime, after.startTime],
      ["endTime", "종료 시간", before.endTime, after.endTime],
      ["calendarColor", "달력 색상", before.calendarColor, after.calendarColor],
      ["duration", "예상 시간", before.duration, after.duration],
      ["priority", "중요도", priorityMeta[before.priority]?.label, priorityMeta[after.priority]?.label],
      ["difficulty", "난이도", before.difficulty, after.difficulty],
      ["tags", "태그", before.tags.join(", "), after.tags.join(", ")],
      ["description", "설명", before.description, after.description],
      ["subtasks", "하위 작업", before.subtasks.map((item) => item.title).join(", "), after.subtasks.map((item) => item.title).join(", ")]
    ].filter((item) => String(item[2]) !== String(item[3]));
    if (!fields.length) return `<div class="api-status api-status-loading"><span aria-hidden="true">i</span><div><strong>변경할 내용이 없습니다.</strong><p>수정 요청을 더 구체적으로 입력해 주세요.</p></div></div>`;
    return `<div class="diff-list">${fields.map((item) => `<div class="diff-row"><strong>${escapeHTML(item[1])}</strong><div><span class="diff-before">${escapeHTML(item[2] || "없음")}</span><span class="diff-arrow" aria-hidden="true">→</span><span class="diff-after">${escapeHTML(item[3] || "없음")}</span></div></div>`).join("")}</div>`;
  }

  function renderTodoEditorFields(todo) {
    const item = todo || {};
    return `<div class="field"><label for="todo-title">할 일 이름</label><input id="todo-title" name="title" required maxlength="120" value="${escapeHTML(item.title || "")}"></div>
      <div class="form-grid"><div class="field"><label for="todo-due-date">기한 날짜 <span class="optional">선택</span></label><input id="todo-due-date" name="dueDate" type="date" value="${escapeHTML(item.dueDate || "")}"></div><div class="field"><label for="todo-due-time">기한 시간 <span class="optional">선택</span></label><input id="todo-due-time" name="dueTime" type="time" value="${escapeHTML(item.dueTime || "")}"></div></div>
      <div class="form-grid"><div class="field"><label for="todo-priority">중요도</label><select id="todo-priority" name="priority"><option value="high"${selected("high", item.priority)}>높음</option><option value="medium"${selected("medium", item.priority || "medium")}>보통</option><option value="low"${selected("low", item.priority)}>낮음</option></select></div><div class="field"><label for="todo-plan">프로젝트 연결</label><select id="todo-plan" name="planId"><option value="">연결 안 함</option>${state.plans.map((plan) => `<option value="${plan.id}"${selected(plan.id, Number(item.planId))}>${escapeHTML(plan.title)}</option>`).join("")}</select></div></div>
      <div class="field"><label for="todo-tags">태그</label><input id="todo-tags" name="tags" value="${escapeHTML((item.tags || []).join(", "))}" placeholder="개인, 업무처럼 쉼표로 구분"></div>
      <div class="field"><label for="todo-description">메모</label><textarea id="todo-description" name="description" rows="3">${escapeHTML(item.description || "")}</textarea></div>`;
  }

  function renderPlanEditorFields(plan) {
    const item = plan || {};
    return `<div class="field"><label for="plan-title">프로젝트 이름</label><input id="plan-title" name="title" required maxlength="120" value="${escapeHTML(item.title || "")}"></div>
      <div class="form-grid"><div class="field"><label for="plan-start">시작일</label><input id="plan-start" name="startDate" type="date" required value="${escapeHTML(item.startDate || toISODate(today))}"></div><div class="field"><label for="plan-end">종료일</label><input id="plan-end" name="endDate" type="date" required value="${escapeHTML(item.endDate || toISODate(addDays(today, 30)))}"></div></div>
      <div class="form-grid"><div class="field"><label for="plan-status">상태</label><select id="plan-status" name="status"><option value="draft"${selected("draft", item.status)}>초안</option><option value="active"${selected("active", item.status || "active")}>진행 중</option><option value="paused"${selected("paused", item.status)}>보류</option><option value="completed"${selected("completed", item.status)}>완료</option></select></div><div class="field color-field"><label for="plan-color">달력 선 색상</label><div class="color-control"><div class="color-palette">${COLOR_PALETTE.map((color) => `<button type="button" class="color-swatch ${normalizeColor(item.calendarColor, DEFAULT_PLAN_COLOR) === color ? "active" : ""}" style="--swatch:${color}" data-action="choose-color" data-target="plan-color" data-color="${color}" aria-label="${color} 색상 선택"></button>`).join("")}</div><input id="plan-color" name="calendarColor" type="color" value="${normalizeColor(item.calendarColor, DEFAULT_PLAN_COLOR)}"></div></div></div>
      <div class="field"><label for="plan-description">계획 설명</label><textarea id="plan-description" name="description" rows="4">${escapeHTML(item.description || "")}</textarea></div>`;
  }

  function renderGenericDifferences(before, after) {
    const ignored = new Set(["id", "entityType", "createdAt", "completedAt", "milestones", "linkedScheduleIds", "linkedTodoIds"]);
    const rows = Object.keys({ ...before, ...after }).filter((key) => !ignored.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => {
      const labels = { title: "제목", description: "설명", dueDate: "기한", dueTime: "시간", priority: "중요도", completed: "완료", startDate: "시작일", endDate: "종료일", status: "상태", calendarColor: "달력 색상", date: "목표일" };
      const oldValue = Array.isArray(before[key]) ? before[key].join(", ") : before[key];
      const newValue = Array.isArray(after[key]) ? after[key].join(", ") : after[key];
      return `<div class="diff-row"><strong>${escapeHTML(labels[key] || key)}</strong><div><span class="diff-before">${escapeHTML(oldValue ?? "없음")}</span><span class="diff-arrow" aria-hidden="true">→</span><span class="diff-after">${escapeHTML(newValue ?? "없음")}</span></div></div>`;
    });
    return rows.length ? `<div class="diff-list">${rows.join("")}</div>` : `<div class="api-status api-status-loading"><span>i</span><div><strong>변경할 내용이 없습니다.</strong><p>요청을 더 구체적으로 입력해 주세요.</p></div></div>`;
  }

  function renderCalendarPickerSection(title, kind, items) {
    if (!items.length) return "";
    return `<section class="calendar-picker-section"><h3>${escapeHTML(title)} <span>${items.length}</span></h3><div class="calendar-picker-list">${items.map((item) => {
      const color = item.calendarColor || item.color || "#94A3B8";
      const meta = kind === "schedule"
        ? scheduleDateLabel(item)
        : kind === "project"
          ? `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`
          : kind === "todo"
            ? `${priorityMeta[item.priority]?.label || "보통"} · ${item.dueTime || "시간 없음"}`
            : item.planTitle || "연결된 프로젝트";
      return `<button type="button" data-action="open-calendar-item" data-kind="${kind}" data-id="${item.id}" data-plan-id="${item.planId || ""}"><i style="--item-color:${color}" aria-hidden="true"></i><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(meta)}</small></span><b aria-hidden="true">›</b></button>`;
    }).join("")}</div></section>`;
  }

  // 모달 유형별 화면 렌더링
  function renderModal() {
    if (!state.modal) {
      modalRoot.innerHTML = "";
      return;
    }
    if (state.modal.type === "month-picker") {
      const monthValue = `${state.calendarDate.getFullYear()}-${String(state.calendarDate.getMonth() + 1).padStart(2, "0")}`;
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-small month-picker-modal" role="dialog" aria-modal="true" aria-labelledby="month-picker-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">달력 바로 이동</div><h2 id="month-picker-title">이동할 연도와 월</h2><p>연도와 월을 입력하면 해당 달을 바로 표시합니다.</p><form id="month-picker-form" class="modal-form" novalidate><div class="field"><label for="month-picker-input">연도와 월</label><input id="month-picker-input" name="month" type="month" required min="1000-01" max="9999-12" value="${monthValue}" aria-describedby="month-picker-error"><small id="month-picker-error" class="field-error is-hidden" role="alert">올바른 연도와 월을 선택해 주세요.</small></div><div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit">이동</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "edit-profile-name") {
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="profile-name-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="profile-name-title">사용자 이름 수정</h2><p>사이드바와 상단에 표시할 이름입니다.</p><form id="profile-name-form" class="modal-form"><div class="field"><label for="modal-profile-name">사용자 이름</label><input id="modal-profile-name" name="displayName" required minlength="1" maxlength="30" value="${escapeHTML(state.profile.displayName)}"></div><div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit">이름 저장</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "edit-dashboard-copy") {
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="dashboard-copy-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">대시보드 맞춤 설정</div><h2 id="dashboard-copy-title">첫 화면 문구 수정</h2><p>대시보드에서 가장 먼저 보이는 큰 문구와 안내 문구입니다.</p><form id="dashboard-copy-form" class="modal-form" novalidate><div class="field"><label for="dashboard-headline-input">큰 문구</label><input id="dashboard-headline-input" name="headline" required maxlength="80" value="${escapeHTML(state.dashboardHeadline)}" aria-describedby="dashboard-headline-error"><small id="dashboard-headline-error" class="field-error is-hidden" role="alert">큰 문구를 공백 제외 1~80자로 입력해 주세요.</small></div><div class="field"><label for="dashboard-subtitle-input">작은 문구</label><textarea id="dashboard-subtitle-input" name="subtitle" rows="3" required maxlength="120" aria-describedby="dashboard-subtitle-error">${escapeHTML(state.dashboardSubtitle)}</textarea><small id="dashboard-subtitle-error" class="field-error is-hidden" role="alert">작은 문구를 공백 제외 1~120자로 입력해 주세요.</small></div><div class="modal-actions dashboard-copy-actions"><button class="button button-quiet" type="button" data-action="reset-dashboard-copy-fields">기본 문구 불러오기</button><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit">저장</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "api-help") {
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="api-help-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">AI 연결 도움말</div><h2 id="api-help-title">OpenRouter API 키 발급·설정 방법</h2><ol class="help-steps"><li><a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer">OpenRouter</a>에 로그인합니다.</li><li><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">API Keys 화면</a>에서 새 키를 만듭니다.</li><li>발급 직후 표시되는 키를 복사합니다. 키는 다시 전체 표시되지 않을 수 있습니다.</li><li>AutoAiPlanner의 <strong>AI 서비스</strong>에서 OpenRouter를 선택하고 API 키를 붙여넣습니다.</li><li><strong>무료 모델 자동 선택</strong> 또는 현재 목록에 표시되는 무료 모델을 선택합니다. 무료 모델 목록은 OpenRouter에서 불러오며 제공 상태에 따라 바뀔 수 있습니다.</li><li><strong>연결 테스트</strong> 후 설정을 저장합니다.</li></ol><div class="api-status api-status-loading"><span aria-hidden="true">!</span><div><strong>API 키를 안전하게 보관하세요</strong><p>키는 백업 파일·오류 메시지·콘솔에 포함되지 않습니다. 이 기기 저장을 켜면 브라우저에 암호화되지 않은 상태로 저장되므로 공용 기기에서는 끄세요.</p></div></div><div class="modal-actions"><button class="button button-primary" type="button" data-action="close-modal">확인</button></div></section></div>`;
      return;
    }
    if (state.modal.type === "calendar-day-items") {
      const iso = state.modal.date;
      const items = getCalendarItemsForDate(iso);
      const schedules = [...items.singleSchedules, ...items.rangedSchedules];
      const count = schedules.length + items.plans.length + items.todos.length + items.milestones.length;
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-small calendar-picker" role="dialog" aria-modal="true" aria-labelledby="calendar-picker-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">${formatDate(iso, { weekday: "long" })}</div><h2 id="calendar-picker-title">${formatDate(iso, { year: "numeric", month: "long", day: "numeric" })}</h2><p>이 날짜의 항목 ${count}개 중에서 열어볼 항목을 선택하세요.</p>${renderCalendarPickerSection("일정", "schedule", schedules)}${renderCalendarPickerSection("프로젝트", "project", items.plans)}${renderCalendarPickerSection("할 일", "todo", items.todos)}${renderCalendarPickerSection("중간 목표", "milestone", items.milestones)}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">닫기</button><button class="button button-primary" type="button" data-action="add-on-selected-date" data-date="${iso}">이 날짜에 일정 추가</button></div></section></div>`;
      return;
    }
    // 프로젝트 구체화 모달
    if (state.modal.type === "detail-project") {
      const project = state.plans.find((item) => item.id === state.modal.projectId);
      const loading = state.modal.status === "loading";
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="detail-project-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ AI로 계획 구체화</div><h2 id="detail-project-title">목표를 실행 가능한 단계로 나눠보세요</h2><p>AI가 프로젝트 기간, 중간 목표, 일정, 할 일을 제안합니다. 미리보기에서 선택한 내용만 저장됩니다.</p><form id="project-detail-form" class="modal-form"><div class="field"><label for="detail-project-existing">적용할 프로젝트 <span class="optional">선택</span></label><select id="detail-project-existing" name="projectId"><option value="">새 프로젝트 만들기</option>${state.plans.map((item) => `<option value="${item.id}"${selected(item.id, project?.id || null)}>${escapeHTML(item.title)}</option>`).join("")}</select></div><div class="field"><label for="detail-project-goal">달성하고 싶은 목표</label><textarea id="detail-project-goal" name="goal" rows="4" required maxlength="1000" ${loading ? "disabled" : ""} placeholder="예: 10월까지 취업 지원용 포트폴리오를 공개하고 싶어요">${escapeHTML(state.modal.goal || project?.goal || project?.description || "")}</textarea></div>${state.modal.errorMessage ? `<div class="api-status api-status-error"><span>!</span><div><strong>${escapeHTML(state.modal.errorMessage)}</strong></div></div>` : ""}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit" ${loading ? "disabled aria-busy=\"true\"" : ""}>${loading ? "계획을 구체화하는 중…" : "구체화 제안 만들기"}</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "project-detail-preview") {
      const proposal = state.modal.proposal;
      const existing = state.plans.find((item) => item.id === state.modal.projectId);
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-xl" role="dialog" aria-modal="true" aria-labelledby="project-detail-preview-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ 구체화 결과 미리보기</div><h2 id="project-detail-preview-title">저장할 내용을 선택하고 수정하세요</h2><p>${existing ? `“${escapeHTML(existing.title)}” 프로젝트에 선택한 항목을 추가합니다.` : "새 프로젝트와 선택한 항목을 만듭니다."} 아직 로컬 데이터는 변경되지 않았습니다.</p><form id="project-detail-preview-form" class="modal-form"><input type="hidden" name="projectId" value="${existing?.id || ""}"><div class="field"><label for="detail-preview-title">프로젝트 이름</label><input id="detail-preview-title" name="title" required maxlength="120" value="${escapeHTML(proposal.title)}"></div><div class="form-grid"><div class="field"><label for="detail-preview-start">시작일</label><input id="detail-preview-start" name="startDate" type="date" required value="${escapeHTML(proposal.startDate)}"></div><div class="field"><label for="detail-preview-end">종료일</label><input id="detail-preview-end" name="endDate" type="date" required value="${escapeHTML(proposal.endDate)}"></div></div><div class="field"><label for="detail-preview-description">설명</label><textarea id="detail-preview-description" name="description" rows="3">${escapeHTML(proposal.description)}</textarea></div><div class="proposal-grid"><fieldset><legend>중간 목표</legend>${proposal.milestones.map((item, index) => `<label class="proposal-item"><input type="checkbox" name="milestone-${index}" checked><span><input name="milestone-title-${index}" maxlength="120" value="${escapeHTML(item.title)}" aria-label="중간 목표 이름"><small>${escapeHTML(item.date)}</small></span></label>`).join("")}</fieldset><fieldset><legend>일정</legend>${proposal.schedules.map((item, index) => `<label class="proposal-item"><input type="checkbox" name="schedule-${index}" checked><span><input name="schedule-title-${index}" maxlength="100" value="${escapeHTML(item.title)}" aria-label="일정 이름"><small>${escapeHTML(item.startDate)}</small></span></label>`).join("")}</fieldset><fieldset><legend>할 일</legend>${proposal.todos.map((item, index) => `<label class="proposal-item"><input type="checkbox" name="todo-${index}" checked><span><input name="todo-title-${index}" maxlength="120" value="${escapeHTML(item.title)}" aria-label="할 일 이름"><small>${escapeHTML(item.dueDate || "날짜 없음")}</small></span></label>`).join("")}</fieldset></div><div class="modal-actions"><button class="button button-secondary" type="button" data-action="back-to-detail-project">요청 수정</button><button class="button button-primary" type="submit">${existing ? "선택한 내용 적용" : "선택한 내용으로 프로젝트 만들기"}</button></div></form></section></div>`;
      return;
    }
    // 직접 입력 모달
    if (state.modal.type === "add-todo" || state.modal.type === "edit-todo") {
      const todo = state.modal.type === "edit-todo" ? state.todos.find((item) => item.id === state.modal.id) : { priority: "medium", dueDate: state.modal.dueDate || "", planId: state.modal.planId || null, tags: [] };
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="todo-modal-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="todo-modal-title">${state.modal.type === "edit-todo" ? "할 일 수정" : "새 할 일"}</h2><p>기한은 선택 사항이며, 나중에 일정으로 전환할 수 있습니다.</p><form id="todo-form" class="modal-form"><input type="hidden" name="id" value="${todo?.id || ""}">${renderTodoEditorFields(todo)}${todo?.id ? `<label class="security-check"><input name="completed" type="checkbox"${checked(todo.completed)}><span><strong>완료됨</strong><small>완료 상태를 함께 변경합니다.</small></span></label>` : ""}<div class="modal-actions">${todo?.id ? `<button class="button button-danger" type="button" data-action="delete-todo" data-id="${todo.id}">삭제</button>` : ""}<button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit">저장</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "add-plan" || state.modal.type === "edit-plan") {
      const plan = state.modal.type === "edit-plan" ? state.plans.find((item) => item.id === state.modal.id) : { status: "active", calendarColor: DEFAULT_PLAN_COLOR, startDate: toISODate(today), endDate: toISODate(addDays(today, 30)) };
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="plan-modal-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="plan-modal-title">${plan?.id ? "프로젝트 수정" : "새 프로젝트"}</h2><p>달력에는 선택한 색상의 얇은 선으로 표시됩니다.</p><form id="plan-form" class="modal-form"><input type="hidden" name="id" value="${plan?.id || ""}">${renderPlanEditorFields(plan)}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit">프로젝트 저장</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "add-milestone" || state.modal.type === "edit-milestone") {
      const plan = state.plans.find((item) => item.id === state.modal.planId);
      const milestone = state.modal.type === "edit-milestone" ? plan?.milestones.find((item) => item.id === state.modal.id) : null;
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="milestone-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="milestone-title">${milestone ? "중간 목표 수정" : "중간 목표 추가"}</h2><p>${escapeHTML(plan?.title || "프로젝트")}의 중간 목표를 설정합니다.</p><form id="milestone-form" class="modal-form"><input type="hidden" name="planId" value="${plan?.id || ""}"><input type="hidden" name="id" value="${milestone?.id || ""}"><div class="field"><label for="milestone-name">이름</label><input id="milestone-name" name="title" required maxlength="120" value="${escapeHTML(milestone?.title || "")}"></div><div class="field"><label for="milestone-date">목표일</label><input id="milestone-date" name="date" type="date" required min="${plan?.startDate || ""}" max="${plan?.endDate || ""}" value="${escapeHTML(milestone?.date || plan?.endDate || toISODate(today))}"></div><div class="field"><label for="milestone-description">설명</label><textarea id="milestone-description" name="description" rows="3">${escapeHTML(milestone?.description || "")}</textarea></div><label class="security-check"><input name="completed" type="checkbox"${checked(milestone?.completed)}><span><strong>완료됨</strong></span></label><div class="modal-actions">${milestone ? `<button class="button button-danger" type="button" data-action="delete-milestone" data-id="${milestone.id}" data-plan-id="${plan.id}">삭제</button>` : ""}<button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit">저장</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "more") {
      modalRoot.innerHTML = `<div class="modal-backdrop bottom-sheet-backdrop" data-action="modal-backdrop"><section class="bottom-sheet more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-title"><div class="sheet-handle" aria-hidden="true"></div><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="more-title">더 보기</h2><nav class="more-nav"><a href="#calendar" data-action="close-modal">□ 달력</a><a href="#plans" data-action="close-modal">◇ 프로젝트</a><a href="#completed" data-action="close-modal">✓ 완료 일정</a><a href="#settings" data-action="close-modal">⚙ 설정</a></nav></section></div>`;
      return;
    }
    if (state.modal.type === "add" || state.modal.type === "edit") {
      const task = state.modal.type === "edit" ? state.tasks.find((item) => item.id === state.modal.id) : null;
      const editableTask = task || { title: state.modal.prefill || "", startDate: state.selectedDate || toISODate(today), endDate: state.selectedDate || toISODate(today), allDay: true, startTime: null, endTime: null, calendarColor: DEFAULT_SCHEDULE_COLOR, planId: state.modal.planId || null, duration: "1시간", priority: "medium", difficulty: "보통", tags: ["직접 입력"], description: "", subtasks: [] };
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="task-modal-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="task-modal-title">${task ? "일정 직접 수정" : "새 일정 추가"}</h2><p>${task ? "수정한 내용은 이 브라우저에 자동 저장됩니다." : "API 없이도 직접 일정을 추가할 수 있습니다."}</p><form id="task-form" class="modal-form"><input type="hidden" name="id" value="${task ? task.id : ""}">${renderTaskEditorFields(editableTask, "manual")}${task ? `<div class="field"><label for="manual-status">상태</label><select id="manual-status" name="status">${Object.entries(statusMeta).map(([value, meta]) => `<option value="${value}"${selected(value, task.status)}>${meta.label}</option>`).join("")}</select></div>` : ""}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit" data-action="submit-task-form">${task ? "수정 완료" : "일정 추가"}</button></div></form></section></div>`;
      return;
    }
    // AI 생성·수정 확인 모달
    if (state.modal.type === "ai-entity-preview") {
      const type = state.modal.entityType;
      const entity = state.modal.entity;
      const labels = { schedule: "일정", todo: "할 일", plan: "프로젝트", milestone: "중간 목표" };
      let fields = "";
      if (type === "schedule") fields = renderTaskEditorFields(entity, "ai-entity");
      if (type === "todo") fields = renderTodoEditorFields(entity);
      if (type === "plan") fields = renderPlanEditorFields(entity);
      if (type === "milestone") fields = `<div class="field"><label for="ai-milestone-plan">연결할 프로젝트</label><select id="ai-milestone-plan" name="parentPlanId" required>${state.plans.map((plan) => `<option value="${plan.id}"${selected(plan.id, state.modal.parentPlanId)}>${escapeHTML(plan.title)}</option>`).join("")}</select></div><div class="field"><label for="ai-milestone-title">이름</label><input id="ai-milestone-title" name="title" required value="${escapeHTML(entity.title)}"></div><div class="field"><label for="ai-milestone-date">목표일</label><input id="ai-milestone-date" name="date" type="date" required value="${escapeHTML(entity.date)}"></div><div class="field"><label for="ai-milestone-description">설명</label><textarea id="ai-milestone-description" name="description" rows="3">${escapeHTML(entity.description || "")}</textarea></div>`;
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="ai-entity-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ AI가 ${labels[type]} 요청으로 분류했습니다</div><h2 id="ai-entity-title">저장 전에 확인해 주세요</h2><p>${escapeHTML(state.modal.confirmationMessage || "필요한 값을 직접 고친 뒤 저장할 수 있습니다.")}</p><form id="ai-entity-preview-form" class="modal-form"><input type="hidden" name="entityType" value="${type}">${fields}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">아직 저장하지 않기</button><button class="button button-quiet" type="button" data-action="regenerate">다시 생성</button><button class="button button-primary" type="submit">${labels[type]} 저장</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "ai-edit-entity") {
      const labels = { todo: "할 일", plan: "프로젝트", milestone: "중간 목표" };
      const loading = state.modal.status === "loading";
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="ai-edit-entity-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ AI ${labels[state.modal.entityType]} 수정</div><h2 id="ai-edit-entity-title">자연어로 변경 내용을 알려주세요</h2><p>원본은 미리보기에서 적용하기 전까지 바뀌지 않습니다.</p><form id="ai-edit-entity-form" class="modal-form"><input type="hidden" name="entityType" value="${state.modal.entityType}"><input type="hidden" name="id" value="${state.modal.id}"><input type="hidden" name="planId" value="${state.modal.planId || ""}"><div class="field"><label for="ai-entity-instruction">수정 요청</label><textarea id="ai-entity-instruction" name="instruction" rows="4" required ${loading ? "disabled" : ""} placeholder="예: 기한을 다음 주 금요일로 바꾸고 중요도를 높여줘">${escapeHTML(state.modal.instruction || "")}</textarea></div>${state.modal.errorMessage ? `<div class="api-status api-status-error"><span>!</span><div><strong>${escapeHTML(state.modal.errorMessage)}</strong></div></div>` : ""}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="submit" ${loading ? "disabled aria-busy=\"true\"" : ""}>${loading ? "변경안 생성 중…" : "변경안 만들기"}</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "ai-entity-update-preview") {
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="ai-generic-update-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ AI 변경 내용 미리보기</div><h2 id="ai-generic-update-title">이 변경을 적용할까요?</h2><p>아직 원본 데이터는 변경되지 않았습니다.</p>${renderGenericDifferences(state.modal.before, state.modal.after)}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="back-to-generic-ai-edit">요청 수정</button><button class="button button-primary" type="button" data-action="apply-generic-ai-update">변경 적용</button></div></section></div>`;
      return;
    }
    if (state.modal.type === "ai-create-preview") {
      const task = state.modal.task || state.generation.previewTask;
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="ai-preview-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ AI 일정 미리보기</div><h2 id="ai-preview-title">저장 전에 확인해 주세요</h2><p>${state.modal.confirmationMessage ? escapeHTML(state.modal.confirmationMessage) : "필요한 항목을 직접 고친 뒤 저장할 수 있습니다."}</p><form id="ai-preview-form" class="modal-form">${renderTaskEditorFields(task, "ai-preview")}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">아직 저장하지 않기</button><button class="button button-quiet" type="button" data-action="regenerate">다시 생성</button><button class="button button-primary" type="submit">일정 저장</button></div></form></section></div>`;
      return;
    }
    if (state.modal.type === "ai-edit") {
      const task = state.tasks.find((item) => item.id === state.modal.id);
      const loading = state.modal.status === "loading";
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="ai-edit-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ AI 일정 수정</div><h2 id="ai-edit-title">${escapeHTML(task?.title || "일정")} 수정하기</h2><p>바꾸고 싶은 내용을 자연어로 입력하세요. 적용 전 변경 내용을 비교해 드립니다.</p><form id="ai-edit-form" class="modal-form"><input type="hidden" name="id" value="${task?.id || ""}"><div class="field"><label for="ai-edit-instruction">수정 요청</label><textarea id="ai-edit-instruction" name="instruction" rows="4" required ${loading ? "disabled" : ""} placeholder="예: 마감일을 다음 주 월요일로 바꾸고 중요도를 높음으로 설정해줘">${escapeHTML(state.modal.instruction || "")}</textarea></div><div class="example-list"><button type="button" class="recent-chip" data-action="use-edit-example" data-prompt="마감일을 다음 주 월요일로 바꿔줘">마감일 변경</button><button type="button" class="recent-chip" data-action="use-edit-example" data-prompt="중요도를 높음으로 바꾸고 자료 검토 작업을 추가해줘">중요도·작업 추가</button></div>${state.modal.errorMessage ? `<div class="api-status api-status-error" role="alert"><span aria-hidden="true">!</span><div><strong>${escapeHTML(state.modal.errorMessage)}</strong><p>${escapeHTML(state.modal.errorDetails || "입력 내용은 유지되었습니다.")}</p></div></div>` : ""}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button>${loading ? `<button class="button button-quiet" type="button" data-action="cancel-ai-update">요청 취소</button><button class="button button-primary" type="button" disabled aria-busy="true">수정안 생성 중…</button>` : `<button class="button button-primary" type="submit" data-action="submit-ai-edit">변경안 만들기</button>`}</div></form></section></div>`;
      return;
    }
    if (state.modal.type === "ai-update-preview") {
      const before = state.tasks.find((item) => item.id === state.modal.id);
      const after = state.modal.updatedTask;
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="ai-update-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><div class="modal-kicker">✦ 변경 내용 미리보기</div><h2 id="ai-update-title">이대로 수정할까요?</h2><p>아직 기존 일정은 변경되지 않았습니다.</p>${renderTaskDifferences(before, after)}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="back-to-ai-edit" data-id="${before.id}">요청 수정</button><button class="button button-primary" type="button" data-action="apply-ai-update" data-id="${before.id}">변경 적용</button></div></section></div>`;
      return;
    }
    // 삭제·가져오기·필터 확인 모달
    if (state.modal.type === "confirm-item-delete") {
      const type = state.modal.entityType;
      const item = getDeletableItem(type, state.modal.id);
      const labels = { schedule: "일정", todo: "할 일", project: "프로젝트" };
      const deleteLabels = { schedule: "일정을", todo: "할 일을", project: "프로젝트를" };
      const label = labels[type] || "항목";
      const description = type === "project"
        ? `“${item?.title || "선택한 프로젝트"}”와 중간 목표가 삭제됩니다. 연결된 일정과 할 일은 유지되고 프로젝트 연결만 해제됩니다.`
        : `“${item?.title || `선택한 ${label}`}”을 삭제하면 이 기기에서 복구할 수 없습니다.`;
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="item-delete-title" aria-describedby="item-delete-description"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="item-delete-title">${deleteLabels[type] || "항목을"} 삭제할까요?</h2><p id="item-delete-description">${escapeHTML(description)}</p><div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-danger" type="button" data-action="confirm-delete-item">삭제</button></div></section></div>`;
      return;
    }
    if (state.modal.type === "confirm-data") {
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="data-confirm-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="data-confirm-title">${escapeHTML(state.modal.title)}</h2><p>${escapeHTML(state.modal.description)}</p><div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button ${state.modal.danger ? "button-danger" : "button-primary"}" type="button" data-action="${state.modal.confirmAction}">${escapeHTML(state.modal.confirmLabel || "확인")}</button></div></section></div>`;
      return;
    }
    if (state.modal.type === "confirm-import") {
      modalRoot.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="import-confirm-title"><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="import-confirm-title">백업을 가져올까요?</h2><p>현재 일정과 설정을 백업 파일의 내용으로 교체합니다. API 키는 가져오지 않습니다.</p><div class="api-status api-status-loading"><span aria-hidden="true">i</span><div><strong>일정 ${state.modal.data.schedules.length}개 · 할 일 ${state.modal.data.todos.length}개 · 프로젝트 ${state.modal.data.projects.length}개</strong><p>가져오기 후에는 되돌릴 수 없습니다.</p></div></div><div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">취소</button><button class="button button-primary" type="button" data-action="confirm-import">가져오기</button></div></section></div>`;
      return;
    }
    if (state.modal.type === "filter") {
      const tags = [...new Set(state.tasks.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b, "ko"));
      modalRoot.innerHTML = `<div class="modal-backdrop bottom-sheet-backdrop" data-action="modal-backdrop"><section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title"><div class="sheet-handle" aria-hidden="true"></div><button class="icon-button modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button><h2 id="filter-sheet-title">일정 필터</h2><form id="filter-form" class="modal-form"><div class="field"><label for="sheet-status">일정 상태</label><select id="sheet-status" name="status"><option value="all"${selected("all", state.filters.status)}>모든 상태</option>${Object.entries(statusMeta).map(([value, meta]) => `<option value="${value}"${selected(value, state.filters.status)}>${meta.label}</option>`).join("")}</select></div><div class="field"><label for="sheet-priority">중요도</label><select id="sheet-priority" name="priority"><option value="all"${selected("all", state.filters.priority)}>모든 중요도</option><option value="high"${selected("high", state.filters.priority)}>높음</option><option value="medium"${selected("medium", state.filters.priority)}>보통</option><option value="low"${selected("low", state.filters.priority)}>낮음</option></select></div><div class="field"><label for="sheet-date">날짜 범위</label><select id="sheet-date" name="date"><option value="all"${selected("all", state.filters.date)}>전체 기간</option><option value="today"${selected("today", state.filters.date)}>오늘</option><option value="week"${selected("week", state.filters.date)}>7일 이내</option><option value="overdue"${selected("overdue", state.filters.date)}>마감 초과</option></select></div><div class="field"><label for="sheet-tag">태그</label><select id="sheet-tag" name="tag"><option value="all"${selected("all", state.filters.tag)}>모든 태그</option>${tags.map((tag) => `<option value="${escapeHTML(tag)}"${selected(tag, state.filters.tag)}>${escapeHTML(tag)}</option>`).join("")}</select></div><div class="modal-actions"><button class="button button-secondary" type="button" data-action="reset-sheet-filter">초기화</button><button class="button button-primary" type="submit">필터 적용</button></div></form></section></div>`;
    }
  }

  // 프로젝트 구체화 제안 정규화
  function createLocalProjectProposal(goal, existing) {
    const startDate = existing?.startDate || toISODate(today);
    const endDate = existing?.endDate && existing.endDate > startDate ? existing.endDate : toISODate(addDays(fromISODate(startDate), 60));
    const totalDays = Math.max(7, Math.round((fromISODate(endDate) - fromISODate(startDate)) / 86400000));
    const dateAt = (ratio) => toISODate(addDays(fromISODate(startDate), Math.min(totalDays, Math.max(0, Math.round(totalDays * ratio)))));
    const cleanGoal = String(goal || "새 프로젝트").trim();
    const title = existing?.title || (cleanGoal.length > 34 ? `${cleanGoal.slice(0, 34)}…` : cleanGoal);
    return {
      title,
      goal: cleanGoal,
      description: `${cleanGoal}\n\n목표를 준비·실행·마무리 단계로 나눈 프로젝트입니다.`,
      startDate,
      endDate,
      milestones: [
        { title: "범위와 성공 기준 확정", date: dateAt(0.18) },
        { title: "핵심 결과물 초안 완료", date: dateAt(0.58) },
        { title: "최종 검토 및 공개", date: endDate }
      ],
      schedules: [
        { title: "프로젝트 시작 회고 및 범위 정리", startDate: dateAt(0.05) },
        { title: "중간 진행 상황 점검", startDate: dateAt(0.5) },
        { title: "최종 결과 검토", startDate: dateAt(0.92) }
      ],
      todos: [
        { title: "필요한 자료와 도구 목록 만들기", dueDate: dateAt(0.04) },
        { title: "첫 실행 항목 담당과 순서 정하기", dueDate: dateAt(0.1) },
        { title: "완료 기준 체크리스트 준비하기", dueDate: dateAt(0.75) }
      ]
    };
  }

  function normalizeProjectProposal(raw, goal, existing) {
    const fallback = createLocalProjectProposal(goal, existing);
    const startDate = isValidDateString(raw?.startDate) ? raw.startDate : fallback.startDate;
    const endDate = isValidDateString(raw?.endDate) && raw.endDate >= startDate ? raw.endDate : fallback.endDate;
    const normalizeItems = (items, fallbackItems, dateKey) => {
      const source = Array.isArray(items) && items.length ? items : fallbackItems;
      return source.slice(0, 8).map((item, index) => ({
        title: String(item?.title || fallbackItems[index % fallbackItems.length]?.title || "새 항목").trim().slice(0, 120),
        [dateKey]: isValidDateString(item?.[dateKey]) ? item[dateKey] : fallbackItems[index % fallbackItems.length]?.[dateKey]
      })).filter((item) => item.title);
    };
    return {
      title: String(raw?.title || fallback.title).trim().slice(0, 120) || fallback.title,
      goal: String(raw?.goal || goal || fallback.goal).trim().slice(0, 1000),
      description: String(raw?.description || fallback.description).trim().slice(0, 3000),
      startDate,
      endDate,
      milestones: normalizeItems(raw?.milestones, fallback.milestones, "date"),
      schedules: normalizeItems(raw?.schedules, fallback.schedules, "startDate"),
      todos: normalizeItems(raw?.todos, fallback.todos, "dueDate")
    };
  }

  async function startProjectDetailing(form) {
    const data = new FormData(form);
    const goal = String(data.get("goal") || "").trim();
    const projectId = Number(data.get("projectId")) || null;
    const existing = state.plans.find((item) => item.id === projectId);
    if (!goal) return showToast("구체화할 목표를 입력해 주세요.");
    state.modal = { type: "detail-project", projectId, goal, status: "loading" };
    renderModal();
    const request = beginRequest("project-detail", state.apiSettings.timeout);
    try {
      let raw;
      if (state.apiSettings.provider === "mock") {
        await delayWithSignal(750, request.controller.signal);
        raw = createLocalProjectProposal(goal, existing);
      } else {
        const validation = validateApiSettings(state.apiSettings, getApiKey());
        if (!validation.valid) throw createApiError("SETTINGS", validation.errors.join(" "));
        const messages = [{ role: "system", content: `당신은 프로젝트 구체화 도우미입니다. 기준 날짜는 ${toISODate(new Date())}, 시간대는 Asia/Seoul입니다. 목표를 실행 가능한 프로젝트로 나누세요. 각 목록은 3~6개로 제한하고 모든 날짜는 프로젝트 기간 안에 두세요. Markdown이나 설명 없이 주어진 JSON Schema를 만족하는 JSON 하나만 반환하세요. JSON Schema: ${aiSchemaSummary(PROJECT_DETAIL_SCHEMA)}` }, { role: "user", content: `${existing ? `기존 프로젝트: ${JSON.stringify(existing)}\n` : ""}구체화할 목표: ${goal}` }];
        raw = parseAiResponse(await callConfiguredApi(messages, state.apiSettings, request.controller.signal, { schema: PROJECT_DETAIL_SCHEMA, schemaName: "project_detail", maxOutputTokens: 3600 }));
      }
      const proposal = normalizeProjectProposal(raw, goal, existing);
      state.modal = { type: "project-detail-preview", projectId, goal, proposal };
      renderModal();
    } catch (error) {
      const mapped = mapApiError(error, request);
      if (mapped.code !== "cancelled") {
        state.modal = { type: "detail-project", projectId, goal, status: "error", errorMessage: mapped.message };
        renderModal();
      }
    } finally {
      finishRequest(request);
    }
  }

  function applyProjectDetailProposal(form) {
    if (state.modal?.type !== "project-detail-preview") return;
    const proposal = state.modal.proposal;
    const data = new FormData(form);
    const projectId = Number(data.get("projectId")) || null;
    const existing = state.plans.find((item) => item.id === projectId);
    const startDate = String(data.get("startDate") || "");
    const endDate = String(data.get("endDate") || "");
    if (!isValidDateString(startDate) || !isValidDateString(endDate) || endDate < startDate) return showToast("프로젝트 기간을 확인해 주세요.");
    const project = normalizePlan({
      ...existing,
      id: existing?.id || nextId(state.plans),
      title: String(data.get("title") || "").trim(),
      goal: proposal.goal,
      description: String(data.get("description") || "").trim(),
      startDate,
      endDate,
      status: existing?.status || "active",
      calendarColor: existing?.calendarColor || DEFAULT_PLAN_COLOR,
      milestones: existing?.milestones || [],
      linkedScheduleIds: existing?.linkedScheduleIds || [],
      linkedTodoIds: existing?.linkedTodoIds || [],
      createdAt: existing?.createdAt || new Date().toISOString()
    }, 0);
    if (!project) return showToast("프로젝트 이름을 입력해 주세요.");
    proposal.milestones.forEach((item, index) => {
      if (data.get(`milestone-${index}`) !== "on") return;
      const date = item.date < startDate ? startDate : item.date > endDate ? endDate : item.date;
      const milestone = normalizeMilestone({ id: nextId(project.milestones), title: String(data.get(`milestone-title-${index}`) || item.title).trim(), date, completed: false }, 0, endDate);
      if (milestone) project.milestones.push(milestone);
    });
    if (existing) state.plans[state.plans.findIndex((item) => item.id === existing.id)] = project;
    else state.plans.unshift(project);
    proposal.schedules.forEach((item, index) => {
      if (data.get(`schedule-${index}`) !== "on") return;
      const date = item.startDate < startDate ? startDate : item.startDate > endDate ? endDate : item.startDate;
      const schedule = normalizeStoredTask({ id: nextId(state.schedules), title: String(data.get(`schedule-title-${index}`) || item.title).trim(), startDate: date, endDate: date, allDay: true, calendarColor: project.calendarColor, planId: project.id, status: "scheduled", duration: "1시간", priority: "medium", difficulty: "보통", tags: ["프로젝트"], description: project.goal, subtasks: [], createdAt: new Date().toISOString() }, 0);
      if (schedule) { state.schedules.push(schedule); project.linkedScheduleIds.push(schedule.id); }
    });
    proposal.todos.forEach((item, index) => {
      if (data.get(`todo-${index}`) !== "on") return;
      const dueDate = item.dueDate < startDate ? startDate : item.dueDate > endDate ? endDate : item.dueDate;
      const todo = normalizeTodo({ id: nextId(state.todos), title: String(data.get(`todo-title-${index}`) || item.title).trim(), dueDate, priority: "medium", planId: project.id, tags: ["프로젝트"], completed: false, createdAt: new Date().toISOString() }, 0);
      if (todo) { state.todos.push(todo); project.linkedTodoIds.push(todo.id); }
    });
    persistAppData();
    closeModal();
    window.location.hash = `plan-detail?id=${project.id}`;
    render();
    showToast("구체화한 프로젝트 내용을 저장했습니다.");
  }

  function saveProfileName(form) {
    const name = String(new FormData(form).get("displayName") || "").trim();
    if (!name || name.length > 30) return showToast("사용자 이름은 공백을 제외하고 1~30자로 입력해 주세요.");
    state.profile = { displayName: name };
    persistAppData();
    if (state.modal?.type === "edit-profile-name") closeModal();
    updateProfileDisplay();
    const settingsNameInput = document.getElementById("profile-display-name");
    if (settingsNameInput) settingsNameInput.value = name;
    showToast("사용자 이름을 수정했습니다.");
  }

  function setDashboardCopyError(input, errorId, message) {
    const error = document.getElementById(errorId);
    if (message) {
      input.setAttribute("aria-invalid", "true");
      if (error) {
        error.textContent = message;
        error.classList.remove("is-hidden");
      }
      return false;
    }
    input.removeAttribute("aria-invalid");
    error?.classList.add("is-hidden");
    return true;
  }

  function saveDashboardCopy(form) {
    const headlineInput = form.elements.headline;
    const subtitleInput = form.elements.subtitle;
    const headline = String(headlineInput.value || "").trim();
    const subtitle = String(subtitleInput.value || "").trim();
    const headlineValid = setDashboardCopyError(headlineInput, "dashboard-headline-error", !headline || headline.length > 80 ? "큰 문구를 공백 제외 1~80자로 입력해 주세요." : "");
    const subtitleValid = setDashboardCopyError(subtitleInput, "dashboard-subtitle-error", !subtitle || subtitle.length > 120 ? "작은 문구를 공백 제외 1~120자로 입력해 주세요." : "");
    if (!headlineValid || !subtitleValid) {
      (headlineValid ? subtitleInput : headlineInput).focus();
      return;
    }
    state.dashboardHeadline = headline;
    state.dashboardSubtitle = subtitle;
    if (!persistAppData()) return;
    closeModal();
    render();
    window.requestAnimationFrame(() => document.querySelector('[data-action="edit-dashboard-copy"]')?.focus());
    showToast("대시보드 문구를 저장했습니다.");
  }

  // 직접 입력 항목 저장
  function saveTaskFromForm(form) {
    const data = new FormData(form);
    const id = Number(data.get("id"));
    const existing = state.tasks.find((task) => task.id === id);
    try {
      const updated = taskFromEditorData(form, existing || {});
      if (updated.endDate > updated.startDate) {
        const project = normalizePlan({
          id: nextId(state.plans),
          title: updated.title,
          goal: updated.description,
          description: updated.description,
          startDate: updated.startDate,
          endDate: updated.endDate,
          status: "active",
          calendarColor: updated.calendarColor,
          priority: updated.priority,
          tags: updated.tags,
          checklist: updated.subtasks,
          milestones: [],
          linkedScheduleIds: [],
          linkedTodoIds: [],
          createdAt: existing?.createdAt || new Date().toISOString()
        }, 0);
        if (!project) throw new Error("프로젝트 이름과 기간을 확인해 주세요.");
        if (existing) state.tasks = state.tasks.filter((item) => item.id !== existing.id);
        state.plans.unshift(project);
        persistAppData();
        closeModal();
        window.location.hash = `plan-detail?id=${project.id}`;
        render();
        showToast("여러 날 항목을 프로젝트로 저장했습니다.");
        return;
      }
      updated.id = existing?.id || nextId(state.tasks);
      updated.status = String(data.get("status") || existing?.status || "scheduled");
      updated.createdAt = existing?.createdAt || new Date().toISOString();
      if (updated.status === "completed") updated.completedAt = existing?.completedAt || new Date().toISOString();
      else delete updated.completedAt;
      if (existing) state.tasks[state.tasks.findIndex((item) => item.id === existing.id)] = updated;
      else state.tasks.unshift(updated);
      persistAppData();
      closeModal();
      render();
      showToast(existing ? "일정 정보를 수정했습니다." : "새 일정을 추가했습니다.");
    } catch (error) {
      showToast(error.message || "일정 날짜와 시간을 확인해 주세요.");
    }
  }

  // 항목 삭제와 연결 관계 정리
  function getDeletableItem(type, id) {
    const itemId = Number(id);
    if (type === "schedule") return state.schedules.find((item) => item.id === itemId) || null;
    if (type === "todo") return state.todos.find((item) => item.id === itemId) || null;
    if (type === "project") return state.projects.find((item) => item.id === itemId) || null;
    return null;
  }

  function requestItemDelete(type, id) {
    const item = getDeletableItem(type, id);
    if (!item) {
      showToast("삭제할 항목을 찾지 못했습니다.");
      return;
    }
    if (!state.confirmBeforeDelete) {
      executeItemDelete(type, item.id);
      return;
    }
    openModal("confirm-item-delete", { entityType: type, id: item.id });
  }

  function executeItemDelete(type, id) {
    const item = getDeletableItem(type, id);
    if (!item) {
      if (state.modal) closeModal();
      showToast("삭제할 항목을 찾지 못했습니다.");
      return false;
    }

    const itemId = Number(item.id);
    const labels = { schedule: "일정을", todo: "할 일을", project: "프로젝트를" };
    const shouldNavigate = (type === "schedule" && state.route === "task-detail" && state.selectedTaskId === itemId)
      || (type === "project" && state.route === "plan-detail" && state.selectedPlanId === itemId);
    const destination = type === "schedule" ? "tasks" : "plans";

    if (type === "schedule") {
      state.schedules = state.schedules.filter((entry) => entry.id !== itemId);
      state.projects.forEach((project) => {
        project.linkedScheduleIds = project.linkedScheduleIds.filter((linkedId) => linkedId !== itemId);
      });
      if (state.selectedTaskId === itemId) state.selectedTaskId = null;
    }
    if (type === "todo") {
      state.todos = state.todos.filter((entry) => entry.id !== itemId);
      state.projects.forEach((project) => {
        project.linkedTodoIds = project.linkedTodoIds.filter((linkedId) => linkedId !== itemId);
      });
    }
    if (type === "project") {
      state.projects = state.projects.filter((entry) => entry.id !== itemId);
      state.schedules.forEach((entry) => { if (entry.planId === itemId) entry.planId = null; });
      state.todos.forEach((entry) => { if (entry.planId === itemId) entry.planId = null; });
      state.projects.forEach((entry) => { if (entry.parentProjectId === itemId) entry.parentProjectId = null; });
      if (state.selectedPlanId === itemId) state.selectedPlanId = null;
    }

    persistAppData();
    if (state.modal) closeModal();
    if (shouldNavigate) {
      if (window.location.hash === `#${destination}`) render();
      else window.location.hash = destination;
    } else {
      render();
    }
    showToast(`“${item.title}” ${labels[type]} 삭제했습니다.`);
    return true;
  }

  function saveTodoFromForm(form) {
    const data = new FormData(form);
    const id = Number(data.get("id"));
    const existing = state.todos.find((item) => item.id === id);
    const dueDate = String(data.get("dueDate") || "");
    const dueTime = String(data.get("dueTime") || "");
    if (dueDate && !isValidDateString(dueDate)) return showToast("할 일 기한 날짜를 확인해 주세요.");
    if (dueTime && !dueDate) return showToast("시간을 지정하려면 기한 날짜도 선택해 주세요.");
    const completed = existing ? data.get("completed") === "on" : false;
    const todo = normalizeTodo({
      ...existing,
      id: existing?.id || nextId(state.todos),
      title: String(data.get("title") || "").trim(),
      description: String(data.get("description") || "").trim(),
      priority: String(data.get("priority") || "medium"),
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      planId: Number(data.get("planId")) || null,
      completed,
      completedAt: completed ? existing?.completedAt || new Date().toISOString() : null,
      createdAt: existing?.createdAt || new Date().toISOString()
    }, 0);
    if (!todo) return showToast("할 일 이름을 입력해 주세요.");
    if (existing) state.todos[state.todos.findIndex((item) => item.id === id)] = todo;
    else state.todos.unshift(todo);
    persistAppData();
    closeModal();
    render();
    showToast(existing ? "할 일을 수정했습니다." : "할 일을 추가했습니다.");
  }

  function addQuickTodo(title) {
    const value = String(title || "").trim();
    if (!value) return;
    state.todos.unshift(normalizeTodo({ id: nextId(state.todos), title: value, priority: "medium", dueDate: toISODate(today), completed: false, tags: ["빠른 추가"], createdAt: new Date().toISOString() }, 0));
    persistAppData();
    render();
    showToast("할 일을 빠르게 추가했습니다.");
  }

  function convertTodoToSchedule(id) {
    const todo = state.todos.find((item) => item.id === Number(id));
    if (!todo) return;
    const schedule = normalizeStoredTask({ id: nextId(state.schedules), title: todo.title, startDate: todo.dueDate || toISODate(today), endDate: todo.dueDate || toISODate(today), allDay: !todo.dueTime, startTime: todo.dueTime || null, endTime: null, calendarColor: todo.calendarColor || DEFAULT_SCHEDULE_COLOR, status: "scheduled", duration: "1시간", priority: todo.priority, difficulty: "보통", tags: [...todo.tags, "할 일 전환"], description: todo.description || "할 일에서 일정으로 전환했습니다.", subtasks: [], planId: todo.planId, createdAt: new Date().toISOString() }, 0);
    state.schedules.unshift(schedule);
    state.todos = state.todos.filter((item) => item.id !== todo.id);
    persistAppData();
    render();
    showToast("할 일을 일정으로 전환했습니다.");
  }

  function savePlanFromForm(form) {
    const data = new FormData(form);
    const id = Number(data.get("id"));
    const existing = state.plans.find((item) => item.id === id);
    const startDate = String(data.get("startDate") || "");
    const endDate = String(data.get("endDate") || "");
    if (!isValidDateString(startDate) || !isValidDateString(endDate) || endDate < startDate) return showToast("계획의 시작일과 종료일을 확인해 주세요.");
    const plan = normalizePlan({ ...existing, id: existing?.id || nextId(state.plans), title: String(data.get("title") || "").trim(), description: String(data.get("description") || "").trim(), startDate, endDate, status: String(data.get("status") || "active"), calendarColor: String(data.get("calendarColor") || DEFAULT_PLAN_COLOR), milestones: existing?.milestones || [], linkedScheduleIds: existing?.linkedScheduleIds || [], linkedTodoIds: existing?.linkedTodoIds || [], createdAt: existing?.createdAt || new Date().toISOString() }, 0);
    if (!plan) return showToast("계획 제목을 입력해 주세요.");
    if (existing) state.plans[state.plans.findIndex((item) => item.id === id)] = plan;
    else state.plans.unshift(plan);
    persistAppData();
    closeModal();
    render();
    showToast(existing ? "프로젝트를 수정했습니다." : "프로젝트를 추가했습니다.");
  }

  function saveMilestoneFromForm(form) {
    const data = new FormData(form);
    const plan = state.plans.find((item) => item.id === Number(data.get("planId")));
    if (!plan) return showToast("연결할 프로젝트를 찾지 못했습니다.");
    const date = String(data.get("date") || "");
    if (!isValidDateString(date) || date < plan.startDate || date > plan.endDate) return showToast("중간 목표 날짜는 프로젝트 기간 안에 있어야 합니다.");
    const id = Number(data.get("id"));
    const existing = plan.milestones.find((item) => item.id === id);
    const milestone = normalizeMilestone({ ...existing, id: existing?.id || nextId(plan.milestones), title: String(data.get("title") || "").trim(), date, description: String(data.get("description") || "").trim(), completed: data.get("completed") === "on" }, 0, plan.endDate);
    if (!milestone) return showToast("중간 목표 이름을 입력해 주세요.");
    if (existing) plan.milestones[plan.milestones.findIndex((item) => item.id === id)] = milestone;
    else plan.milestones.push(milestone);
    persistAppData();
    closeModal();
    render();
    showToast(existing ? "중간 목표를 수정했습니다." : "중간 목표를 추가했습니다.");
  }

  function taskFromEditorData(form, baseTask) {
    const data = new FormData(form);
    const base = baseTask || {};
    const tags = String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
    const previousSubtasks = Array.isArray(base.subtasks) ? base.subtasks : [];
    const subtasks = String(data.get("subtasks") || "").split(/\r?\n/).map((title) => title.trim()).filter(Boolean).slice(0, 30).map((title) => ({ title, done: Boolean(previousSubtasks.find((item) => item.title === title)?.done) }));
    const startDate = String(data.get("startDate") || "");
    const endDate = String(data.get("periodType")) === "range" ? String(data.get("endDate") || "") : startDate;
    const allDay = data.get("allDay") === "on";
    const startTime = allDay ? null : String(data.get("startTime") || "") || null;
    const endTime = allDay ? null : String(data.get("endTime") || "") || null;
    if (!isValidDateString(startDate) || !isValidDateString(endDate)) throw new Error("시작일과 종료일을 올바르게 입력해 주세요.");
    if (endDate < startDate) throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
    if (!allDay && startTime && !isValidTimeString(startTime)) throw new Error("시작 시간을 확인해 주세요.");
    if (!allDay && endTime && !isValidTimeString(endTime)) throw new Error("종료 시간을 확인해 주세요.");
    if (!allDay && startDate === endDate && startTime && endTime && endTime <= startTime) throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
    return validateTaskPayload({
      title: String(data.get("title") || "").trim(),
      startDate,
      endDate,
      date: startDate,
      allDay,
      startTime,
      endTime,
      calendarColor: normalizeColor(data.get("calendarColor"), DEFAULT_SCHEDULE_COLOR),
      planId: Number(data.get("planId")) || null,
      duration: String(data.get("duration") || "1시간").trim(),
      priority: String(data.get("priority") || "medium"),
      difficulty: String(data.get("difficulty") || "보통"),
      tags,
      description: String(data.get("description") || "").trim() || "추가 설명이 없습니다.",
      subtasks
    }, base);
  }

  // AI 생성 미리보기 저장
  function commitCreatePreview(form) {
    try {
      const task = taskFromEditorData(form, state.generation.previewTask || {});
      task.id = Math.max(0, ...state.tasks.map((item) => item.id)) + 1;
      task.createdAt = toISODate(today);
      task.status = "scheduled";
      state.tasks.unshift(task);
      state.generation.previewTask = null;
      state.generation.newTaskId = task.id;
      state.generation.status = "success";
      state.selectedDate = task.date;
      persistAppData();
      closeModal();
      render();
      showToast(`“${task.title}” 일정을 저장했습니다.`);
    } catch (error) {
      showToast(error.message || "일정 내용을 확인해 주세요.");
    }
  }

  function commitAiEntityPreview(form) {
    const data = new FormData(form);
    const type = String(data.get("entityType") || state.generation.previewType || "schedule");
    try {
      let entity;
      if (type === "schedule") {
        entity = taskFromEditorData(form, state.generation.previewEntity || {});
        if (entity.endDate > entity.startDate) {
          entity = normalizePlan({ id: nextId(state.plans), title: entity.title, goal: entity.description, description: entity.description, startDate: entity.startDate, endDate: entity.endDate, status: "active", calendarColor: entity.calendarColor, priority: entity.priority, tags: entity.tags, checklist: entity.subtasks, milestones: [], linkedScheduleIds: [], linkedTodoIds: [], createdAt: new Date().toISOString() }, 0);
          state.plans.unshift(entity);
          state.generation.previewType = "plan";
          state.generation.newEntityId = entity.id;
        } else {
          entity.id = nextId(state.schedules);
          entity.status = "scheduled";
          entity.createdAt = new Date().toISOString();
          state.schedules.unshift(entity);
          state.generation.newTaskId = entity.id;
          state.selectedDate = entity.startDate;
        }
      }
      if (type === "todo") {
        entity = normalizeTodo({ ...state.generation.previewEntity, id: nextId(state.todos), title: String(data.get("title") || "").trim(), dueDate: String(data.get("dueDate") || "") || null, dueTime: String(data.get("dueTime") || "") || null, priority: String(data.get("priority") || "medium"), planId: Number(data.get("planId")) || null, tags: String(data.get("tags") || "").split(",").map((item) => item.trim()).filter(Boolean), description: String(data.get("description") || "").trim(), completed: false, createdAt: new Date().toISOString() }, 0);
        if (!entity) throw new Error("할 일 이름을 확인해 주세요.");
        state.todos.unshift(entity);
      }
      if (type === "plan") {
        const startDate = String(data.get("startDate") || "");
        const endDate = String(data.get("endDate") || "");
        if (!isValidDateString(startDate) || !isValidDateString(endDate) || endDate < startDate) throw new Error("계획 기간을 확인해 주세요.");
        entity = normalizePlan({ ...state.generation.previewEntity, id: nextId(state.plans), title: String(data.get("title") || "").trim(), startDate, endDate, status: String(data.get("status") || "active"), calendarColor: String(data.get("calendarColor") || DEFAULT_PLAN_COLOR), description: String(data.get("description") || "").trim(), createdAt: new Date().toISOString() }, 0);
        if (!entity) throw new Error("계획 제목을 확인해 주세요.");
        state.plans.unshift(entity);
      }
      if (type === "milestone") {
        const plan = state.plans.find((item) => item.id === Number(data.get("parentPlanId")));
        if (!plan) throw new Error("연결할 프로젝트를 선택해 주세요.");
        entity = normalizeMilestone({ id: nextId(plan.milestones), title: String(data.get("title") || "").trim(), date: String(data.get("date") || ""), description: String(data.get("description") || ""), completed: false }, 0, plan.endDate);
        if (!entity || entity.date < plan.startDate || entity.date > plan.endDate) throw new Error("중간 목표 날짜는 프로젝트 기간 안에 있어야 합니다.");
        plan.milestones.push(entity);
        state.generation.parentPlanId = plan.id;
      }
      state.generation.previewEntity = entity;
      state.generation.newEntityId = entity.id;
      state.generation.status = "success";
      persistAppData();
      closeModal();
      render();
      showToast("AI 생성 내용을 저장했습니다.");
    } catch (error) {
      showToast(error.message || "AI 생성 내용을 확인해 주세요.");
    }
  }

  // API 연결 설정 저장과 테스트
  function readApiSettingsForm(form) {
    const data = new FormData(form);
    const provider = String(data.get("provider") || "mock");
    const providerMeta = API_PROVIDERS[provider] || API_PROVIDERS.mock;
    return {
      settings: {
        provider,
        endpoint: providerMeta.endpointLocked ? providerMeta.endpoint : String(data.get("endpoint") || "").trim().replace(/\/+$/, ""),
        model: String(data.get("model") || providerMeta.model).trim(),
        rememberApiKey: data.get("rememberApiKey") === "on",
        timeout: Math.min(120, Math.max(5, Number(data.get("timeout")) || 20))
      },
      apiKey: provider === "mock" ? "" : String(data.get("apiKey") || "").trim()
    };
  }

  function saveApiSettingsFromForm(form, quiet) {
    const result = readApiSettingsForm(form);
    const validation = validateApiSettings(result.settings, result.apiKey);
    if (!validation.valid) {
      state.apiTest = createApiConnectionFailure({
        message: "API 연결 설정을 확인해 주세요.",
        details: validation.errors.join(" ")
      });
      if (!quiet) refreshApiSettingsCard();
      return null;
    }
    state.apiSettings = result.settings;
    if (result.settings.rememberApiKey && result.settings.provider !== "mock") {
      state.apiProfiles[result.settings.provider] = {
        provider: result.settings.provider,
        endpoint: result.settings.endpoint,
        model: result.settings.model,
        timeout: result.settings.timeout,
        rememberApiKey: true
      };
      try { sessionStorage.removeItem(API_PROFILE_SESSION_KEY); } catch (error) { /* 저장 방식 전환 실패 시 키 저장 유지 */ }
    } else {
      delete state.apiProfiles[result.settings.provider];
      try { sessionStorage.setItem(API_PROFILE_SESSION_KEY, JSON.stringify({ ...result.settings, rememberApiKey: false })); } catch (error) { /* 세션 저장 불가 시 메모리에서만 유지 */ }
    }
    saveApiKey(result.apiKey, result.settings.rememberApiKey, result.settings.provider);
    persistAppData();
    if (!quiet) {
      state.apiTest = { status: "success", message: "AI 연결 설정을 저장했습니다.", details: result.settings.provider === "mock" ? "체험 모드는 외부 네트워크를 사용하지 않습니다." : "설정과 API 키는 선택한 보관 방식에 따라 서비스별로 저장됩니다." };
      refreshApiSettingsCard();
      showToast("AI API 설정을 저장했습니다.");
    }
    return result;
  }

  async function testApiConnection(settings, signal) {
    if (settings.provider === "mock") {
      await delayWithSignal(650, signal);
      if (settings.model.includes("error")) throw createApiError("MOCK_FAILURE", "Mock 연결 실패 시나리오입니다.");
      if (settings.model.includes("timeout")) throw createApiError("TIMEOUT", "Mock 응답 시간이 초과되었습니다.");
      return `체험 모드 · ${settings.model || "mock-planner-v1"}`;
    }
    await callConfiguredApi([
      { role: "system", content: `연결 확인 요청입니다. 주어진 JSON Schema를 만족하는 JSON 하나만 반환하세요. JSON Schema: ${aiSchemaSummary(CONNECTION_TEST_SCHEMA)}` },
      { role: "user", content: "연결 상태가 정상이면 ok를 true로 반환하세요." }
    ], settings, signal, { schema: CONNECTION_TEST_SCHEMA, schemaName: "connection_test", maxOutputTokens: 100 });
    return `${settings.model} · ${providerSupportsJsonSchema(settings) ? "JSON Schema" : "기본 JSON 모드"}`;
  }

  function createApiConnectionFailure(mapped) {
    const reason = String(mapped?.message || "API 서버에 연결할 수 없습니다.").trim();
    const guidance = String(mapped?.details || "").trim();
    return {
      status: "error",
      message: "AI API 연결에 실패했습니다.",
      details: [`원인: ${reason}`, guidance].filter(Boolean).join(" ")
    };
  }

  async function runApiTest() {
    const form = document.getElementById("api-settings-form");
    if (!form) return;
    const saved = saveApiSettingsFromForm(form, true);
    if (!saved) {
      refreshApiSettingsCard();
      return;
    }
    state.apiTest = { status: "loading", message: "API 연결을 확인하고 있습니다.", details: "" };
    refreshApiSettingsCard();
    const request = beginRequest("api-test", saved.settings.timeout);
    try {
      const model = await testApiConnection(saved.settings, request.controller.signal);
      state.apiTest = { status: "success", message: "AI API 연결에 성공했습니다.", details: `사용 모델: ${model}` };
    } catch (error) {
      const mapped = mapApiError(error, request);
      if (mapped.code === "cancelled") state.apiTest = { status: "idle", message: "연결 테스트를 취소했습니다.", details: "" };
      else {
        state.apiTest = createApiConnectionFailure(mapped);
        showToast("AI API 연결에 실패했습니다.");
      }
    } finally {
      finishRequest(request);
      if (state.route === "settings") refreshApiSettingsCard();
    }
  }

  // 할 일·프로젝트·중간 목표 AI 수정
  function getGenericEntity(type, id, planId) {
    if (type === "todo") return state.todos.find((item) => item.id === Number(id));
    if (type === "plan") return state.plans.find((item) => item.id === Number(id));
    if (type === "milestone") return state.plans.find((item) => item.id === Number(planId))?.milestones.find((item) => item.id === Number(id));
    return null;
  }

  function mockGenericUpdate(type, entity, instruction) {
    const changes = {};
    const inferredDate = /(오늘|내일|모레|주말|요일|다음 주)/.test(instruction) ? inferMockDate(instruction) : null;
    if (inferredDate) {
      if (type === "todo") changes.dueDate = inferredDate;
      if (type === "plan") changes.endDate = inferredDate < entity.startDate ? entity.startDate : inferredDate;
      if (type === "milestone") changes.date = inferredDate;
    }
    if (instruction.includes("중요도") && type === "todo") changes.priority = instruction.includes("높") ? "high" : instruction.includes("낮") ? "low" : "medium";
    if (instruction.includes("완료")) changes.completed = !instruction.includes("미완료");
    if (instruction.includes("보류") && type === "plan") changes.status = "paused";
    const color = instruction.match(/#[0-9a-f]{6}/i);
    if (color && type === "plan") changes.calendarColor = color[0];
    const titleMatch = instruction.match(/제목(?:을|은)?\s*[‘'"]?([^‘'".]+)[’'"]?로\s*바/);
    if (titleMatch) changes.title = titleMatch[1].trim();
    if (!Object.keys(changes).length) changes.description = `${entity.description || ""}\nAI 수정: ${instruction}`.trim();
    return { schemaVersion: AI_SCHEMA_VERSION, entityType: type, action: "update", targetId: entity.id, parentPlanId: type === "milestone" ? Number(entity.planId) || null : null, needsConfirmation: false, confirmationMessage: "", data: { ...getEditableEntityData(type, entity), ...changes } };
  }

  async function startAiEntityUpdate(type, id, planId, instruction) {
    const entity = getGenericEntity(type, id, planId);
    if (!entity) return showToast("수정할 항목을 찾지 못했습니다.");
    const settingsCheck = validateApiSettings(state.apiSettings, getApiKey());
    if (!settingsCheck.valid) {
      closeModal(); window.location.hash = "settings"; state.apiTest = { status: "error", message: settingsCheck.errors[0], details: settingsCheck.errors.slice(1).join(" ") }; render(); showToast("AI API 설정을 먼저 완료해 주세요."); return;
    }
    state.modal = { type: "ai-edit-entity", entityType: type, id: Number(id), planId: Number(planId) || null, instruction, status: "loading" };
    renderModal();
    const request = beginRequest("ai-entity-update", state.apiSettings.timeout);
    try {
      let parsed;
      if (state.apiSettings.provider === "mock") {
        await delayWithSignal(700, request.controller.signal);
        parsed = mockGenericUpdate(type, entity, instruction);
      } else {
        const schema = getUpdateEnvelopeSchema(type, entity.id);
        const messages = [{ role: "system", content: `기준 날짜는 ${toISODate(new Date())}, 시간대는 Asia/Seoul입니다. 기존 ${type}의 시스템 ID와 생성일은 바꾸지 마세요. data에는 수정 후의 편집 가능한 전체 데이터를 넣고 요청하지 않은 값은 그대로 유지하세요. schemaVersion은 ${AI_SCHEMA_VERSION}입니다. Markdown이나 설명 없이 주어진 JSON Schema를 만족하는 JSON 하나만 반환하세요. JSON Schema: ${aiSchemaSummary(schema)}` }, { role: "user", content: `기존 데이터: ${JSON.stringify(getEditableEntityData(type, entity))}\n수정 요청: ${instruction}` }];
        parsed = normalizeAiEnvelope(parseAiResponse(await callConfiguredApi(messages, state.apiSettings, request.controller.signal, { schema, schemaName: `update_${type}` })));
      }
      if (Number(parsed.schemaVersion) !== AI_SCHEMA_VERSION || parsed.action !== "update" || parsed.entityType !== type || Number(parsed.targetId) !== entity.id || !parsed.data || typeof parsed.data !== "object") throw createApiError("VALIDATION", "AI 수정 응답 형식이 올바르지 않습니다.");
      let updated;
      if (type === "todo") updated = normalizeTodo({ ...entity, ...parsed.data, id: entity.id, createdAt: entity.createdAt }, 0);
      if (type === "plan") updated = normalizePlan({ ...entity, ...parsed.data, id: entity.id, milestones: entity.milestones, linkedScheduleIds: entity.linkedScheduleIds, linkedTodoIds: entity.linkedTodoIds, createdAt: entity.createdAt }, 0);
      if (type === "milestone") {
        const plan = state.plans.find((item) => item.id === Number(planId));
        updated = normalizeMilestone({ ...entity, ...parsed.data, id: entity.id }, 0, plan.endDate);
        if (updated.date < plan.startDate || updated.date > plan.endDate) throw createApiError("VALIDATION", "수정된 중간 목표 날짜가 프로젝트 기간 밖에 있습니다.");
      }
      if (!updated) throw createApiError("VALIDATION", "AI 수정 데이터를 적용할 수 없습니다.");
      state.modal = { type: "ai-entity-update-preview", entityType: type, id: entity.id, planId: Number(planId) || null, instruction, before: entity, after: updated };
      renderModal();
    } catch (error) {
      const mapped = mapApiError(error, request);
      if (mapped.code !== "cancelled") { state.modal = { type: "ai-edit-entity", entityType: type, id: Number(id), planId: Number(planId) || null, instruction, status: "error", errorMessage: mapped.message }; renderModal(); }
    } finally { finishRequest(request); }
  }

  function applyGenericAiUpdate() {
    if (state.modal?.type !== "ai-entity-update-preview") return;
    const { entityType, id, planId, after } = state.modal;
    if (entityType === "todo") state.todos[state.todos.findIndex((item) => item.id === id)] = after;
    if (entityType === "plan") state.plans[state.plans.findIndex((item) => item.id === id)] = after;
    if (entityType === "milestone") {
      const plan = state.plans.find((item) => item.id === planId);
      if (plan) plan.milestones[plan.milestones.findIndex((item) => item.id === id)] = after;
    }
    persistAppData(); closeModal(); render(); showToast("AI 수정 내용을 적용했습니다.");
  }

  // 일정 AI 수정과 변경 미리보기
  async function startAiUpdate(id, instruction) {
    const task = state.tasks.find((item) => item.id === Number(id));
    if (!task) {
      showToast("수정할 일정을 찾지 못했습니다.");
      return;
    }
    const settingsCheck = validateApiSettings(state.apiSettings, getApiKey());
    if (!settingsCheck.valid) {
      closeModal();
      window.location.hash = "settings";
      state.apiTest = { status: "error", message: settingsCheck.errors[0], details: settingsCheck.errors.slice(1).join(" ") };
      render();
      showToast("AI API 설정을 먼저 완료해 주세요.");
      return;
    }
    addRecentPrompt(instruction);
    state.modal = { type: "ai-edit", id: task.id, instruction, status: "loading", errorMessage: "", errorDetails: "" };
    renderModal();
    const request = beginRequest("ai-update", state.apiSettings.timeout);
    try {
      const parsed = await requestParsedAiSchedule(instruction, { mode: "update", task }, request.controller.signal);
      if (Number(parsed.schemaVersion) !== AI_SCHEMA_VERSION || parsed.action !== "update" || parsed.entityType !== "schedule" || Number(parsed.targetId) !== task.id || !parsed.data || typeof parsed.data !== "object") throw createApiError("VALIDATION", "AI가 일정 수정 형식과 다른 응답을 반환했습니다.");
      const allowed = ["title", "status", "startDate", "endDate", "allDay", "startTime", "endTime", "calendarColor", "planId", "duration", "priority", "difficulty", "tags", "description", "subtasks"];
      const updatedData = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => allowed.includes(key)));
      const updatedTask = validateTaskPayload(updatedData, task);
      updatedTask.id = task.id;
      updatedTask.createdAt = task.createdAt;
      if (task.completedAt) updatedTask.completedAt = task.completedAt;
      state.modal = { type: "ai-update-preview", id: task.id, instruction, updatedTask };
      renderModal();
    } catch (error) {
      const mapped = mapApiError(error, request);
      if (mapped.code === "cancelled") return;
      state.modal = { type: "ai-edit", id: task.id, instruction, status: "error", errorMessage: mapped.message, errorDetails: mapped.details };
      renderModal();
    } finally {
      finishRequest(request);
    }
  }

  function applyAiUpdate(id) {
    const index = state.tasks.findIndex((task) => task.id === Number(id));
    if (index < 0 || state.modal?.type !== "ai-update-preview") return;
    const updated = state.modal.updatedTask;
    state.tasks[index] = updated;
    persistAppData();
    closeModal();
    render();
    showToast("AI 수정 내용을 일정에 적용했습니다.");
  }

  // API 키를 제외한 백업 생성
  function exportAppData() {
    const payload = {
      version: APP_DATA_VERSION,
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      schedules: state.schedules,
      todos: state.todos,
      projects: state.projects,
      preferences: { dashboardHeadline: state.dashboardHeadline, dashboardSubtitle: state.dashboardSubtitle, theme: state.theme, reduceMotion: state.reduceMotion, confirmBeforeDelete: state.confirmBeforeDelete, startPage: state.startPage, calendarView: state.calendarView, lastAiMode: state.generation.mode, calendarFilters: state.calendarFilters },
      recentPrompts: state.recentPrompts,
      apiSettings: { ...state.apiSettings, rememberApiKey: false, profiles: state.apiProfiles },
      lastSavedAt: state.lastSavedAt
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AutoAiPlanner-backup-${toISODate(today)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("API 키를 제외한 백업 파일을 만들었습니다.");
  }

  function restoreMockData() {
    state.schedules = createMockTasks().map(normalizeStoredTask).filter(Boolean);
    state.todos = createMockTodos();
    state.plans = createMockPlans();
    persistAppData();
    closeModal();
    render();
    showToast("예시 데이터를 복원했습니다.");
  }

  // 저장 데이터와 현재 상태 초기화
  function clearAllData() {
    try {
      localStorage.removeItem(APP_STORAGE_KEY);
      localStorage.removeItem(V2_STORAGE_KEY);
      localStorage.removeItem(V1_STORAGE_KEY);
      localStorage.removeItem(API_KEY_LOCAL_KEY);
      sessionStorage.removeItem(API_KEY_SESSION_KEY);
      sessionStorage.removeItem(API_PROFILE_SESSION_KEY);
    } catch (error) {
      // 저장소 사용 불가 시에도 현재 상태 초기화
    }
    state.schedules = [];
    state.todos = [];
    state.plans = [];
    state.profile = { displayName: DEFAULT_PROFILE_NAME };
    state.dashboardHeadline = DEFAULT_DASHBOARD_HEADLINE;
    state.dashboardSubtitle = DEFAULT_DASHBOARD_SUBTITLE;
    state.theme = "light";
    state.reduceMotion = false;
    state.confirmBeforeDelete = true;
    state.startPage = "dashboard";
    state.calendarView = "month";
    state.recentPrompts = [];
    state.apiSettings = { ...defaultApiSettings };
    state.apiProfiles = {};
    state.apiTest = { status: "idle", message: "", details: "" };
    persistAppData({ silent: true });
    applyTheme();
    closeModal();
    window.location.hash = "dashboard";
    render();
    showToast("저장된 일정과 설정을 모두 삭제했습니다.");
  }

  function clearFilters() {
    state.filters = { search: "", status: "all", priority: "all", date: "all", tag: "all", sort: "date" };
    render();
  }

  // 폼 제출 이벤트 위임
  document.addEventListener("submit", (event) => {
    const formId = event.target.getAttribute("id");
    if (formId === "month-picker-form") {
      event.preventDefault();
      const input = event.target.elements.month;
      const error = document.getElementById("month-picker-error");
      if (!isValidMonthString(input.value)) {
        input.setAttribute("aria-invalid", "true");
        error?.classList.remove("is-hidden");
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
      error?.classList.add("is-hidden");
      goToCalendarMonth(input.value);
    }
    if (formId === "ai-form") {
      event.preventDefault();
      const input = event.target.elements.prompt;
      state.generation.input = input.value;
      startGeneration();
    }
    if (formId === "profile-name-form") {
      event.preventDefault();
      saveProfileName(event.target);
    }
    if (formId === "dashboard-copy-form") {
      event.preventDefault();
      saveDashboardCopy(event.target);
    }
    if (formId === "project-detail-form") {
      event.preventDefault();
      startProjectDetailing(event.target);
    }
    if (formId === "project-detail-preview-form") {
      event.preventDefault();
      applyProjectDetailProposal(event.target);
    }
    if (formId === "task-form") {
      event.preventDefault();
      saveTaskFromForm(event.target);
    }
    if (formId === "quick-todo-form") {
      event.preventDefault();
      addQuickTodo(new FormData(event.target).get("title"));
    }
    if (formId === "todo-form") {
      event.preventDefault();
      saveTodoFromForm(event.target);
    }
    if (formId === "plan-form") {
      event.preventDefault();
      savePlanFromForm(event.target);
    }
    if (formId === "milestone-form") {
      event.preventDefault();
      saveMilestoneFromForm(event.target);
    }
    if (formId === "ai-entity-preview-form") {
      event.preventDefault();
      commitAiEntityPreview(event.target);
    }
    if (formId === "ai-preview-form") {
      event.preventDefault();
      commitCreatePreview(event.target);
    }
    if (formId === "ai-edit-form") {
      event.preventDefault();
      const data = new FormData(event.target);
      startAiUpdate(Number(data.get("id")), String(data.get("instruction") || "").trim());
    }
    if (formId === "ai-edit-entity-form") {
      event.preventDefault();
      const data = new FormData(event.target);
      startAiEntityUpdate(String(data.get("entityType")), Number(data.get("id")), Number(data.get("planId")) || null, String(data.get("instruction") || "").trim());
    }
    if (formId === "api-settings-form") {
      event.preventDefault();
      saveApiSettingsFromForm(event.target, false);
    }
    if (formId === "filter-form") {
      event.preventDefault();
      const data = new FormData(event.target);
      state.filters.status = String(data.get("status"));
      state.filters.priority = String(data.get("priority"));
      state.filters.date = String(data.get("date"));
      state.filters.tag = String(data.get("tag") || "all");
      closeModal();
      render();
      showToast("필터를 적용했습니다.");
    }
  });

  // 입력과 변경 이벤트 위임
  document.addEventListener("input", (event) => {
    if (event.target.id === "dashboard-headline-input") {
      setDashboardCopyError(event.target, "dashboard-headline-error", "");
    }
    if (event.target.id === "dashboard-subtitle-input") {
      setDashboardCopyError(event.target, "dashboard-subtitle-error", "");
    }
    if (event.target.id === "month-picker-input") {
      event.target.removeAttribute("aria-invalid");
      document.getElementById("month-picker-error")?.classList.add("is-hidden");
    }
    if (event.target.id === "ai-input") {
      state.generation.input = event.target.value;
      const button = document.querySelector("#ai-form button[type=submit]");
      if (button) button.disabled = !event.target.value.trim();
    }
    if (event.target.id === "task-search") {
      state.filters.search = event.target.value;
      refreshTaskResults();
    }
    if (event.target.id === "completed-search") {
      state.completedSearch = event.target.value;
      refreshCompletedResults();
    }
    if (event.target.id === "todo-search") {
      state.todoFilters.search = event.target.value;
      const results = document.getElementById("todo-results");
      if (results) results.innerHTML = getFilteredTodos().map(renderTodoRow).join("") || renderEmpty("☑", "조건에 맞는 할 일이 없어요", "검색어나 필터를 바꿔 보세요.");
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.name === "aiMode") {
      state.generation.mode = event.target.value;
      persistAppData({ silent: true });
    }
    if (event.target.matches("[data-schedule-period]")) {
      const form = event.target.closest("form");
      form?.querySelector(".schedule-end-field")?.classList.toggle("is-hidden", event.target.value !== "range");
    }
    if (event.target.matches("[data-schedule-all-day]")) {
      const form = event.target.closest("form");
      form?.querySelector(".schedule-time-fields")?.classList.toggle("is-hidden", event.target.checked);
    }
    if (event.target.matches("[data-calendar-filter]")) {
      state.calendarFilters[event.target.dataset.calendarFilter] = event.target.checked;
      persistAppData({ silent: true });
      render();
    }
    if (event.target.id === "todo-status-filter") {
      state.todoFilters.status = event.target.value;
      render();
    }
    if (event.target.id === "todo-priority-filter") {
      state.todoFilters.priority = event.target.value;
      render();
    }
    if (event.target.matches("[data-todo-toggle]")) {
      const todo = state.todos.find((item) => item.id === Number(event.target.dataset.todoToggle));
      if (todo) {
        todo.completed = event.target.checked;
        todo.completedAt = todo.completed ? new Date().toISOString() : null;
        persistAppData();
        render();
        announce(`할 일을 ${todo.completed ? "완료" : "진행 중"}으로 변경했습니다.`);
      }
    }
    if (event.target.matches("[data-milestone-toggle]")) {
      const plan = state.plans.find((item) => item.id === Number(event.target.dataset.planId));
      const milestone = plan?.milestones.find((item) => item.id === Number(event.target.dataset.milestoneToggle));
      if (milestone) {
        milestone.completed = event.target.checked;
        persistAppData();
        render();
        announce(`중간 목표를 ${milestone.completed ? "완료" : "미완료"}로 변경했습니다.`);
      }
    }
    if (event.target.id === "status-filter") {
      state.filters.status = event.target.value;
      refreshTaskResults();
    }
    if (event.target.id === "priority-filter") {
      state.filters.priority = event.target.value;
      refreshTaskResults();
    }
    if (event.target.id === "date-filter") {
      state.filters.date = event.target.value;
      refreshTaskResults();
    }
    if (event.target.id === "sort-filter") {
      state.filters.sort = event.target.value;
      refreshTaskResults();
    }
    if (event.target.id === "completed-sort") {
      state.completedSort = event.target.value;
      refreshCompletedResults();
    }
    if (event.target.name === "theme") {
      state.theme = event.target.value;
      applyTheme();
      persistAppData();
      showToast(`${event.target.value === "dark" ? "다크" : event.target.value === "light" ? "라이트" : "시스템"} 테마를 적용했습니다.`);
    }
    if (event.target.id === "reduce-motion") {
      state.reduceMotion = event.target.checked;
      applyTheme();
      persistAppData();
      showToast(event.target.checked ? "모션을 줄였습니다." : "기본 모션을 사용합니다.");
    }
    if (event.target.id === "confirm-before-delete") {
      state.confirmBeforeDelete = event.target.checked;
      persistAppData();
      showToast(event.target.checked ? "삭제 전에 한 번 더 확인합니다." : "개별 항목을 바로 삭제합니다.");
    }
    if (event.target.id === "start-page") {
      state.startPage = event.target.value;
      persistAppData();
      showToast("기본 시작 화면을 변경했습니다.");
    }
    if (event.target.id === "api-model-preset") {
      const input = document.getElementById("api-model");
      const customField = document.getElementById("api-model-custom-field");
      const custom = event.target.value === "__custom__";
      customField?.classList.toggle("is-hidden", !custom);
      if (input && !custom) input.value = event.target.value;
      if (input && custom) {
        input.value = "";
        window.setTimeout(() => input.focus(), 0);
      }
      if (state.apiSettings.provider === "openrouter") updateOpenRouterCapabilityHint(event.target.value);
    }
    if (event.target.id === "api-provider") {
      const form = document.getElementById("api-settings-form");
      if (form) {
        const previousProvider = state.apiSettings.provider;
        const previousKey = String(form.elements.apiKey?.value || "").trim();
        const previousRemember = Boolean(form.elements.rememberApiKey?.checked);
        if (previousProvider !== "mock") saveApiKey(previousKey, previousRemember, previousProvider);
        const provider = String(event.target.value || "mock");
        const providerMeta = API_PROVIDERS[provider] || API_PROVIDERS.mock;
        const keyRecord = getApiKeyRecord(provider);
        const savedProfile = state.apiProfiles[provider] || {};
        state.apiSettings = {
          provider,
          endpoint: savedProfile.endpoint ?? providerMeta.endpoint,
          model: savedProfile.model || providerMeta.model,
          rememberApiKey: keyRecord.value ? keyRecord.remember : Boolean(savedProfile.rememberApiKey),
          timeout: Math.min(120, Math.max(5, Number(savedProfile.timeout || form.elements.timeout?.value) || 20))
        };
        state.apiTest = { status: "idle", message: "", details: "" };
        persistAppData({ silent: true });
        refreshApiSettingsCard("api-provider");
      }
    }
    if (event.target.id === "detail-status") {
      const task = state.tasks.find((item) => item.id === state.selectedTaskId);
      if (task) {
        task.status = event.target.value;
        if (task.status === "completed") task.completedAt = toISODate(today);
        if (task.status !== "completed") delete task.completedAt;
        persistAppData();
        render();
        showToast(`상태를 “${statusMeta[task.status].label}”로 변경했습니다.`);
      }
    }
    if (event.target.matches("[data-subtask]")) {
      const task = state.tasks.find((item) => item.id === state.selectedTaskId);
      const index = Number(event.target.dataset.subtask);
      if (task && task.subtasks[index]) {
        task.subtasks[index].done = event.target.checked;
        persistAppData();
        render();
        announce(`하위 작업을 ${event.target.checked ? "완료" : "미완료"}로 변경했습니다.`);
      }
    }
    if (event.target.id === "backup-import") {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showToast("백업 파일은 2MB 이하만 가져올 수 있습니다.");
        event.target.value = "";
        return;
      }
      file.text().then((text) => {
        try {
          const data = normalizeAppData(JSON.parse(text));
          openModal("confirm-import", { data });
        } catch (error) {
          showToast(error.message || "백업 파일 형식이 올바르지 않습니다.");
        } finally {
          event.target.value = "";
        }
      }).catch(() => showToast("백업 파일을 읽지 못했습니다."));
    }
  });

  // 클릭 액션 이벤트 위임
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const id = Number(target.dataset.id);

    if (action === "toggle-theme") {
      const resolved = document.documentElement.dataset.theme;
      state.theme = resolved === "dark" ? "light" : "dark";
      applyTheme();
      persistAppData();
      document.querySelectorAll('input[name="theme"]').forEach((input) => { input.checked = input.value === state.theme; });
      showToast(state.theme === "dark" ? "다크 모드로 전환했습니다." : "라이트 모드로 전환했습니다.");
    }
    if (action === "go-search") {
      window.location.hash = "tasks";
      window.setTimeout(() => document.getElementById("task-search")?.focus(), 50);
    }
    if (action === "edit-profile-name") openModal("edit-profile-name");
    if (action === "edit-dashboard-copy") openModal("edit-dashboard-copy");
    if (action === "reset-dashboard-copy-fields") {
      const headlineInput = document.getElementById("dashboard-headline-input");
      const subtitleInput = document.getElementById("dashboard-subtitle-input");
      if (headlineInput && subtitleInput) {
        headlineInput.value = DEFAULT_DASHBOARD_HEADLINE;
        subtitleInput.value = DEFAULT_DASHBOARD_SUBTITLE;
        setDashboardCopyError(headlineInput, "dashboard-headline-error", "");
        setDashboardCopyError(subtitleInput, "dashboard-subtitle-error", "");
        headlineInput.focus();
        announce("기본 대시보드 문구를 불러왔습니다. 저장하면 적용됩니다.");
      }
    }
    if (action === "open-detail-planner") openModal("detail-project", { projectId: null, status: "idle" });
    if (action === "detail-project") openModal("detail-project", { projectId: id, status: "idle" });
    if (action === "back-to-detail-project") openModal("detail-project", { projectId: state.modal.projectId, goal: state.modal.goal, status: "idle" });
    if (action === "open-add") openModal("add");
    if (action === "open-more") openModal("more");
    if (action === "add-todo") openModal("add-todo");
    if (action === "edit-todo") openModal("edit-todo", { id });
    if (action === "delete-item") requestItemDelete(target.dataset.type, id);
    if (action === "delete-todo") requestItemDelete("todo", id);
    if (action === "convert-todo") convertTodoToSchedule(id);
    if (action === "ask-clear-todos") openModal("confirm-data", { title: "완료한 할 일을 삭제할까요?", description: "완료한 할 일만 삭제하며 일정과 프로젝트는 유지됩니다.", confirmAction: "confirm-clear-todos", confirmLabel: "완료한 할 일 삭제", danger: true });
    if (action === "confirm-clear-todos") { state.todos = state.todos.filter((item) => !item.completed); persistAppData(); closeModal(); render(); showToast("완료한 할 일을 삭제했습니다."); }
    if (action === "add-plan") openModal("add-plan");
    if (action === "edit-plan") openModal("edit-plan", { id });
    if (action === "view-plan") window.location.hash = `plan-detail?id=${id}`;
    if (action === "add-milestone") openModal("add-milestone", { planId: id });
    if (action === "edit-milestone") openModal("edit-milestone", { planId: Number(target.dataset.planId), id });
    if (action === "delete-milestone") { const plan = state.plans.find((item) => item.id === Number(target.dataset.planId)); if (plan) { plan.milestones = plan.milestones.filter((item) => item.id !== id); persistAppData(); closeModal(); render(); showToast("중간 목표를 삭제했습니다."); } }
    if (action === "delete-plan") requestItemDelete("project", id);
    if (action === "confirm-delete-item" && state.modal?.type === "confirm-item-delete") {
      executeItemDelete(state.modal.entityType, state.modal.id);
    }
    if (action === "add-linked-schedule") openModal("add", { planId: id });
    if (action === "add-linked-todo") openModal("add-todo", { planId: id });
    if (action === "choose-color") {
      const input = document.getElementById(target.dataset.target);
      if (input) { input.value = target.dataset.color; target.parentElement.querySelectorAll(".color-swatch").forEach((item) => item.classList.toggle("active", item === target)); }
    }
    if (action === "use-prompt") {
      state.generation.input = target.dataset.prompt || "";
      render();
      window.setTimeout(() => document.getElementById("ai-input")?.focus(), 20);
    }
    if (action === "cancel-generation") cancelGeneration();
    if (action === "retry-generation") startGeneration();
    if (action === "direct-entry") openModal("add", { prefill: state.generation.input });
    if (action === "regenerate") {
      if (state.modal) closeModal();
      state.generation.status = "idle";
      state.generation.newTaskId = null;
      render();
      window.setTimeout(startGeneration, 30);
    }
    if (action === "view-generated") {
      window.location.hash = `task-detail?id=${state.generation.newTaskId}`;
    }
    if (action === "edit-generated") openModal("edit", { id: state.generation.newTaskId });
    if (action === "reopen-create-preview" && state.generation.previewEntity) openModal("ai-entity-preview", { entityType: state.generation.previewType, entity: state.generation.previewEntity, parentPlanId: state.generation.parentPlanId || state.modal?.parentPlanId || null });
    if (action === "view-generated-entity") {
      if (state.generation.previewType === "todo") window.location.hash = "todos";
      if (state.generation.previewType === "plan") window.location.hash = `plan-detail?id=${state.generation.newEntityId}`;
      if (state.generation.previewType === "milestone") window.location.hash = `plan-detail?id=${state.generation.parentPlanId}`;
    }
    if (action === "open-calendar-item") {
      const kind = target.dataset.kind;
      const planId = Number(target.dataset.planId) || id;
      closeModal();
      if (kind === "schedule") window.location.hash = `task-detail?id=${id}`;
      if (kind === "project" || kind === "milestone") window.location.hash = `plan-detail?id=${planId}`;
      if (kind === "todo") openModal("edit-todo", { id });
    }
    if (action === "add-on-selected-date") {
      state.selectedDate = target.dataset.date || state.selectedDate;
      closeModal();
      openModal("add");
    }
    if (action === "view-task") window.location.hash = `task-detail?id=${id}`;
    if (action === "edit-task") openModal("edit", { id });
    if (action === "submit-task-form") {
      event.preventDefault();
      const form = target.closest("form");
      if (form && form.reportValidity()) saveTaskFromForm(form);
    }
    if (action === "ai-edit-task") openModal("ai-edit", { id, status: "idle", instruction: "" });
    if (action === "ai-edit-entity") openModal("ai-edit-entity", { entityType: target.dataset.type, id, planId: Number(target.dataset.planId) || null, status: "idle", instruction: "" });
    if (action === "back-to-generic-ai-edit") openModal("ai-edit-entity", { entityType: state.modal.entityType, id: state.modal.id, planId: state.modal.planId, status: "idle", instruction: state.modal.instruction });
    if (action === "apply-generic-ai-update") applyGenericAiUpdate();
    if (action === "submit-ai-edit") {
      event.preventDefault();
      const form = target.closest("form");
      if (form && form.reportValidity()) {
        const data = new FormData(form);
        startAiUpdate(Number(data.get("id")), String(data.get("instruction") || "").trim());
      }
    }
    if (action === "use-edit-example") {
      const input = document.getElementById("ai-edit-instruction");
      if (input) {
        input.value = target.dataset.prompt || "";
        input.focus();
      }
    }
    if (action === "cancel-ai-update" && state.activeRequest?.type === "ai-update") {
      state.activeRequest.cancelled = true;
      state.activeRequest.controller.abort();
      state.modal = { ...state.modal, status: "idle" };
      renderModal();
      showToast("AI 수정 요청을 취소했습니다.");
    }
    if (action === "back-to-ai-edit") openModal("ai-edit", { id, status: "idle", instruction: state.modal?.instruction || "" });
    if (action === "apply-ai-update") applyAiUpdate(id);
    if (action === "complete-task") completeTask(id);
    if (action === "restore-task") restoreTask(id);
    if (action === "ask-delete") requestItemDelete("schedule", id);
    if (action === "close-modal") closeModal();
    if (action === "modal-backdrop" && event.target === target) closeModal();
    if (action === "open-filter") openModal("filter");
    if (action === "go-api-settings") {
      closeModal();
      window.location.hash = "settings";
      window.setTimeout(() => { document.getElementById("api-settings-card")?.scrollIntoView({ behavior: state.reduceMotion ? "auto" : "smooth", block: "start" }); document.getElementById("api-provider")?.focus(); }, 80);
    }
    if (action === "open-api-help") openModal("api-help");
    if (action === "open-month-picker") openModal("month-picker");
    if (action === "reset-api-endpoint") {
      const input = document.getElementById("api-endpoint");
      const provider = document.getElementById("api-provider")?.value || state.apiSettings.provider;
      if (input) { input.value = API_PROVIDERS[provider]?.endpoint || ""; input.focus(); }
    }
    if (action === "toggle-api-key") {
      const input = document.getElementById("api-key");
      if (input) {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        target.textContent = show ? "숨김" : "보기";
        target.setAttribute("aria-label", show ? "API 키 숨기기" : "API 키 표시");
      }
    }
    if (action === "submit-api-settings") {
      event.preventDefault();
      const form = target.closest("form");
      if (form && form.reportValidity()) saveApiSettingsFromForm(form, false);
    }
    if (action === "test-api") runApiTest();
    if (action === "cancel-api-test" && state.activeRequest?.type === "api-test") {
      state.activeRequest.cancelled = true;
      state.activeRequest.controller.abort();
    }
    if (action === "export-data") exportAppData();
    if (action === "import-data") document.getElementById("backup-import")?.click();
    if (action === "ask-reset-data") openModal("confirm-data", { title: "예시 데이터를 복원할까요?", description: "현재 일정·할 일·프로젝트는 타입별 예시 1개로 교체됩니다. API 설정과 화면 환경설정은 유지됩니다.", confirmAction: "confirm-reset-data", confirmLabel: "복원" });
    if (action === "confirm-reset-data") restoreMockData();
    if (action === "ask-clear-data") openModal("confirm-data", { title: "모든 로컬 데이터를 삭제할까요?", description: "일정, 화면 설정, API 설정과 저장된 API 키를 이 브라우저에서 삭제합니다.", confirmAction: "confirm-clear-data", confirmLabel: "모두 삭제", danger: true });
    if (action === "confirm-clear-data") clearAllData();
    if (action === "confirm-import" && state.modal?.type === "confirm-import") {
      const imported = state.modal.data;
      applyImportedData(imported);
      closeModal();
      render();
      showToast("백업 데이터를 가져왔습니다.");
    }
    if (action === "reset-sheet-filter") {
      state.filters.status = "all";
      state.filters.priority = "all";
      state.filters.date = "all";
      state.filters.tag = "all";
      renderModal();
    }
    if (action === "clear-filters") clearFilters();
    if (action === "go-tasks") window.location.hash = "tasks";
    if (action === "go-dashboard") window.location.hash = "dashboard";
    if (action === "go-plans") window.location.hash = "plans";
    if (action === "go-back") {
      if (window.history.length > 1) window.history.back();
      else window.location.hash = "tasks";
    }
    if (action === "calendar-prev") moveCalendarMonth(-1);
    if (action === "calendar-next") moveCalendarMonth(1);
    if (action === "calendar-month-count") {
      state.calendarMonths = Number(target.dataset.count) || 1;
      persistAppData({ silent: true });
      render();
    }
    if (action === "calendar-view") {
      state.calendarView = target.dataset.view === "multi" ? "multi" : "month";
      state.calendarMonths = state.calendarView === "multi" ? 13 : 1;
      state.multiMonthStart = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 6, 1);
      persistAppData({ silent: true });
      render();
    }
    if (action === "open-month") {
      state.calendarDate = new Date(Number(target.dataset.year), Number(target.dataset.month), 1);
      state.selectedDate = toISODate(state.calendarDate);
      state.calendarView = "month";
      state.calendarMonths = 1;
      persistAppData({ silent: true });
      render();
    }
    if (action === "calendar-today") {
      state.calendarDate = new Date(today.getFullYear(), today.getMonth(), 1);
      state.multiMonthStart = new Date(today.getFullYear(), today.getMonth() - 6, 1);
      state.selectedDate = toISODate(today);
      render();
    }
    if (action === "open-calendar-day-items") {
      state.selectedDate = target.dataset.date;
      openModal("calendar-day-items", { date: state.selectedDate });
    }
    if (action === "select-date") {
      state.selectedDate = target.dataset.date;
      if (target.closest(".compact-month")) {
        const date = fromISODate(state.selectedDate);
        state.calendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
        state.calendarView = "month";
        state.calendarMonths = 1;
        persistAppData({ silent: true });
      }
      render();
    }
    if (action === "select-mini-date") {
      state.selectedDate = target.dataset.date;
      const date = fromISODate(state.selectedDate);
      state.calendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
      window.location.hash = "calendar";
    }
    if (action === "mini-prev" || action === "mini-next") {
      const direction = action === "mini-prev" ? -1 : 1;
      const next = new Date(today.getFullYear(), today.getMonth() + direction, 1);
      state.calendarDate = next;
      state.selectedDate = toISODate(next);
      window.location.hash = "calendar";
    }
  });

  // 모달 키보드 포커스 순환
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.modal) closeModal();
    if (event.key === "Tab" && state.modal) {
      const container = modalRoot.querySelector(".modal, .bottom-sheet");
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener("hashchange", () => {
    render();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: state.reduceMotion ? "auto" : "smooth" });
  });

  // 다른 탭 변경 동기화
  window.addEventListener("storage", (event) => {
    if (event.key !== APP_STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = normalizeAppData(JSON.parse(event.newValue));
      state.schedules = incoming.schedules;
      state.todos = incoming.todos;
      state.projects = incoming.projects;
      state.profile = incoming.profile;
      state.dashboardHeadline = incoming.preferences.dashboardHeadline;
      state.dashboardSubtitle = incoming.preferences.dashboardSubtitle;
      state.theme = incoming.preferences.theme;
      state.reduceMotion = incoming.preferences.reduceMotion;
      state.confirmBeforeDelete = incoming.preferences.confirmBeforeDelete;
      state.startPage = incoming.preferences.startPage;
      state.calendarView = incoming.preferences.calendarView;
      state.calendarMonths = state.calendarView === "multi" ? 13 : 1;
      state.calendarFilters = incoming.preferences.calendarFilters;
      state.recentPrompts = incoming.recentPrompts;
      state.apiSettings = { ...defaultApiSettings, ...incoming.apiSettings };
      state.apiProfiles = incoming.apiProfiles || {};
      state.lastSavedAt = incoming.lastSavedAt;
      applyTheme();
      render();
      showToast("다른 탭에서 변경한 내용을 반영했습니다.");
    } catch (error) {
      // 손상된 다른 탭 데이터 무시
    }
  });

  systemTheme.addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshTodayReference();
  });

  // 초기 화면과 날짜 기준 준비
  if (!window.location.hash) window.location.hash = state.startPage;
  if (!storedAppData || migratedLegacyData) persistAppData({ silent: true });
  refreshTodayReference();
  applyTheme();
  render();
})();
