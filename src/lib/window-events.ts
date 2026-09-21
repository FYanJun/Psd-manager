type WindowActions = {
  keydown(event: KeyboardEvent): void;
  activity(): void;
  resize(): void;
  blur(): void;
};

export function createWindowEvents(target: Pick<Window, "addEventListener" | "removeEventListener">, actions: WindowActions) {
  let mounted = false;
  return {
    mount() {
      if (mounted) return;
      mounted = true;
      target.addEventListener("keydown", actions.keydown);
      target.addEventListener("keydown", actions.activity);
      target.addEventListener("pointerdown", actions.activity);
      target.addEventListener("pointermove", actions.activity);
      target.addEventListener("resize", actions.resize);
      target.addEventListener("blur", actions.blur);
    },
    destroy() {
      if (!mounted) return;
      mounted = false;
      target.removeEventListener("keydown", actions.keydown);
      target.removeEventListener("keydown", actions.activity);
      target.removeEventListener("pointerdown", actions.activity);
      target.removeEventListener("pointermove", actions.activity);
      target.removeEventListener("resize", actions.resize);
      target.removeEventListener("blur", actions.blur);
    },
  };
}
