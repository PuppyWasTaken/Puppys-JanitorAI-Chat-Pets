(() => {
  const poses = ['idle', 'left', 'right'];
  const status = document.getElementById('status');
  const save = document.getElementById('save');
  const remove = document.getElementById('remove');
  const inputs = poses.map(pose => document.getElementById(`file-${pose}`));
  let frames = [null, null, null];
  let savedPet = false;
  let busy = true;
  let reading = 0;
  function controls() {
    save.disabled = busy || reading > 0 || frames.some(frame => !frame);
    remove.disabled = busy || reading > 0 || !savedPet;
    inputs.forEach(input => { input.disabled = busy; });
  }
  function previews() {
    poses.forEach((pose, index) => {
      const preview = document.getElementById(`preview-${pose}`);
      preview.hidden = !frames[index];
      document.getElementById(`empty-${pose}`).hidden = Boolean(frames[index]);
      if (frames[index]) preview.src = frames[index];
      else preview.removeAttribute('src');
    });
    controls();
  }
  inputs.forEach((input, index) => {
    let revision = 0;
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const current = ++revision;
      ++reading; controls();
      try {
        const image = await ChatBarPetImages.readFile(file);
        if (current !== revision) return;
        frames[index] = image.src;
        document.getElementById(`info-${poses[index]}`).textContent = `${file.name} · ${image.width} × ${image.height}`;
        status.textContent = 'Preview updated. Choose all three poses, then save.';
      } catch (error) {
        if (current === revision) { input.value = ''; status.textContent = error.message; }
      } finally { --reading; previews(); }
    });
  });
  document.getElementById('custom-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled) return;
    busy = true; controls();
    status.textContent = 'Preparing and saving your pet…';
    try {
      const normalized = await ChatBarPetImages.normalizeFrames(frames);
      const customPet = { frames: normalized };
      if (!ChatBarPetCore.customFrames(customPet)) throw new Error('These images are too large to store. Try simpler or smaller images.');
      const result = await chrome.storage.local.get('petSettings');
      const settings = ChatBarPetCore.settings(result.petSettings);
      await chrome.storage.local.set({ customPet, petSettings: { ...settings, skin: 'custom' } });
      frames = normalized;
      savedPet = true;
      status.textContent = 'Saved! Custom Pet is selected and your open chats update automatically.';
    } catch (error) {
      status.textContent = `Could not save: ${error.message}. Your previously saved pet is unchanged.`;
    } finally { busy = false; previews(); }
  });
  remove.addEventListener('click', async () => {
    if (remove.disabled || !confirm('Remove your saved Custom Pet? This cannot be undone.')) return;
    busy = true; controls();
    try {
      const result = await chrome.storage.local.get('petSettings');
      const settings = ChatBarPetCore.settings(result.petSettings);
      const update = { customPet: null };
      if (settings.skin === 'custom') update.petSettings = { ...settings, skin: ChatBarPetCore.defaults.skin };
      await chrome.storage.local.set(update);
      frames = [null, null, null]; savedPet = false;
      inputs.forEach((input, index) => {
        input.value = '';
        document.getElementById(`info-${poses[index]}`).textContent = 'Choose a new image for this pose.';
      });
      status.textContent = 'Custom Pet removed. If it was selected, the default pet is now active.';
    } catch { status.textContent = 'Could not remove the saved pet. Please try again.'; }
    finally { busy = false; previews(); }
  });
  controls();
  chrome.storage.local.get('customPet').then(result => {
    const saved = ChatBarPetCore.customFrames(result.customPet);
    if (saved) { frames = saved; savedPet = true; }
    busy = false; previews();
    status.textContent = saved ? 'Your saved Custom Pet is loaded. Replace any pose, then save.' : 'Choose an image for each of the three poses to get started.';
  }).catch(() => { status.textContent = 'Could not load saved images. Reload this page to try again.'; });
})();
