## Downloads

| System | File |
|---|---|
| macOS (Apple Silicon and Intel) | `FieldWarfare-<version>-mac.dmg`, or the `.zip` |
| Windows installer | `FieldWarfare-<version>-setup.exe` |
| Windows, no installation | `FieldWarfare-<version>-portable.exe` |
| Dedicated server (Node.js 22+) | `field-warfare-<version>-server.zip` or `.tar.gz` |

The apps are **not signed**, so the system warns you the first time you open them.

**macOS:** open the app once; macOS refuses it. Then go to System Settings › Privacy & Security, scroll down to the message about Field Warfare and click **Open Anyway**. If macOS says the app is damaged, run this in Terminal after moving it to Applications:

```
xattr -cr "/Applications/Field Warfare.app"
```

**Windows:** SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.
