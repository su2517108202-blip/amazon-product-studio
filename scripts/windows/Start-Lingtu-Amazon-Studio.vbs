Option Explicit

Dim shell
Dim appData
Dim scriptPath
Dim command

Set shell = CreateObject("WScript.Shell")
appData = shell.ExpandEnvironmentStrings("%APPDATA%")
scriptPath = appData & "\LingtuAmazonStudio\Start-Lingtu-Amazon-Studio.ps1"
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & scriptPath & Chr(34)

shell.Run command, 0, False
