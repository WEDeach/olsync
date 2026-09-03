import { useEffect, useState } from "react";

export function usePageVisibility(): boolean {
    const [hidden, setHidden] = useState(() => document.hidden);
    useEffect(() => {
        const handle = () => setHidden(document.hidden);
        document.addEventListener("visibilitychange", handle);
        return () => document.removeEventListener("visibilitychange", handle);
    }, []);
    return hidden;
}
