export function urlParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export const hasUrlParam = (name: string): boolean => urlParam(name) !== null;
