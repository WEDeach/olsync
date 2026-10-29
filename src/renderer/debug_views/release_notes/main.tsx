import { Box, Button, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GITHUB_OWNER, GITHUB_REPO } from "../../../updater-core/constants";
import { ReleaseNotes } from "../../components/releaseNotes";

interface GithubRelease {
    tag_name: string;
    name?: string;
    body?: string;
    published_at?: string;
    html_url: string;
}

const RELEASES_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=100`;

export default function ReleaseNotesDebugView() {
    const [releases, setReleases] = useState<GithubRelease[]>([]);
    const [selectedTag, setSelectedTag] = useState("");
    const [notes, setNotes] = useState("");
    const [originalNotes, setOriginalNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadReleases = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(RELEASES_URL, {
                headers: {
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
            if (!response.ok) {
                throw new Error(`GitHub API ${response.status} ${response.statusText}`);
            }
            const data = (await response.json()) as GithubRelease[];
            if (!Array.isArray(data)) throw new Error("Invalid GitHub release response");
            setReleases(data);
            if (data.length > 0) {
                setSelectedTag(data[0].tag_name);
                setNotes(data[0].body ?? "");
                setOriginalNotes(data[0].body ?? "");
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadReleases();
    }, [loadReleases]);

    const selected = useMemo(
        () => releases.find((release) => release.tag_name === selectedTag),
        [releases, selectedTag],
    );

    const onSelectRelease = (tag: string) => {
        const release = releases.find((entry) => entry.tag_name === tag);
        setSelectedTag(tag);
        setNotes(release?.body ?? "");
        setOriginalNotes(release?.body ?? "");
    };

    return (
        <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
                    DEBUG_VIEW: Release Notes
                </Typography>
                <Button variant="outlined" onClick={loadReleases} disabled={loading}>
                    Refresh
                </Button>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <TextField
                    select
                    size="small"
                    label="GitHub release"
                    value={selectedTag}
                    onChange={(event) => onSelectRelease(event.target.value)}
                    sx={{ minWidth: 320 }}
                    disabled={loading || releases.length === 0}
                >
                    {releases.map((release) => (
                        <MenuItem key={release.tag_name} value={release.tag_name}>
                            {release.tag_name}
                            {release.name ? ` — ${release.name}` : ""}
                        </MenuItem>
                    ))}
                </TextField>
                {selected?.published_at && (
                    <Typography variant="caption" color="text.secondary">
                        {new Date(selected.published_at).toLocaleString()}
                    </Typography>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Button
                    variant="outlined"
                    disabled={!selected || notes === originalNotes}
                    onClick={() => setNotes(originalNotes)}
                >
                    Reset to GitHub content
                </Button>
            </Stack>

            {error && (
                <Typography variant="body2" color="error">
                    {error}
                </Typography>
            )}

            {loading && releases.length === 0 ? (
                <Stack sx={{ alignItems: "center", py: 6 }}>
                    <CircularProgress size={32} />
                </Stack>
            ) : (
                <Stack direction="row" spacing={2} sx={{ flex: 1, minHeight: 0 }}>
                    <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
                            <Typography variant="subtitle2">Markdown source</Typography>
                        </Box>
                        <TextField
                            multiline
                            fullWidth
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Select a GitHub release to load its notes."
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                "& .MuiInputBase-root": { height: "100%", alignItems: "flex-start" },
                                "& textarea": { height: "100% !important", overflow: "auto !important" },
                                "& fieldset": { border: 0 },
                            }}
                        />
                    </Paper>
                    <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
                            <Typography variant="subtitle2">Rendered preview</Typography>
                        </Box>
                        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
                            <ReleaseNotes notes={notes} maxHeight="none" />
                        </Box>
                    </Paper>
                </Stack>
            )}
        </Box>
    );
}
