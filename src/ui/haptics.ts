let lastPulse = -Infinity;
let nativeSwitch: HTMLInputElement | undefined;

function switchInput() {
  if (nativeSwitch?.isConnected) return nativeSwitch;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.tabIndex = -1;
  input.setAttribute('switch', '');
  label.append(input);
  document.body.append(label);
  nativeSwitch = input;
  return input;
}

/** Attempt a tactile cue from a trusted pointer handler on a touch device. */
export function haptic(kind: 'tick' | 'thud'): void {
  try {
    if (!navigator.maxTouchPoints || navigator.userActivation?.isActive === false) return;
    const now = performance.now();
    if (now - lastPulse < 100) return;
    if (typeof navigator.vibrate === 'function') {
      lastPulse = now;
      navigator.vibrate(kind === 'tick' ? 8 : 18);
    } else if ('switch' in HTMLInputElement.prototype) {
      lastPulse = now;
      switchInput().click();
    }
  } catch { /* The gesture does not depend on tactile feedback. */ }
}
