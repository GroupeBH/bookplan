import type { AlertButton, AlertOptions } from 'react-native';

export interface AppAlertPayload {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
}

type AlertListener = (payload: AppAlertPayload) => void;
type NativeAlertImpl = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) => void;

let alertListener: AlertListener | null = null;
let nativeAlertImpl: NativeAlertImpl | null = null;

export const setAppAlertListener = (listener: AlertListener | null) => {
  alertListener = listener;
};

export const setNativeAlertImpl = (impl: NativeAlertImpl | null) => {
  nativeAlertImpl = impl;
};

export const appAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) => {
  if (alertListener) {
    alertListener({ title, message, buttons, options });
    return;
  }

  if (nativeAlertImpl) {
    nativeAlertImpl(title, message, buttons, options);
  }
};

