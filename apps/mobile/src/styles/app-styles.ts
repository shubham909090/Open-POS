import { StyleSheet } from "react-native";

import { appShellStyles } from "./app-shell-styles";
import { billingOverlayStyles } from "./billing-overlay-styles";
import { menuTicketStyles } from "./menu-ticket-styles";
import { serviceWorkflowStyles } from "./service-workflow-styles";

export { androidStatusBarTopInset, palette } from "./app-style-tokens";

export const styles = StyleSheet.create({
  ...appShellStyles,
  ...serviceWorkflowStyles,
  ...menuTicketStyles,
  ...billingOverlayStyles,
});
