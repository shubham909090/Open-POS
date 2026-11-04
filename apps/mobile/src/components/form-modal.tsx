import { KeyboardAvoidingView, Modal, Platform, type ModalProps } from "react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";

/** Modal forms live outside the app shell, so they need their own keyboard inset. */
export function FormModal({ children, animationType, ...props }: ModalProps) {
  const reducedMotion = useReducedMotion();
  if (!props.visible) return null;
  return (
    <Modal {...props} animationType={reducedMotion ? "none" : animationType} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}
