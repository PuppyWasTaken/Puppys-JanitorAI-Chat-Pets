(() => {
  const presets = Object.freeze([
    Object.freeze({ id: 'sound-mechanical-keyboard-1', name: 'Mechanical Keyboard 1',
      path: 'assets/sounds/mechanical-keyboard-1.mp3' }),
    // Keep the saved ID for the former Keyboard 3 while renumbering its label.
    Object.freeze({ id: 'sound-mechanical-keyboard-3', name: 'Mechanical Keyboard 2',
      path: 'assets/sounds/mechanical-keyboard-3.mp3' }),
    Object.freeze({ id: 'sound-smartphone', name: 'Smartphone',
      path: 'assets/sounds/smartphone.mp3' })
  ]);
  const maxFileBytes = 1024 * 1024;
  const maxLibraryChars = 6000000;
  function library(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    let total = 0;
    for (const entry of value.slice(0, 10)) {
      if (!entry || typeof entry.id !== 'string' || !/^sound-[a-zA-Z0-9-]{1,64}$/.test(entry.id) ||
          presets.some(sound => sound.id === entry.id) || result.some(sound => sound.id === entry.id) || typeof entry.name !== 'string' ||
          typeof entry.src !== 'string' || entry.src.length > Math.ceil(maxFileBytes / 3) * 4 + 32 ||
          !/^data:audio\/mpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(entry.src)) continue;
      total += entry.src.length;
      if (total > maxLibraryChars) break;
      result.push({ id: entry.id, name: entry.name.slice(0, 100), src: entry.src });
    }
    return result;
  }
  function options(value, getURL) {
    return [...presets.map(({ id, name, path }) => ({ id, name, src: getURL(path) })), ...library(value)];
  }
  function typingKey(event) {
    const altGraph = event.getModifierState?.('AltGraph');
    return (!event.ctrlKey || altGraph) && !event.metaKey && (!event.altKey || altGraph) &&
      (event.key?.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key) ||
        (event.isComposing && event.key === 'Process'));
  }
  function createPlayer(makeAudio = src => new Audio(src)) {
    let source = null;
    let volume = 0.5;
    let voices = [];
    function stop() {
      for (const audio of voices) { audio.pause(); audio.currentTime = 0; }
      voices = [];
    }
    return {
      configure(src, percent) {
        if (src !== source) { stop(); source = src; }
        volume = Math.max(0, Math.min(1, percent / 100));
        for (const audio of voices) audio.volume = volume;
        if (volume === 0) stop();
      },
      play() {
        if (!source || volume === 0) return;
        let audio = voices.find(voice => voice.paused || voice.ended);
        if (!audio && voices.length < 8) {
          audio = makeAudio(source);
          audio.preload = 'auto';
          voices.push(audio);
        }
        // At most eight overlapping key sounds; recycle the oldest voice.
        if (!audio) { audio = voices.shift(); audio.pause(); voices.push(audio); }
        try {
          audio.currentTime = 0;
          audio.volume = volume;
          const playing = audio.play();
          playing?.catch(() => {}); // Autoplay/decoding failures must not affect typing.
        } catch { /* A missing or invalid clip must not affect the composer. */ }
      },
      stop
    };
  }
  const sounds = { presets, options, library, typingKey, createPlayer, maxFileBytes, maxLibraryChars };
  if (typeof module !== 'undefined' && module.exports) module.exports = sounds;
  else globalThis.ChatBarPetSounds = sounds;
})();
