/**
 * Clipboard helper with a real fallback.
 *
 * `navigator.clipboard` is unavailable in a lot of the places staff actually
 * work from: non-HTTPS origins, older in-app browsers (Instagram, Facebook,
 * LINE), and some Android WebViews. Calling it there either throws or rejects,
 * and an unawaited rejection means the button silently does nothing.
 *
 * copyText() tries the modern API, falls back to a hidden textarea +
 * document.execCommand("copy"), and reports success/failure so the UI can tell
 * the user what happened instead of pretending it worked.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
