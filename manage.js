(() => {
  const poses = ['idle', 'left', 'right'];
  const status = document.getElementById('status');
  const save = document.getElementById('save');
  const saveAsNew = document.getElementById('save-as-new');
  const remove = document.getElementById('remove');
  const select = document.getElementById('pet-preset');
  const name = document.getElementById('preset-name');
  const create = document.getElementById('new-preset');
  const use = document.getElementById('use-preset');
  const inputs = poses.map(pose => document.getElementById(`file-${pose}`));
  const keys = ['customPetPresets', 'customPet', 'petSettings'];
  let presets = [];
  let selectedId = '';
  let frames = [null, null, null];
  let dirty = false;
  let busy = true;
  let reading = 0;
  function controls() {
    const locked = busy || reading > 0;
    save.disabled = locked || !name.value.trim() || frames.some(frame => !frame);
    saveAsNew.disabled = save.disabled || !selectedId;
    remove.disabled = use.disabled = locked || !selectedId;
    select.disabled = create.disabled = name.disabled = locked;
    inputs.forEach(input => { input.disabled = busy; });
    save.textContent = selectedId ? 'Update & use preset' : 'Save & use preset';
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
  function options() {
    select.replaceChildren(new Option('New preset', ''));
    presets.forEach(preset => select.add(new Option(preset.name, preset.id)));
    select.value = selectedId;
  }
  function load(id) {
    const preset = presets.find(preset => preset.id === id);
    selectedId = preset?.id || '';
    name.value = preset?.name || '';
    frames = preset ? preset.frames.slice() : [null, null, null];
    dirty = false;
    inputs.forEach((input, index) => {
      input.value = '';
      document.getElementById(`info-${poses[index]}`).textContent = preset ? 'Saved pose. Choose an image to replace it.' : 'Choose an image for this pose.';
    });
    options(); previews();
  }
  function discard() { return !dirty || confirm('Discard unsaved changes to this preset?'); }
  select.addEventListener('change', () => {
    if (!discard()) { select.value = selectedId; return; }
    load(select.value);
    status.textContent = selectedId ? 'Preset loaded for editing. Click Use selected preset to activate it.' : 'Name your new preset and choose all three poses.';
  });
  create.addEventListener('click', () => {
    if (!discard()) return;
    load(''); name.focus();
    status.textContent = 'Name your new preset and choose all three poses.';
  });
  name.addEventListener('input', () => { dirty = true; controls(); });
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
        dirty = true;
        document.getElementById(`info-${poses[index]}`).textContent = `${file.name} · ${image.width} × ${image.height}`;
        status.textContent = 'Preview updated. Save when your name and all three poses are ready.';
      } catch (error) {
        if (current === revision) { input.value = ''; status.textContent = error.message; }
      } finally { --reading; previews(); }
    });
  });
  async function savePreset(asNew) {
    if (save.disabled) return;
    busy = true; controls();
    status.textContent = 'Preparing and saving your preset…';
    try {
      const normalized = await ChatBarPetImages.normalizeFrames(frames);
      const preset = { id: asNew || !selectedId ? crypto.randomUUID() : selectedId, name: name.value.trim(), frames: normalized };
      if (!ChatBarPetCore.customFrames(preset)) throw new Error('These images are too large to store. Try simpler or smaller images');
      const result = await chrome.storage.local.get(keys);
      const latest = ChatBarPetCore.customPresets(result.customPetPresets, result.customPet);
      if (selectedId && !asNew && !latest.some(entry => entry.id === selectedId)) throw new Error('This preset was deleted in another window. Save it as a new preset instead');
      const next = latest.filter(entry => entry.id !== preset.id);
      const index = latest.findIndex(entry => entry.id === preset.id);
      next.splice(index < 0 ? next.length : index, 0, preset);
      const settings = ChatBarPetCore.settings(result.petSettings);
      await chrome.storage.local.set({ customPetPresets: next, customPet: preset, petSettings: { ...settings, skin: 'custom' } });
      presets = next;
      load(preset.id);
      status.textContent = `Saved! “${preset.name}” is selected and your open chats update automatically.`;
    } catch (error) {
      status.textContent = `Could not save: ${error.message}. Saved presets are unchanged. If storage is full, delete unused presets or sounds.`;
    } finally { busy = false; previews(); }
  }
  document.getElementById('custom-form').addEventListener('submit', event => { event.preventDefault(); savePreset(false); });
  saveAsNew.addEventListener('click', () => savePreset(true));
  use.addEventListener('click', async () => {
    if (use.disabled || !discard()) return;
    busy = true; controls();
    try {
      const result = await chrome.storage.local.get(keys);
      const latest = ChatBarPetCore.customPresets(result.customPetPresets, result.customPet);
      const preset = latest.find(entry => entry.id === selectedId);
      if (!preset) throw new Error('This preset was deleted in another window. Reload this page');
      await chrome.storage.local.set({ customPet: preset, petSettings: { ...ChatBarPetCore.settings(result.petSettings), skin: 'custom' } });
      presets = latest; load(preset.id);
      status.textContent = `“${preset.name}” is now active in your open chats.`;
    } catch (error) { status.textContent = `Could not use preset: ${error.message}.`; }
    finally { busy = false; controls(); }
  });
  remove.addEventListener('click', async () => {
    if (remove.disabled || !confirm('Delete this saved preset and any unsaved edits? This cannot be undone.')) return;
    busy = true; controls();
    try {
      const result = await chrome.storage.local.get(keys);
      const latest = ChatBarPetCore.customPresets(result.customPetPresets, result.customPet);
      const next = latest.filter(entry => entry.id !== selectedId);
      const update = { customPetPresets: next };
      const activeId = result.customPet?.id || (ChatBarPetCore.customFrames(result.customPet) ? 'legacy-custom' : '');
      const settings = ChatBarPetCore.settings(result.petSettings);
      if (activeId === selectedId) {
        update.customPet = null;
        if (settings.skin === 'custom') update.petSettings = { ...settings, skin: ChatBarPetCore.defaults.skin };
      }
      await chrome.storage.local.set(update);
      presets = next; load('');
      status.textContent = 'Preset deleted. If it was active, the default pet is now selected. Other presets are unchanged.';
    } catch { status.textContent = 'Could not delete the preset. Please try again.'; }
    finally { busy = false; previews(); }
  });
  controls();
  chrome.storage.local.get(keys).then(result => {
    presets = ChatBarPetCore.customPresets(result.customPetPresets, result.customPet);
    const activeId = result.customPet?.id || 'legacy-custom';
    busy = false;
    load(presets.find(preset => preset.id === activeId)?.id || presets[0]?.id || '');
    status.textContent = presets.length ? 'Choose a saved preset to edit or use, or create a new one.' : 'Name your new preset and choose an image for each of the three poses.';
  }).catch(() => { status.textContent = 'Could not load saved presets. Reload this page to try again.'; });
})();
