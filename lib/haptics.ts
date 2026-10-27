// A light tap of haptic feedback. Call it straight from a tap/click handler.
//
// Android: navigator.vibrate. iPhone Safari has no vibrate API, but toggling a
// native <input type="checkbox" switch> (iOS 17.4+) through its <label> plays the
// system haptic, so we keep one hidden switch and click its label. Best effort:
// it does nothing on older iOS or desktop, and Apple may close the trick later.
let label: HTMLLabelElement | null = null;

export function haptic(pattern: number | number[] = 10): void {
  if (typeof window === "undefined") return;
  try {
    if (navigator.vibrate?.(pattern)) return;
    if (!label) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = "jp-haptic-switch";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label = document.createElement("label");
      label.htmlFor = input.id;
      for (const el of [input, label]) {
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
        document.body.appendChild(el);
      }
    }
    label.click();
  } catch {
    // Feedback is a nicety; never let it break the tap.
  }
}
