import { KeyboardArrowDown as KeyboardArrowDownIcon } from "@mui/icons-material";
import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";

const SCROLLABLE_OVERFLOW = /auto|scroll|overlay/;

function findVerticalScroller(el: HTMLElement | null): HTMLElement | undefined {
    let fixedCandidate: HTMLElement | undefined;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        const overflowY = getComputedStyle(node).overflowY;
        if (!SCROLLABLE_OVERFLOW.test(overflowY)) continue;
        if (node.scrollHeight > node.clientHeight + 1) {
            if (node.offsetParent !== null) return node;
            fixedCandidate ??= node;
        }
    }
    if (fixedCandidate) return fixedCandidate;
    const doc = document.documentElement;
    return doc.scrollHeight > doc.clientHeight + 1 ? doc : undefined;
}

function canScrollDownFrom(el: HTMLElement): boolean {
    const scroller = findVerticalScroller(el);
    if (scroller) return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 12;
    const doc = document.documentElement;
    return window.scrollY + window.innerHeight < doc.scrollHeight - 12;
}

export interface ScrollDownHintProps {
    anchorRef: React.RefObject<HTMLElement | null>;
    offset?: number;
}

export const ScrollDownHint: React.FC<ScrollDownHintProps> = ({ anchorRef, offset = 12 }) => {
    const [hint, setHint] = useState(false);
    const iconRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // The scroller is re-resolved on every update and the scroll listener moves with
        // it, so a mount that happens before layout settles cannot leave the hint
        // listening to nothing.
        const anchor = anchorRef.current;
        if (!anchor) return;
        let scrollTarget: HTMLElement | undefined;
        let observedContent: Element | null = null;
        const update = () => {
            const found = findVerticalScroller(anchor);
            if (found !== scrollTarget) {
                scrollTarget?.removeEventListener("scroll", update);
                scrollTarget = found;
                scrollTarget?.addEventListener("scroll", update, { passive: true });
            }
            // Observe the first content child as well: the scroller's own box does not
            // resize when its content grows, so height changes would go unnoticed.
            const content = anchor.firstElementChild;
            if (content && content !== observedContent) {
                if (observedContent) observer.unobserve(observedContent);
                observedContent = content;
                observer.observe(content);
            }
            setHint(canScrollDownFrom(anchor));
        };
        const observer = new ResizeObserver(update);
        observer.observe(anchor);
        const raf = requestAnimationFrame(update);
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, { passive: true });
        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            scrollTarget?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update);
        };
    }, [anchorRef]);

    // Feedback loop: a gentle bob while the hint is visible; paused with the page, dropped under reduced motion.
    useEffect(() => {
        const icon = iconRef.current;
        if (!icon || !hint) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const animation = icon.animate(
            [{ transform: "translateY(0)" }, { transform: "translateY(4px)" }, { transform: "translateY(0)" }],
            { duration: 1200, iterations: Infinity, easing: "ease-in-out" },
        );
        const syncVisibility = () => {
            if (document.hidden) animation.pause();
            else animation.play();
        };
        syncVisibility();
        document.addEventListener("visibilitychange", syncVisibility);
        return () => {
            document.removeEventListener("visibilitychange", syncVisibility);
            animation.cancel();
        };
    }, [hint]);

    return (
        <Box
            sx={{
                position: "absolute",
                bottom: offset,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                bgcolor: "background.paper",
                boxShadow: 2,
                pointerEvents: "none",
                opacity: hint ? 1 : 0,
                transition: "opacity 150ms ease-out",
                visibility: hint ? "visible" : "hidden",
                zIndex: 1,
            }}
        >
            <Box ref={iconRef} component="span" sx={{ display: "flex" }}>
                <KeyboardArrowDownIcon fontSize="small" color="action" />
            </Box>
        </Box>
    );
};
