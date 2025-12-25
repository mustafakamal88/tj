export function pushPath(pathname: string) {
  const url = new URL(window.location.href);
  url.pathname = pathname;
  window.history.pushState({}, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate'));
}
