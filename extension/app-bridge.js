// Cầu nối giữa trang app Fen Izakaya và tiện ích.
(function () {
  const VERSION = '1.0.0';
  const announce = () => window.postMessage({ source: 'FEN_EXT', type: 'READY', version: VERSION }, '*');

  announce();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== 'FEN_APP') return;
    if (ev.data.type === 'PING') {
      announce();
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }).then((s) => {
        if (s) window.postMessage({ source: 'FEN_EXT', type: 'STATUS', payload: s }, '*');
      }).catch(() => {});
    }
    if (ev.data.type === 'START_SYNC') {
      chrome.runtime.sendMessage({ type: 'START_SYNC', job: ev.data.job }).catch((e) => {
        window.postMessage({ source: 'FEN_EXT', type: 'STATUS', payload: { status: 'error', text: 'Không khởi động được tiện ích: ' + e.message } }, '*');
      });
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'FEN_STATUS') {
      window.postMessage({ source: 'FEN_EXT', type: 'STATUS', payload: msg.payload }, '*');
    }
  });
})();
