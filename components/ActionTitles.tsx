"use client";

import { useEffect } from "react";

const ICON_CONTROL = 'button, a[href], [role="button"]';

function hasVisibleText(element: HTMLElement): boolean {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('[aria-hidden="true"], .sr-only')) continue;
    const style = getComputedStyle(parent);
    if (style.display !== "none" && style.visibility !== "hidden") return true;
  }
  return false;
}

function refreshTitle(element: HTMLElement): void {
  const generated = element.dataset.autoActionTitle;
  const isDisabled = element.matches(':disabled, [aria-disabled="true"]');
  const isIconOnly = !!element.querySelector("svg") &&
    !element.querySelector('img, canvas, [class*="thumbnail"], [class*="__thumb"]') &&
    !hasVisibleText(element);
  const label = element.getAttribute("aria-label")?.trim();
  if (isDisabled || !isIconOnly || !label) {
    if (generated && element.title === generated) element.removeAttribute("title");
    delete element.dataset.autoActionTitle;
    return;
  }
  if (element.hasAttribute("title") && element.title !== generated) return;
  element.title = label;
  element.dataset.autoActionTitle = label;
}

function refreshWithin(root: Element): void {
  if (root instanceof HTMLElement && root.matches(ICON_CONTROL)) refreshTitle(root);
  root.querySelectorAll<HTMLElement>(ICON_CONTROL).forEach(refreshTitle);
}

/** Native hover tips for controls whose icon has no visible text label. */
export function ActionTitles() {
  useEffect(() => {
    refreshWithin(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof HTMLElement) {
          refreshTitle(record.target);
        } else if (record.type === "characterData") {
          const control = record.target.parentElement?.closest<HTMLElement>(ICON_CONTROL);
          if (control) refreshTitle(control);
        } else {
          record.addedNodes.forEach((node) => {
            if (node instanceof Element) refreshWithin(node);
          });
          if (record.target instanceof Element) {
            const control = record.target.closest<HTMLElement>(ICON_CONTROL);
            if (control) refreshTitle(control);
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "aria-disabled", "disabled"],
      subtree: true,
    });
    const refreshHovered = (event: PointerEvent) => {
      if (event.target instanceof Element) {
        const control = event.target.closest<HTMLElement>(ICON_CONTROL);
        if (control) refreshTitle(control);
      }
    };
    document.addEventListener("pointerover", refreshHovered, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerover", refreshHovered, true);
    };
  }, []);
  return null;
}
