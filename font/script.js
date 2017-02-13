﻿var Addon_Id = "font";

var item = GetAddonElement(Addon_Id);
if (window.Addon == 1) {
	Addons.Font =
	{
		Exec: function (Ctrl)
		{
			var FV = GetFolderView(Ctrl);
			if (FV) {
				var hwnd = FV.hwndList;
				if (hwnd) {
					api.SendMessage(hwnd, WM_SETFONT, Addons.Font.hFont, 1);
					var nView = api.SendMessage(hwnd, LVM_GETVIEW, 0, 0);
					api.SendMessage(hwnd, LVM_SETVIEW, nView == 1 ? 3 : 1, 0);
					api.SendMessage(hwnd, LVM_SETVIEW, nView, 0);
				}
				if (Ctrl.Type == CTRL_EB) {
					Addons.Font.SetTV(FindChildByClass(Ctrl.hwnd, WC_TREEVIEW));
				}
			}
		},

		SetTV: function (hwnd)
		{
			if (hwnd) {
				api.SendMessage(hwnd, WM_SETFONT, Addons.Font.hFont, 1);
				api.SendMessage(hwnd, TVM_SETITEMHEIGHT, -1, 0);
			}
		},

		Init: function ()
		{
			Addons.Font.hFont = CreateFont(DefaultFont);
			var cFV = te.Ctrls(CTRL_FV);
			for (var i in cFV) {
				Addons.Font.Exec(cFV[i]);
			}
		}
	}

	AddEvent("ViewCreated", Addons.Font.Exec);

	AddEvent("Create", function (Ctrl)
	{
		if (Ctrl.Type <= CTRL_EB) {
			Addons.Font.Exec(Ctrl);
			return;
		}
		if (Ctrl.Type == CTRL_TV) {
			Addons.Font.SetTV(Ctrl.hwndTree);
		}
	});

	AddEventId("AddonDisabledEx", "font", function(Id)
	{
		api.SystemParametersInfo(SPI_GETICONTITLELOGFONT, DefaultFont.Size, DefaultFont, 0);
		Addons.Font.Init();
	});

	DefaultFont.lfFaceName = item.getAttribute("Name") || DefaultFont.lfFaceName;
	var h = item.getAttribute("Size");
	if (h >= 6 && h <= 18) {
		DefaultFont.lfHeight = - (h * screen.logicalYDPI / 72);
	}
	DefaultFont.lfCharSet = 1;
	document.body.style.fontFamily = DefaultFont.lfFaceName;
	document.body.style.fontSize = Math.abs(DefaultFont.lfHeight) + "px";
	Addons.Font.Init();
	FontChanged();
} else {
	ChooseFont = function (o)
	{
		var lf = api.Memory("LOGFONT");
		lf.lfFaceName = document.F.Name.value || MainWindow.DefaultFont.lfFaceName;
		var h = document.F.Size.value;
		lf.lfHeight = h >= 6 && h <= 18 ? - (h * screen.logicalYDPI / 72) : MainWindow.DefaultFont.lfHeight;
		lf.lfCharSet = 1;
		var cf = api.Memory("CHOOSEFONT");
		cf.lStructSize = cf.Size;
		cf.hwndOwner = api.GetWindow(document);
		cf.lpLogFont = lf;
		cf.Flags = 0x2041;
		cf.nSizeMin = 6;
		cf.nSizeMax = 18;
		if (api.ChooseFont(cf) && lf.CharSet != 2) {
			document.F.Name.value = lf.lfFaceName;
			document.F.Size.value = Math.abs(Math.round(lf.lfHeight * 72 / screen.logicalYDPI));
		}
		g_bChanged = true;
	}
}
