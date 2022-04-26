# Command Line Arguments
`Deploy.exe` accepts three command line arguments:
```powershell
.\Deploy --useConsoleLogging # Whether to use Node.js console logging instead of the default fancy logging
.\Deploy --pauseAfterLogging # Whether to pause execution after each log entry
.\Deploy --logLevel verbose --logLevel debug --logLevel info --logLevel warn --logLevel error # The log levels to enable
```

These arguments can be mixed together, but note that console logging does not respect set log levels, and will always log the default levels (`debug` onwards).