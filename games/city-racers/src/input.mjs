// Physical key codes work even when the family's keyboard layout is Cyrillic.
export const KEY_ACTIONS = {
  ArrowUp: [0, 'accelerate'],
  ArrowDown: [0, 'brake'],
  ArrowLeft: [0, 'left'],
  ArrowRight: [0, 'right'],
  KeyW: [1, 'accelerate'],
  KeyS: [1, 'brake'],
  KeyA: [1, 'left'],
  KeyD: [1, 'right'],
};
export function readInputs(keys, pointers, players) {
  const inputs = Array.from({ length: players }, () => ({}));
  for (const [player, action] of [...keys]
    .map((code) => KEY_ACTIONS[code])
    .filter(Boolean)
    .concat([...pointers.values()])) {
    if (inputs[player]) inputs[player][action] = true;
  }
  return inputs;
}
