var Addon_Id = "labelbutton";
var item = GetAddonElement(Addon_Id);

Sync.LabelButton = {
	Exec: function (pt, mode) {
		if (Sync.Label) {
			var oList = {};
			var oList2 = {};
			Sync.Label.List(oList, oList2);
			var hMenu = api.CreatePopupMenu();
			var arList = [];
			var oListPos = {};
			for (var s in oList) {
				arList.push(s);
				oListPos[s] = arList.length;
			}
			if (Sync.LabelButton.Add(hMenu, oList, arList, oListPos) && !mode && arList.length) {
				api.InsertMenu(hMenu, MAXINT, MF_BYPOSITION | MF_SEPARATOR, 0, null);
			}
			if (mode) {
				pt = api.Memory("POINT");
				api.GetCursorPos(pt);
			} else {
				var FV = te.Ctrl(CTRL_FV);
				if (FV && FV.CurrentViewMode == FVM_DETAILS) {
					if (!/"System\.Contact\.Label"/.test(FV.Columns(1))) {
						api.InsertMenu(hMenu, MAXINT, MF_BYPOSITION | MF_STRING, 2, GetText("Details"));
					}
				}
				var nRes = Sync.LabelButton.LabelGroup(hMenu, oList, arList, oListPos, 10000);
				if (nRes) {
					api.InsertMenu(hMenu, MAXINT, MF_BYPOSITION | MF_SEPARATOR, 0, null);
					nRes = 0;
				}

				var arList2 = [];
				for (var s in oList2) {
					var ar = api.CommandLineToArgv(s);
					if (ar.length > 1) {
						arList2.push(s);
					}
				}
				if (arList2.length) {
					arList2 = arList2.sort(function (a, b) {
						return api.StrCmpLogical(a, b);
					});
					var mii = api.Memory("MENUITEMINFO");
					mii.cbSize = mii.Size;
					mii.fMask = MIIM_STRING | MIIM_SUBMENU | MIIM_STATE;
					mii.hSubMenu = api.CreatePopupMenu();
					mii.dwTypeData = GetText("Filter");
					for (var i in arList2) {
						var s = arList2[i];
						arList.push(s);
						oListPos[s] = arList.length;
						api.InsertMenu(mii.hSubMenu, MAXINT, MF_BYPOSITION | MF_STRING, oListPos[s] + 10000, s.replace(/&/g, "&&"));
					}
					api.InsertMenuItem(hMenu, MAXINT, false, mii);
				}

				for (var s in oList) {
					api.InsertMenu(hMenu, MAXINT, MF_BYPOSITION | MF_STRING, oListPos[s] + 10000, s.replace(/&/g, "&&"));
				}
			}
			Sync.LabelButton.Popup(hMenu, arList, pt)
		}
		return false;
	},

	Add: function (hMenu, oList, arList, oListPos) {
		var FV = te.Ctrl(CTRL_FV);
		if (FV) {
			Selected = FV.SelectedItems();
			if (Selected && Selected.Count) {
				api.InsertMenu(hMenu, MAXINT, MF_BYPOSITION | MF_STRING, 1, GetText("&Edit"));

				var mii = api.Memory("MENUITEMINFO");
				mii.cbSize = mii.Size;
				mii.fMask = MIIM_STRING | MIIM_SUBMENU | MIIM_STATE;
				mii.fState = MFS_DISABLED;
				mii.hSubMenu = api.CreatePopupMenu();
				mii.dwTypeData = GetText("Add");

				var mii2 = api.Memory("MENUITEMINFO");
				mii2.cbSize = mii.Size;
				mii2.fMask = MIIM_STRING | MIIM_SUBMENU | MIIM_STATE;
				mii2.fState = MFS_DISABLED;
				mii2.hSubMenu = api.CreatePopupMenu();
				mii2.dwTypeData = GetText("Remove");
				var oExists = {};
				for (var i = Selected.Count; i-- > 0;) {
					var path = api.GetDisplayNameOf(Selected.Item(i), SHGDN_FORADDRESSBAR | SHGDN_FORPARSING | SHGDN_ORIGINAL);
					if (path) {
						var ar = Sync.Label.DB.Get(path).split(/\s*;\s*/);
						for (var j in ar) {
							oExists[ar[j]] = 1;
						}
					}
				}
				for (var s in oList) {
					i = oListPos[s];
					if (oExists[s]) {
						api.InsertMenu(mii2.hSubMenu, MAXINT, MF_BYPOSITION | MF_STRING, i + 30000, s.replace(/&/g, "&&"));
						mii2.fState = MFS_ENABLED;
					}
				}
				var nRes = Sync.LabelButton.LabelGroup(mii.hSubMenu, oList, arList, oListPos, 20000);
				if (nRes) {
					mii.fState = MFS_ENABLED;
				}
				for (var s in oList) {
					if (nRes) {
						api.InsertMenu(mii.hSubMenu, MAXINT, MF_BYPOSITION | MF_SEPARATOR, 0, null);
						nRes = 0;
					}
					api.InsertMenu(mii.hSubMenu, MAXINT, MF_BYPOSITION | MF_STRING, oListPos[s] + 20000, s.replace(/&/g, "&&"));
					mii.fState = MFS_ENABLED;
				}
				api.InsertMenuItem(hMenu, MAXINT, false, mii);
				api.InsertMenuItem(hMenu, MAXINT, false, mii2);
				return true;
			}
		}
	},

	Popup: function (hMenu, arList, pt) {
		window.g_menu_click = true;
		var nVerb = api.TrackPopupMenuEx(hMenu, TPM_LEFTALIGN | TPM_LEFTBUTTON | TPM_RIGHTBUTTON | TPM_RETURNCMD, pt.x, pt.y, te.hwnd, null);
		var FV = te.Ctrl(CTRL_FV);
		if (nVerb == 1) {
			Sync.Label.Edit(FV, pt);
		}
		if (nVerb == 2) {
			FV.Columns = FV.Columns + ' "System.Contact.Label" -1';
		}
		if (nVerb > 30000) {
			if (confirmOk()) {
				Sync.Label.RemoveItems(Selected, arList[nVerb - 30001]);
			}
		} else if (nVerb > 20000) {
			if (confirmOk()) {
				Sync.Label.AppendItems(Selected, arList[nVerb - 20001]);
			}
		} else if (nVerb > 10000) {
			var path = "label:";
			if (api.GetKeyState(VK_SHIFT) < 0) {
				var res = /^(label:.*)$/.exec(api.GetDisplayNameOf(FV, SHGDN_FORADDRESSBAR | SHGDN_FORPARSING | SHGDN_ORIGINAL));
				if (res) {
					path = res[1] + (/;/.test(res[1]) ? ";" : " ");
				}
			}
			Navigate(path + arList[nVerb - 10001], GetOpenMode());
		}
		api.DestroyMenu(hMenu);
	},

	LabelGroup: function (hMenu, oList, arList, oListPos, nOffset) {
		var nRes = 0;
		var db = Common.Label.Groups;
		if (db) {
			var mii = api.Memory("MENUITEMINFO");
			mii.cbSize = mii.Size;
			mii.fMask = MIIM_STRING | MIIM_SUBMENU;
			db.ENumCB(function (s, v) {
				mii.hSubMenu = api.CreatePopupMenu();
				mii.dwTypeData = s.replace(/&/g, "&&");
				var ar = v.split(/\s*;\s*/);
				for (var j in ar) {
					nRes++;
					var s1 = ar[j];
					if (!oListPos[s1]) {
						arList.push(s1);
						oListPos[s1] = arList.length;
					}
					api.InsertMenu(mii.hSubMenu, MAXINT, MF_BYPOSITION | MF_STRING, oListPos[s1] + nOffset, s1.replace(/&/g, "&&"));
					delete oList[s1];
				}
				api.InsertMenuItem(hMenu, MAXINT, true, mii);
			});
		}
		return nRes;
	}
};