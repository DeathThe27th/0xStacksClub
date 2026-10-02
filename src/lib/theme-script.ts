export const THEME_KEY = "stacksclub:theme";

/** Routes that always render in one theme, whatever the visitor chose: the landing is light. */
export const THEME_LOCKS: Record<string, "light"> = { "/": "light" };

/** Light unless the visitor chose otherwise. Runs before first paint (inlined in <head>) so there's no flash of the wrong theme. */
export const themeBootScript = `(function(){var d=document.documentElement;try{var l=${JSON.stringify(THEME_LOCKS)}[location.pathname];if(l){d.dataset.themeLock=l;d.dataset.theme=l;return;}var c=localStorage.getItem("${THEME_KEY}")||"light";var t=c==="light"||c==="dark"||c==="rainbow"||c==="binance"?c:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");d.dataset.theme=t;}catch(e){d.dataset.theme="light";}})();`;
