// Thème mémorisé par appareil (confort local, pas une donnée).

const KEY = 'lifehub.theme';
const THEME_COLORS = { dark: '#0b0b0c', light: '#fafafa' };

export function getTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function setTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Stockage indisponible (navigation privée) : le thème reste valable pour la session.
  }
  applyTheme(value);
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}
