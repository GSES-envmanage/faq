const CONFIG = window.GSES_CONFIG;
const SESSION_KEY = "gses-faq-admin-session";

function saveSession(session) {
  const value = { ...session, expires_at: Date.now() + session.expires_in * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  return value;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    clearSession();
    return null;
  }
}

async function signIn(email, password) {
  const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: CONFIG.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error_description || body.msg || "로그인에 실패했습니다.");
  return saveSession(body);
}

async function refreshSession(session) {
  const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: CONFIG.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) {
    clearSession();
    return null;
  }
  return saveSession(await response.json());
}

async function getSession() {
  let session = readSession();
  if (!session?.access_token) return null;
  if (session.expires_at - Date.now() < 60_000) session = await refreshSession(session);
  return session;
}

async function signOut() {
  const session = readSession();
  try {
    if (session?.access_token) {
      await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: CONFIG.publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    }
  } finally {
    clearSession();
  }
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.replace("./index.html");
    throw new Error("로그인이 필요합니다.");
  }
  return session;
}

async function authorizedFetch(path, options = {}) {
  const session = await requireAuth();
  const headers = new Headers(options.headers || {});
  headers.set("apikey", CONFIG.publishableKey);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(`${CONFIG.supabaseUrl}${path}`, { ...options, headers });
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await authorizedFetch(path, { ...options, headers });
  if (!response.ok) {
    let message = "요청을 처리하지 못했습니다.";
    try {
      const body = await response.json();
      message = body.message || body.msg || body.error_description || message;
    } catch { }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

window.GSES_AUTH = { signIn, signOut, clearSession, getSession, requireAuth, authorizedFetch, apiRequest };
