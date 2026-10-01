const storageKey = "fobc-sound";

export function isSoundOn() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(storageKey) === "1";
}

export function setSoundOn(on: boolean) {
  window.sessionStorage.setItem(storageKey, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("fobc-sound", { detail: on }));
}
