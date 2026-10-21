# Dot-source this: . .\e2e\env.ps1   (puts the test tools on the path for this PowerShell window only)
$env:JAVA_HOME = "C:\dev\tools\jdk17"
$env:Path = "C:\dev\tools\jdk17\bin;C:\dev\tools\platform-tools;C:\dev\tools\maestro\bin;$env:Path"
$env:MAESTRO_CLI_NO_ANALYTICS = "1"
