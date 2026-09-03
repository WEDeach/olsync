import { Close as CloseIcon } from "@mui/icons-material";
import { Box, IconButton, Modal, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";

interface ZoomableImageProps {
    src: string;
    alt?: string;
    sx?: SxProps<Theme>;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const DRAG_THRESHOLD = 8;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface Metrics {
    containerWidth: number;
    containerHeight: number;
    centerX: number;
    centerY: number;
    baseImageWidth: number;
    baseImageHeight: number;
}

interface TransformState {
    scale: number;
    panX: number;
    panY: number;
}

type TransformAction =
    | { type: "reset" }
    | { type: "zoom"; factor: number; mouseX: number; mouseY: number; metrics: Metrics }
    | { type: "pan"; deltaX: number; deltaY: number; metrics: Metrics };

const transformReducer = (state: TransformState, action: TransformAction): TransformState => {
    if (action.type === "reset") return { scale: 1, panX: 0, panY: 0 };

    const { containerWidth, containerHeight, centerX, centerY, baseImageWidth, baseImageHeight } = action.metrics;

    if (action.type === "zoom") {
        const { factor, mouseX, mouseY } = action;
        const nextScale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
        const scaleFactor = nextScale / state.scale;
        const maxPanX = Math.max(0, (baseImageWidth * nextScale - containerWidth) / 2);
        const maxPanY = Math.max(0, (baseImageHeight * nextScale - containerHeight) / 2);
        return {
            scale: nextScale,
            panX: clamp(scaleFactor * state.panX + (1 - scaleFactor) * (mouseX - centerX), -maxPanX, maxPanX),
            panY: clamp(scaleFactor * state.panY + (1 - scaleFactor) * (mouseY - centerY), -maxPanY, maxPanY),
        };
    }

    const { deltaX, deltaY } = action;
    const maxPanX = Math.max(0, (baseImageWidth * state.scale - containerWidth) / 2);
    const maxPanY = Math.max(0, (baseImageHeight * state.scale - containerHeight) / 2);
    return {
        scale: state.scale,
        panX: clamp(state.panX + deltaX, -maxPanX, maxPanX),
        panY: clamp(state.panY + deltaY, -maxPanY, maxPanY),
    };
};

export const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt, sx }) => {
    const [open, setOpen] = useState(false);
    const [error, setError] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [transform, dispatch] = useReducer(transformReducer, { scale: 1, panX: 0, panY: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const metricsRef = useRef<Metrics>({
        containerWidth: 0,
        containerHeight: 0,
        centerX: 0,
        centerY: 0,
        baseImageWidth: 0,
        baseImageHeight: 0,
    });
    const transformRef = useRef(transform);
    const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const hasDraggedRef = useRef(false);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        transformRef.current = transform;
    }, [transform]);

    const updateMetrics = useCallback(() => {
        const containerEl = containerRef.current;
        const imgEl = imgRef.current;
        if (!containerEl || !imgEl) return;
        const rect = containerEl.getBoundingClientRect();
        const containerWidth = rect.width || window.innerWidth;
        const containerHeight = rect.height || window.innerHeight;
        const left = rect.width ? rect.left : 0;
        const top = rect.height ? rect.top : 0;
        const { naturalWidth, naturalHeight } = imgEl;
        if (naturalWidth === 0 || naturalHeight === 0) return;
        const maxWidth = Math.max(containerWidth - 128, 0);
        const maxHeight = Math.max(containerHeight - 128, 0);
        const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
        metricsRef.current = {
            containerWidth,
            containerHeight,
            centerX: left + containerWidth / 2,
            centerY: top + containerHeight / 2,
            baseImageWidth: naturalWidth * scale,
            baseImageHeight: naturalHeight * scale,
        };
    }, []);

    const handleOpen = useCallback(() => {
        dispatch({ type: "reset" });
        setOpen(true);
    }, []);

    const handleClose = useCallback(() => {
        setOpen(false);
    }, []);

    const handleContainerMouseDown = useCallback(() => {
        hasDraggedRef.current = false;
    }, []);

    const handleContainerClick = useCallback(() => {
        if (hasDraggedRef.current) {
            hasDraggedRef.current = false;
            return;
        }
        handleClose();
    }, [handleClose]);

    const handleImageClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        e.stopPropagation();
    }, []);

    const handleDoubleClick = useCallback(() => {
        dispatch({ type: "reset" });
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
        e.preventDefault();
        hasDraggedRef.current = false;
        setDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            panX: transformRef.current.panX,
            panY: transformRef.current.panY,
        };
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOpen();
            }
        },
        [handleOpen],
    );

    useEffect(() => {
        setError(false);
    }, [src]);

    useEffect(() => {
        if (!open) return;
        const scheduleUpdate = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                if (imgRef.current?.complete) updateMetrics();
            });
        };
        scheduleUpdate();
        const handleResize = () => scheduleUpdate();
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [open, updateMetrics]);

    useEffect(() => {
        if (!open || error) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (metricsRef.current.baseImageWidth === 0 || metricsRef.current.baseImageHeight === 0) {
                updateMetrics();
            }
            const metrics = metricsRef.current;
            if (metrics.baseImageWidth === 0 || metrics.baseImageHeight === 0) return;
            const factor = Math.exp(-e.deltaY * 0.001);
            dispatch({ type: "zoom", factor, mouseX: e.clientX, mouseY: e.clientY, metrics });
        };
        document.addEventListener("wheel", onWheel, { passive: false, capture: true });
        return () => document.removeEventListener("wheel", onWheel, { capture: true });
    }, [open, error, dispatch, updateMetrics]);

    useEffect(() => {
        if (!dragging) return;
        const handleMove = (e: MouseEvent) => {
            const start = dragStartRef.current;
            const deltaX = e.clientX - start.x;
            const deltaY = e.clientY - start.y;
            if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
                hasDraggedRef.current = true;
            }
            dispatch({ type: "pan", deltaX, deltaY, metrics: metricsRef.current });
        };
        const handleUp = () => setDragging(false);
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [dragging, dispatch]);

    const fallbackText = alt || "Image";
    const fallbackSx = { display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "action.hover" };
    const sxArray = sx ? (Array.isArray(sx) ? sx : [sx]) : [];

    return (
        <>
            {error ? (
                <Box sx={[fallbackSx, ...sxArray]}>
                    <Typography sx={{ color: "text.secondary" }}>{fallbackText}</Typography>
                </Box>
            ) : (
                <Box
                    component="img"
                    src={src}
                    alt={alt}
                    role="button"
                    tabIndex={0}
                    aria-label={alt ? `${alt} (click to zoom)` : "Click to zoom"}
                    onClick={handleOpen}
                    onKeyDown={handleKeyDown}
                    onError={() => setError(true)}
                    sx={sx}
                    style={{ cursor: "zoom-in" }}
                />
            )}
            <Modal open={open} onClose={handleClose} slotProps={{ backdrop: { sx: { bgcolor: "rgba(0,0,0,0.88)" } } }}>
                <Box
                    ref={containerRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label={alt || "Image preview"}
                    tabIndex={-1}
                    onClick={handleContainerClick}
                    onMouseDown={handleContainerMouseDown}
                    sx={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        outline: 0,
                    }}
                >
                    <IconButton
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClose();
                        }}
                        aria-label="Close"
                        sx={{
                            position: "absolute",
                            top: 16,
                            right: 16,
                            zIndex: 1,
                            color: "#fff",
                            bgcolor: "rgba(0,0,0,0.4)",
                            "&:hover": { bgcolor: "rgba(0,0,0,0.6)" },
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                    {error ? (
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
                            <Typography sx={{ color: "#fff" }}>{fallbackText}</Typography>
                        </Box>
                    ) : (
                        <Box
                            ref={imgRef}
                            component="img"
                            src={src}
                            alt={alt}
                            onMouseDown={handleMouseDown}
                            onClick={handleImageClick}
                            onDoubleClick={handleDoubleClick}
                            onLoad={() => {
                                setError(false);
                                updateMetrics();
                            }}
                            onError={() => setError(true)}
                            sx={{
                                maxWidth: "calc(100vw - 128px)",
                                maxHeight: "calc(100vh - 128px)",
                                objectFit: "contain",
                                cursor: dragging ? "grabbing" : "grab",
                                userSelect: "none",
                                WebkitUserDrag: "none",
                            }}
                            style={{
                                transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0) scale(${transform.scale})`,
                                transformOrigin: "center",
                                willChange: "transform",
                            }}
                        />
                    )}
                </Box>
            </Modal>
        </>
    );
};
