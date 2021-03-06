var s = []
if (await MainWindow.Sync.LabelSQLiteOdbc) {
	s.push('<input type="button" value="Load" onclick="Addons.LabelSQLiteOdbc.Import()"><br><input type="button" value="Save" onclick="Addons.LabelSQLiteOdbc.Export()"><br><br>');
}
s.push('<input type="button" value="', await api.sprintf(999, await GetText("Get %s..."), "SQLite ODBC Driver"), '" title="http://www.ch-werner.de/sqliteodbc/" onclick="wsh.Run(this.title)">');
SetTabContents(0, "", s);

Addons.LabelSQLiteOdbc = {
	Import: async function () {
		var commdlg = await api.CreateObject("CommonDialog");
		commdlg.InitDir = BuildPath(await te.Data.DataFolder, "config")
		commdlg.Filter = await MakeCommDlgFilter("*.tsv");
		commdlg.Flags = OFN_FILEMUSTEXIST;
		if (await commdlg.ShowOpen()) {
			LoadDBFromTSV(MainWindow.Sync.LabelSQLiteOdbc.DB, commdlg.FileName);
		}
	},

	Export: async function () {
		var commdlg = await api.CreateObject("CommonDialog");
		commdlg.InitDir = BuildPath(await te.Data.DataFolder, "config")
		commdlg.Filter = await MakeCommDlgFilter("*.tsv");
		commdlg.DefExt = "tsv";
		commdlg.Flags = OFN_OVERWRITEPROMPT;
		if (await commdlg.ShowSave()) {
			SaveDBtoTSV(MainWindow.Sync.LabelSQLiteOdbc.DB, commdlg.FileName);
		}
		return;
	}
}
