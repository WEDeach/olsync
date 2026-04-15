import { createTheme } from "@mui/material/styles";

// Create a Material-UI theme instance
// https://mui.com/customization/theming/
const colorTheme = createTheme({
    palette: {
        primary: { main: "#8B2FAA", contrastText: "#fff" },
        secondary: { main: "#FF74D4", contrastText: "#000" },
        background: {
            default: "#FFDDE1",
            paper: "#FFDDE1",
        },
        text: {
            primary: "#642CA9",
            secondary: "#B231AA",
        },
        action: {
            hover: "rgba(30,136,229,0.08)",
            selected: "rgba(30,136,229,0.16)",
        },
        divider: "#642CA9",
    },
});

const theme = createTheme(
    {
        components: {
            MuiStack: {
                defaultProps: {
                    spacing: 2,
                },
            },
        },
    },
    colorTheme,
);

export default theme;
