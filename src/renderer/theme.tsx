import { createTheme } from "@mui/material/styles";

// Create a Material-UI theme instance
// https://mui.com/customization/theming/
const theme=createTheme({
    components: {
        MuiStack: {
            defaultProps: {
                spacing: 2,
            },
        },
    },
});

export default theme;