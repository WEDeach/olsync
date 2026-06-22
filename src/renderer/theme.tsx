import { createTheme } from "@mui/material/styles";

const colorTheme = createTheme({
    palette: {
        primary: { main: "#7C6BAA", contrastText: "#fff" },
        secondary: { main: "#B8A9D9", contrastText: "#333" },
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
    shape: {
        borderRadius: 10,
    },
    typography: {
        fontFamily: '"Inter", "Noto Sans TC", system-ui, -apple-system, sans-serif',
        button: {
            textTransform: "none",
            fontWeight: 500,
        },
    },
});

const theme = createTheme(
    {
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
                        borderColor: "rgba(124,107,170,0.25)",
                        "&:hover": {
                            borderColor: "rgba(124,107,170,0.4)",
                            backgroundColor: "rgba(124,107,170,0.04)",
                        },
                    },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: "none",
                        boxShadow: "0 1px 3px rgba(124,107,170,0.08), 0 1px 2px rgba(124,107,170,0.05)",
                    },
                    outlined: {
                        borderColor: "#E0DCE8",
                    },
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        borderRadius: 12,
                        boxShadow: "0 1px 3px rgba(124,107,170,0.08), 0 1px 2px rgba(124,107,170,0.05)",
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
                    tooltip: {
                        backgroundColor: "#3A3A4A",
                        color: "#fff",
                        fontSize: "0.8125rem",
                        borderRadius: 6,
                        padding: "6px 10px",
                    },
                    arrow: {
                        color: "#3A3A4A",
                    },
                },
            },
            MuiLink: {
                styleOverrides: {
                    root: {
                        color: colorTheme.palette.primary.main,
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
            MuiDialog: {
                styleOverrides: {
                    paper: {
                        borderRadius: 12,
                    },
                },
            },
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        borderLeft: "1px solid #E0DCE8",
                    },
                },
            },
            MuiDivider: {
                styleOverrides: {
                    root: {
                        borderColor: "#E0DCE8",
                    },
                },
            },
            MuiSlider: {
                styleOverrides: {
                    root: {
                        color: colorTheme.palette.primary.main,
                    },
                },
            },
            MuiSwitch: {
                styleOverrides: {
                    switchBase: {
                        "&.Mui-checked": {
                            color: colorTheme.palette.primary.main,
                        },
                        "&.Mui-checked + .MuiSwitch-track": {
                            backgroundColor: "rgba(124,107,170,0.3)",
                        },
                    },
                },
            },
            MuiToggleButton: {
                styleOverrides: {
                    root: {
                        textTransform: "none",
                        borderRadius: 8,
                        borderColor: "#E0DCE8",
                        "&.Mui-selected": {
                            backgroundColor: "rgba(124,107,170,0.08)",
                            borderColor: colorTheme.palette.primary.main,
                            "&:hover": {
                                backgroundColor: "rgba(124,107,170,0.12)",
                            },
                        },
                    },
                },
            },
        },
    },
    colorTheme,
);

export default theme;
