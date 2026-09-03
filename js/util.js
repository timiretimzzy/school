// Small shared helpers used across every page module.

export function el(id) {
  return document.getElementById(id);
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// Maps common Postgres/PostgREST error codes to friendly, non-leaking text.
// Raw database error text is never shown to end users.
export function safeError(error) {
  if (!error) return "The request could not be completed. Please try again.";
  if (error.code === "42501") return "You do not have permission for this action.";
  if (error.code === "23505") return "That value is already in use.";
  if (error.code === "23503") return "That record is referenced by other data and cannot be used here.";
  if (error.code === "22P02" || error.code === "23514") return "Please check the values you entered.";
  return "The request could not be completed. Please try again.";
}

export function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function fmtDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
