"use client";

import {
  Children,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ICON_SIZE, MoreVerticalIcon } from "@/components/icons";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

interface PageToolbarItemProps {
  /** What the control is called as a row in the More menu. */
  menuLabel: string;
  menuIcon: ReactNode;
  /** Higher stays in the bar longer. The lowest goes to the menu first. */
  priority: number;
  danger?: boolean;
  children: ReactNode;
}

/**
 * A group the bar may move into its More menu when there is no room for it.
 *
 * Collapsed, it stays mounted: the photo picker keeps its dialog's state in its
 * trigger, and the Move button places its menu from its own rect. It is parked
 * invisibly at the bar's right end, where the More button is, and the menu row
 * simply clicks it, so every control does exactly what it does in the bar, and
 * anything it opens opens under More.
 */
export function PageToolbarItem({ children }: PageToolbarItemProps) {
  return <>{children}</>;
}

/**
 * The floating bar over a deck page: one row, always.
 *
 * It used to wrap, so a phone got Front/Back and "Add time, servings" on one
 * row and the link and delete icons alone on a second. Now, when its groups
 * do not fit, the lowest-priority `PageToolbarItem`s go into a More menu at the
 * end of the bar instead. Which ones is decided from measured widths, the
 * moment before it would have wrapped, so a wide screen never sees a More
 * button and a narrow one never sees a second row.
 *
 * Measuring: every group is drawn at its natural width on one row for the
 * length of a synchronous read (`data-measuring`), then put back. Nothing paints
 * in between.
 *
 * The contents page's hint is the exception: a sentence that is meant to wrap,
 * over the controls it explains. A bar holding it keeps wrapping, and still
 * marks each group that starts a row `data-row-start` (and the bar
 * `data-wrapped`) so the stylesheet can drop the hairline there and lay the
 * wrapped bar out on purpose.
 */
export function PageToolbar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const moreGroupRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // How many items are in the menu, lowest priority first.
  const [collapsedCount, setCollapsedCount] = useState(0);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  const items: Array<{ props: PageToolbarItemProps; index: number }> = [];
  Children.toArray(children).forEach((child, index) => {
    if (isValidElement(child) && child.type === PageToolbarItem) {
      items.push({ props: (child as ReactElement<PageToolbarItemProps>).props, index });
    }
  });
  // Ties go to the one further along the bar.
  const collapseOrder = [...items].sort(
    (a, b) => a.props.priority - b.props.priority || b.index - a.index,
  );
  const collapsed = new Set(collapseOrder.slice(0, collapsedCount).map((item) => item.index));
  const itemCount = items.length;

  const measure = () => {
    const bar = ref.current;
    const shell = bar?.parentElement;
    if (!bar || !shell) return;

    // Row-start marks, for the bar that is still allowed to wrap.
    let prevBottom: number | null = null;
    let wrapped = false;
    for (const child of Array.from(bar.children) as HTMLElement[]) {
      if (child.hasAttribute("data-overflowed") || child === moreGroupRef.current) continue;
      const rowStart = prevBottom !== null && child.offsetTop >= prevBottom - 1;
      child.toggleAttribute("data-row-start", rowStart);
      wrapped ||= rowStart;
      prevBottom = child.offsetTop + child.offsetHeight;
    }
    bar.toggleAttribute("data-wrapped", wrapped);

    if (itemCount === 0 || bar.querySelector(":scope > .recipe-page-toolbar__hint")) {
      setCollapsedCount(0);
      return;
    }

    bar.setAttribute("data-measuring", "");
    const style = getComputedStyle(bar);
    const available =
      shell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const groups = Array.from(bar.children) as HTMLElement[];
    const more = moreGroupRef.current;
    const moreWidth = more ? more.getBoundingClientRect().width : 0;
    const widths = new Map<number, number>();
    let total = 0;
    for (const group of groups) {
      if (group === more) continue;
      const width = group.getBoundingClientRect().width;
      widths.set(Number(group.dataset.toolbarIndex ?? -1), width);
      total += width;
    }
    bar.removeAttribute("data-measuring");

    let count = 0;
    if (total > available + 0.5) {
      let need = total + moreWidth;
      while (count < collapseOrder.length && need > available + 0.5) {
        need -= widths.get(collapseOrder[count].index) ?? 0;
        count += 1;
      }
    }
    setCollapsedCount(count);
  };
  // The observers below outlive a render; they call the latest one.
  const measureRef = useRef<() => void>(() => {});

  // Every render, because what is in the bar can change with any of them. It
  // settles at once: the second pass measures the same widths.
  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  });

  useLayoutEffect(() => {
    const bar = ref.current;
    const shell = bar?.parentElement;
    if (!bar || !shell) return;
    // The shell's width is the room there is: the screen, zoom and the deck's
    // own sizing all arrive as a resize of it. The mutation watch covers a
    // label changing at the same width ("Add time" becoming "Done").
    const resize = new ResizeObserver(() => measureRef.current());
    resize.observe(shell);
    const mutation = new MutationObserver(() => measureRef.current());
    mutation.observe(bar, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);

  useMenuDismiss([menuRef, moreRef], () => setMenuAt(null), { enabled: Boolean(menuAt) });

  // Place the menu under the More button's right edge, kept on screen.
  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node || !menuAt) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(menuAt.x - rect.width, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(menuAt.y, window.innerHeight - rect.height - 8))}px`;
  }, [menuAt]);

  const activate = (index: number) => {
    setMenuAt(null);
    const group = ref.current?.querySelector<HTMLElement>(`:scope > [data-toolbar-index="${index}"]`);
    group?.querySelector<HTMLElement>("button")?.click();
  };

  const menuItems = items.filter((item) => collapsed.has(item.index));

  return (
    <div ref={ref} className="recipe-page-toolbar">
      {Children.toArray(children).map((child, index) => {
        if (!isValidElement(child) || child.type !== PageToolbarItem) return child;
        const props = (child as ReactElement<PageToolbarItemProps>).props;
        return (
          <div
            key={child.key ?? index}
            className="recipe-page-toolbar__group"
            data-toolbar-index={index}
            data-overflowed={collapsed.has(index) ? "" : undefined}
          >
            {props.children}
          </div>
        );
      })}
      {/* Always rendered so its width is known before it is needed; shown only
          when something is in it. A group like the rest, so it gets the same
          hairline in front of it. */}
      <div
        ref={moreGroupRef}
        className="recipe-page-toolbar__group recipe-page-toolbar__more"
        hidden={menuItems.length === 0}
      >
        <button
          ref={moreRef}
          type="button"
          className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${menuAt ? "is-active" : ""}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAt)}
          aria-label="More"
          title="More"
          onClick={(event) => {
            event.stopPropagation();
            if (menuAt) {
              setMenuAt(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setMenuAt({ x: rect.right, y: rect.bottom + 6 });
          }}
        >
          <MoreVerticalIcon size={ICON_SIZE.md} />
        </button>
      </div>
      {menuAt &&
        menuItems.length > 0 &&
        createPortal(
          <div
            ref={menuRef}
            className="cp-menu rail-tile-menu recipe-page-toolbar__menu"
            role="menu"
            aria-label="More"
            style={{ top: menuAt.y, left: menuAt.x }}
          >
            {menuItems.map((item) => (
              <button
                key={item.index}
                type="button"
                role="menuitem"
                className={`cp-menu__item ${item.props.danger ? "cp-menu__item--danger" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  activate(item.index);
                }}
              >
                {item.props.menuIcon}
                {item.props.menuLabel}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
