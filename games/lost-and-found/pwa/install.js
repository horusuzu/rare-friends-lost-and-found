if ('serviceWorker' in navigator && window.isSecureContext) {
 navigator.serviceWorker.register('./sw.js').catch(() => {
  // The online game stays usable; installation/offline availability is optional.
  console.warn('Island home-screen cache is unavailable. Online play is still available.');
 });
}
