import React,{ useState } from "react";
import { Observer } from "mobx-react";
import { runInAction } from "mobx";
import {
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    OutlinedInput,
    Stack,
    TextField,
} from "@mui/material";
import { Visibility,VisibilityOff } from "@mui/icons-material";
import g from "../state";

export interface IApiSettingsProps {
}

const OnApiClientConfigChanged=(client_id?: string,client_secret?: string) => {
    runInAction(() => {
        if(client_id!==undefined) {
            g.cacheVal.str_client_id=client_id;
        }
        if(client_secret!==undefined) {
            g.cacheVal.str_client_secret=client_secret;
        }
    });
};

export const ApiSettings: React.FC<IApiSettingsProps>=() => {
    const [showSecret,setShowSecret]=useState(false);

    return (
        <Observer>
            {() => {
                const clientId=g.cacheVal.str_client_id??"";
                const clientSecret=g.cacheVal.str_client_secret??"";

                return (
                    <Stack direction={"row"} spacing={1} flexGrow={1}>
                        <TextField
                            label="Client Id"
                            variant="outlined"
                            value={clientId}
                            sx={{ flexGrow: 1 }}
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                OnApiClientConfigChanged(event.target.value,undefined);
                            }}
                        />
                        <FormControl variant="outlined" sx={{ flexGrow: 1 }}>
                            <InputLabel>Client Secret</InputLabel>
                            <OutlinedInput
                                label="Client Secret"
                                value={clientSecret}
                                type={showSecret? "text":"password"}
                                endAdornment={
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() => setShowSecret(!showSecret)}
                                            edge="end"
                                        >
                                            {showSecret? <VisibilityOff />:<Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                }
                                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                    OnApiClientConfigChanged(undefined,event.target.value);
                                }}
                            />
                        </FormControl>
                    </Stack>
                );
            }}
        </Observer>
    );
};
