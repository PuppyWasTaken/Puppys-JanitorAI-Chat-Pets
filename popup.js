(async () => {
  const enabled = document.getElementById('enabled');
  const skin = document.getElementById('skin');
  const size = document.getElementById('size');
  const gap = document.getElementById('gap');
  const status = document.getElementById('status');
  const preview = document.getElementById('pet-preview');
  const controls = [enabled, skin, size, gap];
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
  function labels() {
    document.getElementById('size-value').value = `${size.value} px`;
    document.getElementById('gap-value').value = `${gap.value} px`;
    customOption.disabled = !ChatBarPetCore.customFrames(customPet);
    preview.src = ChatBarPetCore.frameSources(skin.value, customPet, path => chrome.runtime.getURL(path))[0];
  }
  function showSettings(value) {
    const settings = ChatBarPetCore.settings(value);
    enabled.checked = settings.enabled;
    skin.value = settings.skin;
    size.value = settings.size;
    gap.value = settings.gap;
    labels();
  }
  try {
    const result = await chrome.storage.local.get(['petSettings', 'customPet']);
    customPet = result.customPet;
    showSettings(result.petSettings);
  } catch { status.textContent = 'Could not load settings. Reopen the popup to try again.'; return; }
  for (const control of controls) control.disabled = false;
  for (const control of controls) {
    control.addEventListener('input', async () => {
      labels();
      const petSettings = ChatBarPetCore.settings({
        enabled: enabled.checked, skin: skin.value, size: Number(size.value), gap: Number(gap.value)
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
    if (changes.petSettings && !pendingWrites) showSettings(changes.petSettings.newValue);
    else if (changes.customPet) labels();
  });
})();
