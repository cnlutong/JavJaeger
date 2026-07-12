export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body instanceof FormData
      ? options.headers
      : { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail;
    const message = typeof detail === "string"
      ? detail
      : detail?.message || payload.message || `请求失败 (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export function formData(values) {
  const body = new FormData();
  Object.entries(values).forEach(([key, value]) => body.append(key, value ?? ""));
  return body;
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

export function movieList(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.movies || payload?.records || payload?.items || [];
}
