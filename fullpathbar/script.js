var Addon_Id = "fullpathbar";
var Default = "BottomBar3Left";

if (window.Addon == 1) {
	Addons.FullPathBar =
	{
		Title: GetAddonOptionEx(Addon_Id, "Title"),

		Show: function (Ctrl) {
			if (Ctrl) {
				var s = Ctrl.Path;
				if (!s && Ctrl.Type <= CTRL_EB) {
					var Items = Ctrl.SelectedItems();
					s = api.GetDisplayNameOf(Items.Item(0) || Ctrl.FolderItem, SHGDN_FORADDRESSBAR | SHGDN_FORPARSING | SHGDN_ORIGINAL);
				} if (s) {
					try {
						document.getElementById("fullpathbar").innerHTML = "&nbsp;" + s;
						if (Addons.FullPathBar.Title) {
							api.SetWindowText(te.hwnd, s + " - " + TITLE);
						}
					} catch (e) { }
				}
			}
		}
	}
	SetAddon(Addon_Id, Default, '<span id="fullpathbar">&nbsp;</span>');

	AddEvent("StatusText", Addons.FullPathBar.Show);
	AddEvent("Load", function () {
		Addons.FullPathBar.Show(te.Ctrl(CTRL_FV));
	});
} else {
	SetTabContents(0, "View", '<label><input type="checkbox" id="Title">Title Bar</label>');
}
