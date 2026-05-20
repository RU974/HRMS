import { create } from "zustand";

interface Notification {
  id: number;
  text: string;
  read: boolean;
}

interface NotificationState {
  notices: Notification[];
}

export const useNotificationStore = create<NotificationState>(() => ({
  notices: [
    { id: 1, text: "Payroll processing completed.", read: false },
    { id: 2, text: "6 leave requests pending.", read: false }
  ]
}));


