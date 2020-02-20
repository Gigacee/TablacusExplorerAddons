// Tablacus GFL SDK Wrapper (C)2018 Gaku
// MIT Lisence
// Visual C++ 2010 Express Edition SP1
// Windows SDK v7.1
// https://tablacus.github.io/

#include "tgflsdk.h"

// Global Variables:
const TCHAR g_szProgid[] = TEXT("Tablacus.GFLSDK");
const TCHAR g_szClsid[] = TEXT("{04D5F147-2A06-4760-9120-7CAE154FBB21}");
HINSTANCE	g_hinstDll = NULL;
LONG		g_lLocks = 0;
CteBase		*g_pBase = NULL;
std::vector <CteWO *>	g_ppObject;

TEmethod methodBASE[] = {
	{ 0x60010000, L"Open" },
	{ 0x6001000C, L"Close" },
};

TEmethod methodWO[] = {
	{ 0x6001005C, L"gflGetErrorString" },
	{ 0x6001006C, L"gflGetVersion" },
	{ 0x60010074, L"gflLibraryExit" },
	{ 0x60010075, L"gflLibraryInit" },

	{ 0x60010077, L"gflLoadBitmap" },//W
	{ 0x6001107A, L"gflLoadBitmapFromHandle" },
	{ 0x60010082, L"gflLoadThumbnail" },//W
	{ 0x60011083, L"gflLoadThumbnailFromHandle" },

	{ 0x6001F000, L"IsUnicode" },
	{ 0x6001F001, L"GetImage" },
};

// Unit
VOID SafeRelease(PVOID ppObj)
{
	try {
		IUnknown **ppunk = static_cast<IUnknown **>(ppObj);
		if (*ppunk) {
			(*ppunk)->Release();
			*ppunk = NULL;
		}
	} catch (...) {}
}

VOID teGetProcAddress(HMODULE hModule, LPSTR lpName, FARPROC *lpfnA, FARPROC *lpfnW)
{
	*lpfnA = GetProcAddress(hModule, lpName);
	if (lpfnW) {
		char pszProcName[80];
		strcpy_s(pszProcName, 80, lpName);
		strcat_s(pszProcName, 80, "W");
		*lpfnW = GetProcAddress(hModule, (LPCSTR)pszProcName);
	} else if (lpfnW) {
		*lpfnW = NULL;
	}
}

void LockModule(BOOL bLock)
{
	if (bLock) {
		InterlockedIncrement(&g_lLocks);
	} else {
		InterlockedDecrement(&g_lLocks);
	}
}

HRESULT ShowRegError(LSTATUS ls)
{
	LPTSTR lpBuffer = NULL;
	FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM,
		NULL, ls, LANG_USER_DEFAULT, (LPTSTR)&lpBuffer, 0, NULL);
	MessageBox(NULL, lpBuffer, TEXT(PRODUCTNAME), MB_ICONHAND | MB_OK);
	LocalFree(lpBuffer);
	return HRESULT_FROM_WIN32(ls);
}

LSTATUS CreateRegistryKey(HKEY hKeyRoot, LPTSTR lpszKey, LPTSTR lpszValue, LPTSTR lpszData)
{
	HKEY  hKey;
	LSTATUS  lr;
	DWORD dwSize;

	lr = RegCreateKeyEx(hKeyRoot, lpszKey, 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL);
	if (lr == ERROR_SUCCESS) {
		if (lpszData != NULL) {
			dwSize = (lstrlen(lpszData) + 1) * sizeof(TCHAR);
		} else {
			dwSize = 0;
		}
		lr = RegSetValueEx(hKey, lpszValue, 0, REG_SZ, (LPBYTE)lpszData, dwSize);
		RegCloseKey(hKey);
	}
	return lr;
}

/*
int teBSearch(TEmethod *method, int nSize, int* pMap, LPOLESTR bs)
{
	int nMin = 0;
	int nMax = nSize - 1;
	int nIndex, nCC;

	while (nMin <= nMax) {
		nIndex = (nMin + nMax) / 2;
		nCC = lstrcmpi(bs, method[pMap[nIndex]].name);
		if (nCC < 0) {
			nMax = nIndex - 1;
			continue;
		}
		if (nCC > 0) {
			nMin = nIndex + 1;
			continue;
		}
		return pMap[nIndex];
	}
	return -1;
}
*/
HRESULT teGetDispId(TEmethod *method, int nCount, int* pMap, LPOLESTR bs, DISPID *rgDispId)
{
/*	if (pMap) {
		int nIndex = teBSearch(method, nCount, pMap, bs);
		if (nIndex >= 0) {
			*rgDispId = method[nIndex].id;
			return S_OK;
		}
	} else {*/
		for (int i = 0; method[i].name; i++) {
			if (lstrcmpi(bs, method[i].name) == 0) {
				*rgDispId = method[i].id;
				return S_OK;
			}
		}
//	}
	return DISP_E_UNKNOWNNAME;
}

BSTR GetLPWSTRFromVariant(VARIANT *pv)
{
	switch (pv->vt) {
		case VT_VARIANT | VT_BYREF:
			return GetLPWSTRFromVariant(pv->pvarVal);
		case VT_BSTR:
		case VT_LPWSTR:
			return pv->bstrVal;
		default:
			return NULL;
	}//end_switch
}

int GetIntFromVariant(VARIANT *pv)
{
	if (pv) {
		if (pv->vt == (VT_VARIANT | VT_BYREF)) {
			return GetIntFromVariant(pv->pvarVal);
		}
		if (pv->vt == VT_I4) {
			return pv->lVal;
		}
		if (pv->vt == VT_UI4) {
			return pv->ulVal;
		}
		if (pv->vt == VT_R8) {
			return (int)(LONGLONG)pv->dblVal;
		}
		VARIANT vo;
		VariantInit(&vo);
		if SUCCEEDED(VariantChangeType(&vo, pv, 0, VT_I4)) {
			return vo.lVal;
		}
		if SUCCEEDED(VariantChangeType(&vo, pv, 0, VT_UI4)) {
			return vo.ulVal;
		}
		if SUCCEEDED(VariantChangeType(&vo, pv, 0, VT_I8)) {
			return (int)vo.llVal;
		}
	}
	return 0;
}

int GetIntFromVariantClear(VARIANT *pv)
{
	int i = GetIntFromVariant(pv);
	VariantClear(pv);
	return i;
}

#ifdef _WIN64
LONGLONG GetLLFromVariant(VARIANT *pv)
{
	if (pv) {
		if (pv->vt == (VT_VARIANT | VT_BYREF)) {
			return GetLLFromVariant(pv->pvarVal);
		}
		if (pv->vt == VT_I4) {
			return pv->lVal;
		}
		if (pv->vt == VT_R8) {
			return (LONGLONG)pv->dblVal;
		}
		if (pv->vt == (VT_ARRAY | VT_I4)) {
			LONGLONG ll = 0;
			PVOID pvData;
			if (::SafeArrayAccessData(pv->parray, &pvData) == S_OK) {
				::CopyMemory(&ll, pvData, sizeof(LONGLONG));
				::SafeArrayUnaccessData(pv->parray);
				return ll;
			}
		}
		VARIANT vo;
		VariantInit(&vo);
		if SUCCEEDED(VariantChangeType(&vo, pv, 0, VT_I8)) {
			return vo.llVal;
		}
	}
	return 0;
}
#endif

VOID teSetBool(VARIANT *pv, BOOL b)
{
	if (pv) {
		pv->boolVal = b ? VARIANT_TRUE : VARIANT_FALSE;
		pv->vt = VT_BOOL;
	}
}

VOID teSysFreeString(BSTR *pbs)
{
	if (*pbs) {
		::SysFreeString(*pbs);
		*pbs = NULL;
	}
}

VOID teSetLong(VARIANT *pv, LONG i)
{
	if (pv) {
		pv->lVal = i;
		pv->vt = VT_I4;
	}
}

VOID teSetLL(VARIANT *pv, LONGLONG ll)
{
	if (pv) {
		pv->lVal = static_cast<int>(ll);
		if (ll == static_cast<LONGLONG>(pv->lVal)) {
			pv->vt = VT_I4;
			return;
		}
		pv->dblVal = static_cast<DOUBLE>(ll);
		if (ll == static_cast<LONGLONG>(pv->dblVal)) {
			pv->vt = VT_R8;
			return;
		}
		SAFEARRAY *psa;
		psa = SafeArrayCreateVector(VT_I4, 0, sizeof(LONGLONG) / sizeof(int));
		if (psa) {
			PVOID pvData;
			if (::SafeArrayAccessData(psa, &pvData) == S_OK) {
				::CopyMemory(pvData, &ll, sizeof(LONGLONG));
				::SafeArrayUnaccessData(psa);
				pv->vt = VT_ARRAY | VT_I4;
				pv->parray = psa;
			}
		}
	}
}

BOOL teSetObject(VARIANT *pv, PVOID pObj)
{
	if (pObj) {
		try {
			IUnknown *punk = static_cast<IUnknown *>(pObj);
			if SUCCEEDED(punk->QueryInterface(IID_PPV_ARGS(&pv->pdispVal))) {
				pv->vt = VT_DISPATCH;
				return true;
			}
			if SUCCEEDED(punk->QueryInterface(IID_PPV_ARGS(&pv->punkVal))) {
				pv->vt = VT_UNKNOWN;
				return true;
			}
		} catch (...) {}
	}
	return false;
}

BOOL teSetObjectRelease(VARIANT *pv, PVOID pObj)
{
	if (pObj) {
		try {
			IUnknown *punk = static_cast<IUnknown *>(pObj);
			if (pv) {
				if SUCCEEDED(punk->QueryInterface(IID_PPV_ARGS(&pv->pdispVal))) {
					pv->vt = VT_DISPATCH;
					SafeRelease(&punk);
					return true;
				}
				if SUCCEEDED(punk->QueryInterface(IID_PPV_ARGS(&pv->punkVal))) {
					pv->vt = VT_UNKNOWN;
					SafeRelease(&punk);
					return true;
				}
			}
			SafeRelease(&punk);
		} catch (...) {}
	}
	return false;
}

VOID teSetSZA(VARIANT *pv, LPCSTR lpstr, int nCP)
{
	if (pv) {
		int nLenW = MultiByteToWideChar(nCP, 0, lpstr, -1, NULL, NULL);
		if (nLenW) {
			pv->bstrVal = ::SysAllocStringLen(NULL, nLenW - 1);
			pv->bstrVal[0] = NULL;
			MultiByteToWideChar(nCP, 0, (LPCSTR)lpstr, -1, pv->bstrVal, nLenW);
		} else {
			pv->bstrVal = NULL;
		}
		pv->vt = VT_BSTR;
	}
}

VOID teSetSZ(VARIANT *pv, LPCWSTR lpstr)
{
	if (pv) {
		pv->bstrVal = ::SysAllocString(lpstr);
		pv->vt = VT_BSTR;
	}
}

VOID teSetBSTR(VARIANT *pv, BSTR bs, int nLen)
{
	if (pv) {
		pv->vt = VT_BSTR;
		if (bs) {
			if (nLen < 0) {
				nLen = lstrlen(bs);
			}
			if (::SysStringLen(bs) == nLen) {
				pv->bstrVal = bs;
				return;
			}
		}
		pv->bstrVal = SysAllocStringLen(bs, nLen);
		teSysFreeString(&bs);
	}
}

BOOL FindUnknown(VARIANT *pv, IUnknown **ppunk)
{
	if (pv) {
		if (pv->vt == VT_DISPATCH || pv->vt == VT_UNKNOWN) {
			*ppunk = pv->punkVal;
			return *ppunk != NULL;
		}
		if (pv->vt == (VT_VARIANT | VT_BYREF)) {
			return FindUnknown(pv->pvarVal, ppunk);
		}
		if (pv->vt == (VT_DISPATCH | VT_BYREF) || pv->vt == (VT_UNKNOWN | VT_BYREF)) {
			*ppunk = *pv->ppunkVal;
			return *ppunk != NULL;
		}
	}
	*ppunk = NULL;
	return false;
}

BSTR GetMemoryFromVariant(VARIANT *pv, BOOL *pbDelete, LONG_PTR *pLen)
{
	if (pv->vt == (VT_VARIANT | VT_BYREF)) {
		return GetMemoryFromVariant(pv->pvarVal, pbDelete, pLen);
	}
	BSTR pMemory = NULL;
	*pbDelete = FALSE;
	if (pLen) {
		if (pv->vt == VT_BSTR || pv->vt == VT_LPWSTR) {
			return pv->bstrVal;
		}
	}
	IUnknown *punk;
	if (FindUnknown(pv, &punk)) {
		IStream *pStream;
		if SUCCEEDED(punk->QueryInterface(IID_PPV_ARGS(&pStream))) {
			ULARGE_INTEGER uliSize;
			if (pLen) {
				LARGE_INTEGER liOffset;
				liOffset.QuadPart = 0;
				pStream->Seek(liOffset, STREAM_SEEK_END, &uliSize);
				pStream->Seek(liOffset, STREAM_SEEK_SET, NULL);
			} else {
				uliSize.QuadPart = 2048;
			}
			pMemory = ::SysAllocStringByteLen(NULL, uliSize.LowPart > 2048 ? uliSize.LowPart : 2048);
			if (pMemory) {
				if (uliSize.LowPart < 2048) {
					::ZeroMemory(pMemory, 2048);
				}
				*pbDelete = TRUE;
				ULONG cbRead;
				pStream->Read(pMemory, uliSize.LowPart, &cbRead);
				if (pLen) {
					*pLen = cbRead;
				}
			}
			pStream->Release();
		}
	} else if (pv->vt == (VT_ARRAY | VT_I1) || pv->vt == (VT_ARRAY | VT_UI1) || pv->vt == (VT_ARRAY | VT_I1 | VT_BYREF) || pv->vt == (VT_ARRAY | VT_UI1 | VT_BYREF)) {
		LONG lUBound, lLBound, nSize;
		SAFEARRAY *psa = (pv->vt & VT_BYREF) ? pv->pparray[0] : pv->parray;
		PVOID pvData;
		if (::SafeArrayAccessData(psa, &pvData) == S_OK) {
			SafeArrayGetUBound(psa, 1, &lUBound);
			SafeArrayGetLBound(psa, 1, &lLBound);
			nSize = lUBound - lLBound + 1;
			pMemory = ::SysAllocStringByteLen(NULL, nSize > 2048 ? nSize : 2048);
			if (pMemory) {
				if (nSize < 2048) {
					::ZeroMemory(pMemory, 2048);
				}
				::CopyMemory(pMemory, pvData, nSize);
				if (pLen) {
					*pLen = nSize;
				}
				*pbDelete = TRUE;
			}
			::SafeArrayUnaccessData(psa);
		}
		return pMemory;
	} else if (!pLen) {
		return (BSTR)GetPtrFromVariant(pv);
	}
	return pMemory;
}

HRESULT tePutProperty0(IUnknown *punk, LPOLESTR sz, VARIANT *pv, DWORD grfdex)
{
	HRESULT hr = E_FAIL;
	DISPID dispid, putid;
	DISPPARAMS dispparams;
	IDispatchEx *pdex;
	if SUCCEEDED(punk->QueryInterface(IID_PPV_ARGS(&pdex))) {
		BSTR bs = ::SysAllocString(sz);
		hr = pdex->GetDispID(bs, grfdex, &dispid);
		if SUCCEEDED(hr) {
			putid = DISPID_PROPERTYPUT;
			dispparams.rgvarg = pv;
			dispparams.rgdispidNamedArgs = &putid;
			dispparams.cArgs = 1;
			dispparams.cNamedArgs = 1;
			hr = pdex->InvokeEx(dispid, LOCALE_USER_DEFAULT, DISPATCH_PROPERTYPUTREF, &dispparams, NULL, NULL, NULL);
		}
		::SysFreeString(bs);
		SafeRelease(&pdex);
	}
	return hr;
}

HRESULT tePutProperty(IUnknown *punk, LPOLESTR sz, VARIANT *pv)
{
	return tePutProperty0(punk, sz, pv, fdexNameEnsure);
}

// VARIANT Clean-up of an array
VOID teClearVariantArgs(int nArgs, VARIANTARG *pvArgs)
{
	if (pvArgs && nArgs > 0) {
		for (int i = nArgs ; i-- >  0;){
			VariantClear(&pvArgs[i]);
		}
		delete[] pvArgs;
		pvArgs = NULL;
	}
}

HRESULT Invoke5(IDispatch *pdisp, DISPID dispid, WORD wFlags, VARIANT *pvResult, int nArgs, VARIANTARG *pvArgs)
{
	HRESULT hr;
	// DISPPARAMS
	DISPPARAMS dispParams;
	dispParams.rgvarg = pvArgs;
	dispParams.cArgs = abs(nArgs);
	DISPID dispidName = DISPID_PROPERTYPUT;
	if (wFlags & DISPATCH_PROPERTYPUT) {
		dispParams.cNamedArgs = 1;
		dispParams.rgdispidNamedArgs = &dispidName;
	} else {
		dispParams.rgdispidNamedArgs = NULL;
		dispParams.cNamedArgs = 0;
	}
	try {
		hr = pdisp->Invoke(dispid, IID_NULL, LOCALE_USER_DEFAULT,
			wFlags, &dispParams, pvResult, NULL, NULL);
	} catch (...) {
		hr = E_FAIL;
	}
	teClearVariantArgs(nArgs, pvArgs);
	return hr;
}

HRESULT Invoke4(IDispatch *pdisp, VARIANT *pvResult, int nArgs, VARIANTARG *pvArgs)
{
	return Invoke5(pdisp, DISPID_VALUE, DISPATCH_METHOD, pvResult, nArgs, pvArgs);
}

VARIANTARG* GetNewVARIANT(int n)
{
	VARIANT *pv = new VARIANTARG[n];
	while (n--) {
		VariantInit(&pv[n]);
	}
	return pv;
}

BOOL GetDispatch(VARIANT *pv, IDispatch **ppdisp)
{
	IUnknown *punk;
	if (FindUnknown(pv, &punk)) {
		return SUCCEEDED(punk->QueryInterface(IID_PPV_ARGS(ppdisp)));
	}
	return FALSE;
}

HRESULT teGetProperty(IDispatch *pdisp, LPOLESTR sz, VARIANT *pv)
{
	DISPID dispid;
	HRESULT hr = pdisp->GetIDsOfNames(IID_NULL, &sz, 1, LOCALE_USER_DEFAULT, &dispid);
	if (hr == S_OK) {
		hr = Invoke5(pdisp, dispid, DISPATCH_PROPERTYGET, pv, 0, NULL);
	}
	return hr;
}

VOID teVariantChangeType(__out VARIANTARG * pvargDest,
				__in const VARIANTARG * pvarSrc, __in VARTYPE vt)
{
	VariantInit(pvargDest);
	if FAILED(VariantChangeType(pvargDest, pvarSrc, 0, vt)) {
		pvargDest->llVal = 0;
	}
}

LPSTR teWide2Ansi(LPWSTR lpW, int nLenW, int nCP)
{
	int nLenA = WideCharToMultiByte(nCP, 0, (LPCWSTR)lpW, nLenW, NULL, 0, NULL, NULL);
	BSTR bs = ::SysAllocStringByteLen(NULL, nLenA);
	WideCharToMultiByte(nCP, 0, (LPCWSTR)lpW, nLenW, (LPSTR)bs, nLenA, NULL, NULL);
	return (LPSTR)bs;
}

VOID teFreeAnsiString(LPSTR *lplpA)
{
	::SysFreeString((BSTR)*lplpA);
	*lplpA = NULL;
}

// Callbacks

GFL_UINT32 GFLAPI teReadStream(GFL_HANDLE handle, void* buffer, GFL_UINT32 size)
{
	try {
		IStream *pStream = (IStream *)handle;
		ULONG cbRead = 0;
		pStream->Read(buffer, size, &cbRead);
		return cbRead;
	} catch (...) {}
	return 0;
}

GFL_UINT32 GFLAPI teTellStream(GFL_HANDLE handle)
{
	try {
		IStream *pStream = (IStream *)handle;
		ULARGE_INTEGER uliPos;
		LARGE_INTEGER liOffset;
		liOffset.QuadPart = 0;
		pStream->Seek(liOffset, STREAM_SEEK_CUR, &uliPos);
		return uliPos.LowPart;
	} catch (...) {}
	return 0;
}

GFL_UINT32 GFLAPI teSeekStream(GFL_HANDLE handle, GFL_INT32 offset, GFL_INT32 origin)
{
	try {
		IStream *pStream = (IStream *)handle;
		ULARGE_INTEGER uliPos;
		LARGE_INTEGER liOffset;
		liOffset.QuadPart = offset;
		return pStream->Seek(liOffset, origin, &uliPos);
	} catch (...) {}
	return 0;
}

// Initialize & Finalize
BOOL WINAPI DllMain(HINSTANCE hinstDll, DWORD dwReason, LPVOID lpReserved)
{
	switch (dwReason) {
		case DLL_PROCESS_ATTACH:
			g_ppObject.clear();
			g_pBase = new CteBase();
			g_hinstDll = hinstDll;
			break;
		case DLL_PROCESS_DETACH:
			for (int i = g_ppObject.size(); i--;) {
				g_ppObject[i]->Close();
				SafeRelease(&g_ppObject[i]);
			}
			g_ppObject.clear();
			SafeRelease(&g_pBase);
			break;
	}
	return TRUE;
}

// DLL Export

STDAPI DllCanUnloadNow(void)
{
	return g_lLocks == 0 ? S_OK : S_FALSE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, LPVOID *ppv)
{
	static CteClassFactory serverFactory;
	CLSID clsid;
	HRESULT hr = CLASS_E_CLASSNOTAVAILABLE;

	*ppv = NULL;
	CLSIDFromString(g_szClsid, &clsid);
	if (IsEqualCLSID(rclsid, clsid)) {
		hr = serverFactory.QueryInterface(riid, ppv);
	}
	return hr;
}

STDAPI DllRegisterServer(void)
{
	TCHAR szModulePath[MAX_PATH];
	TCHAR szKey[256];

	wsprintf(szKey, TEXT("CLSID\\%s"), g_szClsid);
	LSTATUS lr = CreateRegistryKey(HKEY_CLASSES_ROOT, szKey, NULL, const_cast<LPTSTR>(g_szProgid));
	if (lr != ERROR_SUCCESS) {
		return ShowRegError(lr);
	}
	GetModuleFileName(g_hinstDll, szModulePath, sizeof(szModulePath) / sizeof(TCHAR));
	wsprintf(szKey, TEXT("CLSID\\%s\\InprocServer32"), g_szClsid);
	lr = CreateRegistryKey(HKEY_CLASSES_ROOT, szKey, NULL, szModulePath);
	if (lr != ERROR_SUCCESS) {
		return ShowRegError(lr);
	}
	lr = CreateRegistryKey(HKEY_CLASSES_ROOT, szKey, TEXT("ThreadingModel"), TEXT("Apartment"));
	if (lr != ERROR_SUCCESS) {
		return ShowRegError(lr);
	}
	wsprintf(szKey, TEXT("CLSID\\%s\\ProgID"), g_szClsid);
	lr = CreateRegistryKey(HKEY_CLASSES_ROOT, szKey, NULL, const_cast<LPTSTR>(g_szProgid));
	if (lr != ERROR_SUCCESS) {
		return ShowRegError(lr);
	}
	lr = CreateRegistryKey(HKEY_CLASSES_ROOT, const_cast<LPTSTR>(g_szProgid), NULL, TEXT(PRODUCTNAME));
	if (lr != ERROR_SUCCESS) {
		return ShowRegError(lr);
	}
	wsprintf(szKey, TEXT("%s\\CLSID"), g_szProgid);
	lr = CreateRegistryKey(HKEY_CLASSES_ROOT, szKey, NULL, const_cast<LPTSTR>(g_szClsid));
	if (lr != ERROR_SUCCESS) {
		return ShowRegError(lr);
	}
	return S_OK;
}

STDAPI DllUnregisterServer(void)
{
	TCHAR szKey[64];
	wsprintf(szKey, TEXT("CLSID\\%s"), g_szClsid);
	LSTATUS ls = SHDeleteKey(HKEY_CLASSES_ROOT, szKey);
	if (ls == ERROR_SUCCESS) {
		ls = SHDeleteKey(HKEY_CLASSES_ROOT, g_szProgid);
		if (ls == ERROR_SUCCESS) {
			return S_OK;
		}
	}
	return ShowRegError(ls);
}

GFL_ERROR tegflConvertBitmapIntoDDB(GFL_BITMAP *gflBM, HBITMAP *phBM)
{
	BITMAPINFO bmi;
	::ZeroMemory(&bmi.bmiHeader, sizeof(BITMAPINFOHEADER));
	bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
	bmi.bmiHeader.biWidth = gflBM->Width;
	bmi.bmiHeader.biHeight = -gflBM->Height;
	bmi.bmiHeader.biPlanes = 1;
	bmi.bmiHeader.biBitCount = gflBM->ComponentsPerPixel * gflBM->BitsPerComponent;
	*phBM = CreateDIBSection(NULL, &bmi, DIB_RGB_COLORS, NULL, NULL, 0);
	if (*phBM) {
		SetDIBits(NULL, *phBM, 0, gflBM->Height, gflBM->Data, &bmi, DIB_RGB_COLORS);
		return GFL_NO_ERROR;
	}
	return GFL_ERROR_NO_MEMORY;
}

//GetImage
HRESULT WINAPI GetImage(IStream *pStream, LPWSTR lpfn, int cx, HBITMAP *phBM, int *pnAlpha)
{
	CteWO *pWO = g_ppObject[0];
	GFL_ERROR iResult = GFL_UNKNOWN_ERROR;
	GFL_LOAD_PARAMS params;
	GFL_BITMAP *gflBM = new GFL_BITMAP();

	if (cx && pWO->m_gflLoadThumbnailFromHandle) {
		pWO->m_gflGetDefaultThumbnailParams(&params);
		params.Flags = GFL_LOAD_PREVIEW_NO_CANVAS_RESIZE | GFL_LOAD_HIGH_QUALITY_THUMBNAIL;
		params.ColorModel = GFL_BGRA;
		params.Callbacks.Read = teReadStream;
		params.Callbacks.Seek = teSeekStream;
		params.Callbacks.Tell = teTellStream;
		iResult = pWO->m_gflLoadThumbnailFromHandle((GFL_HANDLE)pStream, cx, cx, &gflBM, &params, NULL);
	} else {
		pWO->m_gflGetDefaultLoadParams(&params);
		params.ColorModel = GFL_BGRA;
		params.Callbacks.Read = teReadStream;
		params.Callbacks.Seek = teSeekStream;
		params.Callbacks.Tell = teTellStream;
		iResult = pWO->m_gflLoadBitmapFromHandle((GFL_HANDLE)pStream, &gflBM, &params, NULL);
	}
	if (iResult != GFL_NO_ERROR) {
		if (cx && (pWO->m_gflLoadThumbnailW || pWO->m_gflLoadThumbnail)) {
			pWO->m_gflGetDefaultThumbnailParams(&params);
			params.Flags = GFL_LOAD_PREVIEW_NO_CANVAS_RESIZE | GFL_LOAD_HIGH_QUALITY_THUMBNAIL;
			params.ColorModel = GFL_BGRA;
			if (pWO->m_gflLoadThumbnailW) {
				iResult = pWO->m_gflLoadThumbnailW(lpfn, cx, cx, &gflBM, &params, NULL);
			} else if (pWO->m_gflLoadThumbnail) {
				LPSTR lpAnsi = teWide2Ansi(lpfn, -1, CP_ACP);
				iResult = pWO->m_gflLoadThumbnail(lpAnsi, cx, cx, &gflBM, &params, NULL);
				teFreeAnsiString(&lpAnsi);
			}
		} else if (pWO->m_gflLoadBitmapW || pWO->m_gflLoadBitmap) {
			pWO->m_gflGetDefaultLoadParams(&params);
			params.ColorModel = GFL_BGRA;
			if (pWO->m_gflLoadBitmapW) {
				iResult = pWO->m_gflLoadBitmapW(lpfn, &gflBM, &params, NULL);
			} else if (pWO->m_gflLoadBitmap) {
				LPSTR lpAnsi = teWide2Ansi(lpfn, -1, CP_ACP);
				iResult = pWO->m_gflLoadBitmap(lpAnsi, &gflBM, &params, NULL);
				teFreeAnsiString(&lpAnsi);
			}
		}
	}
	if (iResult != GFL_NO_ERROR) {
		pWO->m_gflGetDefaultLoadParams(&params);
		params.ColorModel = GFL_BGRA;
		params.Callbacks.Read = teReadStream;
		params.Callbacks.Seek = teSeekStream;
		params.Callbacks.Tell = teTellStream;
		iResult = pWO->m_gflLoadBitmapFromHandle((GFL_HANDLE)pStream, &gflBM, &params, NULL);
	}
	if (iResult == GFL_NO_ERROR) {
		tegflConvertBitmapIntoDDB(gflBM, phBM);
		*pnAlpha = gflBM->ComponentsPerPixel >= 4 ? 0 : 2;
		pWO->m_gflFreeBitmap(gflBM);
	}
	return iResult == GFL_NO_ERROR ? S_OK : E_NOTIMPL;
}

//CteWO

CteWO::CteWO(LPWSTR lpLib)
{
	m_cRef = 1;
	m_bsLib = NULL;

	m_gflFreeBitmap = NULL;
	m_gflGetDefaultLoadParams = NULL;
	m_gflGetDefaultThumbnailParams = NULL;
	m_gflGetErrorString = NULL;
	m_gflGetVersion = NULL;
	m_gflLibraryExit = NULL;
	m_gflLibraryInit = NULL;
	m_gflLoadBitmap = NULL;
	m_gflLoadBitmapW = NULL;
	m_gflLoadThumbnail = NULL;
	m_gflLoadThumbnailW = NULL;

	m_hDll = LoadLibrary(lpLib);
	if (m_hDll) {
		m_bsLib = ::SysAllocString(lpLib);
		teGetProcAddress(m_hDll, "gflFreeBitmap", (FARPROC *)&m_gflFreeBitmap, NULL);
		teGetProcAddress(m_hDll, "gflGetDefaultLoadParams", (FARPROC *)&m_gflGetDefaultLoadParams, NULL);
		teGetProcAddress(m_hDll, "gflGetDefaultThumbnailParams", (FARPROC *)&m_gflGetDefaultThumbnailParams, NULL);
		teGetProcAddress(m_hDll, "gflGetErrorString", (FARPROC *)&m_gflGetErrorString, NULL);
		teGetProcAddress(m_hDll, "gflGetVersion", (FARPROC *)&m_gflGetVersion, NULL);
		teGetProcAddress(m_hDll, "gflLibraryExit", (FARPROC *)&m_gflLibraryExit, NULL);
		teGetProcAddress(m_hDll, "gflLibraryInit", (FARPROC *)&m_gflLibraryInit, NULL);
		teGetProcAddress(m_hDll, "gflLoadBitmap", (FARPROC *)&m_gflLoadBitmap, (FARPROC *)&m_gflLoadBitmapW);
		teGetProcAddress(m_hDll, "gflLoadThumbnail", (FARPROC *)&m_gflLoadThumbnail, (FARPROC *)&m_gflLoadThumbnailW);
		teGetProcAddress(m_hDll, "gflLoadBitmapFromHandle", (FARPROC *)&m_gflLoadBitmapFromHandle, NULL);
		teGetProcAddress(m_hDll, "gflLoadThumbnailFromHandle", (FARPROC *)&m_gflLoadThumbnailFromHandle, NULL);
	}
}

CteWO::~CteWO()
{
	Close();

	for (int i = g_ppObject.size(); i--;) {
		if (this == g_ppObject[i]) {
			g_ppObject.erase(g_ppObject.begin() + i);
 			break;
		}
	}
}

VOID CteWO::Close()
{
	if (m_hDll) {
		FreeLibrary(m_hDll);
		m_hDll = NULL;
	}
	m_gflFreeBitmap = NULL;
	m_gflGetDefaultLoadParams = NULL;
	m_gflGetErrorString = NULL;
	m_gflGetVersion = NULL;
	m_gflLibraryExit = NULL;
	m_gflLibraryInit = NULL;
	m_gflLoadBitmap = NULL;
	m_gflLoadBitmapW = NULL;
	m_gflLoadThumbnail = NULL;
	m_gflLoadThumbnailW = NULL;
}

VOID CteWO::SetBitmapToObject(IUnknown *punk, GFL_BITMAP *gflBM, GFL_ERROR iResult)
{
	if (iResult == 0) {
		HBITMAP hbm;
		if (tegflConvertBitmapIntoDDB(gflBM, &hbm) == GFL_NO_ERROR) {
			VARIANT v;
			teSetPtr(&v, hbm);
			tePutProperty(punk, L"0", &v);
			VariantClear(&v);
		}
		m_gflFreeBitmap(gflBM);
	}
}

STDMETHODIMP CteWO::QueryInterface(REFIID riid, void **ppvObject)
{
	static const QITAB qit[] =
	{
		QITABENT(CteWO, IDispatch),
		{ 0 },
	};
	return QISearch(this, qit, riid, ppvObject);
}

STDMETHODIMP_(ULONG) CteWO::AddRef()
{
	return ::InterlockedIncrement(&m_cRef);
}

STDMETHODIMP_(ULONG) CteWO::Release()
{
	if (::InterlockedDecrement(&m_cRef) == 0) {
		delete this;
		return 0;
	}
	return m_cRef;
}

STDMETHODIMP CteWO::GetTypeInfoCount(UINT *pctinfo)
{
	*pctinfo = 0;
	return S_OK;
}

STDMETHODIMP CteWO::GetTypeInfo(UINT iTInfo, LCID lcid, ITypeInfo **ppTInfo)
{
	return E_NOTIMPL;
}

STDMETHODIMP CteWO::GetIDsOfNames(REFIID riid, LPOLESTR *rgszNames, UINT cNames, LCID lcid, DISPID *rgDispId)
{
	return teGetDispId(methodWO, _countof(methodWO), NULL, *rgszNames, rgDispId);
}

STDMETHODIMP CteWO::Invoke(DISPID dispIdMember, REFIID riid, LCID lcid, WORD wFlags, DISPPARAMS *pDispParams, VARIANT *pVarResult, EXCEPINFO *pExcepInfo, UINT *puArgErr)
{
	GFL_ERROR iResult = -1;
	int nArg = pDispParams ? pDispParams->cArgs - 1 : -1;
	try {
		switch (dispIdMember) {
			//gflGetErrorString
			case 0x6001005C:
				if (nArg >= 0 && m_gflGetErrorString) {
					teSetSZA(pVarResult, m_gflGetErrorString(GetIntFromVariant(&pDispParams->rgvarg[nArg])), CP_ACP);
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, m_gflGetErrorString != NULL);
				}
				return S_OK;
			//gflGetVersion
			case 0x6001006C:
				if (wFlags & DISPATCH_METHOD && m_gflGetVersion) {
					teSetSZA(pVarResult, m_gflGetVersion(), CP_ACP);
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, m_gflGetVersion != NULL);
				}
				return S_OK;
			//gflLibraryExit
			case 0x60010074:
				if (wFlags & DISPATCH_METHOD && m_gflLibraryExit) {
					m_gflLibraryExit();
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, m_gflLibraryExit != NULL);
				}
				return S_OK;
			//gflLibraryInit
			case 0x60010075:
				if (wFlags & DISPATCH_METHOD && m_gflLibraryInit) {
					teSetLong(pVarResult, m_gflLibraryInit());
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, m_gflLibraryInit != NULL);
				}
				return S_OK;
			//gflLoadBitmap
			case 0x60010077:
				if (wFlags & DISPATCH_METHOD) {
					if (nArg >= 1 && (m_gflLoadBitmapW || m_gflLoadBitmap) && m_gflGetDefaultLoadParams && m_gflFreeBitmap) {
						IUnknown *punk;
						if (FindUnknown(&pDispParams->rgvarg[nArg - 1], &punk)) {
							GFL_BITMAP *gflBM = new GFL_BITMAP();
							GFL_LOAD_PARAMS params;
							m_gflGetDefaultLoadParams(&params);
							params.ColorModel = GFL_BGRA;
							if (m_gflLoadBitmapW) {
								LPWSTR kpPath = GetLPWSTRFromVariant(&pDispParams->rgvarg[nArg]);
								iResult = m_gflLoadBitmapW(GetLPWSTRFromVariant(&pDispParams->rgvarg[nArg]), &gflBM, &params, NULL);
							} else {
								LPSTR lpFile = teWide2Ansi(GetLPWSTRFromVariant(&pDispParams->rgvarg[nArg]), -1, CP_ACP);
								iResult = m_gflLoadBitmap(lpFile, &gflBM, &params, NULL);
								teFreeAnsiString(&lpFile);
							}
							SetBitmapToObject(punk, gflBM, iResult);
						}
						teSetLong(pVarResult, iResult);
					}
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, (m_gflLoadBitmapW || m_gflLoadBitmap) && m_gflGetDefaultLoadParams && m_gflFreeBitmap);
				}
				return S_OK;
			//gflLoadThumbnail
			case 0x60010082:
				if (wFlags & DISPATCH_METHOD) {
					if (nArg >= 3 && (m_gflLoadThumbnailW || m_gflLoadThumbnail) && m_gflGetDefaultThumbnailParams && m_gflFreeBitmap) {
						IUnknown *punk;
						if (FindUnknown(&pDispParams->rgvarg[nArg - 3], &punk)) {
							GFL_BITMAP *gflBM = new GFL_BITMAP();
							GFL_LOAD_PARAMS params;
							m_gflGetDefaultThumbnailParams(&params);
							params.Flags = GFL_LOAD_PREVIEW_NO_CANVAS_RESIZE | GFL_LOAD_HIGH_QUALITY_THUMBNAIL;
							params.ColorModel = GFL_BGRA;
							if (m_gflLoadBitmapW) {
								iResult = m_gflLoadThumbnailW(GetLPWSTRFromVariant(&pDispParams->rgvarg[nArg]), GetIntFromVariant(&pDispParams->rgvarg[nArg - 1]), GetIntFromVariant(&pDispParams->rgvarg[nArg - 2]), &gflBM, &params, NULL);
							} else {
								LPSTR lpFile = teWide2Ansi(GetLPWSTRFromVariant(&pDispParams->rgvarg[nArg]), -1, CP_ACP);
								iResult = m_gflLoadThumbnail(lpFile, GetIntFromVariant(&pDispParams->rgvarg[nArg - 1]), GetIntFromVariant(&pDispParams->rgvarg[nArg - 2]), &gflBM, &params, NULL);
								teFreeAnsiString(&lpFile);
							}
							SetBitmapToObject(punk, gflBM, iResult);
						}
						teSetLong(pVarResult, iResult);
					}
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, (m_gflLoadThumbnailW || m_gflLoadThumbnail) && m_gflGetDefaultThumbnailParams && m_gflFreeBitmap);
				}
				return S_OK;
			//gflLoadBitmapFromHandle
			case 0x6001107A:
				if (wFlags & DISPATCH_METHOD) {
					if (nArg >= 1 && m_gflLoadBitmapFromHandle && m_gflGetDefaultLoadParams && m_gflFreeBitmap) {
						IUnknown *punk, *punkStream;
						if (FindUnknown(&pDispParams->rgvarg[nArg], &punkStream) && FindUnknown(&pDispParams->rgvarg[nArg - 1], &punk)) {
							IStream *pStream;
							if SUCCEEDED(punkStream->QueryInterface(IID_PPV_ARGS(&pStream))) {
								GFL_BITMAP *gflBM = new GFL_BITMAP();
								GFL_LOAD_PARAMS params;
								m_gflGetDefaultLoadParams(&params);
								params.ColorModel = GFL_BGRA;
								params.Callbacks.Read = teReadStream;
								params.Callbacks.Seek = teSeekStream;
								params.Callbacks.Tell = teTellStream;
								iResult = m_gflLoadBitmapFromHandle((GFL_HANDLE)pStream, &gflBM, &params, NULL);
								SetBitmapToObject(punk, gflBM, iResult);
								teSetLong(pVarResult, iResult);
								pStream->Release();
							}
						}				
					}				
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, m_gflLoadBitmapFromHandle && m_gflGetDefaultLoadParams);
				}
				return S_OK;
			//gflLoadThumbnailFromHandle
			case 0x60011083:
				if (wFlags & DISPATCH_METHOD) {
					if (nArg >= 3 && m_gflLoadThumbnailFromHandle && m_gflGetDefaultThumbnailParams && m_gflFreeBitmap) {
						IUnknown *punk, *punkStream;
						if (FindUnknown(&pDispParams->rgvarg[nArg], &punkStream) && FindUnknown(&pDispParams->rgvarg[nArg - 3], &punk)) {
							IStream *pStream;
							if SUCCEEDED(punkStream->QueryInterface(IID_PPV_ARGS(&pStream))) {
								GFL_BITMAP *gflBM = new GFL_BITMAP();
								GFL_LOAD_PARAMS params;
								m_gflGetDefaultThumbnailParams(&params);
								params.Flags = GFL_LOAD_PREVIEW_NO_CANVAS_RESIZE | GFL_LOAD_HIGH_QUALITY_THUMBNAIL;
								params.ColorModel = GFL_BGRA;
								params.Callbacks.Read = teReadStream;
								params.Callbacks.Seek = teSeekStream;
								params.Callbacks.Tell = teTellStream;
								iResult = m_gflLoadThumbnailFromHandle((GFL_HANDLE)pStream, GetIntFromVariant(&pDispParams->rgvarg[nArg - 1]), GetIntFromVariant(&pDispParams->rgvarg[nArg - 2]), &gflBM, &params, NULL);
								SetBitmapToObject(punk, gflBM, iResult);
								teSetLong(pVarResult, iResult);
								pStream->Release();
							}
						}				
					}				
				} else if (wFlags == DISPATCH_PROPERTYGET) {
					teSetBool(pVarResult, m_gflLoadBitmapFromHandle && m_gflGetDefaultLoadParams);
				}
				return S_OK;
			//IsUnicode
			case 0x6001F000:
				teSetBool(pVarResult, m_gflLoadBitmapW != NULL);
				return S_OK;
			//GetImage
			case 0x6001F001:
				if (m_gflLoadThumbnailFromHandle) {
					teSetPtr(pVarResult, &GetImage);
				}
				return S_OK;
			//this
			case DISPID_VALUE:
				if (pVarResult) {
					teSetObject(pVarResult, this);
				}
				return S_OK;
		}//end_switch
	} catch (...) {
		return DISP_E_EXCEPTION;
	}
	return DISP_E_MEMBERNOTFOUND;
}

//CteBase

CteBase::CteBase()
{
	m_cRef = 1;
}

CteBase::~CteBase()
{
}

STDMETHODIMP CteBase::QueryInterface(REFIID riid, void **ppvObject)
{
	static const QITAB qit[] =
	{
		QITABENT(CteBase, IDispatch),
		{ 0 },
	};
	return QISearch(this, qit, riid, ppvObject);
}

STDMETHODIMP_(ULONG) CteBase::AddRef()
{
	return ::InterlockedIncrement(&m_cRef);
}

STDMETHODIMP_(ULONG) CteBase::Release()
{
	if (::InterlockedDecrement(&m_cRef) == 0) {
		delete this;
		return 0;
	}
	return m_cRef;
}

STDMETHODIMP CteBase::GetTypeInfoCount(UINT *pctinfo)
{
	*pctinfo = 0;
	return S_OK;
}

STDMETHODIMP CteBase::GetTypeInfo(UINT iTInfo, LCID lcid, ITypeInfo **ppTInfo)
{
	return E_NOTIMPL;
}

STDMETHODIMP CteBase::GetIDsOfNames(REFIID riid, LPOLESTR *rgszNames, UINT cNames, LCID lcid, DISPID *rgDispId)
{
	return teGetDispId(methodBASE, _countof(methodBASE), NULL, *rgszNames, rgDispId);
}

STDMETHODIMP CteBase::Invoke(DISPID dispIdMember, REFIID riid, LCID lcid, WORD wFlags, DISPPARAMS *pDispParams, VARIANT *pVarResult, EXCEPINFO *pExcepInfo, UINT *puArgErr)
{
	int nArg = pDispParams ? pDispParams->cArgs - 1 : -1;
	HRESULT hr = S_OK;

	switch (dispIdMember) {
		//Open
		case 0x60010000:
			if (nArg >= 0) {
				LPWSTR lpLib = GetLPWSTRFromVariant(&pDispParams->rgvarg[nArg]);

				CteWO *pItem;
				for (UINT i = g_ppObject.size(); i--;) {
					pItem = g_ppObject[i];
					if (pItem) {
						if (lstrcmpi(lpLib, pItem->m_bsLib) == 0) {
							teSetObject(pVarResult, pItem);
							return S_OK;
						}
					}
				}
				pItem = new CteWO(lpLib);
				g_ppObject.push_back(pItem);
				teSetObject(pVarResult, pItem);
			}
			return S_OK;
		//Close
		case 0x6001000C:
			if (nArg >= 0) {
				LPWSTR lpLib = GetLPWSTRFromVariant(&pDispParams->rgvarg[nArg]);

				for (int i = g_ppObject.size(); i--;) {
					if (g_ppObject[i]) {
						if (lstrcmpi(lpLib, g_ppObject[i]->m_bsLib) == 0) {
							g_ppObject[i]->Close();
							SafeRelease(&g_ppObject[i]);
							g_ppObject.erase(g_ppObject.begin() + i);
							break;
						}
					}
				}
			}
			return S_OK;
		//this
		case DISPID_VALUE:
			if (pVarResult) {
				teSetObject(pVarResult, this);
			}
			return S_OK;
	}//end_switch
	return DISP_E_MEMBERNOTFOUND;
}

// CteClassFactory

STDMETHODIMP CteClassFactory::QueryInterface(REFIID riid, void **ppvObject)
{
	static const QITAB qit[] =
	{
		QITABENT(CteClassFactory, IClassFactory),
		{ 0 },
	};
	return QISearch(this, qit, riid, ppvObject);
}

STDMETHODIMP_(ULONG) CteClassFactory::AddRef()
{
	LockModule(TRUE);
	return 2;
}

STDMETHODIMP_(ULONG) CteClassFactory::Release()
{
	LockModule(FALSE);
	return 1;
}

STDMETHODIMP CteClassFactory::CreateInstance(IUnknown *pUnkOuter, REFIID riid, void **ppvObject)
{
	*ppvObject = NULL;

	if (pUnkOuter != NULL) {
		return CLASS_E_NOAGGREGATION;
	}
	return g_pBase->QueryInterface(riid, ppvObject);
}

STDMETHODIMP CteClassFactory::LockServer(BOOL fLock)
{
	LockModule(fLock);
	return S_OK;
}
