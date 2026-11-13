// Pure projection used by the cloned Herdr Agents mod and by Node tests.
// Read core status, but focus the viewer pane: never adopt an inner terminal as
// a second native pane. All address matching is scoped to the same machine.
function host(address) {
  const slash = address.lastIndexOf("/");
  return slash < 0 ? "" : address.slice(0, slash + 1);
}
function resume(argv, viewer = false) {
  if (!Array.isArray(argv)) return null;
  const options = viewer
    ? [
        ["--claude-resume", "claude"],
        ["--codex-resume", "codex"],
      ]
    : [
        ["--resume", "claude"],
        ["resume", "codex"],
      ];
  for (const [flag, agent] of options) {
    const at = argv.indexOf(flag),
      id = argv[at + 1];
    if (
      at >= 0 &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id || "")
    )
      return `${agent}:${id.toLowerCase()}`;
  }
  return null;
}
export function winAgents(nativeAgents, terminals, panes, spaces) {
  const result = [...nativeAgents];
  const listed = new Set(result.map((a) => a.address));
  const live = new Map(
    terminals.filter((t) => t.state === "live").map((t) => [t.address, t]),
  );
  const viewerPanes = new Map(
    panes.filter((p) => live.has(p.terminal)).map((p) => [p.terminal, p]),
  );
  const tabs = new Map();
  for (const space of spaces)
    for (const tab of space.tabs) tabs.set(tab.id, { space, tab });
  for (const terminal of live.values()) {
    if (listed.has(terminal.address)) continue;
    const labels = terminal.labels || {};
    const managedName = /^(?:wc|wx)-[a-f0-9]{28}$/.test(terminal.name || "");
    // Shells linked by WIN become agents only when their program reports as one.
    if (!terminal.program?.agent && !labels["itsawin.agent"] && !managedName)
      continue;
    let viewer;
    if (labels["itsawin.viewer"]) {
      const local = labels["itsawin.viewer"];
      // Stored labels are host-local; reject qualified labels rather than cross hosts.
      if (/^[a-zA-Z0-9_.-]+$/.test(local))
        viewer = host(terminal.address) + local;
    } else if (managedName) {
      const identity = resume(terminal.argv);
      const candidates = identity
        ? [...viewerPanes.keys()].filter(
            (address) =>
              host(address) === host(terminal.address) &&
              resume(live.get(address).argv, true) === identity,
          )
        : [];
      // Backward compatibility is read-only. Never guess from cwd/title or pick
      // arbitrarily between multiple viewers of the same conversation.
      if (candidates.length === 1) viewer = candidates[0];
    }
    const pane = viewerPanes.get(viewer);
    const location = pane && tabs.get(pane.tab);
    if (!location || viewer === terminal.address) continue;
    const { space, tab } = location;
    const raw =
      typeof terminal.status === "string"
        ? terminal.status
        : terminal.status?.state;
    const status =
      raw === "error"
        ? "blocked"
        : ["working", "blocked", "idle", "done"].includes(raw)
          ? raw
          : "unknown";
    result.push({
      address: terminal.address,
      pane: pane.pane,
      space: space.id,
      space_name: space.name,
      tab: tab.id,
      tab_index: tab.index,
      tab_name: tab.name,
      status,
      app: terminal.report?.app || null,
      program: terminal.program || {
        name: labels["itsawin.agent"] || "Agent",
        icon: null,
        agent: true,
      },
      title:
        terminal.title ||
        terminal.program?.name ||
        labels["itsawin.agent"] ||
        terminal.name,
      seq: terminal.seq || 0,
      pinned: Boolean(labels["herdr.pinned"]),
      focused: pane.focused,
      winViewer: viewer,
    });
    listed.add(terminal.address);
  }
  return result;
}
