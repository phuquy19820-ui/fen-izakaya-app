// Chạy trên trang CUKCUK: nếu có yêu cầu đồng bộ đang chờ thì ra lệnh cho đoạn mã trong trang chạy,
// và chuyển kết quả về tiện ích.
(function () {
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== 'FEN_PAGE') return;
    chrome.runtime.sendMessage({ type: 'PAGE_' + ev.data.type, payload: ev.data.payload }).catch(() => {});
  });

  chrome.runtime.sendMessage({ type: 'GET_JOB' }).then((job) => {
    if (!job) return;
    window.postMessage({ source: 'FEN_EXT_CS', type: 'RUN', job: { fromDate: job.fromDate, toDate: job.toDate } }, '*');
  }).catch(() => {});
})();
