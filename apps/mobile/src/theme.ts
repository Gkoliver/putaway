import { StyleSheet } from "react-native";

export const colors = {
  background: "#F2F2F7",
  card: "#FFFFFF",
  separator: "#C6C6C8",
  label: "#8E8E93",
  text: "#000000",
  destructive: "#FF3B30",
  tint: "#007AFF",
  onTint: "#FFFFFF",
};

export const theme = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.text,
  },
  body: {
    fontSize: 17,
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    color: colors.label,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    overflow: "hidden",
  },
  cardBody: {
    padding: 16,
  },
  primaryButton: {
    backgroundColor: colors.tint,
    borderRadius: 10,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: colors.onTint,
    fontSize: 17,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    fontSize: 17,
    color: colors.text,
  },
  error: {
    fontSize: 13,
    color: colors.destructive,
  },
  link: {
    fontSize: 17,
    color: colors.tint,
  },
  row: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  content: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: 16,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  section: {
    gap: 6,
  },
  sectionHeader: {
    fontSize: 13,
    color: colors.label,
    paddingHorizontal: 16,
  },
});
