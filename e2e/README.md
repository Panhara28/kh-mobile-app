# Automated phone tests (Maestro)

These flows drive the real app on a real Android phone over USB. They only **read**: they log in, wait for the background sync, then open every module with the phone offline and check that none shows "Can't reach the KH POS server". Nothing is saved to the server.

## One-time setup (this PC: tools are in `C:\dev\tools`)

1. On the phone: Settings > About phone > tap *Build number* 7 times > Settings > Developer options > turn on **USB debugging**. Plug the phone in and accept the "Allow USB debugging" question.
2. Put the app in English: Profile > language (the steps read the English words).
3. In PowerShell, from the repo: `. .\e2e\env.ps1` (puts Java, adb and Maestro on the path), then `adb devices` must list the phone.

## Which app to test

| | `APP_ID` | `LINK_BASE` |
|---|---|---|
| The built APK | `com.panahra28.khpos` | `khpos://` |
| Expo Go (latest code, `npx expo start`) | `host.exp.exponent` | `exp://<PC address>:8081/--/` |

The APK from the last EAS build does **not** have the newest code; build a new one before testing it.

## Run

```powershell
. .\e2e\env.ps1
$env:APP_ID = "com.panahra28.khpos"; $env:LINK_BASE = "khpos://"
$env:KH_USER = "<your test user>"; $env:KH_PASS = "<its password>"   # typed here, never saved in a file
.\e2e\run.ps1            # login, wait for the sync, then the offline check
```

Screenshots and the report land in `e2e/out/` (ignored by git). Start the kh-pos server before the first two flows; the third turns the phone's airplane mode on by itself and off again at the end.

## The flows

| File | What it does |
|---|---|
| `flows/00-login.yaml` | logs in when the login screen shows |
| `flows/10-sync-saved.yaml` | waits for "All modules saved" in the sync sheet and fails if some module "could not be saved" |
| `flows/20-offline-modules.yaml` | offline: opens every module by its address and checks that it shows no "Can't reach" and no crash. Regenerate with `python e2e/make_offline_flow.py` after adding a module |

Add flows that **write** (add a dish, pay) only on a test branch, and ask before running them: they change the server's data when they are sent.
