// Injected by Tauri at document start, before the HTML root necessarily exists.
(() => {
  /** @type {string} Replaced with the validated preference by the native builder. */
  const preference = "__PSD_THEME_PREFERENCE__";
  const apply = () => {
    const root = document.documentElement;
    if (!root) return false;
    root.dataset.themePreference = preference;
    root.dataset.theme = preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : preference;
    return true;
  };
  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
})();
