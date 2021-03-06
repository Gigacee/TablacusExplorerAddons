var Addon_Id = "teracopy";

var item = GetAddonElement(Addon_Id);
if (!item.getAttribute("Set")) {
	item.setAttribute("Class32", "{A7005AF0-D6E8-48AF-8DFA-023B1CF660A7}");
	item.setAttribute("Class64", "{A7645AF0-D6E8-48AF-8DFA-023B1CF660A7}");
	item.setAttribute("Copy", 1);
	item.setAttribute("Move", 2);
}
if (window.Addon == 1) {
	Addons.TeraCopy =
	{
		bDiffDriveOnly: item.getAttribute("DiffDriveOnly"),
		NoTemp: item.getAttribute("NoTemp"),

		FO: function (Ctrl, Items, Dest, grfKeyState, pt, pdwEffect, bOver) {
			var i = Items.Count;
			if (i == 0 || !(grfKeyState & MK_LBUTTON)) {
				return false;
			}
			if (Dest) {
				try {
					path = Dest.ExtendedProperty("linktarget") || Dest.Path || Dest;
				} catch (e) {
					path = Dest.Path || Dest;
				}
				if (path && fso.FolderExists(path)) {
					var pidTemp = api.ILCreateFromPath(fso.GetSpecialFolder(2).Path);
					pidTemp.IsFolder;
					var strTemp = pidTemp.Path + "\\";
					var strTemp2;
					var wfd = api.Memory("WIN32_FIND_DATA");
					var Items2 = api.CreateObject("FolderItems");
					while (i--) {
						var path1 = Items.Item(i).Path;
						var hFind = api.FindFirstFile(path1, wfd);
						api.FindClose(hFind);
						if (hFind != INVALID_HANDLE_VALUE) {
							if (!api.StrCmpNI(path1, strTemp, strTemp.length)) {
								if (!strTemp2) {
									if (Addons.TeraCopy.NoTemp) {
										return false;
									}
									do {
										strTemp2 = strTemp + "tablacus\\" + fso.GetTempName() + "\\";
									} while (IsExists(strTemp2));
									CreateFolder(strTemp2);
								}
								if (wfd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
									fso.MoveFolder(path1, strTemp2);
								} else {
									fso.MoveFile(path1, strTemp2);
								}
								path1 = strTemp2 + fso.GetFileName(path1);
							}
						} else {
							delete strTemp2;
							pdwEffect[0] = DROPEFFECT_NONE;
							break;
						}
						Items2.AddItem(path1);
					}
					if (strTemp2) {
						Items = Items2;
					}
					if (pdwEffect[0]) {
						nVerb = -1;
						if (bOver) {
							var DropTarget = api.DropTarget(path);
							DropTarget.DragOver(Items, grfKeyState, pt, pdwEffect);
						}
						if (pdwEffect[0] & DROPEFFECT_COPY) {
							nVerb = GetAddonOptionEx("teracopy", "Copy");
						} else if (pdwEffect[0] & DROPEFFECT_MOVE) {
							if (!(Addons.TeraCopy.bDiffDriveOnly && api.PathIsSameRoot(Items.Item(-1).Path, path))) {
								nVerb = GetAddonOptionEx("teracopy", "Move");
							}
						}
						if (nVerb > 0) {
							var dll = api.PathUnquoteSpaces(ExtractMacro(te, GetAddonOption("teracopy", "Path" + (api.sizeof("HANDLE") * 8)) + ""));
							var cls = GetAddonOption("teracopy", "Class" + (api.sizeof("HANDLE") * 8));
							var ContextMenu = api.ContextMenu(dll, cls, path, Items, HKEY_CLASSES_ROOT, "Folder", null);
							if (ContextMenu) {
								var hMenu = api.CreatePopupMenu();
								ContextMenu.QueryContextMenu(hMenu, 0, 1, 0x7FFF, CMF_NORMAL);
								ContextMenu.InvokeCommand(0, te.hwnd, nVerb - 1, null, null, SW_SHOWNORMAL, 0, 0);
								api.DestroyMenu(hMenu);
								return true;
							}
						}
					}
				}
			}
			return false;
		}
	};

	AddEvent("Drop", function (Ctrl, dataObj, grfKeyState, pt, pdwEffect) {
		switch (Ctrl.Type) {
			case CTRL_SB:
			case CTRL_EB:
			case CTRL_TV:
				var Dest = Ctrl.HitTest(pt);
				if (Dest) {
					if (!fso.FolderExists(Dest.Path)) {
						if (api.DropTarget(Dest)) {
							return E_FAIL;
						}
						Dest = Ctrl.FolderItem;
					}
				} else {
					Dest = Ctrl.FolderItem;
				}
				if (Dest && Addons.TeraCopy.FO(Ctrl, dataObj, Dest, grfKeyState, pt, pdwEffect, true)) {
					return S_OK
				}
				break;
			case CTRL_DT:
				if (Addons.TeraCopy.FO(null, dataObj, Ctrl.FolderItem, grfKeyState, pt, pdwEffect, true)) {
					return S_OK
				}
				break;
		}
	});

	AddEvent("Command", function (Ctrl, hwnd, msg, wParam, lParam) {
		if (Ctrl.Type == CTRL_SB || Ctrl.Type == CTRL_EB) {
			switch ((wParam & 0xfff) + 1) {
				case CommandID_PASTE:
					var Items = api.OleGetClipboard()
					if (Addons.TeraCopy.FO(null, Items, Ctrl.FolderItem, MK_LBUTTON, null, Items.pdwEffect, false)) {
						return S_OK;
					}
					break;
			}
		}
	});

	AddEvent("InvokeCommand", function (ContextMenu, fMask, hwnd, Verb, Parameters, Directory, nShow, dwHotKey, hIcon) {
		switch (Verb + 1) {
			case CommandID_PASTE:
				var Target = ContextMenu.Items();
				if (Target.Count) {
					var Items = api.OleGetClipboard()
					if (Addons.TeraCopy.FO(null, Items, Target.Item(0), MK_LBUTTON, null, Items.pdwEffect, false)) {
						return S_OK;
					}
				}
				break;
		}
	});
} else {
	importScript("addons\\" + Addon_Id + "\\options.js");
}
