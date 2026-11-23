import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsRight } from "lucide-react";

/** Fit whole controls on one line and expose the remaining controls in a popup. */
export default function OverflowToolbar({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).flatMap((child) => {
    if (isValidElement<{ className?: string; children?: ReactNode }>(child) && child.props.className === "toolbar-group") {
      return Children.toArray(child.props.children).map((node) => ({ node, divider: false }));
    }
    return [{ node: child, divider: true }];
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const hasOverflow = visibleCount < items.length;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;
    // The inert measuring row keeps intrinsic sizes available even for hidden
    // controls, including selects whose text changes while the popup is closed.
    measure.setAttribute("inert", "");
    const resize = () => {
      const style = getComputedStyle(root);
      const available = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const widths = Array.from(measure.children).map((item) => item.getBoundingClientRect().width);
      const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * 4;
      let count = widths.length;
      if (total > available) {
        const space = available - 34 - 8; // overflow button and its gap
        let used = 0;
        count = 0;
        for (const width of widths) {
          const next = used + (count ? 4 : 0) + width;
          if (next > space) break;
          used = next;
          count++;
        }
        while (count && items[count - 1].divider) count--;
      }
      setVisibleCount(count);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [children]);

  useEffect(() => {
    if (!hasOverflow) setOpen(false);
  }, [hasOverflow]);

  useEffect(() => {
    if (!open) return;
    popupRef.current?.querySelector<HTMLElement>("button:not(:disabled), select:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="toolbar" role="toolbar" aria-label="Editor toolbar">
      <div className="toolbar-items">
        {items.slice(0, visibleCount).map(({ node }, index) => <div className="toolbar-item" key={index}>{node}</div>)}
      </div>
      {hasOverflow ? <button
        ref={buttonRef}
        type="button"
        className="icon-button toolbar-overflow-button"
        title="More editor tools"
        aria-label="More editor tools"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => setOpen((value) => !value)}
      ><ChevronsRight size={18} /></button> : null}
      {hasOverflow && open ? <div
        ref={popupRef}
        id={popupId}
        className="toolbar-overflow-panel"
        role="dialog"
        aria-label="More editor tools"
        onClick={(event) => {
          if ((event.target as Element).closest("button:not(:disabled)")) setOpen(false);
        }}
        onChange={() => setOpen(false)}
      >
        {items.slice(visibleCount).filter((item) => !item.divider).map(({ node }, index) => <div className="toolbar-item" key={index}>{node}</div>)}
      </div> : null}
      <div ref={measureRef} className="toolbar-measure" aria-hidden="true">
        {items.map(({ node }, index) => <div className="toolbar-item" key={index}>{node}</div>)}
      </div>
    </div>
  );
}
