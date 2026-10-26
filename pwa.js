/* PWA controls are independent of story state and the v1 saves. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('pwa-dialog'), status = $('pwa-status');
  const download = $('pwa-download'), install = $('pwa-install');
  let registration, installPrompt, downloading = false;

  function installHelp() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    $('pwa-install-help').textContent = standalone ? '已在独立应用窗口中运行。' : ios
      ? '在 Safari 中打开，点击“分享”，选择“添加到主屏幕”。'
      : '打开浏览器菜单，选择“安装应用”或“安装求是西行”；支持安装时也可点击下方按钮。';
    install.hidden = standalone || !installPrompt;
  }

  function workerMessage(type, onProgress) {
    return new Promise((resolve, reject) => {
      const worker = registration?.active;
      if (!worker) { reject(new Error('离线资源尚未就绪')); return; }
      const channel = new MessageChannel();
      let timer;
      const close = () => { clearTimeout(timer); channel.port1.close(); };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { close(); reject(new Error('下载响应超时')); }, 60000);
      };
      channel.port1.onmessage = ({ data }) => {
        arm();
        if (data.type === 'PROGRESS') { onProgress?.(data); return; }
        close();
        if (data.type === 'ERROR') reject(new Error(data.message));
        else resolve(data);
      };
      arm();
      worker.postMessage({ type }, [channel.port2]);
    });
  }

  async function refreshStatus() {
    if (downloading || !registration?.active) return;
    try {
      const data = await workerMessage('STATUS');
      status.textContent = data.audioCount === data.audioTotal
        ? '剧情、图片与全部配乐已就绪，可以离线游玩。'
        : `剧情与图片已就绪，可以离线游玩。离线配乐：${data.audioCount} / ${data.audioTotal}。`;
      download.disabled = data.audioCount === data.audioTotal;
      download.textContent = download.disabled ? '离线配乐已就绪' : '下载离线配乐';
      $('pwa-progress').hidden = true;
    } catch (_) {
      status.textContent = '暂时无法检查离线资源，请联网后重新打开游戏重试。';
    }
  }

  $('pwa-settings').addEventListener('click', () => { installHelp(); dialog.showModal(); refreshStatus(); });
  $('pwa-close').addEventListener('click', () => dialog.close());
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; installHelp();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; installHelp(); });
  install.addEventListener('click', async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null; install.hidden = true;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch (_) { /* The browser menu remains available. */ }
    installHelp();
  });
  download.addEventListener('click', async () => {
    if (downloading) return;
    downloading = true; download.disabled = true;
    const progress = $('pwa-progress'); progress.hidden = false;
    status.textContent = '正在下载离线配乐，请保持游戏打开……';
    try {
      await workerMessage('DOWNLOAD_AUDIO', data => {
        progress.max = data.total; progress.value = data.done;
        status.textContent = `正在下载离线配乐：${data.done} / ${data.total}，请保持游戏打开……`;
      });
      downloading = false; await refreshStatus();
    } catch (_) {
      downloading = false; download.disabled = false; download.textContent = '重试下载离线配乐';
      progress.hidden = true;
      status.textContent = '配乐下载未完成，请检查网络和设备存储后重试；已下载的文件会保留。';
    }
  });

  installHelp();
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = '此环境暂不支持离线安装，请使用 HTTPS 网站或 localhost 本地服务打开。';
    return;
  }
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      const watchUpdate = () => {
        if (registration.waiting) $('pwa-update').hidden = false;
        const worker = registration.installing;
        if (worker) worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && registration.active) $('pwa-update').hidden = false;
          if (worker.state === 'redundant' && !registration.active) status.textContent = '离线准备未完成，请联网后重新打开游戏重试；当前仍可在线游玩。';
        });
      };
      watchUpdate(); registration.addEventListener('updatefound', watchUpdate);
      if (registration.active) refreshStatus();
      navigator.serviceWorker.ready.then(refreshStatus);
    } catch (_) {
      status.textContent = '离线准备失败，请联网后重新打开游戏重试；当前仍可在线游玩。';
    }
  });
})();
