$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LumenTcpListeners {
  [DllImport("iphlpapi.dll")]
  public static extern uint GetExtendedTcpTable(IntPtr table, ref uint size, bool order, uint family, uint tableClass, uint reserved);
}
'@

# AF_INET + TCP_TABLE_OWNER_PID_LISTENER requests listeners only, independently of CIM state decoding.
[uint32]$size = 0
$status = [LumenTcpListeners]::GetExtendedTcpTable([IntPtr]::Zero, [ref]$size, $false, 2, 3, 0)
if ($status -ne 122) { throw "TCP listener sizing failed: $status" }
for ($attempt = 0; $attempt -lt 3; $attempt++) {
  if ($size -lt 4 -or $size -gt 1048576) { throw 'Invalid TCP listener table size' }
  $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal([int]$size)
  try {
    $capacity = $size
    $status = [LumenTcpListeners]::GetExtendedTcpTable($buffer, [ref]$size, $false, 2, 3, 0)
    if ($status -eq 122) { continue }
    if ($status -ne 0 -or $size -gt $capacity) { throw "TCP listener enumeration failed: $status" }
    $bytes = New-Object byte[] $size
    [Runtime.InteropServices.Marshal]::Copy($buffer, $bytes, 0, [int]$size)
    [Convert]::ToBase64String($bytes)
    exit 0
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer) }
}
throw 'TCP listener table kept changing during enumeration'
