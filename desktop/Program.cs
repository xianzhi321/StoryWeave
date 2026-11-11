using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace StoryWeave.Desktop;

internal static class Program
{
    internal const string AppName = "叙境 StoryWeave";

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        try
        {
            var data = args switch
            {
                [] => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StoryWeave"),
                ["--data-dir", var path] => Path.GetFullPath(path),
                _ => throw new ArgumentException("启动参数无效。")
            };
            Directory.CreateDirectory(data);
            using var instance = OpenProfile(data);
            if (instance is null)
            {
                MessageBox.Show("这份写作资料已在另一个叙境窗口打开。", AppName);
                return;
            }

            using var window = new WritingWindow(data);
            Application.Run(window);
        }
        catch (Exception error)
        {
            MessageBox.Show("无法打开叙境。\n\n" + error.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static FileStream? OpenProfile(string directory)
    {
        try
        {
            return new FileStream(Path.Combine(directory, "profile.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        }
        catch (IOException error) when ((error.HResult & 0xffff) is 32 or 33)
        {
            return null;
        }
    }
}

internal sealed class WritingWindow : Form
{
    private const string Host = "storyweave.example";
    private const string Origin = "https://" + Host;
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly string profile;
    private TaskCompletionSource<bool>? closingSave;
    private string? closeNonce;
    private bool allowClose;

    internal WritingWindow(string data)
    {
        profile = Path.Combine(data, "WebView2");
        Text = Program.AppName;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1120, 760);
        MinimumSize = new Size(480, 420);
        Controls.Add(browser);
    }

    protected override async void OnShown(EventArgs args)
    {
        base.OnShown(args);
        try
        {
            string assets = Path.Combine(AppContext.BaseDirectory, "web");
            if (!File.Exists(Path.Combine(assets, "index.html")))
                throw new FileNotFoundException("请先解压完整桌面版，再运行 StoryWeave.exe。");

            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            if (IsDisposed) return;
            await browser.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;
            var core = browser.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(Host, assets, CoreWebView2HostResourceAccessKind.Deny);
            core.NavigationStarting += (_, navigation) => navigation.Cancel = !IsAppOrigin(navigation.Uri);
            core.NewWindowRequested += (_, request) => request.Handled = true;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.WebMessageReceived += OnWebMessage;
            await core.AddScriptToExecuteOnDocumentCreatedAsync("""
                if (window.top === window && location.origin === 'https://storyweave.example') {
                  document.addEventListener('DOMContentLoaded', () => {
                    const css = document.createElement('link');
                    css.rel = 'stylesheet';
                    css.href = '/desktop.css';
                    document.head.append(css);
                  }, {once:true});
                }
                """);
            if (!IsDisposed) core.Navigate(Origin + "/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            if (!IsDisposed) ShowStartupError("请安装 Microsoft Edge WebView2 Runtime 后重试。");
        }
        catch (Exception error)
        {
            if (!IsDisposed) ShowStartupError(error.Message);
        }
    }

    private static bool IsAppOrigin(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps && uri.Host == Host && uri.IsDefaultPort;

    private void ShowStartupError(string message)
    {
        MessageBox.Show(this, message, Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        allowClose = true;
        Close();
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (closeNonce is null || !IsAppOrigin(args.Source)) return;
        if (args.WebMessageAsJson == JsonSerializer.Serialize(closeNonce + ":ok"))
            closingSave?.TrySetResult(true);
        else if (args.WebMessageAsJson == JsonSerializer.Serialize(closeNonce + ":error"))
            closingSave?.TrySetResult(false);
    }

    protected override async void OnFormClosing(FormClosingEventArgs args)
    {
        base.OnFormClosing(args);
        var core = browser.CoreWebView2;
        if (args.Cancel || allowClose || core is null || !IsAppOrigin(core.Source)) return;
        args.Cancel = true;
        if (closingSave is not null) return;

        closingSave = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        closeNonce = Guid.NewGuid().ToString("N");
        browser.Enabled = false;
        try
        {
            await core.ExecuteScriptAsync($$"""
                (async () => {
                  const request = {{JsonSerializer.Serialize(closeNonce)}};
                  try {
                    if (typeof state !== 'undefined' && state) {
                      window.StoryWeaveDesk?.rememberPosition();
                      await saveCurrentState();
                    }
                    window.chrome.webview.postMessage(request + ':ok');
                  } catch (_) {
                    window.chrome.webview.postMessage(request + ':error');
                  }
                })();
                """).WaitAsync(TimeSpan.FromSeconds(8));
            if (!await closingSave.Task.WaitAsync(TimeSpan.FromSeconds(8)))
                throw new IOException("稿件保存未完成。");
            allowClose = true;
            Close();
        }
        catch
        {
            MessageBox.Show(this, "本次保存未完成，写作窗口仍然打开。请检查存储空间，或导出备份后重试。",
                Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            closingSave = null;
            closeNonce = null;
            if (!IsDisposed) browser.Enabled = true;
        }
    }
}
