// The keyboard listener lives on the meadow so the rest of the page keeps
// its normal Tab, Space and Enter behavior.
export function keyboardLesson({
  lesson,
  copy,
  picture,
  field,
  controls,
  scene,
  count,
  advance,
}) {
  let latched = false;
  let held = false;
  const buttons = new Map();
  const keyNames = {
    Space: copy.space,
    Enter: copy.enter,
    Backspace: copy.backspace,
    Shift: copy.shift,
    ArrowUp: copy.up,
  };
  const symbols = {
    Space: '␣',
    Enter: '↵',
    Backspace: '⌫',
    Shift: '⇧',
    ArrowUp: '↑',
  };
  const sceneItem = (name, x, y) => {
    const img = new Image();
    img.alt = '';
    img.src = picture(name);
    img.className = 'key-picture';
    img.style.left = x + '%';
    img.style.top = y + '%';
    scene.append(img);
    return img;
  };
  const renderScene = (animate = false) => {
    const n = count();
    scene.replaceChildren();
    if (lesson.kind === 'jump') {
      for (const x of [17, 39, 61, 83]) {
        const mound = document.createElement('span');
        mound.className = 'mound';
        mound.style.left = x + '%';
        scene.append(mound);
      }
      const frog = sceneItem('frog', 17 + 22 * n, 61);
      if (animate) frog.classList.add('hop');
    } else {
      for (let i = 0; i < 3; i++) {
        const x = 28 + i * 26;
        let name = lesson.cover,
          y = 66;
        if (lesson.kind === 'hatch') name = i < n ? 'chick' : 'egg';
        if (lesson.kind === 'erase' && i >= 3 - n) continue;
        if (lesson.kind === 'fly' && i < n) y = 24 + (i % 2) * 9;
        const item = sceneItem(name, x, y);
        if (animate && i === n - 1 && lesson.kind !== 'erase')
          item.classList.add(lesson.kind);
      }
    }
  };
  const reflectShift = () =>
    buttons.get('Shift')?.setAttribute('aria-pressed', String(latched || held));
  const clearShift = () => {
    latched = false;
    held = false;
    reflectShift();
  };
  function act() {
    if (count() === 3) return;
    advance();
    renderScene(true);
    if (latched) {
      latched = false;
      reflectShift();
    }
  }
  const keys = lesson.shift ? ['Shift', 'ArrowUp'] : [lesson.key];
  controls.replaceChildren();
  keys.forEach((key) => {
    if (key === 'ArrowUp') controls.append(' + ');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = key === 'Space' ? 'keycap space-bar' : 'keycap';
    button.setAttribute('aria-label', keyNames[key]);
    button.innerHTML = `<b aria-hidden="true">${symbols[key]}</b><span>${keyNames[key]}</span>`;
    if (key === 'Shift') button.setAttribute('aria-pressed', 'false');
    button.onclick = (e) => {
      if (key === 'Shift') {
        latched = !latched;
        reflectShift();
      } else if (!lesson.shift || latched || held || e.shiftKey) act();
    };
    buttons.set(key, button);
    controls.append(button);
  });
  const frame = field.closest('.frame');
  function keydown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    if (e.key === 'Shift') {
      held = true;
      reflectShift();
      return;
    }
    const code = e.code === 'NumpadEnter' ? 'Enter' : e.code;
    if (code !== lesson.key) {
      // A physical Space or Enter on a pictured key must not trigger a different skill.
      if (controls.contains(e.target) && ['Enter', 'Space'].includes(code))
        e.preventDefault();
      return;
    }
    e.preventDefault();
    if (e.repeat || Boolean(lesson.shift) !== Boolean(e.shiftKey)) return;
    act();
  }
  function keyup(e) {
    if (e.key === 'Shift') {
      held = e.shiftKey;
      reflectShift();
    }
  }
  const focusout = (e) => {
    if (!frame.contains(e.relatedTarget)) clearShift();
  };
  frame.addEventListener('keydown', keydown);
  frame.addEventListener('keyup', keyup);
  frame.addEventListener('focusout', focusout);
  window.addEventListener('blur', clearShift);
  renderScene();
  return () => {
    frame.removeEventListener('keydown', keydown);
    frame.removeEventListener('keyup', keyup);
    frame.removeEventListener('focusout', focusout);
    window.removeEventListener('blur', clearShift);
    controls.replaceChildren();
  };
}
