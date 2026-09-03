using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using osu.Helpers;
using StableIpcBridge;

class SIGW
{
    static SIGW()
    {
        AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
        {
            if (args.Name.StartsWith("osu!,"))
            {
                string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "StableIpcBridge.dll");
                if (File.Exists(path))
                    return Assembly.LoadFrom(path);
            }
            return null;
        };
    }

    static void Main()
    {
        StableIpcClient client = new StableIpcClient();
        if (!client.Connect())
        {
            Console.Error.WriteLine("ERROR Cannot connect to osu! IPC");
            return;
        }

        TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        Console.WriteLine("PORT " + port);
        Console.Out.Flush();

        using (TcpClient socket = listener.AcceptTcpClient())
        {
            listener.Stop();
            using (NetworkStream stream = socket.GetStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8, false, 1024, true))
            using (StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false), 1024, true) { AutoFlush = true })
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    string response = Process(line, client);
                    if (response == null)
                    {
                        writer.WriteLine("{\"ok\":true}");
                        break;
                    }
                    writer.WriteLine(response);
                }
            }
        }
    }

    static string Process(string line, StableIpcClient client)
    {
        line = line.Trim();

        string cmd;
        string args = string.Empty;
        int sp = line.IndexOf(' ');
        if (sp >= 0)
        {
            cmd = line.Substring(0, sp).ToUpperInvariant();
            args = line.Substring(sp + 1).Trim();
        }
        else
        {
            cmd = line.ToUpperInvariant();
        }

        try
        {
            switch (cmd)
            {
                case "GET": return BuildJson(client.GetData());
                case "TIME": return "{\"Time\":" + client.GetTime() + "}";
                case "SCORE": return "{\"Score\":" + client.GetScore() + "}";
                case "MODE": return "{\"Mode\":" + client.GetMode() + "}";
                case "AVAILABLE": return "{\"Available\":" + client.GetAvailableTime() + "}";
                case "SPECTATEID": return "{\"SpectatingID\":" + client.GetSpectatingId() + "}";
                case "CHANGE": client.ChangeMode(int.Parse(args)); return "{\"ok\":true}";
                case "HANDLE": client.HandleArguments(args); return "{\"ok\":true}";
                case "PLAY": client.PlayAudio(); return "{\"ok\":true}";
                case "SETBEAT": client.SetBeatmap(args); return "{\"ok\":true}";
                case "SETSPECT": client.SetSpectate(int.Parse(args)); return "{\"ok\":true}";
                case "TOGGLEBUFFER": client.ToggleClientBuffer(); return "{\"ok\":true}";
                case "TOGGLESKIP": client.ToggleSkipCalculations(); return "{\"ok\":true}";
                case "SETMENU": client.SetMenuTime(int.Parse(args)); return "{\"ok\":true}";
                case "SETDIM": client.SetUserDim(int.Parse(args)); return "{\"ok\":true}";
                case "WAKE": return "{\"WakeUp\":" + client.WakeUp().ToString().ToLowerInvariant() + "}";
                case "QUITOSU": client.Quit(); return "{\"ok\":true}";
                case "EXIT": return null;
                default: return "{\"error\":\"unknown command\"}";
            }
        }
        catch (Exception e)
        {
            return "{\"error\":\"" + Escape(e.Message) + "\"}";
        }
    }

    static string BuildJson(InterProcessOsu.ClientData data)
    {
        if (data == null)
            return "{\"Connected\":false}";

        StringBuilder sb = new StringBuilder();
        sb.Append("{\"Connected\":true,");
        sb.Append("\"Mode\":").Append(data.Mode).Append(',');
        sb.Append("\"BeatmapId\":").Append(data.BeatmapId).Append(',');
        sb.Append("\"BeatmapChecksum\":\"").Append(Escape(data.BeatmapChecksum)).Append("\",");
        sb.Append("\"Score\":").Append(data.Score).Append(',');
        sb.Append("\"AudioTime\":").Append(data.AudioTime).Append(',');
        sb.Append("\"ReplayTime\":").Append(data.ReplayTime).Append(',');
        sb.Append("\"SpectatingID\":").Append(data.SpectatingID).Append(',');
        sb.Append("\"MenuTime\":").Append(data.MenuTime).Append(',');
        sb.Append("\"AudioPlaying\":").Append(data.AudioPlaying.ToString().ToLowerInvariant()).Append(',');
        sb.Append("\"DimLevel\":").Append(data.DimLevel).Append(',');
        sb.Append("\"Buffering\":").Append(data.Buffering.ToString().ToLowerInvariant()).Append(',');
        sb.Append("\"SkipCalculations\":").Append(data.SkipCalculations.ToString().ToLowerInvariant()).Append(',');
        sb.Append("\"LReplayFrame\":").Append(data.LReplayFrame).Append(',');
        sb.Append("\"LReplayMode\":").Append(data.LReplayMode.ToString().ToLowerInvariant()).Append(',');
        sb.Append("\"LReplayStreaming\":").Append(data.LReplayStreaming.ToString().ToLowerInvariant()).Append(',');
        sb.Append("\"LPlayerLoaded\":").Append(data.LPlayerLoaded.ToString().ToLowerInvariant()).Append(',');
        sb.Append("\"LReplayToEnd\":").Append(data.LReplayToEnd.ToString().ToLowerInvariant());
        sb.Append('}');
        return sb.ToString();
    }

    static string Escape(string s)
    {
        if (string.IsNullOrEmpty(s))
            return string.Empty;

        StringBuilder sb = new StringBuilder(s.Length + 2);
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: sb.Append(c); break;
            }
        }
        return sb.ToString();
    }
}
