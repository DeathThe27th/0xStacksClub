export const THEME_KEY = "stacksclub:theme";

/** Runs before first paint (inlined in <head>) so there's no flash of the wrong theme. */
export const themeBootScript = `(function(){try{var c=localStorage.getItem("${THEME_KEY}")||"system";var d=c==="dark"||(c==="system"&&!matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}})();`;
