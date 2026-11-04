import { Pressable as NativePressable, StyleSheet, type PressableProps } from "react-native";

/** Shared native feedback keeps every POS action responsive and accessible. */
export function Pressable({ style, disabled, accessibilityState, android_ripple, ...props }: PressableProps) {
  return (
    <NativePressable
      {...props}
      disabled={disabled}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
      android_ripple={android_ripple ?? { color: "rgba(24, 24, 27, 0.09)" }}
      style={(state) => [
        feedback.control,
        typeof style === "function" ? style(state) : style,
        state.pressed && !disabled && feedback.pressed,
      ]}
    />
  );
}

const feedback = StyleSheet.create({
  control: { minHeight: 48, overflow: "hidden" },
  pressed: { opacity: 0.7 },
});
