import { CircularProgress, type CircularProgressProps } from "@mui/material";
import { forwardRef, useMemo } from "react";
import { usePageVisibility } from "../../../hooks/usePageVisibility";

export const PausableCircularProgress = forwardRef<HTMLSpanElement, CircularProgressProps>((props, ref) => {
    const { sx: userSx, ...rest } = props;
    const hidden = usePageVisibility();
    const sx = useMemo(() => {
        const pauseSx = {
            animationPlayState: hidden ? "paused" : "running",
            "& svg": {
                animationPlayState: hidden ? "paused" : "running",
            },
            "& circle": {
                animationPlayState: hidden ? "paused" : "running",
            },
            "& .MuiCircularProgress-circle": {
                animationPlayState: hidden ? "paused" : "running",
            },
        };
        return Array.isArray(userSx) ? [pauseSx, ...userSx] : userSx ? [pauseSx, userSx] : [pauseSx];
    }, [hidden, userSx]);
    return <CircularProgress ref={ref} sx={sx} {...rest} />;
});
PausableCircularProgress.displayName = "PausableCircularProgress";
