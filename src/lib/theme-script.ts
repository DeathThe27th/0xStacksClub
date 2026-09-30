export const THEME_KEY = "stacksclub:theme";

/** Runs before first paint (inlined in <head>) so there's no flash of the wrong theme. */
export const themeBootScript = `(function(){try{var c=localStorage.getItem("${THEME_KEY}")||"system";var t=c==="light"||c==="dark"||c==="rainbow"||c==="binance"?c:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
