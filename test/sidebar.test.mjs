import test from "node:test";
import assert from "node:assert/strict";
import { winAgents } from "../src/sidebar-agents.mjs";
import { viewerLabelArgs } from "../src/herdr.mjs";

const uuid = "12345678-abcd-4321-abcd-123456789012";
function fixture(prefix = "") {
  return {
    terminals: [
      {
        address: prefix + "t1",
        state: "live",
        argv: ["node", "win.mjs", "--claude-resume", uuid],
      },
      {
        address: prefix + "t2",
        state: "live",
        name: "wc-" + "a".repeat(28),
        argv: ["claude", "--resume", uuid],
        labels: { "itsawin.viewer": "t1", "itsawin.agent": "claude" },
        status: "working",
        program: { agent: true, name: "Claude" },
      },
    ],
    panes: [
      {
        terminal: prefix + "t1",
        pane: prefix + "p1",
        tab: prefix + "tb1",
        focused: true,
      },
    ],
    spaces: [
      {
        id: prefix + "s1",
        name: "Project",
        tabs: [{ id: prefix + "tb1", name: "WIN", index: 1 }],
      },
    ],
  };
}
function project(f, native = []) {
  return winAgents(native, f.terminals, f.panes, f.spaces);
}

test("WIN rows show real status and focus the viewer pane on each host", () => {
  for (const prefix of ["", "vps/"]) {
    const f = fixture(prefix),
      rows = project(f);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].address, prefix + "t2");
    assert.equal(rows[0].pane, prefix + "p1");
    assert.equal(rows[0].status, "working");
    f.terminals[1].status = "blocked";
    assert.equal(project(f)[0].status, "blocked");
    f.terminals[1].status = null;
    assert.equal(project(f)[0].status, "unknown");
    f.terminals[1].state = "finished";
    assert.equal(project(f).length, 0);
  }
});
test("legacy sessions are matched by exact host and resume identity without changes", () => {
  const f = fixture("vps/");
  delete f.terminals[1].labels;
  const before = JSON.stringify(f);
  assert.equal(project(f)[0].pane, "vps/p1");
  assert.equal(JSON.stringify(f), before);
  f.terminals[0].argv[3] = "abcdef12-abcd-4321-abcd-123456789012";
  assert.equal(project(f).length, 0);
});
test("duplicate viewers, cross-host labels, stale viewers and native duplicates do not create misleading rows", () => {
  const f = fixture();
  const native = { address: "t2", pane: "native-pane" };
  assert.deepEqual(project(f, [native]), [native]);
  f.terminals[1].labels["itsawin.viewer"] = "vps/t1";
  assert.equal(project(f).length, 0);
  delete f.terminals[1].labels;
  f.terminals.push({ ...f.terminals[0], address: "t3" });
  f.panes.push({ ...f.panes[0], terminal: "t3", pane: "p3" });
  assert.equal(project(f).length, 0);
  f.terminals[0].state = "finished";
  assert.equal(project(f)[0].pane, "p3");
  f.terminals[2].state = "finished";
  assert.equal(project(f).length, 0);
});
test("same session IDs on different machines never match each other", () => {
  const local = fixture(),
    remote = fixture("vps/");
  delete remote.terminals[1].labels;
  const f = {
    terminals: [...local.terminals, remote.terminals[1]],
    panes: local.panes,
    spaces: local.spaces,
  };
  assert.deepEqual(
    project(f).map((a) => a.address),
    ["t2"],
  );
});
test("ordinary linked shells appear only when they become an agent", () => {
  const f = fixture();
  Object.assign(f.terminals[1], {
    name: "shell",
    program: { agent: false },
    labels: { "itsawin.viewer": "t1" },
  });
  assert.equal(project(f).length, 0);
  f.terminals[1].program.agent = true;
  assert.equal(project(f).length, 1);
});
test("viewer labels cannot adopt a pane or create a parent dependency", () => {
  assert.deepEqual(viewerLabelArgs("t123"), ["--label", "itsawin.viewer=t123"]);
  for (const value of [null, "", "vps/t1", "-bad"])
    assert.deepEqual(viewerLabelArgs(value), []);
});
