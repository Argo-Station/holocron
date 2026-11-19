// Native.cs — the Win32 calls .NET Framework does not wrap: the Job Object, CreateProcess with a console and inherited
// handles, the console's CTRL_C, a process's image path, the default route's interface, foreground
// rights, and the OS's own Task Dialog (S4). Declarations only.
using System;
using System.Runtime.InteropServices;
using System.Text;

static class Native
{
    // ── kernel32 ──
    [DllImport("kernel32.dll")] public static extern int GetCurrentProcessId();
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool MoveFileEx(string from, string to, int flags);
    public const int MOVEFILE_REPLACE_EXISTING = 0x1, MOVEFILE_WRITE_THROUGH = 0x8;

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateJobObject(IntPtr attrs, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    public const int JobObjectExtendedLimitInformation = 9;
    public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SECURITY_ATTRIBUTES { public int nLength; public IntPtr lpSecurityDescriptor; public bool bInheritHandle; }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateFile(string name, uint access, uint share, ref SECURITY_ATTRIBUTES sa, uint disposition, uint flags, IntPtr template);
    public const uint FILE_APPEND_DATA = 0x4, GENERIC_READ = 0x80000000, SYNCHRONIZE = 0x00100000;
    public const uint FILE_SHARE_ALL = 0x7, OPEN_ALWAYS = 4, OPEN_EXISTING = 3;
    public static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO
    {
        public int cb;
        public string lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    public const int STARTF_USESTDHANDLES = 0x100;
    public const uint CREATE_SUSPENDED = 0x4, CREATE_NO_WINDOW = 0x08000000, CREATE_UNICODE_ENVIRONMENT = 0x400,
        CREATE_BREAKAWAY_FROM_JOB = 0x01000000;

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcess(string app, StringBuilder cmdLine, IntPtr pa, IntPtr ta, bool inherit, uint flags,
        IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern int ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern uint WaitForSingleObject(IntPtr h, uint ms);
    public const uint WAIT_OBJECT_0 = 0, INFINITE = 0xFFFFFFFF;
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetExitCodeProcess(IntPtr p, out uint code);
    public const uint STILL_ACTIVE = 259, STATUS_CONTROL_C_EXIT = 0xC000013A;
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool TerminateProcess(IntPtr p, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    public const uint PROCESS_TERMINATE = 0x1, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool QueryFullProcessImageName(IntPtr p, int flags, StringBuilder name, ref int size);

    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(int pid);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GenerateConsoleCtrlEvent(int ev, int group);
    public const int CTRL_C_EVENT = 0;

    // ── iphlpapi: the interface of the best route to an address (a table lookup; no packet is sent) ──
    [DllImport("iphlpapi.dll")] public static extern int GetBestInterface(uint destAddr, out int index);

    // ── user32 ──
    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
    public const int ASFW_ANY = -1;
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, int flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    public const int WM_SYSCOMMAND = 0x112, SC_CLOSE = 0xF060, WM_USER = 0x400;

    // ── comctl32 v6: the Task Dialog (S4). Its structures are 1-byte packed (commctrl.h's pshpack1). ──
    public delegate int TaskDialogCallback(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, IntPtr refData);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 1)]
    public struct TASKDIALOG_BUTTON { public int nButtonID; [MarshalAs(UnmanagedType.LPWStr)] public string pszButtonText; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 1)]
    public struct TASKDIALOGCONFIG
    {
        public int cbSize;
        public IntPtr hwndParent, hInstance;
        public int dwFlags, dwCommonButtons;
        [MarshalAs(UnmanagedType.LPWStr)] public string pszWindowTitle;
        public IntPtr hMainIcon;
        [MarshalAs(UnmanagedType.LPWStr)] public string pszMainInstruction;
        [MarshalAs(UnmanagedType.LPWStr)] public string pszContent;
        public int cButtons;
        public IntPtr pButtons;
        public int nDefaultButton, cRadioButtons;
        public IntPtr pRadioButtons;
        public int nDefaultRadioButton;
        [MarshalAs(UnmanagedType.LPWStr)] public string pszVerificationText, pszExpandedInformation, pszExpandedControlText, pszCollapsedControlText;
        public IntPtr hFooterIcon;
        [MarshalAs(UnmanagedType.LPWStr)] public string pszFooter;
        public TaskDialogCallback pfCallback;
        public IntPtr lpCallbackData;
        public int cxWidth;
    }
    public const int TDF_ALLOW_DIALOG_CANCELLATION = 0x8, TDF_POSITION_RELATIVE_TO_WINDOW = 0x1000;
    public const int TDN_CREATED = 0, TDN_DESTROYED = 5, TDM_CLICK_BUTTON = WM_USER + 102, IDCANCEL = 2;

    [DllImport("comctl32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    public static extern int TaskDialogIndirect(ref TASKDIALOGCONFIG config, out int button, out int radio, out bool verified);
}
