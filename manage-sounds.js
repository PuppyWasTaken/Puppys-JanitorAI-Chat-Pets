(() => {
  const { library, maxFileBytes, maxLibraryChars } = ChatBarPetSounds;
  const input = document.getElementById('sound-files');
  const list = document.getElementById('sound-list');
  const status = document.getElementById('sound-status');
  let sounds = [];
  let busy = true;
  function render() {
    for (const audio of list.querySelectorAll('audio')) audio.pause();
    list.replaceChildren();
    input.disabled = busy;
    for (const sound of sounds) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = sound.name;
      const preview = document.createElement('audio');
      preview.controls = true;
      preview.preload = 'none';
      preview.src = sound.src;
      preview.setAttribute('aria-label', `Preview ${sound.name}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${sound.name}`);
      remove.disabled = busy;
      remove.addEventListener('click', async () => {
        if (busy || !confirm(`Remove "${sound.name}"?`)) return;
        busy = true; render();
        try {
          // Re-read before writing so another settings tab's changes are preserved.
          const result = await chrome.storage.local.get(['typingSounds', 'petSettings']);
          const next = library(result.typingSounds).filter(entry => entry.id !== sound.id);
          const update = { typingSounds: next };
          if (result.petSettings?.sound === sound.id) update.petSettings = {
            ...result.petSettings, soundEnabled: false, sound: ChatBarPetCore.defaults.sound
          };
          await chrome.storage.local.set(update);
          sounds = next;
          status.textContent = 'Sound removed.';
        } catch (error) { status.textContent = `Could not remove sound: ${error.message}`; }
        finally { busy = false; render(); }
      });
      row.append(name, preview, remove);
      list.append(row);
    }
  }
  async function readMP3(file) {
    if (!/\.mp3$/i.test(file.name)) throw new Error(`${file.name}: choose an MP3 file.`);
    if (!file.size || file.size > maxFileBytes) throw new Error(`${file.name}: files must be between 1 byte and 1 MB.`);
    const bytes = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 &&
      (bytes[1] & 0x18) !== 0x08 && (bytes[1] & 0x06) === 0x02;
    if (!id3 && !frame) throw new Error(`${file.name}: this does not look like an MP3 file.`);
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(`data:audio/mpeg;base64,${reader.result.split(',')[1]}`);
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
    // Verify the browser can decode it before saving a new option.
    await new Promise((resolve, reject) => {
      const audio = new Audio();
      const timer = setTimeout(() => finish(new Error(`${file.name}: audio validation timed out.`)), 10000);
      function finish(error) {
        clearTimeout(timer);
        audio.onloadeddata = audio.onerror = null;
        audio.removeAttribute('src');
        audio.load();
        if (error) reject(error); else resolve();
      }
      audio.onloadeddata = () => finish();
      audio.onerror = () => finish(new Error(`${file.name}: the browser could not decode this MP3.`));
      audio.preload = 'auto';
      audio.src = src;
    });
    return { id: `sound-${crypto.randomUUID()}`, name: file.name.replace(/\.mp3$/i, '').slice(0, 100), src };
  }
  input.addEventListener('change', async () => {
    const files = [...input.files];
    if (busy || !files.length) return;
    busy = true; render();
    status.textContent = 'Checking and saving sounds…';
    try {
      if (files.length > 10) throw new Error('Choose at most 10 MP3 files.');
      const additions = [];
      for (const file of files) additions.push(await readMP3(file));
      const result = await chrome.storage.local.get('typingSounds');
      const next = [...library(result.typingSounds), ...additions];
      if (next.length > 10) throw new Error('You can save up to 10 sounds. Remove an existing sound first.');
      if (next.reduce((sum, entry) => sum + entry.src.length, 0) > maxLibraryChars) {
        throw new Error('Sound library is full. Use smaller clips or remove an existing sound.');
      }
      await chrome.storage.local.set({ typingSounds: next });
      sounds = next;
      status.textContent = 'Saved! Choose a typing sound in the toolbar popup.';
    } catch (error) { status.textContent = `Could not add sounds: ${error.message} Your saved sounds are unchanged.`; }
    finally { busy = false; input.value = ''; render(); }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.typingSounds && !busy) {
      sounds = library(changes.typingSounds.newValue); render();
    }
  });
  chrome.storage.local.get('typingSounds').then(result => {
    sounds = library(result.typingSounds);
    busy = false; render();
    status.textContent = sounds.length ? 'Your saved sounds are loaded.' : 'No sounds yet. Add your MP3 clips when ready.';
  }).catch(() => { status.textContent = 'Could not load sounds. Reload this page to try again.'; });
})();
