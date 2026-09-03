import { keyframes } from "@emotion/react";
import { Box, Button, Stack, Typography } from "@mui/material";
import React from "react";
import { usePageVisibility } from "../../hooks/usePageVisibility";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";

const PRIMARY = "#7C6BAA";
const SECONDARY = "#B8A9D9";
const LIGHT = "#EDE7F3";

const orbit = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

const orbitReverse = keyframes`
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
`;

const pulse = keyframes`
    0%, 100% { transform: scale(1); opacity: 0.4; }
    50% { transform: scale(1.15); opacity: 0.7; }
`;

const dotBlink = keyframes`
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
`;

const ringPulse = keyframes`
    0% { transform: scale(0.6); opacity: 0.8; }
    100% { transform: scale(2.2); opacity: 0; }
`;

const shimmer = keyframes`
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
`;

const fadeSlideUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
`;

const ORBIT_SIZE = 120;
const DOT_SIZE = 14;

const OrbitDot = React.memo<{ angle: number; delay: number; color: string; hidden: boolean }>(
    ({ angle, delay, color, hidden }) => (
        <Box
            sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 0,
                height: 0,
                transform: `rotate(${angle}deg)`,
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    top: -(DOT_SIZE / 2),
                    left: ORBIT_SIZE / 2 - DOT_SIZE / 2,
                    width: DOT_SIZE,
                    height: DOT_SIZE,
                    borderRadius: "50%",
                    bgcolor: color,
                    animation: `${dotBlink} 1.4s ease-in-out ${delay}s infinite`,
                    animationPlayState: hidden ? "paused" : "running",
                }}
            />
        </Box>
    ),
);

const LoadingOverlay: React.FC<{
    open: boolean;
    message?: string;
    aborter?: AbortController;
    onAbort?: () => void;
}> = ({ open, message, aborter, onAbort }) => {
    const hidden = usePageVisibility();
    const animationPlayState = hidden ? "paused" : "running";
    if (!open) return null;

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                zIndex: (t) => t.zIndex.drawer + 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(58, 58, 74, 0.72)",
                backdropFilter: "blur(6px)",
                animation: `${fadeSlideUp} 0.3s ease-out both`,
                animationPlayState,
            }}
        >
            <Stack
                spacing={3}
                useFlexGap
                sx={{
                    alignItems: "center",
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        width: ORBIT_SIZE,
                        height: ORBIT_SIZE,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "50%",
                            border: `2px solid ${SECONDARY}33`,
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "50%",
                            border: `2px solid ${PRIMARY}`,
                            borderRightColor: "transparent",
                            borderBottomColor: "transparent",
                            animation: `${orbit} 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                            animationPlayState,
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 8,
                            borderRadius: "50%",
                            border: `2px solid ${SECONDARY}`,
                            borderLeftColor: "transparent",
                            borderTopColor: "transparent",
                            animation: `${orbitReverse} 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                            animationPlayState,
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 16,
                            borderRadius: "50%",
                            bgcolor: PRIMARY,
                            animation: `${pulse} 1.8s ease-in-out infinite`,
                            animationPlayState,
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "50%",
                            border: `2px solid ${PRIMARY}`,
                            animation: `${ringPulse} 2s ease-out infinite`,
                            animationPlayState,
                        }}
                    />
                    <OrbitDot angle={0} delay={0} color={PRIMARY} hidden={hidden} />
                    <OrbitDot angle={72} delay={0.2} color={SECONDARY} hidden={hidden} />
                    <OrbitDot angle={144} delay={0.4} color={PRIMARY} hidden={hidden} />
                    <OrbitDot angle={216} delay={0.6} color={SECONDARY} hidden={hidden} />
                    <OrbitDot angle={288} delay={0.8} color={PRIMARY} hidden={hidden} />
                </Box>

                {message && (
                    <Typography
                        sx={{
                            color: LIGHT,
                            fontSize: "0.9rem",
                            fontWeight: 400,
                            maxWidth: 360,
                            textAlign: "center",
                            background: `linear-gradient(90deg, ${LIGHT}88, ${LIGHT}, ${LIGHT}88)`,
                            backgroundSize: "200% 100%",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                            animation: `${shimmer} 2.5s linear infinite`,
                            animationPlayState,
                        }}
                    >
                        {message}
                    </Typography>
                )}

                {aborter && (
                    <Button
                        size="small"
                        variant="contained"
                        color="error"
                        onClick={onAbort}
                        sx={{
                            borderRadius: 8,
                            animation: `${fadeSlideUp} 0.4s ease-out 0.2s both`,
                            animationPlayState,
                        }}
                    >
                        {__(I18nStrings.BTN_ABORT)}
                    </Button>
                )}
            </Stack>
        </Box>
    );
};

export default LoadingOverlay;
