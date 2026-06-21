// ── 表情セット ───────────────────────────────────────────────────

function promptForSetName(defaultName) {
  var dialog = new Window("dialog", "表情セット名");
  dialog.orientation = "column";
  dialog.alignChildren = ["fill", "top"];
  dialog.margins = 16;
  dialog.spacing = 8;

  dialog.add("statictext", undefined, "セット名（同名があれば上書き）:");
  var input = dialog.add("edittext", undefined, defaultName || "");
  input.preferredSize = [220, BUTTON_HEIGHT];
  input.active = true;

  var btns = dialog.add("group");
  btns.alignment = ["right", "top"];
  btns.add("button", undefined, "OK", { name: "ok" });
  btns.add("button", undefined, "キャンセル", { name: "cancel" });

  if (dialog.show() !== 1) return null;
  var name = input.text.replace(/^\s+|\s+$/g, "");
  return name.length > 0 ? name : null;
}
