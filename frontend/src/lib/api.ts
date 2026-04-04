import axios from "axios";
import Cookies from "js-cookie";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const detail = error.response?.data?.detail ?? "";
    // 401 = token invalide/expiré, 403 = pas de token (HTTPBearer)
    if (status === 401 || (status === 403 && detail === "Not authenticated")) {
      Cookies.remove("access_token");
      Cookies.remove("refresh_token");
      window.location.href = "/connexion";
    }
    if (status === 403 && detail === "trial_expired") {
      const onBilling = window.location.pathname.startsWith("/abonnement");
      const onSettings = window.location.pathname.startsWith("/parametres");
      if (!onBilling && !onSettings) {
        window.location.href = "/abonnement?expired=1";
      }
    }
    return Promise.reject(error);
  }
);
