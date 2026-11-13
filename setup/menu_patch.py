"""Small, version-checked edits to a user's installed Herdr mods.

The upstream UI source is read locally, never bundled in this repository.
Exact anchors intentionally fail when Herdr changes its menu structure.
"""


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise ValueError('Herdr UI changed: expected exactly one matching menu anchor.')
    return source.replace(before, after, 1)


def patch_menu(source):
    if 'this.row("itsawin"' in source:
        return source
    anchor = '      .child(div().px(9).pt(8).pb(4).text_size(11).text_color(t.dim).child("Start an agent"))'
    row = '''      .child(this.row("itsawin", svg("icons/shell.svg").size(14), "itsawin", () => run("tab.new", { name: "itsawin", space: space?.id, argv: ["/bin/sh", "-c", 'exec "$HOME/.local/bin/itsawin"'] })))'''
    source = replace_once(source, anchor, row + '\n' + anchor)
    return replace_once(source, 'Math.min(491, 167 +', 'Math.min(522, 198 +')


def patch_tabs(source):
    if 'mod: "itsawin-menu"' in source:
        return source
    source = replace_once(source, 'mod: "new-menu"', 'mod: "itsawin-menu"')
    return replace_once(source, 'width: 250, height: 512', 'width: 250, height: 543')
