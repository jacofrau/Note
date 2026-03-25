Set shell = CreateObject("WScript.Shell")
scriptPath = "C:\Users\jacof\Desktop\Note di Jaco\launch-desktop.ps1"
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """"
shell.Run command, 0, False
