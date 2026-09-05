export type AttendanceStatus = "off" | "present" | "half_day" | "overtime";

export type AttendanceEmployee = {
  id: string;
  name: string;
  role: string;
  joiningDate: string;
  monthlySalaryPaise: number;
  archivedAt: string | null;
  archivedDate?: string | null;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  overtimeHours: number | null;
  notes: string | null;
};

export type AttendancePolicy = {
  paidOffDays: number;
  standardHours: number;
  overtimeMultiplier: number;
  effectiveMonth: string;
  isDefault: boolean;
};

export type AttendancePolicyInput = Pick<AttendancePolicy, "paidOffDays" | "standardHours" | "overtimeMultiplier">;

export type AttendanceRestaurant = {
  id: string;
  name: string;
  timezone: string;
};

export type PayrollRow = {
  employeeId: string;
  month: string;
  eligibleCalendarDays: number;
  elapsedEligibleDays: number;
  futureEligibleDays: number;
  markedDays: number;
  unresolvedDays: number;
  paidOffDays: number;
  unpaidOffDays: number;
  presentEquivalentDays: number;
  presentDays: number;
  offDays: number;
  halfDays: number;
  overtimeHours: number;
  basePayPaise: number;
  deductionsPaise: number;
  overtimePayPaise: number;
  netPayPaise: number | null;
  projectedNetPayPaise: number;
  resolution: "resolved" | "unresolved" | "in_progress";
};

export type AttendanceData = {
  asOfDate: string;
  restaurant: AttendanceRestaurant;
  employees: AttendanceEmployee[];
  records: AttendanceRecord[];
  policy: AttendancePolicy;
  payroll: PayrollRow[];
};

export type EmployeeInput = {
  name: string;
  role: string;
  joiningDate: string;
  monthlySalaryPaise: number;
};

export type AttendanceInput = {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  overtimeHours?: number;
  notes?: string;
};

export type AttendancePendingAction =
  | "pair"
  | "refresh"
  | "mark_attendance"
  | "batch_present"
  | "save_employee"
  | "archive_employee"
  | "save_policy"
  | "sign_out";

export type AttendanceViewModel = {
  phase: "loading" | "pairing" | "ready" | "error";
  data: AttendanceData | null;
  isOnline: boolean;
  pendingAction: AttendancePendingAction | null;
  errorMessage: string | null;
  lastSyncedAt: number | null;
  month: string;
  setMonth: (month: string) => void;
  pair: (pairingCode: string) => Promise<void>;
  refresh: () => Promise<void>;
  dismissError: () => void;
  markAttendance: (input: AttendanceInput) => Promise<void>;
  clearAttendance: (employeeId: string, date: string) => Promise<void>;
  markUnmarkedPresent: (date: string, employeeIds: string[]) => Promise<void>;
  addEmployee: (input: EmployeeInput) => Promise<void>;
  updateEmployee: (employeeId: string, input: EmployeeInput) => Promise<void>;
  archiveEmployee: (employeeId: string) => Promise<void>;
  updatePolicy: (policy: AttendancePolicyInput) => Promise<void>;
  signOut: () => Promise<void>;
};
