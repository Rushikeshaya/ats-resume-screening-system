async function request(path, options) {
  const res = await fetch(`/api${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => request('/health'),
  listScreenings: () => request('/screenings'),
  getScreening: (id) => request(`/screenings/${id}`),
  deleteScreening: (id) => request(`/screenings/${id}`, { method: 'DELETE' }),
  createScreening: (formData) => request('/screenings', { method: 'POST', body: formData }),
  feedback: (id, cid) => request(`/screenings/${id}/candidates/${cid}/feedback`, { method: 'POST' }),
  sentimentEval: () => request('/nlp/sentiment-eval'),
  csvUrl: (id) => `/api/screenings/${id}/export.csv`
};
