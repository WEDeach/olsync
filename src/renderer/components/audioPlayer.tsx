import { Box,IconButton,Slider,Collapse,ClickAwayListener } from "@mui/material";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import * as React from "react";
import { observer } from "mobx-react";
import { action,makeObservable,observable } from "mobx";

interface AudioPlayerProps {
    url: string;
}

class AudioState {
    volume: number=0.5;

    constructor() {
        makeObservable(this,{
            volume: observable,
            setVolume: action,
        });
    }

    setVolume(newVolume: number) {
        this.volume=newVolume;
    }
}

const audioState=new AudioState();

export const AudioPlayer=observer(({ url }: AudioPlayerProps) => {
    const audioRef=React.useRef<HTMLAudioElement>(null);
    const [isPlaying,setIsPlaying]=React.useState(false);
    const [currentTime,setCurrentTime]=React.useState(0);
    const [duration,setDuration]=React.useState(0);
    const [showVolumeControl,setShowVolumeControl]=React.useState(false);

    React.useEffect(() => {
        if(audioRef.current) {
            audioRef.current.volume=audioState.volume;
        }
    },[audioState.volume]);

    React.useEffect(() => {
        const audio=audioRef.current;
        if(!audio) return;

        const updateTime=() => setCurrentTime(audio.currentTime);
        const updateDuration=() => setDuration(audio.duration);

        audio.addEventListener('timeupdate',updateTime);
        audio.addEventListener('loadedmetadata',updateDuration);

        return () => {
            audio.removeEventListener('timeupdate',updateTime);
            audio.removeEventListener('loadedmetadata',updateDuration);
        };
    },[]);

    const togglePlay=async () => {
        const audio=audioRef.current;
        if(!audio) return;

        try {
            if(isPlaying) {
                audio.pause();
            } else {
                await audio.play();
            }
            setIsPlaying(!isPlaying);
        } catch(_) {

        }
    };

    const toggleVolumeControl=() => {
        setShowVolumeControl(!showVolumeControl);
    };

    const handleClickAway=() => {
        setShowVolumeControl(false);
    };

    const handleVolumeChange=(_: Event,newValue: number|number[]) => {
        const volumeValue=newValue as number;
        audioState.setVolume(volumeValue);
    };

    const handleSeek=(_: Event,newValue: number|number[]) => {
        const seekTime=newValue as number;
        if(audioRef.current) {
            audioRef.current.currentTime=seekTime;
            setCurrentTime(seekTime);
        }
    };

    const formatTime=(time: number) => {
        const minutes=Math.floor(time/60);
        const seconds=Math.floor(time%60);
        return `${minutes}:${seconds.toString().padStart(2,'0')}`;
    };

    return (
        <Box sx={{ display: 'flex',alignItems: 'center',gap: 1,minWidth: 300 }}>
            <audio ref={audioRef} src={url} />

            <IconButton onClick={togglePlay} size="small">
                {isPlaying? <PauseIcon />:<PlayArrowIcon />}
            </IconButton>

            <Box sx={{ flex: 1 }}>
                <Slider
                    size="small"
                    value={currentTime}
                    max={duration||100}
                    onChange={handleSeek}
                    sx={{ width: '100%' }}
                />
                <Box sx={{ display: 'flex',justifyContent: 'space-between',fontSize: '0.75rem' }}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </Box>
            </Box>
            <ClickAwayListener onClickAway={handleClickAway}>
                <Box sx={{ display: 'flex',alignItems: 'center',gap: 0.5 }}>
                    <IconButton onClick={toggleVolumeControl} size="small">
                        <VolumeUpIcon fontSize="small" />
                    </IconButton>

                    <Collapse in={showVolumeControl} orientation="horizontal">
                        <Slider
                            size="small"
                            value={audioState.volume}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={handleVolumeChange}
                            sx={{ width: 60,ml: 1 }}
                        />
                    </Collapse>
                </Box>
            </ClickAwayListener>
        </Box>
    );
});