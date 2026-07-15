// Client API pour parler au backend SeconDIY
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "secondiy_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

// Convertit une annonce venant du backend (schéma Prisma) vers le format
// utilisé par les composants du frontend (cat/cond/img/h/reserved…).
export function normalizeListing(l) {
  let images = [];
  try { images = typeof l.images === "string" ? JSON.parse(l.images) : l.images; } catch (_) {}
  const firstImage = images?.[0];
  return {
    id: l.id,
    title: l.title,
    price: l.price,
    size: l.size || "—",
    cond: l.condition,
    cat: l.category,
    city: l.city,
    img: firstImage ? `center/cover url(${firstImage})` : "linear-gradient(135deg,#5c4632,#141210)",
    seller: l.seller?.name || "Vendeur",
    sellerId: l.seller?.id || l.sellerId || null,
    sellerTrusted: !!l.seller?.trustBadge,
    likes: 0,
    h: Math.random() > 0.5 ? "tall" : "short",
    type: l.type || "vente",
    reserved: l.status === "RESERVED",
    status: l.status,
    description: l.description,
    createdAt: l.createdAt,
  };
}

export const api = {
  // Auth
  register: (payload) => fetch(`${API_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then(handle),

  login: (payload) => fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then(handle),

  me: () => fetch(`${API_URL}/auth/me`, { headers: authHeaders() }).then(handle),
  updateProfile: (data) => fetch(`${API_URL}/auth/me`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(data),
  }).then(handle),
  changePassword: (currentPassword, newPassword) => fetch(`${API_URL}/auth/me/password`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ currentPassword, newPassword }),
  }).then(handle),
  deleteAccount: () => fetch(`${API_URL}/auth/me`, { method: "DELETE", headers: authHeaders() }).then(res => {
    if (!res.ok && res.status !== 204) return handle(res);
  }),
  getMyReviews: () => fetch(`${API_URL}/auth/me/reviews`, { headers: authHeaders() }).then(handle),

  // Annonces
  getListings: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const { listings } = await fetch(`${API_URL}/listings${qs ? `?${qs}` : ""}`, { headers: authHeaders() }).then(handle);
    return listings.map(normalizeListing);
  },

  getMyListings: () => api.getListings({ mine: "true" }),

  createListing: (payload) => fetch(`${API_URL}/listings`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload),
  }).then(handle),

  reserveListing: (id) => fetch(`${API_URL}/listings/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ status: "RESERVED" }),
  }).then(handle),

  deleteListing: (id) => fetch(`${API_URL}/listings/${id}`, {
    method: "DELETE", headers: authHeaders(),
  }).then(res => { if (!res.ok && res.status !== 204) return handle(res); }),

  // Messagerie
  getConversations: () => fetch(`${API_URL}/messages/conversations`, { headers: authHeaders() }).then(handle),
  startConversation: (listingId) => fetch(`${API_URL}/messages/conversations`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ listingId }),
  }).then(handle),
  getConversation: (id) => fetch(`${API_URL}/messages/conversations/${id}`, { headers: authHeaders() }).then(handle),
  sendMessage: (id, body, kind = "TEXT") => fetch(`${API_URL}/messages/conversations/${id}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ body, kind }),
  }).then(handle),

  toggleFavorite: (id) => fetch(`${API_URL}/listings/${id}/favorite`, {
    method: "POST", headers: authHeaders(),
  }).then(handle),

  // IA
  interpretSearch: (query) => fetch(`${API_URL}/ai/interpret-search`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  }).then(handle),

  // Admin (réservé aux comptes role === "ADMIN")
  adminStats: () => fetch(`${API_URL}/admin/stats`, { headers: authHeaders() }).then(handle),
  adminUsers: () => fetch(`${API_URL}/admin/users`, { headers: authHeaders() }).then(handle),
  adminListings: () => fetch(`${API_URL}/admin/listings`, { headers: authHeaders() }).then(handle),

  // Profils publics + suivi
  getUserProfile: (id) => fetch(`${API_URL}/users/${id}`, { headers: authHeaders() }).then(handle),
  getUserListings: (id) => fetch(`${API_URL}/users/${id}/listings`).then(handle).then(({ listings }) => listings.map(normalizeListing)),
  toggleFollow: (id) => fetch(`${API_URL}/users/${id}/follow`, { method: "POST", headers: authHeaders() }).then(handle),
};
