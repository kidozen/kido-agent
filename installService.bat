@ECHO OFF

SET /p nodePath=Enter Node.js installation path (C:\Program Files\nodejs\node.exe):
for /f "delims=" %%a in ('npm config get prefix') do @set npmPrefix=%%a
SET "kidoAgentPath=%npmPrefix%\node_modules\kido-agent\bin\server"
IF %nodePath% == "" (SET nodePath="C:\Program Files\nodejs\node.exe")
IF EXIST "%PROGRAMFILES(X86)%" (SET nssmPath="nssm64.exe") ELSE (SET nssmPath="nssm32.exe")
%npmPrefix%\node_modules\kido-agent\bin\%nssmPath% install kido-agent %nodePath% %kidoAgentPath%
pause