Option Explicit
Dim shell, fso, folder, command, nodePath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = fso.BuildPath(folder, "runtime\node.exe")
If Not fso.FileExists(nodePath) Then nodePath = "node.exe"
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & fso.BuildPath(folder, "probe.cjs") & Chr(34) & " desktop"
shell.Run command, 0, False
