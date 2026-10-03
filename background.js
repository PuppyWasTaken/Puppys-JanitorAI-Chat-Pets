importScripts('pet-core.js');

// A content-script match alone misses navigation from the home page into a chat.
chrome.webNavigation.onHistoryStateUpdated.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'chat-bar-pet-route' });
  } catch {
    if (!ChatBarPetCore.isChat(url)) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId }, files: ['pet-core.js', 'content.js']
      });
    } catch {
      // The tab may have closed or navigated outside the granted host permission.
    }
  }
}, { url: [{ hostEquals: 'janitorai.com', schemes: ['https'] }] });
