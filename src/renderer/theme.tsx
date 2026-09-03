import { createTheme, Shadows } from "@mui/material/styles";

// Fluent-aligned elevation: purple-tinted, deliberately subtle (Starward-style ThemeShadow feel).
const tintedShadows = (() => {
    const arr: string[] = ["none"];
    for (let i = 1; i <= 24; i++) {
        const y = Math.max(1, Math.round(i / 3));
        const blur = 2 + i * 1.5;
        const alpha = (0.05 + i * 0.005).toFixed(3);
        arr.push(`0 ${y}px ${blur}px rgba(40, 36, 54, ${alpha})`);
    }
    return arr as Shadows;
})();

const theme = createTheme({
    cssVariables: { colorSchemeSelector: "class" },
    colorSchemes: {
        light: {
            palette: {
                primary: { main: "#7C6BAA", light: "#A89BC8", dark: "#62538D", contrastText: "#fff" },
                secondary: { main: "#B8A9D9", light: "#D0C6E5", dark: "#9585BC", contrastText: "#333" },
                info: { main: "#5C7FA8", light: "#89A6C5", dark: "#3F5F86", contrastText: "#fff" },
                success: { main: "#5C9674", light: "#8AB49A", dark: "#3F7255", contrastText: "#fff" },
                warning: { main: "#B8793E", light: "#D3A06D", dark: "#8F5A2C", contrastText: "#fff" },
                error: { main: "#C64E5B", light: "#D97882", dark: "#A43745", contrastText: "#fff" },
                background: {
                    default: "#EDE7F3",
                    paper: "#F3EFF8",
                },
                text: {
                    primary: "#3A3A4A",
                    secondary: "#7A7A8A",
                },
                action: {
                    hover: "rgba(124,107,170,0.08)",
                    selected: "rgba(124,107,170,0.12)",
                },
                divider: "#E0DCE8",
            },
        },
        dark: {
            palette: {
                primary: { main: "#A79BD1", light: "#C4BBE5", dark: "#8F82BC", contrastText: "#241F2E" },
                secondary: { main: "#8F80B8", light: "#B3A6D0", dark: "#6F6098", contrastText: "#fff" },
                info: { main: "#7798BE", light: "#9EB8D6", dark: "#5A7B9F", contrastText: "#17151D" },
                success: { main: "#78AA8D", light: "#A2C7AE", dark: "#568269", contrastText: "#17151D" },
                warning: { main: "#D2A06A", light: "#E4BD8F", dark: "#A87743", contrastText: "#241F2E" },
                error: { main: "#C97884", light: "#DEA1AA", dark: "#BC7480", contrastText: "#241F2E" },
                background: {
                    default: "#17151D",
                    paper: "#211E2A",
                },
                text: {
                    primary: "#E6E2EF",
                    secondary: "#A29BB5",
                },
                action: {
                    hover: "rgba(167,155,209,0.10)",
                    selected: "rgba(167,155,209,0.16)",
                },
                divider: "#37323F",
            },
        },
    },
    shape: {
        borderRadius: 8,
    },
    typography: {
        fontFamily: '"Inter", "Noto Sans TC", system-ui, -apple-system, sans-serif',
        h1: { fontSize: "2.5rem", fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.2 },
        h2: { fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.25px", lineHeight: 1.25 },
        h3: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.3 },
        h4: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.35 },
        h5: { fontSize: "1.125rem", fontWeight: 500, lineHeight: 1.4 },
        h6: { fontSize: "1rem", fontWeight: 600, lineHeight: 1.4 },
        button: {
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.875rem",
        },
    },
    shadows: tintedShadows,
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                "*": {
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(124,107,170,0.3) transparent",
                },
                "*::-webkit-scrollbar": { width: 6, height: 6 },
                "*::-webkit-scrollbar-track": { background: "transparent" },
                "*::-webkit-scrollbar-thumb": {
                    backgroundColor: "rgba(124,107,170,0.25)",
                    borderRadius: 3,
                },
                "*::-webkit-scrollbar-thumb:hover": {
                    backgroundColor: "rgba(124,107,170,0.45)",
                },
                "@media (prefers-reduced-motion: reduce)": {
                    "*, *::before, *::after": {
                        animationDuration: "0.01ms !important",
                        transitionDuration: "0.01ms !important",
                    },
                },
            },
        },
        MuiStack: {
            defaultProps: { spacing: 2 },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    boxShadow: "none",
                    transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                },
                contained: {
                    boxShadow: "none",
                    "&:hover": {
                        boxShadow: "0 2px 8px rgba(124,107,170,0.15)",
                        transform: "translateY(-1px)",
                    },
                    "&:active": {
                        transform: "translateY(0)",
                    },
                },
                outlined: {
                    borderColor: "var(--mui-palette-divider)",
                    "&:hover": {
                        borderColor: "var(--mui-palette-primary-main)",
                        backgroundColor: "var(--mui-palette-action-hover)",
                    },
                },
            },
        },
        MuiButtonBase: {
            styleOverrides: {
                root: {
                    cursor: "pointer",
                    "&.Mui-disabled": {
                        cursor: "default",
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    boxShadow: "var(--mui-shadows-1)",
                },
                outlined: {
                    borderColor: "var(--mui-palette-divider)",
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    border: "1px solid var(--mui-palette-divider)",
                    boxShadow: "var(--mui-shadows-1)",
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    borderRadius: 16,
                    background: "color-mix(in srgb, var(--mui-palette-background-paper) 88%, transparent)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                },
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                },
            },
        },
        MuiTextField: {
            defaultProps: {
                size: "small",
            },
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        borderRadius: 8,
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: ({ theme }) => ({
                    backgroundColor: "#3A3A4A",
                    color: "#fff",
                    fontSize: "0.8125rem",
                    borderRadius: 6,
                    padding: "6px 10px",
                    [theme.getColorSchemeSelector("dark")]: {
                        backgroundColor: "#E6E2EF",
                        color: "#241F2E",
                    },
                }),
                arrow: ({ theme }) => ({
                    color: "#3A3A4A",
                    [theme.getColorSchemeSelector("dark")]: {
                        color: "#E6E2EF",
                    },
                }),
            },
        },
        MuiLink: {
            styleOverrides: {
                root: {
                    color: "var(--mui-palette-primary-main)",
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    transition: "background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                    borderRadius: 6,
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    borderLeft: "1px solid var(--mui-palette-divider)",
                },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: "var(--mui-palette-divider)",
                },
            },
        },
        MuiSlider: {
            styleOverrides: {
                root: {
                    color: "var(--mui-palette-primary-main)",
                },
            },
        },
        MuiSwitch: {
            styleOverrides: {
                switchBase: {
                    "&.Mui-checked": {
                        color: "var(--mui-palette-primary-main)",
                    },
                    "&.Mui-checked + .MuiSwitch-track": {
                        backgroundColor: "var(--mui-palette-primary-main)",
                    },
                },
            },
        },
        MuiToggleButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    borderRadius: 8,
                    borderColor: "var(--mui-palette-divider)",
                    "&.Mui-selected": {
                        backgroundColor: "var(--mui-palette-action-hover)",
                        borderColor: "var(--mui-palette-primary-main)",
                        "&:hover": {
                            backgroundColor: "var(--mui-palette-action-selected)",
                        },
                    },
                },
            },
        },
    },
});

export default theme;
