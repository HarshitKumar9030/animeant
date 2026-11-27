/** A segmented control whose pill slides to the checked option. */
export function segmented<T extends string>(
  root: HTMLElement,
  initial: T,
  onChange: (value: T, button: HTMLButtonElement) => void,
) {
  const pill = root.querySelector<HTMLSpanElement>(".segmented-pill")!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
  const set = (value: T, notify: boolean) => {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute("aria-checked", String(on));
      if (on) {
        pill.style.width = `${b.offsetWidth}px`;
        pill.style.transform = `translateX(${b.offsetLeft}px)`;
        if (notify) onChange(value, b);
      }
    }
  };
  buttons.forEach((b) => b.addEventListener("click", () => set(b.dataset.value as T, true)));
  const sync = () =>
    set((buttons.find((b) => b.getAttribute("aria-checked") === "true")?.dataset.value ?? initial) as T, false);
  new ResizeObserver(sync).observe(root);
  set(initial, false);
}
