/**
 * Browser-side overflow probe for scripts/mobile-shots.ts.
 *
 * This file is intentionally plain JavaScript and is passed to
 * page.evaluate() as a string. Keeping it out of the TypeScript bundle avoids
 * esbuild's `keepNames` helper (`__name`) being injected into code that runs
 * in the browser, where that helper does not exist.
 *
 * Returns an array of overflow hits:
 *   {
 *     kind: "viewport" | "container",
 *     selectorPath: string,
 *     element: string,
 *     text: string,
 *     overflowPx: number,
 *     container?: string,
 *     containerRight?: number,
 *     elementRight?: number
 *   }
 */
(() => {
  const viewportWidth = window.innerWidth;
  const results = [];
  const seen = new Set();

  const skipTags = new Set([
    "html",
    "body",
    "head",
    "script",
    "style",
    "link",
    "meta",
    "noscript",
    "template",
  ]);

  const classString = (el) => (typeof el.className === "string" ? el.className : "");

  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const classes = classString(el).split(/\s+/).filter(Boolean).slice(0, 4);
    return tag + (classes.length ? "." + classes.join(".") : "");
  };

  const elementText = (el) =>
    (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);

  const selectorPath = (el) => {
    const parts = [];
    let current = el;
    let depth = 0;
    while (current && current.nodeType === 1 && depth < 6) {
      const tag = current.tagName.toLowerCase();
      if (tag === "html" || tag === "body") break;
      const id = current.id ? "#" + current.id : "";
      const classes = classString(current)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
      parts.unshift(tag + id + (classes.length ? "." + classes.join(".") : ""));
      current = current.parentElement;
      depth += 1;
    }
    return parts.join(" > ");
  };

  const isVisible = (el) => {
    if (skipTags.has(el.tagName.toLowerCase())) return false;
    if (el.hidden) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (style.opacity === "0") return false;
    if (el.getClientRects().length === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isScrollableX = (el) => {
    const overflowX = window.getComputedStyle(el).overflowX;
    return overflowX === "auto" || overflowX === "scroll";
  };

  const hasScrollableAncestor = (el) => {
    let parent = el.parentElement;
    while (parent) {
      if (isScrollableX(parent)) return true;
      parent = parent.parentElement;
    }
    return false;
  };

  const hasVisibleBackground = (style) => {
    const bg = style.backgroundColor;
    if (!bg || bg === "transparent") return false;
    return !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(bg);
  };

  const hasVisibleBorder = (style) =>
    ["Top", "Right", "Bottom", "Left"].some((side) => {
      const width = parseFloat(style["border" + side + "Width"] || "0");
      const borderStyle = style["border" + side + "Style"];
      return width > 0 && borderStyle !== "none" && borderStyle !== "hidden";
    });

  const hasRadius = (style) =>
    ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].some(
      (corner) => parseFloat(style["border" + corner + "Radius"] || "0") > 0,
    );

  const hasClippingOverflow = (style) =>
    ["overflowX", "overflowY"].some((prop) => {
      const value = style[prop];
      return value === "auto" || value === "scroll" || value === "hidden" || value === "clip";
    });

  const isContainer = (el) => {
    if (el === document.documentElement || el === document.body) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return (
      hasVisibleBackground(style) ||
      hasVisibleBorder(style) ||
      hasRadius(style) ||
      hasClippingOverflow(style)
    );
  };

  const nearestContainer = (el) => {
    let parent = el.parentElement;
    while (parent) {
      if (parent === document.body || parent === document.documentElement) return null;
      if (isContainer(parent)) return parent;
      parent = parent.parentElement;
    }
    return null;
  };

  const addHit = (hit) => {
    const key = [
      hit.kind,
      hit.selectorPath,
      hit.element,
      hit.text,
      Math.round(hit.overflowPx),
      hit.container || "",
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    results.push(hit);
  };

  const elements = Array.from(document.querySelectorAll("*"));
  for (const el of elements) {
    if (!isVisible(el)) continue;

    const rect = el.getBoundingClientRect();
    const scrollable = hasScrollableAncestor(el);

    // Page viewport check. Deliberately independent of html/body overflow
    // settings: a clipped page can still hide a real layout bug.
    if (!scrollable) {
      const rightOverflow = rect.right - viewportWidth;
      const leftOverflow = -rect.left;
      if (rightOverflow > 1 || leftOverflow > 1) {
        addHit({
          kind: "viewport",
          selectorPath: selectorPath(el),
          element: describe(el),
          text: elementText(el),
          overflowPx: Math.max(0, rightOverflow, leftOverflow),
          container: "viewport",
        });
      }
    }

    // Nearest-container check: elements must stay inside the visual box they
    // sit in (card, panel, badge, button, ...). Intentional horizontal
    // scrollers are skipped above.
    if (scrollable) continue;
    const container = nearestContainer(el);
    if (!container) continue;

    const containerStyle = window.getComputedStyle(container);
    const containerRect = container.getBoundingClientRect();
    const rightBorder = parseFloat(containerStyle.borderRightWidth || "0") || 0;
    const containerRight = containerRect.right - rightBorder;
    const overflowPx = rect.right - containerRight;
    if (overflowPx > 1) {
      addHit({
        kind: "container",
        selectorPath: selectorPath(el),
        element: describe(el),
        text: elementText(el),
        overflowPx,
        container: describe(container),
        containerRight,
        elementRight: rect.right,
      });
    }
  }

  return results;
})();
