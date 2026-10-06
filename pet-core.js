(() => {
  const skins = Object.freeze([
    { id: 'classic', label: 'Samoyed', prefix: 'puppy' },
	{ id: 'blackcat', label: 'Black Cat', prefix: 'blackcat' },
    { id: 'poodle', label: 'Brown Poodle', prefix: 'poodle' },
    { id: 'redfox', label: 'Red Fox', prefix: 'redfox' },
	{ id: 'whitefox', label: 'White Fox', prefix: 'whitefox' },
	{ id: 'kitsune', label: 'Kitsune Fox', prefix: 'kitsune' },
	{ id: 'hamster', label: 'Hamster', prefix: 'hamster' },
    { id: 'redpanda', label: 'Red Panda', prefix: 'redpanda' },
    { id: 'tiger', label: 'Orange Tiger', prefix: 'tiger' },
    { id: 'snake', label: 'Reticulated Python', prefix: 'python' },
	{ id: 'shark', label: 'Blue Shark', prefix: 'shark' },
    { id: 'custom', label: 'Custom Pet', prefix: null }
  ].map(Object.freeze));
  const defaults = Object.freeze({ enabled: true, skin: 'classic', size: 64, gap: 4,
    paddingLeft: 0, paddingRight: 0, boundsUnit: 'px', soundEnabled: false, sound: 'sound-mechanical-keyboard-1', volume: 50 });
  function customFrames(value) {
    const frames = value?.frames;
    return Array.isArray(frames) && frames.length === 3 &&
      frames.every(frame => typeof frame === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(frame)) &&
      frames.reduce((total, frame) => total + frame.length, 0) <= 3000000 ? frames.slice() : null;
  }
  function skinFrames(id, customPet) {
    if (id === 'custom') return customFrames(customPet) || skinFrames(defaults.skin);
    const skin = skins.find(skin => skin.id === id) || skins[0];
    return ['idle', 'left', 'right'].map(pose => `assets/${skin.prefix}-${pose}.png`);
  }
  function frameSources(id, customPet, getURL) {
    return skinFrames(id, customPet).map(frame => frame.startsWith('data:') ? frame : getURL(frame));
  }
  // Match CSS-module names, not their build-specific hash or line-number suffix.
   const railSelector = '[class*="chatTextarea_"]';
  const composerSelector = `[class*="_chatInputContainer_"] textarea${railSelector}`;
  function isChat(url) {
    try {
      const parsed = new URL(url);
      return parsed.origin === 'https://janitorai.com' && parsed.pathname.startsWith('/chats/');
    } catch { return false; }
  }
  function settings(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const clamp = (n, fallback, min, max) => Number.isFinite(Number(n))
      ? Math.min(max, Math.max(min, Number(n))) : fallback;
    return {
      enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
      skin: skins.some(skin => skin.id === value.skin) ? value.skin : defaults.skin,
      size: clamp(value.size ?? defaults.size, defaults.size, 32, 112),
      gap: clamp(value.gap ?? defaults.gap, defaults.gap, -24, 160),
      // Reset legacy rem-based bounds once; new settings are always pixel insets.
      paddingLeft: value.boundsUnit === 'px' ? clamp(value.paddingLeft ?? defaults.paddingLeft, defaults.paddingLeft, 0, 128) : defaults.paddingLeft,
      paddingRight: value.boundsUnit === 'px' ? clamp(value.paddingRight ?? defaults.paddingRight, defaults.paddingRight, 0, 128) : defaults.paddingRight,
      boundsUnit: defaults.boundsUnit,
      // Preserve earlier versions' selected custom sounds; an old 'off' stays muted.
      soundEnabled: typeof value.soundEnabled === 'boolean' ? value.soundEnabled :
        typeof value.sound === 'string' && /^sound-[a-zA-Z0-9-]{1,64}$/.test(value.sound),
      sound: typeof value.sound === 'string' && /^sound-[a-zA-Z0-9-]{1,64}$/.test(value.sound) &&
        !['sound-mechanical-keyboard-2', 'sound-typewriter'].includes(value.sound) ? value.sound : defaults.sound,
      volume: clamp(value.volume ?? defaults.volume, defaults.volume, 0, 100)
    };
  }
  function railPosition(caret, size, gap, viewportWidth, railRect = caret.rect, boundsRect = railRect, paddingLeft = 0, paddingRight = 0) {
    const viewportMax = Math.max(0, viewportWidth - size);
    // Reduce both insets proportionally if a narrow container cannot fit them.
    const available = Math.max(0, boundsRect.right - boundsRect.left - size);
    const total = paddingLeft + paddingRight;
    const scale = total > available ? available / total : 1;
    const minLeft = Math.max(0, Math.min(viewportMax, boundsRect.left + paddingLeft * scale));
    const maxLeft = Math.max(minLeft, Math.min(viewportMax, boundsRect.right - size - paddingRight * scale));
    return {
      left: Math.max(minLeft, Math.min(maxLeft, caret.x - size / 2)),
      // Anchor to the textarea's top edge; negative gaps lower the pet into it.
      top: Math.max(0, railRect.top - size * 0.75 - gap)
    };
  }
  const core = { defaults, skins, skinFrames, customFrames, frameSources, composerSelector, railSelector, isChat, settings, railPosition };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else globalThis.ChatBarPetCore = core;
})();
