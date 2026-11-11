const assert = require('node:assert/strict');
const {spawn, execFileSync} = require('node:child_process');
const {mkdtempSync} = require('node:fs');
const {createServer} = require('node:net');
const {tmpdir} = require('node:os');
const {resolve, join} = require('node:path');
const {setTimeout: wait} = require('node:timers/promises');

const executable = resolve(process.argv[2]);
const profile = mkdtempSync(join(tmpdir(), 'StoryWeave-test-'));
const origin = 'https://storyweave.example/';

async function poll(check, description) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = await check();
    if (result) return result;
    await wait(150);
  }
  throw new Error(description);
}

async function reservePort() {
  const listener = createServer();
  await new Promise((done, fail) => {
    listener.once('error', fail);
    listener.listen(0, '127.0.0.1', done);
  });
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  return port;
}

async function runDesktop() {
  const port = await reservePort();
  const child = spawn(executable, ['--data-dir', profile], {
    windowsHide: true, stdio: 'ignore',
    env: {...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + port}
  });
  let socket;
  try {
    const target = await poll(async () => {
      if (child.exitCode !== null) throw new Error('Desktop process ended before opening the bookshelf');
      let pages;
      try { pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); }
      catch { return null; }
      return pages.find(page => page.url === origin + 'index.html' && page.webSocketDebuggerUrl);
    }, 'The desktop WebView did not open the StoryWeave origin');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, fail) => {
      socket.addEventListener('open', done, {once: true});
      socket.addEventListener('error', fail, {once: true});
    });
    let request = 0;
    async function evaluate(expression) {
      const id = ++request;
      const reply = await new Promise((done, fail) => {
        const timer = setTimeout(() => {
          socket.removeEventListener('message', listener);
          fail(new Error('WebView did not answer the evaluation'));
        }, 5000);
        function listener(event) {
          const message = JSON.parse(event.data);
          if (message.id !== id) return;
          clearTimeout(timer);
          socket.removeEventListener('message', listener);
          done(message);
        }
        socket.addEventListener('message', listener);
        socket.send(JSON.stringify({id, method: 'Runtime.evaluate',
          params: {expression, awaitPromise: true, returnByValue: true}}));
      });
      assert(!reply.error && !reply.result?.exceptionDetails, JSON.stringify(reply));
      return reply.result.result.value;
    }
    await poll(() => evaluate("Boolean(document.querySelector('.book-card') && typeof state !== 'undefined' && db && state)"),
      'The native window did not start with IndexedDB and a bookshelf');
    return {child, socket, evaluate};
  } catch (error) {
    socket?.close();
    child.kill();
    throw error;
  }
}

async function closeDesktop(desktop) {
  const command = `
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DesktopSmokeWindow {
  private delegate bool Visitor(IntPtr window, IntPtr arg);
  [DllImport("user32.dll")] private static extern bool EnumWindows(Visitor visitor, IntPtr arg);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder title, int length);
  [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  public static bool Close(uint process) {
    bool sent = false;
    EnumWindows((window, arg) => {
      uint owner;
      GetWindowThreadProcessId(window, out owner);
      if (owner != process) return true;
      var title = new StringBuilder(80);
      GetWindowText(window, title, title.Capacity);
      if (!title.ToString().EndsWith(" StoryWeave", StringComparison.Ordinal)) return true;
      sent = PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
      return false;
    }, IntPtr.Zero);
    return sent;
  }
}
'@
    if (![DesktopSmokeWindow]::Close(${desktop.child.pid})) { throw 'The StoryWeave window could not be closed.' }
  `;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(command,'utf16le').toString('base64')], {windowsHide: true});
  await poll(() => desktop.child.exitCode !== null, 'The app did not finish the native close operation');
  assert.equal(desktop.child.exitCode, 0);
}

async function main() {
  let desktop = await runDesktop();
  try {
    assert(await desktop.evaluate("(async()=> (await fetch('/vendor/azgaar/index.html')).ok)()"));
    assert(await desktop.evaluate("Boolean(document.querySelector('link[href=\"/desktop.css\"]'))"));
    const chapterKey = await desktop.evaluate(`(() => {
      document.querySelector('.book-card').click();
      document.querySelector('[data-sw14-chapter]').click();
      const field = document.getElementById('chapterText');
      field.value = '桌面稿件保存检查';
      field.dispatchEvent(new Event('input', {bubbles:true}));
      field.setSelectionRange(2,4);
      clearTimeout(pendingSave);
      const original = saveCurrentState;
      saveCurrentState = () => {
        chapter().text += '。已从关闭请求保存。';
        return original();
      };
      return chapter().id;
    })()`);
    await closeDesktop(desktop);
    desktop = await runDesktop();
    const saved = await desktop.evaluate(`(() => {
      document.getElementById('sw37-resume').click();
      const field = document.getElementById('chapterText');
      return {id:chapter().id,text:field.value,start:field.selectionStart,end:field.selectionEnd};
    })()`);
    assert.deepEqual(saved, {id:chapterKey,text:'桌面稿件保存检查。已从关闭请求保存。',start:2,end:4});
    await closeDesktop(desktop);
    console.log('PASS Windows WebView2: packaged assets, native close flush, restart, manuscript and selection');
  } finally {
    desktop.socket.close();
    if (desktop.child.exitCode === null) desktop.child.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
