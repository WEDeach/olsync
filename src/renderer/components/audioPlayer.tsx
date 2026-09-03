import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { Box, IconButton, Slider, Typography } from "@mui/material";
import { action, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";

/**
 * Props for AudioPlayer.
 *
 * When `volume`/`muted`/`onVolumeChange`/`onMutedChange` are omitted the
 * component manages volume internally via module-level `audioState` (table
 * cell usage).  Pass all four to get controlled behaviour with persistence
 * (beatmap drawer usage).
 *
 * @param url - Audio source URL or data URI.
 * @param volume - Controlled volume 0–1.
 * @param muted - Controlled muted state.
 * @param onVolumeChange - Called when the user adjusts the volume slider.
 * @param onMutedChange - Called when the user clicks the mute toggle.
 */
export interface AudioPlayerProps {
    url: string;
    volume?: number;
    muted?: boolean;
    onVolumeChange?: (v: number) => void;
    onMutedChange?: (m: boolean) => void;
}

class AudioState {
    volume: number = 0.5;
    muted: boolean = false;

    constructor() {
        makeObservable(this, {
            volume: observable,
            muted: observable,
            setVolume: action,
            setMuted: action,
        });
    }

    setVolume(newVolume: number) {
        this.volume = newVolume;
    }

    setMuted(m: boolean) {
        this.muted = m;
    }
}

const audioState = new AudioState();

export const AudioPlayer = observer(({ url, volume, muted, onVolumeChange, onMutedChange }: AudioPlayerProps) => {
    const isControlled = volume !== undefined && muted !== undefined;
    const effectiveVolume = isControlled ? (volume as number) : audioState.volume;
    const effectiveMuted = isControlled ? (muted as boolean) : audioState.muted;

    const audioRef = React.useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [currentTime, setCurrentTime] = React.useState(0);
    const [duration, setDuration] = React.useState(0);

    React.useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = effectiveVolume;
        audio.muted = effectiveMuted;
    }, [effectiveVolume, effectiveMuted]);

    React.useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => setCurrentTime(audio.currentTime);
        const updateDuration = () => setDuration(audio.duration);
        const onEnded = () => setIsPlaying(false);

        audio.addEventListener("timeupdate", updateTime);
        audio.addEventListener("loadedmetadata", updateDuration);
        audio.addEventListener("ended", onEnded);

        return () => {
            audio.removeEventListener("timeupdate", updateTime);
            audio.removeEventListener("loadedmetadata", updateDuration);
            audio.removeEventListener("ended", onEnded);
        };
    }, []);

    const togglePlay = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        try {
            if (isPlaying) {
                audio.pause();
            } else {
                await audio.play();
            }
            setIsPlaying(!isPlaying);
        } catch (_) {}
    };

    const toggleMute = () => {
        const next = !effectiveMuted;
        if (isControlled) {
            onMutedChange?.(next);
        } else {
            audioState.setMuted(next);
        }
    };

    const handleVolumeChange = (_: Event, newValue: number | number[]) => {
        const v = newValue as number;
        if (isControlled) {
            onVolumeChange?.(v);
        } else {
            audioState.setVolume(v);
        }
    };

    const handleSeek = (_: Event, newValue: number | number[]) => {
        const seekTime = newValue as number;
        if (audioRef.current) {
            audioRef.current.currentTime = seekTime;
            setCurrentTime(seekTime);
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                minWidth: 280,
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                px: 1.5,
                py: 0.5,
            }}
        >
            <audio ref={audioRef} src={url} />
            <IconButton onClick={togglePlay} size="small" color="primary">
                {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Slider
                    size="small"
                    value={currentTime}
                    max={duration || 100}
                    onChange={handleSeek}
                    sx={{ width: "100%", display: "block" }}
                />
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "-0.5rem",
                        marginBottom: "-0.5rem",
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{
                            color: "text.secondary",
                        }}
                    >
                        {formatTime(currentTime)}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: "text.secondary",
                        }}
                    >
                        {formatTime(duration)}
                    </Typography>
                </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <IconButton onClick={toggleMute} size="small" color={effectiveMuted ? "default" : "primary"}>
                    {effectiveMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
                </IconButton>
                <Slider
                    size="small"
                    value={effectiveMuted ? 0 : effectiveVolume}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={handleVolumeChange}
                    sx={{ width: 60 }}
                    disabled={effectiveMuted}
                />
            </Box>
        </Box>
    );
});
