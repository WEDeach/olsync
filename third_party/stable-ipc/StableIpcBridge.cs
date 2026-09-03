using System;
using System.Runtime.Remoting;
using System.Runtime.Remoting.Channels;
using System.Runtime.Remoting.Channels.Ipc;

namespace osu
{
    public enum OsuModes
    {
        Menu,
        Edit,
        Play,
        Exit,
        SelectEdit,
        SelectPlay,
        SelectDrawings,
        Rank,
        Update,
        Busy,
        Unknown,
        Lobby,
        MatchSetup,
        SelectMulti,
        RankingVs,
        OnlineSelection,
        OptionsOffsetWizard,
        RankingTagCoop,
        RankingTeam,
        BeatmapImport,
        PackageUpdater,
        Benchmark,
        Tourney,
        Charts
    }
}

namespace osu.Helpers
{
    public class InterProcessOsu : MarshalByRefObject
    {
        [Serializable]
        public class ClientData
        {
            public bool Buffering;
            public int Mode;
            public int SpectatingID;
            public int Score;
            public int AudioTime;
            public int ReplayTime;
            public bool SkipCalculations;
            public string BeatmapChecksum;
            public int BeatmapId;
            public int DimLevel;
            public int MenuTime;
            public bool AudioPlaying;
            public int LLastAction;
            public int LNextScoreSync;
            public bool LReplayToEnd;
            public bool LPlayerLoaded;
            public bool LReplayMode;
            public bool LReplayStreaming;
            public int LReplayFrame;
        }

        public int GetCurrentTime() { return 0; }
        public int GetAvailableTime() { return 0; }
        public int GetCurrentScore() { return 0; }
        public int GetSpectatingId() { return 0; }
        public osu.OsuModes GetCurrentMode() { return 0; }
        public ClientData GetBulkClientData() { return null; }

        public void HandleArguments(string args) { }
        public bool WakeUp() { return true; }
        public void Quit() { }
        public void ToggleClientBuffer() { }
        public void ToggleSkipCalculations() { }
        public void SetMenuTime(int time) { }
        public void SetSpectate(int userId) { }
        public void SetBeatmap(string checksum) { }
        public void PlayAudio() { }
        public void SetUserDim(int dim) { }
        public void ChangeMode(OsuModes mode) { }
    }
}

namespace StableIpcBridge
{
    public class StableIpcClient
    {
        private osu.Helpers.InterProcessOsu proxy;
        private static bool channelRegistered = false;

        public string ConnectedUri { get; private set; }

        public bool Connect()
        {
            try
            {
                if (!channelRegistered)
                {
                    ChannelServices.RegisterChannel(new IpcClientChannel(), false);
                    channelRegistered = true;
                }

                string uri = "ipc://osu!/loader";
                var type = typeof(osu.Helpers.InterProcessOsu);
                proxy = (osu.Helpers.InterProcessOsu)Activator.GetObject(type, uri);
                proxy.GetCurrentTime();
                ConnectedUri = uri;
                return true;
            }
            catch
            {
                proxy = null;
                return false;
            }
        }

        private bool EnsureProxy()
        {
            if (proxy == null && !Connect()) return false;
            return true;
        }

        public osu.Helpers.InterProcessOsu.ClientData GetData()
        {
            if (!EnsureProxy()) return null;

            try
            {
                return proxy.GetBulkClientData();
            }
            catch
            {
                var data = new osu.Helpers.InterProcessOsu.ClientData();
                bool gotAny = false;
                try { data.Score = proxy.GetCurrentScore(); gotAny = true; } catch { }
                try { data.AudioTime = proxy.GetCurrentTime(); gotAny = true; } catch { }
                try { data.ReplayTime = proxy.GetAvailableTime(); gotAny = true; } catch { }
                try { data.SpectatingID = proxy.GetSpectatingId(); gotAny = true; } catch { }
                try { data.Mode = (int)proxy.GetCurrentMode(); gotAny = true; } catch { }
                if (!gotAny)
                {
                    proxy = null;
                    return null;
                }
                return data;
            }
        }

        public int GetScore() { return EnsureProxy() ? Try(() => proxy.GetCurrentScore()) : 0; }
        public int GetTime() { return EnsureProxy() ? Try(() => proxy.GetCurrentTime()) : 0; }
        public int GetMode() { return EnsureProxy() ? Try(() => (int)proxy.GetCurrentMode()) : 0; }
        public int GetAvailableTime() { return EnsureProxy() ? Try(() => proxy.GetAvailableTime()) : 0; }
        public int GetSpectatingId() { return EnsureProxy() ? Try(() => proxy.GetSpectatingId()) : -1; }

        public void ChangeMode(int mode) { if (EnsureProxy()) proxy.ChangeMode((osu.OsuModes)mode); }
        public void HandleArguments(string args) { if (EnsureProxy()) proxy.HandleArguments(args); }
        public void PlayAudio() { if (EnsureProxy()) proxy.PlayAudio(); }
        public void SetBeatmap(string checksum) { if (EnsureProxy()) proxy.SetBeatmap(checksum); }
        public void SetSpectate(int userId) { if (EnsureProxy()) proxy.SetSpectate(userId); }
        public void ToggleClientBuffer() { if (EnsureProxy()) proxy.ToggleClientBuffer(); }
        public void ToggleSkipCalculations() { if (EnsureProxy()) proxy.ToggleSkipCalculations(); }
        public void SetMenuTime(int time) { if (EnsureProxy()) proxy.SetMenuTime(time); }
        public void SetUserDim(int dim) { if (EnsureProxy()) proxy.SetUserDim(dim); }
        public bool WakeUp() { return EnsureProxy() ? Try(() => proxy.WakeUp()) : false; }
        public void Quit() { if (EnsureProxy()) proxy.Quit(); }

        private int Try(Func<int> func)
        {
            try { return func(); } catch { return 0; }
        }

        private bool Try(Func<bool> func)
        {
            try { return func(); } catch { return false; }
        }
    }
}
