import g from "../renderer/state";

export const LogError=(e: any) => {
    let str=`${e}`;
    if(e instanceof Error) {
        str=e.message;
    }
    g.setError({
        message: str
    })
};