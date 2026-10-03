(() => {
  if (window.top !== window || window.__chatBarPetLoaded) return;
  window.__chatBarPetLoaded = true;
  const { isChat, settings: normalizeSettings, railPosition, composerSelector, railSelector, frameSources } = ChatBarPetCore;
  let settings = normalizeSettings();
  let editor = null;
  let rail = null;
  let host = null;
  let image = null;
  let mirror = null;
  let frame = 0;
  let resetTimer = 0;
  let paw = 0;
  let composing = false;
  let compositionEndTimer = 0;
  let observer = null;
  let resizeObserver = null;
  let listening = false;
  let positioned = false;
  let customPet = null;
  let assets = frameSources(settings.skin, customPet, path => chrome.runtime.getURL(path));
  let settingsRevision = 0;
  let customRevision = 0;
  const mirroredStyles = [
    'direction', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'lineHeight', 'letterSpacing', 'textTransform', 'textIndent', 'textAlign',
    'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'
  ];

  function eligible(element) {
    if (!(element instanceof HTMLElement) || !element.matches(composerSelector)) return false;
    if (element.disabled || element.readOnly || element.closest('[role="dialog"], dialog, [role="search"]')) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 80 && rect.height > 15 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function chooseEditor() {
    const focused = document.activeElement;
    if (eligible(focused)) return focused;
    // Keep the pet on the chat composer even when a different field has focus.
    // Only eligible composer input events animate it; unrelated fields never do.
    if (editor?.isConnected && eligible(editor)) return editor;
    // Never fall back to message-edit textareas, persona fields, or search inputs.
    const candidates = [...document.querySelectorAll(composerSelector)].filter(eligible);
    candidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return candidates[0] || null;
  }

  function createPet() {
    positioned = false;
    host = document.createElement('div');
    host.id = 'janitor-chat-bar-pet';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0 auto auto 0!important;pointer-events:none!important;z-index:2147483647!important;display:none!important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{pointer-events:none}img{display:block;width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none;filter:drop-shadow(0 2px 2px #0003)}';
    image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.src = assets[0];
    shadow.append(style, image);
    document.documentElement.append(host);
    // A layout mirror measures native textarea wrapping, which has no DOM caret.
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText = 'all:initial;position:fixed;top:0;left:-10000px;visibility:hidden;pointer-events:none;box-sizing:border-box;border-style:solid;overflow:hidden;';
    shadow.append(mirror);
    preloadAssets();
  }

  function preloadAssets() {
    for (const src of assets) { const preload = new Image(); preload.src = src; }
  }

  function applySettings(value, refreshFrames = false) {
    const next = normalizeSettings(value);
    const skinChanged = next.skin !== settings.skin;
    settings = next;
    if (skinChanged || refreshFrames) {
      assets = frameSources(settings.skin, customPet, path => chrome.runtime.getURL(path));
      clearTimeout(resetTimer);
      paw = 0;
      if (image) {
        image.src = assets[0];
        preloadAssets();
      }
    }
    sync();
  }

  function caretPosition(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    for (const key of mirroredStyles) mirror.style[key] = style[key];
    // clientWidth excludes the vertical scrollbar but includes padding.
    mirror.style.width = `${element.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
    mirror.style.whiteSpace = element.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
    mirror.style.overflowWrap = element.tagName === 'TEXTAREA' ? 'break-word' : 'normal';
    mirror.style.wordBreak = style.wordBreak;
    const position = (element.selectionDirection === 'backward'
      ? element.selectionStart : element.selectionEnd) ?? element.value.length;
    mirror.textContent = element.value.slice(0, position);
    const marker = document.createElement('span');
    // A visible fallback character can wrap before the actual caret does.
    marker.textContent = element.value.slice(position) || '\u200b';
    mirror.append(marker);
    const markerRect = marker.getClientRects()[0] || marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    return {
      x: rect.left + (style.direction === 'rtl' ? markerRect.right : markerRect.left) - mirrorRect.left - element.scrollLeft,
      y: rect.top + markerRect.top - mirrorRect.top - element.scrollTop,
      rect
    };
  }

  function hide() {
    host?.style.setProperty('display', 'none', 'important');
    positioned = false;
  }

  function update() {
    frame = 0;
    if (!settings.enabled || !isChat(location.href)) { hide(); return; }
    const next = chooseEditor();
    if (!next) { hide(); return; }
    const nextRail = next.closest(railSelector);
    if (next !== editor || nextRail !== rail) {
      positioned = false;
      editor = next;
      rail = nextRail;
      resizeObserver?.disconnect();
      if (rail) resizeObserver?.observe(rail);
      const container = rail?.closest('[class*="_chatInputContainer_"]');
      if (container) resizeObserver?.observe(container);
    }
    if (!host?.isConnected) createPet();
    // The mirror needs layout even when the pet was previously hidden.
    host.style.setProperty('display', 'block', 'important');
    const caret = caretPosition(editor);
    const rect = (rail || editor).getBoundingClientRect();
    if (rect.right < 0 || rect.left > window.innerWidth ||
        rect.bottom < 0 || rect.top > window.innerHeight) { hide(); return; }
    const width = settings.size;
    const height = width * 0.75;
    const { left, top } = railPosition(caret, width, settings.gap, window.innerWidth, rect);
    host.style.setProperty('width', `${width}px`, 'important');
    host.style.setProperty('height', `${height}px`, 'important');
    // Only horizontal movement glides. Resizing/scrolling keeps the rail attached
    // to the bar immediately instead of animating diagonally through the text.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    host.style.setProperty('transition', positioned && !reduceMotion ? 'transform 120ms ease-out' : 'none', 'important');
    host.style.setProperty('top', `${top}px`, 'important');
    host.style.setProperty('transform', `translateX(${left}px)`, 'important');
    host.style.setProperty('display', 'block', 'important');
    positioned = true;
  }

  function schedule() { if (!frame && listening) frame = requestAnimationFrame(update); }

  function tap() {
    if (!image || !settings.enabled || !isChat(location.href)) return;
    paw = 1 - paw;
    image.src = assets[paw + 1];
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { if (image) image.src = assets[0]; }, 140);
  }

  function onInput(event) {
    if (!eligible(event.target)) return;
    schedule();
    // beforeinput is not used: only edits actually accepted by the input animate.
    if (!event.isComposing && !composing && event.inputType !== 'insertFromPaste') tap();
  }
  function onCompositionStart(event) {
    if (!eligible(event.target)) return;
    clearTimeout(compositionEndTimer);
    composing = true;
  }
  function onCompositionEnd(event) {
    // Some browsers emit a final non-composing input after compositionend.
    // Keep that event from tapping a second time and cancelling the first pose.
    clearTimeout(compositionEndTimer);
    compositionEndTimer = setTimeout(() => { composing = false; }, 0);
    if (eligible(event.target)) { tap(); schedule(); }
  }
  const events = [
    [document, 'input', onInput], [document, 'selectionchange', schedule],
    [document, 'focusin', schedule], [document, 'focusout', schedule],
    [document, 'keyup', schedule], [document, 'pointerup', schedule],
    [document, 'scroll', schedule], [window, 'resize', schedule],
    [document, 'compositionstart', onCompositionStart],
    [document, 'compositionend', onCompositionEnd]
  ];
  if (window.visualViewport) {
    events.push([window.visualViewport, 'resize', schedule], [window.visualViewport, 'scroll', schedule]);
  }
  if (document.fonts?.addEventListener) events.push([document.fonts, 'loadingdone', schedule]);

  function sync() {
    const active = settings.enabled && isChat(location.href);
    if (active && !listening) {
      listening = true;
      for (const [target, name, handler] of events) target.addEventListener(name, handler, true);
      resizeObserver = new ResizeObserver(schedule);
      observer = new MutationObserver(records => {
        if (records.some(record => record.target !== host)) schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled', 'readonly'] });
    } else if (!active && listening) {
      listening = false;
      for (const [target, name, handler] of events) target.removeEventListener(name, handler, true);
      observer?.disconnect();
      resizeObserver?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(resetTimer);
      clearTimeout(compositionEndTimer);
      frame = 0;
      host?.remove();
      host = image = mirror = editor = rail = null;
      positioned = false;
      composing = false;
    }
    schedule();
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'chat-bar-pet-route') { sync(); respond({ ready: true }); }
  });
  window.addEventListener('popstate', sync);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.customPet) {
      ++customRevision;
      customPet = changes.customPet.newValue;
    }
    if (area === 'local' && changes.petSettings) {
      ++settingsRevision;
      applySettings(changes.petSettings.newValue, Boolean(changes.customPet));
    } else if (changes.customPet) {
      applySettings(settings, true);
    }
  });
  chrome.storage.local.get(['petSettings', 'customPet']).then(result => {
    if (customRevision === 0) customPet = result.customPet;
    // A newer popup update must win over a delayed initial storage read.
    applySettings(settingsRevision === 0 ? result.petSettings : settings, true);
  }).catch(() => sync());
})();
