const BASE = "/.netlify/functions";
const PASS_KEY = "portal:pass";

export const savedPass = () => localStorage.getItem(PASS_KEY) || "";
export const setSavedPass = (p) => localStorage.setItem(PASS_KEY, p);
export const clearSavedPass = () => localStorage.removeItem(PASS_KEY);

async function req(path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const loadAll = () => req("data");
export const login = (passcode) => req("login", { passcode });

export const savePlan = (plan) => req("data", { action: "plan", passcode: savedPass(), plan });
export const saveImage = (postId, dataUrl) =>
  req("data", { action: "image", passcode: savedPass(), postId, dataUrl });
export const deleteImage = (postId) =>
  req("data", { action: "image", passcode: savedPass(), postId, dataUrl: null });

export const updatePost = (postId, fields, theme) =>
  req("data", { action: "post-update", passcode: savedPass(), postId, fields, theme });
export const deletePost = (postId) =>
  req("data", { action: "post-delete", passcode: savedPass(), postId });
export const clearAll = () => req("data", { action: "clear", passcode: savedPass() });

export const saveEntry = (postId, entry) => req("data", { action: "feedback", postId, entry });

export const localName = () => localStorage.getItem("portal:name") || "";
export const setLocalName = (n) => localStorage.setItem("portal:name", n);
