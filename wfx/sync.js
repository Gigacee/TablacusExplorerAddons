var Addon_Id = "wfx";
var item = GetAddonElement(Addon_Id);

Sync.WFX = {
	tidNotify: {}, Use: [], Cnt: [], pdb: [],
	xml: OpenXml("wfx.xml", false, true),
	dbfile: fso.BuildPath(te.Data.DataFolder, "config\\wfx_" + (wnw.ComputerName.toLowerCase()) + ".bin"),

	IsHandle: function (Ctrl) {
		return Sync.WFX.GetObject(Ctrl) != null;
	},

	GetObject: function (Ctrl) {
		if (!Sync.WFX.DLL) {
			return;
		}
		var lib = { file: "string" === typeof Ctrl ? Ctrl : api.GetDisplayNameOf(Ctrl, SHGDN_FORADDRESSBAR | SHGDN_FORPARSING | SHGDN_ORIGINAL) };
		var re = /^(\\{3})([^\\]*)(.*)/.exec(lib.file);
		if (!re) {
			return;
		}
		if (!Sync.WFX.Obj) {
			Sync.WFX.Init();
		}

		var Obj = Sync.WFX.Obj[re[2]];
		if (Obj) {
			if (!Obj.X) {
				Obj.X = Sync.WFX.DLL.open(Obj.dllPath);
				if (Obj.X.FsInit) {
					if (Obj.X.FsInit(Obj.PluginNr, this.ArrayProc, this.ProgressProc, this.LogProc, this.RequestProc) == 0) {
						Obj.X.FsSetDefaultParams(fso.BuildPath(te.Data.DataFolder, "config\\fsplugin.ini"));
						Obj.X.FsSetCryptCallback(this.CryptProc, Obj.PluginNr, 1);
					}
				}
			}
			lib.X = Obj.X;
			lib.root = re[1] + re[2];
			lib.path = re[3] || "\\";
			lib.PluginNr = Obj.PluginNr;
			return lib;
		}
	},

	Init: function () {
		Sync.WFX.Obj = {};
		Sync.WFX.Root = [];
		Sync.WFX.Obj[""] =
		{
			X:
			{
				hFind: 0,
				hash: {},

				FsFindFirst: function (path, wfd) {
					if (Sync.WFX.Root.length) {
						var hFind = this.hFind++;
						this.hFind = this.hFind % MAXINT;
						this.hash[hFind] = 0;
						if (this.FsFindNext(hFind, wfd)) {
							return hFind;
						}
					}
					return -1;
				},

				FsFindNext: function (hFind, wfd) {
					if (isFinite(this.hash[hFind])) {
						wfd.cFileName = Sync.WFX.Root[this.hash[hFind]++];
						if (wfd.cFileName) {
							wfd.dwFileAttributes = FILE_ATTRIBUTE_DIRECTORY;
							return true;
						}
					}
					return false;
				},

				FsFindClose: function (hFind) {
					delete this.hash[hFind];
				},

				FsExecuteFile: function (MainWin, RemoteName, Verb) {
					if (Verb.toLowerCase() == "properties") {
						var lib = Sync.WFX.GetObject('\\\\' + RemoteName[0]);
						if (lib && lib.X) {
							lib.X.FsExecuteFile(MainWin, ["\\"], Verb);
						}
					}
				}
			}
		}

		Sync.WFX.Root = [];
		var items = Sync.WFX.xml.getElementsByTagName("Item");
		for (var i = 0; i < items.length; ++i) {
			var dllPath = (ExtractMacro(te, api.PathUnquoteSpaces(items[i].getAttribute("Path"))) + (api.sizeof("HANDLE") > 4 ? "64" : "")).replace(/\.u(wfx64)$/, ".$1");
			var WFX = Sync.WFX.DLL.open(dllPath);
			if (WFX && WFX.FsInit) {
				var s = items[i].getAttribute("Name");
				Sync.WFX.Root.push(s);
				Sync.WFX.Obj[s] =
				{
					dllPath: dllPath,
					PluginNr: Sync.WFX.Root.length
				}
			}
		}
		items = Sync.WFX.xml.getElementsByTagName("MP");
		if (items.length) {
			Sync.WFX.MP = Sync.WFX.ED(api.base64_decode(items[0].text, true));
			if (items[0].getAttribute("CRC") != api.CRC32(Sync.WFX.MP)) {
				Sync.WFX.MP = "";
			}
		}
		items = Sync.WFX.xml.getElementsByTagName("Conf");
		if (items.length) {
			Sync.WFX.NoExSort = items[0].getAttribute("NoExSort");
		}

		try {
			var ado = api.CreateObject("ads");
			ado.Type = adTypeBinary;
			ado.Open();
			ado.LoadFromFile(Sync.WFX.dbfile);
			var s = api.CryptUnprotectData(ado.Read(adReadAll), Sync.WFX.MP, true);
			ado.Close();
		} catch (e) {
			s = "";
		}
		if (s) {
			var line = s.split(/\n/);
			for (var i in line) {
				if (line[i]) {
					var col = line[i].split(/\t/);
					var db = Sync.WFX.pdb[col[0]];
					if (!db) {
						Sync.WFX.pdb[col[0]] = db = {}
					}
					db[col[1]] = col[2];
				}
			}
		}
	},

	GetObjectEx: function (Path) {
		var dwSessionId = api.sscanf(Path, fso.BuildPath(fso.GetSpecialFolder(2).Path, "tablacus\\%llx"));
		if (dwSessionId) {
			var cFV = te.Ctrls(CTRL_FV);
			for (var i in cFV) {
				var FV = cFV[i];
				if (FV.SessionId == dwSessionId) {
					var lib = Sync.WFX.GetObject(FV);
					if (lib) {
						lib.file = unescape(fso.GetFileName(Path));
						return lib;
					}
				}
			}
		}
	},

	Refresh: function (Ctrl) {
		Ctrl.Refresh();
	},

	StringToVerb: {
		"paste": CommandID_PASTE,
		"delete": CommandID_DELETE,
		"copy": CommandID_COPY,
		"cut": CommandID_CUT,
		"properties": CommandID_PROPERTIES,
	},

	Command: function (Ctrl, Verb, ContextMenu) {
		if (Ctrl && Ctrl.Type <= CTRL_EB) {
			var lib = Sync.WFX.GetObject(Ctrl);
			if (lib) {
				switch ("string" === typeof Verb ? Sync.WFX.StringToVerb[Verb.toLowerCase()] : Verb + 1) {
					case CommandID_PASTE:
						Sync.WFX.Append(Ctrl, api.OleGetClipboard());
						return S_OK;
					case CommandID_DELETE:
						Sync.WFX.Delete(Ctrl);
						return S_OK;
					case CommandID_COPY:
					case CommandID_CUT:
						api.OleSetClipboard(Ctrl.SelectedItems());
						Sync.WFX.ClipId = api.sprintf(9, "%x", Ctrl.SessionId);
						Sync.WFX.ClipPath = lib.file;
						return S_OK;
					case CommandID_PROPERTIES:
						var Selected = Ctrl.SelectedItems();
						if (Selected.Count) {
							if (lib.X.FsExecuteFile) {
								lib.X.FsExecuteFile(te.hwnd, [fso.BuildPath(lib.path, unescape(fso.GetFileName(Selected.Item(0).Path)))], "properties")
								return S_OK;
							}
						}
						break;
				}
			}
		}
	},

	Append: function (Ctrl, Items) {
		if (!Items.Count) {
			return;
		}
		var lib = Sync.WFX.GetObject(Ctrl);
		if (lib && lib.X.FsPutFile) {
			var lpath = Items.Item(-1).Path;
			Sync.WFX.Connect(lib);
			FsResult = 0;
			var bRefresh = false;
			Sync.WFX.Progress = te.ProgressDialog;
			Sync.WFX.Progress.StartProgressDialog(te.hwnd, null, 0);
			var fl = [];
			try {
				Sync.WFX.Progress.SetLine(1, api.LoadString(hShell32, 33260) || api.LoadString(hShell32, 6478), true);
				Sync.WFX.Cnt = [0, 0, 0, 0, 0];
				if (Sync.WFX.LocalList(lib, Items, "", fl) == 0) {
					Sync.WFX.ShowLine(5954, 32946);
					for (; fl.length && !Sync.WFX.Progress.HasUserCancelled(); ++Sync.WFX.Cnt[0]) {
						var item = fl.shift();
						var rfn = fso.BuildPath(lib.path, item[0]);
						Sync.WFX.Cnt[4] = item[3];
						Sync.WFX.Progress.SetLine(2, item[0], true);
						if (item[1]) {
							lib.X.FsMkDir(rfn);
						} else {
							FsResult = lib.X.FsPutFile(item[2], rfn, 1);
							if (FsResult) {
								break;
							}
						}
						Sync.WFX.Cnt[2] += item[3];
						if (!/\\/.test(item[0])) {
							bRefresh = true;
						}
					}
				}
				if (Sync.WFX.Progress.HasUserCancelled()) {
					FsResult = 5;
				}
			} catch (e) {
				FsResult = e;
			}
			Sync.WFX.Progress.StopProgressDialog();
			delete Sync.WFX.Progress;
			if (bRefresh) {
				Sync.WFX.Refresh(Ctrl);
			}
			if (FsResult) {
				Sync.WFX.ShowError(FsResult);
			}
		}
	},

	RemoteList: function (lib, fl, items) {
		var Result = Sync.WFX.Progress.HasUserCancelled();
		Sync.WFX.Cnt[1] += items.length;
		while (items.length && !Result) {
			var wfd = api.Memory("WIN32_FIND_DATA");
			api.SHGetDataFromIDList(items.shift(), SHGDFIL_FINDDATA, wfd, wfd.Size);
			var nDog = 99999;
			var arDir = [{ path: "", wfd: wfd }];
			while (arDir.length && !Result) {
				var o = arDir.pop();
				var path = fso.BuildPath(o.path, unescape(o.wfd.cFileName));
				fl.push({
					path: path,
					SizeLow: o.wfd.nFileSizeLow,
					SizeHigh: o.wfd.nFileSizeHigh,
					LastWriteTime: o.wfd.ftLastWriteTime,
					Attr: o.wfd.dwFileAttributes
				});
				if (o.wfd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
					wfd = {};
					var hFind = lib.X.FsFindFirst(fso.BuildPath(lib.path, path), wfd);
					if (hFind != -1) {
						do {
							if (!api.PathMatchSpec(wfd.cFileName, ".;..")) {
								++Sync.WFX.Cnt[1];
								Sync.WFX.Unix2Win(wfd);
								if (wfd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
									arDir.push({ path: path, wfd: wfd });
								} else {
									fl.push({
										path: fso.BuildPath(path, wfd.cFileName),
										SizeLow: wfd.nFileSizeLow,
										SizeHigh: wfd.nFileSizeHigh,
										LastWriteTime: wfd.ftLastWriteTime,
										Attr: wfd.dwFileAttributes
									});
								}
							}
							Result = Sync.WFX.Progress && Sync.WFX.Progress.HasUserCancelled();
							wfd = {};
						} while (!Result && lib.X.FsFindNext(hFind, wfd));
						lib.X.FsFindClose(hFind);
					}
				} else {
					Sync.WFX.Cnt[3] += api.QuadPart(wfd.nFileSizeLow, wfd.nFileSizeHigh);
				}
				if (nDog-- <= 0) {
					Result = true;
				}
			}
		}
		return Result ? 1 : 0;
	},

	LocalList: function (lib, Items, path, fl) {
		Sync.WFX.Cnt[1] += Items.Count;
		for (var i = 0; i < Items.Count; ++i) {
			if (Sync.WFX.Progress && Sync.WFX.Progress.HasUserCancelled()) {
				return 1;
			}
			var Item = Items.Item(i);
			var wfd = api.Memory("WIN32_FIND_DATA");
			api.SHGetDataFromIDList(Item, SHGDFIL_FINDDATA, wfd, wfd.Size);
			var fn = fso.BuildPath(path, wfd.cFileName);
			if (wfd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
				if (lib.X.FsMkDir) {
					fl.push([fn, 1, "", 0]);
					if (this.LocalList(lib, Item.GetFolder.Items(), fn, fl)) {
						return 1;
					}
				}
				continue;
			}
			var fs = api.QuadPart(wfd.nFileSizeLow, wfd.nFileSizeHigh);
			fl.push([fn, 0, Item.Path, fs]);
			Sync.WFX.Cnt[3] += fs;
		}
		return 0;
	},

	Delete: function (Ctrl) {
		var Items = Ctrl.SelectedItems();
		if (!Items.Count || !confirmOk("Are you sure?")) {
			return;
		}
		var lib = Sync.WFX.GetObject(Ctrl.FolderItem.Path);
		if (lib) {
			var FsResult = 0;
			var bRefresh = false;
			Sync.WFX.Connect(lib);
			Sync.WFX.Progress = te.ProgressDialog;
			Sync.WFX.Progress.StartProgressDialog(te.hwnd, null, 0);
			try {
				Sync.WFX.Progress.SetLine(1, api.LoadString(hShell32, 33269) || api.LoadString(hShell32, 6478), true);
				Sync.WFX.Cnt = [0, 0, 0, 0, 0];
				var items = [], fl = [];
				for (var i = Items.Count; i--;) {
					items.unshift(Items.Item(i));
				}
				if (Sync.WFX.RemoteList(lib, fl, items) == 0) {
					Sync.WFX.ShowLine(5955, 32947);
					Sync.WFX.Cnt[3] = 0;
					for (; fl.length && !Sync.WFX.Progress.HasUserCancelled(); ++Sync.WFX.Cnt[0]) {
						var item = fl.pop();
						var path = fso.BuildPath(lib.path, item.path);
						Sync.WFX.Progress.SetLine(2, item.path, true);
						if (item.Attr & FILE_ATTRIBUTE_DIRECTORY) {
							if (lib.X.FsRemoveDir) {
								if (!lib.X.FsRemoveDir(path)) {
									FsResult = 4;
									break;
								}
							}
						} else if (lib.X.FsDeleteFile) {
							if (!lib.X.FsDeleteFile(path)) {
								FsResult = 4;
								break;
							}
						}
						if (!/\\/.test(item.path)) {
							bRefresh = true;
						}
					}
				}
				if (Sync.WFX.Progress.HasUserCancelled()) {
					FsResult = 5;
				}
			} catch (e) {
				FsRerult = e;
			}
			Sync.WFX.Progress.StopProgressDialog();
			delete Sync.WFX.Progress;
			if (bRefresh) {
				Ctrl.Refresh();
			}
			if (FsResult) {
				Sync.WFX.ShowError(FsResult);
			}
		}
	},

	Enum: function (pid, Ctrl, fncb) {
		var lib = Sync.WFX.GetObject(pid.Path);
		if (Ctrl && lib) {
			var Items = api.CreateObject("FolderItems");
			Sync.WFX.Connect(lib);
			var root = fso.BuildPath(fso.GetSpecialFolder(2).Path, api.sprintf(999, "tablacus\\%x", Ctrl.SessionId));
			var wfd = {};
			var hFind = lib.X.FsFindFirst(lib.path, wfd);
			if (hFind != -1) {
				do {
					var fn = wfd.cFileName.replace(/([%\\/:\*\?"<>|]+)/g, function (all, re1) {
						return escape(re1);
					});
					if (!/^\.\.?$|^$/.test(fn)) {
						Sync.WFX.Unix2Win(wfd);
						Items.AddItem(api.SHSimpleIDListFromPath(fso.BuildPath(root, fn), wfd.dwFileAttributes, wfd.ftLastWriteTime, api.QuadPart(wfd.nFileSizeLow, wfd.nFileSizeHigh)));
					}
				} while (lib.X.FsFindNext(hFind, wfd));
				lib.X.FsFindClose(hFind);
			}
			return Items;
		}
	},

	ReplaceColumns: function (Ctrl, pid, s) {
		if (s.indexOf("%") >= 0) {
			return unescape(s);
		}
	},

	CreateFolder: function (path) {
		var s = fso.GetParentFolderName(path);
		if (s.length > 3 && !fso.FolderExists(s)) {
			this.CreateFolder(s);
		}
		if (!fso.FolderExists(path)) {
			fso.CreateFolder(path);
		}
	},

	ChangeNotify: function (path) {
		var strMatch = path + ";" + path + "\\*";
		var cFV = te.Ctrls(CTRL_FV);
		for (var i in cFV) {
			var FV = cFV[i];
			if (FV.hwndView) {
				if (api.PathMatchSpec(api.GetDisplayNameOf(FV, SHGDN_FORADDRESSBAR | SHGDN_FORPARSING | SHGDN_ORIGINAL), strMatch)) {
					if (Sync.WFX.tidNotify[FV.Id]) {
						clearTimeout(Sync.WFX.tidNotify[FV.Id]);
					}
					(function (FV) {
						Sync.WFX.tidNotify[FV.Id] = setTimeout(function () {
							delete Sync.WFX.tidNotify[FV.Id];
							FV.Refresh();
						}, 500);
					})(FV);
				}
			}
		}
	},

	Connect: function (lib) {
		if (lib.X.FsDisconnect) {
			var re = /^\\([^\\]+)/.exec(lib.path);
			if (re) {
				Sync.WFX.Use[fso.BuildPath(lib.root, re[1])] = 1;
			}
		}
	},

	CheckDisconnect: function (Ctrl) {
		var bOk = true;
		for (var i in Sync.WFX.Use) {
			bOk = false;
			break;
		}
		if (bOk) {
			return;
		}
		if (Sync.WFX.tidClose) {
			clearTimeout(Sync.WFX.tidClose);
		}
		Sync.WFX.tidClose = setTimeout(function () {
			var Use = {};
			var cFV = te.Ctrls(CTRL_FV);
			for (var i in cFV) {
				var FV = cFV[i];
				if (FV.hwndView && FV.FolderItem) {
					var re = /^(\\{3}[^\\]+\\[^\\]+)/.exec(FV.FolderItem.Path);
					if (re) {
						Use[re[1]] = 1;
					}
				}
			}
			for (var i in Sync.WFX.Use) {
				if (!Use[i]) {
					var re = /^\\{3}([^\\]+)(.+)/.exec(i);
					if (re) {
						Sync.WFX.Obj[re[1]].X.FsDisconnect(re[2]);
					}
					delete Sync.WFX.Use[i];
				}
			}
		}, 999);
	},

	DefaultCommand: function (Ctrl, Selected) {
		if (Selected.Count) {
			var Item = Selected.Item(0);
			var path = api.GetDisplayNameOf(Item, SHGDN_FORPARSING | SHGDN_FORADDRESSBAR | SHGDN_ORIGINAL);
			if (Sync.WFX.IsHandle(path)) {
				Ctrl.Navigate(path);
				return S_OK;
			}
			var lib = Sync.WFX.GetObject(Ctrl);
			if (lib) {
				var path = fso.BuildPath(lib.path, unescape(Item.Name));
				if (IsFolderEx(Item)) {
					Ctrl.Navigate(fso.BuildPath(lib.root, path));
				} else {
					var pRemote = [path];
					var iRes = lib.X.FsExecuteFile && lib.X.FsExecuteFile(te.hwnd, pRemote, "open");
					if (iRes == 0) {
						return S_OK;
					}
					var wfd = {};
					var hFind = lib.X.FsFindFirst(pRemote[0], wfd);
					if (hFind != -1 && wfd.dwFileAttributes < 0) {
						while (api.PathMatchSpec(wfd.cFileName, ".;..") && lib.X.FsFindNext(hFind, wfd)) {
						}
						lib.X.FsFindClose(hFind);
						if (!api.PathMatchSpec(wfd.cFileName, ".;..")) {
							Ctrl.Navigate(fso.BuildPath(lib.root, pRemote[0]).replace(/\\$/, ""));
							return S_OK;
						}
					}
					if (iRes == -1) {
						return;
					}
				}
				return S_OK;
			}
		}
	},

	SetName: function (pid, Name) {
		var lib = Sync.WFX.GetObjectEx(pid.Path);
		if (lib && lib.X.FsRenMovFile) {
			Sync.WFX.Connect(lib);
			var wfd = api.Memory("WIN32_FIND_DATA");
			api.SHGetDataFromIDList(pid, SHGDFIL_FINDDATA, wfd, wfd.Size);
			var fn = fso.BuildPath(lib.path, lib.file);
			var ri =
			{
				SizeLow: wfd.nFileSizeLow,
				SizeHigh: wfd.nFileSizeHigh,
				LastWriteTime: wfd.ftLastWriteTime,
				Attr: wfd.dwFileAttributes
			}
			if (ri.Attr & FILE_ATTRIBUTE_DIRECTORY) {
				ri.SizeLow = 0;
				ri.SizeHigh = 0xFFFFFFFF;
			}
			var r = lib.X.FsRenMovFile(fn, fso.BuildPath(lib.path, Name), true, false, ri);
			if (r == 0) {
				Sync.WFX.ChangeNotify(fso.BuildPath(lib.root, lib.path));
			} else {
				setTimeout(function () {
					Sync.WFX.ShowError(r, fn);
				}, 99);
			}
			return r;
		}
	},

	ShowError: function (r, path) {
		if (r == 5) {
			return;
		}
		setTimeout(function () {
			if (isFinite(r)) {
				var o = [0, 6327, 6146, 6175, 6173, 28743, 16771];
				MessageBox(api.LoadString(hShell32, o[r]) || api.sprintf(999, api.LoadString(hShell32, 4228), r), TITLE, MB_OK);
				return;
			}
			ShowError(r, path);
		}, 500);
	},

	ShowLine: function (s1, s2) {
		var i = Sync.WFX.Cnt[1];
		var s3 = 6466;
		if (g_.IEVer > 8) {
			s3 = i > 1 ? 38192 : 38193;
			if (i > 999) {
				i = i.toLocaleString();
			}
		}
		this.Progress.SetLine(1, [api.LoadString(hShell32, s1) || api.LoadString(hShell32, s2), " ", (api.LoadString(hShell32, s3) || "%s items").replace(/%1!ls!|%s/g, i), " (", api.StrFormatByteSize(Sync.WFX.Cnt[3]), ")"].join(""), true);
	},

	ProgressProc: function (PluginNr, SourceName, TargetName, PercentDone) {
		if (Sync.WFX.Progress) {
			var i = Sync.WFX.Cnt[1] - Sync.WFX.Cnt[0];
			if (i > 999 && document.documentMode > 8) {
				i = i.toLocaleString();
			}
			var ar = [api.LoadString(hShell32, 13581) || "Items remaining:", " ", i];
			if (Sync.WFX.Cnt[3]) {
				i = Sync.WFX.Cnt[2] + Math.floor(Sync.WFX.Cnt[4] * PercentDone / 100);
				ar.push(" (", api.StrFormatByteSize(Sync.WFX.Cnt[3] - i), ")");
				i = i / Sync.WFX.Cnt[3] * 100;
			} else {
				i = (Sync.WFX.Cnt[0] * 100 + PercentDone) / Sync.WFX.Cnt[1];
			}
			Sync.WFX.Progress.SetTitle(i.toFixed(0) + "%");
			Sync.WFX.Progress.SetProgress(i, 100);
			Sync.WFX.Progress.SetLine(3, ar.join(""), true);
			return Sync.WFX.Progress.HasUserCancelled() ? 1 : 0;
		}
		return 0;
	},

	LogProc: function (PluginNr, MsgType, LogString) {
		if (Sync.Debug) {
			Sync.Debug.alert(LogString);
		} else {
			api.OutputDebugString(LogString);
		}
	},

	RequestProc: function (PluginNr, RequestType, CustomTitle, CustomText, pReturnedText) {
		if (RequestType < 8) {
			pReturnedText[0] = InputDialog([CustomTitle || TITLE, CustomText].join("\n"), pReturnedText[0]);
			return 1;
		}
		if (RequestType == 8) {
			MessageBox(CustomText, CustomTitle, MB_ICONINFORMATION | MB_OK);
			return 1;
		}
		if (RequestType == 9) {
			return confirmOk(CustomText, CustomTitle) ? 1 : 0;
		}
		if (RequestType == 10) {
			return confirmYN(CustomText, CustomTitle) ? 1 : 0;
		}
		return 1;
	},

	CryptProc: function (PluginNr, CryptoNumber, mode, ConnectionName, pPassword) {
		var db = Sync.WFX.pdb[Sync.WFX.Root[PluginNr - 1]];
		if (!db) {
			Sync.WFX.pdb[Sync.WFX.Root[PluginNr - 1]] = db = {};
		}
		switch (mode) {
			case 1://FS_CRYPT_SAVE_PASSWORD
				db[ConnectionName] = pPassword[0];
				Sync.WFX.bSave = true;
				return 0;
			case 2://FS_CRYPT_LOAD_PASSWORD
			case 3://FS_CRYPT_LOAD_PASSWORD_NO_UI
				pPassword[0] = db[ConnectionName];
				return pPassword[0] ? 0 : 3;
			case 4://FS_CRYPT_COPY_PASSWORD
				if (db[ConnectionName]) {
					db[pPassword[0]] = db[ConnectionName];
					Sync.WFX.bSave = true;
					return 0;
				}
				return 3;
			case 5://FS_CRYPT_MOVE_PASSWORD
				if (db[ConnectionName]) {
					db[pPassword[0]] = db[ConnectionName];
					delete db[ConnectionName];
					Sync.WFX.bSave = true;
					return 0;
				}
				return 3;
			case 6://FS_CRYPT_DELETE_PASSWORD
				if (db[ConnectionName]) {
					delete db[ConnectionName];
					Sync.WFX.bSave = true;
					return 0;
				}
				return 3;
		}
		return 6;
	},

	ED: function (s) {
		var ar = s.split("").reverse();
		for (var i in ar) {
			ar[i] = String.fromCharCode(ar[i].charCodeAt(0) ^ 13);
		}
		return ar.join("");
	},

	Unix2Win: function (wfd) {
		if (wfd.dwFileAttributes < 0) {
			if (wfd.dwReserved0 & 0x6000) {
				wfd.dwFileAttributes |= FILE_ATTRIBUTE_DIRECTORY;
			}
			if (!(wfd.dwReserved0 & 0x80)) {
				wfd.dwFileAttributes |= FILE_ATTRIBUTE_READONLY;
			}
		}
	},

	Properties: function (Ctrl) {
		var lib = Sync.WFX.GetObject(Ctrl);
		if (lib && lib.X) {
			lib.X.FsExecuteFile(te.hwnd, ["\\"], "properties");
		}
	},

	ArrayProc: function () {
		return [];
	},

	Finalize: function () {
		for (var i in Sync.WFX.Use) {
			var re = /^\\{3}([^\\]+)(.+)/.exec(i);
			if (re) {
				Sync.WFX.Obj[re[1]].X.FsDisconnect(re[2]);
			}
			delete Sync.WFX.Use[i];
		}
		delete Sync.WFX.Obj;
		CollectGarbage();
		delete Sync.WFX.DLL;
	}
}

var twfxPath = fso.BuildPath(fso.GetParentFolderName(api.GetModuleFileName(null)), ["addons\\wfx\\twfx", api.sizeof("HANDLE") * 8, ".dll"].join(""));

Sync.WFX.DLL = api.DllGetClassObject(twfxPath, "{5396F915-5592-451c-8811-87314FC0EF11}");

AddEvent("Finalize", Sync.WFX.Finalize);

AddEvent("TranslatePath", function (Ctrl, Path) {
	if (Sync.WFX.IsHandle(Path)) {
		Ctrl.Enum = Sync.WFX.Enum;
		return ssfRESULTSFOLDER;
	}
}, true);

AddEvent("ReplacePath", function (FolderItem, Path) {
	var lib = Sync.WFX.GetObjectEx(Path);
	if (lib) {
		return fso.BuildPath(lib.root, fso.BuildPath(lib.path, lib.file));
	}
});

AddEvent("BeginDrag", function (Ctrl) {
	if (Sync.WFX.IsHandle(Ctrl)) {
		var pdwEffect = [DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK];
		api.SHDoDragDrop(null, Ctrl.SelectedItems(), Ctrl, pdwEffect[0], pdwEffect, true);
		return false;
	}
});

AddEvent("BeforeGetData", function (Ctrl, Items, nMode) {
	if (!Items.Count) {
		return;
	}
	var hr = S_OK;
	var root = fso.BuildPath(fso.GetSpecialFolder(2).Path, "tablacus");
	var ar = [], fl = [];
	for (var i = Items.Count; i--;) {
		var path = Items.Item(i).Path;
		if (api.PathMatchSpec(path, root + "*") && !fso.FileExists(path)) {
			ar.unshift(Items.Item(i));
		}
	}
	if (!ar.length) {
		return;
	}
	var strSessionId = fso.GetParentFolderName(ar[0].Path).replace(root + "\\", "").replace(/\\.*/, "");
	var lib = Sync.WFX.GetObject(strSessionId == Sync.WFX.ClipId ? Sync.WFX.ClipPath : Ctrl);
	if (lib && lib.X.FsGetFile) {
		var FsResult = 0;
		var root = fso.BuildPath(fso.GetSpecialFolder(2).Path, "tablacus\\" + strSessionId);
		Sync.WFX.CreateFolder(root);
		wsh.CurrentDirectory = root;
		Sync.WFX.Progress = te.ProgressDialog;
		Sync.WFX.Progress.StartProgressDialog(te.hwnd, null, 0);
		try {
			Sync.WFX.Progress.SetLine(1, api.LoadString(hShell32, 33260) || api.LoadString(hShell32, 6478), true);
			Sync.WFX.Cnt = [0, 0, 0, 0, 0];
			if (Sync.WFX.RemoteList(lib, fl, ar) == 0) {
				Sync.WFX.ShowLine(5954, 32946);
				for (; fl.length && !Sync.WFX.Progress.HasUserCancelled(); ++Sync.WFX.Cnt[0]) {
					var item = fl.shift();
					var path = fso.BuildPath(lib.path, item.path);
					var lfn = fso.BuildPath(root, item.path);
					Sync.WFX.Cnt[4] = api.QuadPart(item.SizeLow, item.SizeHigh);
					Sync.WFX.Progress.SetLine(2, item.path, true);
					if (item.Attr & FILE_ATTRIBUTE_DIRECTORY) {
						Sync.WFX.CreateFolder(lfn);
					} else {
						FsResult = lib.X.FsGetFile(path, lfn, 1, item);
						if (FsResult) {
							break;
						}
					}
					Sync.WFX.Cnt[2] += Sync.WFX.Cnt[4];
				}
			}
			if (Sync.WFX.Progress.HasUserCancelled()) {
				FsResult = 5;
			}
		} catch (e) {
			FsRerult = e;
		}
		Sync.WFX.Progress.StopProgressDialog();
		if (Sync.WFX.Progress.HasUserCancelled()) {
			hr = E_ABORT;
		}
		delete Sync.WFX.Progress;
		wsh.CurrentDirectory = fso.GetSpecialFolder(2).Path;
		if (FsResult) {
			Sync.WFX.ShowError(FsResult);
		}
	}
	return hr;
});

AddEvent("Context", function (Ctrl, hMenu, nPos, Selected, item, ContextMenu) {
	var lib = Sync.WFX.GetObject(Ctrl);
	if (lib) {
		var ar = [];
		if (!lib.X.FsDeleteFile) {
			ar.push("delete");
		}
		if (!lib.X.FsRenMovFile) {
			ar.push("rename");
		}
		if (ar.length) {
			RemoveCommand(hMenu, ContextMenu, ar.join(";"));
		}
	}
	return nPos;
});

AddEvent("Background", function (Ctrl, hMenu, nPos, Selected, item, ContextMenu) {
	var lib = Sync.WFX.GetObject(Ctrl);
	if (lib) {
		api.InsertMenu(hMenu, MAXINT, MF_BYPOSITION | MF_STRING, ++nPos, api.LoadString(hShell32, 33555));
		ExtraMenuCommand[nPos] = Sync.WFX.Properties;
	}
	return nPos;
});

AddEvent("Command", function (Ctrl, hwnd, msg, wParam, lParam) {
	var hr = Sync.WFX.Command(Ctrl, wParam & 0xfff);
	if (isFinite(hr)) {
		return hr;
	}
}, true);

AddEvent("InvokeCommand", function (ContextMenu, fMask, hwnd, Verb, Parameters, Directory, nShow, dwHotKey, hIcon) {
	var hr = Sync.WFX.Command(ContextMenu.FolderView, Verb, ContextMenu);
	if (isFinite(hr)) {
		return hr;
	}
}, true);

AddEvent("DefaultCommand", Sync.WFX.DefaultCommand, true);

AddEvent("ILGetParent", function (FolderItem) {
	var path = FolderItem.Path;
	var re = /^(\\{3})([^\\]*)(.*)/.exec(path);
	if (re) {
		if (!re[2]) {
			return ssfDESKTOP;
		}
		var lib = Sync.WFX.GetObject(path);
		if (lib) {
			return re[3] ? fso.BuildPath(lib.root, fso.GetParentFolderName(lib.path)) : re[1];
		}
	}
});

AddEvent("DragEnter", function (Ctrl, dataObj, grfKeyState, pt, pdwEffect) {
	if (Ctrl.Type <= CTRL_EB || Ctrl.Type == CTRL_DT) {
		if (Sync.WFX.IsHandle(Ctrl)) {
			return S_OK;
		}
	}
});

AddEvent("DragOver", function (Ctrl, dataObj, grfKeyState, pt, pdwEffect) {
	if (Ctrl.Type <= CTRL_EB || Ctrl.Type == CTRL_DT) {
		if (Sync.WFX.IsHandle(Ctrl)) {
			pdwEffect[0] = DROPEFFECT_COPY;
			return S_OK;
		}
	}
});

AddEvent("Drop", function (Ctrl, dataObj, grfKeyState, pt, pdwEffect) {
	if (Sync.WFX.IsHandle(Ctrl)) {
		Sync.WFX.Append(Ctrl, dataObj);
		return S_OK;
	}
});

AddEvent("DragLeave", function (Ctrl) {
	return S_OK;
});

AddEvent("AddonDisabled", function (Id) {
	if (Id.toLowerCase() == "wfx") {
		Sync.WFX.Finalize();
	}
});

AddEvent("BeforeNavigate", function (Ctrl, fs, wFlags, Prev) {
	if (Ctrl.Type <= CTRL_EB && Sync.WFX.IsHandle(Prev)) {
		var root = fso.BuildPath(fso.GetSpecialFolder(2).Path, api.sprintf(999, "tablacus\\%x", Ctrl.SessionId));
		DeleteItem(root);
	}
});

AddEvent("ViewCreated", function (Ctrl) {
	if (Sync.WFX.IsHandle(Ctrl)) {
		ColumnsReplace(Ctrl, "Name", HDF_LEFT, Sync.WFX.ReplaceColumns);
	}
});

AddEvent("BeginLabelEdit", function (Ctrl) {
	if (Ctrl.Type <= CTRL_EB) {
		var lib = Sync.WFX.GetObject(Ctrl, lib);
		if (lib && !lib.X.FsRenMovFile) {
			return 1;
		}
	}
});

AddEvent("EndLabelEdit", function (Ctrl, Name) {
	if (Ctrl.Type <= CTRL_EB && Name) {
		var lib = Sync.WFX.GetObject(Ctrl, lib);
		if (lib && lib.X.FsRenMovFile) {
			var Item = Ctrl.FocusedItem;
			if (Item) {
				Sync.WFX.SetName(Item, Name);
			}
			return 1;
		}
	}
}, true);

AddEvent("SetName", Sync.WFX.SetName);

AddEvent("CreateFolder", function (path) {
	var lib = Sync.WFX.GetObject(path);
	if (lib) {
		if (lib.X.FsMkDir && lib.X.FsMkDir(lib.path)) {
			Sync.WFX.ChangeNotify(fso.BuildPath(lib.root, fso.GetParentFolderName(lib.path)));
			return true;
		}
		MessageBox(api.LoadString(hShell32, 6461), TITLE, MB_ICONSTOP | MB_OK);
		return false;
	}
}, true);

AddEvent("CreateFile", function (path) {
	var lib = Sync.WFX.GetObject(path);
	if (lib) {
		if (lib.X.FsPutFile) {
			var sLocal = fso.BuildPath(fso.GetSpecialFolder(2).Path, api.sprintf(999, "tablacus\\n%x", Math.random() * MAXINT));
			fso.CreateTextFile(sLocal).Close();
			if (lib.X.FsPutFile(sLocal, lib.path, 0) == 0) {
				DeleteItem(sLocal);
				Sync.WFX.ChangeNotify(fso.BuildPath(lib.root, fso.GetParentFolderName(lib.path)));
				return true;
			}
			DeleteItem(sLocal);
		}
		MessageBox(api.LoadString(hShell32, 8728).replace(/%2!ls!/, lib.path).replace(/%1!ls!/, ""), TITLE, MB_ICONSTOP | MB_OK);
		return false;
	}
}, true);

AddEvent("SetFileTime", function (path, ctime, atime, mtime) {
	var lib = Sync.WFX.GetObjectEx(path);
	if (lib && lib.X.FsSetTime) {
		Sync.WFX.Connect(lib);
		if (lib.X.FsSetTime(fso.BuildPath(lib.path, lib.file), ctime, atime, mtime)) {
			Sync.WFX.ChangeNotify(fso.BuildPath(lib.root, lib.path));
			return true;
		}
		return false;
	}
}, true);

AddEvent("SetFileAttributes", function (path, attr) {
	var lib = Sync.WFX.GetObjectEx(path);
	if (lib && lib.X.FsSetAttr) {
		Sync.WFX.Connect(lib);
		if (lib.X.FsSetAttr(fso.BuildPath(lib.path, lib.file), attr)) {
			Sync.WFX.ChangeNotify(fso.BuildPath(lib.root, lib.path));
			return true;
		}
		return false;
	}
}, true);

AddEvent("ToolTip", function (Ctrl, Index) {
	if (Ctrl.Type <= CTRL_EB) {
		if (Sync.WFX.IsHandle(Ctrl)) {
			var Item = Ctrl.Items.Item(Index);
			if (Item.IsFolder) {
				var s = FormatDateTime(Item.ModifyDate);
				return s ? api.PSGetDisplayName("Write") + " : " + s : "";
			}
		}
	}
}, true);

AddEvent("GetIconImage", function (Ctrl, BGColor, bSimple) {
	if (g_.IEVer >= 8) {
		var lib = Sync.WFX.GetObject(Ctrl);
		if (lib) {
			if (lib.X.FsExtractCustomIcon) {
				var phIcon = [0];
				var r = lib.X.FsExtractCustomIcon(lib.path + "\\", 1, phIcon);
				if (r == 1 || r == 2) {
					var image = te.WICBitmap().FromHICON(phIcon[0], BGColor);
					if (r == 2) {
						api.DestroyIcon(phIcon[0]);
					}
					return image.DataURI("image/png");
				}
			}
			return MakeImgDataEx("folder:closed", bSimple, 16);
		}
	}
});

AddEvent("AddItems", function (Items, pid) {
	if (api.ILIsEqual(pid, ssfDRIVES)) {
		Items.AddItem("\\\\\\");
	}
});

AddEvent("SaveConfig", function () {
	if (Sync.WFX.bSave) {
		var ar = [];
		for (var i in Sync.WFX.pdb) {
			var db = Sync.WFX.pdb[i];
			for (j in db) {
				if (i && j && db[j]) {
					ar.push([i, j, db[j]].join("\t"));
				}
			}
		}
		try {
			var ado = api.CreateObject("ads");
			ado.Type = adTypeBinary;
			ado.Open();
			ado.Write(api.CryptProtectData(ar.join("\n"), Sync.WFX.MP));
			ado.SaveToFile(Sync.WFX.dbfile, adSaveCreateOverWrite);
			ado.Close();
			Sync.WFX.bSave = false;
		} catch (e) { }
	}
});

AddEvent("CloseView", Sync.WFX.CheckDisconnect);
AddEvent("ChangeView", Sync.WFX.CheckDisconnect);

AddEvent("ColumnClick", function (Ctrl, iItem) {
	if (Ctrl.Type <= CTRL_EB && !Sync.WFX.NoExSort) {
		if (Sync.WFX.IsHandle(Ctrl)) {
			var cColumns = api.CommandLineToArgv(Ctrl.Columns(1));
			var s = cColumns[iItem * 2];
			if (api.PathMatchSpec(s, "System.ItemNameDisplay;System.DateModified")) {
				var s1 = Ctrl.SortColumns;
				var s2 = 'prop:' + s + ';System.ItemTypeText;';
				var s3 = s2.replace(":", ":-");
				if (s1 != s2 && s1 != s3) {
					Ctrl.SortColumns = (s1 == s2) ? s3 : s2;
					return S_OK;
				}
			}
		}
	}
});

AddEvent("Sort", function (Ctrl) {
	if (Ctrl.Type <= CTRL_EB && !Sync.WFX.NoExSort) {
		if (Sync.WFX.IsHandle(Ctrl)) {
			var s1 = Ctrl.SortColumns;
			if (/^prop:\-?System\.ItemNameDisplay;$|^prop:\-?System\.DateModified;$/.test(s1)) {
				setTimeout(function () {
					Ctrl.SortColumns = s1 + 'System.ItemTypeText;';
				}, 99);
			}
		}
	}
});

var cFV = te.Ctrls(CTRL_FV);
for (var i in cFV) {
	if (Sync.WFX.IsHandle(cFV[i])) {
		ColumnsReplace(cFV[i], "Name", HDF_LEFT, Sync.WFX.ReplaceColumns);
	}
}
