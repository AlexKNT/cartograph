/**
 * Labels are the shortest thing that is still unique among what is on screen.
 * The last path segment first, extended upwards only as far as it has to be —
 * so `core` stays `core` until there is another one, and then it is
 * `mobx/src/core` and `mobx-react/src/core`.
 */

export function uniqueLabels(paths: readonly string[]): Map<string, string> {
  const parts = new Map(paths.map((path) => [path, path === "." ? ["."] : path.split("/")]));
  const taken = new Map(paths.map((path) => [path, 1]));

  for (;;) {
    const groups = new Map<string, string[]>();
    for (const path of paths) {
      const pathParts = parts.get(path) ?? [path];
      const depth = Math.min(taken.get(path) ?? 1, pathParts.length);
      const label = pathParts.slice(pathParts.length - depth).join("/");
      const group = groups.get(label);
      if (group === undefined) groups.set(label, [path]);
      else group.push(path);
    }

    let collided = false;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      collided = true;
      for (const path of group) {
        // Paths are unique, so growing every member of a group runs out of
        // room to collide and the loop ends.
        const depth = taken.get(path) ?? 1;
        taken.set(path, depth + 1);
      }
    }

    if (collided) continue;

    const labels = new Map<string, string>();
    for (const [label, group] of groups) {
      const only = group[0];
      if (only !== undefined) labels.set(only, label);
    }
    return labels;
  }
}
