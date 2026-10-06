(async () => {
  const enabled = document.getElementById('enabled');
  const skin = document.getElementById('skin');
  const size = document.getElementById('size');
  const gap = document.getElementById('gap');
  const paddingLeft = document.getElementById('padding-left');
  const paddingRight = document.getElementById('padding-right');
  const sound = document.getElementById('sound');
  const soundEnabled = document.getElementById('sound-enabled');
  const volume = document.getElementById('volume');
  const testSound = document.getElementById('test-sound');
  const soundPlayer = ChatBarPetSounds.createPlayer();
  let typingSounds = [];
  const status = document.getElementById('status');
  const preview = document.getElementById('pet-preview');
  const controls = [enabled, skin, size, gap, paddingLeft, paddingRight, soundEnabled, sound, volume];
  let writeQueue = Promise.resolve();
  let customPet = null;
  let pendingWrites = 0;
  let customOption;
  document.getElementById('manage').addEventListener('click', async () => {
    try { await chrome.runtime.openOptionsPage(); }
    catch { status.textContent = 'Could not open settings. Try again.'; }
  });
  for (const entry of ChatBarPetCore.skins) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    if (entry.id === 'custom') customOption = option;
    skin.append(option);
  }
  for (const control of controls) control.disabled = true;
  function soundOptions() {
    const selected = sound.value;
    sound.replaceChildren();
    for (const entry of typingSounds) sound.add(new Option(entry.name, entry.id));
    sound.value = typingSounds.some(entry => entry.id === selected) ? selected : ChatBarPetCore.defaults.sound;
  }
  testSound.addEventListener('click', () => soundPlayer.play());
  function labels() {
    document.getElementById('size-value').value = `${size.value} px`;
    document.getElementById('gap-value').value = `${gap.value} px`;
    document.getElementById('padding-left-value').value = `${paddingLeft.value} px`;
    document.getElementById('padding-right-value').value = `${paddingRight.value} px`;
    document.getElementById('volume-value').value = `${volume.value}%`;
    const source = typingSounds.find(entry => entry.id === sound.value)?.src || null;
    soundPlayer.configure(soundEnabled.checked ? source : null, Number(volume.value));
    testSound.disabled = !soundEnabled.checked || !source || Number(volume.value) === 0;
    customOption.disabled = !ChatBarPetCore.customFrames(customPet);
    preview.src = ChatBarPetCore.frameSources(skin.value, customPet, path => chrome.runtime.getURL(path))[0];
  }
  function showSettings(value) {
    const settings = ChatBarPetCore.settings(value);
    enabled.checked = settings.enabled;
    skin.value = settings.skin;
    size.value = settings.size;
    gap.value = settings.gap;
    paddingLeft.value = settings.paddingLeft;
    paddingRight.value = settings.paddingRight;
    soundEnabled.checked = settings.soundEnabled;
    sound.value = typingSounds.some(entry => entry.id === settings.sound) ? settings.sound : ChatBarPetCore.defaults.sound;
    volume.value = settings.volume;
    labels();
  }
  try {
    const result = await chrome.storage.local.get(['petSettings', 'customPet', 'typingSounds']);
    customPet = result.customPet;
    typingSounds = ChatBarPetSounds.options(result.typingSounds, path => chrome.runtime.getURL(path));
    soundOptions();
    showSettings(result.petSettings);
  } catch { status.textContent = 'Could not load settings. Reopen the popup to try again.'; return; }
  for (const control of controls) control.disabled = false;
  for (const control of controls) {
    control.addEventListener('input', async () => {
      labels();
      const petSettings = ChatBarPetCore.settings({
        enabled: enabled.checked, skin: skin.value, size: Number(size.value), gap: Number(gap.value),
        paddingLeft: Number(paddingLeft.value), paddingRight: Number(paddingRight.value), boundsUnit: 'px',
        soundEnabled: soundEnabled.checked, sound: sound.value, volume: Number(volume.value)
      });
      ++pendingWrites;
      try {
        // Preserve the order of rapid slider/skin updates, even on slow storage.
        writeQueue = writeQueue.catch(() => {}).then(() => chrome.storage.local.set({ petSettings }));
        await writeQueue;
        status.textContent = 'Saved';
      } catch { status.textContent = 'Could not save settings.'; }
      finally { --pendingWrites; }
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.customPet) customPet = changes.customPet.newValue;
    if (changes.typingSounds) {
      typingSounds = ChatBarPetSounds.options(changes.typingSounds.newValue, path => chrome.runtime.getURL(path));
      soundOptions();
    }
    if (changes.petSettings && !pendingWrites) showSettings(changes.petSettings.newValue);
    else if (changes.customPet || changes.typingSounds) labels();
  });
})();
